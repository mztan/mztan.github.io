'use strict';
// Menu tests port SurfaceInputsQaMenuTrialsTest (D131663691..D131670164). The circle task is now a
// jvision-only freeform drift pad, so its tests below are original rather than ported.
const test = require('node:test');
const assert = require('node:assert/strict');
const { MENU_PATH, MenuTrials, CircleTrials } = require('../path-tasks.js');

function completeMenu(state, at) {
    for (let level = 0; level < state.depth - 1; level++) state.hover(level, MENU_PATH[level], at + level);
    state.select(state.depth - 1, MENU_PATH[state.depth - 1], at + state.depth - 1);
}

test('menu: wrong selection closes and retry preserves duration', () => {
    const state = new MenuTrials();
    state.open(100);
    state.select(0, 0, 150);
    assert.equal(state.visibleLevels, 0);
    state.open(200);
    completeMenu(state, 250);
    const result = state.targetResults(400)[0];
    assert.equal(result.status, 'completed');
    assert.equal(result.elapsed_ms, 152);
    assert.equal(result.metrics.stp_menu_attempt_count, 2);
    assert.equal(result.metrics.stp_menu_wrong_selection_count, 1);
    assert.equal(result.metrics.stp_menu_first_attempt_success, 0);
    state.open(500);
    assert.deepEqual(state.targetResults(600)[0], result);
});

test('menu: submenu navigation does not count as a selection attempt', () => {
    const state = new MenuTrials();
    state.open(10);
    state.select(0, MENU_PATH[0], 20);
    state.hover(1, MENU_PATH[1], 30);
    state.select(2, MENU_PATH[2], 40);
    const result = state.targetResults(50)[0];
    assert.equal(result.metrics.stp_menu_attempt_count, 1);
    assert.equal(result.metrics.clicks_total, 2);
    assert.equal(result.metrics.stp_menu_first_attempt_success, 1);
});

test('menu: shallow and deep trials resolve once and remain frozen', () => {
    const times = [];
    const state = new MenuTrials(at => times.push(at));
    state.open(0);
    completeMenu(state, 10);
    state.next();
    assert.equal(state.depth, 5);
    assert.equal(state.requestedPath, 'File → New → Document → 5×8 → Pageless');
    state.open(100);
    completeMenu(state, 110);
    state.select(4, 0, 120);
    assert.equal(state.allCompleted, true);
    assert.deepEqual(times, [114]);
    assert.deepEqual(state.targetResults(200).map(r => r.status), ['completed', 'completed']);
});

test('menu: exit retains unstarted targets without inventing attempts', () => {
    const results = new MenuTrials().targetResults(100);
    assert.deepEqual(results.map(r => r.status), ['abandoned', 'abandoned']);
    assert.ok(results.every(r => r.elapsed_ms === 0 && !r.trace_valid));
    assert.ok(results.every(r => !('stp_menu_attempt_count' in r.metrics)));
});

test('menu: dismissal is separate from wrong selection and stale motion invalidates travel', () => {
    const state = new MenuTrials();
    state.open(100);
    state.move(0, 0, 110);
    state.move(3, 4, 120);
    assert.equal(state.snapshot().total_cursor_distance_px, 5);
    state.move(9, 9, 115);
    state.dismiss(130);
    const result = state.targetResults(140)[0];
    assert.equal(result.trace_valid, false);
    assert.ok(!('total_cursor_distance_px' in result.metrics));
    assert.equal(result.metrics.stp_menu_dismissal_count, 1);
    assert.equal(result.metrics.stp_menu_attempt_count, 0);
    assert.equal(result.elapsed_ms, 40);
});

const between = (value, lo, hi) => assert.ok(value >= lo && value <= hi, value + ' not in [' + lo + ', ' + hi + ']');
/* Reference circle centered (100, 100), radius 80; the start point is (180, 100). */
function circle(onDone) {
    const state = new CircleTrials(onDone);
    state.geometry(100, 100, 80);
    return state;
}
/* One lap of samples every 2° starting just past 3 o'clock; dir = 1 clockwise, -1 counter-clockwise. */
/* ddx/ddy/dr drift the center and radius continuously through the lap, as a real hand would. */
function lap(state, at, { dx = 0, dy = 0, r = 80, ddx = 0, ddy = 0, dr = 0, dir = 1, shape = () => 0, step = 4 } = {}) {
    for (let d = 2; d <= 360; d += 2) {
        const f = d / 360, a = dir * d * Math.PI / 180, radius = r + dr * f + shape(d);
        state.move(100 + dx + ddx * f + radius * Math.cos(a), 100 + dy + ddy * f + radius * Math.sin(a), at + d * step / 2);
    }
    return at + 180 * step;
}

test('circle: nothing is measured until the start point is clicked', () => {
    const state = circle();
    state.move(180, 100, 0);
    lap(state, 10);
    assert.equal(state.started, false);
    assert.equal(state.points.length, 0);
    assert.equal(state.press(100, 100, 800), 'click');
    assert.equal(state.clicksBeforeStart, 1);
    assert.equal(state.press(182, 103, 900), 'start');
    assert.equal(state.points.length, 1);
    assert.match(state.feedback, /Lap 1 of 6/);
});

test('circle: six steady laps complete once, freeze and show no drift', () => {
    const completions = [];
    const state = circle(at => completions.push(at));
    state.press(180, 100, 0);
    let t = 0;
    for (let i = 0; i < 6; i++) t = lap(state, t);
    assert.equal(state.allCompleted, true);
    assert.equal(completions.length, 1);
    const rows = state.targetResults(t + 100);
    assert.equal(rows.length, 6);
    assert.ok(rows.every(r => r.status === 'completed' && r.trace_valid && r.attributes.stp_circle_direction === 'clockwise'));
    for (const r of rows) {
        assert.ok(r.metrics.stp_circle_radial_rms_px < 0.01);
        assert.ok(r.metrics.stp_circle_fit_rms_px < 0.01);
        assert.ok(r.metrics.stp_circle_center_offset_px < 0.01);
        assert.ok(r.metrics.stp_circle_center_shift_px < 0.01);
        between(r.metrics.stp_circle_fit_radius_px, 79.99, 80.01);
        assert.ok(r.metrics.stp_circle_closure_error_px < 0.01);
        between(r.elapsed_ms, 719, 721);
    }
    assert.ok(!('stp_circle_lap_center_shift_px' in rows[0].metrics), 'no previous lap: unavailable, not zero');
    assert.ok(state.summary.center_drift_total_px < 0.01);
    assert.ok(state.summary.shape_repeat_sd_px < 0.01);
    state.move(180, 100, t + 200);
    assert.deepEqual(state.targetResults(t + 300), rows);
});

test('circle: steady center drift and radius growth are measured per lap and as a rate', () => {
    const state = circle();
    state.press(180, 100, 0);
    let t = 0;
    // Every lap the hand slides 6 px right and 2 px down and the circle grows 3 px, continuously.
    for (let i = 0; i < 6; i++) t = lap(state, t, { dx: 6 * i, dy: 2 * i, r: 80 + 3 * i, ddx: 6, ddy: 2, dr: 3 });
    const rows = state.targetResults(t);
    assert.deepEqual(rows.map(r => r.status), Array(6).fill('completed'));
    between(rows[5].metrics.stp_circle_fit_center_dx_px, 32, 34);   // mid-lap: 6 × 5.5
    between(rows[5].metrics.stp_circle_fit_center_dy_px, 9, 12);
    between(rows[5].metrics.stp_circle_center_shift_px, Math.hypot(30, 10) - 1, Math.hypot(30, 10) + 1);
    between(rows[3].metrics.stp_circle_lap_center_shift_px, Math.hypot(6, 2) - 0.3, Math.hypot(6, 2) + 0.3);
    between(rows[5].metrics.stp_circle_radius_change_px, 14.5, 15.5);
    assert.ok(rows[5].metrics.stp_circle_radial_rms_px > rows[1].metrics.stp_circle_radial_rms_px);
    // A drifting lap is a slightly open spiral, but still far rounder around its own center than the reference.
    assert.ok(rows[5].metrics.stp_circle_fit_rms_px < 3);
    assert.ok(rows[5].metrics.stp_circle_radial_rms_px > 25);
    const s = state.summary;
    between(s.center_drift_rate_px_per_lap, Math.hypot(6, 2) - 0.3, Math.hypot(6, 2) + 0.3);
    between(s.center_drift_direction_deg, 15, 22); // atan2(2, 6) ≈ 18.4°, screen y down
    between(s.radius_drift_rate_px_per_lap, 2.9, 3.1);
    between(s.radius_range_px, 14.5, 15.5);
    between(s.center_drift_total_px, Math.hypot(30, 10) - 1, Math.hypot(30, 10) + 1);
    assert.equal(s.center_drift_direction_deg, Math.round(s.center_drift_direction_deg * 10) / 10);
    assert.equal(s.lap_centers_px.length, 6);
});

test('circle: a bulge repeated every lap is systematic; a random wobble is not repeatable', () => {
    const bump = d => 10 * Math.exp(-((d - 45) ** 2) / 200);
    const steady = circle();
    steady.press(180, 100, 0);
    let t = 0;
    for (let i = 0; i < 6; i++) t = lap(steady, t, { shape: bump });
    steady.targetResults(t);
    const a = steady.summary;
    assert.ok(a.shape_repeat_sd_px < 0.2, 'the same shape every lap repeats');
    assert.ok(a.shape_systematic_rms_px > 1);
    const peak = a.reference_profile_px.indexOf(Math.max(...a.reference_profile_px));
    assert.ok(peak === 2 || peak === 3, '45° clockwise of 3 o\'clock falls in bins 2-3, got ' + peak);

    const varying = circle();
    varying.press(180, 100, 0);
    t = 0;
    const phases = [0, 120, 240, 60, 180, 300];
    for (let i = 0; i < 6; i++) t = lap(varying, t, { shape: d => 6 * Math.sin(3 * (d + phases[i]) * Math.PI / 180) });
    varying.targetResults(t);
    assert.ok(varying.summary.shape_repeat_sd_px > 2, 'a shape that moves around each lap does not repeat');
});

test('circle: leaving the pad, pausing and clicking are logged but never reset the run', () => {
    const state = circle();
    state.press(180, 100, 0);
    let t = 0;
    for (let d = 2; d <= 120; d += 2) state.move(100 + 80 * Math.cos(d * Math.PI / 180), 100 + 80 * Math.sin(d * Math.PI / 180), t += 4);
    state.leave();
    assert.match(state.feedback, /left the pad/);
    t += 2000;
    for (let d = 140; d <= 200; d += 2) state.move(100 + 80 * Math.cos(d * Math.PI / 180), 100 + 80 * Math.sin(d * Math.PI / 180), t += 4);
    assert.match(state.feedback, /Lap 1 of 6/);
    t += 600;
    assert.equal(state.press(20, 100, t), 'click');
    for (let d = 202; d <= 360; d += 2) state.move(100 + 80 * Math.cos(d * Math.PI / 180), 100 + 80 * Math.sin(d * Math.PI / 180), t += 4);
    assert.equal(state.completedLaps, 1);
    // Wildly off-path motion is still recorded and drawn.
    const before = state.points.length;
    state.move(400, 400, t += 4);
    state.move(-300, 20, t += 4);
    assert.equal(state.points.length, before + 2);
    state.ignore();
    const rows = state.targetResults(t + 10);
    const m = rows[0].metrics;
    assert.equal(rows[0].status, 'completed');
    assert.equal(m.stp_circle_exit_count, 1);
    assert.equal(m.stp_circle_pause_count, 1, 'the time outside the pad is not also a pause');
    between(m.stp_circle_max_gap_ms, 603, 605);
    assert.equal(m.stp_circle_accidental_click_count, 1);
    assert.ok(state.points.some(p => p.gap));
    assert.equal(rows[1].status, 'abandoned');
    assert.equal(rows[1].trace_valid, false);
    assert.equal(rows[1].metrics.measurement_started, 1);
    assert.ok(rows.slice(2).every(r => r.elapsed_ms === 0 && JSON.stringify(r.metrics) === JSON.stringify({ measurement_started: 0 })));
    assert.equal(state.summary.ignored_event_count, 1);
    assert.equal(state.summary.laps_completed, 1);
    assert.ok(!('center_drift_total_px' in state.summary), 'drift needs two laps');
});

test('circle: back-and-forth scribbles do not invent laps; counter-clockwise laps count with their direction', () => {
    const state = circle();
    state.press(180, 100, 0);
    let t = 0;
    for (let turn = 0; turn < 8; turn++) {
        for (let d = 0; d <= 90; d += 3) state.move(100 + 80 * Math.cos(d * Math.PI / 180), 100 + 80 * Math.sin(d * Math.PI / 180), t += 4);
        for (let d = 90; d >= 0; d -= 3) state.move(100 + 80 * Math.cos(d * Math.PI / 180), 100 + 80 * Math.sin(d * Math.PI / 180), t += 4);
    }
    assert.equal(state.completedLaps, 0);

    const ccw = circle();
    ccw.press(180, 100, 0);
    t = 0;
    for (let i = 0; i < 6; i++) t = lap(ccw, t, { dir: -1 });
    const rows = ccw.targetResults(t);
    assert.deepEqual(rows.map(r => r.status), Array(6).fill('completed'));
    assert.equal(rows[0].attributes.stp_circle_direction, 'counterclockwise');
});

test('circle: laps keep counting when the circle drifts off the reference center', () => {
    const state = circle();
    state.press(180, 100, 0);
    let t = 0;
    // By lap 6 the drawn circle's center is 90 px (more than the reference radius) away from the
    // reference center, so winding around the reference center alone would stop counting.
    for (let i = 0; i < 6; i++) t = lap(state, t, { dx: 18 * i });
    assert.equal(state.completedLaps, 6);
});

test('circle: a resize rescales the stored drawing instead of invalidating it', () => {
    const state = circle();
    state.press(180, 100, 0);
    let t = lap(state, 0);
    state.geometry(200, 200, 160);
    // Same physical motion relative to the new reference: one lap of radius 160 around (200, 200).
    for (let d = 2; d <= 360; d += 2) state.move(200 + 160 * Math.cos(d * Math.PI / 180), 200 + 160 * Math.sin(d * Math.PI / 180), t += 4);
    const rows = state.targetResults(t);
    assert.equal(state.summary.resize_count, 1);
    between(rows[1].metrics.stp_circle_fit_radius_px, 159.9, 160.1);
    assert.ok(rows[1].metrics.stp_circle_center_shift_px < 0.1);
});

test('circle: the exported path is relative to the reference center, lap-labelled and bounded', () => {
    const state = circle();
    state.press(180, 100, 0);
    let t = 0;
    // Many tiny moves (a near-still hand) are thinned out.
    for (let k = 0; k < 50; k++) state.move(180 + k * 0.01, 100, t += 1);
    for (let i = 0; i < 6; i++) t = lap(state, t, { step: 1 });
    const out = state.exportPath(500);
    assert.deepEqual(out.columns, ['dx_px', 'dy_px', 't_ms', 'lap', 'gap']);
    assert.ok(out.points.length <= 500);
    assert.deepEqual(out.points[0], [80, 0, 0, 1, 0]);
    assert.equal(state.allCompleted, true);
    assert.deepEqual([...new Set(out.points.map(p => p[3]))], [1, 2, 3, 4, 5, 6]);
    const full = state.exportPath();
    assert.ok(full.points.length < state.points.length);
    assert.equal(full.points[full.points.length - 1][2], Math.round(state.points[state.points.length - 1].t));
});
