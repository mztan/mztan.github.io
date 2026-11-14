'use strict';
// Loads the real Menus/Circles/Files/Storefront page scripts against a minimal fake DOM/canvas and drives them
// with pointer events. Covers event → trial state → page text → completion → local save wiring.
// It does not prove canvas rendering, layout or physical touchpad behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page(canvasId) {
    let clock = 1000;
    const timers = [];
    const listeners = target => {
        const map = new Map();
        target.addEventListener = (type, fn) => { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); };
        target.dispatch = event => (map.get(event.type) || []).forEach(fn => fn(event));
        return target;
    };
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) {
            const el = listeners({ id, textContent: '', value: '', hidden: id === 'completion', disabled: false, checked: false });
            el.focus = () => {};
            el.setPointerCapture = () => {};
            el.click = () => { if (el.onclick) el.onclick({}); el.dispatch({ type: 'click' }); };
            el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
            el.fills = [];
            el.paths = [];
            let points = [];
            const ctx = { fillStyle: '', measureText: text => ({ width: String(text).length * 7 }), fillRect: (x, y, w, h) => el.fills.push({ style: ctx.fillStyle, x, y, w, h }),
                beginPath: () => { points = []; }, moveTo: (x, y) => points.push({ x, y }), lineTo: (x, y) => points.push({ x, y }),
                fill: () => el.paths.push({ style: ctx.fillStyle, points: points.slice() }),
                stroke: () => el.strokes.push({ style: ctx.strokeStyle, points: points.slice() }) };
            el.strokes = [];
            el.getContext = () => new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
            elements.set(id, el);
        }
        return elements.get(id);
    };
    const radios = [1, 2, 3, 4, 5].map(v => ({ value: String(v), checked: false, disabled: false, focus() {} }));
    const form = element('completion-form');
    form.querySelector = q => q.includes(':checked') ? radios.find(r => r.checked) || null : radios[0];
    form.querySelectorAll = () => radios;
    form.submit = () => form.onsubmit({ preventDefault() {} });
    const storage = new Map();
    const doc = listeners({ getElementById: element, hidden: false, body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) });
    const win = listeners({
        document: doc, devicePixelRatio: 1,
        performance: { now: () => clock },
        requestAnimationFrame: fn => { fn(); return 0; },
        setTimeout: fn => { timers.push(fn); return timers.length; },
        ResizeObserver: class { observe() {} },
        localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
        Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }
    });
    const context = vm.createContext({ window: win, navigator: { userAgent: 'node' } });
    const script = { 'menu-canvas': 'menu', 'circle-canvas': 'circle', 'files-canvas': 'files', 'store-canvas': 'storefront' }[canvasId];
    for (const file of ['path-tasks.js', 'path-results.js', 'touchpad/' + script + '-task.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    }
    const canvas = element(canvasId);
    const pointer = (type, x, y, extra = {}) => {
        clock += 4;
        canvas.dispatch(Object.assign({ type, pointerType: 'mouse', isPrimary: true, buttons: 0,
            button: type === 'pointermove' ? -1 : 0, clientX: x, clientY: y, timeStamp: clock }, extra));
    };
    const wheel = deltaY => {
        clock += 4;
        let prevented = false;
        canvas.dispatch({ type: 'wheel', deltaY, deltaMode: 0, clientX: 500, clientY: 300, timeStamp: clock,
            preventDefault: () => { prevented = true; } });
        return prevented;
    };
    const flush = () => { while (timers.length) timers.shift()(); };
    const saved = () => JSON.parse(storage.get('jvision-path-results-v1') || '[]');
    return { win, element, radios, form, pointer, wheel, flush, saved, tick: ms => { clock += ms; } };
}

test('circle page: six hovered laps open the rating dialog and save local results', () => {
    const p = page('circle-canvas');
    const cx = 500, cy = 300, r = 600 * 0.36;
    for (let lap = 0; lap < 6; lap++) {
        for (let deg = 0; deg <= 360; deg += 3) {
            const a = deg * Math.PI / 180, wobble = lap === 2 ? 6 * Math.sin(5 * a) : 0;
            p.pointer('pointermove', cx + (r + wobble) * Math.cos(a), cy + (r + wobble) * Math.sin(a));
        }
    }
    assert.equal(p.element('laps').textContent, 'Clockwise circles · 6 of 6 complete');
    assert.equal(p.element('completion').hidden, true);
    p.flush();
    assert.equal(p.element('completion').hidden, false);
    assert.equal(p.element('completion-title').textContent, 'Circles complete');
    p.radios[3].checked = true;
    p.element('completion-comment').value = 'smooth';
    p.form.submit();
    const [run] = p.saved();
    assert.equal(run.task, 'stp_circle_tracing');
    assert.equal(run.ease, 4);
    assert.equal(run.comment, 'smooth');
    assert.deepEqual(run.targets.map(t => t.status), Array(6).fill('completed'));
    assert.ok(run.targets[2].metrics.stp_circle_radial_rms_px > 3);
    assert.ok(run.targets[0].metrics.stp_circle_radial_rms_px < 0.5);
    assert.match(p.element('completion-status').textContent, /Saved in this browser/);
});

test('circle page: touch input and leaving the area interrupt the lap', () => {
    const p = page('circle-canvas');
    const cx = 500, cy = 300, r = 216;
    for (let deg = 0; deg <= 90; deg += 3) p.pointer('pointermove', cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180));
    p.pointer('pointermove', cx, cy + r, { pointerType: 'touch' });
    assert.match(p.element('status').textContent, /interrupted/);
    // Clicking during a lap is counted, and pressed motion is not treated as hover.
    p.pointer('pointermove', cx + r, cy);
    p.pointer('pointerdown', cx + r, cy, { buttons: 1 });
    p.pointer('pointerup', cx + r, cy);
    p.element('circle-canvas').dispatch({ type: 'pointerleave' });
    assert.match(p.element('status').textContent, /interrupted/);
    assert.equal(p.element('laps').textContent, 'Clockwise circles · 0 of 6 complete');
});

test('menu page: wrong pick, two paths, skip rating and save local results', () => {
    const p = page('menu-canvas');
    const { MENU_LABELS, MENU_PATH } = p.win.SurfaceInputsPathTasks;
    const W = 1000, H = 600, rh = Math.min(36, H / 10), cw = W / 5, tops = [];
    for (let l = 0; l < 5; l++) tops[l] = Math.min(l === 0 ? 0 : tops[l - 1] + MENU_PATH[l - 1] * rh, H - MENU_LABELS[l].length * rh);
    const at = (l, i) => [l * cw + cw / 2, tops[l] + i * rh + rh / 2];
    const hover = (l, i) => { const [x, y] = at(l, i); p.pointer('pointermove', x - 8, y); p.pointer('pointermove', x, y); };
    const click = (l, i) => { hover(l, i); const [x, y] = at(l, i); p.pointer('pointerdown', x, y, { buttons: 1 }); p.pointer('pointerup', x, y); };
    const button = p.element('menu-button');

    assert.equal(p.element('requested-path').textContent, 'File → New → Document');
    button.click();
    click(0, 0);
    assert.match(p.element('status').textContent, /Different option/);
    assert.equal(p.element('counts').textContent, 'Selections: 1 · Wrong: 1');
    button.click();
    hover(0, 2); hover(1, 0); click(2, 1);
    assert.equal(p.element('status').textContent, '✓ Complete');
    assert.equal(button.textContent, 'Next path');
    button.click();
    assert.equal(p.element('requested-path').textContent, 'File → New → Document → 5×8 → Pageless');
    button.click();
    // Click on empty space dismisses without counting a wrong selection.
    p.pointer('pointerdown', 990, 590, { buttons: 1 }); p.pointer('pointerup', 990, 590);
    assert.match(p.element('status').textContent, /Menu closed/);
    button.click();
    hover(0, 2); hover(1, 0); hover(2, 1); hover(3, 2); click(4, 1);
    p.flush();
    assert.equal(p.element('completion').hidden, false);
    p.element('completion-skip').click();
    const [run] = p.saved();
    assert.equal(run.task, 'stp_cascading_menu');
    assert.equal(run.ease, null);
    const [shallow, deep] = run.targets;
    assert.deepEqual([shallow.status, deep.status], ['completed', 'completed']);
    assert.equal(shallow.metrics.stp_menu_attempt_count, 2);
    assert.equal(shallow.metrics.stp_menu_wrong_selection_count, 1);
    assert.equal(shallow.metrics.stp_menu_first_attempt_success, 0);
    assert.equal(deep.metrics.stp_menu_dismissal_count, 1);
    assert.equal(deep.metrics.stp_menu_first_attempt_success, 1);
    assert.equal(deep.metrics.stp_menu_deepest_level, 5);
    assert.ok(deep.metrics.total_cursor_distance_px > 0);
    assert.equal(deep.trace_valid, true);
});

test('menu page: direct touch still selects but invalidates that path\'s cursor trace', () => {
    const p = page('menu-canvas');
    const { MENU_LABELS, MENU_PATH } = p.win.SurfaceInputsPathTasks;
    const H = 600, rh = 36, cw = 200, tops = [];
    for (let l = 0; l < 5; l++) tops[l] = Math.min(l === 0 ? 0 : tops[l - 1] + MENU_PATH[l - 1] * rh, H - MENU_LABELS[l].length * rh);
    const at = (l, i) => [l * cw + cw / 2, tops[l] + i * rh + rh / 2];
    const hover = (l, i) => { const [x, y] = at(l, i); p.pointer('pointermove', x - 8, y); p.pointer('pointermove', x, y); };
    const click = (l, i) => { hover(l, i); const [x, y] = at(l, i); p.pointer('pointerdown', x, y, { buttons: 1 }); p.pointer('pointerup', x, y); };
    const button = p.element('menu-button');
    button.click();
    const [tx, ty] = at(0, 0);
    p.pointer('pointerdown', tx, ty, { pointerType: 'touch', buttons: 1 });
    p.pointer('pointerup', tx, ty, { pointerType: 'touch' });
    assert.match(p.element('status').textContent, /Different option/);
    button.click(); hover(0, 2); hover(1, 0); click(2, 1);
    button.click(); button.click();
    hover(0, 2); hover(1, 0); hover(2, 1); hover(3, 2); click(4, 1);
    p.flush();
    p.element('completion-skip').click();
    const [shallow, deep] = p.saved()[0].targets;
    assert.equal(shallow.trace_valid, false);
    assert.ok(!('total_cursor_distance_px' in shallow.metrics));
    assert.equal(deep.trace_valid, true);
});

test('menu page: the requested path is shaded gray, other rows white, hover blue', () => {
    const p = page('menu-canvas');
    const canvas = p.element('menu-canvas');
    const GRAY = 'rgb(205, 209, 215)', WHITE = 'rgb(245, 247, 250)', BLUE = 'rgb(194, 222, 255)';
    // Item fills are inset 1 px; the full-canvas background is drawn at (0, 0).
    const fillAt = (level, item) => {
        const rects = canvas.fills.filter(f => f.x === level * 200 + 1 && f.y === item * 36 + 1);
        return rects.length ? rects[rects.length - 1].style : null;
    };
    p.element('menu-button').click();
    assert.equal(fillAt(0, 2), GRAY); // File
    assert.equal(fillAt(0, 0), WHITE); // Edit
    canvas.fills.length = 0;
    p.pointer('pointermove', 100, 2 * 36 + 18); // hover File: blue wins, its submenu opens
    assert.equal(fillAt(0, 2), BLUE);
    assert.equal(fillAt(1, 0), null); // New sits at the parent's row, not row 0
    const newTop = 2 * 36 + 1;
    assert.equal(canvas.fills.filter(f => f.x === 201 && f.y === newTop).pop().style, GRAY);
    assert.equal(canvas.fills.filter(f => f.x === 201 && f.y === newTop + 36).pop().style, WHITE);
});

test('circle page: the blue start marker contains a downward (clockwise) arrow', () => {
    const p = page('circle-canvas');
    const r = 600 * 0.36, mx = 500 + r, my = 300, m = r * 0.09;
    const heads = p.element('circle-canvas').paths.filter(f => f.style === '#fff' && f.points.length === 3);
    assert.equal(heads.length >= 1, true);
    const head = heads[heads.length - 1].points;
    assert.ok(head.every(pt => Math.hypot(pt.x - mx, pt.y - my) < m), 'arrow head stays inside the marker');
    const apex = head.reduce((a, b) => (b.y > a.y ? b : a));
    const base = head.filter(pt => pt !== apex);
    // Clockwise at 3 o'clock is +y on screen: the apex is centered and below the base.
    assert.ok(Math.abs(apex.x - mx) < 1e-9);
    assert.ok(base.every(pt => pt.y < apex.y));
});

test('circle page: clicks mid-lap are logged and marked with a red X without interrupting the lap', () => {
    const p = page('circle-canvas');
    const canvas = p.element('circle-canvas');
    const cx = 500, cy = 300, r = 216, RED = 'rgb(230, 61, 46)';
    const at = deg => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
    for (let lap = 0; lap < 6; lap++) {
        for (let deg = 0; deg <= 360; deg += 3) {
            const [x, y] = at(deg);
            if (lap === 0 && deg === 90) {
                // Press, keep tracing with the button held, release: one click, lap continues.
                p.pointer('pointerdown', x, y, { buttons: 1 });
                for (let d = 93; d <= 120; d += 3) { const [px, py] = at(d); p.pointer('pointermove', px, py, { buttons: 1 }); }
                const [ux, uy] = at(120);
                p.pointer('pointerup', ux, uy);
                deg = 120;
                continue;
            }
            p.pointer('pointermove', x, y);
            if (lap === 3 && deg === 180) { p.pointer('pointerdown', x, y, { buttons: 1 }); p.pointer('pointerup', x, y); }
        }
        assert.doesNotMatch(p.element('status').textContent, /interrupted/);
    }
    assert.equal(p.element('clicks').textContent, 'Clicks: 2');
    const reds = canvas.strokes.filter(st => st.style === RED);
    assert.ok(reds.length >= 4, 'two strokes per X, two clicks');
    p.flush();
    p.element('completion-skip').click();
    const [run] = p.saved();
    assert.deepEqual(run.targets.map(t => t.status), Array(6).fill('completed'));
    assert.equal(run.targets[0].metrics.stp_circle_interruption_count, 0);
    assert.equal(run.targets[0].metrics.stp_circle_accidental_click_count, 1);
    assert.equal(run.targets[3].metrics.stp_circle_accidental_click_count, 1);
    assert.equal(run.clicks.length, 2);
    assert.deepEqual(run.clicks.map(c => [c.lap, c.in_lap]), [[1, true], [4, true]]);
    assert.ok(run.clicks.every(c => Number.isFinite(c.x) && Number.isFinite(c.y) && c.t_ms >= 0));
});

test('circle page: a click before starting a lap is still logged and marked', () => {
    const p = page('circle-canvas');
    p.pointer('pointermove', 500, 300 - 216);
    p.pointer('pointerdown', 500, 300 - 216, { buttons: 1 });
    p.pointer('pointerup', 500, 300 - 216);
    assert.equal(p.element('clicks').textContent, 'Clicks: 1');
    assert.ok(p.element('circle-canvas').strokes.some(st => st.style === 'rgb(230, 61, 46)'));
});

function filesDrag(p, from, to, extra = {}) {
    p.pointer('pointerdown', from[0], from[1], Object.assign({ buttons: 1, pointerId: 1 }, extra));
    p.pointer('pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, Object.assign({ buttons: 1, pointerId: 1 }, extra));
    p.pointer('pointermove', to[0], to[1], Object.assign({ buttons: 1, pointerId: 1 }, extra));
    p.pointer('pointerup', to[0], to[1], Object.assign({ pointerId: 1 }, extra));
}

test('files page: wheel scroll and press-hold-drag move all three files, then save local results', () => {
    const p = page('files-canvas');
    const button = p.element('files-button');
    const slot = 600 / 7;
    assert.equal(p.element('status').textContent, 'Select Begin to show the files.');
    button.click();
    assert.equal(p.element('requested-file').textContent, 'Q3 budget final.xlsx');
    assert.equal(p.element('requested-folder').textContent, 'Finance');
    assert.equal(button.disabled, true);
    assert.equal(p.wheel(400), true);
    filesDrag(p, [676, 16 * 40 - 400 + 20], [170, slot * 1.5]);
    assert.equal(p.element('status').textContent, '✓ Moved Q3 budget final.xlsx to Finance');
    assert.equal(button.textContent, 'Next file');
    button.click();
    button.click();
    assert.equal(p.element('requested-folder').textContent, 'Projects');
    p.wheel(700);
    filesDrag(p, [324, 29 * 40 - 700 + 20], [830, slot * 3.5]);
    button.click();
    button.click();
    p.wheel(-800);
    filesDrag(p, [676, 2 * 40 - 40 + 20], [170, slot * 6.5]);
    p.flush();
    assert.equal(p.element('completion').hidden, false);
    assert.equal(p.element('completion-title').textContent, 'Files complete');
    p.element('completion-skip').click();
    const [run] = p.saved();
    assert.equal(run.task, 'stp_file_drag');
    assert.deepEqual(run.targets.map(t => t.status), ['completed', 'completed', 'completed']);
    assert.ok(run.targets.every(t => t.metrics.drag_attempt_count === 1 && t.trace_valid));
    assert.ok(run.targets.every(t => t.metrics.stp_file_hold_travel_px > 0));
    assert.deepEqual(run.targets.map(t => t.attributes.stp_condition), [
        'scroll_down_short_folder_left_upper', 'scroll_down_long_folder_right_middle', 'scroll_up_long_folder_left_lower']);
});

test('files page: wrong folder recovers, cancel, blur and a second pointer end drags, touch can complete', () => {
    const p = page('files-canvas');
    const slot = 600 / 7;
    p.element('files-button').click();
    p.wheel(400);
    const row = [676, 16 * 40 - 400 + 20];
    filesDrag(p, row, [170, slot * 2.5]);
    assert.equal(p.element('status').textContent, 'Dropped on Finance archive. Drag it to Finance.');
    p.pointer('pointerdown', row[0], row[1], { buttons: 1, pointerId: 1 });
    p.pointer('pointermove', row[0] - 60, row[1], { buttons: 1, pointerId: 1 });
    p.element('files-canvas').dispatch({ type: 'pointercancel', pointerId: 1 });
    assert.match(p.element('status').textContent, /^Drag cancelled/);
    p.pointer('pointerdown', row[0], row[1], { buttons: 1, pointerId: 1 });
    p.pointer('pointermove', row[0] - 60, row[1], { buttons: 1, pointerId: 1 });
    p.win.dispatch({ type: 'blur' });
    // A second pointer while pressing is not a single-pointer drag.
    p.pointer('pointerdown', row[0], row[1], { buttons: 1, pointerId: 1 });
    p.pointer('pointermove', row[0] - 60, row[1], { buttons: 1, pointerId: 1 });
    p.pointer('pointerdown', row[0], row[1] + 40, { buttons: 1, pointerId: 2, isPrimary: false });
    filesDrag(p, row, [170, slot * 1.5], { pointerType: 'touch' });
    assert.equal(p.element('status').textContent, '✓ Moved Q3 budget final.xlsx to Finance');
    assert.equal(p.element('counts').textContent, 'File 1 of 3 · Drags: 5 · Wrong file: 0');
});

/* A layout twin of the page's StorefrontTrials (1000×600 canvas) that mirrors every click, so
 * the test can aim at the same control rectangles the page draws. */
function storeTwin(p) {
    const { StorefrontTrials } = require('../path-tasks.js');
    const twin = new StorefrontTrials();
    twin.geometry(1000, 600, 1, 8);
    let at = 0;
    const api = {
        twin,
        begin() { p.element('store-button').click(); twin.begin(at += 10); },
        next() { p.element('store-button').click(); twin.next(); },
        wheel(delta) { p.wheel(delta); twin.scroll(delta, at += 10); },
        click(r, extra = {}) {
            p.pointer('pointerdown', r.centerX, r.centerY, Object.assign({ buttons: 1, pointerId: 1 }, extra));
            p.pointer('pointerup', r.centerX, r.centerY, Object.assign({ pointerId: 1 }, extra));
            twin.pressAt(r.centerX, r.centerY, at += 10, extra.pointerType !== 'touch');
            twin.release(r.centerX, r.centerY, at += 10);
        },
        choose(field, value, extra) {
            api.click(field, extra);
            api.click(twin.optionRect(twin.options().indexOf(value)), extra);
        },
        order(extra) {
            const order = twin.order;
            api.wheel(order.product * 64 - 276);
            api.click(twin.productRowRect(order.product), extra);
            p.tick(300);
            api.choose(twin.colorRect(), order.color, extra);
            api.choose(twin.sizeRect(), order.size, extra);
            api.choose(twin.quantityRect(), String(order.quantity), extra);
            api.click(twin.addRect(), extra);
            api.click(twin.cartButtonRect(), extra);
            api.click(twin.confirmRect(), extra);
        }
    };
    return api;
}

test('storefront page: wheel scroll and clicks confirm both orders, then save local results', () => {
    const p = page('store-canvas');
    const s = storeTwin(p);
    const button = p.element('store-button');
    assert.equal(p.element('status').textContent, 'Select Begin to open the store.');
    s.begin();
    assert.equal(p.element('order-prompt').textContent,
        'Add two blue, medium Trailhead Hiking Shirts to your cart, then confirm the cart.');
    assert.equal(button.disabled, true);
    p.tick(400);
    s.order();
    assert.equal(p.element('status').textContent, '✓ Order confirmed: 2 × Trailhead Hiking Shirt (Blue, M)');
    assert.equal(button.textContent, 'Next order');
    s.next();
    s.begin();
    assert.match(p.element('order-prompt').textContent, /^Add one pair of black Summit Trail Runners, size 9/);
    s.order();
    p.flush();
    assert.equal(p.element('completion').hidden, false);
    assert.equal(p.element('completion-title').textContent, 'Storefront complete');
    p.element('completion-skip').click();
    const [run] = p.saved();
    assert.equal(run.task, 'stp_storefront_cart');
    assert.deepEqual(run.targets.map(t => t.status), ['completed', 'completed']);
    assert.ok(run.targets.every(t => t.metrics.stp_shop_step_cart_verified === 1 && t.metrics.stp_shop_incorrect_add_count === 0));
    assert.ok(run.targets.every(t => t.trace_valid && t.metrics.total_cursor_distance_px > 0));
    // The first click lands right after the wheel packet, so it counts as a click while scrolling.
    assert.deepEqual(run.targets.map(t => t.metrics.stp_shop_scroll_click_count), [1, 1]);
    assert.deepEqual(run.targets.map(t => t.attributes.stp_condition), ['shirt_mid_list_variant_qty2', 'runner_late_list_variant_qty1']);
});

test('storefront page: wrong item recovery in the cart, blur closes a dropdown, touch can complete', () => {
    const p = page('store-canvas');
    const s = storeTwin(p);
    s.begin();
    s.wheel(300);
    s.click(s.twin.productRowRect(7));
    s.choose(s.twin.colorRect(), 'Blue');
    s.choose(s.twin.sizeRect(), 'M');
    s.click(s.twin.addRect());
    s.click(s.twin.cartButtonRect());
    s.click(s.twin.confirmRect());
    assert.equal(p.element('status').textContent, "Trailhead Hiking Shirt, Sleeveless (Blue, M) isn't in the order. Delete it.");
    s.click(s.twin.deleteRect(0));
    assert.equal(p.element('counts').textContent, 'Order 1 of 2 · Cart: 0 · Adds: 1');
    s.click(s.twin.backButtonRect());
    s.click(s.twin.productRowRect(6), { pointerType: 'touch' });
    s.click(s.twin.colorRect(), { pointerType: 'touch' });
    p.win.dispatch({ type: 'blur' });
    s.twin.focusLost(0);
    // The dropdown closed, so the next click on the color field opens it again.
    s.choose(s.twin.colorRect(), 'Blue', { pointerType: 'touch' });
    s.choose(s.twin.sizeRect(), 'M', { pointerType: 'touch' });
    s.choose(s.twin.quantityRect(), '2', { pointerType: 'touch' });
    s.click(s.twin.addRect(), { pointerType: 'touch' });
    s.click(s.twin.cartButtonRect(), { pointerType: 'touch' });
    s.click(s.twin.confirmRect(), { pointerType: 'touch' });
    assert.equal(p.element('status').textContent, '✓ Order confirmed: 2 × Trailhead Hiking Shirt (Blue, M)');
    assert.equal(p.element('counts').textContent, 'Order 1 of 2 · Cart: 2 · Adds: 2');
    assert.equal(p.element('store-button').textContent, 'Next order');
    assert.deepEqual(p.saved(), []);
});
