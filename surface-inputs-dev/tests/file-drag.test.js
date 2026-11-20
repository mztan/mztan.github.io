'use strict';
// Ports SurfaceInputsQaFileDragTrialsTest (D131935533).
const test = require('node:test');
const assert = require('node:assert/strict');
const { FileDragTrials } = require('../path-tasks.js');

const ready = (onAllCompleted) => {
    const state = new FileDragTrials(onAllCompleted);
    state.geometry(1000, 420, 1, 8);
    return state;
};
const rowY = (state, index) => state.listRect.top + index * state.rowHeight - state.offset + state.rowHeight / 2;
function revealTarget(state, at) {
    const desired = state.spec.fileIndex * state.rowHeight - state.listRect.height / 2;
    state.scroll(Math.min(Math.max(desired, 0), state.maxOffset) - state.offset, at);
}
/* Press, hold, move in two steps and release; folder null drops at (x, y). */
function drag(state, file, folder, at, x = folder ? folder.centerX : 0, y = folder ? folder.centerY : 0) {
    const startY = rowY(state, file), startX = state.listRect.centerX;
    state.pressAt(startX, startY, at, true);
    state.move((startX + x) / 2, (startY + y) / 2, at + 10);
    state.move(x, y, at + 20);
    state.release(x, y, at + 30);
}
const close = (actual, expected, tolerance) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, actual + ' not within ' + tolerance + ' of ' + expected);

test('each layout starts with the file out of view and varies scroll and drag direction', () => {
    const state = ready();
    const layouts = [];
    for (let index = 0; index < 3; index++) {
        state.begin(index * 10000);
        const top = state.spec.fileIndex * state.rowHeight - state.offset;
        assert.ok(top < 0 || top + state.rowHeight > state.listRect.height);
        assert.ok(state.snapshot().stp_file_start_distance_px > 0);
        layouts.push([state.spec.foldersOnLeft, state.offset, state.folderRects[state.spec.folderIndex].centerY]);
        revealTarget(state, index * 10000 + 100);
        drag(state, state.spec.fileIndex, state.folderRects[state.spec.folderIndex], index * 10000 + 1000);
        assert.equal(state.resolved, true);
        state.next();
    }
    assert.deepEqual(layouts.map(l => l[0]), [true, false, true]);
    assert.deepEqual(layouts.map(l => l[1]), [0, 0, state.maxOffset]);
    assert.equal(new Set(layouts.map(l => l[2])).size, 3);
    assert.equal(state.allCompleted, true);
});

test('success records find, drag and drop timing and geometry', () => {
    const state = ready();
    state.begin(1000);
    state.scroll(400, 1100);
    const y = rowY(state, state.spec.fileIndex), folder = state.folderRects[1], x0 = state.listRect.centerX;
    state.pressAt(x0, y, 1500, true);
    state.move(x0 - 20, y, 1600);
    state.move(folder.centerX, folder.centerY, 1700);
    state.release(folder.centerX, folder.centerY, 1900);
    const row = state.targetResults(2000)[0];
    assert.equal(row.status, 'completed');
    assert.equal(row.elapsed_ms, 900);
    assert.equal(row.trace_valid, true);
    const m = row.metrics;
    assert.equal(m.stp_file_time_to_visible_ms, 100);
    assert.equal(m.stp_file_time_to_find_ms, 500);
    assert.equal(m.stp_file_drag_completion_ms, 300);
    assert.equal(m.drag_attempt_count, 1);
    assert.equal(m.drag_first_attempt_selected_target, 1);
    assert.equal(m.drag_wrong_selection_count, 0);
    assert.equal(m.stp_file_retry_count, 0);
    close(m.stp_file_drop_center_error_px, 0, 0.05);
    close(m.stp_file_drop_center_error_norm, 0, 0.001);
    close(m.stp_file_hold_travel_px, 20 + Math.hypot(x0 - 20 - folder.centerX, y - folder.centerY), 0.1);
    assert.ok(!('stp_file_miss_edge_distance_px' in m));
    assert.equal(row.attributes.drag_target_text, 'Q3 budget final.xlsx → Finance');
    assert.equal(row.attributes.stp_condition, 'scroll_down_short_folder_left_upper');
});

test('wrong file, wrong folder and outside releases are recoverable', () => {
    const state = ready();
    state.begin(0);
    revealTarget(state, 10);
    const finance = state.folderRects[1], archive = state.folderRects[2];
    drag(state, state.spec.fileIndex - 1, finance, 100);
    assert.match(state.feedback, /^That was Q3 budget draft\.xlsx/);
    drag(state, state.spec.fileIndex, archive, 1000);
    assert.equal(state.feedback, 'Dropped on Finance archive. Drag it to Finance.');
    drag(state, state.spec.fileIndex, null, 2000, state.listRect.centerX, state.listRect.top + 5);
    assert.match(state.feedback, /^Released outside a folder/);
    assert.equal(state.resolved, false);
    drag(state, state.spec.fileIndex, finance, 2500);
    const m = state.targetResults(5000)[0].metrics;
    assert.equal(m.drag_attempt_count, 4);
    assert.equal(m.stp_file_retry_count, 3);
    assert.equal(m.drag_wrong_selection_count, 1);
    assert.equal(m.drag_first_attempt_selected_target, 0);
    assert.equal(m.stp_file_wrong_folder_drop_count, 1);
    assert.equal(m.stp_file_outside_release_count, 1);
    // The re-grab 470 ms after the outside release is inferred accidental, separately counted.
    assert.equal(m.stp_file_inferred_accidental_release_count, 1);
    assert.ok(m.stp_file_miss_edge_distance_px > 0);
});

test('press without movement and cancelled drags are not delivered releases', () => {
    const state = ready();
    state.begin(0);
    revealTarget(state, 10);
    const y = rowY(state, state.spec.fileIndex), x = state.listRect.centerX;
    state.pressAt(x, y, 100, true);
    state.move(x + 3, y, 150);
    state.release(x + 3, y, 200);
    assert.equal(state.attempts, 0);
    assert.equal(state.feedback, 'Keep the press held and move to drag the file.');
    state.pressAt(x, y, 300, true);
    state.move(x - 50, y, 350);
    state.cancel(400);
    assert.equal(state.press, null);
    assert.match(state.feedback, /^Drag cancelled/);
    drag(state, state.spec.fileIndex, state.folderRects[1], 1000);
    const m = state.targetResults(3000)[0].metrics;
    assert.equal(m.stp_file_press_without_drag_count, 1);
    assert.equal(m.stp_file_cancelled_drag_count, 1);
    assert.equal(m.stp_file_outside_release_count, 0);
    assert.equal(m.drag_attempt_count, 2);
    assert.equal(m.drag_first_attempt_selected_target, 0);
    assert.equal(m.clicks_total, 3);
});

test('scrolling records reversals, overshoot, correction and clicks while scrolling', () => {
    const state = ready();
    state.begin(0);
    state.scroll(700, 100);
    state.scroll(-100, 150);
    const x = state.listRect.centerX, y = state.listRect.top + 5;
    state.pressAt(x, y, 300, true);
    state.release(x, y, 320);
    state.pressAt(x, y, 900, true);
    state.release(x, y, 920);
    const m = state.snapshot();
    assert.equal(m.stp_file_scroll_distance_px, 800);
    assert.equal(m.stp_file_scroll_overshoot_count, 1);
    assert.equal(m.stp_file_scroll_overshoot_max_px, 60);
    assert.equal(m.stp_file_scroll_reversal_count, 1);
    assert.equal(m.stp_file_corrective_scroll_px, 100);
    assert.equal(m.stp_file_scroll_click_count, 1);
    // Visibility is sampled after each packet; the 700 px jump passes over the row.
    assert.equal(m.stp_file_time_to_visible_ms, 150);
});

test('stale input and resize cancel the drag and invalidate hold travel', () => {
    const state = ready();
    state.begin(0);
    revealTarget(state, 10);
    const y = rowY(state, state.spec.fileIndex), x = state.listRect.centerX;
    state.pressAt(x, y, 100, true);
    state.move(x - 40, y, 200);
    state.move(x - 60, y, 150);
    assert.equal(state.press, null);
    state.pressAt(x, y, 300, true);
    state.move(x - 40, y, 350);
    state.geometry(1000, 420, 1, 9);
    assert.equal(state.press, null);
    drag(state, state.spec.fileIndex, state.folderRects[1], 1000);
    const row = state.targetResults(2000)[0];
    assert.equal(row.status, 'completed');
    assert.equal(row.trace_valid, false);
    assert.equal(row.metrics.stp_file_cancelled_drag_count, 2);
    assert.ok(!('stp_file_hold_travel_px' in row.metrics));
});

test('exit preserves completed, abandoned and unstarted rows and freezes', () => {
    const completions = [];
    const state = ready(at => completions.push(at));
    state.begin(0);
    revealTarget(state, 10);
    drag(state, state.spec.fileIndex, state.folderRects[1], 100);
    state.next();
    state.begin(1000);
    state.scroll(100, 1100);
    const rows = state.targetResults(2000);
    assert.deepEqual(rows.map(r => r.status), ['completed', 'abandoned', 'abandoned']);
    assert.equal(rows[1].elapsed_ms, 1000);
    assert.equal(rows[1].metrics.measurement_started, 1);
    assert.equal(rows[1].metrics.drag_attempt_count, 0);
    assert.ok(!('drag_first_attempt_selected_target' in rows[1].metrics));
    assert.deepEqual({ ...rows[2].metrics }, { measurement_started: 0 });
    assert.equal(rows[2].elapsed_ms, 0);
    state.scroll(100, 3000);
    state.begin(3100);
    assert.deepEqual(state.targetResults(4000), rows);
    assert.deepEqual(completions, []);
});

test('unstarted exit invents no attempts', () => {
    const rows = ready().targetResults(100);
    assert.ok(rows.every(r => r.status === 'abandoned' && !r.trace_valid &&
        JSON.stringify(r.metrics) === JSON.stringify({ measurement_started: 0 })));
});

test('all-completed fires once after the third requested drop', () => {
    const completions = [];
    const state = ready(at => completions.push(at));
    for (let i = 0; i < 3; i++) {
        state.begin(i * 10000);
        revealTarget(state, i * 10000 + 10);
        drag(state, state.spec.fileIndex, state.folderRects[state.spec.folderIndex], i * 10000 + 100);
        state.next();
    }
    assert.deepEqual(completions, [20130]);
    assert.ok(state.targetResults(40000).every(r => r.status === 'completed'));
});
