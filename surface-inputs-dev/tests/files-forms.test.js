'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const forms=require('../files-forms.js'), results=require('../path-results.js');
const {config,attach}=require('./files-form-fixture.js');
const {FileDragTrials}=require('../path-tasks.js');
const {environment}=require('./harness.js');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function rows(){const s=new FileDragTrials();s.geometry(1000,420,1,8);for(let i=0;i<3;i++){const t=i*1000;s.begin(t);s.scroll(s.spec.fileIndex*s.rowHeight-s.listRect.height/2-s.offset,t+10);const x=s.listRect.centerX,y=s.spec.fileIndex*s.rowHeight-s.offset+s.rowHeight/2,f=s.folderRects[s.spec.folderIndex];s.pressAt(x,y,t+100,true);s.move(f.centerX,f.centerY,t+120);s.release(f.centerX,f.centerY,t+150);s.next();}return s.targetResults(4000);}
function setup(native=false){const e=environment(),m=new Map();e.win.localStorage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};attach(e.win,e.requests);e.load('transport.js');if(native){e.port.capabilityBehavior='v2';e.ready();}const api=results.create(e.win);return{...e,api,m};}

test('strict nine-field config rejects disabled, foreign endpoints, duplicates and unknown mappings',()=>{
 const c=config();forms.validateConfig(c);
 assert.throws(()=>forms.validateConfig({...c, enabled:false}),/not configured/);
 assert.throws(()=>forms.validateConfig({...c,endpoint:'https://example.com/formResponse'}),/endpoint/);
 assert.throws(()=>forms.validateConfig({...c,fields:{...c.fields,ease:c.fields.comment}}),/unique/);
 assert.throws(()=>forms.validateConfig({...c,fields:{...c.fields,native_user_id:'entry.123'}}),/unique/);
});

test('Forms preflight refuses missing explicit label before any storage or network writes',()=>{
 const e=setup();const before=Array.from(e.m.entries());
 assert.throws(()=>e.api.canBegin(),/participant label/);
 assert.deepEqual(Array.from(e.m.entries()),before);assert.equal(e.requests.length,0);
 e.win.SurfaceInputsFilesFormsConfig.enabled=false;
 const blocked=results.create(e.win);
 assert.throws(()=>blocked.canBegin('fixture-label'),/not configured/);
 assert.equal(e.requests.length,0);
});

test('browser sends full three-target original measurements and optional feedback, never native attribution',async()=>{
 const e=setup(),r=rows();e.api.canBegin('fixture-web-label');e.api.complete('stp_file_drag',r);e.api.rate(4,'Fixture freeform');await settle();
 assert.equal(e.requests.length,2);const fields=config().fields;
 const result=e.requests.find(q=>q.options.body.get(fields.submission_type)==='result');
 const feedback=e.requests.find(q=>q.options.body.get(fields.submission_type)==='feedback');
 assert.deepEqual(JSON.parse(result.options.body.get(fields.results_json)),{details_version:1,targets:r});
 assert.equal(result.options.body.get(fields.participant_label),'fixture-web-label');
 assert.equal(result.options.body.get(fields.task_id),'stp_file_drag');
 assert.equal(feedback.options.body.get(fields.ease),'4');assert.equal(feedback.options.body.get(fields.comment),'Fixture freeform');
 assert.equal(feedback.options.body.get(fields.rating_skipped),'false');assert(!feedback.options.body.has(fields.results_json));
 assert(e.requests.every(q=>q.options.mode==='no-cors'&&q.options.method==='POST'));
 assert(Object.values(e.api.formsStatus()).every(value=>value==='request_sent'));
 assert.equal(e.api.exportRecords().forms.length,2);assert.equal(e.port.sent.length,0);
});

test('Forms failure retries Forms only after warning, with exactly retained payload and no native resend',async()=>{
 const e=setup(true);let fail=true;
 e.win.fetch=async(url,options)=>{e.requests.push({url,options});if(fail)throw Error('fixture lost response');return{type:'opaque',status:0,ok:false};};
 e.api.canBegin('fixture-web-label');e.api.complete('stp_file_drag',rows());e.api.rate(null,'Fixture skipped rating');await settle();
 const native=e.port.sent.filter(m=>m.type==='arcade');assert.equal(native.length,4);
 native.forEach(m=>{assert(!m.details.includes('fixture-web-label'));e.port.receive({version:2,id:m.id,status:'accepted'});});
 assert(Object.values(e.api.formsStatus()).every(value=>value==='delivery_unknown'));
 await assert.rejects(e.api.retryForms(()=>false),/cancelled/);
 assert.equal(e.requests.length,2);
 fail=false;await e.api.retryForms(()=>true);
 assert.equal(e.requests.length,4);assert.equal(e.port.sent.filter(m=>m.type==='arcade').length,4);
 assert.equal(e.requests[0].options.body.toString(),e.requests[2].options.body.toString());
 assert.equal(e.requests[1].options.body.toString(),e.requests[3].options.body.toString());
 assert(Object.values(e.api.formsStatus()).every(value=>value==='request_sent'));
});

test('native rejection retries native only; opaque-sent Forms are never reposted',async()=>{
 const e=setup(true);e.api.canBegin('fixture-web-label');e.api.complete('stp_file_drag',rows());e.api.rate(4,'Fixture');await settle();
 const first=e.port.sent.find(m=>m.type==='arcade');e.port.receive({version:2,id:first.id,status:'rejected'});
 e.api.retry();await settle();assert.equal(e.requests.length,2);
 assert.deepEqual(e.port.sent.filter(m=>m.id===first.id).at(-1),first);
 await e.api.retryForms(()=>true);assert.equal(e.requests.length,2);
});

test('receipt-save failure remains unknown after reload and never automatically replays',async()=>{
 const e=setup();let dispatched=false;
 const write=e.win.localStorage.setItem;e.win.localStorage.setItem=(key,value)=>{if(dispatched&&key===forms.storageKey&&String(value).includes('request_sent'))throw Error('fixture receipt failure');write(key,value);};
 e.win.fetch=async(url,options)=>{e.requests.push({url,options});dispatched=true;return{type:'opaque',ok:false,status:0};};
 e.api.canBegin('fixture-web-label');e.api.complete('stp_file_drag',rows());await settle();
 assert.equal(e.api.formsStatus().result,'request_sent');
 await e.api.retryForms(()=>true);assert.equal(e.requests.length,1);
 const newApi=results.create(e.win);assert.equal(newApi.current(),null);
 assert.equal(newApi.exportRecords().forms[0].status,'delivery_unknown');
 await settle();assert.equal(e.requests.length,1);
});

test('full/unwritable Forms outbox blocks Begin and invalid stored destination never dispatches',async()=>{
 const e=setup();e.m.set(forms.storageKey,JSON.stringify(Array.from({length:100},(_,i)=>({id:String(i)}))));
 assert.throws(()=>e.api.canBegin('fixture-web-label'),/records are full/);
 const unwrite=setup();unwrite.win.localStorage.setItem=()=>{throw Error('fixture unwritable');};
 assert.throws(()=>unwrite.api.canBegin('fixture-web-label'),/unwritable/);
 const f=setup();const uploader=forms.create(f.win,config());const run={id:'files_fixture',task:'stp_file_drag',participant_label:'fixture-web-label',targets:rows()};
 const id=uploader.stage(run,'result');const records=uploader.list();records[0].destination.endpoint='https://example.com';f.m.set(forms.storageKey,JSON.stringify(records));
 await assert.rejects(uploader.send(id),/destination differs/);assert.equal(f.requests.length,0);
});

test('hunt-and-peck reuses the same dispatcher without mixing outboxes or changing full prompt results',async()=>{
 const e=setup();const hp=forms.create(e.win,config(),{task_id:'keyboard_hunt_and_peck'});
 hp.canBegin('fixture-web-label',11);
 const payload={details_version:1,task_profile:'hunt_and_peck',prescription:'Index or middle finger',prompt_text:'Hello, world!',input_event_stream:'Hello, world!⏎',final_text:'Hello, world!',result:{wpm:23.75,accuracy:1,unavailable:null}};
 const id=hp.stageSubmission({id:'hp_prompt_1',block:'hp_fixture_block',participant_label:'fixture-web-label',submission_type:'result',results:payload});
 await hp.send(id);
 const feedback=hp.stageSubmission({id:'hp_feedback',block:'hp_fixture_block',participant_label:'fixture-web-label',submission_type:'feedback',ease:4,comment:'HP fixture'});await hp.send(feedback);
 assert.equal(hp.list().length,2);assert.equal(e.api.exportRecords().forms.length,0);
 assert.deepEqual(JSON.parse(e.requests[0].options.body.get(config().fields.results_json)),payload);
 assert.equal(e.requests[0].options.body.get(config().fields.task_id),'keyboard_hunt_and_peck');
 assert.equal(e.requests[1].options.body.get(config().fields.comment),'HP fixture');
 await hp.retry('hp_fixture_block',()=>true);assert.equal(e.requests.length,2);
 assert.throws(()=>forms.create(e.win,config(),{task_id:'other_task'}),/Unsupported/);
 assert.throws(()=>hp.stageSubmission({id:'hp_prompt_1',block:'hp_fixture_block',participant_label:'fixture-web-label',submission_type:'result',results:{...payload,final_text:'changed'}}),/Cannot change/);
});

test('Form results reject values serialization would silently erase',()=>{
 const e=setup();const hp=forms.create(e.win,config(),{task_id:'keyboard_hunt_and_peck'});
 const submit=results=>hp.stageSubmission({id:'hp_prompt_1',block:'hp_fixture',participant_label:'fixture-web-label',submission_type:'result',results});
 assert.throws(()=>submit({details_version:1,measurement:NaN}),/erase or change/);
 assert.throws(()=>submit({details_version:1,measurement:undefined}),/erase or change/);
 assert.throws(()=>submit({details_version:1,measurement:new Array(1)}),/sparse arrays/);
 assert.throws(()=>submit({details_version:1,get measurement(){return 5;}}),/getters/);
 assert.equal(hp.list().length,0);
});

test('oversized full result or feedback is rejected intact; no silent truncation',()=>{
 const e=setup();const uploader=forms.create(e.win,config());
 assert.throws(()=>uploader.stage({id:'files_fixture',task:'stp_file_drag',participant_label:'fixture-web-label',targets:[{raw:'x'.repeat(40000)}]},'result'),/no data was truncated/);
 assert.equal(uploader.list().length,0);
 e.api.canBegin('fixture-web-label');e.api.complete('stp_file_drag',rows());
 assert.throws(()=>e.api.rate(4,'🙂'.repeat(1024)),/details|long/);
 assert.equal(e.api.current().rating_saved,false);
});
