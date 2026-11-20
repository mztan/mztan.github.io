'use strict';
const forms = require('../files-forms.js');
function config() {
    return {version:1, enabled:true, fieldsVerified:true,
        endpoint:'https://docs.google.com/forms/d/e/1FAIpQLfilesFixture/formResponse',
        fields:Object.fromEntries(forms.fields.map((key,i)=>[key,'entry.'+(i+1)]))};
}
function attach(win, requests = []) {
    Object.assign(win, {SurfaceInputsFilesForms:forms, SurfaceInputsFilesFormsConfig:config(),
        URLSearchParams, AbortController,
        fetch:async(url,options)=>{requests.push({url,options});return{type:'opaque',status:0,ok:false};}});
    return win;
}
module.exports = {config,attach};
