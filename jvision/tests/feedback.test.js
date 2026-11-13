'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const feedback = require('../post-task-feedback.js');
const transport = require('../transport.js');
const {environment} = require('./harness.js');
function memory() {
    const map = new Map();
    return {getItem:key=>map.get(key)||null, setItem:(key,value)=>map.set(key,value), removeItem:key=>map.delete(key)};
}
test('post-task ease has five explicit anchors and no preselected rating', () => {
    assert.deepEqual(feedback.labels, ['Very difficult','Difficult','Neither easy nor difficult','Easy','Very easy']);
    assert.throws(()=>feedback.payload('touchpad_targeting','round','response',null,''), /Choose/);
    assert.throws(()=>feedback.payload('touchpad_targeting','round','response',0,''));
    assert.throws(()=>feedback.payload('touchpad_targeting','round','response',6,''));
});
test('each task feedback uses the existing typed native contract and local block id', () => {
    for (const task of ['touchpad_targeting','touchpad_scrolling','keyboard_natural_language','keyboard_shortcuts','keyboard_arrows']) {
        const message=feedback.payload(task,'feedback_block','feedback_response',4,'A note');
        assert.equal(transport.validate(message), message);
        assert.deepEqual(message.ratings,{ease:4});assert.equal(message.scope,'task');
        assert.equal(message.round_id,'feedback_block');assert.equal(message.comment,'A note');
    }
});
test('UTF8 and JSON encoding bounds reject without truncation, empty note is supported', () => {
    assert.equal(feedback.payload('keyboard_email','block','response',5,'').comment,'');
    assert.doesNotThrow(()=>feedback.payload('keyboard_email','block','response',5,'🙂'.repeat(256)));
    assert.throws(()=>feedback.payload('keyboard_email','block','response',5,'🙂'.repeat(257)), /1,024/);
    assert.throws(()=>feedback.payload('keyboard_email','block','response',5,'\n'.repeat(1024)), /Encoded/);
});
test('final native details encoding, not only incoming message bytes, is bounded', () => {
    const measure = value => new TextEncoder().encode(JSON.stringify(value)).length;
    let boundary;
    for(let n=700;n<1025;n++) {
        const comment='"'.repeat(n), round='r'.repeat(64), id='i'.repeat(64), task='keyboard_natural_language';
        const message={version:1,type:'feedback',id,activity_id:task,scope:'task',round_id:round,ratings:{ease:4},comment};
        const details={details_version:1,feedback_id:id,scope:'task',activity_id:task,round_id:round,ratings:{ease:4},comment,pain_points:[]};
        if(measure(message)<=2048 && measure(details)>2048){boundary={comment,round,id,task};break;}
    }
    assert.ok(boundary);assert.throws(()=>feedback.payload(boundary.task,boundary.round,boundary.id,4,boundary.comment),/Encoded/);
});
test('local retention is immutable, survives reload and never evicts saved feedback', () => {
    const storage=memory();const saved=feedback.store(storage);
    const message=feedback.payload('touchpad_scrolling','round','id',3,'note');
    saved.put(message,'pending_native');
    assert.equal(feedback.store(storage).list()[0].status,'pending_native');
    saved.put(message,'native_sink_accepted');assert.equal(saved.list().length,1);
    assert.throws(()=>saved.put({...message,comment:'different'},'pending_native'),/immutable/);
    for(let i=1;i<50;i++) saved.put(feedback.payload('touchpad_scrolling','round_'+i,'id_'+i,3,''),'saved_local');
    assert.throws(()=>saved.put(feedback.payload('touchpad_scrolling','last','last',3,''),'saved_local'),/50 responses/);
    assert.equal(saved.list().length,50);
    saved.clear();assert.equal(saved.list().length,0);
});
test('clear removes only exported IDs, including when another task saved afterward', () => {
    const storage=memory(), saved=feedback.store(storage);
    const old=feedback.payload('keyboard_email','round','old',3,'old');
    const fresh=feedback.payload('keyboard_email','round2','new',4,'unexported');
    saved.put(old,'saved_local');const exported=saved.list().map(entry=>entry.message.id);
    saved.put(fresh,'saved_local');saved.clear(exported);
    assert.equal(saved.list().length,1);assert.equal(saved.list()[0].message.id,'new');
});
test('invalid or unavailable local storage is not overwritten', () => {
    assert.throws(()=>feedback.store(null),/unavailable/);
    const storage=memory();storage.setItem(feedback.storageKey,'{"invalid":true}');
    assert.throws(()=>feedback.store(storage).put(feedback.payload('keyboard_email','b','id',2,''),'saved_local'),/invalid/);
    assert.equal(storage.getItem(feedback.storageKey),'{"invalid":true}');
});
test('saved retry restarts existing native queue even when overflow remains local', () => {
    const storage=memory(), saved=feedback.store(storage);const e=environment();e.load('transport.js');e.ready();
    for(let i=0;i<33;i++) saved.put(feedback.payload('touchpad_targeting','round_'+i,'feedback_'+i,4,''),'pending_native');
    const first=feedback.retrySaved(saved,e.win.SurfaceInputsTransport);
    assert.equal(first.count,32);assert.match(first.reason,/queue full/);assert.equal(saved.list().length,33);
    const sent=e.port.sent.length;
    const second=feedback.retrySaved(saved,e.win.SurfaceInputsTransport);
    assert.match(second.reason,/queue full/);assert.ok(e.port.sent.length>sent,'existing queue must restart after overflow');
    e.port.receive({version:1,id:'feedback_0',status:'accepted'});saved.put(saved.list()[0].message,'native_sink_accepted');
    const third=feedback.retrySaved(saved,e.win.SurfaceInputsTransport);
    assert.equal(third.reason,'');assert.equal(e.win.SurfaceInputsTransport.pendingCount(),32);
});
test('real fake-port feedback queues once, needs sink ACK, rejects and retries immutable data', () => {
    const e=environment();e.load('transport.js');e.ready();
    const message=feedback.payload('touchpad_targeting','round','feedback-id',4,'Works well');
    e.win.SurfaceInputsTransport.submitFeedback(message);
    assert.equal(e.win.SurfaceInputsTransport.pendingCount(),1);
    e.win.SurfaceInputsTransport.submitFeedback(message);assert.equal(e.port.sent.length,2);
    e.port.receive({version:1,id:message.id,status:'rejected',reason:'test'});
    e.win.SurfaceInputsTransport.retryPending();assert.equal(e.port.sent.length,3);
    assert.deepEqual(e.port.sent[1],e.port.sent[2]);
    e.port.receive({version:1,id:message.id,status:'accepted'});
    assert.equal(e.win.SurfaceInputsTransport.pendingCount(),0);
});
