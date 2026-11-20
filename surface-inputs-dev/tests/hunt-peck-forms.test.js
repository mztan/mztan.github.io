'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {environment}=require('./harness.js');
const {attach}=require('./files-form-fixture.js');
const profileModule=require('../keyboard/typing-task.js');
const shim=require('../keyboard/hunt-peck-forms.js');
const dispatcher=require('../files-forms.js');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const key=(value,extra={})=>({type:'keydown',key:value,code:value,keyCode:0,shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,...extra});
async function setup(mode='browser',configured=true) {
 const e=environment('?task=hunt-and-peck'); const m=new Map();
 e.win.location={origin:'https://mztan.github.io',pathname:'/surface-inputs-dev/keyboard/index.html',search:'?task=hunt-and-peck'};
 e.win.SurfaceInputsTypingTask=profileModule;
 e.win.localStorage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};
 attach(e.win,e.requests);e.win.SurfaceInputsFilesFormsConfig.enabled=configured;e.win.SurfaceInputsFilesFormsConfig.fieldsVerified=configured;
 e.win.document.readyState='complete';e.win.SurfaceInputsTaskUploads={result(){throw Error('Old primary Form must not run');},stageResult(){throw Error('Old primary Form must not run');}};
 e.doc.getElementById('unix-name').value='fixture-web-label';
 e.context.fetch=async()=>({ok:true,text:async()=>Array.from({length:12},(_,i)=>'Hello, prompt '+i+'!').join('\n')});
 e.dataset.value='natural-language-punct';
 e.load('transport.js');e.load('keyboard-capture.js');e.load('keyboard/keyboard-layout.js');e.load('keyboard/hunt-peck-forms.js');
 if(mode!=='browser'){e.port.capabilityBehavior=mode;e.ready();}
 e.load('keyboard/script.js');
 for(const fn of e.doc.listeners.get('DOMContentLoaded')||[])await fn();
 return{...e,m,profile:profileModule.profile(e.win.location),shim:e.win.SurfaceInputsTaskUploads};
}
function typePrompt(e,index=0) {
 const input=e.doc.getElementById('input-area');const prompt=e.doc.getElementById('sample-text').innerText;
 const base=1000+index*2000;e.setNow(base);
 input.dispatchEvent(key('x'));input.value='x';input.selectionStart=input.selectionEnd=1;input.dispatchEvent({type:'input',data:'x',inputType:'insertText'});
 e.setNow(base+100);input.dispatchEvent(key('Backspace'));input.value='';input.selectionStart=input.selectionEnd=0;input.dispatchEvent({type:'input',inputType:'deleteContentBackward'});
 e.setNow(base+200);input.dispatchEvent(key(prompt[0]));input.value=prompt;input.selectionStart=input.selectionEnd=prompt.length;input.dispatchEvent({type:'input',data:prompt,inputType:'insertText'});
 e.setNow(base+800);input.dispatchEvent(key('Enter'));
 return prompt;
}

test('actual H&P core emits ten full prompt captures to dedicated Form and never old primary collectors',async()=>{
 for(const mode of ['browser','v2']) {
  const e=await setup(mode);const rows=[];
  assert.equal(e.doc.getElementById('total-prompts').textContent,10);
  assert.equal(e.doc.getElementById('input-area').disabled,false);
  for(let i=0;i<10;i++){rows.push(typePrompt(e,i));if(mode==='v2')e.port.sent.filter(m=>m.type!=='ready').forEach(m=>e.port.receive({version:m.version,id:m.id,status:'accepted'}));}
  await settle();assert.equal(e.requests.length,10);
  const fields=require('./files-form-fixture.js').config().fields;
  e.requests.forEach((request,i)=>{
   assert.equal(request.options.body.get(fields.task_id),'keyboard_hunt_and_peck');
   assert.equal(request.options.body.get(fields.participant_label),'fixture-web-label');
   const result=JSON.parse(request.options.body.get(fields.results_json));
   assert.equal(result.prompt_text,rows[i]+'⏎');assert.equal(result.final_text,rows[i]);
   assert.equal(result.input_event_stream,'x⌫'+rows[i]+'⏎');
   assert.deepEqual(result.prescription,e.profile.prescription);assert.equal(result.task_profile,e.profile.id);
   if(mode==='v2') {
    const native=e.port.sent.filter(message=>message.type==='keyboard')[i];
    assert.equal(result.prompt_text,native.prompt_text);
    assert.equal(result.input_event_stream,native.input_event_stream);
   }
   assert.equal(result.result.promptText,rows[i]);assert.equal(result.result.typedText,rows[i]);
   assert.equal(result.result.correctedErrors,1);
   assert.equal(result.result.timeSpentMs,200);assert(!('user_id'in result.result));
  });
  const run=e.shim.current();assert.equal(run.prompts.length,10);assert.equal(new Set(e.requests.map(q=>q.options.body.get(fields.submission_id))).size,10);
  const feedback={id:'feedback_fixture_'+mode,activity_id:'keyboard_punctuation',round_id:run.id,ratings:{ease:4},comment:'Fixture freeform'};
  e.shim.reserveFeedbackContext(feedback);await e.shim.feedback(feedback);
  assert.equal(e.requests.length,11);assert.equal(e.requests[10].options.body.get(fields.comment),'Fixture freeform');
  if(mode==='v2') {
   assert.equal(e.port.sent.filter(m=>m.type==='keyboard').length,10);assert.equal(e.port.sent.filter(m=>m.event_name==='uxr_result').length,10);
   e.port.sent.filter(m=>m.type!=='ready').forEach(m=>{assert(!JSON.stringify(m).includes('fixture-web-label'));});
  } else assert.equal(e.port.sent.filter(m=>m.type!=='ready').length,0);
 }
});

test('disabled configuration, missing label, full storage and legacy capabilities block before capture/timing',async()=>{
 const disabled=await setup('browser',false);assert.equal(disabled.doc.getElementById('input-area').disabled,true);
 assert.match(disabled.doc.getElementById('input-area').placeholder,/not configured/);assert.equal(disabled.m.size,0);
 const legacy=await setup('legacy');assert.equal(legacy.doc.getElementById('input-area').disabled,true);
 const e=await setup();e.doc.getElementById('unix-name').value='';e.doc.getElementById('unix-name').dispatchEvent({type:'input'});
 assert.equal(e.doc.getElementById('input-area').disabled,true);
 const full=await setup();const key=dispatcher.storageKey+':keyboard_hunt_and_peck';full.m.set(key,JSON.stringify(Array.from({length:100},(_,i)=>({id:String(i)}))));
 full.doc.getElementById('unix-name').dispatchEvent({type:'input'});assert.equal(full.doc.getElementById('input-area').disabled,true);
 assert.equal(full.requests.length,0);assert.equal(full.shim.current(),null);
});

test('failed Form dispatch retains full prompt and retries only Forms with original bytes',async()=>{
 const e=await setup('v2');let fail=true;e.win.fetch=async(url,options)=>{e.requests.push({url,options});if(fail)throw Error('fixture network failure');return{type:'opaque',ok:false,status:0};};
 const prompt=typePrompt(e);await settle();const messages=e.port.sent.filter(m=>m.type!=='ready');messages.forEach(m=>e.port.receive({version:m.version,id:m.id,status:'accepted'}));
 assert.equal(e.requests.length,1);const first=e.requests[0].options.body.toString();
 e.win.confirm=()=>true;fail=false;await e.shim.retryForms();
 assert.equal(e.requests.length,2);assert.equal(e.requests[1].options.body.toString(),first);assert.equal(e.port.sent.filter(m=>m.type!=='ready').length,messages.length);
 await e.shim.retryForms();assert.equal(e.requests.length,2);
 assert.equal(e.shim.current().prompts[0].results.input_event_stream,'x⌫'+prompt+'⏎');
});

test('reloaded/reset shim never posts historical records and context is web-owned and stable',async()=>{
 const e=await setup();typePrompt(e);await settle();const old=e.shim.current();
 const reloaded=shim.create(e.win,e.profile);assert.equal(reloaded.current(),null);assert.equal(e.requests.length,1);
 assert(JSON.parse(reloaded.exportRecords()).runs.some(r=>r.id===old.id));
 await assert.rejects(reloaded.retryForms(),/No H&P run/);
 e.shim.reset();e.doc.getElementById('unix-name').value='new-fixture-label';const context=e.shim.begin('new-fixture-label');
 assert.notEqual(context,old.id);assert.equal(e.requests.length,1);
});

test('native queue backpressure retries completion without a second Enter or Form row',async()=>{
 const e=await setup('v2'),sdk=e.win.SurfaceInputsTransport;
 for(let i=0;i<32;i++)sdk.submitKeyboard({id:'queue_'+i,activity_id:'keyboard_natural_language',elapsed_ms:1,prompt_id:'fixture',prompt_text:'x',input_event_stream:'x',details:{details_version:1}});
 const prompt=typePrompt(e);await settle();assert.equal(e.requests.length,0);assert.equal(e.shim.current().prompts.length,1);
 assert.equal(e.doc.getElementById('input-area').readOnly,true);
 e.port.sent.filter(m=>m.id&&m.id.startsWith('queue_')).forEach(m=>e.port.receive({version:m.version,id:m.id,status:'accepted'}));
 e.doc.getElementById('input-area').dispatchEvent(key('Enter'));await settle();
 assert.equal(e.requests.length,1);const result=JSON.parse(e.requests[0].options.body.get(require('./files-form-fixture.js').config().fields.results_json));
 assert.equal(result.input_event_stream,'x⌫'+prompt+'⏎');assert.equal(e.shim.current().prompts.length,1);
});

test('completion storage failure retains original full stream and timing until Enter retry',async()=>{
 const e=await setup('v2');const input=e.doc.getElementById('input-area'),original=e.win.localStorage.setItem;
 let fail=true;e.win.localStorage.setItem=(key,value)=>{if(fail&&key===shim.storageKey&&JSON.parse(value).some(run=>run.prompts.length))throw Error('fixture result storage failure');original(key,value);};
 const prompt=typePrompt(e);await settle();assert.equal(input.readOnly,true);assert.equal(e.requests.length,0);
 assert.equal(e.port.sent.filter(m=>m.type!=='ready').length,0);
 fail=false;e.setNow(9000);input.dispatchEvent(key('Enter'));await settle();
 assert.equal(e.requests.length,1);const body=e.requests[0].options.body,fields=require('./files-form-fixture.js').config().fields,result=JSON.parse(body.get(fields.results_json));
 assert.equal(result.input_event_stream,'x⌫'+prompt+'⏎');assert.equal(result.result.timeSpentMs,200);assert.equal(e.shim.current().prompts.length,1);
 const keyboard=e.port.sent.filter(message=>message.type==='keyboard');
 const uxr=e.port.sent.filter(message=>message.event_name==='uxr_result');
 assert.equal(keyboard.length,1);assert.equal(uxr.length,1);
 assert.equal(keyboard[0].elapsed_ms,result.result.timeSpentMs);
 assert.equal(uxr[0].elapsed_ms,result.result.timeSpentMs);
 assert.equal(JSON.parse(uxr[0].details).result.timeSpentMs,result.result.timeSpentMs);
 assert.equal(keyboard[0].input_event_stream,'x⌫'+prompt+'⏎');
});

test('ordinary typing formula/capture sections are unchanged outside H&P conditional hooks',()=>{
 const child=require('node:child_process');const parent=child.execFileSync('git',['show','a3f1007cb0ef5938a26bbad92ca6a66ef6fef516:surface-inputs-dev/keyboard/script.js'],{encoding:'utf8'});
 const actual=fs.readFileSync(path.join(__dirname,'../keyboard/script.js'),'utf8');
 const section=s=>s.slice(s.indexOf('    function calculatePromptResult('),s.indexOf('    function submitPromptResultToGoogleForm('));
 assert.equal(section(actual),section(parent));
 assert(actual.includes("if(!taskProfile&&!pendingNativeCompletion.formsRetained&&winForms())"));
 assert(actual.includes("if (!taskProfile) document.addEventListener('promptFinishedEvent'"));
});
