'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Blob = globalThis.Blob || require('node:buffer').Blob;
class EventTarget {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(callback); }
    removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(fn => fn !== callback)); }
    dispatchEvent(event) {
        if (!event.preventDefault) event.preventDefault = () => { event.defaultPrevented = true; };
        if (!event.stopImmediatePropagation) event.stopImmediatePropagation = () => {};
        for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
        return !event.defaultPrevented;
    }
}
class Element extends EventTarget {
    constructor(id = '') {
        super(); this.id = id; this.value = ''; this.style = {}; this.dataset = {}; this.checked = false;
        this.textContent = ''; this.innerText = ''; this.children = []; this.selectionStart = 0; this.selectionEnd = 0;
        this.classList = { add() {}, remove() {} }; this.attributes = {};
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children = this.children.filter(value => value !== child); }
    remove() { this.removed = true; }
    focus() {}
    click() { this.dispatchEvent({ type: 'click' }); }
    closest() { return new Element('group'); }
    getBoundingClientRect() { return this.rect || { left: 0, top: 0, right: 620, bottom: 400, width: 620, height: 400 }; }
}
function environment(search = '') {
    const win = new EventTarget(), doc = new EventTarget(), elements = new Map(), timers = new Map();
    let timerId = 0, now = 1000;
    doc.getElementById = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
    doc.createElement = () => new Element(); doc.body = new Element('body'); doc.head = new Element('head');
    doc.documentElement = new Element('html'); doc.fullscreenElement = null;
    const dataset = new Element('dataset'); dataset.value = 'natural-language'; dataset.checked = true;
    const instructions = new Element('instructions'); instructions.textContent = 'Type the prompt';
    doc.querySelector = query => {
        if (query.includes('input[name="dataset"]:checked')) return dataset;
        if (query.startsWith('input[name="dataset"][value=')) return null;
        if (query === '.instructions') return instructions;
        if (query === '.highlight') return elements.get('highlight') || null;
        if (query === '.container') return new Element('card');
        return new Element('query');
    };
    doc.querySelectorAll = query => query.includes('input[name="dataset"]') ? [dataset] : [];
    class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
    class Event { constructor(type) { this.type = type; } }
    class FakeDate extends Date { static now() { return now; } }
    Object.assign(win, { document: doc, location: { origin: 'https://mztan.github.io', search },
        CustomEvent, Event, crypto: { randomUUID: () => '11111111-2222-3333-4444-555555555555' },
        setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
        requestAnimationFrame() {} });
    win.top = win; win.window = win;
    const requests = [], alerts = [];
    const context = vm.createContext({ window: win, document: doc, navigator: { userAgent: 'Node fake browser', platform: 'test' },
        console: { log() {}, warn() {}, error() {} }, CustomEvent, Event, TextEncoder, URLSearchParams,
        setTimeout: win.setTimeout, clearTimeout: win.clearTimeout, Date: FakeDate,
        Audio: class { play() {} pause() {} },
        FormData: class {}, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, Blob,
        alert: value => alerts.push(value),
        fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, text: async () => 'hello\nworld' }; }
    });
    const load = file => {
        const result = vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
        // In real browsers, Window properties are also global bindings.
        for (const [key, value] of Object.entries(win)) if (key.startsWith('SurfaceInputs')) context[key] = value;
        return result;
    };
    const port = { sent: [], start() {}, postMessage(data) { this.sent.push(JSON.parse(data)); },
        receive(data) { this.onmessage({ data: JSON.stringify(data) }); } };
    function handshake(overrides = {}) {
        win.dispatchEvent(Object.assign({ type: 'message', source: win, isTrusted: true,
            data: JSON.stringify({ type: 'surface_inputs_host', version: 1 }), ports: [port] }, overrides));
    }
    function ready() { handshake(); port.receive({ version: 1, type: 'ready' }); }
    function runTimer(id) { const fn = timers.get(id); timers.delete(id); if (fn) fn(); }
    return { win, doc, elements, dataset, requests, alerts, load, context, port, handshake, ready, timers,
        runTimer, setNow: value => { now = value; } };
}
module.exports = { environment, Element };
