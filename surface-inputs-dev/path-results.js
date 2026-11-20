/* Task-specific retained snapshots, Forms and native v2 Arcade JSON for Files and Menu.
 * Measurement rows come from the unchanged original task models. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) root.SurfaceInputsPathResults = api.mount(root);
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const KEY = 'surface-inputs-dev-files-results-v1';
    const LIMIT = 50;
    const TASK = 'stp_file_drag';
    const PROFILES = {
        stp_file_drag: {stage:'files',key:KEY,count:3,title:'Files'},
        stp_cascading_menu: {stage:'menu',key:'surface-inputs-dev-menu-results-v1',count:2,title:'Menus'}
    };
    const clone = value => JSON.parse(JSON.stringify(value));
    function store(storage, key = KEY) {
        function list() {
            const parsed = JSON.parse(storage.getItem(key) || '[]');
            if (!Array.isArray(parsed)) throw new Error('Saved path-task results are invalid. Export before clearing site data.');
            return parsed;
        }
        return {
            list,
            put(record) {
                const entries = list(), index = entries.findIndex(entry => entry.id === record.id);
                if(index>=0 && entries[index].task!==record.task)throw new Error('Cannot replace a retained result with another task.');
                if(index>=0 && JSON.stringify(entries[index].targets)!==JSON.stringify(record.targets))throw new Error('Retained target measurements are immutable.');
                if (index < 0) {
                    if (entries.length >= LIMIT) throw new Error('Local results are full (' + LIMIT + '). Export before starting another task.');
                    entries.push(clone(record));
                } else entries[index] = clone(record);
                storage.setItem(key, JSON.stringify(entries));
            }
        };
    }
    function message(record, row) {
        return {
            id: record.id + '_target_' + row.index,
            task_id: record.task || TASK,
            event_name: 'uxr_result',
            task_context_id: record.id,
            elapsed_ms: Math.round(row.elapsed_ms),
            details: { details_version: 1, target: row }
        };
    }
    function feedbackMessage(record) {
        return {
            id: record.id + '_feedback', task_id: record.task || TASK, event_name: 'feedback_submitted',
            task_context_id: record.id,
            details: { details_version: 1, ratings: record.ease === null ? {} : { ease: record.ease },
                rating_skipped: record.ease === null, comment: record.comment }
        };
    }
    function validate(sdk, payload) {
        sdk.validate({ ...payload, version: 2, type: 'arcade', details: JSON.stringify(payload.details) });
    }
    function create(win, taskId = TASK) {
        if (!Object.prototype.hasOwnProperty.call(PROFILES,taskId)) throw new Error('Unknown path-task results profile.');
        const profile = PROFILES[taskId];
        const local = store(win.localStorage, profile.key), sdk = win.SurfaceInputsTransport;
        if (!sdk) throw new Error('The '+profile.title+' telemetry SDK is unavailable. Reload before starting.');
        if (!win.SurfaceInputsFilesForms) throw new Error('The '+profile.title+' Forms adapter is unavailable. Reload before starting.');
        const forms = win.SurfaceInputsFilesForms.create(win, win.SurfaceInputsFilesFormsConfig, {task_id:taskId});
        let run = null, nativeStarted = false, routeChosen = false, participant = '', aborted = false, receiptSaveFailed = false;
        const flow = () => win.SurfaceInputsDogfood;
        const guided = () => !!(flow() && flow().isGuided());
        const collecting = () => !aborted && (!guided() || flow().active(profile.stage));
        function nativeReady() {return !!(run && !receiptSaveFailed && (!run.native_required || Object.values(run.native).every(value=>value==='accepted')));}
        function finishGuided() {
            if (!guided() || !collecting() || !run || !run.rating_saved || !nativeReady()) return;
            const statuses=Object.values(run.forms).map(id=>forms.status(id));
            if (statuses.length===2 && statuses.every(value=>value==='request_sent')) flow().feedbackDone(run.id);
        }
        const queuedInDocument = new Set();
        const listeners = new Set();
        const notify = () => listeners.forEach(listener => listener());
        function persist() { local.put(run); }
        function canBegin(label) {
            if (!collecting()) throw new Error(''+profile.title+' is not the active dogfood task.');
            if (run) throw new Error(''+profile.title+' measurements are complete. Finish the retained feedback; do not repeat the task.');
            if (guided() && flow().phase(profile.stage)==='running' && !routeChosen) throw new Error('This in-progress '+profile.title+' task cannot resume after reload. Return to the main page; retained responses are kept.');
            if (!routeChosen) participant = guided()?flow().participant():typeof label === 'string' ? label.trim() : '';
            forms.canBegin(participant);
            if (local.list().length >= LIMIT) throw new Error('Local results are full (' + LIMIT + '). Export before starting another task.');
            // Probe persistence before measurement; never fall back silently to unsaved results.
            const probe = profile.key + ':probe';
            win.localStorage.setItem(probe, '1');
            win.localStorage.removeItem(probe);
            if (routeChosen && nativeStarted !== sdk.usesNative()) throw new Error('Delivery mode changed during '+profile.title+'. Reload before starting a new task.');
            if (sdk.usesNative()) {
                sdk.requireV2();
                if (!sdk.canQueue(profile.count)) throw new Error('Native telemetry is full. Retry pending telemetry before starting '+profile.title+'.');
            }
            if (guided() && !routeChosen && !flow().begin(profile.stage,true)) throw new Error(''+profile.title+' cannot begin until prior delivery is accepted.');
            nativeStarted = sdk.usesNative();
            routeChosen = true;
            return true;
        }
        function deliveries() {
            const payloads = run.targets.map(row => message(run, row));
            if (run.rating_saved) payloads.push(feedbackMessage(run));
            return payloads;
        }
        function send(explicitRetry = false) {
            if (!run || !run.native_required) return;
            sdk.requireV2();
            const payloads = deliveries();
            payloads.forEach(payload => validate(sdk, payload));
            const unsent = payloads.filter(payload => run.native[payload.id] === 'not_queued' || (explicitRetry && run.native[payload.id] !== 'accepted' && !queuedInDocument.has(payload.id)));
            if (!sdk.canQueue(unsent.length || 1) && unsent.length) throw new Error('Native queue is full. Results are saved locally; retry after telemetry acceptance.');
            if (explicitRetry) sdk.retryPending();
            for (const payload of unsent) {
                // Save the uncertain handoff first. A reload never automatically resubmits it.
                run.native[payload.id] = 'pending';
                persist();
                try { sdk.submitArcadeEvent(payload);queuedInDocument.add(payload.id); }
                catch (error) {
                    run.native[payload.id] = 'not_queued';
                    persist();
                    throw error;
                }
            }
        }
        function stageForms() {
            run.forms.result = forms.stage(run, 'result');
            if (run.rating_saved) run.forms.feedback = forms.stage(run, 'feedback');
            persist();
        }
        function sendForms() {
            for (const id of Object.values(run.forms)) {
                if (forms.status(id) === 'not_sent') forms.send(id).catch(() => notify());
            }
        }
        function complete(task, rows) {
            if (!collecting()) throw new Error(''+profile.title+' was skipped or is no longer active.');
            if (task !== taskId) throw new Error('Unexpected path task.');
            if (taskId === 'stp_cascading_menu' && (rows.length !== profile.count || rows.some(row=>row.attributes.stp_target_kind!=='cascading_menu'))) throw new Error('Menu results must contain the two original menu target rows.');
            if (!run) {
                const id = guided()?flow().context(profile.stage):profile.stage+'_' + win.crypto.randomUUID();
                run = { version: 1, id, task, recorded_at: new Date().toISOString(),
                    targets: clone(rows), participant_label: participant, ease: null, comment: '', rating_saved: false,
                    native_required: nativeStarted, native: {}, forms: {} };
                run.targets.forEach(row => {
                    const payload = message(run, row);
                    validate(sdk, payload);
                    run.native[payload.id] = nativeStarted ? 'not_queued' : 'not_requested';
                });
            }
            persist();
            if (guided()) flow().completeWithoutFeedback(profile.stage);
            stageForms();
            sendForms();
            try { send(); } finally { notify(); }
            return clone(run);
        }
        function rate(ease, comment) {
            if (!collecting()) throw new Error(''+profile.title+' was skipped or is no longer active.');
            if (!run) throw new Error('Complete '+profile.title+' before saving feedback.');
            if (run.rating_saved) return clone(run);
            if (ease !== null && !(Number.isInteger(ease) && ease >= 1 && ease <= 5)) throw new Error('Ease must be 1..5 or skipped.');
            const draft = { ...run, ease, comment: comment || '', rating_saved: true, native: { ...run.native } };
            validate(sdk, feedbackMessage(draft));
            draft.native[feedbackMessage(draft).id] = run.native_required ? 'not_queued' : 'not_requested';
            local.put(draft);
            run = draft;
            stageForms();
            sendForms();
            try { send(); } finally { notify(); }
            return clone(run);
        }
        win.addEventListener('surface-inputs-ack', event => {
            const ack = event.detail;
            if (!run || !ack || ack.version !== 2 || !(ack.id in run.native)) return;
            if (run.native[ack.id] === 'accepted') return;
            run.native[ack.id] = ack.status === 'accepted' ? 'accepted' : 'rejected';
            try { persist(); receiptSaveFailed=false; } catch (_) { receiptSaveFailed=true; }
            notify();
        });
        function restoreGuided() {
            if (!guided() || !flow().active(profile.stage)) return false;
            const saved=local.list().find(record=>record.id===flow().context(profile.stage));
            if (saved && saved.task===taskId && saved.targets.length===profile.count && (taskId!=='stp_cascading_menu'||saved.targets.every(row=>row.attributes&&row.attributes.stp_target_kind==='cascading_menu')) && saved.participant_label===flow().participant()) {
                run=clone(saved);participant=run.participant_label;nativeStarted=run.native_required;routeChosen=true;
            }
            flow().registerCompletionGate(profile.stage,{ready:nativeReady,retry:()=>{persist();receiptSaveFailed=false;send(true);notify();}});
            return !!run;
        }
        win.addEventListener('dogfood-task-abort',()=>{aborted=true;});
        forms.subscribe(notify);
        listeners.add(finishGuided);
        return { canBegin, complete, rate, restoreGuided,
            retry() { if (!run) throw new Error('No '+profile.title+' result to retry.'); persist(); receiptSaveFailed=false; stageForms(); send(true); notify(); },
            async retryForms(confirmUnknown) {
                if (!run) throw new Error('No '+profile.title+' result to retry.');
                stageForms(); await forms.retry(run.id, confirmUnknown, collecting); notify();
            },
            formsStatus: () => run ? Object.fromEntries(Object.entries(run.forms).map(([key, id]) => [key, forms.status(id)])) : {},
            exportRecords: () => ({version: 1, results: local.list(), forms: forms.list()}),
            list: local.list, current: () => run ? clone(run) : null,
            subscribe(listener) { listeners.add(listener); },
            interruptedByNativeMode: () => !nativeStarted && sdk.usesNative()
        };
    }
    function mount(win) {
        const doc = win.document;
        const taskId = (doc.documentElement && doc.documentElement.getAttribute && doc.documentElement.getAttribute('data-path-task')) || TASK;
        const profile = PROFILES[taskId];
        if (!profile) throw new Error('Unknown path-task page.');
        const participantId=profile.stage+'-participant',groupId=participantId+'-group',exportId=profile.stage+'-export';
        let api = null, failure = null;
        try { api = create(win,taskId); } catch (error) { failure = error.message; }
        const status = () => doc.getElementById('completion-status');
        function describe() {
            if (!api) return failure;
            const run = api.current();
            if (!run) return '';
            const local = 'Results saved in this browser.';
            const formStates = Object.values(api.formsStatus());
            const formText = formStates.length && formStates.every(value => value === 'request_sent')
                ? ' Google Form request sent; storage is not confirmed.'
                : formStates.includes('delivery_unknown') ? ' Google Form delivery is unknown; retry may duplicate a row.'
                : ' Google Form records are retained for delivery.';
            if (!run.native_required) return local + formText + (run.rating_saved ? ' Rating saved.' : ' Choose a rating, or Skip rating.');
            const values = Object.values(run.native);
            if (values.every(value => value === 'accepted')) return local + formText + ' Native sink accepted the observations; server storage is not confirmed.';
            if (values.includes('rejected')) return local + formText + ' Native sink rejected an observation. Retry pending native telemetry.';
            return local + formText + ' Native telemetry is pending. Use Retry if needed; do not reload before acceptance.';
        }
        function refresh() {
            status().textContent = describe();
            const run = api && api.current();
            if (run && run.rating_saved) doc.getElementById('completion-form').querySelectorAll('input, textarea, button').forEach(element => { element.disabled = true; });
        }
        function download() {
            try {
                if (!api) throw new Error(failure);
                const blob = new win.Blob([JSON.stringify(api.exportRecords(), null, 2)], { type: 'application/json' });
                const link = doc.createElement('a');
                link.href = win.URL.createObjectURL(blob);
                link.download = profile.key+'-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
                // A detached blob link downloads retained data without document navigation;
                // the shared SDK correctly blocks in-document links while native ACKs are pending.
                link.click();
                win.setTimeout(() => win.URL.revokeObjectURL(link.href), 1000);
            } catch (error) { status().textContent = error.message; }
        }
        function complete(task, title, rows, restored = false) {
            doc.getElementById('completion').hidden = false;
            doc.getElementById('completion-title').textContent = title + ' complete';
            const form = doc.getElementById('completion-form');
            const guided = win.SurfaceInputsDogfood && win.SurfaceInputsDogfood.isGuided();
            doc.getElementById('completion-save').textContent=guided?'Finish':'Save';
            if (restored && api && api.current()) {
                const saved=api.current();
                doc.getElementById('completion-comment').value=saved.comment;
                form.querySelectorAll('input[name="ease"]').forEach(input=>{input.checked=Number(input.value)===saved.ease;});
            }
            function finish(ease) {
                if (!api) { status().textContent = failure; return; }
                let completionError = null;
                try { api.complete(task, rows); } catch (error) { completionError = error; }
                try {
                    // Rating retention is independent of a backpressured result handoff.
                    api.rate(ease, doc.getElementById('completion-comment').value);
                    refresh();
                    if (completionError) status().textContent = completionError.message;
                } catch (error) { status().textContent = error.message; }
                refreshRatingControls();
            }
            function refreshRatingControls() {
                const run = api && api.current();
                if (run && run.rating_saved) form.querySelectorAll('input, textarea, button').forEach(element => { element.disabled = true; });
            }
            function saveChoice() {
                const choice = form.querySelector('input[name="ease"]:checked');
                if (!choice) { status().textContent = 'Choose a rating, or Skip rating.'; return; }
                finish(Number(choice.value));
            }
            form.onsubmit = event => { event.preventDefault(); saveChoice(); };
            doc.getElementById('completion-save').onclick = saveChoice;
            doc.getElementById('completion-skip').onclick = () => finish(null);
            doc.getElementById('completion-export').onclick = download;
            doc.getElementById('completion-forms-retry').onclick = async () => {
                try {
                    if (!api) throw new Error(failure);
                    await api.retryForms(() => win.confirm('A previous Google Form request may already have arrived. Retry may duplicate a row. Retry this retained submission?'));
                    refresh();
                } catch (error) { status().textContent = error.message; }
            };
            doc.getElementById('completion-retry').onclick = () => {
                try { if (!api) throw new Error(failure); api.retry(); refresh(); }
                catch (error) { status().textContent = error.message; }
            };
            try { if (!api) throw new Error(failure); if (!restored) api.complete(task, rows); refresh(); }
            catch (error) { status().textContent = error.message; }
            if (restored) refreshRatingControls();
            form.querySelector('input[name="ease"]').focus();
        }
        function mountParticipant() {
            if (api) api.restoreGuided();
            const flow=win.SurfaceInputsDogfood;
            if (flow && flow.isGuided()) {
                const group=doc.getElementById(groupId);if(group)group.hidden=true;
            }
            const input = doc.getElementById(participantId);
            if (!input) return;
            const key = 'arcade-participant-v1:surface-inputs-dev';
            try {
                const saved = win.localStorage.getItem(key);
                if (win.SurfaceInputsFilesForms.labelValid(saved) && !input.value) input.value = saved;
            } catch (_) { /* Manual label entry remains available. */ }
        }
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mountParticipant, {once: true});
        else mountParticipant();
        win.addEventListener('dogfood-restore-feedback',event=>{
            if (!api || event.detail.task!==profile.stage) return;
            if (!api.restoreGuided()) {status().textContent='No retained completed '+profile.title+' result matches this flow. Return to the main page; no result was reconstructed.';return;}
            const saved=api.current();complete(taskId,profile.title,saved.targets,true);
            win.dispatchEvent(new win.CustomEvent('dogfood-'+profile.stage+'-restored'));
        });
        if (api) api.subscribe(refresh);
        doc.addEventListener('click', event => {
            if (!event.target.closest || !event.target.closest('a[href]') || !api) return;
            const run = api.current();
            if (run && run.native_required && Object.values(run.native).some(value => value !== 'accepted')) {
                event.preventDefault();
                status().textContent = 'Native results are pending or rejected. Retry before leaving; local copies remain available to export.';
            }
        }, true);
        return { complete, download, list: () => api ? api.list() : [],
            canBegin() {
                if (!api) throw new Error(failure);
                try {
                    const input = doc.getElementById(participantId);
                    const ready = api.canBegin(input ? input.value : '');
                    if (input) input.readOnly = true;
                    const group = doc.getElementById(groupId);
                    if (group) group.hidden = true;
                    return ready;
                }
                catch (error) {
                    const exportButton = doc.getElementById(exportId);
                    try {
                        if (exportButton && (api.list().length || api.exportRecords().forms.length)) {
                            exportButton.hidden = false;
                            exportButton.onclick = download;
                        }
                    } catch (_) { /* Preserve the original storage error. */ }
                    throw error;
                }
            },
            interruptedByNativeMode: () => api ? api.interruptedByNativeMode() : false
        };
    }
    return { store, create, mount, message, feedbackMessage, storageKey: KEY, limit: LIMIT, profiles:PROFILES };
});
