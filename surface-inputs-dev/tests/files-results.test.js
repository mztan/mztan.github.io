'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const original = require('../../jvision/path-tasks.js');
const imported = require('../path-tasks.js');
const results = require('../path-results.js');
const {environment} = require('./harness.js');

function completed(Model = imported.FileDragTrials) {
    const state = new Model(); state.geometry(1000, 420, 1, 8);
    for (let i = 0; i < 3; i++) {
        const at = i * 10000; state.begin(at);
        const desired = state.spec.fileIndex * state.rowHeight - state.listRect.height / 2;
        state.scroll(Math.min(Math.max(desired, 0), state.maxOffset) - state.offset, at + 10);
        const x = state.listRect.centerX, y = state.spec.fileIndex * state.rowHeight - state.offset + state.rowHeight / 2;
        const folder = state.folderRects[state.spec.folderIndex];
        state.pressAt(x, y, at + 100, true);
        state.move(folder.centerX, folder.centerY, at + 110);
        state.release(folder.centerX, folder.centerY, at + 130);
        state.next();
    }
    return state.targetResults(30000);
}
function setup(mode = 'browser') {
    const e = environment(); const memory = new Map();
    e.win.localStorage = {getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key)};
    e.port.capabilityBehavior = mode;
    e.load('transport.js');
    if (mode !== 'browser') e.ready();
    const api = results.create(require('./files-form-fixture.js').attach(e.win, e.requests));
    return {...e, api, memory};
}

test('Files-only extraction keeps exact authored conditions, model and all original measurements', () => {
    assert.deepEqual(completed(), completed(original.FileDragTrials));
    assert.deepEqual(imported.FILE_DRAG_SPECS, original.FILE_DRAG_SPECS);
    const source = fs.readFileSync(path.join(__dirname, '../../jvision/path-tasks.js'), 'utf8');
    const copy = fs.readFileSync(path.join(__dirname, '../path-tasks.js'), 'utf8');
    const start = '    /* File drag and drop:';
    const segment = source.slice(source.indexOf(start), source.indexOf('    /* Storefront purchase selection:'));
    assert(copy.includes(segment));
    assert.equal(Object.keys(imported).length, 4);
    assert(!('CircleTrials' in imported));
});

test('browser completion and feedback retain one immutable local result alongside Form delivery', () => {
    const e = setup(); e.api.canBegin('fixture-participant'); const rows = completed();
    const run = e.api.complete('stp_file_drag', rows); rows[0] = null;
    assert.equal(e.api.list().length, 1);
    assert.equal(run.native_required, false);
    e.api.complete('stp_file_drag', completed());
    e.api.rate(4, 'Fixture rating'); e.api.rate(1, 'Must not replace first feedback');
    assert.equal(e.api.list().length, 1);
    assert.equal(e.api.current().ease, 4);
    assert.equal(e.api.current().comment, 'Fixture rating');
    assert.equal(e.requests.length, 0); assert.equal(e.port.sent.length, 0);
    assert.equal(e.api.current().targets.length, 3);
});

test('native new task requires explicitly negotiated v2; legacy and connecting do not start', () => {
    const legacy = setup('legacy'); assert.throws(() => legacy.api.canBegin('fixture-participant'), /requires v2/);
    const e = setup(); e.handshake(); assert.throws(() => e.api.canBegin('fixture-participant'), /requires v2/);
    assert.equal(legacy.api.list().length, 0); assert.equal(e.api.list().length, 0);
    assert.equal(legacy.port.sent.length, 1); // ready control only, never a Files observation
});

test('late native binding cannot relabel earlier browser target measurements', () => {
    const e = setup(); e.api.canBegin('fixture-participant');
    e.port.capabilityBehavior = 'v2'; e.ready();
    assert(e.api.interruptedByNativeMode());
    assert.throws(() => e.api.canBegin('fixture-participant'), /Delivery mode changed/);
    e.api.complete('stp_file_drag', completed());
    assert.equal(e.api.current().native_required, false);
    assert.equal(e.port.sent.filter(message => message.type === 'arcade').length, 0);
});

test('native v2 sends unchanged bounded per-target JSON and independent skipped-rating feedback', () => {
    const e = setup('v2'); e.api.canBegin('fixture-participant'); const rows = completed();
    const run = e.api.complete('stp_file_drag', rows);
    const messages = e.port.sent.filter(message => message.type === 'arcade');
    assert.equal(messages.length, 3);
    messages.forEach((m, i) => {
        assert.equal(m.version, 2); assert.equal(m.task_id, 'stp_file_drag');
        assert.equal(m.event_name, 'uxr_result'); assert.equal(m.task_context_id, run.id);
        assert(Buffer.byteLength(m.details) <= 2048);
        assert.deepEqual(JSON.parse(m.details), {details_version: 1, target: rows[i]});
        e.port.receive({version: 2, id: m.id, status: 'accepted'});
    });
    assert(Object.values(e.api.current().native).every(status => status === 'accepted'));
    e.api.rate(null, '');
    const feedback = e.port.sent.filter(message => message.type === 'arcade').at(-1);
    assert.equal(feedback.event_name, 'feedback_submitted');
    assert.deepEqual(JSON.parse(feedback.details), {details_version: 1, ratings: {}, rating_skipped: true, comment: ''});
    assert.equal(e.api.list().length, 1);
    assert.equal(e.requests.length, 0);
});

test('rejected native observation retries the original id and exact bytes; local feedback cannot mutate', () => {
    const e = setup('v2'); e.api.canBegin('fixture-participant'); e.api.complete('stp_file_drag', completed());
    const first = e.port.sent.find(message => message.type === 'arcade');
    e.port.receive({version: 2, id: first.id, status: 'rejected', reason: 'fixture rejection'});
    assert.equal(e.api.current().native[first.id], 'rejected');
    e.api.retry();
    assert.deepEqual(e.port.sent.filter(message => message.id === first.id).at(-1), first);
    e.api.rate(4, 'First'); e.api.rate(1, 'Second');
    assert.equal(e.api.current().comment, 'First');
});

test('reloaded local receipts never automatically repost uncertain or accepted native observations', () => {
    const e = setup('v2'); e.api.canBegin('fixture-participant'); e.api.complete('stp_file_drag', completed());
    const first = e.port.sent.find(message => message.type === 'arcade');
    e.port.receive({version: 2, id: first.id, status: 'accepted'});
    const count = e.port.sent.length;
    e.win.SurfaceInputsFilesForms = require('../files-forms.js');
    const reloaded = results.create(e.win);
    assert.equal(reloaded.current(), null); assert.equal(reloaded.list().length, 1);
    assert.equal(e.port.sent.length, count);
    assert.throws(() => reloaded.retry(), /No Files result/);
});

test('storage unavailable/full and SDK backpressure fail before measurements or retain completion', () => {
    const e = setup(); e.win.localStorage.setItem = () => {throw Error('fixture storage failure');};
    assert.throws(() => e.api.canBegin('fixture-participant'), /storage failure/);
    const full = setup(); full.memory.set(results.storageKey, JSON.stringify(Array.from({length: 50}, (_, i) => ({id: String(i)}))));
    assert.throws(() => full.api.canBegin('fixture-participant'), /Local results are full/);
    const native = setup('v2'); native.api.canBegin('fixture-participant');
    native.win.SurfaceInputsTransport.canQueue = () => false;
    assert.throws(() => native.api.complete('stp_file_drag', completed()), /queue is full/);
    assert.equal(native.api.list().length, 1);
    assert(native.api.current().targets.every(row => row.status === 'completed'));
    assert.equal(native.port.sent.filter(message => message.type === 'arcade').length, 0);
});

test('rating bytes are bounded without truncation or replacing prior local result', () => {
    const e = setup(); e.api.canBegin('fixture-participant'); e.api.complete('stp_file_drag', completed());
    assert.throws(() => e.api.rate(4, '🙂'.repeat(1024)), /details|UTF|long/);
    assert.equal(e.api.current().rating_saved, false);
    assert.equal(e.api.list().length, 1);
});

test('Files entry references only DEV assets and preserves imported canvas styles', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'touchpad/files.html'), 'utf8');
    assert(!html.includes('jvision/')); assert(!html.includes('formResponse'));
    assert(html.includes('sent to the configured Google Form'));
    for (const reference of ['../transport.js?v=stable-sdk-2', '../transport-ui.js?v=dual-forms-6', '../path-tasks.js?v=dev-files-1', '../path-results.js?v=menu-1', '../files-forms.js?v=menu-1', '../files-forms-config.js?v=menu-1', 'files-task.js?v=five-stage-1', 'path-tasks.css?v=dev-files-1']) assert(html.includes(reference));
    const css = fs.readFileSync(path.join(root, 'touchpad/path-tasks.css'), 'utf8');
    const originalCss = fs.readFileSync(path.join(root, '../jvision/touchpad/path-tasks.css'), 'utf8');
    assert.equal(css.slice(css.indexOf(':root'), css.indexOf('/* Photo crop task */') < 0 ? css.indexOf('#files-participant-group {') : undefined), originalCss.slice(originalCss.indexOf(':root'), originalCss.indexOf('/* Photo crop task */')));
});
