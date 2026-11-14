/* Local-only results for the menu and circle tasks. Nothing here uploads: results and the
 * optional ease rating are kept in this browser's localStorage and can be exported as JSON. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) root.SurfaceInputsPathResults = api.mount(root);
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const KEY = 'jvision-path-results-v1';
    const LIMIT = 50;
    const LABELS = ['Very difficult', 'Difficult', 'Neither easy nor difficult', 'Easy', 'Very easy'];

    function store(storage) {
        const list = () => {
            try { const value = JSON.parse(storage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : []; }
            catch (_) { return []; }
        };
        return {
            list,
            save(record) {
                const entries = list();
                if (entries.length >= LIMIT) throw new Error('Local results are full (' + LIMIT + '). Export, then clear.');
                entries.push(record);
                storage.setItem(KEY, JSON.stringify(entries));
                return entries.length;
            },
            clear() { storage.removeItem(KEY); }
        };
    }

    function record(task, rows, ease, comment, now = new Date(), extra = {}) {
        if (ease !== null && !(Number.isInteger(ease) && ease >= 1 && ease <= 5)) throw new Error('Ease must be 1..5 or skipped.');
        return { version: 1, task, recorded_at: now.toISOString(), user_agent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
            ease, comment: comment || '', targets: rows, ...extra };
    }

    function mount(win) {
        const doc = win.document;
        let local;
        try { local = store(win.localStorage); } catch (_) { local = null; }
        function download() {
            const blob = new win.Blob([JSON.stringify(local ? local.list() : [], null, 2)], { type: 'application/json' });
            const link = doc.createElement('a');
            link.href = win.URL.createObjectURL(blob);
            link.download = 'jvision-path-results-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
            doc.body.appendChild(link); link.click(); link.remove();
            win.setTimeout(() => win.URL.revokeObjectURL(link.href), 1000);
        }
        /* Shows the completion panel; rows are frozen task results. */
        function complete(task, title, rows, extra = {}) {
            const panel = doc.getElementById('completion');
            panel.hidden = false;
            doc.getElementById('completion-title').textContent = title + ' complete';
            const form = doc.getElementById('completion-form');
            const status = doc.getElementById('completion-status');
            const finish = ease => {
                try {
                    if (!local) throw new Error('Local storage is unavailable; results were not saved.');
                    const count = local.save(record(task, rows, ease, doc.getElementById('completion-comment').value, new Date(), extra));
                    status.textContent = 'Saved in this browser (' + count + ' saved). Use Export to download them.';
                    form.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
                } catch (failure) { status.textContent = failure.message; }
            };
            form.onsubmit = event => {
                event.preventDefault();
                const choice = form.querySelector('input[name="ease"]:checked');
                if (!choice) { status.textContent = 'Choose a rating, or Skip.'; return; }
                finish(Number(choice.value));
            };
            doc.getElementById('completion-skip').onclick = () => finish(null);
            doc.getElementById('completion-export').onclick = download;
            doc.getElementById('completion-form').querySelector('input[name="ease"]').focus();
        }
        return { complete, download, list: () => (local ? local.list() : []) };
    }

    return { store, record, mount, labels: LABELS, storageKey: KEY };
});
