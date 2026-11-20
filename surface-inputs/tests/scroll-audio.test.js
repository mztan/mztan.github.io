'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {environment} = require('./harness.js');
const settle = () => new Promise(resolve => setImmediate(resolve));

function audioEnvironment(options = {}) {
    const e = environment(), contexts = [], sources = [], requests = [], warnings = [];
    let failures = options.fetchFailures || 0;
    class AudioContext {
        constructor() { this.state = 'suspended'; this.destination = {}; this.resumes = 0; this.decodes = 0; contexts.push(this); }
        resume() { this.resumes++; if (options.resumeFailure) return Promise.reject(new Error('Blocked')); this.state = 'running'; return Promise.resolve(); }
        decodeAudioData() { this.decodes++; return options.decoded || Promise.resolve({duration: 0.862}); }
        createBufferSource() {
            const source = {connect() {}, start() {this.started = true;}, disconnect() {this.disconnected = true;}};
            sources.push(source); return source;
        }
    }
    e.win.AudioContext = AudioContext;
    e.context.console.warn = value => warnings.push(value);
    e.win.fetch = async url => {
        requests.push(url);
        if (failures-- > 0) throw new Error('Offline');
        return {ok: true, arrayBuffer: async () => new ArrayBuffer(16)};
    };
    e.load('touchpad/scroll-audio.js');
    return Object.assign(e, {contexts, sources, audioRequests: requests, warnings});
}

test('preloads the original chime once and resumes within Start/Practice user gestures', async () => {
    const e = audioEnvironment();
    await settle();
    assert.equal(e.contexts.length, 1);
    assert.equal(e.contexts[0].resumes, 0, 'preloading must not attempt autoplay');
    assert.equal(e.contexts[0].decodes, 1);
    assert.deepEqual(e.audioRequests, ['audio/chime_1.mp3']);
    for (const type of ['pointerdown', 'keydown', 'click']) e.doc.dispatchEvent({type});
    await settle();
    assert.equal(e.contexts[0].state, 'running');
    assert.equal(e.contexts[0].resumes, 1);
    assert.equal(e.sources.length, 0, 'unlock is silent');
});

test('rapid successes and all six automatic sets reuse the clip but never stop a previous cue', async () => {
    const e = audioEnvironment(); e.load('touchpad/scripts_dc.js');
    vm.runInContext('rng = new RandomGenerator(123)', e.context);
    for (let set = 0; set < 6; set++) {
        vm.runInContext('loadChimes()', e.context);
        for (let target = 0; target < 6; target++) vm.runInContext('playChime(true)', e.context);
    }
    await settle();
    assert.equal(e.sources.length, 36);
    assert(e.sources.every(s => s.started && !s.disconnected));
    assert.equal(e.contexts.length, 1);
    assert.equal(e.contexts[0].decodes, 1);
    assert.equal(e.audioRequests.length, 1);
    assert.equal(vm.runInContext('successChimes.length', e.context), 0, 'Scrolling does not grow HTMLAudio pools');
    for (const source of e.sources) source.onended();
    assert(e.sources.every(s => s.disconnected));
});

test('cue sound selection keeps the original RNG draw and next prescribed-target sequence', async () => {
    const e = audioEnvironment(); e.load('touchpad/scripts_dc.js');
    const actual = vm.runInContext('rng = new RandomGenerator(123); Array.from({length: 36}, () => {playChime(true); return rng.random();})', e.context);
    const expected = vm.runInContext('const reference = new RandomGenerator(123); Array.from({length: 36}, () => {reference.random(); return reference.random();})', e.context);
    assert.deepEqual(actual, expected);
    await settle();
});

test('a later gesture resumes an interrupted context without replacing its decoded audio', async () => {
    const e = audioEnvironment(); e.doc.dispatchEvent({type: 'click'}); await settle();
    e.contexts[0].state = 'interrupted';
    e.doc.dispatchEvent({type: 'pointerdown'}); e.win.SurfaceInputsScrollAudio.play(); await settle();
    assert.equal(e.contexts[0].resumes, 2);
    assert.equal(e.contexts[0].decodes, 1);
    assert.equal(e.sources.length, 1);
});

for (const event of ['dogfood-task-abort', 'pagehide', 'visibilitychange']) {
    test('slow decoding does not replay stale cues after ' + event, async () => {
        let release; const decoded = new Promise(resolve => {release = resolve;});
        const e = audioEnvironment({decoded}); e.win.SurfaceInputsScrollAudio.play();
        if (event === 'visibilitychange') {e.doc.hidden = true; e.doc.dispatchEvent({type: event}); e.doc.hidden = false;}
        else e.win.dispatchEvent({type: event});
        release({duration: 0.862}); await settle();
        assert.equal(e.sources.length, 0);
        e.win.SurfaceInputsScrollAudio.play(); await settle();
        assert.equal(e.sources.length, 1);
    });
}

test('network failures are handled and the next gesture can retry without affecting task code', async () => {
    const e = audioEnvironment({fetchFailures: 1}); await settle();
    assert.equal(e.warnings.length, 1);
    e.doc.dispatchEvent({type: 'click'}); e.win.SurfaceInputsScrollAudio.play(); await settle();
    assert.equal(e.audioRequests.length, 2);
    assert.equal(e.sources.length, 1);
});

test('blocked resume is handled without an unhandled rejection or fake playback', async () => {
    const e = audioEnvironment({resumeFailure: true});
    e.win.SurfaceInputsScrollAudio.unlock(); e.win.SurfaceInputsScrollAudio.play(); await settle();
    assert.equal(e.sources.length, 0);
    assert.equal(e.warnings.length, 2);
});

test('browsers without Web Audio retain the original media path', () => {
    const e = environment(); e.load('touchpad/scroll-audio.js'); e.load('touchpad/scripts_dc.js');
    assert.equal(e.win.SurfaceInputsScrollAudio, undefined);
    vm.runInContext('rng = new RandomGenerator(123); loadChimes(); playChime(true)', e.context);
    assert.equal(vm.runInContext('successChimes.length', e.context), 1);
});

test('only primary Scrolling loads the helper, before its cache-busted producer', () => {
    const root = path.join(__dirname, '..', 'touchpad');
    const html = fs.readFileSync(path.join(root, 'scroll.html'), 'utf8');
    assert(html.includes('scroll-audio.js?v=scroll-audio-1'));
    assert(html.indexOf('scroll-audio.js?') < html.indexOf('scripts_dc.js?'));
    assert(html.includes('scripts_dc.js?v=scroll-audio-1'));
    for (const file of ['index.html', 'uxr/scroll.html']) assert(!fs.readFileSync(path.join(root, file), 'utf8').includes('scroll-audio.js'));
});
