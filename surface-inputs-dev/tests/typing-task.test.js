'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../keyboard/typing-task.js');
const root = path.join(__dirname, '..');
const location = {pathname: '/surface-inputs-dev/keyboard/index.html', search: '?task=hunt-and-peck&num_prompts=1&dataset=passwords&setting_preset=qa'};

test('one DEV hunt-and-peck profile covers index or middle fingers and locks ten punctuation prompts', () => {
    const profile = api.profile(location);
    assert.equal(profile.id, 'keyboard_hunt_and_peck');
    assert.equal(profile.promptCount, 10);
    assert.equal(profile.dataset, 'natural-language-punct');
    assert.deepEqual(profile.parameters, {setting_preset: 'df', num_prompts: '10', dataset: 'natural-language-punct'});
    assert.deepEqual(profile.prescription.prescribed_fingers, ['index', 'middle']);
    assert.equal(profile.instructions, 'Use only your index or middle fingers to type. Press Enter after each prompt.');
    assert(Object.isFrozen(profile));
});

test('ordinary typing, production and jvision are not converted to hunt-and-peck', () => {
    for (const pathname of ['/surface-inputs/keyboard/index.html', '/jvision/keyboard/index.html']) assert.equal(api.profile({...location, pathname}), null);
    assert.equal(api.profile({...location, search: ''}), null);
});

test('profile applies before the shared engine, keeps editable participant identity and hides only task settings', () => {
    const controls = new Map(['natural-language-punct', 'physical-keyboard', 'prompt-count'].map(id => [id, {}]));
    const heading = {}, instruction = {before() {}}, settings = {querySelectorAll: () => [{}, {}]};
    const identity = {id: 'unix-name-group', querySelectorAll: () => {throw new Error('Identity must stay editable');}};
    let className;
    const created = [];
    const doc = {body: {classList: {add: name => {className = name;}}},
        createElement: tag => {created.push(tag); return {append() {}};},
        querySelector: selector => selector === 'h1' ? heading : instruction,
        getElementById: id => controls.get(id), querySelectorAll: () => [identity, settings]};
    api.apply(doc, api.profile(location));
    assert.equal(heading.textContent, 'Hunt-and-peck typing');
    assert.equal(instruction.textContent, api.profile(location).instructions);
    assert.equal(controls.get('natural-language-punct').checked, true);
    assert.equal(controls.get('prompt-count').value, 10);
    assert.equal(settings.hidden, true);
    assert.equal(identity.hidden, undefined);
    assert.equal(className, 'typing-task-preset');
    assert(!created.includes('figcaption'));
});

test('DEV page loads the preset before its engine and keeps the original capture/metrics implementation', () => {
    const html = fs.readFileSync(path.join(root, 'keyboard/index.html'), 'utf8');
    const engine = fs.readFileSync(path.join(root, 'keyboard/script.js'), 'utf8');
    assert(html.indexOf('typing-task.js?v=hunt-peck-copy-4') < html.indexOf('script.js?v=five-stage-1'));
    assert(html.indexOf('hunt-peck-forms.js?v=five-stage-1') < html.indexOf('script.js?v=five-stage-1'));
    assert(engine.includes('if (taskProfile) transport.requireV2();'));
    assert(engine.includes("transport.getCapabilityState() !== 'v2'"));
    assert(engine.includes('if (taskProfile) newCount = taskProfile.promptCount;'));
    assert(engine.includes('if (taskProfile) return datasetConfig[taskProfile.dataset].file;'));
    assert(engine.includes('task_profile:taskProfile.id,prescription:taskProfile.prescription'));
    assert(engine.includes('transport.submitKeyboardWithResult(pendingNativeCompletion.keyboard,pendingNativeCompletion.arcade)'));
    assert(engine.includes("file: 'prompts/nat_lang_with_cap_punc.txt'"));
});

test('H&P is fourth in the five-task DEV flow, not an extra landing task', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const flow = fs.readFileSync(path.join(root, 'dogfood-flow.js'), 'utf8');
    assert.equal((html.match(/href="keyboard\/index\.html\?task=hunt-and-peck"/g) || []).length, 0);
    assert(html.includes('id="start-dogfooding"'));
    assert(flow.includes("const TASKS=['targeting','scrolling','typing','hunt_peck','menu']"));
    assert(flow.includes("task==='typing'?'20':'10'"));
});
