'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const flow=require('../dogfood-flow.js'),upload=require('../task-uploads.js'),config=require('../forms-config.js');
function memory(){const m=new Map();return{get length(){return m.size},key:i=>[...m.keys()][i]||null,getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function setup(offline=false){const saved=memory(),requests=[];const state={participant:'fixture-user',session:'fixture-session'};let n=0;const win={localStorage:saved,location:{pathname:'/surface-inputs-dev/touchpad/index.html'},crypto:{randomUUID:()=>String(++n)},URLSearchParams,AbortController,setTimeout,clearTimeout,SurfaceInputsTransport:{usesNative:()=>false,setBrowserFeedbackCallback(cb){this.callback=cb}},SurfaceInputsDogfood:{active:()=>true,context:()=> 'block-fixture',getState:()=>state,show(){}},fetch:async(url,opts)=>{requests.push({url,body:opts.body});if(offline)throw new Error('offline');return{type:'opaque',ok:false,status:0};}};const mock=JSON.parse(JSON.stringify(config));for(const form of Object.values(mock.forms)){form.enabled=true;let i=0;for(const key of ['participant_id','device_os','device_browser','trial_num','time_to_complete','session_id','gesture_count','task_block_id','submission_type','feedback_id','ease','comment'])form.fields[key]='entry.'+(++i);}return{win,saved,requests,mock,api:upload.create(win,mock)};}
function fakeForm(values){return{elements:Object.entries(values).map(([id,value])=>({id,value,name:'entry.1'}))};}
test('initial explicit unixname is required for both browser and APK Forms',()=>{
 const {environment}=require('./harness.js');
 for(const native of [false,true]){
  const e=environment();const state=memory(),destinations=[];
  e.win.sessionStorage=state;e.win.location={href:'https://mztan.github.io/surface-inputs-dev/index.html',pathname:'/surface-inputs-dev/index.html',search:'',assign:u=>destinations.push(u)};
  e.doc.currentScript={src:'https://mztan.github.io/surface-inputs-dev/dogfood-flow.js'};e.doc.readyState='loading';e.doc.documentElement.classList.contains=()=>false;e.win.SurfaceInputsTransport={usesNative:()=>native,pendingCount:()=>0};
  flow.create(e.win);e.doc.dispatchEvent({type:'DOMContentLoaded'});
  const start=e.doc.getElementById('start-dogfooding');start.click();
  assert.equal(destinations.length,0);e.doc.getElementById('unix-name').value='  fixture-user  ';start.click();
  const saved=JSON.parse(state.getItem('arcade-dogfood-v1:surface-inputs-dev'));assert.equal(saved.participant,'fixture-user');assert.equal(destinations.length,1);
 }
});
test('guided Typing uses twenty existing punctuation prompts and matching reload feedback family',()=>{
 const fs=require('node:fs'),path=require('node:path'),source=fs.readFileSync(path.join(__dirname,'../dogfood-flow.js'),'utf8');
 assert(source.includes("set('num_prompts','20')"));assert(source.includes("set('dataset','natural-language-punct')"));assert(source.includes("canBegin(task==='typing'?20:6)"));assert(source.includes("task==='typing'?'keyboard_punctuation'"));
 const css=fs.readFileSync(path.join(__dirname,'../dogfood-flow.css'),'utf8');assert(css.includes('.guided-dogfood #user-id-group,.guided-dogfood #unix-name-group,.guided-dogfood #button-pad-id{display:none!important}'));
});
test('between-set guided setup is hidden while standalone Practice and recovery remain reachable',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'..');const css=fs.readFileSync(path.join(root,'dogfood-flow.css'),'utf8');
 assert(css.includes('.guided-dogfood.dogfood-started .start-screen{display:none!important}'));
 assert(css.includes('.guided-dogfood.dogfood-transition #experience-screen *,.guided-dogfood.dogfood-transition #scroll-body *{pointer-events:none!important}'));
 const code=fs.readFileSync(path.join(root,'dogfood-flow.js'),'utf8');assert(code.includes("doc.body.classList.remove('dogfood-started')"));assert(code.includes("state.tasks[state.stage].sets<SETS[task]-1"));
});
test('guided startup hides uninitialized task UI but has a visible load-failure escape',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'..');
 for(const file of ['touchpad/index.html','touchpad/scroll.html','keyboard/index.html']){const html=fs.readFileSync(path.join(root,file),'utf8');assert(html.includes('html.dogfood-loading body{visibility:hidden}'));assert(html.includes("new URLSearchParams(location.search).has('dogfood')"));assert(html.includes('10000'));assert(html.includes("home.href = '../index.html'"));assert(html.indexOf("classList.add('dogfood-loading')")<html.indexOf('dogfood-flow.js'));}
 const code=fs.readFileSync(path.join(root,'dogfood-flow.js'),'utf8');assert(code.includes("doc.documentElement.classList.remove('dogfood-loading')"));
});
test('guided task icons remain visible while practice and branding stay hidden',()=>{
 const fs=require('node:fs'),path=require('node:path'),css=fs.readFileSync(path.join(__dirname,'../dogfood-flow.css'),'utf8');
 assert(css.includes('.guided-dogfood #practice-button,.guided-dogfood .arcade-brand{display:none}'));
 assert(!css.includes('.guided-dogfood .arcade-task-icon{display:none}'));
});
test('feedback drain does not resend a result completed while an earlier row is awaited',async()=>{
 const h=setup(),resolve=[];h.win.fetch=(url,opts)=>{h.requests.push({url,body:opts.body});if(opts.body.get(h.mock.forms.scrolling.fields.submission_type)==='result')return new Promise(r=>resolve.push(r));return Promise.resolve({type:'opaque',ok:false,status:0});};
 h.api.result('scrolling',fakeForm({trial_num:'1',gesture_count:'1'}));h.api.result('scrolling',fakeForm({trial_num:'2',gesture_count:'2'}));await new Promise(r=>setImmediate(r));
 const feedback=h.api.feedback({id:'drain-feedback',activity_id:'touchpad_scrolling',round_id:'block-fixture',ratings:{ease:4},comment:'drain test'});
 resolve[1]({type:'opaque',ok:false,status:0});resolve[0]({type:'opaque',ok:false,status:0});await feedback;
 assert.equal(h.requests.length,3);assert.equal(h.requests.filter(r=>r.body.get(h.mock.forms.scrolling.fields.submission_type)==='result').length,2);assert.equal(h.api.getPending().length,0);
});
test('delivered feedback continuation retries storage or navigation without resubmission or double advance',()=>{
 const {environment}=require('./harness.js');
 for(const failure of ['storage','navigation']){
  const e=environment('?dogfood=df_fixture'),saved={version:1,id:'df_fixture',stage:2,session:'fixture',participant:'fixture-user',tasks:[{sets:6,phase:'sent'},{sets:6,phase:'sent'},{sets:1,phase:'feedback'}]};let fail=true,navigations=0;
  e.win.location={href:'https://mztan.github.io/surface-inputs-dev/keyboard/index.html?dogfood=df_fixture',pathname:'/surface-inputs-dev/keyboard/index.html',search:'?dogfood=df_fixture',assign(){if(fail&&failure==='navigation')throw Error('nav failed');navigations++;}};
  e.win.sessionStorage={getItem:()=>JSON.stringify(saved),setItem(){if(fail&&failure==='storage')throw Error('quota');}};
  e.doc.currentScript={src:'https://mztan.github.io/surface-inputs-dev/dogfood-flow.js'};e.doc.readyState='loading';e.doc.documentElement.classList.contains=()=>false;e.win.SurfaceInputsTransport={usesNative:()=>false,pendingCount:()=>0};
  const api=flow.create(e.win);assert.throws(()=>api.feedbackDone('df_fixture_typing'));fail=false;assert(api.retryContinuation('df_fixture_typing'));assert.equal(api.getState().stage,3);assert.equal(navigations,1);
 }
});
test('opaque sent Forms records are retained and never automatically resent across mode changes',async()=>{
 const h=setup();h.api.result('scrolling',fakeForm({trial_num:'1',gesture_count:'0'}));await new Promise(r=>setImmediate(r));
 const record=h.api.getRecords()[0];assert.equal(record.status,'request_sent');h.win.SurfaceInputsTransport.usesNative=()=>true;await h.api.retryBlock('block-fixture');h.win.SurfaceInputsTransport.usesNative=()=>false;await h.api.retryBlock('block-fixture');assert.equal(h.requests.length,1);assert.equal(h.api.getRecords()[0].id,record.id);assert.equal(h.api.getPending().length,0);
});
test('result staging retains before emission and retries the original snapshot after storage failure',async()=>{
 const h=setup();const write=h.saved.setItem;let fail=true;h.saved.setItem=(key,value)=>{if(fail&&key.startsWith('arcade-task-post-v1'))throw Error('quota');write(key,value);};
 assert.equal(h.api.stageResult('scrolling',fakeForm({trial_num:'1',gesture_count:'0',time_to_complete:'1.2'})),false);assert.equal(h.requests.length,0);fail=false;
 assert(h.api.stageResult('scrolling',fakeForm({trial_num:'99',gesture_count:'8',time_to_complete:'99'})));assert.equal(h.requests.length,0);h.api.commitResult('scrolling');h.api.commitResult('scrolling');await new Promise(r=>setImmediate(r));assert.equal(h.requests.length,1);const fields=h.mock.forms.scrolling.fields;assert.equal(h.requests[0].body.get(fields.trial_num),'1');assert.equal(h.requests[0].body.get(fields.gesture_count),'0');assert.equal(h.requests[0].body.get(fields.time_to_complete),'1.2');
});
test('feedback delivery destinations survive updates without converting one receipt into the other',()=>{
 const api=require('../post-task-feedback.js'),storage=memory(),s=api.store(storage),m=api.payload('keyboard_punctuation','fixture-block','fixture-response',4,'');
 s.put(m,'dual_delivery',{forms:'failed',native:'accepted'});s.put(m,'dual_delivery');assert.deepEqual(s.list()[0].deliveries,{forms:'failed',native:'accepted'});
 s.put(m,'dual_delivery',{forms:'request_sent',native:'accepted'});assert.equal(s.list()[0].deliveries.native,'accepted');assert.equal(s.list()[0].deliveries.forms,'request_sent');
});
test('bounded Forms storage blocks a task before starting when full or unwritable',()=>{
 const h=setup();h.saved.setItem=()=>{throw Error('quota');};assert.throws(()=>h.api.canBegin(20),/quota/);
});
test('exported completed Forms records can be cleared without evicting pending rows',()=>{
 const h=setup();for(let i=0;i<256;i++)h.saved.setItem('arcade-task-post-v1:surface-inputs-dev:done'+i,JSON.stringify({id:'done'+i,task:'scrolling',block:'completed'+i,values:{trial_num:'1'},status:'request_sent'}));
 assert.equal(h.api.canBegin(1),false);assert.throws(()=>h.api.clearExportedRecords(),/Export/);h.api.exportRecords();h.win.confirm=()=>true;assert.equal(h.api.clearExportedRecords().removed,256);assert(h.api.canBegin(1));
});
test('completed-record cleanup protects active tasks, native retries and unexported rows',()=>{
 const h=setup();const put=(id,block,status)=>h.saved.setItem('arcade-task-post-v1:surface-inputs-dev:'+id,JSON.stringify({id,task:'scrolling',block,values:{trial_num:'1'},status}));
 put('pending','pending-block','failed');put('sent-pending-block','pending-block','request_sent');put('sent-native','native-block','request_sent');put('old-safe','done-block','request_sent');
 h.saved.setItem('surface-inputs-dev-feedback-v1',JSON.stringify([{message:{round_id:'native-block'},deliveries:{forms:'request_sent',native:'pending'}}]));h.api.exportRecords();put('new-safe','new-block','request_sent');h.win.confirm=()=>true;
 assert.equal(h.api.clearExportedRecords().removed,1);assert.deepEqual(h.api.getRecords().map(r=>r.id),['pending','sent-pending-block','sent-native','new-safe']);
});
test('cleanup preserves a sent receipt while widget Forms state is pending even after native ACK',async()=>{
 const h=setup();h.win.confirm=()=>true;
 await h.api.feedback({id:'receipt-pending-widget',activity_id:'touchpad_scrolling',round_id:'block-fixture',ratings:{ease:4},comment:'retained'});
 h.saved.setItem('surface-inputs-dev-feedback-v1',JSON.stringify([{message:{round_id:'block-fixture'},deliveries:{forms:'pending',native:'accepted'}}]));
 h.api.exportRecords();assert.equal(h.api.clearExportedRecords().removed,0);
 await h.api.feedback({id:'receipt-pending-widget',activity_id:'touchpad_scrolling',round_id:'block-fixture',ratings:{ease:4},comment:'retained'});assert.equal(h.requests.length,1);
});
test('direct native feedback uses the Forms result block, not the separate SDK context',async()=>{
 const h=setup();h.win.SurfaceInputsDogfood.active=()=>false;h.win.SurfaceInputsDogfood.isGuided=()=>false;h.win.SurfaceInputsTransport.usesNative=()=>true;
 h.api.result('targeting',fakeForm({participant_id:'fixture-user',trial_num:'1',condition_num:'2',session_id:'explicit-web-session'}));await new Promise(r=>setImmediate(r));
 const block=h.requests[0].body.get(h.mock.forms.targeting.fields.task_block_id);assert.notEqual(block,'native-sdk-context');
 await h.api.feedback({id:'direct-feedback',activity_id:'touchpad_targeting',round_id:'native-sdk-context',ratings:{ease:4},comment:'direct'});
 const body=h.requests.at(-1).body,f=h.mock.forms.targeting.fields;assert.equal(body.get(f.task_block_id),block);assert.equal(body.get(f.participant_id),'fixture-user');assert.equal(body.get(f.condition_num),'2');assert.equal(body.get(f.session_id),'explicit-web-session');
});
test('a sent feedback receipt can drain a pending result without reposting feedback',async()=>{
 const h=setup();const message={id:'drain-sent-feedback',activity_id:'touchpad_scrolling',round_id:'block-fixture',ratings:{ease:4},comment:'sent'};await h.api.feedback(message);
 h.saved.setItem('arcade-task-post-v1:surface-inputs-dev:late-result',JSON.stringify({id:'late-result',task:'scrolling',block:'block-fixture',values:{trial_num:'1',task_block_id:'block-fixture',submission_type:'result'},status:'failed'}));
 await h.api.feedback(message);assert.equal(h.requests.length,2);assert.equal(h.requests.filter(p=>p.body.get(h.mock.forms.scrolling.fields.submission_type)==='feedback').length,1);assert.equal(h.api.getPending().length,0);
});
test('cleanup protects the actual Forms block when native feedback context differs',async()=>{
 const h=setup();h.win.SurfaceInputsDogfood.active=()=>false;h.win.SurfaceInputsDogfood.isGuided=()=>false;h.api.result('scrolling',fakeForm({participant_id:'fixture-user',trial_num:'1'}));await new Promise(r=>setImmediate(r));
 const message={id:'separate-feedback-context',activity_id:'touchpad_scrolling',round_id:'native-sdk-context',ratings:{ease:4},comment:'separate'};await h.api.feedback(message);
 h.saved.setItem('surface-inputs-dev-feedback-v1',JSON.stringify([{message,deliveries:{forms:'request_sent',native:'pending'}}]));h.api.exportRecords();h.win.confirm=()=>true;assert.equal(h.api.clearExportedRecords().removed,0);assert.equal(h.api.getRecords().length,2);
});
test('direct Forms feedback context survives row-retention failure and reload',async()=>{
 const h=setup(true);h.win.SurfaceInputsDogfood.active=()=>false;h.win.SurfaceInputsDogfood.isGuided=()=>false;
 h.api.result('targeting',fakeForm({participant_id:'fixture-user',trial_num:'1',condition_num:'2',session_id:'explicit-web-session'}));await new Promise(r=>setImmediate(r));const block=h.api.getRecords()[0].block;
 const write=h.saved.setItem;h.saved.setItem=(key,value)=>{if(key.startsWith('arcade-task-post-v1')&&key.endsWith('reload-context-feedback'))throw Error('feedback quota');write(key,value);};
 const message={id:'reload-context-feedback',activity_id:'touchpad_targeting',round_id:'native-sdk-context',ratings:{ease:4},comment:'same'};await assert.rejects(h.api.feedback(message),/quota/);h.saved.setItem=write;
 h.win.fetch=async(url,opts)=>{h.requests.push({url,body:opts.body});return{type:'opaque',ok:false,status:0};};const reloaded=upload.create(h.win,h.mock);await reloaded.feedback(message);
 const last=h.requests.at(-1).body,fields=h.mock.forms.targeting.fields;assert.equal(last.get(fields.task_block_id),block);assert.equal(last.get(fields.condition_num),'2');assert.equal(last.get(fields.session_id),'explicit-web-session');assert.equal(reloaded.getPending().length,0);
});
test('a saved direct response without recoverable Forms context fails explicitly',async()=>{
 const h=setup();h.win.SurfaceInputsDogfood.active=()=>false;h.win.SurfaceInputsDogfood.isGuided=()=>false;
 const message={id:'missing-context',activity_id:'touchpad_targeting',round_id:'native-sdk-context',ratings:{ease:4},comment:'same'};h.saved.setItem('surface-inputs-dev-feedback-v1',JSON.stringify([{message,deliveries:{forms:'pending',native:'accepted'}}]));
 await assert.rejects(h.api.feedback(message),/no retained Forms block/);assert.equal(h.requests.length,0);assert.equal(h.api.getRecords().length,0);
});
test('cleanup protects reserved Forms blocks even when feedback-row and context writes failed',async()=>{
 const h=setup();h.win.SurfaceInputsDogfood.active=()=>false;h.win.SurfaceInputsDogfood.isGuided=()=>false;h.api.result('targeting',fakeForm({participant_id:'fixture-user',trial_num:'1',condition_num:'2',session_id:'explicit-web-session'}));await new Promise(r=>setImmediate(r));const block=h.api.getRecords()[0].block;
 h.saved.removeItem('arcade-task-context-v1:surface-inputs-dev:'+block);const message={id:'reserved-only-feedback',activity_id:'touchpad_targeting',round_id:'native-sdk-context',ratings:{ease:4},comment:'same'};h.saved.setItem('surface-inputs-dev-feedback-v1',JSON.stringify([{message,deliveries:{forms:'pending',native:'accepted',formsBlock:block}}]));
 const reloaded=upload.create(h.win,h.mock);reloaded.exportRecords();h.win.confirm=()=>true;assert.equal(reloaded.clearExportedRecords().removed,0);await reloaded.feedback(message);const body=h.requests.at(-1).body,f=h.mock.forms.targeting.fields;assert.equal(body.get(f.trial_num),'1');assert.equal(body.get(f.condition_num),'2');assert.equal(body.get(f.session_id),'explicit-web-session');
});
test('guided task sequence requires six nine-hit sets and six six-target scroll sets',()=>{assert.deepEqual(flow.tasks,['targeting','scrolling','typing']);assert.deepEqual(flow.sets,{targeting:6,scrolling:6,typing:1});});
test('saved session shape bounds task stages and completed set counts',()=>{const s={version:1,id:'df_fixture',stage:0,tasks:[{sets:0,phase:'idle'},{sets:0,phase:'idle'},{sets:0,phase:'idle'}]};assert(flow.valid(s));assert(!flow.valid({...s,stage:4}));assert(!flow.valid({...s,tasks:[{sets:7,phase:'idle'},...s.tasks.slice(1)]}));});
test('manual prefilled question mappings are enabled after owner-confirmed publication',()=>{const counts={typing:28,targeting:22,scrolling:12};for(const[task,form]of Object.entries(config.forms)){assert.equal(form.enabled,true);assert.equal(form.fieldsVerified,true);assert.equal(Object.keys(form.fields).length,counts[task]);assert.equal(new Set(Object.values(form.fields)).size,counts[task]);assert.match(form.endpoint,/formResponse$/);}});
test('guided result uploads preserve each separate set row and measured zero',async()=>{const h=setup();for(let i=1;i<=6;i++)assert(h.api.result('scrolling',fakeForm({participant_id:'fixture-user',trial_num:String(i),gesture_count:'0',time_to_complete:'1.2',session_id:'fixture-session'})));await new Promise(r=>setImmediate(r));assert.equal(h.requests.length,6);assert(h.requests.every(row=>row.body.get(h.mock.forms.scrolling.fields.gesture_count)==='0'));assert.deepEqual(h.requests.map(r=>r.body.get(h.mock.forms.scrolling.fields.trial_num)),['1','2','3','4','5','6']);});
test('mapping failures retain unsent response and never claim a request was sent',async()=>{const h=setup();h.mock.forms.scrolling.enabled=false;h.api.result('scrolling',fakeForm({trial_num:'1',gesture_count:'0'}));await new Promise(r=>setImmediate(r));assert.equal(h.api.getPending().length,1);assert.equal(h.requests.length,0);await assert.rejects(h.api.feedback({id:'feedback',activity_id:'touchpad_scrolling',round_id:'block-fixture',ratings:{ease:4},comment:'note'}),/not configured/);assert.equal(h.api.getPending().length,2);});
test('feedback uses no metric zeros and resolved opaque POST is only request sent',async()=>{const h=setup();h.api.result('scrolling',fakeForm({participant_id:'fixture-user',trial_num:'1',gesture_count:'3',time_to_complete:'4.2',session_id:'fixture-session'}));await new Promise(r=>setImmediate(r));const outcome=await h.api.feedback({id:'feedback',activity_id:'touchpad_scrolling',round_id:'block-fixture',ratings:{ease:4},comment:''});assert.equal(outcome.status,'request_sent');assert.equal(outcome.storageConfirmed,false);const body=h.requests.at(-1).body,f=h.mock.forms.scrolling;assert.equal(body.has(f.fields.gesture_count),false);assert.equal(body.has(f.fields.time_to_complete),false);assert.equal(body.get(f.fields.task_block_id),'block-fixture');assert.equal(body.get(f.fields.feedback_id),'feedback');});
test('offline failures persist immutable response IDs for retry',async()=>{const h=setup(true);await assert.rejects(h.api.feedback({id:'feedback',activity_id:'touchpad_scrolling',round_id:'block-fixture',ratings:{ease:4},comment:'first'}),/offline/);await assert.rejects(h.api.feedback({id:'feedback',activity_id:'touchpad_scrolling',round_id:'block-fixture',ratings:{ease:4},comment:'changed'}),/Cannot change/);assert.equal(h.api.getPending()[0].values.comment,'first');});
test('native binding does not redirect an independent Forms result',async()=>{const h=setup();h.api.result('scrolling',fakeForm({trial_num:'1',time_to_complete:'1.2'}));h.win.SurfaceInputsTransport.usesNative=()=>true;await new Promise(r=>setImmediate(r));assert.equal(h.requests.length,1);assert.equal(h.api.getPending().length,0);assert.equal(h.api.getRecords()[0].status,'request_sent');});
test('APK mode also submits Forms without treating native state as a receipt',async()=>{const h=setup();h.win.SurfaceInputsTransport.usesNative=()=>true;assert.equal(h.api.result('scrolling',fakeForm({trial_num:'1'})),true);await new Promise(r=>setImmediate(r));assert.equal(h.requests.length,1);assert.equal(h.api.getPending().length,0);assert.equal(h.api.getRecords().length,1);});
