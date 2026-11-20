'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {environment}=require('./harness.js'),flow=require('../dogfood-flow.js'),hp=require('../keyboard/hunt-peck-forms.js'),files=require('../path-results.js'),{attach}=require('./files-form-fixture.js'),profile=require('../keyboard/typing-task.js').profile({pathname:'/surface-inputs-dev/keyboard/index.html',search:'?task=hunt-and-peck'}),{FileDragTrials}=require('../path-tasks.js');
function memory(){const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function state(stage,phase='idle'){return{version:2,id:'df_five_fixture',stage,participant:'five-fixture',session:'fixture',tasks:flow.tasks.map((task,i)=>({sets:i<stage?flow.sets[task]:0,phase:i<stage?'sent':i===stage?phase:'idle'}))};}
function page(stage,search,phase='idle',native=false){const e=environment(search),storage=memory(),destinations=[];storage.setItem('arcade-dogfood-v2:surface-inputs-dev',JSON.stringify(state(stage,phase)));e.win.sessionStorage=storage;e.win.localStorage=memory();e.doc.currentScript={src:'https://mztan.github.io/surface-inputs-dev/dogfood-flow.js'};e.doc.readyState='loading';e.doc.documentElement.classList.contains=()=>false;e.win.location={origin:'https://mztan.github.io',pathname:'/surface-inputs-dev/'+(stage===4?'touchpad/files.html':'keyboard/index.html'),href:'https://mztan.github.io/surface-inputs-dev/keyboard/index.html'+search,search,assign:u=>destinations.push(u),replace:u=>destinations.push(u)};e.load('transport.js');if(native){e.port.capabilityBehavior='v2';e.ready();}attach(e.win,e.requests);const api=flow.create(e.win);e.win.SurfaceInputsDogfood=api;return{...e,api,storage,destinations};}
function rows(){const s=new FileDragTrials();s.geometry(1000,420,1,8);for(let i=0;i<3;i++){s.begin(i*1000);s.scroll(s.spec.fileIndex*s.rowHeight-s.listRect.height/2-s.offset,i*1000+10);const x=s.listRect.centerX,y=s.spec.fileIndex*s.rowHeight-s.offset+s.rowHeight/2,f=s.folderRects[s.spec.folderIndex];s.pressAt(x,y,i*1000+100,true);s.move(f.centerX,f.centerY,i*1000+120);s.release(f.centerX,f.centerY,i*1000+150);s.next();}return s.targetResults(4000);}
const settle=()=>new Promise(r=>setImmediate(r));

test('v1 links restart at main without erasing old flow or any retained response',()=>{
 const e=environment('?dogfood=df_old'),storage=memory(),dest=[];
 const old=JSON.stringify({version:1,id:'df_old',stage:2,tasks:[{sets:6,phase:'sent'},{sets:6,phase:'sent'},{sets:0,phase:'running'}]});storage.setItem('arcade-dogfood-v1:surface-inputs-dev',old);
 e.win.sessionStorage=storage;e.win.localStorage=memory();e.win.localStorage.setItem('old-results','retained');e.win.location={href:'https://mztan.github.io/surface-inputs-dev/keyboard/index.html?dogfood=df_old',pathname:'/surface-inputs-dev/keyboard/index.html',search:'?dogfood=df_old',replace:u=>dest.push(u)};e.doc.currentScript={src:'https://mztan.github.io/surface-inputs-dev/dogfood-flow.js'};e.doc.readyState='loading';e.doc.documentElement.classList.contains=()=>false;flow.create(e.win);e.doc.dispatchEvent({type:'DOMContentLoaded'});
 assert(dest[0].endsWith('index.html?dogfood_restart=1'));assert.equal(storage.getItem('arcade-dogfood-v1:surface-inputs-dev'),old);assert.equal(e.win.localStorage.getItem('old-results'),'retained');
});

test('same keyboard path routes by profile and only Files is final',()=>{
 const normal=page(2,'?dogfood=df_five_fixture&task=hunt-and-peck');normal.doc.dispatchEvent({type:'DOMContentLoaded'});assert(!new URL(normal.destinations[0]).searchParams.has('task'));assert.equal(normal.api.isFinal(),false);
 const hunt=page(3,'?dogfood=df_five_fixture');hunt.doc.dispatchEvent({type:'DOMContentLoaded'});assert.equal(new URL(hunt.destinations[0]).searchParams.get('task'),'hunt-and-peck');
 const final=page(4,'?dogfood=df_five_fixture');assert(final.api.isFinal());
 assert(Buffer.byteLength(final.api.context('hunt_peck'))<=64);
});

test('H&P guided context and participant come from the flow and completion requires retained native ACKs',()=>{
 const e=page(3,'?dogfood=df_five_fixture&task=hunt-and-peck','idle',true),api=hp.create(e.win,profile);
 const id=api.begin('ignored-label');assert.equal(id,'df_five_fixture_hunt_peck');assert.equal(api.current().participant_label,'five-fixture');
 for(let i=0;i<10;i++){
  const snapshot={id:'p'+i,context:id,prompt_text:'x⏎',input_event_stream:'x⏎',final_text:'x',result:{timeSpentMs:1}};api.stagePrompt(snapshot);
  api.stageNativePrompt(snapshot.id,{id:'k'+i,activity_id:'keyboard_punctuation',prompt_id:'p'+i,prompt_text:'x⏎',input_event_stream:'x⏎',elapsed_ms:1,details:{details_version:1}},{id:'u'+i,task_id:'keyboard_punctuation',task_context_id:id,event_name:'uxr_result',elapsed_ms:1,details:{details_version:1}});
 }
 e.api.complete('hunt_peck',null,null);assert(e.api.feedbackDone(id));assert.equal(e.api.getState().stage,3);
 for(let i=0;i<10;i++){e.win.dispatchEvent(new e.context.CustomEvent('surface-inputs-ack',{detail:{id:'k'+i,status:'accepted'}}));e.win.dispatchEvent(new e.context.CustomEvent('surface-inputs-ack',{detail:{id:'u'+i,status:'accepted'}}));}
 assert.equal(e.api.getState().stage,4);assert.equal(e.destinations.length,1);
 e.win.dispatchEvent(new e.context.CustomEvent('surface-inputs-ack',{detail:{id:'u9',status:'accepted'}}));assert.equal(e.destinations.length,1);
});

test('Files uses final flow context, holds until both destinations and rating, and never double advances',async()=>{
 const e=page(4,'?dogfood=df_five_fixture','idle',true),api=files.create(e.win);api.restoreGuided();api.canBegin('ignored-label');api.complete('stp_file_drag',rows());await settle();assert.equal(e.api.getState().tasks[4].phase,'feedback');assert.equal(e.destinations.length,0);
 const id=api.current().id;assert.equal(id,'df_five_fixture_files');assert.equal(api.current().participant_label,'five-fixture');
 api.rate(4,'fixture');await settle();assert.equal(e.destinations.length,0);
 const messages=e.port.sent.filter(m=>m.type==='arcade');assert.equal(messages.length,4);messages.forEach(m=>e.port.receive({version:2,id:m.id,status:'accepted'}));
 assert.equal(e.api.getState().stage,5);assert.equal(e.destinations.length,1);messages.forEach(m=>e.port.receive({version:2,id:m.id,status:'accepted'}));assert.equal(e.destinations.length,1);
});

test('Files abort blocks delayed completion and no result or feedback is emitted',()=>{
 const e=page(4,'?dogfood=df_five_fixture'),api=files.create(e.win);api.restoreGuided();api.canBegin('five-fixture');e.api.skip();
 assert.throws(()=>api.complete('stp_file_drag',rows()),/skipped|no longer/);assert.equal(api.list().length,0);assert.equal(e.requests.length,0);assert.equal(e.api.getState().tasks[4].phase,'skipped');
});

test('restored Files feedback requires explicit exact native retry and never reposts Forms',async()=>{
 const e=page(4,'?dogfood=df_five_fixture','idle',true),api=files.create(e.win);api.restoreGuided();api.canBegin('five-fixture');api.complete('stp_file_drag',rows());api.rate(4,'fixture');await settle();
 const first=e.port.sent.filter(message=>message.type==='arcade').map(message=>JSON.parse(JSON.stringify(message))),postCount=e.requests.length;
 const restored=files.create(e.win);assert(restored.restoreGuided());assert.equal(e.requests.length,postCount);assert.equal(e.port.sent.filter(message=>message.type==='arcade').length,4);
 restored.retry();assert.equal(e.port.sent.filter(message=>message.type==='arcade').length,8);assert.deepEqual(e.port.sent.filter(message=>message.type==='arcade').slice(4),first);assert.equal(e.requests.length,postCount);
});

test('dedicated Forms explicit retry stops after task abort without dropping retained records',async()=>{
 const e=page(4,'?dogfood=df_five_fixture'),dispatcher=require('../files-forms.js').create(e.win,e.win.SurfaceInputsFilesFormsConfig);
 const run={id:'abort_fixture',task:'stp_file_drag',participant_label:'five-fixture',targets:rows(),ease:4,comment:''};
 dispatcher.stage(run,'result');dispatcher.stage(run,'feedback');let resolve,active=true;
 e.win.fetch=(url,options)=>{e.requests.push({url,options});return new Promise(r=>{resolve=r;});};
 const retry=dispatcher.retry(run.id,()=>true,()=>active);await settle();assert.equal(e.requests.length,1);
 active=false;resolve({type:'opaque',ok:false,status:0});await assert.rejects(retry,/cancelled/);assert.equal(e.requests.length,1);assert.equal(dispatcher.list().length,2);
});

test('restored H&P feedback retains exact native payloads and does not automatically resend',()=>{
 const e=page(3,'?dogfood=df_five_fixture&task=hunt-and-peck','idle',true),api=hp.create(e.win,profile),context=api.begin('five-fixture');
 for(let i=0;i<10;i++){api.stagePrompt({id:'r'+i,context,prompt_text:'x⏎',input_event_stream:'x⏎',final_text:'x',result:{timeSpentMs:1}});api.stageNativePrompt('r'+i,{id:'k'+i,activity_id:'keyboard_punctuation',prompt_id:'p'+i,prompt_text:'x⏎',input_event_stream:'x⏎',elapsed_ms:1,details:{details_version:1}},{id:'u'+i,task_id:'keyboard_punctuation',task_context_id:context,event_name:'uxr_result',elapsed_ms:1,details:{details_version:1}});}
 e.api.complete('hunt_peck',null,null);const n=e.port.sent.length,restored=hp.create(e.win,profile);assert.equal(restored.current().id,context);assert.equal(restored.current().prompts.length,10);assert.equal(e.port.sent.length,n);assert(!restored.nativeReady());assert.throws(()=>restored.canBegin('five-fixture'),/complete/);
 restored.retryNative();assert.equal(e.port.sent.length,n+20);
});
