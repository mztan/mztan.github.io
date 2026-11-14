'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { environment } = require('./harness.js');
const root = path.join(__dirname, '..');

test('full original public keyboard prompts/dictionaries are byte-preserved', () => {
    const files = [
        'keyboard/exec_demo/common_words.txt', 'keyboard/exec_demo/comprehensive_dictionary.txt',
        'keyboard/exec_demo/conversational_easy.txt', 'keyboard/exec_demo/document_editor/common_words.txt',
        'keyboard/exec_demo/extra_hard_prompts.txt', 'keyboard/exec_demo/hard_prompts.txt',
        'keyboard/exec_demo/hybrid_dictionary.txt', 'keyboard/exec_demo/prompts.txt', 'keyboard/exec_demo/word_frequencies.json',
        'keyboard/prompts/arrows.txt', 'keyboard/prompts/emails.txt', 'keyboard/prompts/emails_passwords.txt',
        'keyboard/prompts/metal_keys.txt', 'keyboard/prompts/nat_lang_no_punc.txt',
        'keyboard/prompts/nat_lang_with_cap_punc.txt', 'keyboard/prompts/passwords.txt',
        'keyboard/prompts/practice.txt', 'keyboard/prompts/shortcuts.txt'
    ];
    const hash = crypto.createHash('sha256');
    for (const file of files) { hash.update('surface-inputs/' + file + '\0'); hash.update(fs.readFileSync(path.join(root, file))); hash.update('\0'); }
    assert.equal(hash.digest('hex'), '6ef15118c758b9b3c431ba6911625ae80d29c4a306c0cbf00a87ae090633e9d8');
});

test('root and UXR full scrolling/selection prose corpora are preserved', () => {
    const hash = crypto.createHash('sha256');
    for (const file of ['touchpad/scroll.html', 'touchpad/textselection.html', 'touchpad/uxr/scroll.html', 'touchpad/uxr/textselection.html']) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        const corpus = html.match(/<p class="(?:scroll|selection)-text">[\s\S]*?<\/p>/g);
        assert.ok(corpus.length);
        hash.update('surface-inputs/' + file + '\0' + corpus.join('\n') + '\0');
    }
    assert.equal(hash.digest('hex'), 'db0b8fd1276a6ce36bdcb963467dcdf1d47a6511d77cc1c956b5ab2e873449b1');
});

test('all supported entry pages load shared transport before producers with valid relative assets', () => {
    const files = ['keyboard/index.html', 'touchpad/index.html', 'touchpad/scroll.html', 'touchpad/textselection.html', 'touchpad/zoom.html',
        'touchpad/uxr/index.html', 'touchpad/uxr/scroll.html', 'touchpad/uxr/textselection.html', 'touchpad/uxr/zoom.html'];
    for (const file of files) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(value => value[1]);
        const transportIndex = scripts.findIndex(value => value.endsWith('/transport.js'));
        assert.ok(transportIndex >= 0, file);
        const producerIndex = scripts.findIndex(value => /^(?:script|scripts_dc|fitts-law)\.js$/.test(value));
        assert.ok(producerIndex > transportIndex, file);
        for (const script of scripts) assert.equal(fs.existsSync(path.join(root, path.dirname(file), script)), true, file + ':' + script);
    }
});

test('launcher negotiates the APK ready handshake without changing browser links', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(value => value[1]);
    assert.ok(scripts.includes('../environment.js'));
    const transportScripts = scripts.filter(script => script !== '../environment.js');
    assert.deepEqual(transportScripts, ['transport.js', 'transport-ui.js']);
    const e = environment();
    transportScripts.forEach(script => e.load(script));
    assert.equal(e.win.SurfaceInputsTransport.getMode(), 'browser');
    e.handshake();
    assert.deepEqual(e.port.sent[0], { version: 1, type: 'ready' });
    e.port.receive({ version: 1, type: 'ready' });
    assert.equal(e.win.SurfaceInputsTransport.isNative(), true);
    assert.equal(e.requests.length, 0);
    const links = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(value => value[1]);
    assert.deepEqual(links, [
        'touchpad/index.html?session_id=df_202611',
        'touchpad/scroll.html?session_id=df_202611',
        'keyboard/?setting_preset=df&amp;num_prompts=3&amp;session_id=df_202611',
        'touchpad/menu.html',
        'touchpad/circle.html',
        'touchpad/files.html'
    ]);
});

test('identity hiding is only installed after real private port ready reply, not URL or untrusted dispatch', () => {
    const e = environment('?native=true&setting_preset=df');
    const get = e.doc.getElementById, append = e.doc.head.appendChild;
    e.doc.getElementById = id => id.startsWith('si-') ? e.elements.get(id) || null : get(id);
    e.doc.head.appendChild = child => { e.elements.set(child.id, child); return append.call(e.doc.head, child); };
    e.load('transport.js'); e.load('transport-ui.js');
    assert.equal(e.elements.has('si-native-style'), false);
    e.handshake({ isTrusted: false }); assert.equal(e.elements.has('si-native-style'), false);
    e.handshake(); assert.equal(e.elements.has('si-native-style'), false);
    e.port.receive({ version: 1, type: 'ready' });
    assert.match(e.elements.get('si-native-style').textContent, /#unix-name-group/);
    assert.match(e.elements.get('si-native-style').textContent, /#button-pad-id/);
});
