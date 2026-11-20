/* DEV guided dogfooding. Versioned browser-local state; no host identity or metric attribution. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root&&root.document)root.SurfaceInputsDogfood=api.create(root);})(typeof window==='undefined'?null:window,function(){
'use strict';
const TASKS=['targeting','scrolling','typing','hunt_peck','menu'],SETS={targeting:6,scrolling:6,typing:1,hunt_peck:1,menu:1};
const PATHS={targeting:'touchpad/index.html',scrolling:'touchpad/scroll.html',typing:'keyboard/index.html',hunt_peck:'keyboard/index.html',menu:'touchpad/menu.html'};
const LABELS={targeting:'Targeting',scrolling:'Scrolling',typing:'Typing',hunt_peck:'Hunt-and-peck typing',menu:'Menu'};
const PHASES=['idle','running','waiting_ack','retention_wait','feedback','sent','sent_wait_ack','skipped','skipped_wait_ack'];
function valid(s){return !!(s&&s.version===3&&typeof s.id==='string'&&/^df_[a-zA-Z0-9_-]{1,48}$/.test(s.id)&&Number.isInteger(s.stage)&&s.stage>=0&&s.stage<=TASKS.length&&Array.isArray(s.tasks)&&s.tasks.length===TASKS.length&&s.tasks.every((t,i)=>t&&Number.isInteger(t.sets)&&t.sets>=0&&t.sets<=SETS[TASKS[i]]&&PHASES.includes(t.phase)));}
function create(win){
 const doc=win.document,script=doc.currentScript,base=new URL('.',script?script.src:new URL('dogfood-flow.js',win.location.href));
 const env=win.location.pathname.split('/')[1],dev=env==='surface-inputs-dev',key='arcade-dogfood-v3:'+env;
 const query=new URLSearchParams(win.location.search),run=query.get('dogfood');
 const participantKey='arcade-participant-v1:'+env;
 let state=null,waiting=null,status=null,progress=null,retentionRetry=null,retryButton=null;
 const gates=new Map();
 const sdk=()=>win.SurfaceInputsTransport,native=()=>sdk()&&sdk().usesNative();
 const failed=()=>doc.documentElement&&doc.documentElement.classList.contains('dogfood-startup-failed');
 const participantValid=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(value);
 try{const raw=win.sessionStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(valid(parsed))state=parsed;}}catch(_){/* Start reports storage failures explicitly. */}
 function persist(){if(!valid(state))throw new Error('Invalid dogfood session. Return to the main page.');win.sessionStorage.setItem(key,JSON.stringify(state));}
 function current(){return state&&TASKS[state.stage];}
 function context(task=current()){return state&&task?state.id+'_'+task:null;}
 function isGuided(){return !!(!failed()&&run&&state&&run===state.id);}
 function active(task){return !!(isGuided()&&current()===task&&!['skipped','skipped_wait_ack'].includes(state.tasks[state.stage].phase));}
 function show(text){if(status)status.textContent=text;}
 function update(){if(!progress||!state)return;const task=current();progress.textContent=task?LABELS[task]+(SETS[task]>1?' · Set '+Math.min(state.tasks[state.stage].sets+1,SETS[task])+' of '+SETS[task]:''):'';}
 function destination(){
  if(state.stage===TASKS.length)return new URL('thanks.html?dogfood='+encodeURIComponent(state.id),base).href;
  const task=current(),u=new URL(PATHS[task],base);u.searchParams.set('dogfood',state.id);u.searchParams.set('session_id',state.session);
  if(task==='typing'||task==='hunt_peck'){u.searchParams.set('setting_preset','df');u.searchParams.set('num_prompts',task==='typing'?'20':'10');u.searchParams.set('dataset','natural-language-punct');if(task==='hunt_peck')u.searchParams.set('task','hunt-and-peck');}
  return u.href;
 }
 let skippedGate=false;
 function gateReady(){if(skippedGate)return true;const gate=gates.get(current());return gate?gate.ready():!['hunt_peck','menu'].includes(current());}
 function pending(){return !!((native()&&sdk().pendingCount())||!gateReady());}
 function readyAction(action){
  if(failed()){waiting=null;return;}
  if(pending()){waiting=action;show('Waiting for pending telemetry acceptance. Retry the pending destination if needed.');if(retryButton)retryButton.hidden=false;return;}
  waiting=null;if(retryButton)retryButton.hidden=true;action();
 }
 function resume(){if(waiting&&!pending()){const action=waiting;waiting=null;show('');if(retryButton)retryButton.hidden=true;action();}}
 win.addEventListener('surface-inputs-ack',resume);
 function advance(){
  const previous=state,next={...state,stage:state.stage+1};state=next;
  try{persist();}catch(error){state=previous;throw error;}
  win.location.assign(destination());
 }
 function begin(task,preflightDone=false){
  if(!active(task))return null;
  if(!participantValid(state.participant)){show('Enter your unixname on the main page and start a new run.');return false;}
  if(!preflightDone){
   if(task==='hunt_peck'||task==='menu'){show('The task must validate its dedicated Form and v2 capabilities before starting.');return false;}
   if(!win.SurfaceInputsTaskUploads){show('The Forms module is unavailable. Reload before starting.');return false;}
   try{if(!win.SurfaceInputsTaskUploads.canBegin(task==='typing'?20:6)){show('Saved Forms records are full. Export/review them before starting.');return false;}}catch(error){show('Forms storage is unavailable: '+error.message);return false;}
  }
  const entry=state.tasks[state.stage];
  if(entry.phase==='retention_wait'){if(retentionRetry){entry.phase='running';persist();retentionRetry();}return false;}
  if(['waiting_ack','sent_wait_ack','skipped_wait_ack','feedback','sent','skipped'].includes(entry.phase)||(native()&&sdk().pendingCount())){show('Wait for delivery before starting another task or set.');return false;}
  entry.phase='running';persist();doc.body.classList.remove('dogfood-transition');doc.body.classList.add('dogfood-started');update();show('');return context(task);
 }
 function complete(task,restart,activity){
  if(!active(task))return false;const entry=state.tasks[state.stage];if(entry.phase!=='running')return true;
  doc.body.classList.add('dogfood-transition');entry.sets++;entry.phase=entry.sets>=SETS[task]?'feedback':'idle';persist();update();
  if(entry.phase==='feedback'){if(activity)win.SurfaceInputsFeedback.complete(activity,context(task));}
  else{
   if(native()&&sdk().pendingCount()){entry.phase='waiting_ack';persist();}
   readyAction(()=>{entry.phase='idle';persist();win.setTimeout(()=>{if(active(task)&&state.tasks[state.stage].phase==='idle')restart();},0);});
  }
  return true;
 }
 function pauseCompletion(task,retry){if(!active(task))return;doc.body.classList.remove('dogfood-transition');doc.body.classList.remove('dogfood-started');const stage=doc.getElementById(task==='targeting'?'experience-screen':'scroll-body');if(stage)stage.style.display='none';const setup=doc.getElementById('start-screen');if(setup)setup.style.display='';state.tasks[state.stage].phase='retention_wait';retentionRetry=retry;persist();show('Completed result is not saved. Press Start to retry saving it; do not reload.');}
 function feedbackDone(expectedContext){
  if(!isGuided()||expectedContext!==context())return false;const entry=state.tasks[state.stage];
  if(!['feedback','sent','sent_wait_ack'].includes(entry.phase))return false;
  if(entry.phase==='sent_wait_ack'&&waiting){resume();return true;}
  entry.phase=pending()?'sent_wait_ack':'sent';persist();readyAction(advance);return true;
 }
 function retryContinuation(expectedContext){
  if(!isGuided())return false;const index=TASKS.findIndex(task=>context(task)===expectedContext);if(index<0)return false;
  const phase=state.tasks[index].phase;
  if(state.stage===index&&['feedback','sent','sent_wait_ack'].includes(phase))return feedbackDone(expectedContext);
  if(state.stage===index+1&&['sent','sent_wait_ack'].includes(phase)){
   persist();
   const navigate=()=>win.location.assign(destination());
   if(native()&&sdk().pendingCount()){waiting=navigate;show('Waiting for pending telemetry acceptance.');}else navigate();
   return true;
  }
  return false;
 }
 function skip(){
  if(!dev||!isGuided()||state.stage===TASKS.length)return;
  waiting=null;win.dispatchEvent(new win.CustomEvent('dogfood-task-abort'));
  const entry=state.tasks[state.stage];entry.phase=native()&&sdk().pendingCount()?'skipped_wait_ack':'skipped';persist();
  // A skipped task has no completion gate; only already-enqueued telemetry must drain.
  gates.delete(current());skippedGate=true;readyAction(()=>{entry.phase='skipped';persist();advance();});
 }
 function mount(){
  if(failed())return;
  const start=doc.getElementById('start-dogfooding');
  if(!run){
   let remembered='';try{const value=win.localStorage.getItem(participantKey);if(participantValid(value))remembered=value;}catch(_){}
   for(const id of ['unix-name','button-pad-id']){const input=doc.getElementById(id);if(!input)continue;if(!input.value.trim()&&remembered){input.value=remembered;input.dispatchEvent(new win.Event('input',{bubbles:true}));}const save=()=>{try{const label=input.value.trim();if(participantValid(label))win.localStorage.setItem(participantKey,label);else win.localStorage.removeItem(participantKey);}catch(_){}};input.addEventListener('input',save);input.addEventListener('change',save);}
   if(query.has('dogfood_restart')){const landing=doc.getElementById('landing-status');if(landing)landing.textContent='The previous three-task, Files-stage or unavailable run cannot resume this Menu flow. Start a new run; saved responses are retained.';}
  }
  if(start)start.addEventListener('click',()=>{
   try{const input=doc.getElementById('unix-name'),participant=input?input.value.trim():'';if(!participantValid(participant)){doc.getElementById('landing-status').textContent='Enter your unixname to start dogfooding.';if(input)input.focus();return;}
    state={version:3,id:'df_'+win.crypto.randomUUID(),stage:0,session:query.get('session_id')||'dogfood_'+new Date().toISOString().slice(0,10),participant,tasks:TASKS.map(()=>({sets:0,phase:'idle'}))};persist();try{win.localStorage.setItem(participantKey,participant);}catch(_){}readyAction(()=>win.location.assign(destination()));
   }catch(error){doc.getElementById('landing-status').textContent=error.message;}
  });
  if(!run)return;
  if(!isGuided()){win.location.replace(new URL('index.html?dogfood_restart=1',base).href);return;}
  if(win.location.pathname.endsWith('/thanks.html')){if(state.stage!==TASKS.length)win.location.replace(destination());return;}
  const profile=query.get('task')==='hunt-and-peck';
  if(state.stage===TASKS.length||!win.location.pathname.endsWith('/'+PATHS[current()])||(current()==='hunt_peck')!==profile){win.location.replace(destination());return;}
  const task=current();doc.body.classList.add('guided-dogfood');
  const utilities=doc.createElement('div');utilities.id='dogfood-utilities';progress=doc.createElement('span');progress.id='dogfood-progress';utilities.appendChild(progress);
  if(dev){const button=doc.createElement('button');button.type='button';button.id='dogfood-skip';button.textContent='Skip task';button.addEventListener('click',skip);utilities.appendChild(button);}
  retryButton=doc.createElement('button');retryButton.type='button';retryButton.id='dogfood-native-retry';retryButton.textContent='Retry native telemetry';retryButton.hidden=true;retryButton.addEventListener('click',()=>{try{const gate=gates.get(current());if(gate&&gate.retry)gate.retry();else if(sdk())sdk().retryPending();resume();}catch(error){show(error.message);}});utilities.appendChild(retryButton);
  status=doc.createElement('p');status.id='dogfood-status';status.setAttribute('role','status');utilities.appendChild(status);doc.body.appendChild(utilities);update();
  for(const id of ['button-pad-id','unix-name','user-id','files-participant','menu-participant']){const input=doc.getElementById(id);if(input){input.value=state.participant||'';input.readOnly=true;input.dispatchEvent(new win.Event('input',{bubbles:true}));}}
  const filesLabel=doc.getElementById('menu-participant-group');if(filesLabel)filesLabel.hidden=true;
  if(doc.documentElement)doc.documentElement.classList.remove('dogfood-loading');
  const entry=state.tasks[state.stage];
  if(entry.phase==='skipped_wait_ack'||(entry.phase==='waiting_ack'&&SETS[task]>1)){show('This page reloaded before acceptance was confirmed. Return to the main page; do not assume previous telemetry was delivered.');const input=doc.getElementById('input-area');if(input)input.disabled=true;return;}
  if(entry.phase==='retention_wait'){entry.phase='idle';persist();show('The previous completion was not saved before reload. Repeat this set.');}
  if(entry.phase==='sent'){readyAction(advance);return;}
  if(entry.phase==='skipped'){gates.delete(task);skippedGate=true;readyAction(advance);return;}
  if(['feedback','sent_wait_ack'].includes(entry.phase))win.setTimeout(()=>{
   if(!active(task))return;
   if(task==='menu'){win.dispatchEvent(new win.CustomEvent('dogfood-restore-feedback',{detail:{task}}));return;}
   win.SurfaceInputsFeedback.complete(task==='typing'||task==='hunt_peck'?'keyboard_punctuation':'touchpad_'+task,context(task));
  },0);
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 return{active,begin,complete,completeWithoutFeedback:task=>complete(task,null,null),pauseCompletion,
  continuingSet:task=>active(task)&&state.tasks[state.stage].phase==='running'&&state.tasks[state.stage].sets<SETS[task]-1,
  context,feedbackDone,retryContinuation,isGuided,isFinal:()=>!!(isGuided()&&state.stage===TASKS.length-1),skip,isDevelopment:dev,
  getState:()=>state?JSON.parse(JSON.stringify(state)):null,participant:()=>state?state.participant:'',show,sets:SETS,
  phase:task=>active(task)?state.tasks[state.stage].phase:null,
  registerCompletionGate(task,gate){gates.set(task,gate);},signalCompletion:resume,
  pendingDelivery:pending,
  retryPendingDelivery(){const gate=gates.get(current());if(gate&&gate.retry)gate.retry();else if(sdk())sdk().retryPending();resume();}};
}
return{create,valid,tasks:TASKS,sets:SETS};});
