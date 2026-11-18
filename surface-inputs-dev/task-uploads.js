/* Independent task Forms outbox. Native telemetry owns its own queue and ACKs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root&&root.document)root.SurfaceInputsTaskUploads=api.create(root,root.SurfaceInputsFormsConfig);})(typeof window==='undefined'?null:window,function(){
'use strict';const PREFIX='arcade-task-post-v1:',MAX=256,MAX_BYTES=1048576;
const bytes=s=>new TextEncoder().encode(s).length;
const contexts={typing:['user_id','corpus','input_type','auto_correct','platform','condition_id','condition_value','surface_difference_mm','qr_height','session_id'],targeting:['device_os','device_browser','participant_id','trial_num','condition_num','condition_id','condition_value','session_id'],scrolling:['device_os','device_browser','participant_id','trial_num','session_id']};
function create(win,config){
 const store=win.localStorage,env=win.location.pathname.split('/')[1],prefix=PREFIX+env+':',contextPrefix='arcade-task-context-v1:'+env+':';
 const inflight=new Map(),completedRequests=new Set(),directBlocks=new Map(),pendingResults=new Map(),latestContexts=new Map();let counter=0,exportedRecords=[];
 const id=()=> 'post_'+win.crypto.randomUUID()+'_'+(++counter),flow=()=>win.SurfaceInputsDogfood;
 function rows(){const out=[];for(let i=0;i<store.length;i++){const key=store.key(i);if(key&&key.startsWith(prefix))out.push(JSON.parse(store.getItem(key)));}return out;}
 const immutable=entry=>JSON.stringify({id:entry.id,task:entry.task,block:entry.block,sequence:entry.sequence,feedback_context:entry.feedback_context,values:entry.values});
 function retain(entry){const saved=rows(),old=saved.find(row=>row.id===entry.id);if(old){if(immutable(old)!==immutable(entry))throw new Error('Cannot change a retained submission.');return old;}const text=JSON.stringify(entry);if(saved.length>=MAX||saved.reduce((n,r)=>n+bytes(JSON.stringify(r)),0)+bytes(text)>MAX_BYTES)throw new Error('Saved Forms records are full. Export/review them before continuing.');store.setItem(prefix+entry.id,text);return entry;}
 function form(task){const f=config&&config.forms[task];if(!f||!f.enabled||!f.fieldsVerified)throw new Error('The '+task+' Form upload is not configured. Your response remains saved locally; no upload was attempted.');if(!/^https:\/\/docs\.google\.com\/forms\/d\/e\/1FAIpQL[^/]+\/formResponse$/.test(f.endpoint))throw new Error('Invalid task collector.');return f;}
 const sentOutcome=()=>({status:'request_sent',storageConfirmed:false});
 function delivery(id,status){const raw=store.getItem(prefix+id);if(raw){const row=JSON.parse(raw);row.status=status;store.setItem(prefix+id,JSON.stringify(row));}}
 async function send(entry){
  const f=form(entry.task);if(inflight.has(entry.id))return inflight.get(entry.id);
  const saved=rows().find(r=>r.id===entry.id);if(completedRequests.has(entry.id)||(saved&&saved.status==='request_sent'))return sentOutcome();
  const operation=Promise.resolve().then(async()=>{const controller=new win.AbortController();let timer;try{
   const body=new win.URLSearchParams();for(const[key,value]of Object.entries(entry.values)){if(!/^entry\.\d+$/.test(f.fields[key]||''))throw new Error('Missing verified collector field: '+key);body.set(f.fields[key],value);}
   const timeout=new Promise((_,reject)=>{timer=win.setTimeout(()=>{controller.abort();reject(new Error('Forms request timed out; delivery is unknown. An explicit retry may duplicate a row.'));},15000);});
   const response=await Promise.race([win.fetch(f.endpoint,{method:'POST',mode:'no-cors',body,signal:controller.signal}),timeout]);
   if(response.type!=='opaque'&&!response.ok)throw new Error('Forms request failed with HTTP '+response.status);
   // An opaque response can hide HTTP rejection. Keep the immutable record, never auto-retry it.
   completedRequests.add(entry.id);
   try{delivery(entry.id,'request_sent');}catch(error){if(flow())flow().show('Forms request sent, but its local receipt could not be saved. Do not automatically retry: '+error.message);}
   return sentOutcome();
  }catch(error){try{delivery(entry.id,'failed');}catch(_){}throw error;}finally{win.clearTimeout(timer);inflight.delete(entry.id);}});
  inflight.set(entry.id,operation);return operation;
 }
 function snapshot(element){const values={};for(const input of element.elements){const key=input.id.replace(/^df_result_|^result_/,'');if(!key||!input.name.startsWith('entry.'))continue;const value=input.value;if(value==='')continue;if(['wpm','awpm','accuracy','time_spent_ms','uer','cer','ter','total_chars','total_key_presses','total_corrected_errors','total_uncorrected_errors','surface_difference_mm','condition_id','condition_value','qr_height','time_to_complete','gesture_count','index_of_difficulty','effective_id','throughput','clicks_total','clicks_on_target','target_entries','drag_count','total_cursor_distance'].includes(key)&&!Number.isFinite(Number(value)))continue;values[key]=value;}return values;}
 function stageResult(task,element){
  let entry=pendingResults.get(task);
  try{
   if(!entry){const values=snapshot(element);let block=flow()&&flow().active(task)?flow().context(task):directBlocks.get(task);if(!block){block='block_'+win.crypto.randomUUID();directBlocks.set(task,block);}
    const old=JSON.parse(store.getItem(contextPrefix+block)||'null');const sequence=Math.max(old?.sequence||0,...rows().filter(r=>r.block===block).map(r=>r.sequence||0))+1;
    values.session_id=values.session_id||block;values.task_block_id=block;values.submission_type='result';entry={id:id(),task,block,sequence,values,status:'pending'};pendingResults.set(task,entry);}
   retain(entry);
   const context={};for(const key of contexts[task])if(entry.values[key]!==undefined)context[key]=entry.values[key];const captured={sequence:entry.sequence,values:context};latestContexts.set(entry.block,captured);
   try{store.setItem(contextPrefix+entry.block,JSON.stringify(captured));}catch(_){/* retained result contains its complete context */}
   return true;
  }catch(error){if(flow())flow().show('Completed result is not saved. Keep this page open and retry: '+error.message);return false;}
 }
 function commitResult(task){const entry=pendingResults.get(task);if(!entry)return;pendingResults.delete(task);send(entry).catch(error=>{if(flow())flow().show(error.message+' Forms result retained.');});}
 function result(task,element){if(!stageResult(task,element))return false;commitResult(task);return true;}
 async function retryBlock(block){for(const entry of rows().filter(r=>r.block===block&&r.status!=='request_sent')){const current=rows().find(r=>r.id===entry.id);if(current&&current.status!=='request_sent')await send(current);}}
 function retainFeedback(message){
  const task=message.activity_id.startsWith('keyboard_')?'typing':message.activity_id==='touchpad_targeting'?'targeting':'scrolling';
  const existing=rows().find(row=>row.id===message.id);
  if(existing){if((existing.feedback_context||existing.block)!==message.round_id||existing.values.comment!==(message.comment||'')||existing.values.ease!==String(message.ratings.ease))throw new Error('Cannot change a retained feedback response.');return existing;}
  // Native feedback keeps its SDK context; Forms have their own result-block identifier.
  let block=flow()&&flow().active(task)?message.round_id:directBlocks.get(task);
  if(!block){block='block_'+win.crypto.randomUUID();directBlocks.set(task,block);}
  const candidates=[latestContexts.get(block),JSON.parse(store.getItem(contextPrefix+block)||'null'),...rows().filter(r=>r.block===block&&r.values.submission_type==='result')].filter(Boolean);
  const latest=candidates.sort((a,b)=>(b.sequence||0)-(a.sequence||0))[0]?.values,values={};
  for(const key of contexts[task])if(latest&&latest[key]!==undefined)values[key]=latest[key];
  const s=flow()&&(!flow().isGuided||flow().isGuided())&&flow().getState();
  const identityIds=task==='typing'?['unix-name','user-id']:['button-pad-id'];
  const explicit=identityIds.map(id=>win.document&&win.document.getElementById(id)?.value?.trim()).find(Boolean)||'';
  if(task==='typing')values.user_id=values.user_id||(s&&s.participant)||explicit;else values.participant_id=values.participant_id||(s&&s.participant)||explicit;
  values.session_id=values.session_id||(s&&s.session)||'';Object.assign(values,{task_block_id:block,feedback_id:message.id,submission_type:'feedback',ease:String(message.ratings.ease),comment:message.comment||''});
  return retain({id:message.id,task,block,feedback_context:message.round_id,values,status:'pending'});
 }
 async function feedback(message){const entry=retainFeedback(message);await retryBlock(entry.block);if(directBlocks.get(entry.task)===entry.block)directBlocks.delete(entry.task);return sentOutcome();}
 function canBegin(expected){const records=rows();if(records.length+expected+1>MAX||records.reduce((n,r)=>n+bytes(JSON.stringify(r)),0)+expected*4096>MAX_BYTES)return false;const key=contextPrefix+'storage-probe';store.setItem(key,'1');store.removeItem(key);return true;}
 function exportRecords(){const records=rows();exportedRecords=records.filter(r=>r.status==='request_sent').map(r=>({id:r.id,body:immutable(r)}));return JSON.stringify({version:1,records},null,2);}
 function clearExportedRecords(){
  if(!exportedRecords.length)throw new Error('Export a private copy of the Forms records before cleanup.');
  if(!win.confirm||!win.confirm('Remove only exported, completed Forms records that are no longer needed for retries? Pending and active-task records will remain.'))return{removed:0};
  const protectedBlocks=new Set(rows().filter(r=>r.status!=='request_sent').map(r=>r.block));
  for(const row of pendingResults.values())protectedBlocks.add(row.block);
  for(const block of directBlocks.values())protectedBlocks.add(block);
  const current=flow();if(current&&current.isGuided&&current.isGuided()&&current.getState().stage<3)protectedBlocks.add(current.context());
  const feedback=JSON.parse(store.getItem('surface-inputs-dev-feedback-v1')||'[]');
  for(const entry of feedback){if(entry.deliveries&&(entry.deliveries.forms!=='request_sent'||!['accepted','not_required'].includes(entry.deliveries.native))){protectedBlocks.add(entry.message.round_id);const receipt=rows().find(row=>row.id===entry.message.id);if(receipt)protectedBlocks.add(receipt.block);}}
  let removed=0;for(const item of exportedRecords){const raw=store.getItem(prefix+item.id);if(!raw)continue;const row=JSON.parse(raw);if(row.status==='request_sent'&&immutable(row)===item.body&&!protectedBlocks.has(row.block)&&!inflight.has(row.id)){store.removeItem(prefix+row.id);completedRequests.delete(row.id);removed++;}}
  exportedRecords=[];return{removed};
 }
 win.SurfaceInputsTransport.setBrowserFeedbackCallback(feedback);
 return{result,stageResult,commitResult,retainFeedback,feedback,retryBlock,getPending:()=>rows().filter(r=>r.status!=='request_sent'),getRecords:rows,exportRecords,clearExportedRecords,blockForActivity:activity=>directBlocks.get(activity.startsWith('keyboard_')?'typing':activity==='touchpad_targeting'?'targeting':'scrolling'),canBegin,snapshot};
}
return{create,limits:{MAX,MAX_BYTES}};});
