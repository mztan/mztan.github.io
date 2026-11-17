'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { mainPageUrl, mount, scrollPlacement } = require('../task-navigation.js');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');

function page() {
    const events = new Map(), windowEvents = new Map();
    class Element {
        constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attrs = {}; }
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
        removeAttribute(key) { delete this.attrs[key]; }
        setAttribute(key, value) { this.attrs[key] = value; }
        addEventListener() {}
        closest(selector) { return this.tagName === 'a' && selector === 'a[href]' ? this : this.parentNode && this.parentNode.closest(selector); }
        remove() { this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
    }
    const head = new Element('head'), body = new Element('body');
    const find = (node, id) => node.id === id ? node : node.children.map(child => find(child, id)).find(Boolean);
    const doc = {
        head, body, readyState: 'loading', currentScript: { src: 'https://mztan.github.io/surface-inputs-dev/task-navigation.js?v=home-1' },
        createElement: tag => new Element(tag),
        getElementById: id => find(head, id) || find(body, id) || null,
        addEventListener: (type, listener) => events.set(type, listener)
    };
    class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
    const win = {
        document: doc, location: { href: 'https://mztan.github.io/surface-inputs-dev/touchpad/index.html' },
        addEventListener: (type, listener) => windowEvents.set(type, listener),
        dispatchEvent: event => { if (windowEvents.has(event.type)) windowEvents.get(event.type)(event); },
        CustomEvent
    };
    return { win, doc, events, windowEvents, CustomEvent };
}

test('every tracked dev HTML subpage links the shared Home script in its own environment', () => {
    const pages = execFileSync('git', ['ls-files', 'surface-inputs-dev'], { cwd: repo, encoding: 'utf8' })
        .trim().split('\n').filter(file => file.endsWith('.html') && file !== 'surface-inputs-dev/index.html' && file !== 'surface-inputs-dev/thanks.html');
    assert.equal(pages.length, 13);
    const thanks=fs.readFileSync(path.join(root,'thanks.html'),'utf8');
    assert.match(thanks,/<a href="index.html">Return to main page<\/a>/);
    for (const file of pages) {
        const html = fs.readFileSync(path.join(repo, file), 'utf8');
        const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
        const nav = scripts.find(src => src.includes('task-navigation.js'));
        assert.ok(nav, file);
        const pageUrl = 'https://mztan.github.io/' + file;
        const scriptUrl = new URL(nav, pageUrl).href;
        assert.equal(mainPageUrl(scriptUrl, pageUrl), 'https://mztan.github.io/surface-inputs-dev/index.html');
        assert.ok(scripts.some(src => src.split(/[?#]/)[0].endsWith('/transport.js')), file);
        assert.ok(scripts.some(src => src.endsWith('/transport-ui.js')), file);
        assert.ok(fs.existsSync(path.resolve(path.dirname(path.join(repo, file)), nav.split('?')[0])), file);
    }
});

test('shared Home URL remains environment-local if later promoted', () => {
    for (const environment of ['surface-inputs-dev', 'surface-inputs']) {
        assert.equal(mainPageUrl('https://mztan.github.io/' + environment + '/task-navigation.js?v=home-1',
            'https://mztan.github.io/' + environment + '/keyboard/'), 'https://mztan.github.io/' + environment + '/index.html');
    }
});

test('Home mounts outside forms once with accessible semantics and no page reflow', () => {
    const e = page();
    mount(e.win, e.doc.currentScript.src); mount(e.win, e.doc.currentScript.src);
    const nav = e.doc.getElementById('arcade-task-navigation');
    assert.equal(e.doc.body.children.length, 1);
    assert.equal(nav.tagName, 'nav');
    assert.equal(nav.attrs['aria-label'], 'Page navigation');
    assert.equal(nav.children[0].textContent, '← Home');
    assert.equal(nav.children[0].href, 'https://mztan.github.io/surface-inputs-dev/index.html');
    const css = e.doc.getElementById('arcade-task-navigation-style').textContent;
    assert.match(css, /position:fixed;left:12px;bottom:12px/);
    assert.match(css, /min-height:44px/);
    assert.match(css, /focus-visible/);
});

test('parser initialization waits for DOM while preserving its script URL', () => {
    const e = page();
    vm.runInNewContext(fs.readFileSync(path.join(root, 'task-navigation.js'), 'utf8'), { window: e.win, URL });
    assert.equal(e.doc.body.children.length, 0);
    e.doc.currentScript = null;
    e.events.get('DOMContentLoaded')();
    assert.equal(e.doc.body.children[0].children[0].href, 'https://mztan.github.io/surface-inputs-dev/index.html');
});

test('existing native pending-observation guard blocks Home until acknowledgement', () => {
    const e = page(); let pending = 1;
    mount(e.win, e.doc.currentScript.src);
    e.win.SurfaceInputsTransport = { isNative: () => false, pendingCount: () => pending };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'transport-ui.js'), 'utf8'), { window: e.win, CustomEvent: e.CustomEvent });
    const click = () => ({ target: e.doc.body.children[0].children[0], prevented: false,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} });
    const blocked = click(); e.events.get('click')(blocked);
    assert.equal(blocked.prevented, true);
    pending = 0;
    const allowed = click(); e.events.get('click')(allowed);
    assert.equal(allowed.prevented, false);
});

test('scroll Home fits a wide gutter or tall footer and never covers the active pane', () => {
    const pane = { left: 66, right: 766, top: 0, bottom: 588 };
    const link = { left: 12, right: 95.53, top: 486, bottom: 530 };
    assert.deepEqual(scrollPlacement(pane, link, 542), { layout: 'compact' });
    assert.deepEqual(scrollPlacement({ left: 0, right: 390, top: 128, bottom: 716 },
        { left: 12, right: 95.53, top: 788, bottom: 832 }, 844), { layout: 'fixed' });
});

test('a short gutterless scroll page gets a reachable footer without moving its pane', () => {
    const link = { left: 12, right: 95.53, top: 344, bottom: 388 };
    assert.deepEqual(scrollPlacement({ left: 0, right: 620, top: 0, bottom: 588 }, link, 400),
        { layout: 'footer', top: 604 });
    assert.deepEqual(scrollPlacement({ left: 0, right: 620, top: -200, bottom: 388 }, link, 400, 200),
        { layout: 'footer', top: 604 });
});

test('main keyboard navigation is after the app in flow, not over dataset controls', () => {
    const e = page();
    e.win.location.href = 'https://mztan.github.io/surface-inputs-dev/keyboard/';
    e.doc.querySelector = selector => selector === '.app-wrapper' ? {} : null;
    mount(e.win, e.doc.currentScript.src);
    assert.equal(e.doc.getElementById('arcade-task-navigation').attrs['data-layout'], 'flow');
});

test('actual scrolling visibility stage updates Home on start and return', () => {
    const e = page(), originalGet = e.doc.getElementById, stage = {};
    let visible = false; const observers = [];
    const pane = { getBoundingClientRect: () => visible
        ? { left: 66, right: 766, top: 0, bottom: 588, width: 700, height: 588 }
        : { width: 0, height: 0 } };
    e.doc.getElementById = id => id === 'scroll-body' ? stage : id === 'scroll-container' ? pane : originalGet(id);
    e.win.innerHeight = 542;
    e.win.MutationObserver = class {
        constructor(callback) { this.callback = callback; }
        observe(target, options) { observers.push({ target, options, callback: this.callback }); }
    };
    mount(e.win, e.doc.currentScript.src);
    const nav = e.doc.getElementById('arcade-task-navigation');
    nav.getBoundingClientRect = () => ({ left: 12, right: 95.53, top: 486, bottom: 530 });
    assert.equal(observers[0].target, stage);
    assert.match(fs.readFileSync(path.join(root, 'touchpad/scroll.html'), 'utf8'), /id="scroll-body"/);
    visible = true; observers[0].callback();
    assert.equal(nav.attrs['data-layout'], 'compact');
    assert.equal(nav.children[0].textContent, '←');
    visible = false; observers[0].callback();
    assert.equal(nav.attrs['data-layout'], undefined);
    assert.equal(nav.children[0].textContent, '← Home');
});

test('targeting result card is hidden without altering task calculations or collection', () => {
    const css = fs.readFileSync(path.join(root, 'touchpad/arcade-targeting.css'), 'utf8');
    assert.match(css, /\.arcade-targeting-page \.arcade-history\s*\{\s*display:\s*none/);
    assert.match(fs.readFileSync(path.join(root, 'touchpad/index.html'), 'utf8'), /<body class="arcade-targeting-page">/);
    for (const file of ['touchpad/event-logger.js', 'transport-ui.js']) {
        assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), fs.readFileSync(path.join(repo, 'surface-inputs', file), 'utf8'), file);
    }
});
