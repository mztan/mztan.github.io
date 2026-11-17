'use strict';
const fs=require('node:fs'),path=require('node:path');
const sdk=require('../transport.js'),{environment}=require('./harness.js'),{fixtures}=require('./generate-fixtures.js');
async function conformanceFixtures(){
 const generated=await fixtures('v2');
 const e=environment();e.win.crypto.randomUUID=()=> '00000000-0000-4000-8000-900000000001';e.port.capabilityBehavior='v2';e.load('transport.js');e.ready();
 e.win.SurfaceInputsTransport.requireV2();
 e.win.SurfaceInputsTransport.submitKeyboard({id:'future-keyboard',task_id:'study.future/text-entry',elapsed_ms:2147483647,prompt_id:'prescribed_1',prompt_text:'Fix⏎',input_event_stream:'Fxi⌫⌫ix⏎',details:{details_version:1,final_text:'Fix',replay_eligible:true}});
 for(const [family,fields]of Object.entries(sdk.metrics)){
  const values=Object.fromEntries(Object.entries(fields).map(([key,kind])=>[key,kind==='text'?'prescribed phrase':kind==='scrollDirection'?'down':kind==='zoomDirection'?'out':kind==='share'?0.5:kind==='bool'?1:kind==='int'?2147483647:1.25]));
  e.win.SurfaceInputsTransport.submitTouchpad({id:'future-'+family,task_id:'study.future/'+family,metric_family:family,elapsed_ms:1234,details:{details_version:1},...values});
 }
 e.win.SurfaceInputsTransport.submitArcadeEvent({id:'future-uxr',task_id:'uxr.future/layout-experiment',event_name:'uxr_result_v3',task_context_id:'block-fixture',elapsed_ms:2147483647,details:{details_version:3,unseen_score:0.12345678912345678,surface:'opaque / path \\ with "quotes"',unicode:'你好🙂',nested:{task_id:'not_native_envelope',details_version:777,arbitrary_null:null},values:[1,true,null]}});
 e.win.SurfaceInputsTransport.submitArcadeEvent({id:'future-likert',task_id:'survey.future/seven-point',event_name:'feedback_submitted',details:{details_version:7,ratings:{ease:7,new_rating_key:6},anchors:['hard','easy'],feedback_text:'No native Likert range or comment-key allowlist.'}});
 const extra=e.port.sent.filter(message=>message.type!=='ready').map(message=>({name:message.id,message}));
 return [...generated,...extra].map(entry=>({...entry,raw:JSON.stringify(entry.message),...(entry.message.type==='arcade'?{expected_details:entry.message.details}:{})}));
}
if(require.main===module)conformanceFixtures().then(entries=>{
 const file=path.join(__dirname,'fixtures/native-messages-v2.json');fs.writeFileSync(file,JSON.stringify(entries,null,2)+'\n');
 console.log('Generated '+entries.length+' actual SDK v2 messages: '+file);
}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={conformanceFixtures};
