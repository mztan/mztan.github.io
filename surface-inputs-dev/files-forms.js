/* Immutable Forms outboxes: one destination per task, shared across environments.
 * Native telemetry is independent and is never dispatched by this module. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SurfaceInputsFilesForms = api;
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const KEY = 'surface-inputs-dev-files-forms-v1';
    const TASKS = ['stp_file_drag', 'keyboard_hunt_and_peck'];
    const FIELDS = ['participant_label', 'task_id', 'task_context_id', 'submission_id', 'submission_type', 'results_json', 'ease', 'comment', 'rating_skipped'];
    const MAX_ROWS = 100, MAX_BYTES = 1048576, MAX_RESULTS_BYTES = 32768;
    const bytes = value => new TextEncoder().encode(value).length;
    const clone = value => JSON.parse(JSON.stringify(value));
    const labelValid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
    const idValid = value => typeof value === 'string' && /^[\x21-\x7e]{1,64}$/.test(value);
    function jsonText(value) {
        function check(node, depth) {
            if (depth > 32) throw new Error('Form results JSON exceeds the depth bound.');
            if (node === null || typeof node === 'string' || typeof node === 'boolean') return;
            if (typeof node === 'number' && Number.isFinite(node)) return;
            if (!node || typeof node !== 'object') throw new Error('Form results contain a value JSON would erase or change.');
            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) {
                    const descriptor = Object.getOwnPropertyDescriptor(node, String(i));
                    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new Error('Form results must not contain sparse arrays or getters.');
                    check(descriptor.value, depth + 1);
                }
            } else {
                if (Object.prototype.toString.call(node) !== '[object Object]' || 'toJSON' in node) throw new Error('Form results must be plain JSON objects.');
                for (const key of Object.keys(node)) {
                    const descriptor = Object.getOwnPropertyDescriptor(node, key);
                    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new Error('Form results must not contain getters.');
                    check(descriptor.value, depth + 1);
                }
            }
        }
        check(value, 0);
        return JSON.stringify(value);
    }
    function validateConfig(config) {
        if (!config || config.version !== 1 || config.enabled !== true || config.fieldsVerified !== true) throw new Error('The task Google Form is not configured. Do not start until the published mapping is available.');
        if (!/^https:\/\/docs\.google\.com\/forms\/d\/e\/1FAIpQL[A-Za-z0-9_-]+\/formResponse$/.test(config.endpoint)) throw new Error('Invalid task Form endpoint.');
        if (!config.fields || FIELDS.some(key => !/^entry\.\d+$/.test(config.fields[key] || '')) || Object.keys(config.fields).some(key => !FIELDS.includes(key)) || new Set(Object.values(config.fields)).size !== FIELDS.length) throw new Error('Task Form requires all nine unique verified question mappings.');
        return {endpoint: config.endpoint, fields: clone(config.fields)};
    }
    const identity = entry => JSON.stringify({id: entry.id, block: entry.block, destination: entry.destination, values: entry.values});
    function create(win, config, options = {}) {
        const task = options.task_id || 'stp_file_drag';
        if (!TASKS.includes(task)) throw new Error('Unsupported dedicated-Form task_id.');
        const taskConfig = config && config.forms ? config.forms[task] : config;
        const key = task === 'stp_file_drag' ? KEY : KEY + ':' + task;
        const storage = win.localStorage, inflight = new Map(), sent = new Set(), listeners = new Set();
        function list() {
            const value = JSON.parse(storage.getItem(key) || '[]');
            if (!Array.isArray(value)) throw new Error('Saved task Form records are invalid. Export before clearing site data.');
            return value;
        }
        function notify() { listeners.forEach(listener => listener()); }
        function put(entry) {
            const entries = list(), index = entries.findIndex(value => value.id === entry.id);
            if (index >= 0 && identity(entries[index]) !== identity(entry)) throw new Error('Cannot change a retained task Form submission.');
            if (index < 0) {
                if (entries.length >= MAX_ROWS) throw new Error('Task Form records are full. Export before starting another task.');
                entries.push(clone(entry));
            } else entries[index] = clone(entry);
            const text = JSON.stringify(entries);
            if (bytes(text) > MAX_BYTES) throw new Error('Task Form records are full. Export before starting another task.');
            storage.setItem(key, text);
        }
        function canBegin(participant, expectedSubmissions = 2) {
            if (!labelValid(participant)) throw new Error('Enter your web participant label before starting.');
            validateConfig(taskConfig);
            if (!Number.isInteger(expectedSubmissions) || expectedSubmissions < 1 || expectedSubmissions > MAX_ROWS) throw new Error('Invalid expected Form submission count.');
            const rows = list();
            if (rows.length + expectedSubmissions > MAX_ROWS || bytes(JSON.stringify(rows)) + expectedSubmissions * MAX_RESULTS_BYTES > MAX_BYTES) throw new Error('Task Form records are full. Export before starting another task.');
            const probe = key + ':probe'; storage.setItem(probe, '1'); storage.removeItem(probe);
            return true;
        }
        function stageSubmission(packet) {
            const destination = validateConfig(taskConfig);
            if (!packet || !labelValid(packet.participant_label)) throw new Error('Missing explicit web participant label.');
            if (Object.keys(packet).some(name => !['id', 'block', 'participant_label', 'submission_type', 'results', 'ease', 'comment', 'rating_skipped'].includes(name))) throw new Error('Unexpected Form submission field.');
            if (!idValid(packet.id) || !idValid(packet.block)) throw new Error('Invalid web submission or task context ID.');
            const values = {participant_label: packet.participant_label, task_id: task, task_context_id: packet.block,
                submission_id: packet.id, submission_type: packet.submission_type};
            if (packet.submission_type === 'result') {
                const results = packet.results;
                if (!results || Array.isArray(results) || typeof results !== 'object' || !Number.isInteger(results.details_version) || results.details_version < 1) throw new Error('Full Form results need a JSON object with positive integer details_version.');
                const json = jsonText(results);
                if (bytes(json) > MAX_RESULTS_BYTES) throw new Error('Full results exceed the Form JSON bound; no data was truncated.');
                values.results_json = json;
            } else if (packet.submission_type === 'feedback') {
                const skipped = packet.ease === null;
                if (!skipped && !(Number.isInteger(packet.ease) && packet.ease >= 1 && packet.ease <= 5)) throw new Error('Ease must be 1..5 or explicitly skipped.');
                if (packet.rating_skipped !== undefined && packet.rating_skipped !== skipped) throw new Error('Rating skip disagrees with ease.');
                if (packet.comment !== undefined && typeof packet.comment !== 'string') throw new Error('Feedback comment must be text.');
                const comment = packet.comment || '';
                if (bytes(comment) > MAX_RESULTS_BYTES) throw new Error('Feedback exceeds the Form bound; no text was truncated.');
                values.rating_skipped = String(skipped);
                if (!skipped) values.ease = String(packet.ease);
                values.comment = comment;
            } else throw new Error('Invalid task submission kind.');
            const entry = {version: 1, id: packet.id, block: packet.block, destination, values, status: 'not_sent'};
            const existing = list().find(value => value.id === entry.id);
            if (existing) {
                if (identity(existing) !== identity(entry)) throw new Error('Cannot change a retained task Form submission.');
                return existing.id;
            }
            put(entry);
            return entry.id;
        }
        function stage(run, kind) {
            if (run.task !== task) throw new Error('Form task_id does not match this dispatcher.');
            return stageSubmission({id:run.id + '_' + kind, block:run.id, participant_label:run.participant_label,
                submission_type:kind, results:kind === 'result' ? {details_version:1, targets:run.targets} : undefined,
                ease:run.ease, comment:run.comment});
        }
        function status(id) {
            if (sent.has(id)) return 'request_sent';
            return list().find(entry => entry.id === id)?.status || 'not_retained';
        }
        function send(id, explicit = false) {
            if (sent.has(id) || status(id) === 'request_sent') return Promise.resolve({status:'request_sent', storageConfirmed:false});
            if (inflight.has(id)) return inflight.get(id);
            const saved = list().find(entry => entry.id === id);
            if (!saved) return Promise.reject(new Error('Task Form record was not retained.'));
            const activeDestination = validateConfig(taskConfig);
            if (JSON.stringify(saved.destination) !== JSON.stringify(activeDestination)) return Promise.reject(new Error('Retained task Form destination differs from the verified current configuration. No request was sent.'));
            if (!saved.values || Object.keys(saved.values).some(name => !FIELDS.includes(name)) || Object.values(saved.values).some(value => typeof value !== 'string') || !labelValid(saved.values.participant_label) || saved.values.task_id !== task) return Promise.reject(new Error('Invalid retained task Form values. No request was sent.'));
            if (saved.status === 'delivery_unknown' && !explicit) return Promise.reject(new Error('Task Form delivery is unknown. Explicit retry may duplicate a row.'));
            const operation = Promise.resolve().then(async () => {
                // Mark uncertainty before dispatch: a lost response or reload must never auto-post.
                const entry = {...saved, status:'delivery_unknown'};
                put(entry); notify();
                const body = new win.URLSearchParams();
                for (const [name, value] of Object.entries(entry.values)) body.set(entry.destination.fields[name], value);
                const controller = new win.AbortController(); let timer;
                try {
                    const timeout = new Promise((_, reject) => {timer = win.setTimeout(() => {controller.abort(); reject(new Error('Task Form request timed out; delivery is unknown.'));}, 15000);});
                    const response = await Promise.race([win.fetch(entry.destination.endpoint, {method:'POST', mode:'no-cors', body, signal:controller.signal}), timeout]);
                    if (response.type !== 'opaque' && !response.ok) throw new Error('Task Form request failed; delivery is unknown.');
                    sent.add(id);
                    try { put({...entry, status:'request_sent'}); }
                    catch (_) { /* In-memory sent guard prevents retry; retained unknown status remains honest after reload. */ }
                    return {status:'request_sent', storageConfirmed:false};
                } finally {win.clearTimeout(timer);}
            }).finally(() => {inflight.delete(id); notify();});
            inflight.set(id, operation);
            return operation;
        }
        async function retry(block, confirmUnknown, stillActive = () => true) {
            const candidates = list().filter(entry => entry.block === block && status(entry.id) !== 'request_sent');
            if (candidates.some(entry => entry.status === 'delivery_unknown') && (!confirmUnknown || !confirmUnknown())) throw new Error('Retry cancelled: a previous Form request may already have reached Google.');
            for (const entry of candidates) {
                if (!stillActive()) throw new Error('Task retry cancelled. Retained records were not discarded.');
                await send(entry.id, true);
            }
        }
        return {canBegin, stageSubmission, stage, send, retry, list, status, storageKey:key,
            exportRecords:()=>JSON.stringify({version:1,task_id:task,records:list()},null,2),
            subscribe(listener) {listeners.add(listener);}};
    }
    return {create, validateConfig, fields: FIELDS, storageKey: KEY, labelValid,
        limits: {MAX_ROWS, MAX_BYTES, MAX_RESULTS_BYTES}};
});
