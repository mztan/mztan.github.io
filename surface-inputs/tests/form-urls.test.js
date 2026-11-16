'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const prod = path.resolve(root, '../surface-inputs');
const typing = 'https://docs.google.com/forms/d/e/1FAIpQLSfEcRfQeisYOj7K3Z1rWrbPji4rV4_9EqDlMEL4SyJi45FtRA/formResponse';
const targeting = 'https://docs.google.com/forms/d/e/1FAIpQLSdkh1qgAluUKd7j-Gga5gArOaZ6lT-V1OA9XSASmXI0I7ZV3w/formResponse';
const scrolling = 'https://docs.google.com/forms/d/e/1FAIpQLSfFClTUgsKmEwxtx-WW79YnTAJ-oiIwU1gbAJiTAMECIiMjww/formResponse';
function read(base, file) { return fs.readFileSync(path.join(base, file), 'utf8'); }
function forms(html) { return [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(match => match[0]); }

test('active task form actions use the new URLs without changing any form fields', () => {
    for (const [file, expected] of [['keyboard/index.html', typing], ['touchpad/index.html', targeting], ['touchpad/scroll.html', scrolling]]) {
        const current = forms(read(root, file));
        const baseline = forms(read(prod, file));
        assert.equal(current.length, baseline.length);
        current.forEach((form, index) => {
            assert.equal(form.match(/action="([^"]+)"/)[1], expected);
            assert.equal(form.replace(/action="[^"]+"/, 'action="URL"'), baseline[index].replace(/action="[^"]+"/, 'action="URL"'));
        });
    }
});

test('typing UXR2 runtime action uses the same new typing URL and has no other engine edits', () => {
    const code = read(root, 'keyboard/script.js');
    assert.equal(code.split(typing).length - 1, 1);
    const original = code.replace(typing, 'https://docs.google.com/forms/d/e/1FAIpQLSdAuVaWh53BvFkNTSHVki0QqIlw7CQn-xTptVpmRtHrk2ULEA/formResponse')
        .replace(/^[ \t]*\/\/ BEGIN POST-TASK FEEDBACK HOOK\n[ \t]*if \(window\.SurfaceInputsFeedback\) window\.SurfaceInputsFeedback\.complete\(nativeActivity\(\)\);\n[ \t]*\/\/ END POST-TASK FEEDBACK HOOK\n/gm, '');
    const baseline = read(prod, 'keyboard/script.js')
        .replace(typing, 'https://docs.google.com/forms/d/e/1FAIpQLSdAuVaWh53BvFkNTSHVki0QqIlw7CQn-xTptVpmRtHrk2ULEA/formResponse')
        .replace(/^[ \t]*\/\/ BEGIN POST-TASK FEEDBACK HOOK\n[ \t]*if \(window\.SurfaceInputsFeedback\) window\.SurfaceInputsFeedback\.complete\(nativeActivity\(\)\);\n[ \t]*\/\/ END POST-TASK FEEDBACK HOOK\n/gm, '');
    assert.equal(original, baseline);
});

test('native transport and feedback behavior are untouched; dormant collector is not activated', () => {
    assert.equal(read(root, 'transport.js'), read(prod, 'transport.js'));
    for (const file of ['keyboard/index.html', 'touchpad/index.html', 'touchpad/scroll.html']) {
        assert.ok(!read(root, file).includes('form-collector.js'));
    }
    assert.ok(read(root, 'post-task-feedback.js').includes('No feedback collector is configured'));
});
