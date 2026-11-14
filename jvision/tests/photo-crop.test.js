'use strict';
// Behavioral tests for the photo crop task model, evaluator and telemetry (simulated input; no browser or device).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Crop = require('../photo-crop.js');
const { validate, metrics: TRANSPORT_METRICS } = require('../transport.js');

const W = 1000, H = 600;
const S = Crop.SCENARIOS[0];

/* Drives a PhotoCropTrials instance with a monotonic fake clock. */
function run(options = {}) {
    let now = 1000;
    const ended = [];
    const t = new Crop.PhotoCropTrials(Object.assign({ runId: 'crop_test', onEnd: s => ended.push(s.outcome) }, options));
    t.geometry(W, H, 8);
    const h = {
        t, ended,
        get now() { return now; },
        tick(ms) { now += ms; return now; },
        start() { t.start(now); return h; },
        wheel(dy, ctrl = false, x = 500, y = 300, dx = 0) { now += 16; t.wheel(dx, dy, ctrl, x, y, now); },
        click(x, y, source = 'mouse') { now += 20; t.pressAt(x, y, now, source); now += 30; t.release(x, y, now); },
        drag(x0, y0, x1, y1, { source = 'mouse', steps = 6, release = true } = {}) {
            now += 20; t.pressAt(x0, y0, now, source);
            for (let i = 1; i <= steps; i++) { now += 16; t.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, now); }
            if (release) { now += 16; t.release(x1, y1, now); }
        },
        scrollTo(index) {
            const [lo] = t.visibleBand(), row = Math.floor(index / Crop.GALLERY_COLUMNS);
            const goal = Math.min(lo + (row - Math.floor(S.photo / Crop.GALLERY_COLUMNS)) * t.rowHeight, t.maxOffset);
            for (let i = 0; i < 500 && t.offset < goal - 0.5; i++) h.wheel(Math.min(50, goal - t.offset));
            now += 400;
        },
        open(index) { h.scrollTo(index); const c = t.cellRect(index); h.click(c.centerX, c.centerY); },
        button(name) { const r = t.buttonRect(name); h.click(r.centerX, r.centerY); },
        /* Moves the crop edges to the image-pixel box using corner drags. */
        cropTo(box) {
            let r = t.cropScreenRect(), a = t.toScreen(box.left, box.top);
            h.drag(r.left + 2, r.top + 2, a.x + 2, a.y + 2);
            r = t.cropScreenRect(); const b = t.toScreen(box.right, box.bottom);
            h.drag(r.right - 2, r.bottom - 2, b.x - 2, b.y - 2);
        }
    };
    return h;
}
const near = (actual, expected, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, actual + ' ≉ ' + expected);

test('finding the requested photo and submitting a matching crop completes the task with consistent phase timing', () => {
    const h = run().start();
    const t = h.t;
    assert.equal(t.phase, 'gallery');
    const [lo] = t.visibleBand();
    assert.ok(lo > 0, 'the requested photo starts outside the viewport');
    assert.ok(t.cellRect(S.photo).top > t.listRect.bottom);
    h.open(S.photo);
    assert.equal(t.openPhoto.id, 'ph18');
    assert.deepEqual(t.crop, { left: 0, top: 0, right: 1500, bottom: 1000 });
    h.cropTo(S.target);
    const record = (h.button('apply'), t.lastSubmission);
    assert.equal(record.success, true);
    assert.ok(record.iou >= 0.97, String(record.iou));
    assert.equal(record.subject_coverage, 1);
    assert.equal(t.outcome, 'completed');
    assert.deepEqual(h.ended, ['completed']);
    const s = t.summary();
    assert.equal(s.gallery_ms + s.other_photo_ms + s.editor_ms, s.duration_ms);
    assert.equal(s.find_ms, s.gallery_ms);
    assert.equal(s.recovery_ms, 0);
    assert.equal(s.submit_count, 1);
    assert.equal(s.completed_adjustments.resize_nw, 1);
    assert.equal(s.completed_adjustments.resize_se, 1);
    assert.ok(s.hold_travel_px > 0);
    assert.deepEqual(s.missing, {});
    assert.deepEqual(t.events.map(e => e.type), ['task_started', 'phase_entered', 'photo_opened', 'phase_entered',
        'adjustment_started', 'adjustment_finished', 'adjustment_started', 'adjustment_finished', 'crop_submitted', 'phase_entered', 'task_completed']);
    assert.deepEqual(t.events.map(e => e.event_sequence), t.events.map((_, i) => i + 1));
    // Interaction time stops at the successful Apply; later input is ignored.
    const duration = s.duration_ms;
    h.tick(5000); h.click(500, 300);
    assert.equal(t.summary().duration_ms, duration);
    assert.equal(t.events.length, 11);
});

test('opening a distractor, applying on it and returning to the gallery are recorded without fabricating crop metrics', () => {
    const h = run().start();
    const t = h.t;
    h.open(16);
    assert.equal(t.isTargetOpen, false);
    h.button('apply');
    const wrong = t.lastSubmission;
    assert.equal(wrong.success, false);
    assert.deepEqual(wrong.failures, ['wrong_photo']);
    assert.equal(wrong.iou, null);
    assert.equal(wrong.subject_coverage, null);
    assert.equal(wrong.missing.all, 'wrong_photo');
    assert.match(t.feedback, /isn't the requested photo/);
    h.tick(300);
    h.button('back');
    assert.equal(t.phase, 'gallery');
    h.open(S.photo);
    h.cropTo(S.target);
    h.button('apply');
    const s = t.summary();
    assert.equal(t.outcome, 'completed');
    assert.equal(s.wrong_photo_open_count, 1);
    assert.equal(s.photo_open_count, 2);
    assert.equal(s.backtrack_count, 1);
    assert.ok(s.other_photo_ms > 0);
    assert.equal(s.gallery_ms + s.other_photo_ms + s.editor_ms, s.duration_ms);
    assert.ok(s.find_ms > s.gallery_ms, 'find time includes the distractor detour');
    assert.equal(s.failed_submit_count, 1);
    assert.ok(t.events.some(e => e.type === 'returned_to_gallery' && e.image_id === 'ph17'));
    assert.ok(t.events.some(e => e.type === 'photo_opened' && e.image_id === 'ph17' && e.is_target === false));
});

test('an incorrect submission gives actionable feedback, keeps editing, and earlier submissions stay immutable', () => {
    const h = run().start();
    const t = h.t;
    h.open(S.photo);
    // Cuts off the right side of the backpack.
    h.cropTo({ left: S.target.left, top: S.target.top, right: 900, bottom: S.target.bottom });
    h.button('apply');
    const first = t.lastSubmission;
    assert.equal(first.success, false);
    assert.ok(first.failures.includes('subject_cut'));
    assert.ok(first.subject_coverage < 1);
    assert.match(t.feedback, /cut off\. Move the right edge out/);
    assert.equal(t.outcome, null);
    assert.ok(Object.isFrozen(first) && Object.isFrozen(first.edge_error_px));
    const snapshot = JSON.stringify(first);
    h.tick(700);
    const r = t.cropScreenRect(), x = t.toScreen(S.target.right, 0).x;
    h.drag(r.right - 1, r.centerY, x - 1, r.centerY);
    assert.throws(() => { first.iou = 1; });
    h.button('apply');
    assert.equal(t.outcome, 'completed');
    assert.equal(JSON.stringify(t.submissions[0]), snapshot);
    assert.equal(t.submissions[1].adjustments_since_previous, 1);
    assert.equal(t.submissions[0].adjustments_since_previous, 2);
    const s = t.summary();
    assert.equal(s.failed_submit_count, 1);
    assert.equal(s.retry_count, 1);
    assert.ok(s.recovery_ms >= 700, String(s.recovery_ms));
    assert.equal(s.completed_adjustments.resize_e, 1);
});

test('crop movement and every resize handle change exactly the expected edges, within image bounds and minimum size', () => {
    const h = run().start();
    const t = h.t;
    h.open(S.photo);
    h.cropTo({ left: 300, top: 200, right: 1100, bottom: 800 });
    const s = t.scale, d = 40, di = d / s;
    const counts = t.summary().completed_adjustments;
    const expectations = { nw: ['left', 'top'], n: ['top'], ne: ['right', 'top'], e: ['right'], se: ['right', 'bottom'],
        s: ['bottom'], sw: ['left', 'bottom'], w: ['left'] };
    for (const handle of Crop.HANDLES) {
        const before = Object.assign({}, t.crop), r = t.cropScreenRect();
        const x = handle.includes('w') ? r.left : handle.includes('e') ? r.right : r.centerX;
        const y = handle.includes('n') ? r.top : handle.includes('s') ? r.bottom : r.centerY;
        assert.deepEqual(t.targetAt(x, y), { kind: 'resize', handle });
        // Inward drags, so no edge reaches the image bounds.
        const dx = handle.includes('w') ? d : handle.includes('e') ? -d : 0, dy = handle.includes('n') ? d : handle.includes('s') ? -d : 0;
        h.drag(x, y, x + dx, y + dy);
        for (const edge of ['left', 'top', 'right', 'bottom']) {
            if (expectations[handle].includes(edge)) assert.ok(Math.abs(Math.abs(t.crop[edge] - before[edge]) - di) < 0.01, handle + ' ' + edge + ' ' + (t.crop[edge] - before[edge]) + ' ' + JSON.stringify(before));
            else assert.equal(t.crop[edge], before[edge], handle + ' moved ' + edge);
        }
        assert.equal(t.summary().completed_adjustments['resize_' + handle], counts['resize_' + handle] + 1);
    }
    // Move keeps the size and clamps at the image edge.
    const size = { w: t.crop.right - t.crop.left, h: t.crop.bottom - t.crop.top }, r = t.cropScreenRect();
    assert.deepEqual(t.targetAt(r.centerX, r.centerY), { kind: 'move' });
    h.drag(r.centerX, r.centerY, r.centerX - 2000, r.centerY - 2000);
    assert.equal(t.crop.left, 0); assert.equal(t.crop.top, 0);
    near(t.crop.right - t.crop.left, size.w, 1e-9); near(t.crop.bottom - t.crop.top, size.h, 1e-9);
    // Resizing past the opposite edge stops at the minimum crop size.
    const e = t.cropScreenRect();
    h.drag(e.right, e.centerY, e.left - 300, e.centerY);
    near(t.crop.right - t.crop.left, Crop.MIN_CROP_PX, 1e-9);
    assert.equal(t.summary().completed_adjustments.move, 1);
});

test('zoom and pan change only the view: crop image coordinates are preserved and the transform round-trips', () => {
    const h = run().start();
    const t = h.t;
    h.open(S.photo);
    h.cropTo({ left: 600, top: 300, right: 1100, bottom: 800 });
    const crop = JSON.stringify(t.crop);
    // Letterboxing: at fit the 3:2 photo is centered vertically in the viewport.
    const image = t.imageScreenRect(), vp = t.viewportRect;
    near(image.left, vp.left, 1e-9); near(image.right, vp.right, 1e-9);
    near(image.top - vp.top, vp.bottom - image.bottom, 1e-9);
    const anchor = { x: vp.centerX + 60, y: vp.centerY - 40 }, under = t.toImage(anchor.x, anchor.y);
    for (let i = 0; i < 5; i++) h.wheel(-30, true, anchor.x, anchor.y);
    assert.ok(t.view.zoom > 3);
    const still = t.toScreen(under.x, under.y);
    near(still.x, anchor.x, 0.01); near(still.y, anchor.y, 0.01);
    h.tick(400);
    h.wheel(80, false); h.wheel(80, false, 500, 300, -60);
    h.tick(400);
    // Drag outside the crop pans; the grabbed image point follows the pointer.
    const p = t.cropScreenRect(), x = Math.max(vp.left + 5, p.left - 30), y = vp.top + 20;
    if (t.targetAt(x, y).kind === 'pan') h.drag(x, y, x + 50, y + 30);
    h.button('zoomOut'); h.button('zoomIn');
    assert.equal(JSON.stringify(t.crop), crop);
    for (const [ix, iy] of [[0, 0], [750, 420.5], [1500, 1000]]) {
        const sc = t.toScreen(ix, iy), back = t.toImage(sc.x, sc.y);
        near(back.x, ix, 1e-6); near(back.y, iy, 1e-6);
    }
    const s = t.summary();
    assert.ok(s.completed_adjustments.zoom >= 3, JSON.stringify(s.completed_adjustments));
    assert.ok(s.completed_adjustments.pan >= 1);
    // Zoom in then out reverses direction.
    assert.ok(s.zoom_reversal_count >= 1);
    assert.equal(t.events.filter(e => e.type === 'adjustment_started').length, t.events.filter(e => e.type === 'adjustment_finished').length);
});

test('wheel segments split by kind and gap, the pan clamps at image bounds, and wheel input is ignored while a drag owns the pointer', () => {
    const h = run().start();
    const t = h.t;
    h.open(S.photo);
    h.wheel(200); // at fit the image cannot pan
    assert.equal(t.view.cy, 500);
    h.wheel(-20, true); h.wheel(-20, true);
    h.wheel(40); // kind change closes the zoom segment
    h.tick(400); h.wheel(-60); h.wheel(-60);
    t.tick(h.tick(400));
    const kinds = t.events.filter(e => e.type === 'adjustment_finished').map(e => e.kind);
    assert.deepEqual(kinds, ['pan', 'zoom', 'pan', 'pan']);
    const r = t.cropScreenRect();
    h.drag(r.centerX, r.centerY, r.centerX + 30, r.centerY, { release: false });
    h.wheel(50);
    assert.equal(t.summary().wheel_ignored_during_drag_count, 1);
    assert.ok(t.press && t.press.dragging);
});

test('evaluation: IoU, coverage, excess area and edge errors use original-image geometry and validate denominators', () => {
    const T = { left: 100, top: 100, right: 300, bottom: 300 }, Sub = { left: 150, top: 150, right: 250, bottom: 250 };
    const exact = Crop.evaluateCrop(T, T, Sub, 1000, 500);
    assert.equal(exact.iou, 1); assert.equal(exact.success, true); assert.equal(exact.mean_edge_error_norm, 0);
    const shifted = Crop.evaluateCrop({ left: 200, top: 100, right: 400, bottom: 300 }, T, Sub, 1000, 500);
    assert.equal(shifted.iou, round3(20000 / 60000));
    assert.equal(shifted.excess_ratio, 0.5);
    assert.equal(shifted.subject_coverage, 0.5);
    assert.deepEqual(shifted.edge_error_px, { left: -100, right: 100, top: 0, bottom: 0 });
    assert.deepEqual(shifted.edge_error_norm, { left: 0.1, right: 0.1, top: 0, bottom: 0 });
    assert.equal(shifted.mean_edge_error_norm, 0.05);
    assert.deepEqual(shifted.failures, ['iou', 'subject_cut', 'excess_area', 'edge_error']);
    const unannotated = Crop.evaluateCrop(T, T, null, 1000, 500);
    assert.equal(unannotated.subject_coverage, null);
    assert.equal(unannotated.missing.subject_coverage, 'no_subject_annotation');
    assert.equal(unannotated.success, true);
    for (const [crop, w, h, reason] of [[{ left: 5, top: 5, right: 5, bottom: 50 }, 1000, 500, 'invalid_crop'],
        [{ left: -1, top: 0, right: 50, bottom: 50 }, 1000, 500, 'invalid_crop'], [T, 0, 500, 'invalid_image_size'],
        [{ left: 0, top: 0, right: NaN, bottom: 50 }, 1000, 500, 'invalid_crop']]) {
        const out = Crop.evaluateCrop(crop, T, Sub, w, h);
        assert.equal(out.valid, false); assert.equal(out.iou, null); assert.equal(out.missing.all, reason); assert.equal(out.success, false);
    }
    // The authored scenario is consistent: target inside the image, subject inside the target.
    const photo = Crop.PHOTOS[S.photo];
    assert.equal(Crop.evaluateCrop(S.target, S.target, S.subject, photo.width, photo.height).success, true);
    assert.equal(photo.scene.item.left, S.subject.left); assert.equal(photo.scene.item.bottom, S.subject.bottom);
    assert.deepEqual(Crop.THRESHOLDS, { min_iou: 0.8, min_subject_coverage: 0.99, max_excess_ratio: 0.2, max_mean_edge_error_norm: 0.03 });
});
const round3 = v => Math.round(v * 1000) / 1000;

test('release outside the editor keeps the clamped crop; cancellation, focus loss and resizing restore it and mark coverage', () => {
    const h = run().start();
    const t = h.t;
    h.open(S.photo);
    const r = t.cropScreenRect();
    h.drag(r.left + 2, r.centerY, -400, r.centerY);
    assert.equal(t.crop.left, 0);
    assert.equal(t.events.at(-1).outside_editor, true);
    h.cropTo({ left: 400, top: 200, right: 1100, bottom: 800 });
    const before = JSON.stringify(t.crop);
    for (const [reason, interrupt] of [['pointer_cancel', () => t.cancel(h.tick(10), 'pointer_cancel')],
        ['focus_lost', () => t.focusLost(h.tick(10))]]) {
        const c = t.cropScreenRect();
        h.drag(c.centerX, c.centerY, c.centerX + 80, c.centerY + 40, { release: false });
        assert.notEqual(JSON.stringify(t.crop), before);
        interrupt();
        assert.equal(JSON.stringify(t.crop), before);
        assert.equal(t.events.at(-1).type, 'adjustment_cancelled');
        assert.equal(t.events.at(-1).reason, reason);
    }
    // Stale (out-of-order) input cancels too, and invalidates measurement coverage.
    let c = t.cropScreenRect();
    h.drag(c.centerX, c.centerY, c.centerX + 80, c.centerY, { release: false });
    t.move(c.centerX + 90, c.centerY, h.now - 500);
    assert.equal(t.events.at(-1).reason, 'stale_input');
    c = t.cropScreenRect();
    h.drag(c.centerX, c.centerY, c.centerX + 60, c.centerY, { release: false });
    t.geometry(900, 600, 8);
    assert.equal(t.events.at(-1).reason, 'resize');
    assert.equal(JSON.stringify(t.crop), before);
    const s = t.summary();
    assert.equal(Object.values(s.cancelled_adjustments).reduce((a, b) => a + b, 0), 4);
    assert.equal(s.cancelled_adjustments.move, 4);
    h.button('apply');
    assert.equal(t.lastSubmission.measurement_valid, false);
    assert.deepEqual(t.lastSubmission.invalid_reasons, ['out_of_order_input', 'resized_during_editing']);
    assert.equal(t.lastSubmission.cancellations_since_previous, 4);
    assert.equal(t.summary().hold_travel_px, null);
    assert.equal(t.summary().missing.hold_travel_px, 'out_of_order_input');
});

test('reset, back, skip, exit and the unstarted state are distinct; rating happens after the timer stops', () => {
    let h = run().start(), t = h.t;
    h.open(S.photo);
    h.cropTo(S.target);
    h.button('reset');
    assert.deepEqual(t.crop, { left: 0, top: 0, right: 1500, bottom: 1000 });
    assert.equal(t.view.zoom, 1);
    h.tick(200);
    assert.equal(t.skip(h.tick(10)), true);
    assert.equal(t.status, 'abandoned');
    assert.equal(t.phase, 'rating');
    assert.equal(t.events.at(-1).type, 'task_skipped');
    assert.equal(t.summary().reset_count, 1);
    assert.equal(t.intentObservation(), null, 'abandoned runs stay local, like the QA producer');
    let [row] = t.targetResults(h.tick(10));
    assert.equal(row.status, 'abandoned');
    assert.equal(row.metrics.measurement_started, 1);
    assert.equal(row.attributes.end_reason, 'skipped');
    assert.equal(t.skip(h.tick(10)), false);

    h = run().start(); t = h.t;
    h.open(3);
    t.exit(h.tick(100));
    assert.equal(t.events.at(-1).type, 'task_exited');
    assert.equal(t.exportPayload().end_reason, 'exited');
    assert.equal(t.summary().final_iou, null);
    assert.equal(t.summary().missing.final_iou, 'no_submission');

    h = run(); t = h.t;
    t.exit(h.tick(100));
    assert.equal(t.status, 'unstarted');
    [row] = t.targetResults(h.tick(10));
    assert.deepEqual(row.metrics, { measurement_started: 0 });
    assert.equal(t.exportPayload().summary.duration_ms, null);
    assert.equal(t.exportPayload().summary.missing.duration_ms, 'not_started');
    assert.equal(t.events.length, 0);
});

test('gallery scroll overshoot, reversal, corrective scrolling, clicks while scrolling and unhandled clicks', () => {
    const h = run().start();
    const t = h.t;
    const [, hi] = t.visibleBand();
    assert.ok(t.maxOffset > hi + 100, 'rows exist past the requested photo');
    for (let i = 0; i < 100 && t.offset <= hi + 20; i++) h.wheel(60);
    for (let i = 0; i < 100 && t.offset > hi - 10; i++) h.wheel(-30);
    // A click on the gap between cells right after scrolling.
    const c = t.cellRect(16);
    h.now; t.pressAt(c.left - 4, c.centerY, h.tick(16), 'mouse'); t.release(c.left - 4, c.centerY, h.tick(16));
    const s = t.summary();
    assert.equal(s.scroll_overshoot_count, 1);
    assert.ok(s.scroll_overshoot_max_px >= 20);
    assert.ok(s.corrective_scroll_px > 0);
    assert.equal(s.scroll_reversal_count, 1);
    assert.equal(s.scroll_click_count, 1);
    assert.equal(s.unhandled_click_count, 1);
    assert.equal(t.phase, 'gallery');
});

test('bounded export: events and submissions are capped with explicit truncation and terminal events survive', () => {
    const h = run().start();
    const t = h.t;
    h.open(S.photo);
    for (let i = 0; i < 200; i++) { h.button('zoomIn'); h.button('zoomOut'); }
    for (let i = 0; i < 40; i++) h.button('apply');
    t.exit(h.tick(10));
    const payload = t.exportPayload();
    assert.equal(payload.events.length, Crop.EVENT_LIMIT);
    assert.ok(payload.events_dropped > 0);
    assert.equal(payload.events_truncated, true);
    assert.equal(payload.events.at(-1).type, 'task_exited');
    assert.equal(payload.submissions.length, Crop.SUBMISSION_LIMIT);
    assert.equal(payload.submissions_dropped, 10);
    assert.equal(payload.summary.submit_count, 40);
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= Crop.EXPORT_MAX_BYTES);
    assert.ok(Object.isFrozen(payload) && Object.isFrozen(payload.events[0]));
    // No pointer traces or screen coordinates in the export.
    const text = JSON.stringify(payload);
    for (const key of ['clientX', '"x":', '"y":', 'downX', '"trace"']) assert.equal(text.includes(key), false, key);
});

/* Materializes an observation as the full intent row a native sink writes (all touchpad columns, unknown = -1/""). */
function intentRow(observation) {
    const row = { source: 'qa_tool', session_id: 'synthetic-session', activity_id: observation.activity_id,
        elapsed_ms: observation.elapsed_ms, metric_family: observation.metric_family, details: JSON.stringify(observation.details),
        details_version: 1, stp_model_version: '', stp_model_flow_id: '' };
    for (const family of Object.values(TRANSPORT_METRICS)) {
        for (const [key, kind] of Object.entries(family)) {
            row[key] = key in observation ? observation[key] : kind === 'text' || kind.endsWith('Direction') ? '' : -1;
        }
    }
    return row;
}
function goldenRun() {
    const h = run().start(), t = h.t;
    h.open(16); h.tick(500); h.button('back');
    h.open(S.photo);
    h.cropTo({ left: 600, top: 300, right: 1150, bottom: 820 });
    h.button('apply');
    h.tick(800);
    h.cropTo(S.target);
    h.button('apply');
    return t;
}

test('telemetry: the completed row uses existing drag columns, passes the transport contract and keeps details within 512 bytes', () => {
    const t = goldenRun();
    const observation = t.intentObservation();
    validate(Object.assign({ id: 'crop_1' }, observation));
    assert.equal(observation.metric_family, 'drag');
    assert.equal(observation.stp_drag_target_text, 'red backpack on the bench');
    assert.equal(observation.stp_drag_attempt_count, t.summary().drag_start_count);
    for (const name of Crop.DRAG_COLUMNS.slice(2)) assert.equal(observation[name], -1, name);
    const d = observation.details;
    assert.deepEqual(Object.keys(d).slice(0, 9), ['details_version', 'target_index', 'target_count', 'target_status', 'trace_valid',
        'run_sequence', 'task_index', 'interaction', 'stp_condition']);
    assert.equal(d.qa_path.length, Crop.PATH_FIELDS.length);
    const m = t.metrics();
    Crop.PATH_FIELDS.forEach((name, i) => assert.equal(d.qa_path[i], m[name] === undefined ? null : Math.round(m[name] * 1000) / 1000, name));
    assert.equal(d.qa_subs_n, 2);
    assert.deepEqual(d.qa_subs.map(s => s[3]), [0, 1]);
    assert.ok(Buffer.byteLength(JSON.stringify(d)) <= Crop.DETAILS_MAX_BYTES);
    // Serialization round trip keeps every value.
    assert.deepEqual(JSON.parse(intentRow(observation).details), d);
    // Golden fixture shared with the dashboard parsing test.
    const file = path.join(__dirname, 'fixtures/photo-crop-intent-row.json');
    const golden = { observation, intent_row: intentRow(observation) };
    if (process.env.UPDATE_FIXTURES) fs.writeFileSync(file, JSON.stringify(golden, null, 2) + '\n');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(JSON.stringify(golden)));
});

test('telemetry: worst-case values drop optional submission tuples before qa_path, with explicit truncation flags', () => {
    const t = goldenRun();
    // Inflate every counter and duration to large values.
    Object.keys(t.c).forEach(k => { t.c[k] = 9876543; });
    Object.keys(t.completed).forEach(k => { t.completed[k] = 987654; });
    t.holdTravel = 98765432.123; t.scrollDistance = 98765432.123;
    t.submissions.push(...Array(3).fill({ iou: 0.123, subject_coverage: 0.987, mean_edge_error_norm: 0.123, success: false }));
    const d = t.intentObservation().details;
    assert.ok(Buffer.byteLength(JSON.stringify(d)) <= Crop.DETAILS_MAX_BYTES, String(Buffer.byteLength(JSON.stringify(d))));
    assert.equal(d.qa_subs, undefined);
    assert.equal(d.qa_subs_truncated, true);
    assert.equal(d.qa_path.length, Crop.PATH_FIELDS.length);
    validate(Object.assign({ id: 'crop_worst' }, t.intentObservation()));
});

test('telemetry: unavailable values are null in qa_path, never zero', () => {
    const h = run().start(), t = h.t;
    h.open(S.photo);
    const r = t.cropScreenRect();
    h.drag(r.left + 2, r.top + 2, r.left + 200, r.top + 120, { source: 'touch' });
    h.cropTo(S.target);
    h.button('apply');
    const d = t.intentObservation().details;
    assert.equal(d.qa_path[Crop.PATH_FIELDS.indexOf('stp_crop_hold_travel_px')], null);
    assert.equal(d.trace_valid, false);
    assert.equal(t.summary().missing.hold_travel_px, 'non_cursor_pointer');
    assert.equal(d.qa_path[Crop.PATH_FIELDS.indexOf('stp_crop_reset_count')], 0);
});
