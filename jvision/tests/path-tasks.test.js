'use strict';
// Ports SurfaceInputsQaMenuTrialsTest (D131663691).
const test = require('node:test');
const assert = require('node:assert/strict');
const { MENU_PATH, MenuTrials } = require('../path-tasks.js');

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
