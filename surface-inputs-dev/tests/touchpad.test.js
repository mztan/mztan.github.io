'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { Cursor, Scroll } = require('../metrics.js');
const { environment, Element } = require('./harness.js');

test('cursor golden metrics match shared definitions: edge distance, 100ms strokes, first progress and center endpoint', () => {
    const cursor = new Cursor({ x: 100, y: 0, radius: 10 }, 0, { x: 0, y: 0 });
    cursor.observe(60, 0, 10); cursor.observe(80, 0, 50); cursor.observe(100, 0, 200);
    const value = cursor.finish(400, { x: 100, y: 0 });
    assert.equal(value.stp_cursor_movement_start_distance_px, 90);
    assert.equal(value.stp_cursor_movement_time_ms, 400);
    assert.equal(value.stp_cursor_movement_stroke_count, 2);
    assert.equal(value.stp_cursor_movement_first_stroke_share, 8 / 9);
    assert.equal(value.stp_cursor_movement_total_cursor_distance_px, 100);
    assert.equal(value.stp_cursor_movement_target_entries, 1);
    assert.equal(value.stp_cursor_movement_index_of_difficulty_bits, Math.log2(6));
    assert.equal(value.stp_cursor_movement_endpoint_error_px, 0);
});

test('cursor overshoot is reentry after leaving; small strokes and unavailable trace are not aggregate zero', () => {
    const cursor = new Cursor({ x: 100, y: 0, radius: 10 }, 0, { x: 0, y: 0 });
    cursor.observe(95, 0, 10); cursor.observe(120, 0, 20); cursor.observe(95, 0, 30);
    const value = cursor.finish(40, { x: 95, y: 0 });
    assert.equal(value.stp_cursor_movement_target_entries, 2);
    assert.equal(value.stp_cursor_movement_overshoot_count, 1);
    assert.equal(value.stp_cursor_movement_total_cursor_distance_px, 145);
    const small = new Cursor({ x: 100, y: 0, radius: 10 }, 0, { x: 0, y: 0 });
    small.observe(3, 0, 10); small.observe(4, 0, 200);
    assert.equal(small.finish(300, { x: 4, y: 0 }).stp_cursor_movement_small_strokes_far_from_target, 2);
    const unknown = new Cursor({ x: 100, y: 0, radius: 10 }, 0);
    const unavailable = unknown.finish(100, { x: 100, y: 0 });
    assert.equal(unavailable.stp_cursor_movement_total_cursor_distance_px, -1);
    assert.equal(unavailable.stp_cursor_movement_stroke_count, -1);
    assert.equal(unavailable.stp_cursor_movement_start_distance_px, -1);
    assert.equal(unavailable.stp_cursor_movement_endpoint_error_px, 0);
    const measuredZero = new Cursor({ x: 100, y: 0, radius: 10 }, 0, { x: 100, y: 0 });
    measuredZero.observe(100, 0, 10);
    assert.equal(measuredZero.finish(100, { x: 100, y: 0 }).stp_cursor_movement_total_cursor_distance_px, 0);
});

test('scroll golden metrics use CSS pixel acceptance band and shared stroke/dial-in/overshoot definitions', () => {
    const scroll = new Scroll(0, 100, 120);
    scroll.observe(60, 10); scroll.observe(110, 50); scroll.observe(140, 200);
    scroll.observe(110, 220); scroll.observe(130, 240);
    const value = scroll.finish();
    assert.equal(value.stp_scrolling_start_distance_px, 100);
    assert.equal(value.stp_scrolling_stroke_count, 2);
    assert.equal(value.stp_scrolling_dial_in_stroke_count, 2);
    assert.equal(value.stp_scrolling_first_stroke_share, 1);
    assert.equal(value.stp_scrolling_overshoot_count, 2);
    assert.equal(value.stp_scrolling_overshoot_max_px, 20);
    assert.equal(value.stp_scrolling_empty_stroke_count, 0);
    const up = new Scroll(200, 100, 120); up.observe(150, 0);
    assert.equal(up.finish().stp_scrolling_first_stroke_share, 0.625);
    const empty = new Scroll(0, 100, 120); empty.observe(5, 0);
    assert.equal(empty.finish().stp_scrolling_empty_stroke_count, 1);
});

function observer(native = true) {
    const e = environment(); e.load('transport.js'); e.load('metrics.js'); e.load('touchpad-observer.js');
    if (native) e.ready();
    return e;
}

test('targeting observer emits separate typed cursor/click observations from raw acquisition; no aggregate UXR formulas', () => {
    const e = observer(), hooks = e.win.SurfaceInputsTouchpad;
    hooks.cursorMove(0, 0); hooks.beginCursor({ x: 100, y: 0, w: 20 }, false);
    e.setNow(1010); hooks.cursorMove(60, 0); e.setNow(1020); hooks.cursorClick(80, 0, false);
    e.setNow(1030); hooks.cursorMove(100, 0); e.setNow(1040); hooks.cursorClick(100, 0, true);
    const messages = e.port.sent.filter(value => value.type === 'touchpad');
    assert.equal(messages.length, 2); assert.equal(messages[0].metric_family, 'cursor_movement');
    assert.equal(messages[1].metric_family, 'clicks');
    assert.equal(messages[0].stp_cursor_movement_total_cursor_distance_px, 100);
    assert.equal(messages[1].stp_clicks_total, 2); assert.equal(messages[1].stp_clicks_miss_count, 1);
    assert.equal(messages[1].stp_clicks_completed_count, 1);
    assert.equal('metrics' in messages[0], false);
    hooks.beginCursor({ x: 50, y: 0, w: 20 }, true); hooks.cursorClick(50, 0, true);
    assert.equal(e.port.sent.filter(value => value.type === 'touchpad').length, 2);
});

test('scroll observer derives exact containment band from root rectangles, not rounded legacy offsets', () => {
    const e = observer();
    const container = e.doc.getElementById('scroll-container'); container.scrollTop = 0;
    const highlight = new Element('highlight'); highlight.rect = { top: 200.5, bottom: 220.5 };
    e.elements.set('highlight', highlight);
    e.doc.getElementById('targetbox').rect = { top: 100.25, bottom: 140.25 };
    e.win.SurfaceInputsTouchpad.beginScroll(false);
    container.scrollTop = 90; e.setNow(1050); e.win.SurfaceInputsTouchpad.scrollMove();
    e.setNow(1350); e.win.SurfaceInputsTouchpad.finishScroll();
    const value = e.port.sent.at(-1);
    assert.equal(value.metric_family, 'scrolling'); assert.equal(value.stp_scrolling_start_distance_px, 80.25);
    assert.equal(value.stp_scrolling_direction, 'down'); assert.equal(value.stp_scrolling_time_ms, 350);
    assert.equal(value.stp_scrolling_stroke_count, -1); assert.equal(value.stp_scrolling_empty_stroke_count, -1);
    assert.equal(value.stp_scrolling_cursor_travel_without_scroll_px, -1);
});

function d3Stub() {
    const selection = { attr() { return this; }, style() { return this; }, on() { return this; }, append() { return this; },
        selectAll() { return this; }, data() { return this; }, enter() { return this; }, exit() { return this; },
        transition() { return this; }, remove() { return this; }, node() { return new Element('svg'); },
        call(fn, ...args) { fn(this, ...args); return this; } };
    return { select: () => selection, scale: { category10: () => ({}) }, svg: { mouse: () => [0, 0] } };
}
for (const variant of ['', 'uxr/']) {
    test('actual ' + (variant || 'root ') + 'targeting producer browser form unchanged; native emits nine acquisitions and no form posts', () => {
        for (const native of [false, true]) {
            const e = observer(native); e.context.d3 = d3Stub();
            e.context.EventLogger = new Proxy({}, { get: () => () => {} });
            e.doc.getElementById('condition').value = '2';
            e.load('touchpad/' + variant + 'fitts-law.js');
            vm.runInContext('startExperience()', e.context);
            const fitts = vm.runInContext('fittsTest', e.context);
            for (let index = 0; index < 9; index++) {
                e.setNow(1100 + index * 100); fitts.mouseMoved(fitts.target.x, fitts.target.y);
                fitts.mouseClicked(fitts.target.x, fitts.target.y);
            }
            const posts = e.requests.filter(value => value.options && value.options.method === 'POST');
            assert.equal(posts.length, native ? 0 : 1);
            const observations = e.port.sent.filter(value => value.type === 'touchpad');
            assert.equal(observations.length, native ? 18 : 0);
            if (native) assert.equal(observations.filter(value => value.metric_family === 'clicks').length, 9);
            assert.equal(fitts.currentCount, 0); assert.equal(fitts.active, false);
        }
    });
}

test('selection and zoom emit measured raw target/time, never relabel callback counts as drag attempts or pinches', () => {
    const e = observer(), highlight = new Element('highlight'); highlight.textContent = 'prescribed phrase'; e.elements.set('highlight', highlight);
    e.win.SurfaceInputsTouchpad.beginSelection(false); e.setNow(1100); e.win.SurfaceInputsTouchpad.finishSelection();
    const drag = e.port.sent.at(-1); assert.equal(drag.stp_drag_target_text, 'prescribed phrase');
    assert.equal('stp_drag_attempt_count' in drag, false);
    e.win.SurfaceInputsTouchpad.beginZoom(1, 1.5, 1.4, 1.6, false);
    e.setNow(1400); e.win.SurfaceInputsTouchpad.finishZoom();
    const zoom = e.port.sent.at(-1); assert.equal(zoom.stp_zooming_time_ms, 300);
    assert.equal(zoom.stp_zooming_direction, 'in'); assert.equal(zoom.stp_zooming_required_change_percent, 50);
    assert.equal(zoom.stp_zooming_pinch_count, -1); assert.equal(zoom.stp_zooming_first_pinch_share, -1);
});
