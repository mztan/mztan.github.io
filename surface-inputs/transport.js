/* Shared browser/WebView transport. No account, session or model attribution crosses this API. */
(function (root, factory) {
    const exports = factory();
    if (typeof module === 'object' && module.exports) module.exports = exports;
    if (root && root.document) root.SurfaceInputsTransport = exports.createTransport(root);
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const ORIGIN = 'https://mztan.github.io';
    const ACTIVITIES = new Set(['keyboard_natural_language', 'keyboard_punctuation', 'keyboard_email',
        'keyboard_password', 'keyboard_shortcuts', 'keyboard_arrows', 'touchpad_targeting',
        'touchpad_scrolling', 'touchpad_selection', 'touchpad_zoom', 'session']);
    const METRICS = {
        cursor_movement: {
            stp_cursor_movement_target_radius_px: 'number', stp_cursor_movement_start_distance_px: 'number',
            stp_cursor_movement_time_ms: 'int', stp_cursor_movement_stroke_count: 'int',
            stp_cursor_movement_first_stroke_share: 'share', stp_cursor_movement_small_strokes_far_from_target: 'int',
            stp_cursor_movement_small_strokes_near_target: 'int', stp_cursor_movement_target_entries: 'int',
            stp_cursor_movement_total_cursor_distance_px: 'number', stp_cursor_movement_index_of_difficulty_bits: 'number',
            stp_cursor_movement_overshoot_count: 'int', stp_cursor_movement_endpoint_error_px: 'number'
        },
        clicks: { stp_clicks_target_count: 'int', stp_clicks_completed_count: 'int', stp_clicks_total: 'int',
            stp_clicks_on_target: 'int', stp_clicks_miss_count: 'int' },
        drag: { stp_drag_target_text: 'text', stp_drag_attempt_count: 'int', stp_drag_first_attempt_selected_target: 'bool',
            stp_drag_selection_start_failure_count: 'int', stp_drag_nothing_selected_count: 'int',
            stp_drag_selection_unchanged_count: 'int', stp_drag_wrong_selection_count: 'int',
            stp_drag_tap1_5_count: 'int', stp_drag_tap2_5_count: 'int', stp_drag_tap3_5_count: 'int' },
        scrolling: { stp_scrolling_time_ms: 'int', stp_scrolling_start_distance_px: 'number',
            stp_scrolling_direction: 'scrollDirection', stp_scrolling_stroke_count: 'int',
            stp_scrolling_dial_in_stroke_count: 'int', stp_scrolling_empty_stroke_count: 'int',
            stp_scrolling_first_stroke_share: 'share', stp_scrolling_overshoot_count: 'int',
            stp_scrolling_overshoot_max_px: 'number', stp_scrolling_cursor_travel_without_scroll_px: 'number' },
        zooming: { stp_zooming_time_ms: 'int', stp_zooming_direction: 'zoomDirection',
            stp_zooming_required_change_percent: 'number', stp_zooming_pinch_count: 'int',
            stp_zooming_dial_in_pinch_count: 'int', stp_zooming_empty_pinch_count: 'int',
            stp_zooming_first_pinch_share: 'share', stp_zooming_overshoot_count: 'int',
            stp_zooming_overshoot_max_percent: 'number', stp_zooming_cursor_travel_while_zooming_px: 'number',
            stp_zooming_cursor_travel_without_zoom_px: 'number' }
    };
    const bytes = value => new TextEncoder().encode(value).length;
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    function requireValue(ok, message) { if (!ok) throw new Error(message); }
    function text(value, limit, name, nonempty = false) {
        requireValue(typeof value === 'string' && (!nonempty || value.length > 0) && bytes(value) <= limit, name + ' exceeds bounds or is invalid');
    }
    function identifier(value, name) {
        requireValue(typeof value === 'string' && /^[\x21-\x7e]{1,64}$/.test(value), name + ' must be 1..64 ASCII bytes');
    }
    function exactKeys(value, keys) {
        Object.keys(value).forEach(key => requireValue(keys.includes(key), 'Unknown field: ' + key));
    }
    function validate(payload) {
        requireValue(object(payload), 'Payload must be an object');
        requireValue(payload.version === 1, 'Unsupported version');
        identifier(payload.id, 'id');
        requireValue(ACTIVITIES.has(payload.activity_id), 'Unknown activity_id');
        const common = ['version', 'type', 'id', 'activity_id'];
        if (payload.type === 'feedback') {
            exactKeys(payload, common.concat(['scope', 'round_id', 'ratings', 'comment', 'pain_points']));
            requireValue(['task', 'session'].includes(payload.scope), 'Unknown feedback scope');
            if (payload.scope === 'task' || payload.round_id !== undefined) identifier(payload.round_id, 'round_id');
            requireValue(object(payload.ratings), 'ratings must be an object');
            exactKeys(payload.ratings, ['ease', 'satisfaction', 'frustration', 'control', 'fatigue', 'accuracy', 'lag', 'likelihood']);
            Object.values(payload.ratings).forEach(value => requireValue(Number.isInteger(value) && value >= 1 && value <= 5, 'Ratings must be integers 1..5'));
            if (payload.comment !== undefined) text(payload.comment, 1024, 'comment');
            if (payload.pain_points !== undefined) {
                requireValue(Array.isArray(payload.pain_points) && payload.pain_points.length <= 8, 'Too many pain_points');
                payload.pain_points.forEach(value => text(value, 64, 'pain_point', true));
            }
            text(JSON.stringify(payload), 2048, 'feedback payload');
        } else {
            requireValue(Number.isSafeInteger(payload.elapsed_ms) && payload.elapsed_ms >= 0, 'elapsed_ms must be nonnegative');
            requireValue(object(payload.details) && payload.details.details_version === 1, 'details_version must be 1');
            text(JSON.stringify(payload.details), 512, 'details');
            if (payload.type === 'keyboard') {
                exactKeys(payload, common.concat(['elapsed_ms', 'prompt_id', 'prompt_text', 'input_event_stream', 'details']));
                requireValue(payload.activity_id.startsWith('keyboard_'), 'Keyboard activity required');
                identifier(payload.prompt_id, 'prompt_id');
                text(payload.prompt_text, 512, 'prompt_text', true);
                text(payload.input_event_stream, 2048, 'input_event_stream');
                requireValue(!/[\u0000-\u001f\u007f]/.test(payload.prompt_text + payload.input_event_stream), 'Use canonical visible control tokens');
                exactKeys(payload.details, ['details_version', 'stream_format', 'final_text']);
                if (payload.details.stream_format !== undefined) requireValue(payload.details.stream_format === 'keychord_labels_v1', 'Unknown stream_format');
                if (payload.details.final_text !== undefined) text(payload.details.final_text, 512, 'final_text');
            } else {
                requireValue(payload.type === 'touchpad' && object(METRICS[payload.metric_family]), 'Unknown type or metric_family');
                requireValue(payload.activity_id.startsWith('touchpad_'), 'Touchpad activity required');
                const schema = METRICS[payload.metric_family];
                exactKeys(payload, common.concat(['elapsed_ms', 'metric_family', 'details'], Object.keys(schema)));
                Object.entries(schema).forEach(([key, kind]) => {
                    const value = payload[key];
                    if (value === undefined) return;
                    if (kind === 'text') return text(value, 512, key);
                    if (kind === 'scrollDirection') return requireValue(['', 'up', 'down', 'none'].includes(value), key);
                    if (kind === 'zoomDirection') return requireValue(['', 'in', 'out'].includes(value), key);
                    requireValue(Number.isFinite(value) && (value === -1 || value >= 0), key);
                    if (kind === 'int' || kind === 'bool') requireValue(Number.isSafeInteger(value), key);
                    if (kind === 'share' || kind === 'bool') requireValue(value <= 1, key);
                });
            }
        }
        return payload;
    }
    function createTransport(win, options = {}) {
        const pending = new Map();
        const accepted = new Map();
        const limit = options.queueLimit || 32;
        const retryMs = options.retryMs || 2000;
        const maxAttempts = options.maxAttempts || 5;
        let port = null, mode = 'browser', sequence = 0, readyTimer = null, browserFeedback = null;
        const prefix = 'web_' + (win.crypto && win.crypto.randomUUID ? win.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
        const notify = (type, detail) => win.dispatchEvent(new win.CustomEvent(type, { detail }));
        const nativeBound = () => mode !== 'browser';
        function fail(reason, id) { notify('surface-inputs-transport-error', { reason, id }); }
        function send(entry) {
            if (mode !== 'apk') return;
            win.clearTimeout(entry.timer);
            if (entry.attempts >= maxAttempts) { fail('No sink ACK. Observation retained; use retryPending().', entry.message.id); return; }
            entry.attempts++;
            try { port.postMessage(entry.json); } catch (error) { fail(error.message, entry.message.id); }
            if (pending.has(entry.message.id)) entry.timer = win.setTimeout(() => send(entry), retryMs);
        }
        function enqueue(payload) {
            const message = JSON.parse(JSON.stringify(payload));
            if (!message.id) message.id = prefix + '_' + (++sequence).toString(36);
            validate(message);
            requireValue(nativeBound(), 'No native handshake; browser producers retain their existing forms');
            if (accepted.has(message.id)) {
                requireValue(accepted.get(message.id) === JSON.stringify(message), 'Cannot reuse accepted id with different data');
                return message.id;
            }
            const existing = pending.get(message.id);
            if (existing) {
                requireValue(existing.json === JSON.stringify(message), 'Cannot reuse id with different data');
                return existing.message.id;
            }
            requireValue(pending.size < limit, 'Native queue full. Keep the current prompt and retry after ACK.');
            const entry = { message, json: JSON.stringify(message), attempts: 0, timer: null };
            pending.set(message.id, entry);
            send(entry);
            return message.id;
        }
        function receive(event) {
            let data;
            try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch (_) { return; }
            if (!object(data) || data.version !== 1) return;
            if (data.type === 'ready' && Object.keys(data).length === 2 && mode === 'connecting') {
                win.clearTimeout(readyTimer);
                mode = 'apk';
                notify('surface-inputs-mode', { mode });
                pending.forEach(send);
                return;
            }
            const entry = pending.get(data.id);
            if (mode !== 'apk' || !entry || !['accepted', 'rejected'].includes(data.status)) return;
            win.clearTimeout(entry.timer);
            if (data.status === 'accepted') {
                pending.delete(data.id);
                accepted.set(data.id, entry.json);
                if (accepted.size > 256) accepted.delete(accepted.keys().next().value);
            }
            else { entry.attempts = maxAttempts; fail(data.reason || 'Sink rejected observation; retained.', data.id); }
            notify('surface-inputs-ack', { id: data.id, status: data.status, reason: data.reason });
        }
        win.addEventListener('message', event => {
            // Android native dispatch may have no Window proxy. Only trusted platform
            // events may transfer the capability; synthetic DOM messages never bind.
            if (port || win.top !== win || win.location.origin !== ORIGIN || event.isTrusted !== true ||
                (event.source !== win && event.source !== null) || !event.ports || event.ports.length !== 1) return;
            let data;
            try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch (_) { return; }
            if (!object(data) || data.type !== 'surface_inputs_host' || data.version !== 1 || Object.keys(data).length !== 2) return;
            port = event.ports[0];
            mode = 'connecting';
            port.onmessage = receive;
            port.onmessageerror = () => fail('Native port message error; observations retained.');
            if (port.start) port.start();
            readyTimer = win.setTimeout(() => fail('Native ready reply missing; observations retained.'), 10000);
            notify('surface-inputs-mode', { mode });
            port.postMessage(JSON.stringify({ version: 1, type: 'ready' }));
        });
        // Defense in depth for synthetic/direct form submission after binding. URL/UA never enable it.
        if (win.document) win.document.addEventListener('submit', event => {
            if (nativeBound()) { event.preventDefault(); event.stopImmediatePropagation(); }
        }, true);
        return {
            isNative: () => mode === 'apk', usesNative: nativeBound, getMode: () => mode,
            submitKeyboard: payload => enqueue(Object.assign({}, payload, { version: 1, type: 'keyboard' })),
            submitTouchpad: payload => enqueue(Object.assign({}, payload, { version: 1, type: 'touchpad' })),
            submitFeedback(payload) {
                const message = Object.assign({}, payload, { version: 1, type: 'feedback' });
                if (nativeBound()) return enqueue(message);
                if (!message.id) message.id = prefix + '_' + (++sequence).toString(36);
                validate(message);
                requireValue(typeof browserFeedback === 'function', 'Browser feedback requires an explicit existing-form callback');
                return browserFeedback(message);
            },
            setBrowserFeedbackCallback(callback) { requireValue(typeof callback === 'function', 'Expected callback'); browserFeedback = callback; },
            retryPending() {
                if (mode === 'connecting') {
                    win.clearTimeout(readyTimer);
                    port.postMessage(JSON.stringify({ version: 1, type: 'ready' }));
                    readyTimer = win.setTimeout(() => fail('Native ready reply missing; observations retained.'), 10000);
                    return;
                }
                pending.forEach(entry => { entry.attempts = 0; send(entry); });
            },
            pendingCount: () => pending.size,
            canQueue: count => pending.size + (count || 1) <= limit,
            validate, utf8Bytes: bytes
        };
    }
    return { createTransport, validate, utf8Bytes: bytes, metrics: METRICS };
});
