/* Browser task result/feedback outbox. Native-bound collection stays on the SDK. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root&&root.document)root.SurfaceInputsTaskUploads=api.create(root,root.SurfaceInputsFormsConfig);})(typeof window==='undefined'?null:window,function(){
'use strict';const PREFIX='arcade-task-post-v1:',MAX=256,MAX_BYTES=1048576;
const bytes=s=>new TextEncoder().encode(s).length;
const contexts={typing:['user_id','corpus','input_type','auto_correct','platform','condition_id','condition_value','surface_difference_mm','qr_height','session_id'],targeting:['device_os','device_browser','participant_id','trial_num','condition_num','condition_id','condition_value','session_id'],scrolling:['device_os','device_browser','participant_id','trial_num','session_id']};
function create(win,config){
 const store=win.localStorage,env=win.location.pathname.split('/')[1],prefix=PREFIX+env+':',contextPrefix='arcade-task-context-v1:'+env+':',inflight=new Map(),directBlocks=new Map(),pendingResults=new Map(),latestContexts=new Map();let counter=0;
 const native=()=>win.SurfaceInputsTransport.usesNative();
 const id=()=> 'post_'+win.crypto.randomUUID()+'_'+(++counter);
 const flow=()=>win.SurfaceInputsDogfood;
 function rows(){const out=[];for(let i=0;i<store.length;i++){const key=store.key(i);if(key&&key.startsWith(prefix))out.push(JSON.parse(store.getItem(key)));}return out;}
 function retain(entry){const saved=rows(),old=saved.find(row=>row.id===entry.id);if(old){if(JSON.stringify(old)!==JSON.stringify(entry))throw new Error('Cannot change a retained submission.');return;}const text=JSON.stringify(entry);if(saved.length>=MAX||saved.reduce((n,r)=>n+bytes(JSON.stringify(r)),0)+bytes(text)>MAX_BYTES)throw new Error('Pending uploads are full. Retry them before continuing.');store.setItem(prefix+entry.id,text);}
 function form(task){const f=config&&config.forms[task];if(!f||!f.verified)throw new Error('The '+task+' Form field mapping and respondent access are not verified. Feedback is saved locally; no upload was attempted.');if(!/^https:\/\/docs\.google\.com\/forms\/d\/e\/1FAIpQL[^/]+\/formResponse$/.test(f.endpoint))throw new Error('Invalid task collector.');return f;}
 async function send(entry){if(native())throw new Error('Browser uploads never replace native telemetry.');const f=form(entry.task);if(inflight.has(entry.id))return inflight.get(entry.id);
  const operation=Promise.resolve().then(async()=>{if(native())throw new Error('Native mode is now bound; the browser request remains retained and was not sent.');const controller=new win.AbortController();let timer;try{
    const body=new win.URLSearchParams();for(const[key,value]of Object.entries(entry.values)){if(!/^entry\.\d+$/.test(f.fields[key]||''))throw new Error('Missing verified collector field: '+key);body.set(f.fields[key],value);}
   const timeout=new Promise((_,reject)=>{timer=win.setTimeout(()=>{controller.abort();reject(new Error('Upload timed out; retry may duplicate a collector row.'));},15000);});
   const response=await Promise.race([win.fetch(f.endpoint,{method:'POST',mode:'no-cors',body,signal:controller.signal}),timeout]);if(response.type!=='opaque'&&!response.ok)throw new Error('Upload failed with HTTP '+response.status);store.removeItem(prefix+entry.id);return{status:'request_sent',storageConfirmed:false};
  }finally{win.clearTimeout(timer);inflight.delete(entry.id);}});inflight.set(entry.id,operation);return operation;
 }
 function snapshot(formElement){const values={};for(const input of formElement.elements){let key=input.id.replace(/^df_result_|^result_/,'');if(!key||!input.name.startsWith('entry.'))continue;const value=input.value;if(value==='')continue;if(['wpm','awpm','accuracy','time_spent_ms','uer','cer','ter','total_chars','total_key_presses','total_corrected_errors','total_uncorrected_errors','surface_difference_mm','condition_id','condition_value','qr_height','time_to_complete','gesture_count','index_of_difficulty','effective_id','throughput','clicks_total','clicks_on_target','target_entries','drag_count','total_cursor_distance'].includes(key)&&!Number.isFinite(Number(value)))continue;values[key]=value;}return values;}
 function result(task,element){if(native())return true;
 let entry=pendingResults.get(task);
 if(!entry){const values=snapshot(element);let block=flow()&&flow().active(task)?flow().context(task):directBlocks.get(task);if(!block){block='block_'+win.crypto.randomUUID();directBlocks.set(task,block);}
 const oldContext=JSON.parse(store.getItem(contextPrefix+block)||'null');const sequence=Math.max(oldContext?.sequence||0,...rows().filter(r=>r.block===block).map(r=>r.sequence||0))+1;
 values.task_block_id=block;values.submission_type='result';entry={id:id(),task,block,sequence,values};pendingResults.set(task,entry);}
 try{retain(entry);}catch(error){if(flow())flow().show('Completed result is not saved. Keep this page open and retry: '+error.message);return false;}
 pendingResults.delete(task);const context={};for(const key of contexts[task])if(entry.values[key]!==undefined)context[key]=entry.values[key];const captured={sequence:entry.sequence,values:context};latestContexts.set(entry.block,captured);
 try{store.setItem(contextPrefix+entry.block,JSON.stringify(captured));}catch(_){/* result row is retained and carries its full context */}
 send(entry).catch(error=>{if(flow())flow().show(error.message+' Result retained.');});return true;}
 async function retryBlock(block){for(const entry of rows().filter(r=>r.block===block))await send(entry);}
 async function feedback(message){const task=message.activity_id.startsWith('keyboard_')?'typing':message.activity_id==='touchpad_targeting'?'targeting':'scrolling';const block=message.round_id;
  const existing=rows().find(row=>row.id===message.id);
  if(existing){if(existing.block!==block||existing.values.comment!==(message.comment||'')||existing.values.ease!==String(message.ratings.ease))throw new Error('Cannot change a retained feedback response.');await retryBlock(block);store.removeItem(contextPrefix+block);return{status:'request_sent',storageConfirmed:false};}
  const candidates=[latestContexts.get(block),JSON.parse(store.getItem(contextPrefix+block)||'null'),...rows().filter(r=>r.block===block&&r.values.submission_type==='result')].filter(Boolean);
  const latest=candidates.sort((a,b)=>(b.sequence||0)-(a.sequence||0))[0]?.values;
  const values={};for(const key of contexts[task])if(latest&&latest[key]!==undefined)values[key]=latest[key];
  const s=flow()&&flow().getState();if(task==='typing')values.user_id=values.user_id||(s&&s.participant)||'';else values.participant_id=values.participant_id||(s&&s.participant)||'';
  values.session_id=values.session_id||(s&&s.session)||'';Object.assign(values,{task_block_id:block,feedback_id:message.id,submission_type:'feedback',ease:String(message.ratings.ease),comment:message.comment||''});
  const entry={id:message.id,task,block,values};retain(entry);await retryBlock(block);store.removeItem(contextPrefix+block);return{status:'request_sent',storageConfirmed:false};
 }
 win.SurfaceInputsTransport.setBrowserFeedbackCallback(feedback);
 return{result,feedback,retryBlock,getPending:rows,blockForActivity:activity=>directBlocks.get(activity.startsWith('keyboard_')?'typing':activity==='touchpad_targeting'?'targeting':'scrolling'),canBegin:expected=>rows().length+expected+1<=MAX,snapshot};
}
return{create,limits:{MAX,MAX_BYTES}};});
