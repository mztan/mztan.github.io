'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sdk=require('../transport.js'),manifest=require('../telemetry-contract.json');const{environment}=require('./harness.js');
function setup(behavior='v2',options={}){const e=environment();e.port.capabilityBehavior=behavior;e.transport=sdk.createTransport(e.win,options);return e;}
function caps(e,extra={}){return {version:1,type:'capabilities',id:e.port.controls.at(-1).id,supported_versions:[1,2],message_types:manifest.message_types,intent_contract_version:1,touchpad_metric_families:manifest.touchpad_metric_families,limits:manifest.limits,...extra};}
const keyboard=(extra={})=>({task_id:'future.task/typing-42',elapsed_ms:123,prompt_id:'p_1',prompt_text:'Hello⏎',input_event_stream:'Hello⌫o⏎',details:{details_version:1,final_text:'Hello',replay_eligible:true},...extra});
const event=(extra={})=>({task_id:'future.uxr/task-91',event_name:'study_result.v7',details:{details_version:7,new_metric:14,ratings:{ease:7,new_question:2},note:'slashes / \\ quotes " emoji🙂',nested:{details_version:99}},...extra});
const legacy=(extra={})=>({...keyboard(),task_id:undefined,activity_id:'keyboard_natural_language',...extra});
function oldKeyboard(extra={}){const {task_id,...rest}=keyboard();return {...rest,activity_id:'keyboard_natural_language',...extra};}
test('canonical manifest embedded exactly, frozen, all fields match existing standards',()=>{
 assert.deepEqual(sdk.contract,manifest);assert(Object.isFrozen(sdk.contract.metrics.clicks));assert.equal(manifest.limits.integer_max,2147483647);
 const source=fs.readFileSync(path.join(__dirname,'../transport.js'),'utf8');assert(source.includes('const CONTRACT = '+JSON.stringify(manifest)+';'));
});
test('exact ready remains v1; capabilities requested after ready and data held until negotiated',()=>{
 const e=setup('manual');e.handshake();e.transport.submitKeyboard(keyboard({id:'k'}));assert.equal(e.port.controls.length,0);assert.equal(e.port.sent.length,1);
 e.port.receive({version:1,type:'ready'});assert.equal(e.transport.isNative(),true);assert.equal(e.port.controls.length,1);assert.equal(e.port.sent.length,1);assert.throws(()=>e.transport.requireV2(),/requires v2/);
 e.port.receive(caps(e));assert(e.transport.requireV2());assert.equal(e.port.sent[1].version,2);assert.equal(e.port.sent[1].task_id,'future.task/typing-42');assert(!('activity_id'in e.port.sent[1]));
 const copy=e.transport.getCapabilities();copy.supported_versions.length=0;assert(e.transport.getCapabilities().supported_versions.includes(2));
});
test('old APK explicit capability rejection gets only compatible v1 facade frames',()=>{
 const e=setup('legacy');e.ready();e.transport.submitKeyboard(oldKeyboard({id:'legacy'}));assert.equal(e.port.sent.at(-1).version,1);assert.equal(e.transport.getCapabilityState(),'legacy');
 assert.throws(()=>e.transport.requireV2(),/upgrade/);const count=e.port.sent.length;e.transport.submitArcadeEvent(event({id:'new-event'}));assert.equal(e.port.sent.length,count);assert.equal(e.transport.pendingCount(),2);assert.equal(e.requests.length,0);
});
test('current APIs adapt typed activity IDs and legacy feedback to v2 opaque events',()=>{
 const e=setup();e.ready();e.transport.submitKeyboard(oldKeyboard({id:'legacy'}));assert.equal(e.port.sent.at(-1).task_id,'keyboard_natural_language');assert.equal(e.port.sent.at(-1).version,2);
 e.transport.submitFeedback({id:'rating',activity_id:'touchpad_scrolling',scope:'task',round_id:'local-round',ratings:{ease:4},comment:'unchanged'});
 const message=e.port.sent.at(-1);assert.equal(message.type,'arcade');assert.equal(message.event_name,'feedback_submitted');assert.equal(message.task_context_id,'local-round');assert.deepEqual(JSON.parse(message.details),{details_version:1,scope:'task',ratings:{ease:4},comment:'unchanged'});
});
test('missing or malformed capabilities never silently choose v1, data retained and retry control recovers',()=>{
 const e=setup('manual');e.ready();e.transport.submitArcadeEvent(event({id:'held'}));const initial=e.port.controls[0];e.runTimer([...e.timers.keys()][0]);assert.equal(e.transport.getCapabilityState(),'blocked');assert.equal(e.port.sent.length,1);assert.equal(e.transport.pendingCount(),1);
 e.transport.retryPending();assert.equal(e.port.controls.length,2);e.port.receive(caps(e,{intent_contract_version:99}));assert.equal(e.transport.getCapabilityState(),'blocked');
 e.transport.retryPending();e.port.receive({...caps(e),id:initial.id});assert.equal(e.port.sent.length,1);e.port.receive(caps(e));assert.equal(e.port.sent.at(-1).id,'held');assert.equal(e.requests.length,0);
});
test('Arcade serialization is exact string, rejects double-stringification and keeps arbitrary inner keys',()=>{
 const e=setup();e.ready();const input=event({id:'opaque'}), expected=JSON.stringify(input.details);e.transport.submitArcadeEvent(input);const message=e.port.sent.at(-1);assert.equal(typeof message.details,'string');assert.equal(message.details,expected);
 assert.throws(()=>e.transport.submitArcadeEvent({...input,id:'bad',details:expected}),/object/);
 const before=e.transport.pendingCount();for(const details of [{details_version:0},{details_version:1,value:NaN},{details_version:1,value:undefined},{details_version:1,value:Infinity}])assert.throws(()=>e.transport.submitArcadeEvent(event({details})));
 const circular={details_version:1};circular.self=circular;assert.throws(()=>e.transport.submitArcadeEvent(event({details:circular})),/Circular/);assert.equal(e.transport.pendingCount(),before);
});
test('same id stays immutable; ACK version mismatch cannot clear queued v2; rejected retry matches original wire',()=>{
 const e=setup('v2',{maxAttempts:1});e.ready();const input=event({id:'stable'});e.transport.submitArcadeEvent(input);const original=JSON.stringify(e.port.sent.at(-1));input.details.new_metric=999;assert.throws(()=>e.transport.submitArcadeEvent(input),/reuse/);
 e.port.receive({version:1,id:'stable',status:'accepted'});assert.equal(e.transport.pendingCount(),1);e.port.receive({version:2,id:'stable',status:'rejected'});e.transport.retryPending();assert.equal(JSON.stringify(e.port.sent.at(-1)),original);
 e.port.receive({version:2,id:'stable',status:'accepted'});assert.equal(e.transport.pendingCount(),0);
});
test('future task identifiers may send every typed family without task-family mappings or prefixes',()=>{
 const e=setup();e.ready();for(const [family,fields]of Object.entries(sdk.metrics)){
  const data=Object.fromEntries(Object.entries(fields).map(([key,kind])=>[key,kind==='text'?'target':kind.endsWith('Direction')?'':-1]));
  e.transport.submitTouchpad({task_id:'unseen.task/'+family,metric_family:family,elapsed_ms:1,details:{details_version:1},...data});assert.equal(e.port.sent.at(-1).task_id,'unseen.task/'+family);assert.equal(e.port.sent.at(-1).metric_family,family);
 }
 assert.throws(()=>e.transport.submitTouchpad({task_id:'new',metric_family:'__proto__',elapsed_ms:0,details:{details_version:1}}),/metric_family/);
 assert.throws(()=>e.transport.submitTouchpad({task_id:'new',metric_family:'clicks',elapsed_ms:0,details:{details_version:1},unknown_metric:1}),/Unknown field/);
});
test('UTF8/string object bounds, native int and Float limits are enforced before queue',()=>{
 const e=setup();e.ready();e.transport.submitKeyboard(keyboard({elapsed_ms:2147483647}));assert.throws(()=>e.transport.submitKeyboard(keyboard({elapsed_ms:2147483648})),/integer/);
 const base={task_id:'future',metric_family:'clicks',elapsed_ms:0,details:{details_version:1}};assert.throws(()=>e.transport.submitTouchpad({...base,stp_clicks_total:2147483648}));assert.throws(()=>e.transport.submitTouchpad({...base,stp_clicks_total:0.5}));
 assert.throws(()=>e.transport.submitTouchpad({...base,metric_family:'cursor_movement',stp_cursor_movement_endpoint_error_px:1e39}));
 assert.throws(()=>e.transport.submitKeyboard(keyboard({prompt_text:'é'.repeat(257)})),/prompt_text/);assert.throws(()=>e.transport.submitKeyboard(keyboard({input_event_stream:'🙂'.repeat(513)})),/input_event_stream/);
 assert.throws(()=>e.transport.submitArcadeEvent(event({task_id:'x'.repeat(65)})),/ASCII/);assert.throws(()=>e.transport.submitArcadeEvent(event({details:{details_version:1,note:'🙂'.repeat(512)}})),/details/);
 const fixed=JSON.stringify({details_version:1,note:''}).length;assert.doesNotThrow(()=>e.transport.submitArcadeEvent(event({id:'exact',details:{details_version:1,note:'x'.repeat(2048-fixed)}})));
 assert.throws(()=>e.transport.submitArcadeEvent(event({details:{details_version:1,note:'x'.repeat(2049-fixed)}})),/details/);
});
test('32-message queue backpressure, no permanently exhausted Activity after 1024 accepted IDs',()=>{
 const e=setup('v2',{queueLimit:999});e.ready();for(let i=0;i<32;i++)e.transport.submitArcadeEvent(event({id:'q'+i}));assert.throws(()=>e.transport.submitArcadeEvent(event({id:'overflow'})),/queue full/);
 for(let i=0;i<32;i++)e.port.receive({version:2,id:'q'+i,status:'accepted'});for(let i=0;i<1030;i++){e.transport.submitArcadeEvent(event({id:'a'+i}));e.port.receive({version:2,id:'a'+i,status:'accepted'});}
 const sent=e.port.sent.length;e.transport.submitArcadeEvent(event({id:'a1029'}));assert.equal(e.port.sent.length,sent);assert.throws(()=>e.transport.submitArcadeEvent(event({id:'a1029',details:{details_version:1,different:1}})),/reuse accepted/);e.transport.submitArcadeEvent(event({id:'a0'}));assert.equal(e.port.sent.length,sent+1);
});
test('JSON depth 32 is accepted, depth 33 rejected before parsing, quoted braces ignored',()=>{
 const e=setup();e.ready();let root={details_version:1,text:'{[\\" not structural } ]'};
 for(let depth=1;depth<32;depth++)root={details_version:1,nested:root};
 assert.doesNotThrow(()=>e.transport.submitArcadeEvent(event({id:'depth32',details:root})));
 assert.throws(()=>e.transport.submitArcadeEvent(event({details:{details_version:1,nested:root}})),/depth/);
 const wire={version:2,type:'arcade',id:'deep',task_id:'task',event_name:'event',details:JSON.stringify({details_version:1,nested:root})};assert.throws(()=>sdk.validate(wire),/bounded/);
 const source='{"details_version":1} trailing';assert.throws(()=>sdk.validate({...wire,details:source}),/complete/);
});
test('capability callbacks submit once without consuming retry attempts, v1 and v2',()=>{
 for(const mode of ['v2','legacy']){const e=setup(mode,{maxAttempts:1});e.win.addEventListener('surface-inputs-capabilities',()=>e.transport.submitKeyboard(oldKeyboard({id:'from-listener'})));e.ready();assert.equal(e.port.sent.filter(p=>p.id==='from-listener').length,1);assert.equal(e.timers.size,1);}
});
test('changing JSON getters are rejected rather than coercing measurements into null',()=>{
 const e=setup();e.ready();let read=0;const data={details_version:1};Object.defineProperty(data,'metric',{enumerable:true,get:()=>++read===1?1:NaN});assert.throws(()=>e.transport.submitArcadeEvent(event({details:data})),/accessor/);assert.equal(e.transport.pendingCount(),0);assert.equal(read,0);
 assert.doesNotThrow(()=>e.transport.submitArcadeEvent(event({details:{details_version:1,toJSON:'opaque data'}})));
});
test('current result facade skips extra UXR only on confirmed legacy and queues paired data atomically',()=>{
 const e=setup('manual',{queueLimit:2});e.handshake();e.transport.submitKeyboardWithResult(oldKeyboard({id:'typed'}),{...event({id:'result',task_id:'keyboard_natural_language'}),event_name:'uxr_result'});assert.equal(e.transport.pendingCount(),2);assert.equal(e.port.sent.length,1);
 e.port.receive({version:1,type:'ready'});e.port.receive({version:1,id:e.port.controls.at(-1).id,status:'rejected'});assert.equal(e.transport.pendingCount(),1);assert.equal(e.port.sent.at(-1).id,'typed');assert.equal(e.requests.length,0);
 const v2=setup('v2',{queueLimit:1});v2.ready();assert.throws(()=>v2.transport.submitKeyboardWithResult(oldKeyboard({id:'typed'}),event({id:'result',task_id:'keyboard_natural_language'})),/queue full/);assert.equal(v2.transport.pendingCount(),0);assert.equal(v2.port.sent.length,1);
});
test('private capability IDs cannot collide with a queued observation, raw invalid JSON rejected',()=>{
 const e=setup('manual');e.handshake();const observation='ctl_11111111-2222-3333-4444-555555555555_1';e.transport.submitKeyboard(oldKeyboard({id:observation}));e.port.receive({version:1,type:'ready'});assert.notEqual(e.port.controls.at(-1).id,observation);e.port.receive({version:1,id:observation,status:'accepted'});assert.equal(e.transport.getCapabilityState(),'negotiating');
 const raw={version:2,type:'arcade',id:'raw',task_id:'task',event_name:'event'};
 for(const details of ["{'details_version':1}",'{details_version:1}','{"details_version":1}//comment','{"details_version":1,"details_version":2}'])assert.throws(()=>sdk.validate({...raw,details}),/bounded/);
});
test('legacy optional UXR results never consume queue capacity needed for compatible input',()=>{
 const e=setup('legacy');e.ready();for(let i=0;i<31;i++)e.transport.submitKeyboard(oldKeyboard({id:'l'+i}));
 assert.doesNotThrow(()=>e.transport.submitKeyboardWithResult(oldKeyboard({id:'last'}),event({id:'skip',task_id:'keyboard_natural_language'})));assert.equal(e.transport.pendingCount(),32);
 assert.doesNotThrow(()=>e.transport.submitCurrentResult(event({id:'skip2',task_id:'touchpad_targeting'})));assert.equal(e.transport.pendingCount(),32);
});
test('browser routes are only explicit callbacks and never a native fallback',()=>{
 const e=setup();assert.throws(()=>e.transport.submitArcadeEvent(event()),/explicit callback/);let received;e.transport.setBrowserArcadeCallback(message=>{received=message;return 'local';});assert.equal(e.transport.submitArcadeEvent(event()),'local');assert.equal(received.version,2);assert.equal(e.requests.length,0);
 e.ready();e.transport.submitArcadeEvent(event());assert.equal(e.requests.length,0);assert.equal(e.port.sent.at(-1).version,2);
});
