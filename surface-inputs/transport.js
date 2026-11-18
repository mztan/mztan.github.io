/* Shared SDK: fixed typed intent and opaque Arcade data; attribution is native-owned. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) root.SurfaceInputsTransport = api.createTransport(root);
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    // BEGIN GENERATED CONTRACT
    const CONTRACT = {"intent_contract_version":1,"supported_versions":[1,2],"message_types":["keyboard","touchpad","arcade"],"touchpad_metric_families":["cursor_movement","clicks","drag","scrolling","zooming"],"limits":{"message_utf8_bytes":32768,"identifier_utf8_bytes":64,"intent_details_utf8_bytes":512,"keyboard_prompt_utf8_bytes":512,"keyboard_stream_utf8_bytes":2048,"arcade_details_utf8_bytes":2048,"integer_max":2147483647,"dedup_window_messages":1024,"json_depth":32},"queue_limit":32,"float_max":3.4028234663852886e+38,"legacy_activities":["keyboard_natural_language","keyboard_punctuation","keyboard_email","keyboard_password","keyboard_shortcuts","keyboard_arrows","touchpad_targeting","touchpad_scrolling","touchpad_selection","touchpad_zoom","session"],"legacy_facade_task_ids":{"keyboard_natural_language":"keyboard_natural_language","keyboard_punctuation":"keyboard_punctuation","keyboard_email":"keyboard_email","keyboard_password":"keyboard_password","keyboard_shortcuts":"keyboard_shortcuts","keyboard_arrows":"keyboard_arrows","touchpad_targeting":"touchpad_targeting","touchpad_scrolling":"touchpad_scrolling","touchpad_selection":"touchpad_selection","touchpad_zoom":"touchpad_zoom","session":"session"},"metrics":{"cursor_movement":{"stp_cursor_movement_target_radius_px":"number","stp_cursor_movement_start_distance_px":"number","stp_cursor_movement_time_ms":"int","stp_cursor_movement_stroke_count":"int","stp_cursor_movement_first_stroke_share":"share","stp_cursor_movement_small_strokes_far_from_target":"int","stp_cursor_movement_small_strokes_near_target":"int","stp_cursor_movement_target_entries":"int","stp_cursor_movement_total_cursor_distance_px":"number","stp_cursor_movement_index_of_difficulty_bits":"number","stp_cursor_movement_overshoot_count":"int","stp_cursor_movement_endpoint_error_px":"number"},"clicks":{"stp_clicks_target_count":"int","stp_clicks_completed_count":"int","stp_clicks_total":"int","stp_clicks_on_target":"int","stp_clicks_miss_count":"int"},"drag":{"stp_drag_target_text":"text","stp_drag_attempt_count":"int","stp_drag_first_attempt_selected_target":"bool","stp_drag_selection_start_failure_count":"int","stp_drag_nothing_selected_count":"int","stp_drag_selection_unchanged_count":"int","stp_drag_wrong_selection_count":"int","stp_drag_tap1_5_count":"int","stp_drag_tap2_5_count":"int","stp_drag_tap3_5_count":"int"},"scrolling":{"stp_scrolling_time_ms":"int","stp_scrolling_start_distance_px":"number","stp_scrolling_direction":"scrollDirection","stp_scrolling_stroke_count":"int","stp_scrolling_dial_in_stroke_count":"int","stp_scrolling_empty_stroke_count":"int","stp_scrolling_first_stroke_share":"share","stp_scrolling_overshoot_count":"int","stp_scrolling_overshoot_max_px":"number","stp_scrolling_cursor_travel_without_scroll_px":"number"},"zooming":{"stp_zooming_time_ms":"int","stp_zooming_direction":"zoomDirection","stp_zooming_required_change_percent":"number","stp_zooming_pinch_count":"int","stp_zooming_dial_in_pinch_count":"int","stp_zooming_empty_pinch_count":"int","stp_zooming_first_pinch_share":"share","stp_zooming_overshoot_count":"int","stp_zooming_overshoot_max_percent":"number","stp_zooming_cursor_travel_while_zooming_px":"number","stp_zooming_cursor_travel_without_zoom_px":"number"}},"metric_units":{"_px":"CSS pixels","_ms":"milliseconds","_share":"ratio 0..1","_percent":"percent","counts":"integer","stp_drag_target_text":"prescribed text"}};
    // END GENERATED CONTRACT
    const ORIGIN = 'https://mztan.github.io';
    function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
    freeze(CONTRACT);
    const METRICS = CONTRACT.metrics, LIMITS = CONTRACT.limits;
    const ACTIVITIES = new Set(CONTRACT.legacy_activities);
    const bytes = value => new TextEncoder().encode(value).length;
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    function check(ok, reason) { if (!ok) throw new Error(reason); }
    function exactKeys(value, keys) { Object.keys(value).forEach(key => check(keys.includes(key), 'Unknown field: ' + key)); }
    function identifier(value, name) { check(typeof value === 'string' && /^[\x21-\x7e]{1,64}$/.test(value), name + ' must be 1..64 printable ASCII bytes'); }
    function text(value, limit, name, nonempty = false) { check(typeof value === 'string' && (!nonempty || value.length > 0) && bytes(value) <= limit, name + ' exceeds bounds or is invalid'); }
    function integer(value, name, unavailable = false) { check(Number.isInteger(value) && value <= LIMITS.integer_max && (value >= 0 || (unavailable && value === -1)), name + ' must fit the native integer range'); }
    function jsonText(value) {
        // Reject values JSON.stringify would silently erase/coerce, instead of losing measurements.
        const seen = new Set();
        function visit(item, depth = 0) {
            if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
            if (typeof item === 'number') { check(Number.isFinite(item), 'JSON numbers must be finite'); return; }
            check(typeof item === 'object' && item !== null, 'Expected complete JSON data');
            check(depth < LIMITS.json_depth, 'JSON depth exceeds ' + LIMITS.json_depth);
            check(!seen.has(item), 'Circular JSON data');
            const descriptors = Object.getOwnPropertyDescriptors(item);
            check(Object.values(descriptors).every(d => !d.get && !d.set), 'JSON accessor properties are unsupported');
            check(Object.getOwnPropertySymbols(item).length === 0, 'Symbol JSON keys are unsupported');
            check(typeof item.toJSON !== 'function' && (Array.isArray(item) || Object.prototype.toString.call(item) === '[object Object]'), 'Expected plain JSON data');
            seen.add(item);
            if (Array.isArray(item)) { for (let i = 0; i < item.length; i++) { check(i in item, 'Sparse JSON array'); visit(item[i], depth + 1); } }
            else { check(Object.getOwnPropertySymbols(item).length === 0, 'Symbol JSON keys are unsupported'); Object.values(item).forEach(child => visit(child, depth + 1)); }
            seen.delete(item);
        }
        visit(value); return JSON.stringify(value);
    }
    function boundedJsonParse(source) {
        text(source, LIMITS.message_utf8_bytes, 'JSON input');
        let depth = 0, quoted = false, escaped = false;
        for (const char of source) {
            if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
            else if (char === '"') quoted = true;
            else if (char === '{' || char === '[') { depth++; check(depth <= LIMITS.json_depth, 'JSON depth exceeds ' + LIMITS.json_depth); }
            else if (char === '}' || char === ']') depth--;
        }
        const parsed = JSON.parse(source);
        const objects = [];
        const tokens = source.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]]/g);
        for (const token of tokens) {
            if (token[0] === '{') objects.push(new Set());
            else if (token[0] === '[') objects.push(null);
            else if (token[0] === '}' || token[0] === ']') objects.pop();
            else if (source.slice(token.index + token[0].length).trimStart().startsWith(':')) {
                const keys = objects[objects.length-1], key = JSON.parse(token[0]);
                check(keys && !keys.has(key), 'Duplicate JSON key'); keys.add(key);
            }
        }
        return parsed;
    }
    function details(value, limit) { check(object(value) && value.details_version === 1, 'details_version must be 1'); text(jsonText(value), limit, 'details'); }
    function validate(payload) {
        check(object(payload), 'Payload must be an object');
        check(payload.version === 1 || payload.version === 2, 'Unsupported version');
        const v2 = payload.version === 2;
        identifier(payload.id, 'id');
        if (v2) identifier(payload.task_id, 'task_id');
        else check(ACTIVITIES.has(payload.activity_id), 'Unknown activity_id');
        const common = ['version', 'type', 'id', v2 ? 'task_id' : 'activity_id'];
        if (payload.type === 'arcade') {
            check(v2, 'Arcade events require v2');
            exactKeys(payload, common.concat(['event_name', 'task_context_id', 'elapsed_ms', 'details']));
            identifier(payload.event_name, 'event_name');
            if (payload.task_context_id !== undefined) identifier(payload.task_context_id, 'task_context_id');
            if (payload.elapsed_ms !== undefined) integer(payload.elapsed_ms, 'elapsed_ms');
            text(payload.details, LIMITS.arcade_details_utf8_bytes, 'arcade details', true);
            let parsed; try { parsed = boundedJsonParse(payload.details); } catch (_) { throw new Error('Arcade details must be a complete bounded JSON object string'); }
            check(object(parsed), 'Arcade details must be a JSON object');
            integer(parsed.details_version, 'details_version'); check(parsed.details_version >= 1, 'details_version must be positive');
        } else if (payload.type === 'feedback') {
            check(!v2, 'Use submitArcadeEvent for v2 feedback');
            exactKeys(payload, common.concat(['scope', 'round_id', 'ratings', 'comment', 'pain_points']));
            check(['task', 'session'].includes(payload.scope), 'Unknown feedback scope');
            if (payload.scope === 'task' || payload.round_id !== undefined) identifier(payload.round_id, 'round_id');
            check(object(payload.ratings), 'ratings must be an object');
            exactKeys(payload.ratings, ['ease', 'satisfaction', 'frustration', 'control', 'fatigue', 'accuracy', 'lag', 'likelihood']);
            Object.values(payload.ratings).forEach(value => check(Number.isInteger(value) && value >= 1 && value <= 5, 'Ratings must be integers 1..5'));
            if (payload.comment !== undefined) text(payload.comment, 1024, 'comment');
            if (payload.pain_points !== undefined) { check(Array.isArray(payload.pain_points) && payload.pain_points.length <= 8, 'Too many pain_points'); payload.pain_points.forEach(value => text(value, 64, 'pain_point', true)); }
            text(jsonText(payload), 2048, 'feedback payload');
        } else {
            integer(payload.elapsed_ms, 'elapsed_ms'); details(payload.details, LIMITS.intent_details_utf8_bytes);
            if (payload.type === 'keyboard') {
                exactKeys(payload, common.concat(['elapsed_ms', 'prompt_id', 'prompt_text', 'input_event_stream', 'details']));
                if (!v2) check(payload.activity_id.startsWith('keyboard_'), 'Keyboard activity required');
                identifier(payload.prompt_id, 'prompt_id'); text(payload.prompt_text, LIMITS.keyboard_prompt_utf8_bytes, 'prompt_text', true);
                text(payload.input_event_stream, LIMITS.keyboard_stream_utf8_bytes, 'input_event_stream');
                check(!/[\u0000-\u001f\u007f]/.test(payload.prompt_text + payload.input_event_stream), 'Use canonical visible control tokens');
                exactKeys(payload.details, ['details_version', 'stream_format', 'final_text', 'replay_eligible', 'replay_ineligible']);
                if (payload.details.replay_eligible !== undefined) check(typeof payload.details.replay_eligible === 'boolean', 'replay_eligible must be a boolean');
                if (payload.details.replay_ineligible !== undefined) {
                    check(Array.isArray(payload.details.replay_ineligible), 'replay_ineligible must be an array');
                    payload.details.replay_ineligible.forEach(reason => check(['non_terminal_edit', 'cursor_navigation', 'control_key'].includes(reason), 'Unknown replay exclusion'));
                }
                if (payload.details.stream_format !== undefined) check(payload.details.stream_format === 'keychord_labels_v1', 'Unknown stream_format');
                if (payload.details.final_text !== undefined) text(payload.details.final_text, 512, 'final_text');
            } else {
                check(payload.type === 'touchpad' && Object.prototype.hasOwnProperty.call(METRICS,payload.metric_family), 'Unknown type or metric_family');
                if (!v2) check(payload.activity_id.startsWith('touchpad_'), 'Touchpad activity required');
                const schema = METRICS[payload.metric_family]; exactKeys(payload, common.concat(['elapsed_ms', 'metric_family', 'details'], Object.keys(schema)));
                Object.entries(schema).forEach(([key, kind]) => {
                    const value = payload[key]; if (value === undefined) return;
                    if (kind === 'text') return text(value, 512, key);
                    if (kind === 'scrollDirection') return check(['', 'up', 'down', 'none'].includes(value), key);
                    if (kind === 'zoomDirection') return check(['', 'in', 'out'].includes(value), key);
                    check(Number.isFinite(value) && (value === -1 || value >= 0) && value <= CONTRACT.float_max, key);
                    if (kind === 'int' || kind === 'bool') integer(value, key, true);
                    if (kind === 'share' || kind === 'bool') check(value <= 1, key);
                });
            }
        }
        text(jsonText(payload), LIMITS.message_utf8_bytes, 'message');
        return payload;
    }
    function toV2(message) {
        if (message.version === 2) return message;
        const {activity_id, ...rest} = message;
        const task_id = CONTRACT.legacy_facade_task_ids[activity_id];
        if (message.type !== 'feedback') return {...rest, version: 2, task_id};
        const value = {version:2, type:'arcade', id:message.id, task_id, event_name:'feedback_submitted',
            details:jsonText({details_version:1, scope:message.scope, ratings:message.ratings,
                ...(message.comment !== undefined ? {comment:message.comment} : {}),
                ...(message.pain_points !== undefined ? {pain_points:message.pain_points} : {})})};
        if (message.round_id !== undefined) value.task_context_id = message.round_id;
        return value;
    }
    function createTransport(win, options = {}) {
        const pending = new Map(), accepted = new Map();
        const limit = Math.min(options.queueLimit || CONTRACT.queue_limit, CONTRACT.queue_limit);
        const retryMs = options.retryMs || 2000, maxAttempts = options.maxAttempts || 5;
        const capabilityTimeoutMs = options.capabilityTimeoutMs || 10000;
        let port = null, mode = 'browser', sequence = 0, readyTimer = null, capTimer = null, capId = null, capState = 'unbound', caps = null;
        let browserFeedback = null, browserArcade = null;
        const prefix = 'web_' + (win.crypto && win.crypto.randomUUID ? win.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
        const id = () => prefix + '_' + (++sequence).toString(36);
        const notify = (type, detail) => win.dispatchEvent(new win.CustomEvent(type, {detail}));
        const nativeBound = () => mode !== 'browser';
        function fail(reason, value) { notify('surface-inputs-transport-error', {reason, id:value}); }
        function capabilitiesError(reason) { capState = 'blocked'; win.clearTimeout(capTimer); fail(reason + ' Messages retained; use retryPending().', capId); }
        function negotiate() {
            win.clearTimeout(capTimer); capState = 'negotiating';
            do { capId = 'ctl_' + id().slice(4); } while (pending.has(capId) || accepted.has(capId));
            capTimer = win.setTimeout(() => capabilitiesError('Native capabilities reply missing.'), capabilityTimeoutMs);
            try { port.postMessage(JSON.stringify({version:1, type:'capabilities', id:capId})); }
            catch (error) { capabilitiesError(error.message); }
        }
        function acceptCapabilities(data) {
            try {
                exactKeys(data, ['version','type','id','supported_versions','message_types','intent_contract_version','touchpad_metric_families','limits']);
                check(data.version === 1 && data.type === 'capabilities' && data.id === capId, 'Invalid capabilities envelope');
                check(Array.isArray(data.supported_versions) && [1,2].every(v=>data.supported_versions.includes(v)), 'Unsupported wire capabilities');
                check(data.intent_contract_version === CONTRACT.intent_contract_version, 'Unsupported intent contract');
                check(Array.isArray(data.message_types) && CONTRACT.message_types.every(t=>data.message_types.includes(t)), 'Missing message capability');
                check(Array.isArray(data.touchpad_metric_families) && CONTRACT.touchpad_metric_families.every(f=>data.touchpad_metric_families.includes(f)), 'Missing metric capability');
                check(object(data.limits), 'Missing limits');
                Object.entries(LIMITS).forEach(([key,value])=>check(Number.isSafeInteger(data.limits[key]) && data.limits[key] >= value, 'Incompatible native limit: '+key));
                win.clearTimeout(capTimer); caps = JSON.parse(jsonText(data)); capState = 'v2';
                [...pending.values()].forEach(send);
                notify('surface-inputs-capabilities', {state:capState, capabilities:getCapabilities()});
            } catch (error) { capabilitiesError(error.message); }
        }
        function getCapabilities() { return caps ? JSON.parse(JSON.stringify(caps)) : null; }
        function selectWire(entry) {
            if (entry.json) return true; // Never renegotiate a serialized or retried observation.
            if (capState !== 'v2' && capState !== 'legacy') return false;
            if (capState === 'legacy' && entry.logical.version === 2) {
                if (entry.skipLegacyResult) {
                    pending.delete(entry.logical.id);
                    notify('surface-inputs-unsupported', {id:entry.logical.id,feature:'uxr_result',reason:'Extra UXR result channel requires v2; legacy typed intent continues.'});
                    return false;
                }
                fail('This event requires an upgraded v2 APK. Event retained; no v1 or Forms fallback.', entry.logical.id); return false;
            }
            entry.message = capState === 'v2' ? toV2(entry.logical) : entry.logical;
            validate(entry.message); entry.json = jsonText(entry.message); return true;
        }
        function send(entry) {
            if (mode !== 'apk' || (capState !== 'v2' && capState !== 'legacy')) return;
            if (!selectWire(entry)) return;
            win.clearTimeout(entry.timer);
            if (entry.attempts >= maxAttempts) { fail('No sink ACK. Observation retained; use retryPending().', entry.logical.id); return; }
            entry.attempts++;
            try { port.postMessage(entry.json); } catch (error) { fail(error.message, entry.logical.id); }
            if (pending.has(entry.logical.id)) entry.timer = win.setTimeout(() => send(entry), retryMs);
        }
        function prepare(payload) {
            const withId = {...payload}; if (!withId.id) withId.id = id();
            const logicalJson = jsonText(withId), logical = JSON.parse(logicalJson);
            validate(logical); if (logical.version === 1) validate(toV2(logical));
            return {logical, logicalJson, message:null, json:null, attempts:0, timer:null};
        }
        function enqueueMany(payloads) {
            check(nativeBound(), 'No native handshake; browser producers retain their existing forms');
            const entries = payloads.map(({payload,skipLegacyResult})=>({...prepare(payload),skipLegacyResult:!!skipLegacyResult}));
            check(new Set(entries.map(e=>e.logical.id)).size === entries.length, 'Duplicate IDs in batch');
            const newEntries = [];
            for (const entry of entries) {
                const key=entry.logical.id;
                if (accepted.has(key)) check(accepted.get(key) === entry.logicalJson, 'Cannot reuse accepted id with different data');
                else if (pending.has(key)) check(pending.get(key).logicalJson === entry.logicalJson && pending.get(key).skipLegacyResult === entry.skipLegacyResult, 'Cannot reuse id with different data');
                else newEntries.push(entry);
            }
            const skipped = capState === 'legacy' ? newEntries.filter(entry=>entry.skipLegacyResult) : [];
            const queued = newEntries.filter(entry=>!skipped.includes(entry));
            check(pending.size + queued.length <= limit, 'Native queue full. Keep the current prompt and retry after ACK.');
            queued.forEach(entry=>pending.set(entry.logical.id,entry));
            queued.forEach(send);
            skipped.forEach(entry=>notify('surface-inputs-unsupported',{id:entry.logical.id,feature:'uxr_result',reason:'Extra UXR result channel requires v2; legacy typed intent continues.'}));
            return entries.map(entry=>entry.logical.id);
        }
        function enqueue(payload) { return enqueueMany([{payload}])[0]; }
        function arcadeMessage(payload) {
            check(object(payload) && object(payload.details),'submitArcadeEvent expects a JSON details object, not a serialized string');
            return {...payload,version:2,type:'arcade',details:jsonText(payload.details)};
        }
        function receive(event) {
            let data; try { data = typeof event.data === 'string' ? boundedJsonParse(event.data) : JSON.parse(jsonText(event.data)); } catch (_) { return; }
            if (!object(data)) return;
            if (data.version === 1 && data.type === 'ready' && Object.keys(data).length === 2 && mode === 'connecting') {
                win.clearTimeout(readyTimer); mode = 'apk'; notify('surface-inputs-mode', {mode}); negotiate(); return;
            }
            if (mode !== 'apk') return;
            if (data.id === capId && ['negotiating','blocked'].includes(capState)) {
                if (data.type === 'capabilities') { acceptCapabilities(data); return; }
                if (data.version === 1 && data.status === 'rejected' && !data.type) {
                    win.clearTimeout(capTimer); capState = 'legacy';
                    caps = {supported_versions:[1],message_types:['keyboard','touchpad','feedback'],intent_contract_version:1,touchpad_metric_families:CONTRACT.touchpad_metric_families,limits:LIMITS};
                    [...pending.values()].forEach(send);
                    notify('surface-inputs-capabilities', {state:capState,capabilities:getCapabilities()}); return;
                }
                capabilitiesError('Malformed capability reply.'); return;
            }
            const entry = pending.get(data.id);
            if (!entry || !entry.message || data.version !== entry.message.version || !['accepted','rejected'].includes(data.status)) return;
            win.clearTimeout(entry.timer);
            if (data.status === 'accepted') {
                pending.delete(data.id); accepted.set(data.id, entry.logicalJson);
                if (accepted.size > LIMITS.dedup_window_messages) accepted.delete(accepted.keys().next().value);
            } else { entry.attempts = maxAttempts; fail(data.reason || 'Sink rejected observation; retained.', data.id); }
            notify('surface-inputs-ack', {version:data.version,id:data.id,status:data.status,reason:data.reason});
        }
        win.addEventListener('message', event => {
            if (port || win.top !== win || win.location.origin !== ORIGIN || event.isTrusted !== true ||
                (event.source !== win && event.source !== null) || !event.ports || event.ports.length !== 1) return;
            let data; try { data = typeof event.data === 'string' ? boundedJsonParse(event.data) : JSON.parse(jsonText(event.data)); } catch (_) { return; }
            if (!object(data) || data.type !== 'surface_inputs_host' || data.version !== 1 || Object.keys(data).length !== 2) return;
            port = event.ports[0]; mode = 'connecting'; capState = 'waiting_ready'; port.onmessage = receive;
            port.onmessageerror = () => fail('Native port message error; observations retained.'); if (port.start) port.start();
            readyTimer = win.setTimeout(() => fail('Native ready reply missing; observations retained.'),10000);
            notify('surface-inputs-mode', {mode}); port.postMessage(JSON.stringify({version:1,type:'ready'}));
        });
        if (win.document) win.document.addEventListener('submit', event => {
            if (nativeBound()) { event.preventDefault(); event.stopImmediatePropagation(); }
        },true);
        function submitIntent(type,payload) {
            const v2 = payload.task_id !== undefined;
            return enqueue({...payload,version:v2?2:1,type});
        }
        return {
            isNative:()=>mode === 'apk', usesNative:nativeBound, getMode:()=>mode,
            getCapabilities, getCapabilityState:()=>capState,
            requireV2() { check(capState === 'v2','This task requires v2 native capabilities. Wait/retry or upgrade the APK before starting.'); return true; },
            submitKeyboard:payload=>submitIntent('keyboard',payload),
            submitTouchpad:payload=>submitIntent('touchpad',payload),
            submitTouchpadBatch(payloads) {
                return enqueueMany(payloads.map(payload=>({payload:{...payload,version:payload.task_id!==undefined?2:1,type:'touchpad'}})));
            },
            newObservationId:id,
            submitCurrentResult(payload) {
                check(ACTIVITIES.has(payload.task_id), 'Legacy result facade is only for current compatible tasks; new tasks require v2');
                return enqueueMany([{payload:arcadeMessage(payload),skipLegacyResult:true}])[0];
            },
            submitKeyboardWithResult(payload, result) {
                check(ACTIVITIES.has(result.task_id), 'Current result facade requires a legacy-compatible task');
                return enqueueMany([{payload:{...payload,version:payload.task_id!==undefined?2:1,type:'keyboard'}},
                    {payload:arcadeMessage(result),skipLegacyResult:true}]);
            },
            submitArcadeEvent(payload) {
                const message = arcadeMessage(payload);
                if (nativeBound()) return enqueue(message);
                const prepared = prepare(message);
                check(typeof browserArcade === 'function','Browser Arcade events require an explicit callback');
                return browserArcade(prepared.logical);
            },
            submitFeedback(payload) {
                const message={...payload,version:1,type:'feedback'};
                if (nativeBound()) return enqueue(message);
                if (!message.id) message.id=id(); validate(message);
                check(typeof browserFeedback === 'function','Browser feedback requires an explicit existing-form callback');return browserFeedback(message);
            },
            setBrowserFeedbackCallback(callback) {check(typeof callback === 'function','Expected callback');browserFeedback=callback;},
            setBrowserArcadeCallback(callback) {check(typeof callback === 'function','Expected callback');browserArcade=callback;},
            retryPending() {
                if (mode === 'connecting') {
                    win.clearTimeout(readyTimer);port.postMessage(JSON.stringify({version:1,type:'ready'}));
                    readyTimer=win.setTimeout(()=>fail('Native ready reply missing; observations retained.'),10000);return;
                }
                if (mode === 'apk' && capState === 'blocked') {negotiate();return;}
                pending.forEach(entry=>{entry.attempts=0;send(entry);});
            },
            pendingCount:()=>pending.size,
            canQueue:count=>Number.isInteger(count || 1) && (count || 1)>0 && pending.size+(count || 1)<=limit,
            validate, utf8Bytes:bytes
        };
    }
    return {createTransport,validate,utf8Bytes:bytes,metrics:METRICS,contract:CONTRACT};
});
