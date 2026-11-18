'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),prod=path.join(root,'../surface-inputs');
const clean=source=>source.replace(/^[ \t]*if\s*\(window\.SurfaceInputsTaskUploads[^\n]*\n/gm,'').replace(/^[ \t]*if \(dogfoodScrollAborted\) return;\n/gm,'').replace(/^[ \t]*browserResultRetained = true;\n/gm,'').replace('function calculatePromptResult(publish = true)','function calculatePromptResult()').replace('if(publish)document.dispatchEvent(promptFinishedEvent);','document.dispatchEvent(promptFinishedEvent);').replace(/^[ \t]*if\(?[^\n]*nativeBound\(\)[^\n]*return;\n/gm,'').replace(/^[ \t]*if\(?[^\n]*SurfaceInputsTransport\.usesNative\(\)[^\n]*return;\n/gm,'').replace(/^var targetingCompletion = null;\n/gm,'').replace(/document.getElementById\('result_user_id'\)\.value = [^\n]*;/g,"document.getElementById('result_user_id').value = FORM_LABEL;");
const read=(dir,file)=>clean(fs.readFileSync(path.join(dir,file),'utf8'));
function section(source,start,end){const first=source.indexOf(start),last=source.indexOf(end,first);assert(first>=0&&last>first);return source.slice(first,last);}
test('fixed capture, metric formulas, corpora and browser Forms submitters remain unchanged',()=>{
 for(const file of ['metrics.js','keyboard-capture.js','keyboard/keyboard-layout.js','touchpad/event-logger.js'])assert.equal(read(root,file),read(prod,file),file);
 const keyboard=read(root,'keyboard/script.js'),base=read(prod,'keyboard/script.js');
 assert.equal(section(keyboard,'    function calculatePromptResult()','    function calculateAverageResults()'),section(base,'    function calculatePromptResult()','    function calculateAverageResults()'));
 assert.equal(keyboard.slice(keyboard.indexOf('    function submitPromptResultToGoogleForm(')),base.slice(base.indexOf('    function submitPromptResultToGoogleForm(')));
 const fitts=read(root,'touchpad/fitts-law.js'),old=read(prod,'touchpad/fitts-law.js');
 assert.equal(fitts.slice(0,fitts.indexOf('var targetingTaskContext')),old.slice(0,old.indexOf(old.includes('var targetingTaskContext')?'var targetingTaskContext':'function startExperience()')));
 assert.equal(section(fitts,'\t// Compute IDe','    // Extra UXR'),section(old,'\t// Compute IDe',old.includes('    // Extra UXR')?'    // Extra UXR':'\tif (!isPractice)'));
 assert.equal(fitts.slice(fitts.indexOf('function submitForm(')),old.slice(old.indexOf('function submitForm(')));
 const scroll=read(root,'touchpad/scripts_dc.js'),oldScroll=read(prod,'touchpad/scripts_dc.js');
 assert.equal(scroll.slice(scroll.indexOf('function startTimer()')),oldScroll.slice(oldScroll.indexOf('function startTimer()')));
});
test('no-preset native keyboard must actually stage a Forms row before either native observation',async()=>{
 const {environment}=require('./harness.js'),e=environment();e.port.capabilityBehavior='v2';e.load('transport.js');e.load('keyboard-capture.js');e.load('keyboard/keyboard-layout.js');e.ready();let retain=false,staged=0,committed=0;
 e.win.SurfaceInputsTaskUploads={stageResult(){staged++;return retain;},commitResult(){committed++;}};
 e.load('keyboard/script.js');for(const listener of e.doc.listeners.get('DOMContentLoaded')||[])await listener();
 const input=e.doc.getElementById('input-area'),prompt=e.doc.getElementById('sample-text').innerText;e.doc.getElementById('unix-name').value='FORM_ONLY_FIXTURE_LABEL';
 input.value=prompt;input.dispatchEvent({type:'input',data:prompt,inputType:'insertText'});input.dispatchEvent({type:'keydown',key:'Enter',code:'Enter',keyCode:13});
 assert.equal(e.port.sent.filter(m=>m.type==='keyboard').length,0);assert.equal(input.readOnly,true);assert.equal(committed,0);retain=true;input.dispatchEvent({type:'keydown',key:'Enter',code:'Enter',keyCode:13});
 const typed=e.port.sent.find(m=>m.type==='keyboard'),opaque=e.port.sent.find(m=>m.event_name==='uxr_result');assert(typed&&opaque);assert.equal(staged,2);assert.equal(committed,1);assert.equal(typed.input_event_stream,prompt+'⏎');assert(!JSON.stringify([typed,opaque]).includes('FORM_ONLY_FIXTURE_LABEL'));assert.equal(e.doc.getElementById('result_user_id').value,'FORM_ONLY_FIXTURE_LABEL');
});
test('typed plus UXR keyboard completion is atomic and preserves first completion timing on backpressure',async()=>{
 const {environment}=require('./harness.js');const e=environment('?setting_preset=df');e.port.capabilityBehavior='v2';
 e.load('transport.js');e.load('transport-ui.js');e.load('keyboard-capture.js');e.load('keyboard/keyboard-layout.js');e.ready();e.load('keyboard/script.js');
 for(const listener of e.doc.listeners.get('DOMContentLoaded')||[])await listener();
 const sdk=e.win.SurfaceInputsTransport;
 for(let i=0;i<31;i++)sdk.submitArcadeEvent({id:'fill'+i,task_id:'fixture',event_name:'fixture',details:{details_version:1}});
 const input=e.doc.getElementById('input-area'),prompt=e.doc.getElementById('sample-text').innerText;
 input.value=prompt;input.dispatchEvent({type:'input',data:prompt,inputType:'insertText'});e.setNow(1040);input.dispatchEvent({type:'keydown',key:'Enter',code:'Enter',keyCode:13});
 assert.equal(input.readOnly,true);assert.equal(input.value,prompt);assert.equal(e.port.sent.filter(message=>message.type==='keyboard').length,0);assert.equal(sdk.pendingCount(),31);
 e.port.receive({version:2,id:'fill0',status:'accepted'});e.port.receive({version:2,id:'fill1',status:'accepted'});e.setNow(5000);input.dispatchEvent({type:'keydown',key:'Enter',code:'Enter',keyCode:13});
 const typed=e.port.sent.find(message=>message.type==='keyboard'),result=e.port.sent.find(message=>message.event_name==='uxr_result');
 assert(typed&&result);assert.equal(typed.elapsed_ms,0);assert.equal(JSON.parse(result.details).result.timeSpentMs,0);assert.equal(typed.input_event_stream,prompt+'⏎');assert.equal(input.readOnly,false);
 assert.equal(e.port.sent.filter(message=>message.type==='keyboard').length,1);assert.equal(e.port.sent.filter(message=>message.event_name==='uxr_result').length,1);
});
test('full 2048-byte typing snapshot retries without appending a second Enter',async()=>{
 const {environment}=require('./harness.js');const e=environment();e.port.capabilityBehavior='v2';e.load('transport.js');e.load('keyboard-capture.js');e.load('keyboard/keyboard-layout.js');e.ready();
 let capture;const create=e.win.SurfaceInputsKeyboardCapture.createCapture;e.win.SurfaceInputsKeyboardCapture.createCapture=(...args)=>(capture=create(...args));e.load('keyboard/script.js');for(const listener of e.doc.listeners.get('DOMContentLoaded')||[])await listener();
 const sdk=e.win.SurfaceInputsTransport;for(let i=0;i<31;i++)sdk.submitArcadeEvent({id:'bfill'+i,task_id:'fixture',event_name:'fixture',details:{details_version:1}});
 const input=e.doc.getElementById('input-area'),prompt=e.doc.getElementById('sample-text').innerText;input.value=prompt;input.dispatchEvent({type:'input',data:prompt,inputType:'insertText'});capture.reset();assert(capture.appendLabel('x'.repeat(2045)));input.dispatchEvent({type:'keydown',key:'Enter',code:'Enter',keyCode:13});assert.equal(sdk.utf8Bytes(capture.stream()),2048);assert.equal(input.readOnly,true);
 for(let i=0;i<2;i++)e.port.receive({version:2,id:'bfill'+i,status:'accepted'});input.dispatchEvent({type:'keydown',key:'Enter',code:'Enter',keyCode:13});const typed=e.port.sent.find(message=>message.type==='keyboard');assert(typed);assert.equal(sdk.utf8Bytes(typed.input_event_stream),2048);assert(typed.input_event_stream.endsWith('⏎'));assert.equal(input.readOnly,false);
});
test('final scrolling completion is one-shot and does not create a terminal in-target highlight',()=>{
 const {environment}=require('./harness.js'),vm=require('node:vm');const e=environment();e.port.capabilityBehavior='v2';e.load('transport.js');e.ready();e.context.EventLogger=new Proxy({},{get:()=>()=>{}});e.context.EXPERIENCE_NAME='Scroll';e.load('touchpad/scripts_dc.js');
 e.doc.querySelectorAll=query=>{if(query==='.scroll-text')throw new Error('Terminal task must not generate highlights');return [];};
 vm.runInContext("successfulClicks=6;elapsed=1200;gestureCount=3;scrollingTaskContext='fixture-context';highlightRandomPhraseScroll();highlightRandomPhraseScroll()",e.context);
 assert.equal(e.port.sent.filter(message=>message.event_name==='uxr_result').length,1);assert.equal(vm.runInContext('trialNum',e.context),2);assert.equal(JSON.parse(e.port.sent.at(-1).details).result.trial_num,1);
});

test('cursor completion snapshots survive queue pressure without partial family submission',()=>{
 const {environment}=require('./harness.js');const e=environment();e.port.capabilityBehavior='v2';e.load('transport.js');e.load('metrics.js');e.load('touchpad-observer.js');e.ready();const sdk=e.win.SurfaceInputsTransport,observer=e.win.SurfaceInputsTouchpad;
 for(let i=0;i<30;i++)sdk.submitArcadeEvent({id:'cfill'+i,task_id:'fixture',event_name:'fixture',details:{details_version:1}});
 observer.cursorMove(0,0);observer.beginCursor({x:100,y:0,w:20},false);e.setNow(1100);observer.cursorMove(100,0);assert.equal(observer.cursorClick(100,0,true),false);assert.equal(e.port.sent.filter(m=>m.type==='touchpad').length,0);
 for(let i=0;i<3;i++)e.port.receive({version:2,id:'cfill'+i,status:'accepted'});e.setNow(9000);assert.equal(observer.cursorClick(100,0,true),true);
 const messages=e.port.sent.filter(m=>m.type==='touchpad');assert.equal(messages.length,2);assert.equal(messages[0].elapsed_ms,100);assert.equal(messages[0].stp_cursor_movement_time_ms,100);assert.equal(messages[1].stp_clicks_total,1);
});
