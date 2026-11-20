'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Menu feedback has the standard compact controls without delivery boilerplate', () => {
    const html = read('touchpad/menu.html');
    const modal = html.slice(html.indexOf('<div id="completion"'));
    assert.match(modal, /data-feedback-dialog/);
    assert.match(modal, /class="feedback-panel"/);
    assert.match(modal, /id="completion-title">Feedback</);
    assert.match(modal, /class="feedback-scale"/);
    assert.match(modal, /class="feedback-comment-label"/);
    assert.match(modal, /id="completion-save">Finish</);
    assert.equal((modal.match(/type="radio"/g) || []).length, 5);
    assert.match(modal, /id="completion-retry" hidden/);
    assert.match(modal, /id="completion-forms-retry" hidden/);
    for (const extra of ['completion-skip', 'completion-export', 'class="note"', '<a ', '(optional)', 'Request sent', 'Results and feedback are retained']) {
        assert.equal(modal.includes(extra), false, extra);
    }
    assert.match(html, /post-task-feedback\.css\?v=menu-feedback-2/);
});

test('Feedback stylesheet only extends selectors, preserving all existing shared declarations', () => {
    const baseline = execFileSync('git', ['show', '9b977d8e08ca6b7992b4c8d93d34c2c3881e9177:surface-inputs-dev/post-task-feedback.css'], {encoding:'utf8'});
    const normalized = read('post-task-feedback.css')
        .replaceAll(':is(#post-task-feedback, [data-feedback-dialog])', '#post-task-feedback')
        .replaceAll(':is(#feedback-status, #completion-status)', '#feedback-status')
        .replaceAll(':is(#feedback-save, #completion-save)', '#feedback-save');
    assert.equal(normalized, baseline);
    const filesBaseline = execFileSync('git', ['show', '9b977d8e08ca6b7992b4c8d93d34c2c3881e9177:surface-inputs-dev/touchpad/files.html'], {encoding:'utf8'});
    assert.equal(read('touchpad/files.html'), filesBaseline, 'Historical Files UI stays unchanged');
});
