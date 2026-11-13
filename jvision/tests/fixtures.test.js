'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../transport.js');
const { fixtures } = require('./generate-fixtures.js');
test('checked-in native receiver messages are generated from production modules and validate exactly', async () => {
    const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/native-messages.json'), 'utf8'));
    const actual = await fixtures();
    assert.deepEqual(actual, saved);
    assert.equal(saved.length, 9);
    assert.equal(new Set(saved.map(value => value.message.id)).size, saved.length);
    for (const value of saved) validate(value.message);
});
