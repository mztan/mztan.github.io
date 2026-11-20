/* H&P bridge for unchanged keyboard measurements, dedicated Forms and task feedback.
 * Input is never injected; explicit native retries reuse only retained observation payloads. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SurfaceInputsHuntPeckForms = api;
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const TASK = 'keyboard_hunt_and_peck', KEY = 'surface-inputs-dev-hunt-peck-runs-v1', LIMIT = 50;
    const clone = value => JSON.parse(JSON.stringify(value));
    function create(win, profile) {
        if (!profile || profile.id !== TASK || profile.promptCount !== 10) throw new Error('Invalid hunt-and-peck task profile.');
        if (!win.SurfaceInputsFilesForms) throw new Error('Dedicated Form dispatcher is unavailable.');
        const forms = win.SurfaceInputsFilesForms.create(win, win.SurfaceInputsFilesFormsConfig, {task_id:TASK});
        const sdk = win.SurfaceInputsTransport, storage = win.localStorage;
        const flow = win.SurfaceInputsDogfood;
        const guided = () => !!(flow && flow.isGuided());
        const active = () => !guided() || flow.active('hunt_peck');
        let run = null, explicitFeedbackRetry = false, receiptSaveFailed = false, aborted = false;
        function list() {
            const value = JSON.parse(storage.getItem(KEY) || '[]');
            if (!Array.isArray(value)) throw new Error('Saved H&P runs are invalid. Export before clearing site data.');
            return value;
        }
        function put(value) {
            const entries = list(), index = entries.findIndex(entry => entry.id === value.id);
            if (index < 0) {
                if (entries.length >= LIMIT) throw new Error('H&P results are full. Export before starting another task.');
                entries.push(clone(value));
            } else entries[index] = clone(value);
            storage.setItem(KEY, JSON.stringify(entries));
        }
        function canBegin(label) {
            if (aborted || !active()) throw new Error('Hunt-and-peck is not the active dogfood task.');
            const participant = guided() ? flow.participant() : run ? run.participant_label : (typeof label === 'string' ? label.trim() : '');
            if (run && run.prompts.length === profile.promptCount) throw new Error('This H&P run is complete. Finish its retained feedback; do not repeat the measurements.');
            if (guided() && flow.phase('hunt_peck') === 'running' && !run) throw new Error('The in-progress H&P run cannot be resumed. Return to the main page to start a new flow; retained results are kept.');
            if (run && run.native_required !== sdk.usesNative()) throw new Error('Delivery mode changed during H&P. Reset before starting a new run.');
            forms.canBegin(participant, run ? Math.max(1, 11 - run.prompts.length) : 11);
            if (!run && list().length >= LIMIT) throw new Error('H&P results are full. Export before starting another task.');
            if (sdk.usesNative()) sdk.requireV2();
            const probe = KEY + ':probe'; storage.setItem(probe, '1'); storage.removeItem(probe);
            return true;
        }
        function begin(label) {
            canBegin(label);
            if (!run) {
                const value = {version:1,id:guided()?flow.context('hunt_peck'):sdk.newObservationId(),task:TASK,participant_label:guided()?flow.participant():label.trim(),
                    native_required:sdk.usesNative(),prompts:[],feedback:null,native:{}};
                put(value); run = value;
                if (guided() && !flow.begin('hunt_peck', true)) {run=null;throw new Error('Hunt-and-peck cannot begin until prior delivery is accepted.');}
                const input = win.document && win.document.getElementById('unix-name');
                if (input) input.readOnly = true;
            }
            return run.id;
        }
        function reset() {
            if (guided()) return; // A guided context is fixed; reload never creates a replacement observation stream.
            run = null;
            const input = win.document && win.document.getElementById('unix-name');
            if (input) input.readOnly = false;
        }
        function stagePrompt(snapshot) {
            if (aborted || !active()) throw new Error('H&P was skipped or is no longer active.');
            if (!run || run.id !== snapshot.context) throw new Error('H&P prompt has no matching started task context.');
            const payload = {details_version:1,task_profile:profile.id,prescription:profile.prescription,
                prompt_text:snapshot.prompt_text,input_event_stream:snapshot.input_event_stream,
                final_text:snapshot.final_text,result:snapshot.result};
            const existing = run.prompts.find(prompt => prompt.id === snapshot.id);
            if (existing && JSON.stringify(existing.results) !== JSON.stringify(payload)) throw new Error('Completed H&P prompt is immutable.');
            if (!existing && run.prompts.length >= profile.promptCount) throw new Error('All ten H&P prompts are already recorded.');
            const id = forms.stageSubmission({id:snapshot.id,block:run.id,participant_label:run.participant_label,
                submission_type:'result',results:payload});
            if (!existing) {
                const value = {...run,prompts:[...run.prompts,{id,results:clone(payload)}]};
                put(value); run = value;
            }
            return id;
        }
        function commitPrompt(id) {
            if (aborted || !active()) return;
            if (!run || !run.prompts.some(prompt => prompt.id === id)) throw new Error('H&P prompt was not retained.');
            if (forms.status(id) === 'not_sent') forms.send(id).catch(error => {
                win.dispatchEvent(new win.CustomEvent('hunt-peck-forms-status',{detail:{reason:error.message}}));
            });
        }
        function retainFeedback(message) {
            if (aborted || !active()) throw new Error('H&P was skipped or is no longer active.');
            if (!run || message.activity_id !== 'keyboard_punctuation' || message.round_id !== run.id) throw new Error('H&P feedback does not match this task context.');
            if (run.prompts.length !== profile.promptCount) throw new Error('Finish all ten H&P prompts before task feedback.');
            const data = {id:message.id,block:run.id,participant_label:run.participant_label,submission_type:'feedback',
                ease:message.ratings.ease,comment:message.comment || '',rating_skipped:false};
            const id = forms.stageSubmission(data);
            if (run.feedback && JSON.stringify(run.feedback) !== JSON.stringify(data)) throw new Error('H&P feedback is immutable.');
            if (!run.feedback) {const value = {...run,feedback:clone(data)}; put(value); run = value;}
            return {id,block:run.id,status:forms.status(id)};
        }
        async function feedback(message) {
            const entry = retainFeedback(message), explicit = explicitFeedbackRetry;
            explicitFeedbackRetry = false;
            if (explicit) {
                await forms.retry(run.id, () => win.confirm('A previous Google Form request may already have arrived. Retrying this retained response may duplicate a row. Retry?'),()=>!aborted&&active());
            } else {
                for (const prompt of run.prompts) {
                    if (aborted || !active()) throw new Error('H&P was skipped; retained requests are not discarded.');
                    await forms.send(prompt.id);
                }
                if (aborted || !active()) throw new Error('H&P was skipped; retained requests are not discarded.');
                await forms.send(entry.id);
            }
            return {status:'request_sent',storageConfirmed:false};
        }
        if (win.document) win.document.addEventListener('click', event => {
            if (event.target && event.target.id === 'feedback-retry') explicitFeedbackRetry = true;
        }, true);
        function stageNativePrompt(id, keyboard, arcade) {
            if (!run || aborted || !active()) throw new Error('H&P is no longer collecting.');
            if (!run.native) run.native = {};
            for (const [kind,payload] of [['keyboard',keyboard],['arcade',arcade]]) {
                const existing = run.native[payload.id];
                if (existing && JSON.stringify(existing.payload) !== JSON.stringify(payload)) throw new Error('Retained native H&P payload is immutable.');
                if (!existing) run.native[payload.id] = {kind,payload:clone(payload),status:'pending'};
            }
            put(run);
        }
        function nativeReady() {
            return !!(run && !receiptSaveFailed && (!run.native_required || (run.prompts.length===profile.promptCount && run.native && Object.keys(run.native).length===profile.promptCount*2 && Object.values(run.native).every(entry=>entry.status==='accepted'))));
        }
        function retryNative() {
            if (!run || aborted || !active()) throw new Error('No active retained H&P run.');
            put(run);receiptSaveFailed=false;
            if (!run.native_required) return;
            sdk.requireV2();
            sdk.retryPending();
            for (const entry of Object.values(run.native || {}).filter(value=>value.status!=='accepted')) {
                if (entry.kind==='keyboard') sdk.submitKeyboard(entry.payload); else sdk.submitArcadeEvent(entry.payload);
            }
            if (flow) flow.signalCompletion();
        }
        if (guided() && flow.active('hunt_peck')) {
            const saved = list().find(entry=>entry.id===flow.context('hunt_peck'));
            if (saved && saved.prompts.length===profile.promptCount && saved.participant_label===flow.participant()) run=clone(saved);
            flow.registerCompletionGate('hunt_peck',{ready:nativeReady,retry:retryNative});
        }
        win.addEventListener('surface-inputs-ack',event=>{
            const ack=event.detail;
            if (!run || !run.native || !ack || !run.native[ack.id]) return;
            run.native[ack.id].status=ack.status==='accepted'?'accepted':'rejected';
            try{put(run);receiptSaveFailed=false;}catch(_){receiptSaveFailed=true;}
            if (flow) flow.signalCompletion();
        });
        win.addEventListener('dogfood-task-abort',()=>{aborted=true;});
        return {canBegin,begin,reset,stagePrompt,commitPrompt,stageNativePrompt,retryNative,nativeReady,
            context:()=>run ? run.id : null,current:()=>run ? clone(run) : null,
            exportRecords:()=>JSON.stringify({version:1,runs:list(),forms:forms.list()},null,2),
            async retryForms() {
                if (!run) throw new Error('No H&P run in this document. Export historical records; they are never automatically reposted.');
                await forms.retry(run.id,()=>win.confirm('A previous Google Form request may already have arrived. Retry may duplicate a row. Retry?'),()=>!aborted&&active());
            },
            // The shared feedback modal discovers these methods dynamically; no primary Form is used.
            reserveFeedbackContext:message=>retainFeedback(message).block,
            retainFeedback,feedback,blockForActivity:activity=>activity==='keyboard_punctuation' && run ? run.id : null,
            commitResult() {},
            result() {throw new Error('H&P needs the complete prompt capture, not a primary Form result.');},
            stageResult() {throw new Error('H&P needs the complete prompt capture, not a primary Form result.');}
        };
    }
    function activate(win, profile) {
        const api = create(win, profile);
        win.SurfaceInputsTaskUploads = api;
        return api;
    }
    return {create,activate,storageKey:KEY};
});
