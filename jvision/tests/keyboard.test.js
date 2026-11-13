'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCapture } = require('../keyboard-capture.js');
const { environment } = require('./harness.js');
function event(key, extra = {}) { return Object.assign({ key, keyCode: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() { this.prevented = true; } }, extra); }

test('committed input uses canonical controls without duplicate hardware edits', () => {
    const errors = [], capture = createCapture(value => errors.push(value));
    capture.input('ab'); capture.key(event('Backspace')); capture.input('a');
    capture.key(event('Tab', { shiftKey: true })); capture.key(event('ArrowLeft'));
    capture.key(event('Escape')); capture.key(event('Enter'));
    const complete = capture.complete('a', 'a');
    assert.equal(complete.prompt_text, 'a⏎');
    assert.equal(complete.input_event_stream, 'ab⌫⇤←␛⏎');
    assert.deepEqual(complete.details, { details_version: 1, replay_eligible: false, replay_ineligible: ['control_key', 'cursor_navigation'], final_text: 'a' });
    assert.equal(errors.length, 0);
});

test('nonlinear edits and cursor navigation mark replay eligibility honestly', () => {
    const capture = createCapture(() => {});
    capture.input('teh ');
    capture.programmaticEdit('teh ', 'the ');
    const complete = capture.complete('the ', 'the ');
    assert.equal(complete.details.replay_eligible, false);
    assert.deepEqual(complete.details.replay_ineligible, ['non_terminal_edit']);
    assert.equal(complete.details.final_text, 'the ');
    capture.reset(); capture.input('hello');
    assert.equal(capture.complete('hello', 'hello').details.replay_eligible, true);
});

test('IME commits once and custom/browser autocorrect is represented as committed replacement', () => {
    const capture = createCapture(() => {});
    capture.compositionStart(''); capture.input('n', { isComposing: true }); capture.input('ni', { isComposing: true });
    capture.compositionEnd('你'); capture.input('你');
    assert.equal(capture.stream(), '你');
    capture.reset(); capture.input('😀'); capture.input('😃');
    assert.equal(capture.stream(), '😀⌫😃');
    capture.reset(); capture.input('teh '); capture.programmaticEdit('teh ', 'the ');
    assert.equal(capture.stream(), 'teh ⌫⌫he');
    capture.input('the cat'); assert.equal(capture.stream(), 'teh ⌫⌫hecat');
});

test('bounds are checked before edit/press; noncancelable overflow invalidates honest retry, not truncation', () => {
    const errors = [], capture = createCapture(value => errors.push(value));
    capture.input('x'.repeat(2045));
    const edit = event('', { data: 'x', inputType: 'insertText', cancelable: true });
    assert.equal(capture.beforeInput(edit, 'x'.repeat(2045), 2045, 2045), false); assert.equal(edit.prevented, true);
    assert.equal(capture.stream().length, 2045);
    assert.equal(capture.key(event('Enter')), true);
    assert.equal(new TextEncoder().encode(capture.stream()).length, 2048);
    capture.reset();
    const paste = { clipboardData: { getData: () => 'é'.repeat(1023) }, preventDefault() { this.prevented = true; } };
    assert.equal(capture.paste(paste), false); assert.equal(paste.prevented, true);
    capture.input('x'.repeat(2046)); assert.equal(capture.valid(), false);
    assert.throws(() => capture.complete('hello', 'hello'), /Reset and retry/);
    assert.equal(capture.stream(), ''); assert.match(errors.at(-1), /noncancelable/);
    capture.reset(); capture.input('done'); assert.equal(capture.valid(), true);
    assert.throws(() => capture.complete('x'.repeat(510), 'done'), /512-byte/);
    const bounded = capture.complete('done', 'x'.repeat(512)); assert.deepEqual(bounded.details, { details_version: 1, replay_eligible: true });
});

async function loadKeyboard(native, search = '?setting_preset=df') {
    const e = environment(search);
    e.load('transport.js'); e.load('transport-ui.js'); e.load('keyboard-capture.js');
    e.load('keyboard/keyboard-layout.js'); e.load('keyboard/script.js');
    if (native) e.ready();
    for (const listener of e.doc.listeners.get('DOMContentLoaded') || []) await listener();
    return e;
}
function typePrompt(e) {
    const input = e.doc.getElementById('input-area');
    const prompt = e.doc.getElementById('sample-text').innerText;
    for (let index = 0; index < prompt.length; index++) {
        e.setNow(1000 + index * 10);
        input.dispatchEvent(event(prompt[index], { type: 'keydown' }));
        input.value = prompt.slice(0, index + 1); input.selectionStart = input.selectionEnd = input.value.length;
        input.dispatchEvent({ type: 'input', data: prompt[index], inputType: 'insertText' });
    }
    e.setNow(1100); input.dispatchEvent(event('Enter', { type: 'keydown' }));
    return prompt;
}

test('actual keyboard DF producer retains browser identity + original form, and APK emits complete typed observation only', async () => {
    const browser = await loadKeyboard(false);
    assert.equal(browser.doc.getElementById('input-area').disabled, true);
    browser.doc.getElementById('unix-name').value = 'testuser';
    browser.doc.getElementById('unix-name').dispatchEvent({ type: 'input' });
    const browserPrompt = typePrompt(browser);
    const posts = browser.requests.filter(value => value.options && value.options.method === 'POST');
    assert.equal(posts.length, 1); assert.equal(browser.doc.getElementById('df_result_expected_prompt').value, browserPrompt);
    assert.equal(browser.port.sent.length, 0);

    const native = await loadKeyboard(true);
    assert.equal(native.doc.getElementById('input-area').disabled, false);
    assert.equal(native.doc.getElementById('unix-name').value, '');
    const nativePrompt = typePrompt(native);
    assert.equal(native.requests.filter(value => value.options && value.options.method === 'POST').length, 0);
    const observations = native.port.sent.filter(value => value.type === 'keyboard');
    assert.equal(observations.length, 1);
    assert.equal(observations[0].prompt_text, nativePrompt + '⏎');
    assert.equal(observations[0].input_event_stream, nativePrompt + '⏎');
    assert.equal(observations[0].details.final_text, nativePrompt);
    assert.equal(observations[0].elapsed_ms, 40); // Original first input -> last non-submit key timing.
    assert.equal(native.win.SurfaceInputsTransport.pendingCount(), 1);
    assert.equal(native.doc.getElementById('input-area').value, '');
});

test('actual keyboard prompt begun before port transfer retains committed stream and buffers while connecting', async () => {
    const e = await loadKeyboard(false, '');
    const input = e.doc.getElementById('input-area'), prompt = e.doc.getElementById('sample-text').innerText;
    input.value = prompt; input.dispatchEvent({ type: 'input', data: prompt, inputType: 'insertText' });
    e.handshake(); e.setNow(1010); input.dispatchEvent(event('Enter', { type: 'keydown' }));
    assert.equal(e.win.SurfaceInputsTransport.pendingCount(), 1); assert.equal(e.port.sent.length, 1);
    e.port.receive({ version: 1, type: 'ready' });
    assert.equal(e.port.sent.at(-1).input_event_stream, prompt + '⏎');
});

test('actual shortcut producer works in native WebView without fullscreen API, preserves label stream and separate browser requirement', async () => {
    const e = environment('?setting_preset=df');
    e.dataset.value = 'arrows';
    e.context.fetch = async () => ({ ok: true, text: async () => 'Left Right' });
    e.load('transport.js'); e.load('transport-ui.js'); e.load('keyboard-capture.js');
    e.load('keyboard/keyboard-layout.js'); e.load('keyboard/script.js'); e.ready();
    for (const listener of e.doc.listeners.get('DOMContentLoaded') || []) await listener();
    for (const listener of e.doc.getElementById('start-button').listeners.get('click') || []) await listener();
    e.doc.dispatchEvent(event('ArrowLeft', { type: 'keydown', code: 'ArrowLeft' }));
    e.doc.dispatchEvent(event('ArrowLeft', { type: 'keyup', code: 'ArrowLeft' }));
    e.setNow(1050); e.doc.dispatchEvent(event('ArrowRight', { type: 'keydown', code: 'ArrowRight' }));
    const message = e.port.sent.find(value => value.type === 'keyboard');
    assert.ok(message); assert.equal(message.activity_id, 'keyboard_arrows');
    assert.equal(message.prompt_text, 'Left Right'); assert.equal(message.input_event_stream, 'Left Right');
    assert.equal(message.details.stream_format, 'keychord_labels_v1'); assert.equal(message.elapsed_ms, 50);
});
