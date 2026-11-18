/* Guided dogfooding. Browser-local state; no native identity or metric attribution. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root&&root.document)root.SurfaceInputsDogfood=api.create(root);})(typeof window==='undefined'?null:window,function(){
'use strict';
const TASKS=['targeting','scrolling','typing'],SETS={targeting:6,scrolling:6,typing:1};
const PATHS={targeting:'touchpad/index.html',scrolling:'touchpad/scroll.html',typing:'keyboard/index.html'};
function valid(s){return s&&s.version===1&&typeof s.id==='string'&&/^df_[a-zA-Z0-9_-]{1,48}$/.test(s.id)&&Number.isInteger(s.stage)&&s.stage>=0&&s.stage<=3&&Array.isArray(s.tasks)&&s.tasks.length===3&&s.tasks.every((t,i)=>t&&Number.isInteger(t.sets)&&t.sets>=0&&t.sets<=SETS[TASKS[i]]&&['idle','running','waiting_ack','retention_wait','feedback','sent','sent_wait_ack','skipped','skipped_wait_ack'].includes(t.phase));}
function create(win){
 const doc=win.document, script=doc.currentScript, base=new URL('.',script?script.src:new URL('dogfood-flow.js',win.location.href));
 const env=win.location.pathname.split('/')[1],dev=env==='surface-inputs-dev',key='arcade-dogfood-v1:'+env;
 let state=null,nextSet=null,waiting=null,status=null,progress=null,retentionRetry=null;
 const sdk=()=>win.SurfaceInputsTransport;
 const native=()=>sdk()&&sdk().usesNative();
 const query=new URLSearchParams(win.location.search),run=query.get('dogfood');
 try{const raw=win.sessionStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(valid(parsed))state=parsed;}}catch(_){/* diagnosed on Start */}
 function persist(){if(!valid(state))throw new Error('Invalid dogfood session. Return to the main page.');win.sessionStorage.setItem(key,JSON.stringify(state));}
 function current(){return state&&TASKS[state.stage];}
 const failed=()=>doc.documentElement&&doc.documentElement.classList.contains('dogfood-startup-failed');
 function active(task){return !!(!failed()&&run&&state&&run===state.id&&current()===task);}
 function context(task=current()){return state?state.id+'_'+task:null;}
 function show(text){if(status)status.textContent=text;}
 function update(){if(!progress||!state)return;const task=current();progress.textContent=task?task.charAt(0).toUpperCase()+task.slice(1)+(task==='typing'?'':' · Set '+Math.min(state.tasks[state.stage].sets+1,SETS[task])+' of '+SETS[task]):'';}
 function destination(){if(state.stage===3)return new URL('thanks.html?dogfood='+encodeURIComponent(state.id),base).href;const u=new URL(PATHS[current()],base);u.searchParams.set('dogfood',state.id);u.searchParams.set('session_id',state.session);if(current()==='typing'){u.searchParams.set('setting_preset','df');u.searchParams.set('num_prompts','20');u.searchParams.set('dataset','natural-language-punct');}return u.href;}
 function readyAction(action){if(failed()){waiting=null;return;}if(native()&&sdk().pendingCount()){waiting=action;show('Waiting for pending telemetry to be accepted. Retry pending telemetry if needed.');return;}waiting=null;action();}
 win.addEventListener('surface-inputs-ack',()=>{if(waiting&&!sdk().pendingCount()){const action=waiting;waiting=null;show('');action();}});
 function advance(){state.stage++;persist();win.location.assign(destination());}
 function begin(task){if(!active(task))return null;
 if(!/^[a-zA-Z0-9_-]{1,64}$/.test(state.participant||'')){show('Enter your unixname on the main page and start a new run before collecting Forms results.');return false;}
 if(!win.SurfaceInputsTaskUploads){show('The Forms module is unavailable. Reload before starting the task.');return false;}
 try{if(!win.SurfaceInputsTaskUploads.canBegin(task==='typing'?20:6)){show('Saved Forms records are full. Export/review them before starting.');return false;}}catch(error){show('Forms storage is unavailable: '+error.message);return false;}
 const entry=state.tasks[state.stage];
 if(entry.phase==='retention_wait'){if(retentionRetry){entry.phase='running';persist();retentionRetry();}return false;}
 if(['waiting_ack','sent_wait_ack','skipped_wait_ack'].includes(entry.phase)||(native()&&sdk().pendingCount())){show('Wait for telemetry acceptance before starting another set.');return false;}
 if(entry.phase==='feedback'||entry.phase==='sent'||entry.phase==='skipped')return false;entry.phase='running';persist();doc.body.classList.remove('dogfood-transition');doc.body.classList.add('dogfood-started');update();show('');return context(task);}
 function complete(task,restart,activity){if(!active(task))return false;const entry=state.tasks[state.stage];if(entry.phase!=='running')return true;doc.body.classList.add('dogfood-transition');entry.sets++;entry.phase=entry.sets>=SETS[task]?'feedback':'idle';persist();update();
  if(entry.phase==='feedback'){win.SurfaceInputsFeedback.complete(activity,context(task));}
  else{nextSet=restart;
   if(native()&&sdk().pendingCount()){entry.phase='waiting_ack';persist();}
   readyAction(()=>{entry.phase='idle';persist();win.setTimeout(()=>{if(active(task)&&state.tasks[state.stage].phase==='idle')restart();},0);});}
  return true;
 }
 function pauseCompletion(task,retry){if(!active(task))return;doc.body.classList.remove('dogfood-transition');doc.body.classList.remove('dogfood-started');const stage=doc.getElementById(task==='targeting'?'experience-screen':'scroll-body');if(stage)stage.style.display='none';const setup=doc.getElementById('start-screen');if(setup)setup.style.display='';state.tasks[state.stage].phase='retention_wait';retentionRetry=retry;persist();show('Completed result is not saved. Press Start to retry saving it; do not reload.');}
 function feedbackDone(expectedContext){if(failed())return false;if(!run||!state||run!==state.id||expectedContext!==context())return false;const entry=state.tasks[state.stage];if(entry.phase!=='feedback'&&entry.phase!=='sent')return false;entry.phase=native()&&sdk().pendingCount()?'sent_wait_ack':'sent';persist();readyAction(advance);return true;}
 function retryContinuation(expectedContext){
  if(failed()||!state||!run||run!==state.id)return false;
  const index=TASKS.findIndex(task=>state.id+'_'+task===expectedContext);if(index<0)return false;
  const phase=state.tasks[index].phase;
  if(state.stage===index&&['feedback','sent','sent_wait_ack'].includes(phase)){
   if(phase==='sent_wait_ack'){persist();readyAction(advance);return true;}
   return feedbackDone(expectedContext);
  }
  if(state.stage===index+1&&['sent','sent_wait_ack'].includes(phase)){persist();readyAction(()=>win.location.assign(destination()));return true;}
  return false;
 }
 function skip(){if(failed())return;if(!dev||!run||!state||run!==state.id)return;win.dispatchEvent(new win.CustomEvent('dogfood-task-abort'));state.tasks[state.stage].phase=native()&&sdk().pendingCount()?'skipped_wait_ack':'skipped';persist();readyAction(()=>{state.tasks[state.stage].phase='skipped';persist();advance();});}
 function mount(){
  if(failed())return;
  const start=doc.getElementById('start-dogfooding');if(start)start.addEventListener('click',()=>{
   try{
    const initial=doc.getElementById('unix-name');
    const participant=initial?initial.value.trim():'';
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(participant)){doc.getElementById('landing-status').textContent='Enter your unixname to start dogfooding.';if(initial)initial.focus();return;}
    state={version:1,id:'df_'+win.crypto.randomUUID(),stage:0,session:query.get('session_id')||'dogfood_'+new Date().toISOString().slice(0,10),participant,tasks:TASKS.map(()=>({sets:0,phase:'idle'}))};persist();readyAction(()=>win.location.assign(destination()));
   }catch(error){doc.getElementById('landing-status').textContent=error.message;}
  });
  if(!run)return;
  if(!state||run!==state.id){win.location.replace(new URL('index.html',base).href);return;}
  if(win.location.pathname.endsWith('/thanks.html')){if(state.stage!==3)win.location.replace(destination());return;}
  if(state.stage===3||!win.location.pathname.endsWith('/'+PATHS[current()])){win.location.replace(destination());return;}
  const task=current();doc.body.classList.add('guided-dogfood');
  const utilities=doc.createElement('div');utilities.id='dogfood-utilities';progress=doc.createElement('span');progress.id='dogfood-progress';utilities.appendChild(progress);
  if(dev){const button=doc.createElement('button');button.type='button';button.id='dogfood-skip';button.textContent='Skip task';button.addEventListener('click',skip);utilities.appendChild(button);}
  status=doc.createElement('p');status.id='dogfood-status';status.setAttribute('role','status');utilities.appendChild(status);doc.body.appendChild(utilities);update();
  // Browser identity is entered once on the landing page. Native identity stays host-owned.
  for(const id of ['button-pad-id','unix-name','user-id']){
   const input=doc.getElementById(id);if(input){input.value=state.participant||'';input.readOnly=true;input.dispatchEvent(new win.Event('input',{bubbles:true}));}
  }
  if(doc.documentElement)doc.documentElement.classList.remove('dogfood-loading');
  if(['waiting_ack','sent_wait_ack','skipped_wait_ack'].includes(state.tasks[state.stage].phase)){const start=doc.getElementById('start-button');if(start)start.disabled=true;const typing=doc.getElementById('input-area');if(typing)typing.disabled=true;show('This page was reloaded before telemetry acceptance was confirmed. Return to the main page to restart; do not assume the previous set uploaded.');return;}
  if(state.tasks[state.stage].phase==='retention_wait'){state.tasks[state.stage].phase='idle';persist();show('The previous completion was not saved before reload. Repeat this set.');}
  if(state.tasks[state.stage].phase==='sent'||state.tasks[state.stage].phase==='skipped'){readyAction(advance);return;}
  if(state.tasks[state.stage].phase==='feedback'){const activity=task==='typing'?'keyboard_punctuation':'touchpad_'+task;win.setTimeout(()=>win.SurfaceInputsFeedback.complete(activity,context(task)),0);}
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 return{active,begin,complete,pauseCompletion,continuingSet:task=>active(task)&&state.tasks[state.stage].phase==='running'&&state.tasks[state.stage].sets<SETS[task]-1,context,feedbackDone,retryContinuation,isGuided:()=>!!(run&&state&&run===state.id),isFinal:()=>!!(run&&state&&state.stage===2),skip,isDevelopment:dev,
   getState:()=>state?JSON.parse(JSON.stringify(state)):null,participant:()=>state?state.participant:'',show,sets:SETS};
}
return{create,valid,tasks:TASKS,sets:SETS};});
