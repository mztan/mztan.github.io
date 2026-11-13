'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { environmentForPath, applyEnvironment } = require('../environment.js');

function page(pathname) {
    const elements = new Map();
    const listeners = new Map();
    const document = {
        title: 'Surface Inputs Arcade', readyState: 'loading',
        body: { appendChild(element) { elements.set(element.id, element); } },
        getElementById(id) { return elements.get(id) || null; },
        createElement() { return { style: {}, setAttribute(key, value) { this[key] = value; } }; },
        addEventListener(type, callback) { listeners.set(type, callback); }
    };
    return { window: { document, location: { pathname } }, elements, listeners };
}

test('only the exact first path segment selects dev', () => {
    for (const value of ['/surface-inputs-dev/', '/surface-inputs-dev/index.html', '/surface-inputs-dev/keyboard/', '/surface-inputs-dev']) {
        assert.equal(environmentForPath(value), 'development');
    }
    for (const value of ['/', '/surface-inputs/', '/surface-inputs/keyboard/', '/surface-inputs-dev-other/', '/other/surface-inputs-dev/', undefined]) {
        assert.equal(environmentForPath(value), 'production');
    }
});

test('dev adds one noninteractive bottom pill and production never adds it', () => {
    const dev = page('/surface-inputs-dev/');
    assert.equal(applyEnvironment(dev.window), true);
    const badge = dev.elements.get('environment-badge');
    assert.equal(badge.textContent, 'DEV');
    assert.equal(badge.hidden, false);
    assert.match(badge.style.cssText, /position:fixed.*bottom:12px/);
    assert.match(badge.style.cssText, /border-radius:999px/);
    assert.match(badge.style.cssText, /pointer-events:none/);
    applyEnvironment(dev.window);
    assert.equal(dev.elements.size, 1);
    assert.equal(dev.window.document.title, 'Surface Inputs Arcade · Development');
    const prod = page('/surface-inputs/');
    assert.equal(applyEnvironment(prod.window), false);
    assert.equal(prod.elements.size, 0);
    assert.equal(prod.window.document.title, 'Surface Inputs Arcade');
    dev.window.location.pathname = '/surface-inputs/';
    applyEnvironment(dev.window);
    assert.equal(badge.hidden, true);
    assert.equal(dev.window.document.title, 'Surface Inputs Arcade');
});

test('runtime waits for DOM and exposes informational URL-derived identity', () => {
    const dev = page('/surface-inputs-dev/');
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../environment.js'), 'utf8'), { window: dev.window });
    assert.equal(dev.window.SurfaceInputsEnvironment.isDevelopment, true);
    assert.equal(dev.elements.size, 0);
    dev.listeners.get('DOMContentLoaded')();
    assert.equal(dev.elements.get('environment-badge').textContent, 'DEV');
});

test('refreshing dev wires runtime and retains passing copied transport tests', () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-inputs-env-test-'));
    try {
        fs.mkdirSync(path.join(scratch, 'scripts'));
        fs.copyFileSync(path.join(__dirname, 'sync-dev.py'), path.join(scratch, 'scripts/sync-dev.py'));
        fs.copyFileSync(path.join(__dirname, '../environment.js'), path.join(scratch, 'environment.js'));
        fs.cpSync(path.join(__dirname, '../surface-inputs'), path.join(scratch, 'surface-inputs'), { recursive: true });
        execFileSync('python3', ['scripts/sync-dev.py'], { cwd: scratch });
        const html = fs.readFileSync(path.join(scratch, 'surface-inputs-dev/index.html'), 'utf8');
        assert.ok(html.includes('../environment.js'));
        assert.ok(!html.includes('DEVELOPMENT'));
        execFileSync(process.execPath, ['surface-inputs-dev/tests/regression.test.js'], { cwd: scratch });
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
});

test('sync helper wires runtime without generating a static environment marker', () => {
    const source = fs.readFileSync(path.join(__dirname, 'sync-dev.py'), 'utf8');
    assert.ok(source.includes('../environment.js'));
    assert.ok(!source.includes('development-label'));
    assert.ok(!source.includes('DEVELOPMENT'));
    const html = fs.readFileSync(path.join(__dirname, '../surface-inputs-dev/index.html'), 'utf8');
    assert.ok(html.includes('<script src="../environment.js" defer></script>'));
    assert.ok(!html.includes('development-label'));
    assert.ok(!html.includes('environment-badge'));
    assert.ok(!html.includes('DEVELOPMENT'));
});
