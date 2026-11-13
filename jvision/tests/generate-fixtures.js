'use strict';
// Deterministic fixtures emitted by the same production modules used in the tests.
// Run: node surface-inputs/tests/generate-fixtures.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { environment, Element } = require('./harness.js');
function key(type, value, extra = {}) {
    return Object.assign({ type, key: value, code: value, keyCode: 0, ctrlKey: false, shiftKey: false,
        metaKey: false, altKey: false, preventDefault() {} }, extra);
}
async function fixtures() {
    const results = [];
    let caseNumber = 0;
    function setup(kind) {
        const e = environment(kind === 'keyboard' ? '?setting_preset=df' : '');
        e.context.Math = Object.create(Math);
        e.context.Math.random = () => 0.25;
        const id = String(++caseNumber).padStart(12, '0');
        e.win.crypto.randomUUID = () => '00000000-0000-4000-8000-' + id;
        e.load('transport.js');
        if (kind === 'keyboard') { e.load('keyboard-capture.js'); e.load('keyboard/keyboard-layout.js'); }
        else { e.load('metrics.js'); e.load('touchpad-observer.js'); }
        e.ready();
        return e;
    }
    function collect(e, label) {
        let index = 0;
        for (const message of e.port.sent) if (message.type !== 'ready') results.push({ name: label + '_' + (++index), message });
    }
    const keyboard = setup('keyboard'); keyboard.load('keyboard/script.js');
    for (const listener of keyboard.doc.listeners.get('DOMContentLoaded') || []) await listener();
    const input = keyboard.doc.getElementById('input-area'), prompt = keyboard.doc.getElementById('sample-text').innerText;
    input.value = prompt; input.dispatchEvent({ type: 'input', data: prompt, inputType: 'insertText' });
    keyboard.setNow(1100); input.dispatchEvent(key('keydown', 'Enter')); collect(keyboard, 'keyboard');

    const shortcut = setup('keyboard'); shortcut.dataset.value = 'shortcuts';
    shortcut.context.fetch = async () => ({ ok: true, text: async () => 'Ctrl+C Ctrl+V' });
    shortcut.load('keyboard/script.js');
    for (const listener of shortcut.doc.listeners.get('DOMContentLoaded') || []) await listener();
    for (const listener of shortcut.doc.getElementById('start-button').listeners.get('click') || []) await listener();
    shortcut.doc.dispatchEvent(key('keydown', 'c', { ctrlKey: true, code: 'KeyC' }));
    shortcut.doc.dispatchEvent(key('keyup', 'c', { ctrlKey: true, code: 'KeyC' }));
    shortcut.setNow(1100); shortcut.doc.dispatchEvent(key('keydown', 'v', { ctrlKey: true, code: 'KeyV' }));
    collect(shortcut, 'shortcuts');

    const cursor = setup('touchpad');
    const selection = { attr() { return this; }, style() { return this; }, on() { return this; }, append() { return this; },
        selectAll() { return this; }, data() { return this; }, enter() { return this; }, exit() { return this; },
        transition() { return this; }, remove() { return this; }, node() { return new Element('svg'); },
        call(fn, ...args) { fn(this, ...args); return this; } };
    cursor.context.d3 = { select: () => selection, scale: { category10: () => ({}) }, svg: { mouse: () => [0, 0] } };
    cursor.context.EventLogger = new Proxy({}, { get: () => () => {} });
    cursor.load('touchpad/fitts-law.js');
    const fitts = vm.runInContext('fittsTest', cursor.context);
    fitts.mouseMoved(0, 0); vm.runInContext('startExperience()', cursor.context);
    cursor.setNow(1100); fitts.mouseMoved(fitts.target.x / 2, fitts.target.y / 2);
    cursor.setNow(1200); fitts.mouseMoved(fitts.target.x, fitts.target.y);
    fitts.mouseClicked(fitts.target.x, fitts.target.y); collect(cursor, 'targeting');

    const scrolling = setup('touchpad');
    const scroller = scrolling.doc.getElementById('scroll-container'); scroller.scrollTop = 0;
    const highlight = new Element('highlight'); highlight.rect = { top: 200.5, bottom: 220.5 };
    scrolling.elements.set('highlight', highlight);
    scrolling.doc.getElementById('targetbox').rect = { top: 100.25, bottom: 140.25 };
    scrolling.win.SurfaceInputsTouchpad.beginScroll(false);
    scroller.scrollTop = 90; scrolling.setNow(1100); scrolling.win.SurfaceInputsTouchpad.scrollMove();
    scrolling.setNow(1400); scrolling.win.SurfaceInputsTouchpad.finishScroll(); collect(scrolling, 'scrolling');

    const drag = setup('touchpad'), target = new Element('highlight'); target.textContent = 'prescribed phrase';
    drag.elements.set('highlight', target); drag.win.SurfaceInputsTouchpad.beginSelection(false);
    drag.setNow(1500); drag.win.SurfaceInputsTouchpad.finishSelection(); collect(drag, 'selection');

    const zoom = setup('touchpad'); zoom.win.SurfaceInputsTouchpad.beginZoom(1, 1.5, 1.4, 1.6, false);
    zoom.setNow(1700); zoom.win.SurfaceInputsTouchpad.finishZoom(); collect(zoom, 'zoom');

    const feedback = setup('touchpad');
    feedback.win.SurfaceInputsTransport.submitFeedback({ activity_id: 'touchpad_scrolling', scope: 'task', round_id: 'scroll_round_1',
        ratings: { ease: 4, satisfaction: 4, frustration: 2, control: 4, fatigue: 2, accuracy: 5, lag: 3, likelihood: 4 },
        comment: 'The prescribed scroll target was easy to reach.', pain_points: ['overshoot', 'lag'] });
    feedback.win.SurfaceInputsTransport.submitFeedback({ activity_id: 'session', scope: 'session', ratings: {}, comment: 'Freeform session feedback.' });
    collect(feedback, 'feedback');
    return results;
}
if (require.main === module) fixtures().then(result => {
    const destination = path.join(__dirname, 'fixtures', 'native-messages.json');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
    console.log('Generated ' + result.length + ' native messages: ' + destination);
}).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixtures };
