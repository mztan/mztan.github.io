'use strict';
// Ports SurfaceInputsQaMenuTrialsTest / SurfaceInputsQaCircleTrialsTest (D131663691..D131670164).
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

function point(state, angle, at, offset = 0, r = 80) {
    state.move(100 + offset + r * Math.cos(angle), 100 + r * Math.sin(angle), at);
}
function lap(state, at, offset = 0, r = 80) {
    for (let degree = 0; degree <= 360; degree++) point(state, degree * Math.PI / 180, at + degree, offset, r);
}

test('circle: six ideal laps complete once and freeze', () => {
    const completions = [];
    const state = new CircleTrials(at => completions.push(at));
    state.geometry(100, 100, 80);
    for (let i = 0; i < 6; i++) lap(state, i * 1000);
    assert.equal(state.allCompleted, true);
    assert.equal(completions.length, 1);
    const results = state.targetResults(9000);
    assert.equal(results.length, 6);
    assert.ok(results.every(r => r.status === 'completed' && r.trace_valid));
    for (const r of results) {
        assert.ok(r.metrics.stp_circle_radial_rms_px < 0.001);
        assert.ok(r.metrics.stp_circle_center_shift_px < 0.001);
        assert.ok(r.metrics.stp_circle_closure_error_px < 0.001);
    }
    state.move(180, 100, 10000);
    assert.deepEqual(state.targetResults(11000), results);
});

test('circle: translated and expanded laps expose geometric drift', () => {
    const state = new CircleTrials();
    state.geometry(100, 100, 80);
    lap(state, 0);
    lap(state, 1000, 10);
    lap(state, 2000, 0, 90);
    const rows = state.targetResults(3000);
    const between = (value, lo, hi) => assert.ok(value >= lo && value <= hi, value + ' not in [' + lo + ', ' + hi + ']');
    between(rows[1].metrics.stp_circle_center_shift_px, 9.99, 10.01);
    assert.ok(rows[1].metrics.stp_circle_radial_rms_px > 6);
    between(rows[2].metrics.stp_circle_bounds_radius_px, 89.99, 90.01);
    between(rows[2].metrics.stp_circle_radial_p95_px, 9.99, 10.01);
});

test('circle: reversals and sparse jumps do not invent completed laps', () => {
    const state = new CircleTrials();
    state.geometry(100, 100, 80);
    for (let turn = 0; turn < 5; turn++) {
        for (let d = 0; d <= 60; d++) point(state, d * Math.PI / 180, turn * 200 + d);
        for (let d = 60; d >= 0; d--) point(state, d * Math.PI / 180, turn * 200 + 120 - d);
    }
    assert.equal(state.completedLaps, 0);
    state.move(20, 100, 1100);
    assert.equal(state.active, false);
    const first = state.targetResults(1200)[0];
    assert.equal(first.status, 'abandoned');
    assert.equal(first.trace_valid, false);
    assert.ok(!('stp_circle_radial_rms_px' in first.metrics));
});

test('circle: interrupted lap retries and unstarted rows remain missing', () => {
    const state = new CircleTrials();
    state.geometry(100, 100, 80);
    point(state, 0, 10);
    point(state, 0.5, 20);
    state.click();
    state.interrupt();
    lap(state, 100);
    const rows = state.targetResults(1000);
    assert.equal(rows[0].elapsed_ms, 450);
    assert.equal(rows[0].metrics.stp_circle_attempt_count, 2);
    assert.equal(rows[0].metrics.stp_circle_interruption_count, 1);
    assert.equal(rows[0].metrics.stp_circle_accidental_click_count, 1);
    assert.ok(rows.slice(1).every(r => r.elapsed_ms === 0 &&
        JSON.stringify(r.metrics) === JSON.stringify({ measurement_started: 0 })));
});

test('circle: counter-clockwise laps never complete', () => {
    const state = new CircleTrials();
    state.geometry(100, 100, 80);
    for (let degree = 0; degree <= 360; degree++) point(state, -degree * Math.PI / 180, degree);
    assert.equal(state.completedLaps, 0);
});
