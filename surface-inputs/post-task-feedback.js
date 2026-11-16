/* Post-task feedback. Own Arcade wording, not a verbatim UXR questionnaire. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) root.SurfaceInputsFeedback = api.mount(root);
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const KEY = 'surface-inputs-dev-feedback-v1';
    const LIMIT = 50;
    const ACTIVITIES = ['touchpad_targeting', 'touchpad_scrolling', 'keyboard_natural_language',
        'keyboard_punctuation', 'keyboard_email', 'keyboard_password', 'keyboard_shortcuts', 'keyboard_arrows'];
    const LABELS = ['Very difficult', 'Difficult', 'Neither easy nor difficult', 'Easy', 'Very easy'];
    const bytes = text => new TextEncoder().encode(text).length;
    function payload(activity, round, id, ease, comment) {
        if (!ACTIVITIES.includes(activity)) throw new Error('Unknown feedback task.');
        if (!Number.isInteger(ease) || ease < 1 || ease > 5) throw new Error('Choose one ease rating.');
        if (typeof comment !== 'string' || bytes(comment) > 1024) throw new Error('Feedback must fit within 1,024 UTF-8 bytes. Please shorten it.');
        const result = {version:1, type:'feedback', id, activity_id:activity, scope:'task', round_id:round, ratings:{ease}, comment};
        if (![round,id].every(value => typeof value === 'string' && /^[\x21-\x7e]{1,64}$/.test(value))) throw new Error('Invalid feedback context.');
        const nativeDetails = {details_version:1, feedback_id:id, scope:'task', activity_id:activity,
            round_id:round, ratings:{ease}, comment, pain_points:[]};
        if (bytes(JSON.stringify(result)) > 2048 || bytes(JSON.stringify(nativeDetails)) > 2048) throw new Error('Encoded feedback is too large. Please shorten it.');
        return result;
    }
    function store(storage) {
        if (!storage) throw new Error('Local storage is unavailable.');
        function list() {
            const value = storage.getItem(KEY);
            const entries = value ? JSON.parse(value) : [];
            if (!Array.isArray(entries) || entries.length > LIMIT) throw new Error('Saved feedback is invalid; do not overwrite it.');
            return entries;
        }
        function put(message, status) {
            const entries = list();
            const index = entries.findIndex(entry => entry.message.id === message.id);
            if (index >= 0 && JSON.stringify(entries[index].message) !== JSON.stringify(message)) throw new Error('Saved feedback is immutable.');
            if (index < 0 && entries.length >= LIMIT) throw new Error('50 responses are saved. Export and clear them before saving another.');
            const entry = {message: JSON.parse(JSON.stringify(message)), status};
            if (index < 0) entries.push(entry); else entries[index] = entry;
            storage.setItem(KEY, JSON.stringify(entries));
            return entry;
        }
        return {list, put, clear: ids => {
            if (!ids) return storage.removeItem(KEY);
            const exported = new Set(ids);
            storage.setItem(KEY, JSON.stringify(list().filter(entry => !exported.has(entry.message.id))));
        }};
    }
    function retrySaved(saved, transport) {
        let count = 0, reason = '';
        try {
            for (const entry of saved.list().filter(entry => ['pending_native', 'native_rejected'].includes(entry.status))) {
                transport.submitFeedback(entry.message); count++;
            }
        } catch (error) { reason = error.message; }
        finally { transport.retryPending(); }
        return {count, reason};
    }
    function mount(win) {
        const doc = win.document;
        let current = null, sequence = 0, container = null, returnFocus = null, background = [], exportedIds = [];
        const prefix = 'feedback_' + (win.crypto && win.crypto.randomUUID ? win.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
        let saved;
        try { saved = store(win.localStorage); } catch (_) { /* explicit failure on Save, not task execution */ }
        const local = () => { if (!saved) throw new Error('Local storage is unavailable. Keep this page open; your feedback has not been saved.'); return saved; };
        const find = id => doc.getElementById(id);
        function status(text) { if (container) find('feedback-status').textContent = text; }
        function dismiss() {
            if (!container) return;
            container.hidden = true;
            background.forEach(([element, inert]) => { element.inert = inert; });
            background = [];
            current = null;
            if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
        }
        function exportResponses() {
            const responses = local().list();
            const data = JSON.stringify({feedback_version:1, environment:'development', responses}, null, 2);
            const blob = new win.Blob([data], {type:'application/json'});
            const url = win.URL.createObjectURL(blob);
            const link = doc.createElement('a');
            link.href = url; link.download = 'arcade-task-feedback.json'; doc.body.appendChild(link); link.click(); link.remove();
            win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
            exportedIds = responses.map(entry => entry.message.id);
            return exportedIds.slice();
        }
        function render() {
            if (container) return;
            container = doc.createElement('div'); container.id = 'post-task-feedback'; container.hidden = true;
            container.innerHTML = `<div class="feedback-panel" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="feedback-title">
              <h2 id="feedback-title">Feedback</h2>
              <form id="feedback-form">
                <fieldset><legend>How easy or difficult was this task?</legend>
                  <div class="feedback-scale">${LABELS.map((label,index) => `<label><input type="radio" name="feedback-ease" value="${index+1}"><span class="feedback-value">${index+1}</span><span>${label}</span></label>`).join('')}</div>
                </fieldset>
                <label class="feedback-comment-label" for="feedback-comment">What worked well, or what could be improved?</label>
                <textarea id="feedback-comment" rows="4"></textarea>
                <p id="feedback-status" role="status" aria-live="polite"></p>
                <div class="feedback-actions"><button id="feedback-save" type="button">Upload</button><button id="feedback-retry" type="button" hidden>Retry native delivery</button><button id="feedback-retry-saved" type="button" hidden>Retry saved native feedback</button></div>
              </form>
            </div>`;
            doc.body.appendChild(container);
            find('feedback-form').addEventListener('submit', event => event.preventDefault());
            find('feedback-save').addEventListener('click', save);
            find('feedback-retry').addEventListener('click', () => {
                if (!current || !current.message) return;
                try {
                    const transport = win.SurfaceInputsTransport;
                    try { transport.submitFeedback(current.message); }
                    finally { transport.retryPending(); }
                    status('Queued for native delivery; waiting for a sink ACK.');
                } catch (error) { status(error.message + ' Your response is retained locally.'); }
            });
            find('feedback-retry-saved').addEventListener('click', () => {
                try {
                    const transport = win.SurfaceInputsTransport;
                    if (!transport.usesNative()) throw new Error('Native feedback transport is not connected.');
                    const result = retrySaved(local(), transport);
                    status(result.count + ' saved responses queued for native delivery; waiting for sink ACKs.' + (result.reason ? ' ' + result.reason + ' Remaining responses are retained for a later retry.' : ''));
                } catch (error) { status(error.message + ' Unacknowledged responses remain saved locally.'); }
            });
            container.addEventListener('keydown', event => {
                if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
                if (event.key === 'Tab') {
                    const enabled = [...container.querySelectorAll('button, input, textarea')].filter(e => !e.disabled && !e.hidden && e.getClientRects().length);
                    const radio = enabled.find(e => e.type === 'radio' && e.checked) || enabled.find(e => e === doc.activeElement && e.type === 'radio') || enabled.find(e => e.type === 'radio');
                    const controls = enabled.filter(e => e.type !== 'radio' || e === radio);
                    if (!controls.length) { event.preventDefault(); container.querySelector('.feedback-panel').focus(); return; }
                    const first=controls[0], last=controls[controls.length-1];
                    if (event.shiftKey && (doc.activeElement === first || doc.activeElement.type === 'radio')) { event.preventDefault(); last.focus(); }
                    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
                }
            });
        }
        function save() {
            if (!current || current.message) return;
            try {
                const rating = container.querySelector('input[name="feedback-ease"]:checked');
                const message = payload(current.activity, current.round, current.id, rating ? Number(rating.value) : null, find('feedback-comment').value);
                const transport = win.SurfaceInputsTransport;
                transport.validate(message);
                // Persist immutable data before enqueue; reload/export never pretends it was delivered.
                local().put(message, transport.usesNative() ? 'pending_native' : 'saved_local');
                current.message = message;
                find('feedback-save').disabled = true;
                find('feedback-comment').disabled = true;
                container.querySelectorAll('input[name="feedback-ease"]').forEach(input => { input.disabled = true; });
                if (!transport.usesNative()) {
                    status('Saved on this browser only. No feedback collector is configured; this has not been uploaded.');
                    container.querySelector('.feedback-panel').focus();
                    return;
                }
                find('feedback-retry').hidden = false;
                find('feedback-retry').focus();
                status('Saved locally and queued for native delivery; waiting for a sink ACK.');
                try { transport.submitFeedback(message); }
                catch (error) { status(error.message + ' Your response is retained locally; retry or export it.'); }
            } catch (error) { status(error.message); }
        }
        win.addEventListener('surface-inputs-ack', event => {
            let message;
            try { message = local().list().find(entry => entry.message.id === event.detail.id)?.message; } catch (_) { return; }
            if (!message) return;
            const accepted = event.detail.status === 'accepted';
            try { local().put(message, accepted ? 'native_sink_accepted' : 'native_rejected'); } catch (error) { status(error.message); return; }
            if (!current || !current.message || current.message.id !== message.id) return;
            if (accepted) {
                find('feedback-retry').hidden = true;
                status('Accepted by the native feedback sink. This is not confirmation of a server upload.');
                dismiss();
            } else status('Native feedback was rejected. Your response is retained locally; retry it.');
        });
        win.addEventListener('surface-inputs-mode', () => {
            if (!container || container.hidden) return;
            try { find('feedback-retry-saved').hidden = !win.SurfaceInputsTransport.usesNative() || !local().list().some(entry => ['pending_native','native_rejected'].includes(entry.status)); }
            catch (_) { find('feedback-retry-saved').hidden = true; }
        });
        win.addEventListener('surface-inputs-transport-error', event => {
            if (current && current.message && event.detail.id === current.message.id) status(event.detail.reason + ' Your response is retained locally.');
        });
        return {
            getSavedFeedback: () => local().list(),
            exportSavedFeedback: exportResponses,
            clearExportedFeedback() {
                if (!exportedIds.length) throw new Error('Export a private copy before clearing saved feedback.');
                if (win.confirm('Clear only the saved responses in your exported copy?')) {
                    local().clear(exportedIds); exportedIds = [];
                }
            },
            complete(activity) {
                if (!ACTIVITIES.includes(activity) || current) return;
                const token = prefix + '_' + (++sequence).toString(36);
                current = {activity, round:token, id:token};
                win.setTimeout(() => {
                    render();
                    returnFocus = doc.activeElement;
                    background = [...doc.body.children].filter(element => element !== container).map(element => [element, element.inert]);
                    background.forEach(([element]) => { element.inert = true; });
                    container.hidden = false;
                    find('feedback-form').reset();
                    find('feedback-title').textContent = 'Feedback';
                    find('feedback-save').disabled = false;
                    find('feedback-comment').disabled = false;
                    container.querySelectorAll('input[name="feedback-ease"]').forEach(input => { input.disabled = false; });
                    find('feedback-retry').hidden = true;
                    try { find('feedback-retry-saved').hidden = !win.SurfaceInputsTransport.usesNative() || !local().list().some(entry => ['pending_native','native_rejected'].includes(entry.status)); }
                    catch (_) { find('feedback-retry-saved').hidden = true; }
                    status('');
                    container.querySelector('input[name="feedback-ease"]').focus();
                }, 0);
            }
        };
    }
    return {payload, store, retrySaved, mount, labels:LABELS, storageKey:KEY};
});
