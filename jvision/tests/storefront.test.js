'use strict';
// Ports SurfaceInputsQaStorefrontTrialsTest (D131951156).
const test = require('node:test');
const assert = require('node:assert/strict');
const { StorefrontTrials } = require('../path-tasks.js');

const STEPS = ['stp_shop_step_product_opened', 'stp_shop_step_variant_selected', 'stp_shop_step_quantity_selected',
    'stp_shop_step_item_added', 'stp_shop_step_cart_verified'];
const ready = (onAllCompleted) => {
    const state = new StorefrontTrials(onAllCompleted);
    state.geometry(1000, 420, 1, 8);
    return state;
};
function click(state, r, at) {
    state.pressAt(r.centerX, r.centerY, at, true);
    state.release(r.centerX, r.centerY, at + 20);
}
function choose(state, field, value, at) {
    click(state, field, at);
    const option = state.options().indexOf(value);
    assert.ok(option >= 0, value + ' not offered');
    click(state, state.optionRect(option), at + 100);
}
function completeOrder(state, at) {
    state.begin(at);
    const order = state.order;
    const desired = order.product * state.rowHeight - state.listRect.height / 2;
    state.scroll(Math.min(Math.max(desired, 0), state.maxOffset), at + 100);
    click(state, state.productRowRect(order.product), at + 200);
    choose(state, state.colorRect(), order.color, at + 300);
    choose(state, state.sizeRect(), order.size, at + 500);
    choose(state, state.quantityRect(), String(order.quantity), at + 700);
    click(state, state.addRect(), at + 900);
    click(state, state.cartButtonRect(), at + 1000);
    click(state, state.confirmRect(), at + 1100);
    assert.equal(state.resolved, true, state.feedback);
}

test('exact order records find, configure and verify steps and timing', () => {
    const state = ready();
    state.begin(1000);
    assert.ok(state.productRowRect(state.order.product).bottom > state.listRect.bottom);
    state.scroll(300, 1100);
    click(state, state.productRowRect(6), 1500);
    assert.equal(state.screen, 'details');
    assert.equal(state.selectedColor, 'Gray');
    assert.equal(state.selectedSize, null);
    choose(state, state.colorRect(), 'Blue', 1600);
    choose(state, state.sizeRect(), 'M', 1800);
    choose(state, state.quantityRect(), '2', 2000);
    click(state, state.addRect(), 2200);
    assert.deepEqual(state.cart, [{ product: 6, color: 'Blue', size: 'M', quantity: 2 }]);
    click(state, state.cartButtonRect(), 2300);
    click(state, state.confirmRect(), 2400);
    const row = state.targetResults(3000)[0];
    assert.equal(row.status, 'completed');
    assert.equal(row.elapsed_ms, 1420);
    assert.equal(row.trace_valid, true);
    const m = row.metrics;
    assert.equal(m.stp_shop_find_ms, 520);
    assert.equal(m.stp_shop_configure_ms, 700);
    assert.equal(m.stp_shop_correction_ms, 0);
    for (const step of STEPS) assert.equal(m[step], 1, step);
    assert.equal(m.stp_shop_dropdown_open_count, 3);
    assert.equal(m.stp_shop_incorrect_add_count, 0);
    assert.equal(m.stp_shop_no_action_click_count, 0);
    assert.equal(m.stp_shop_scroll_click_count, 0);
    assert.equal(m.clicks_total, 10);
    assert.ok(m.total_cursor_distance_px > 0);
    assert.equal(row.attributes.stp_order_text, '2 × Trailhead Hiking Shirt (Blue, M)');
    assert.equal(row.attributes.stp_condition, 'shirt_mid_list_variant_qty2');
});

test('wrong product and short quantity are corrected in the cart', () => {
    const state = ready();
    state.begin(0);
    state.scroll(300, 10);
    click(state, state.productRowRect(5), 100);
    choose(state, state.colorRect(), 'Blue', 200);
    choose(state, state.sizeRect(), 'M', 400);
    click(state, state.addRect(), 600);
    click(state, state.backButtonRect(), 700);
    assert.equal(state.screen, 'results');
    assert.equal(state.offset, 300);
    click(state, state.productRowRect(6), 800);
    choose(state, state.colorRect(), 'Navy', 900);
    choose(state, state.colorRect(), 'Blue', 1100);
    choose(state, state.sizeRect(), 'M', 1300);
    click(state, state.addRect(), 1500);
    click(state, state.cartButtonRect(), 1600);
    click(state, state.confirmRect(), 1700);
    assert.equal(state.feedback, "Trailhead Hiking Shirt, Long Sleeve (Blue, M) isn't in the order. Delete it.");
    click(state, state.deleteRect(0), 1800);
    click(state, state.confirmRect(), 1900);
    assert.equal(state.feedback, 'Change the Trailhead Hiking Shirt (Blue, M) quantity to 2.');
    assert.equal(state.resolved, false);
    choose(state, state.lineQuantityRect(0), '2', 2000);
    click(state, state.confirmRect(), 2200);
    const row = state.targetResults(3000)[0];
    assert.equal(row.status, 'completed');
    const m = row.metrics;
    assert.equal(m.stp_shop_wrong_product_open_count, 1);
    assert.equal(m.stp_shop_wrong_variant_select_count, 1);
    assert.equal(m.stp_shop_wrong_product_add_count, 1);
    assert.equal(m.stp_shop_wrong_quantity_add_count, 1);
    assert.equal(m.stp_shop_incorrect_add_count, 2);
    assert.equal(m.stp_shop_confirm_attempt_count, 3);
    assert.equal(m.stp_shop_wrong_confirm_count, 2);
    assert.equal(m.stp_shop_correction_count, 2);
    assert.equal(m.stp_shop_removal_count, 1);
    assert.equal(m.stp_shop_backtrack_count, 1);
    assert.equal(m.stp_shop_correction_ms, 1500);
    assert.equal(m.stp_shop_find_ms, 820);
    assert.equal(m.stp_shop_configure_ms, 700);
    for (const step of STEPS) assert.equal(m[step], 1, step);
});

test('add without size is blocked and repeated wrong variants merge', () => {
    const state = ready();
    state.begin(0);
    state.scroll(300, 10);
    click(state, state.productRowRect(6), 100);
    click(state, state.addRect(), 200);
    assert.equal(state.feedback, 'Choose a size before adding to the cart.');
    assert.deepEqual(state.cart, []);
    choose(state, state.sizeRect(), 'L', 300);
    click(state, state.addRect(), 500);
    click(state, state.addRect(), 600);
    assert.deepEqual(state.cart, [{ product: 6, color: 'Gray', size: 'L', quantity: 2 }]);
    const m = state.snapshot();
    assert.equal(m.stp_shop_add_attempt_count, 3);
    assert.equal(m.stp_shop_add_blocked_count, 1);
    assert.equal(m.stp_shop_wrong_variant_select_count, 1);
    assert.equal(m.stp_shop_wrong_variant_add_count, 2);
    assert.equal(m.stp_shop_step_item_added, 0);
    assert.equal(m.stp_shop_step_variant_selected, 0);
    assert.equal(m.stp_shop_correction_ms, 100);
});

test('dismissals are not no-action clicks, but moved and empty clicks are', () => {
    const state = ready();
    state.begin(0);
    state.scroll(300, 10);
    click(state, state.productRowRect(6), 100);
    click(state, state.colorRect(), 400);
    assert.equal(state.openDropdown.kind, 'color');
    state.pressAt(100, 400, 500, true);
    state.release(100, 400, 520);
    assert.equal(state.openDropdown, null);
    state.pressAt(900, 400, 600, true);
    state.release(900, 400, 620);
    const add = state.addRect();
    state.pressAt(add.centerX, add.centerY, 700, true);
    state.release(add.centerX + add.width, add.centerY, 720);
    state.pressAt(add.centerX, add.centerY, 800, true);
    state.move(add.centerX + 3, add.centerY + 12, 810);
    state.release(add.centerX + 3, add.centerY + 12, 820);
    assert.deepEqual(state.cart, []);
    const m = state.snapshot();
    assert.equal(m.stp_shop_dropdown_open_count, 1);
    assert.equal(m.stp_shop_dropdown_dismiss_count, 1);
    assert.equal(m.stp_shop_no_action_click_count, 3);
    assert.equal(m.stp_shop_add_attempt_count, 0);
    assert.equal(m.clicks_total, 6);
});

test('scrolling records reversal, overshoot, correction and clicks while scrolling', () => {
    const state = ready();
    state.begin(0);
    state.scroll(500, 100);
    state.scroll(-200, 150);
    const r = state.productRowRect(6);
    state.pressAt(r.centerX, r.centerY, 300, true);
    state.release(r.centerX, r.centerY, 320);
    assert.equal(state.openProduct, 6);
    state.scroll(100, 400);
    assert.equal(state.offset, 300);
    const m = state.snapshot();
    assert.equal(m.stp_shop_scroll_distance_px, 700);
    assert.equal(m.stp_shop_scroll_overshoot_count, 1);
    assert.equal(m.stp_shop_corrective_scroll_px, 200);
    assert.equal(m.stp_shop_scroll_reversal_count, 1);
    assert.equal(m.stp_shop_scroll_click_count, 1);
});

test('stale input, focus loss and resize cancel presses and invalidate the trace', () => {
    const state = ready();
    state.begin(0);
    state.scroll(300, 10);
    const r = state.productRowRect(6);
    state.pressAt(r.centerX, r.centerY, 100, true);
    state.move(r.centerX, r.centerY, 50);
    assert.equal(state.press, null);
    assert.equal(state.screen, 'results');
    click(state, r, 200);
    click(state, state.sizeRect(), 300);
    state.pressAt(10, 400, 400, true);
    state.focusLost(450);
    assert.equal(state.press, null);
    assert.equal(state.openDropdown, null);
    state.geometry(1000, 420, 1, 9);
    assert.equal(state.screen, 'details');
    const row = state.targetResults(1000)[0];
    assert.equal(row.status, 'abandoned');
    assert.equal(row.trace_valid, false);
    assert.equal(row.metrics.stp_shop_cancelled_press_count, 2);
    assert.ok(!('total_cursor_distance_px' in row.metrics));
});

test('cursor travel needs an uninterrupted independent pointer', () => {
    const state = ready();
    state.begin(0);
    state.hover(100, 100, 10);
    state.hover(130, 140, 20);
    assert.equal(state.snapshot().total_cursor_distance_px, 50);
    state.hoverExit();
    assert.ok(!('total_cursor_distance_px' in state.snapshot()));
    const touched = ready();
    touched.begin(0);
    touched.hover(100, 100, 10);
    touched.pressAt(100, 100, 20, false);
    touched.release(100, 100, 30);
    assert.ok(!('total_cursor_distance_px' in touched.snapshot()));
});

test('exit preserves completed, abandoned and unstarted orders and freezes', () => {
    const completions = [];
    const state = ready(at => completions.push(at));
    completeOrder(state, 0);
    state.next();
    state.begin(10000);
    state.scroll(800, 10100);
    click(state, state.productRowRect(16), 10200);
    choose(state, state.sizeRect(), '9', 10300);
    click(state, state.addRect(), 10500);
    const rows = state.targetResults(11520);
    assert.deepEqual(rows.map(r => r.status), ['completed', 'abandoned']);
    const abandoned = rows[1].metrics;
    assert.equal(rows[1].elapsed_ms, 1520);
    assert.equal(abandoned.measurement_started, 1);
    assert.equal(abandoned.stp_shop_wrong_product_add_count, 1);
    assert.equal(abandoned.stp_shop_correction_ms, 1000);
    assert.ok(!('stp_shop_find_ms' in abandoned));
    assert.equal(abandoned.stp_shop_step_cart_verified, 0);
    state.scroll(100, 12000);
    state.begin(12100);
    assert.deepEqual(state.targetResults(13000), rows);
    assert.deepEqual(completions, []);

    const early = ready();
    early.begin(0);
    early.scroll(100, 100);
    const exited = early.targetResults(500);
    assert.deepEqual(exited.map(r => r.status), ['abandoned', 'abandoned']);
    assert.equal(exited[0].metrics.stp_shop_add_attempt_count, 0);
    assert.deepEqual({ ...exited[1].metrics }, { measurement_started: 0 });
    assert.equal(exited[1].elapsed_ms, 0);
    assert.ok(ready().targetResults(0).every(r => JSON.stringify(r.metrics) === JSON.stringify({ measurement_started: 0 })));
});

test('all-completed fires once after the second confirmed order', () => {
    const completions = [];
    const state = ready(at => completions.push(at));
    completeOrder(state, 0);
    state.next();
    assert.deepEqual(state.cart, []);
    assert.equal(state.offset, 0);
    completeOrder(state, 10000);
    assert.equal(completions.length, 1);
    assert.equal(state.allCompleted, true);
    assert.deepEqual(state.targetResults(20000).map(r => r.attributes.stp_order_text),
        ['2 × Trailhead Hiking Shirt (Blue, M)', '1 × Summit Trail Runner (Black, 9)']);
});
