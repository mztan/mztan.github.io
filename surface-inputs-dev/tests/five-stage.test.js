'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {environment}=require('./harness.js'),flow=require('../dogfood-flow.js'),hp=require('../keyboard/hunt-peck-forms.js'),files=require('../path-results.js'),{attach}=require('./files-form-fixture.js'),profile=require('../keyboard/typing-task.js').profile({pathname:'/surface-inputs-dev/keyboard/index.html',search:'?task=hunt-and-peck'}),{MenuTrials,MENU_PATH}=require('../menu-tasks.js');
function memory(){const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function state(stage,phase='idle'){return{version:3,id:'df_five_fixture',stage,participant:'five-fixture',session:'fixture',tasks:flow.tasks.map((task,i)=>({sets:i<stage?flow.sets[task]:0,phase:i<stage?'sent':i===stage?phase:'idle'}))};}
function page(stage,search,phase='idle',native=false){const e=environment(search),storage=memory(),destinations=[];storage.setItem('arcade-dogfood-v3:surface-inputs-dev',JSON.stringify(state(stage,phase)));e.win.sessionStorage=storage;e.win.localStorage=memory();e.doc.currentScript={src:'https://mztan.github.io/surface-inputs-dev/dogfood-flow.js'};e.doc.readyState='loading';e.doc.documentElement.classList.contains=()=>false;e.win.location={origin:'https://mztan.github.io',pathname:'/surface-inputs-dev/'+(stage===4?'touchpad/menu.html':'keyboard/index.html'),href:'https://mztan.github.io/surface-inputs-dev/keyboard/index.html'+search,search,assign:u=>destinations.push(u),replace:u=>destinations.push(u)};e.load('transport.js');if(native){e.port.capabilityBehavior='v2';e.ready();}attach(e.win,e.requests);const api=flow.create(e.win);e.win.SurfaceInputsDogfood=api;return{...e,api,storage,destinations};}
function rows(){const s=new MenuTrials();for(let i=0;i<2;i++){const at=i*1000;s.open(at);s.move(0,0,at+1);s.move(3,4,at+2);for(let l=0;l<s.depth-1;l++)s.hover(l,MENU_PATH[l],at+10+l);s.select(s.depth-1,MENU_PATH[s.depth-1],at+20);s.next();}return s.targetResults(3000);}
const settle=()=>new Promise(r=>setImmediate(r));

test('v1 links restart at main without erasing old flow or any retained response',()=>{
 const e=environment('?dogfood=df_old'),storage=memory(),dest=[];
 const old=JSON.stringify({version:1,id:'df_old',stage:2,tasks:[{sets:6,phase:'sent'},{sets:6,phase:'sent'},{sets:0,phase:'running'}]});storage.setItem('arcade-dogfood-v1:surface-inputs-dev',old);
 e.win.sessionStorage=storage;e.win.localStorage=memory();e.win.localStorage.setItem('old-results','retained');e.win.location={href:'https://mztan.github.io/surface-inputs-dev/keyboard/index.html?dogfood=df_old',pathname:'/surface-inputs-dev/keyboard/index.html',search:'?dogfood=df_old',replace:u=>dest.push(u)};e.doc.currentScript={src:'https://mztan.github.io/surface-inputs-dev/dogfood-flow.js'};e.doc.readyState='loading';e.doc.documentElement.classList.contains=()=>false;flow.create(e.win);e.doc.dispatchEvent({type:'DOMContentLoaded'});
 assert(dest[0].endsWith('index.html?dogfood_restart=1'));assert.equal(storage.getItem('arcade-dogfood-v1:surface-inputs-dev'),old);assert.equal(e.win.localStorage.getItem('old-results'),'retained');
});

test('same keyboard path routes by profile and only Menu is final',()=>{
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

test('Menu uses final flow context, holds until both destinations and rating, and never double advances',async()=>{
 const e=page(4,'?dogfood=df_five_fixture','idle',true),api=files.create(e.win,'stp_cascading_menu');api.restoreGuided();api.canBegin('ignored-label');api.complete('stp_cascading_menu',rows());await settle();assert.equal(e.api.getState().tasks[4].phase,'feedback');assert.equal(e.destinations.length,0);
 const id=api.current().id;assert.equal(id,'df_five_fixture_menu');assert.equal(api.current().participant_label,'five-fixture');
 api.rate(4,'fixture');await settle();assert.equal(e.destinations.length,0);
 const messages=e.port.sent.filter(m=>m.type==='arcade');assert.equal(messages.length,3);messages.forEach(m=>e.port.receive({version:2,id:m.id,status:'accepted'}));
 assert.equal(e.api.getState().stage,5);assert.equal(e.destinations.length,1);messages.forEach(m=>e.port.receive({version:2,id:m.id,status:'accepted'}));assert.equal(e.destinations.length,1);
});

test('Menu abort blocks delayed completion and no result or feedback is emitted',()=>{
 const e=page(4,'?dogfood=df_five_fixture'),api=files.create(e.win,'stp_cascading_menu');api.restoreGuided();api.canBegin('five-fixture');e.api.skip();
 assert.throws(()=>api.complete('stp_cascading_menu',rows()),/skipped|no longer/);assert.equal(api.list().length,0);assert.equal(e.requests.length,0);assert.equal(e.api.getState().tasks[4].phase,'skipped');
});

test('restored Menu feedback requires explicit exact native retry and never reposts Forms',async()=>{
 const e=page(4,'?dogfood=df_five_fixture','idle',true),api=files.create(e.win,'stp_cascading_menu');api.restoreGuided();api.canBegin('five-fixture');api.complete('stp_cascading_menu',rows());api.rate(4,'fixture');await settle();
 const first=e.port.sent.filter(message=>message.type==='arcade').map(message=>JSON.parse(JSON.stringify(message))),postCount=e.requests.length;
 const restored=files.create(e.win,'stp_cascading_menu');assert(restored.restoreGuided());assert.equal(e.requests.length,postCount);assert.equal(e.port.sent.filter(message=>message.type==='arcade').length,3);
 restored.retry();assert.equal(e.port.sent.filter(message=>message.type==='arcade').length,6);assert.deepEqual(e.port.sent.filter(message=>message.type==='arcade').slice(3),first);assert.equal(e.requests.length,postCount);
});

test('dedicated Forms explicit retry stops after task abort without dropping retained records',async()=>{
 const e=page(4,'?dogfood=df_five_fixture'),dispatcher=require('../files-forms.js').create(e.win,e.win.SurfaceInputsFilesFormsConfig,{task_id:'stp_cascading_menu'});
 const run={id:'abort_fixture',task:'stp_cascading_menu',participant_label:'five-fixture',targets:rows(),ease:4,comment:''};
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
