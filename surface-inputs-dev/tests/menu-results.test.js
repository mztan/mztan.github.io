'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const {environment}=require('./harness.js'),{attach}=require('./files-form-fixture.js'),paths=require('../path-results.js'),flow=require('../dogfood-flow.js'),menu=require('../menu-tasks.js');
function complete(api){const s=new api.MenuTrials();for(let i=0;i<2;i++){const t=i*1000;s.open(t);s.select(0,0,t+10);s.open(t+20);s.move(0,0,t+21);s.move(3,4,t+22);s.dismiss(t+23);s.open(t+24);for(let l=0;l<s.depth-1;l++)s.hover(l,api.MENU_PATH[l],t+30+l);s.select(s.depth-1,api.MENU_PATH[s.depth-1],t+40);s.next();}return s.targetResults(3000);}
function memory(){const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}

test('Menu extraction retains exact original model and every original target measurement',()=>{
 const original=require('../../jvision/path-tasks.js');assert.equal(menu.MenuTrials.toString(),original.MenuTrials.toString());assert.deepEqual(menu.MENU_LABELS,original.MENU_LABELS);assert.deepEqual(menu.MENU_PATH,original.MENU_PATH);assert.deepEqual(complete(menu),complete(original));assert.deepEqual(complete(menu).map(r=>r.metrics.stp_menu_depth),[3,5]);
});

test('new Menu registry entry leaves existing enabled HP and Files destination mappings untouched',()=>{
 const current=require('../files-forms-config.js'),before={module:{exports:{}}};vm.runInNewContext(execFileSync('git',['show','838490499214242c4476c4a2708a9019c556f564:surface-inputs-dev/files-forms-config.js'],{encoding:'utf8'}),before);
 for(const task of ['stp_file_drag','keyboard_hunt_and_peck'])assert.deepEqual(current.forms[task],JSON.parse(JSON.stringify(before.module.exports.forms[task])));
 require('../files-forms.js').validateConfig(current.forms.stp_cascading_menu);assert.equal(Object.keys(current.forms.stp_cascading_menu.fields).length,9);
});

test('Menu storage cannot relabel or rehydrate retained Files payloads and outboxes',()=>{
 const e=environment(),store=memory();e.win.localStorage=store;attach(e.win,e.requests);e.load('transport.js');
 const old={version:1,id:'df_history_menu',task:'stp_file_drag',participant_label:'fixture',targets:[{},{},{}],native:{old:'pending'}};const oldJson=JSON.stringify([old]);store.setItem(paths.storageKey,oldJson);store.setItem(require('../files-forms.js').storageKey,'[]');
 e.win.SurfaceInputsDogfood={isGuided:()=>true,active:task=>task==='menu',context:()=>old.id,participant:()=> 'fixture',phase:()=> 'feedback',registerCompletionGate(){},feedbackDone(){}};
 const api=paths.create(e.win,'stp_cascading_menu');assert.equal(api.restoreGuided(),false);assert.equal(api.current(),null);assert.equal(api.list().length,0);assert.equal(store.getItem(paths.storageKey),oldJson);
 store.setItem(paths.profiles.stp_cascading_menu.key,oldJson);assert.equal(api.restoreGuided(),false);assert.equal(api.current(),null);assert.equal(e.requests.length,0);assert.equal(store.getItem(paths.storageKey),oldJson);
 assert.throws(()=>api.complete('stp_file_drag',complete(menu)),/Unexpected/);
 assert.throws(()=>api.complete('stp_cascading_menu',[{attributes:{stp_target_kind:'file_drag'}},{attributes:{stp_target_kind:'file_drag'}}]),/original menu/);
});

test('old v2 Files run restarts without changing old state, old results or collector receipts',()=>{
 const e=environment('?dogfood=df_old'),session=memory(),local=memory(),dest=[];
 const old=JSON.stringify({version:2,id:'df_old',stage:4,participant:'fixture',tasks:[{sets:6,phase:'sent'},{sets:6,phase:'sent'},{sets:1,phase:'sent'},{sets:1,phase:'sent'},{sets:1,phase:'feedback'}]});session.setItem('arcade-dogfood-v2:surface-inputs-dev',old);local.setItem(paths.storageKey,'[{"id":"oldFiles","task":"stp_file_drag"}]');local.setItem('surface-inputs-dev-files-forms-v1','[{"id":"oldForm","status":"delivery_unknown"}]');
 e.win.sessionStorage=session;e.win.localStorage=local;e.win.location={origin:'https://mztan.github.io',href:'https://mztan.github.io/surface-inputs-dev/touchpad/files.html?dogfood=df_old',pathname:'/surface-inputs-dev/touchpad/files.html',search:'?dogfood=df_old',replace:u=>dest.push(u)};e.doc.currentScript={src:'https://mztan.github.io/surface-inputs-dev/dogfood-flow.js'};e.doc.readyState='loading';e.doc.documentElement.classList.contains=()=>false;
 const api=flow.create(e.win);e.doc.dispatchEvent({type:'DOMContentLoaded'});assert(dest[0].endsWith('index.html?dogfood_restart=1'));assert.equal(api.isGuided(),false);assert.equal(session.getItem('arcade-dogfood-v2:surface-inputs-dev'),old);assert.equal(local.getItem(paths.storageKey),'[{"id":"oldFiles","task":"stp_file_drag"}]');assert.equal(local.getItem('surface-inputs-dev-files-forms-v1'),'[{"id":"oldForm","status":"delivery_unknown"}]');assert.equal(e.requests.length,0);
});
