'use strict';
// Keep runtime manifest embedded in the single SDK script so existing clients need no second loader.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const json=JSON.parse(fs.readFileSync(path.join(root,'telemetry-contract.json'),'utf8'));
const file=path.join(root,'transport.js');
const source=fs.readFileSync(file,'utf8');
const block='// BEGIN GENERATED CONTRACT\n    const CONTRACT = '+JSON.stringify(json)+';\n    // END GENERATED CONTRACT';
const result=source.replace(/\/\/ BEGIN GENERATED CONTRACT[\s\S]*?\/\/ END GENERATED CONTRACT/,block);
if(process.argv.includes('--check')){
 if(result!==source)throw new Error('SDK embedded contract differs from telemetry-contract.json; run generate-contract.js');
 console.log('SDK embedded manifest matches canonical JSON.');
}else{fs.writeFileSync(file,result);console.log('Generated embedded SDK manifest from telemetry-contract.json.');}
