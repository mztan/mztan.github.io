'use strict';
const test = require('node:test');
const sdk = require('../transport.js');
const original = require('./fixtures/transport-v1.js');
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
test('old v1 clients keep original frames on upgraded hosts and standards never drift', () => {
    const {environment} = require('./harness.js');
    const e = environment(); const transport = original.createTransport(e.win); e.ready();
    const message = {activity_id:'keyboard_natural_language',prompt_id:'p',prompt_text:'hello⏎',input_event_stream:'hello⏎',elapsed_ms:12,details:{details_version:1}};
    transport.submitKeyboard(message); assert.equal(e.port.controls.length,0); assert.equal(e.port.sent.at(-1).version,1);
    assert.deepEqual(sdk.metrics,original.metrics);
});
test('actual SDK v2 fixtures are reproducible, preserve typed producer data and opaque raw strings',async()=>{
    const {conformanceFixtures}=require('./generate-v2-fixtures.js');
    const saved=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/native-messages-v2.json'),'utf8'));
    assert.deepEqual(await conformanceFixtures(),saved); assert.equal(saved.length,37);
    for(const entry of saved){validate(entry.message);assert.equal(entry.raw,JSON.stringify(entry.message));if(entry.expected_details!==undefined)assert.equal(entry.message.details,entry.expected_details);}
    const old=await fixtures();
    for(let i=0;i<7;i++){
        const {id:oldId,activity_id,version:oldVersion,...oldData}=old[i].message;
        const {id:newId,task_id,version:newVersion,...newData}=saved.find(entry=>entry.name===old[i].name).message;
        assert.equal(newVersion,2);assert.equal(task_id,activity_id);assert.deepEqual(newData,oldData);
    }
});
