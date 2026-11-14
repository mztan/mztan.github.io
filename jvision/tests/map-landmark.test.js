'use strict';
// Behavioral tests for the map landmark task model, evaluator and telemetry (simulated input; no browser or device).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Task = require('../map-landmark.js');
const { validate, metrics: TRANSPORT_METRICS } = require('../transport.js');

const W = 1000, H = 600;
const S = Task.SCENARIOS[0];
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, actual + ' ≉ ' + expected);

function run(options = {}) {
    let now = 1000;
    const ended = [];
    const t = new Task.MapLandmarkTrials(Object.assign({ runId: 'map_test', onEnd: s => ended.push(s.outcome) }, options));
    t.geometry(W, H, 8);
    const h = {
        t, ended,
        get now() { return now; },
        tick(ms) { now += ms; return now; },
        start() { t.start(now); return h; },
        wheel(dy, ctrl = false, x = 500, y = 300, dx = 0) { now += 16; t.wheel(dx, dy, ctrl, x, y, now); },
        settle() { now += 400; t.tick(now); },
        click(x, y, source = 'mouse') { now += 20; t.pressAt(x, y, now, source); now += 30; t.release(x, y, now); },
        drag(x0, y0, x1, y1, { source = 'mouse', steps = 6, release = true } = {}) {
            now += 20; t.pressAt(x0, y0, now, source);
            for (let i = 1; i <= steps; i++) { now += 16; t.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, now); }
            if (release) { now += 16; t.release(x1, y1, now); }
        },
        button(name) { const r = t.buttonRect(name); h.click(r.centerX, r.centerY); },
        /* Drags until the world point is at the screen position (several drags if clamped by drag length). */
        bring(wx, wy, sx, sy) {
            for (let i = 0; i < 8; i++) {
                const p = t.toScreen(wx, wy);
                if (Math.hypot(p.x - sx, p.y - sy) < 1) return;
                const v = t.viewportRect, dx = sx - p.x, dy = sy - p.y;
                const ox = v.centerX - Math.sign(dx) * Math.min(Math.abs(dx), 380) / 2, oy = v.centerY - Math.sign(dy) * Math.min(Math.abs(dy), 220) / 2;
                h.drag(ox, oy, ox + Math.sign(dx) * Math.min(Math.abs(dx), 380), oy + Math.sign(dy) * Math.min(Math.abs(dy), 220));
            }
        },
        zoomAt(target, x, y) { for (let i = 0; i < 200 && Math.abs(t.camera.zoom - target) > 0.051; i++) h.wheel(t.camera.zoom < target ? -5 : 5, true, x, y); h.settle(); },
        regionCenter() { return [(S.region.left + S.region.right) / 2, (S.region.top + S.region.bottom) / 2]; },
        /* Pan and zoom to a qualifying view of the requested landmark. */
        frame(zoom = 2.7) {
            const v = t.viewportRect, [rx, ry] = h.regionCenter();
            h.bring(rx, ry, v.centerX, v.centerY - 40);
            const p = t.toScreen(rx, ry);
            h.zoomAt(zoom, p.x, p.y);
            h.bring(rx, ry, v.centerX + 120, v.centerY - 50);
        },
        openTarget() { const pin = t.pinScreen(t.targetIndex); h.click(pin.x, pin.y); },
        open(id) { const i = t.map.landmarks.findIndex(l => l.id === id), pin = t.pinScreen(i); h.click(pin.x, pin.y); return i; }
    };
    return h;
}

test('authored scenario: the requested landmark starts off-screen, needs panning and zooming, and has plausible distractors', () => {
    const h = run().start(), t = h.t;
    assert.equal(t.target.name, 'Riverside Museum');
    assert.equal(t.visible, false);
    const world = t.visibleWorldRect();
    assert.ok(t.target.point[0] > world.right || t.target.point[1] > world.bottom);
    assert.ok(t.camera.zoom < Task.THRESHOLDS.zoom_min);
    const names = t.map.landmarks.map(l => l.name);
    for (const name of ['Riverside Market', 'Riverview Museum of Art', 'Riverside Theatre', 'Harbor Maritime Museum']) assert.ok(names.includes(name));
    assert.equal(new Set(t.map.landmarks.map(l => l.id)).size, t.map.landmarks.length);
    // Region contains the museum footprint and its entrance.
    const f = t.target.footprint;
    assert.ok(S.region.left <= f.left && S.region.right >= f.right && S.region.top <= f.top && S.region.bottom >= t.target.point[1]);
    // Deterministic: the same seed builds the same map.
    assert.equal(JSON.stringify(Task.MAP.blocks.slice(0, 5)), JSON.stringify(Task.MAP.blocks.slice(0, 5)));
    assert.ok(Task.MAP.blocks.length > 50);
    assert.ok(Task.MAP.blocks.every(b => [b.left, b.top, b.right, b.bottom].every(Number.isFinite)));
});

test('successful navigation, framing and selection completes with consistent finding/framing/selection timing', () => {
    const h = run().start(), t = h.t;
    h.frame();
    assert.equal(t.visible, true);
    h.openTarget();
    assert.equal(t.openLandmark.id, S.landmark);
    assert.equal(t.qualifying, true, JSON.stringify(t.evaluateView(t.targetIndex)));
    h.tick(300);
    h.button('choose');
    const r = t.lastSubmission;
    assert.equal(r.success, true, JSON.stringify(r));
    assert.equal(r.correct_landmark, true);
    assert.ok(r.zoom >= 2.3 && r.zoom <= 3.3);
    assert.ok(r.region_visible >= 0.9);
    assert.equal(r.selection.offset_norm <= 1, true);
    assert.equal(t.outcome, 'completed');
    assert.deepEqual(h.ended, ['completed']);
    const s = t.summary();
    assert.ok(s.first_visible_ms > 0 && s.first_visible_ms <= s.first_qualifying_ms && s.first_qualifying_ms <= s.duration_ms);
    assert.ok(s.qualifying_to_select_ms >= 300);
    assert.ok(s.pan_count >= 1 && s.zoom_count >= 1);
    assert.equal(s.target_open_count, 1);
    assert.equal(s.distractor_open_count, 0);
    assert.equal(s.submit_count, 1);
    assert.ok(s.zoom_change_log2 >= 1.6);
    assert.ok(s.pan_distance_norm > 0.3);
    assert.deepEqual(s.missing, {});
    const types = t.events.map(e => e.type);
    for (const type of ['task_started', 'navigation_started', 'pan_started', 'pan_finished', 'zoom_started', 'zoom_finished', 'target_visible',
        'qualifying_view_reached', 'landmark_opened', 'selection_submitted', 'task_completed']) assert.ok(types.includes(type), type);
    assert.deepEqual(t.events.map(e => e.event_sequence), t.events.map((_, i) => i + 1));
    // Interaction stops at the successful selection.
    const duration = s.duration_ms;
    h.tick(5000); h.click(500, 300); h.wheel(50);
    assert.equal(t.summary().duration_ms, duration);
    assert.equal(t.events.at(-1).type, 'task_completed');
});

test('distractor exploration stays separate from committed mistakes; a wrong commit is recoverable', () => {
    const h = run().start(), t = h.t;
    h.frame(1.8);
    h.open('lm_riverside_theatre');
    assert.equal(t.openLandmark.id, 'lm_riverside_theatre');
    h.open('lm_riverside_museum');
    assert.equal(t.summary().distractor_open_count, 1);
    h.open('lm_riverside_theatre');
    h.button('choose');
    assert.equal(t.lastSubmission.correct_landmark, false);
    assert.deepEqual(t.lastSubmission.failures, ['wrong_landmark']);
    assert.equal(t.lastSubmission.region_visible, null);
    assert.equal(t.lastSubmission.missing.region_visible, 'wrong_landmark');
    assert.match(t.feedback, /That's Riverside Theatre, not Riverside Museum/);
    h.button('close');
    assert.equal(t.openIndex, null);
    h.frame();
    h.openTarget();
    h.button('choose');
    assert.equal(t.outcome, 'completed');
    const s = t.summary();
    assert.equal(s.distractor_open_count, 2);
    assert.equal(s.target_open_count, 2);
    assert.equal(s.incorrect_selection_count, 1);
    assert.equal(s.framing_failure_count, 0);
    assert.equal(s.submit_count, 2);
    assert.equal(s.retry_count, 1);
    assert.ok(t.events.some(e => e.type === 'landmark_panel_closed' && e.reason === 'close_button'));
    assert.ok(t.events.some(e => e.type === 'landmark_panel_closed' && e.reason === 'replaced'));
});

test('the correct landmark at an unacceptable zoom fails with specific criteria and can be resubmitted', () => {
    const h = run().start(), t = h.t;
    h.frame(1.6);
    h.openTarget();
    h.button('choose');
    let r = t.lastSubmission;
    assert.equal(r.correct_landmark, true);
    assert.equal(r.success, false);
    assert.ok(r.failures.includes('zoom_too_low'));
    near(r.zoom_error, r.zoom - 2.3, 0.002);
    assert.match(t.feedback, /Zoom in more/);
    // Too far in: the region no longer fits and the zoom exceeds the range.
    const pin = t.pinScreen(t.targetIndex);
    h.zoomAt(4, pin.x, pin.y);
    const p = t.toScreen(t.target.point[0], t.target.point[1]);
    if (!t.viewportRect.contains(p.x, p.y)) h.bring(t.target.point[0], t.target.point[1], 600, 250);
    h.button('choose');
    r = t.lastSubmission;
    assert.ok(r.failures.includes('zoom_too_high'), JSON.stringify(r.failures));
    assert.ok(r.zoom_error > 0);
    assert.match(t.feedback, /Zoom out a little/);
    assert.equal(t.outcome, null);
    h.button('zoomOut'); h.button('zoomOut');
    assert.match(t.feedback, /Adjust the view, then choose Riverside Museum again/);
    h.frame();
    h.button('choose');
    assert.equal(t.outcome, 'completed');
    const s = t.summary();
    assert.equal(s.framing_failure_count, 2);
    assert.equal(s.incorrect_selection_count, 0);
    assert.equal(s.retry_count, 2);
    assert.equal(t.submissions.length, 3);
});

test('world ↔ screen transforms round-trip at every zoom and the map evaluates in world units', () => {
    const h = run().start(), t = h.t;
    for (const zoom of [0, 0.7, 1, 2.3, 3.3, 5]) {
        t.camera.zoom = zoom; t.clampCamera();
        for (const [wx, wy] of [[0, 0], [2930, 1966], [4000, 3000], [123.4, 2876.5]]) {
            const s = t.toScreen(wx, wy), w = t.toWorld(s.x, s.y);
            near(w.x, wx, 1e-6); near(w.y, wy, 1e-6);
        }
        near(t.scale, Task.BASE_SCALE * Math.pow(2, zoom));
    }
    // Same camera on a different display: world evaluation values (zoom, center offset sign) are stable.
    t.camera = { cx: 2910, cy: 1900, zoom: 2.7 };
    t.clampCamera();
    const a = t.evaluateView(t.targetIndex, []);
    t.geometry(1400, 800, 8);
    const b = t.evaluateView(t.targetIndex, []);
    assert.equal(a.zoom, b.zoom);
    assert.equal(a.region_visible, 1); assert.equal(b.region_visible, 1);
    assert.ok(b.center_offset_norm < a.center_offset_norm, 'a larger viewport puts the point relatively nearer the center');
});

test('pinch zoom anchors at the cursor, buttons anchor at the center, and a drag keeps the grabbed point under the pointer', () => {
    const h = run().start(), t = h.t;
    const anchor = { x: 420, y: 300 }, under = t.toWorld(anchor.x, anchor.y);
    for (let i = 0; i < 5; i++) h.wheel(-10, true, anchor.x, anchor.y);
    near(t.camera.zoom, 1.5, 1e-6);
    const still = t.toScreen(under.x, under.y);
    near(still.x, anchor.x, 1e-6); near(still.y, anchor.y, 1e-6);
    h.settle();
    const center = t.toWorld(t.viewportRect.centerX, t.viewportRect.centerY);
    h.button('zoomIn');
    near(t.camera.zoom, 2.0, 1e-6);
    const c2 = t.toWorld(t.viewportRect.centerX, t.viewportRect.centerY);
    near(c2.x, center.x, 1e-6); near(c2.y, center.y, 1e-6);
    const grab = t.toWorld(600, 400);
    h.drag(600, 400, 500, 330);
    const g = t.toScreen(grab.x, grab.y);
    near(g.x, 500, 1e-6); near(g.y, 330, 1e-6);
    // Two-finger scroll pans by the delivered pixels.
    const before = t.camera.cx;
    h.wheel(0, false, 500, 300, 80);
    near(t.camera.cx - before, 80 / t.scale, 1e-6);
});

test('camera and zoom are clamped to the map, and resizing keeps the camera while cancelling the gesture', () => {
    const h = run().start(), t = h.t;
    h.drag(500, 300, 990, 590); h.drag(500, 300, 990, 590);
    const w = t.visibleWorldRect();
    near(w.left, 0, 1e-6); near(w.top, 0, 1e-6);
    for (let i = 0; i < 100; i++) h.wheel(50, true);
    assert.equal(t.camera.zoom, Task.MIN_ZOOM);
    // At zoom 0 the 4000-unit map is exactly 1000 px wide, so the camera centers horizontally.
    near(t.camera.cx, 2000, 1e-6);
    for (let i = 0; i < 200; i++) h.wheel(-50, true);
    assert.equal(t.camera.zoom, Task.MAX_ZOOM);
    h.settle();
    const camera = Object.assign({}, t.camera);
    h.drag(500, 300, 540, 320, { release: false });
    t.geometry(800, 500, 8);
    assert.equal(t.camera.zoom, camera.zoom);
    assert.equal(t.events.at(-1).type, 'pan_cancelled');
    assert.equal(t.events.at(-1).reason, 'resize');
    h.tick(10); h.click(400, 300);
    assert.equal(t.summary().pan_cancel_count, 1);
    assert.equal(t.traceValid, false);
});

test('a pan that starts and ends on a landmark never opens it; a short click does', () => {
    const h = run().start(), t = h.t;
    const i = t.map.landmarks.findIndex(l => l.id === 'lm_city_hall'), pin = t.pinScreen(i);
    // The camera starts against the west edge, so pan west-to-east content leftwards first, then back.
    h.drag(pin.x, pin.y, pin.x - 30, pin.y, { steps: 3 });
    const back = t.pinScreen(i);
    near(back.x, pin.x - 30, 1e-6);
    h.drag(back.x, back.y, back.x + 30, back.y, { steps: 3 });
    assert.equal(t.openIndex, null);
    assert.equal(t.summary().pan_count, 2);
    const p = t.pinScreen(i);
    h.drag(p.x, p.y, p.x + 5, p.y + 3, { steps: 2 }); // within the slop: a click
    assert.equal(t.openIndex, i);
    // Clicks on empty map close the panel; on the overview they do nothing.
    const o = t.overviewRect;
    h.click(o.centerX, o.centerY);
    assert.equal(t.openIndex, i);
    assert.equal(t.summary().unhandled_click_count, 1);
    h.click(150, 200);
    assert.equal(t.openIndex, null);
    assert.ok(t.events.some(e => e.type === 'landmark_panel_closed' && e.reason === 'map_click'));
    h.click(150, 200);
    assert.equal(t.summary().unhandled_click_count, 2);
});

test('pointer cancellation, focus loss and stale input end gestures; travel never spans an interrupted segment', () => {
    const h = run().start(), t = h.t;
    h.drag(500, 300, 400, 250);
    const travel = t.summary().hold_travel_px;
    assert.ok(travel > 100);
    h.drag(500, 300, 300, 200, { release: false });
    t.cancel(h.tick(10), 'pointer_cancel');
    assert.equal(t.events.at(-1).type, 'pan_cancelled');
    assert.equal(t.summary().hold_travel_px, travel);
    h.wheel(-10, true); h.wheel(-10, true);
    t.focusLost(h.tick(10));
    assert.equal(t.events.at(-1).type, 'zoom_cancelled');
    assert.equal(t.events.at(-1).reason, 'focus_lost');
    h.drag(500, 300, 450, 300, { release: false });
    t.move(400, 300, h.now - 500);
    assert.equal(t.events.at(-1).reason, 'stale_input');
    const s = t.summary();
    assert.equal(s.pan_cancel_count, 2);
    assert.equal(s.zoom_cancel_count, 1);
    assert.equal(s.hold_travel_px, null);
    assert.equal(s.missing.hold_travel_px, 'out_of_order_input');
    // Wheel input while a drag owns the pointer is ignored.
    const h2 = run().start();
    h2.drag(500, 300, 450, 300, { release: false });
    h2.wheel(-20, true);
    assert.equal(h2.t.camera.zoom, 1);
    assert.equal(h2.t.summary().wheel_ignored_during_drag_count, 1);
});

test('visibility episodes, visibility loss, zoom-range overshoot within one adjustment and corrective returns are geometric events', () => {
    const h = run().start(), t = h.t;
    h.frame(2.7);
    assert.equal(t.summary().visibility_episode_count, 1);
    assert.equal(t.qualifying, true);
    // Pan the museum out of view, then back.
    h.drag(200, 300, 900, 300); h.drag(200, 300, 900, 300);
    assert.equal(t.visible, false);
    assert.equal(t.summary().visibility_loss_count, 1);
    h.frame(2.7);
    assert.equal(t.summary().visibility_episode_count, 2);
    assert.equal(t.summary().corrective_return_count, 1);
    // One continuous pinch from below the range to above it is an overshoot; stopping inside is not.
    const p = t.toScreen(t.target.point[0], t.target.point[1]);
    h.zoomAt(2.0, p.x, p.y);
    const q = t.toScreen(t.target.point[0], t.target.point[1]);
    for (let i = 0; i < 16; i++) h.wheel(-10, true, q.x, q.y);
    h.settle();
    assert.ok(t.camera.zoom > 3.3);
    const s = t.summary();
    assert.equal(s.zoom_overshoot_count, 1);
    const overshoot = t.events.find(e => e.type === 'zoom_range_overshoot');
    assert.equal(overshoot.from, 'below');
    assert.equal(t.events.filter(e => e.type === 'zoom_finished').at(-1).overshoot, true);
    assert.ok(s.zoom_reversal_count >= 1);
    // Zooming back into range is a corrective return.
    const r = t.toScreen(t.target.point[0], t.target.point[1]);
    h.zoomAt(2.8, r.x, r.y);
    assert.equal(t.summary().zoom_overshoot_count, 1);
    if (t.qualifying) assert.equal(t.summary().corrective_return_count >= 2, true);
});

test('obscured landmarks and partly hidden regions are measured against the panel and overview', () => {
    const h = run().start(), t = h.t;
    h.frame(2.7);
    h.openTarget();
    const panel = t.panelRect;
    h.bring(t.target.point[0], t.target.point[1], panel.centerX, panel.centerY);
    const view = t.evaluateView(t.targetIndex);
    assert.deepEqual(view.obscured_by, ['panel']);
    assert.ok(view.failures.includes('obscured'));
    assert.ok(view.region_visible < 1);
    h.button('choose');
    assert.ok(t.lastSubmission.failures.includes('obscured'));
    assert.match(t.feedback, /hidden under the panel/);
    assert.equal(t.summary().visibility_loss_count >= 1, true);
});

test('reset, skip, exit and unstarted states are distinct, and later input never rewrites a run', () => {
    let h = run().start(), t = h.t;
    h.frame();
    h.button('reset');
    assert.deepEqual({ cx: t.camera.cx, cy: t.camera.cy, zoom: t.camera.zoom }, { cx: 1000, cy: 700, zoom: 1 });
    assert.equal(t.events.at(-1).type === 'view_reset' || t.events.some(e => e.type === 'view_reset'), true);
    assert.equal(t.summary().reset_count, 1);
    t.skip(h.tick(100));
    assert.equal(t.status, 'abandoned');
    assert.equal(t.events.at(-1).type, 'task_skipped');
    assert.equal(t.intentObservation(), null);
    const [row] = t.targetResults(h.tick(10));
    assert.equal(row.status, 'abandoned');
    assert.equal(row.attributes.end_reason, 'skipped');
    assert.equal(t.summary().missing.qualifying_to_select_ms, 'not_completed');

    h = run().start(); t = h.t;
    h.drag(500, 300, 400, 300);
    t.exit(h.tick(50));
    assert.equal(t.events.at(-1).type, 'task_exited');
    assert.equal(t.summary().final_zoom, null);
    assert.equal(t.summary().missing.final_zoom, 'no_submission');
    assert.equal(t.summary().missing.first_visible_ms, 'never_visible');

    h = run(); t = h.t;
    t.exit(h.tick(5));
    assert.equal(t.status, 'unstarted');
    assert.deepEqual(t.targetResults(h.tick(1))[0].metrics, { measurement_started: 0 });
    assert.equal(t.exportPayload().summary.missing.duration_ms, 'not_started');
    assert.equal(t.events.length, 0);
});

test('clicks during an active pinch are counted; submissions are immutable', () => {
    const h = run().start(), t = h.t;
    h.wheel(-10, true); h.wheel(-10, true);
    h.click(200, 450);
    assert.equal(t.summary().active_gesture_click_count, 1);
    h.frame(1.7);
    h.openTarget();
    h.button('choose');
    const first = t.lastSubmission, snapshot = JSON.stringify(first);
    assert.ok(Object.isFrozen(first) && Object.isFrozen(first.failures));
    assert.throws(() => { first.zoom = 3; });
    h.frame();
    h.button('choose');
    assert.equal(JSON.stringify(t.submissions[0]), snapshot);
    assert.ok(t.submissions[1].zooms_since_previous >= 1);
});

test('bounded export: events and submissions are capped with explicit truncation; no pointer traces or trajectories', () => {
    const h = run().start(), t = h.t;
    for (let i = 0; i < 200; i++) { h.button('zoomIn'); h.button('zoomOut'); }
    h.open('lm_city_hall');
    for (let i = 0; i < 40; i++) h.button('choose');
    t.exit(h.tick(10));
    const payload = t.exportPayload();
    assert.equal(payload.events.length, Task.EVENT_LIMIT);
    assert.equal(payload.events_truncated, true);
    assert.equal(payload.events.at(-1).type, 'task_exited');
    assert.equal(payload.submissions.length, Task.SUBMISSION_LIMIT);
    assert.equal(payload.submissions_dropped, 10);
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= Task.EXPORT_MAX_BYTES);
    // Events and summaries carry scalars, never pointer traces or the camera trajectory.
    const text = JSON.stringify({ events: payload.events, summary: payload.summary, submissions: payload.submissions });
    for (const key of ['clientX', 'downX', '"cx"', '"cy"', '"trace"', 'trajectory']) assert.equal(text.includes(key), false, key);
});

function intentRow(observation) {
    const row = { source: 'qa_tool', session_id: 'synthetic-session', activity_id: observation.activity_id, elapsed_ms: observation.elapsed_ms,
        metric_family: observation.metric_family, details: JSON.stringify(observation.details), details_version: 1,
        stp_model_version: '', stp_model_flow_id: '' };
    for (const family of Object.values(TRANSPORT_METRICS)) {
        for (const [key, kind] of Object.entries(family)) row[key] = key in observation ? observation[key] : kind === 'text' || kind.endsWith('Direction') ? '' : -1;
    }
    return row;
}
function goldenRun() {
    const h = run().start(), t = h.t;
    t.hover(300, 300, h.tick(5));
    h.frame(1.8);
    h.open('lm_riverside_theatre'); h.button('choose'); h.button('close');
    h.openTarget(); h.button('choose');
    h.frame();
    h.button('choose');
    return t;
}

test('telemetry: the completed row uses existing click/cursor columns, passes the transport and keeps details within 512 bytes', () => {
    const t = goldenRun();
    assert.equal(t.outcome, 'completed');
    const o = t.intentObservation();
    validate(Object.assign({ id: 'map_1' }, o));
    assert.equal(o.metric_family, 'clicks');
    assert.equal(o.stp_clicks_target_count, 1);
    assert.equal(o.stp_clicks_total, t.summary().press_count);
    assert.equal(o.stp_clicks_on_target, -1);
    assert.equal(o.stp_clicks_miss_count, -1);
    assert.equal(o.stp_clicks_completed_count, -1);
    // The web contract carries only the family's columns; cursor path length travels in qa_path.
    assert.equal('stp_cursor_movement_total_cursor_distance_px' in o, false);
    assert.equal(o.details.qa_path[Task.PATH_FIELDS.indexOf('stp_map_cursor_distance_px')], t.summary().cursor_distance_px);
    const d = o.details;
    assert.deepEqual(Object.keys(d).slice(0, 9), ['details_version', 'target_index', 'target_count', 'target_status', 'trace_valid',
        'run_sequence', 'task_index', 'interaction', 'stp_condition']);
    assert.equal(d.qa_path.length, Task.PATH_FIELDS.length);
    const m = t.metrics();
    Task.PATH_FIELDS.forEach((name, i) => assert.equal(d.qa_path[i], m[name] === undefined ? null : Math.round(m[name] * 1000) / 1000, name));
    assert.equal(d.qa_subs_n, 3);
    assert.deepEqual(d.qa_subs.map(s => [s[0], s[3]]), [[0, 0], [1, 0], [1, 1]]);
    assert.ok(Buffer.byteLength(JSON.stringify(d)) <= Task.DETAILS_MAX_BYTES);
    assert.deepEqual(JSON.parse(intentRow(o).details), d);
    const file = path.join(__dirname, 'fixtures/map-landmark-intent-row.json');
    const golden = { observation: o, intent_row: intentRow(o) };
    if (process.env.UPDATE_FIXTURES) fs.writeFileSync(file, JSON.stringify(golden, null, 2) + '\n');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(JSON.stringify(golden)));
});

test('telemetry: worst-case values drop optional tuples before qa_path; unavailable values are null, not zero', () => {
    const t = goldenRun();
    Object.keys(t.c).forEach(k => { t.c[k] = 9876543; });
    t.holdTravel = 98765432.123;
    const d = t.intentObservation().details;
    assert.ok(Buffer.byteLength(JSON.stringify(d)) <= Task.DETAILS_MAX_BYTES, String(Buffer.byteLength(JSON.stringify(d))));
    assert.equal(d.qa_subs, undefined);
    assert.equal(d.qa_subs_truncated, true);
    assert.equal(d.qa_path.length, Task.PATH_FIELDS.length);

    const h = run().start(), u = h.t;
    h.frame();
    h.drag(500, 300, 520, 300, { source: 'touch' }); // touch pan: hold travel and cursor path unavailable
    h.frame();
    h.openTarget(); h.button('choose');
    assert.equal(u.outcome, 'completed');
    const o = u.intentObservation();
    assert.equal(o.details.qa_path[Task.PATH_FIELDS.indexOf('stp_map_hold_travel_px')], null);
    assert.equal(o.details.qa_path[Task.PATH_FIELDS.indexOf('stp_map_cursor_distance_px')], null);
    assert.equal(o.details.trace_valid, false);
    assert.equal(o.details.qa_path[Task.PATH_FIELDS.indexOf('stp_map_reset_count')], 0);
    assert.equal(u.summary().missing.hold_travel_px, 'non_cursor_pointer');
});
