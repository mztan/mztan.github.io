'use strict';
// Bounded edits to the 14 explicitly tracked dev HTML entry pages; no production/jvision edits.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const pages=cp.execFileSync('git',['ls-tree','-r','--name-only','HEAD','surface-inputs-dev'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(file=>file.endsWith('.html'));
for(const file of pages){
 const destination=path.join(root,file);let source=fs.readFileSync(destination,'utf8');
 source=source.replace(/((?:src=)["'][^"']*\/??transport\.js)(?:\?[^"']*)?(["'])/g,'$1?v=stable-sdk-2$2');
 source=source.replace(/((?:src=)["'][^"']*touchpad-observer\.js)(?:\?[^"']*)?(["'])/g,'$1?v=stable-sdk-2$2');
 source=source.replace(/((?:src=)["'][^"']*post-task-feedback\.js)(?:\?[^"']*)?(["'])/g,'$1?v=stable-sdk-2$2');
 if(file==='surface-inputs-dev/keyboard/index.html')source=source.replace('src="script.js"','src="script.js?v=stable-sdk-2"');
 if(file.startsWith('surface-inputs-dev/touchpad/')&&!file.includes('/uxr/'))source=source.replace('src="fitts-law.js"','src="fitts-law.js?v=stable-sdk-2"').replace('src="scripts_dc.js"','src="scripts_dc.js?v=stable-sdk-2"');
 fs.writeFileSync(destination,source);
}
console.log('Cache-versioned '+pages.length+' dev entry pages.');
