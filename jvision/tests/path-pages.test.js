'use strict';
// Loads the real Menus page scripts against a minimal fake DOM/canvas and drives them
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
            el.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
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
