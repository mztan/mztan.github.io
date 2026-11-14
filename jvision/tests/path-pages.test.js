'use strict';
// Loads the real Menus/Circles page scripts against a minimal fake DOM/canvas and drives them
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
            el.click = () => { if (el.onclick) el.onclick({}); el.dispatch({ type: 'click' }); };
            el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
            el.fills = [];
            el.paths = [];
            let points = [];
            const ctx = { fillStyle: '', fillRect: (x, y, w, h) => el.fills.push({ style: ctx.fillStyle, x, y, w, h }),
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
    for (const file of ['path-tasks.js', 'path-results.js', 'touchpad/' + (canvasId === 'menu-canvas' ? 'menu' : 'circle') + '-task.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    }
    const canvas = element(canvasId);
    const pointer = (type, x, y, extra = {}) => {
        clock += 4;
        canvas.dispatch(Object.assign({ type, pointerType: 'mouse', isPrimary: true, buttons: 0,
            button: type === 'pointermove' ? -1 : 0, clientX: x, clientY: y, timeStamp: clock }, extra));
    };
    const flush = () => { while (timers.length) timers.shift()(); };
    const saved = () => JSON.parse(storage.get('jvision-path-results-v1') || '[]');
    return { win, element, radios, form, pointer, flush, saved, tick: ms => { clock += ms; } };
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
