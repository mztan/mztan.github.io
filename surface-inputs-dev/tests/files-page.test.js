'use strict';
// Loads the imported Files page scripts against a minimal fake DOM/canvas and drives them
// with pointer events. Covers event → trial state → page text → completion → local save wiring.
// It does not prove canvas rendering, layout or physical touchpad behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page(canvasId, globals = {}) {
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
    const win = listeners(Object.assign({
        document: doc, devicePixelRatio: 1,
        performance: { now: () => clock },
        requestAnimationFrame: fn => { fn(); return 0; },
        setTimeout: fn => { timers.push(fn); return timers.length; },
        ResizeObserver: class { observe() {} },
        localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
        SurfaceInputsTransport: {usesNative:()=>false, requireV2(){}, canQueue:()=>true, validate(){}, submitArcadeEvent(){throw Error("No browser network submission");}}, crypto: {randomUUID:()=>"page-fixture"}, Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, clearTimeout() {}
    }, globals));
    require('./files-form-fixture.js').attach(win);
    element('files-participant').value = 'page-fixture';
    const context = vm.createContext({ window: win, navigator: { userAgent: 'node' } });
    const files = ["path-tasks.js", "path-results.js", "touchpad/files-task.js"];
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    }
    const canvas = element(canvasId);
    const pointer = (type, x, y, extra = {}) => {
        clock += 4;
        canvas.dispatch(Object.assign({ type, pointerType: 'mouse', isPrimary: true, buttons: 0,
            button: type === 'pointermove' ? -1 : 0, clientX: x, clientY: y, timeStamp: clock }, extra));
    };
    const wheel = (deltaY, extra = {}) => {
        clock += 4;
        let prevented = false;
        canvas.dispatch({ type: 'wheel', deltaX: 0, deltaY, deltaMode: 0, clientX: 500, clientY: 300, timeStamp: clock, ...extra,
            preventDefault: () => { prevented = true; } });
        return prevented;
    };
    const flush = () => { while (timers.length) timers.shift()(); };
    const saved = () => JSON.parse(storage.get('surface-inputs-dev-files-results-v1') || '[]');
    return { win, element, radios, form, pointer, wheel, flush, saved, tick: ms => { clock += ms; }, now: () => clock };
}

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

test('Files preflight exposes Export when bounded saved results are full', () => {
    const p = page('files-canvas');
    p.win.localStorage.setItem('surface-inputs-dev-files-results-v1', JSON.stringify(Array.from({ length: 50 }, (_, i) => ({id: String(i)}))));
    p.element('files-export').hidden = true;
    p.element('files-button').click();
    assert.match(p.element('status').textContent, /Local results are full/);
    assert.equal(p.element('files-export').hidden, false);
    assert.equal(typeof p.element('files-export').onclick, 'function');
    assert.equal(p.element('files-button').disabled, false);
});

test('rating is retained even when native result handoff is backpressured', () => {
    let room = true;
    const p = page('files-canvas', {SurfaceInputsTransport: {usesNative:()=>true, requireV2(){}, canQueue:()=>room, validate(){}, submitArcadeEvent(){}, retryPending(){}}});
    const button = p.element('files-button'), slot = 600 / 7;
    button.click(); p.wheel(400);
    filesDrag(p, [676, 16 * 40 - 400 + 20], [170, slot * 1.5]);
    button.click(); button.click(); p.wheel(700);
    filesDrag(p, [324, 29 * 40 - 700 + 20], [830, slot * 3.5]);
    button.click(); button.click(); p.wheel(-800);
    filesDrag(p, [676, 2 * 40 - 40 + 20], [170, slot * 6.5]);
    room = false; p.flush();
    p.radios[3].checked = true;
    p.element('completion-comment').value = 'Immutable fixture feedback';
    p.element('completion-save').click();
    const [saved] = p.saved();
    assert.equal(saved.rating_saved, true);
    assert.equal(saved.ease, 4);
    assert.equal(saved.comment, 'Immutable fixture feedback');
    assert.equal(saved.targets.length, 3);
    assert(Object.values(saved.native).every(value => value === 'not_queued'));
    room = true; p.element('completion-retry').click();
    assert.equal(p.saved().length, 1);
});
