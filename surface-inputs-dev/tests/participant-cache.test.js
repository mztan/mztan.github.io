'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../dogfood-flow.js');
const { environment } = require('./harness.js');

function memory() {
    const data = new Map();
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}
function page(storage, { native = false, env = 'surface-inputs-dev', path = 'index.html', search = '', existing = '', state, storageAccessDenied = false } = {}) {
    const e = environment(search);
    e.win.localStorage = storage;
    e.win.sessionStorage = state || memory();
    const destinations = [];
    e.win.location = { href: `https://mztan.github.io/${env}/${path}${search}`, pathname: `/${env}/${path}`, search, assign: url => destinations.push(url), replace: url => destinations.push(url) };
    e.doc.currentScript = { src: `https://mztan.github.io/${env}/dogfood-flow.js` };
    e.doc.readyState = 'loading';
    e.doc.documentElement.classList.contains = () => false;
    e.win.SurfaceInputsTransport = { usesNative: () => native, pendingCount: () => 0 };
    // Unlike the broad harness, do not invent identity controls absent from this page.
    const actualIds = new Set(path === 'index.html' ? ['unix-name', 'start-dogfooding', 'landing-status'] : ['button-pad-id']);
    const get = e.doc.getElementById;
    e.doc.getElementById = id => actualIds.has(id) ? get(id) : null;
    const input = e.doc.getElementById(path === 'index.html' ? 'unix-name' : 'button-pad-id');
    input.value = existing;
    if (storageAccessDenied) Object.defineProperty(e.win, 'localStorage', { get() { throw Error('blocked'); } });
    let inputEvents = 0;
    input.addEventListener('input', () => inputEvents++);
    const api = flow.create(e.win);
    e.doc.dispatchEvent({ type: 'DOMContentLoaded' });
    return { ...e, input, api, destinations, inputEvents: () => inputEvents };
}

test('entered unixname survives a fresh page and session in browser and APK mode', () => {
    for (const native of [false, true]) {
        const storage = memory();
        const first = page(storage, { native });
        assert.equal(first.input.value, '');
        first.input.value = '  cached-fixture  ';
        first.doc.getElementById('start-dogfooding').click();
        assert.equal(storage.getItem('arcade-participant-v1:surface-inputs-dev'), 'cached-fixture');
        const next = page(storage, { native });
        assert.equal(next.input.value, 'cached-fixture');
        assert.notEqual(next.input.readOnly, true);
        next.doc.getElementById('start-dogfooding').click();
        assert.equal(next.api.getState().participant, 'cached-fixture');
        assert.equal(next.destinations.length, 1);
    }
});

test('direct primary task prefill updates input gates and editable changes replace or clear the cache', () => {
    const storage = memory();
    storage.setItem('arcade-participant-v1:surface-inputs-dev', 'cached-fixture');
    const direct = page(storage, { path: 'touchpad/index.html', native: true });
    assert.equal(direct.input.value, 'cached-fixture');
    assert.equal(direct.inputEvents(), 1);
    direct.input.value = 'replacement-fixture';
    direct.input.dispatchEvent({ type: 'input' });
    assert.equal(page(storage).input.value, 'replacement-fixture');
    direct.input.value = '';
    direct.input.dispatchEvent({ type: 'change' });
    assert.equal(page(storage).input.value, '');
});

test('cache is environment scoped and does not override an explicit field value', () => {
    const storage = memory();
    storage.setItem('arcade-participant-v1:surface-inputs-dev', 'dev-fixture');
    storage.setItem('arcade-participant-v1:surface-inputs', 'prod-fixture');
    assert.equal(page(storage).input.value, 'dev-fixture');
    assert.equal(page(storage, { env: 'surface-inputs' }).input.value, 'prod-fixture');
    assert.equal(page(storage, { existing: 'explicit-fixture' }).input.value, 'explicit-fixture');
});

test('invalid or oversized cache content is never used; invalid edits remove stale identity', () => {
    for (const value of ['bad label', '<script>', 'x'.repeat(65)]) {
        const storage = memory();
        storage.setItem('arcade-participant-v1:surface-inputs-dev', value);
        assert.equal(page(storage).input.value, '');
    }
    const storage = memory();
    const e = page(storage);
    e.input.value = 'bad label';
    e.input.dispatchEvent({ type: 'input' });
    assert.equal(storage.getItem('arcade-participant-v1:surface-inputs-dev'), null);
    e.doc.getElementById('start-dogfooding').click();
    assert.equal(e.destinations.length, 0);
});

test('disabled or quota-limited localStorage never blocks explicitly entered participant or start', () => {
    for (const getterFailure of [false, true]) {
        const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('blocked'); } };
        const e = page(storage, { storageAccessDenied: getterFailure });
        e.input.value = 'explicit-fixture';
        assert.doesNotThrow(() => e.input.dispatchEvent({ type: 'input' }));
        assert.doesNotThrow(() => e.doc.getElementById('start-dogfooding').click());
        assert.equal(e.api.getState().participant, 'explicit-fixture');
        assert.equal(e.destinations.length, 1);
    }
});

test('an in-flight guided run retains its participant rather than adopting another cached label', () => {
    const storage = memory(), state = memory();
    storage.setItem('arcade-participant-v1:surface-inputs-dev', 'new-fixture');
    state.setItem('arcade-dogfood-v3:surface-inputs-dev', JSON.stringify({ version: 3, id: 'df_fixture', stage: 0, participant: 'original-fixture', session: 'fixture', tasks: Array.from({length:5},()=>({sets:0,phase:'idle'})) }));
    const e = page(storage, { path: 'touchpad/index.html', search: '?dogfood=df_fixture', state });
    assert.equal(e.input.value, 'original-fixture');
    assert.equal(e.input.readOnly, true);
    assert.equal(storage.getItem('arcade-participant-v1:surface-inputs-dev'), 'new-fixture');
    assert.equal(e.api.getState().participant, 'original-fixture');
});
