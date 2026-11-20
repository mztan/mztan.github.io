'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const forms = require('../files-forms.js');
const registry = require('../files-forms-config.js');
const {environment} = require('./harness.js');
const {attach} = require('./files-form-fixture.js');

function browser() {
    const e = environment();
    const storage = new Map();
    e.win.localStorage = {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)};
    attach(e.win, e.requests);
    return e;
}

test('each task selects its own published Form and retains both results and rating in that Form', async () => {
    const e = browser();
    const destinations = [];
    for (const task of ['keyboard_hunt_and_peck', 'stp_file_drag']) {
        const uploader = forms.create(e.win, registry, {task_id: task});
        const config = registry.forms[task];
        forms.validateConfig(config);
        uploader.canBegin('fixture_web_label');
        const result = uploader.stageSubmission({id:task+'_result', block:task+'_context', participant_label:'fixture_web_label', submission_type:'result', results:{details_version:1, measurement:42}});
        const feedback = uploader.stageSubmission({id:task+'_feedback', block:task+'_context', participant_label:'fixture_web_label', submission_type:'feedback', ease:4, comment:'Task-specific test feedback'});
        await uploader.send(result);
        await uploader.send(feedback);
        const requests = e.requests.slice(-2);
        assert(requests.every(request => request.url === config.endpoint));
        assert.equal(requests[0].options.body.get(config.fields.task_id), task);
        assert.equal(requests[0].options.body.get(config.fields.submission_type), 'result');
        assert.equal(requests[1].options.body.get(config.fields.submission_type), 'feedback');
        assert.equal(requests[1].options.body.get(config.fields.ease), '4');
        assert.equal(requests[1].options.body.get(config.fields.comment), 'Task-specific test feedback');
        destinations.push(config.endpoint);
    }
    assert.notEqual(destinations[0], destinations[1]);
    assert(!destinations.some(url => url.includes('1FAIpQLSeNlypYPLoAPt_aVLL060oONKpMMdyryJb8VhVfuJSklrsKhQ')));
});

test('a missing or disabled task config never falls back to the other task Form', () => {
    const e = browser();
    assert.throws(() => forms.create(e.win, {version:1, forms:{stp_file_drag:registry.forms.stp_file_drag}}, {task_id:'keyboard_hunt_and_peck'}).canBegin('fixture_web_label'), /not configured/);
    const disabled = {version:1, forms:{...registry.forms, keyboard_hunt_and_peck:{...registry.forms.keyboard_hunt_and_peck, enabled:false}}};
    assert.throws(() => forms.create(e.win, disabled, {task_id:'keyboard_hunt_and_peck'}).canBegin('fixture_web_label'), /not configured/);
    assert.equal(e.requests.length, 0);
});

test('historical submissions keep their original destination and are not redirected to a new Form', async () => {
    const e = browser();
    const original = {...registry.forms.stp_file_drag, endpoint:'https://docs.google.com/forms/d/e/1FAIpQLoldSharedFixture/formResponse'};
    const old = forms.create(e.win, original);
    const id = old.stageSubmission({id:'old_result', block:'old_context', participant_label:'fixture_web_label', submission_type:'result', results:{details_version:1, measurement:42}});
    const current = forms.create(e.win, registry);
    assert.equal(current.list()[0].destination.endpoint, original.endpoint);
    await assert.rejects(current.send(id), /destination differs/);
    assert.equal(e.requests.length, 0);
});
