/* Menu-navigation trial state. Pure logic: no DOM, timers or uploads.
 * Times are caller-supplied monotonic milliseconds (performance.now() in the browser). */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SurfaceInputsPathTasks = api;
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const finite = value => typeof value === 'number' && Number.isFinite(value);

    const MENU_LABELS = Object.freeze([
        ['Edit', 'View', 'File', 'Insert', 'Format', 'Tools', 'Window', 'Help', 'Share', 'Account'],
        ['New', 'Open', 'Save', 'Export'],
        ['Spreadsheet', 'Document', 'Presentation', 'Drawing'],
        ['A4', 'Letter', '5×8', 'Custom'],
        ['Pages', 'Pageless']
    ].map(level => Object.freeze(level)));
    const MENU_PATH = Object.freeze([2, 0, 1, 2, 1]);

    function row(index, count, status, elapsedMs, traceValid, metrics, attributes) {
        return Object.freeze({ index, count, status, elapsed_ms: elapsedMs, trace_valid: traceValid,
            metrics: Object.freeze(Object.assign({}, metrics)), attributes: Object.freeze(Object.assign({}, attributes)) });
    }

    /* Shallow (3-level) then deep (5-level) cascading-menu selection. */
    class MenuTrials {
        constructor(onAllCompleted = () => {}) {
            this.depths = [3, 5];
            this.onAllCompleted = onAllCompleted;
            this.targetIndex = 0;
            this.visibleLevels = 0;
            this.feedback = 'Open the menu to begin.';
            this.startMs = null;
            this.lastMs = 0;
            this.frozen = false;
            this.results = [];
            this.reset();
        }
        reset() {
            this.attempts = 0; this.clicks = 0; this.wrong = 0; this.closures = 0;
            this.deepest = 0; this.travel = 0; this.previous = null; this.segments = 0; this.valid = true;
        }
        get startedAtMs() { return this.startMs; }
        get allCompleted() { return this.results.length === this.depths.length && this.results.every(r => r.status === 'completed'); }
        get resolved() { return this.results.length > this.targetIndex; }
        get depth() { return this.depths[this.targetIndex]; }
        get requestedPath() {
            return Array.from({ length: this.depth }, (_, level) => MENU_LABELS[level][MENU_PATH[level]]).join(' → ');
        }
        open(nowMs) {
            if (this.frozen || this.resolved) return;
            if (this.startMs === null) { this.startMs = nowMs; this.lastMs = nowMs; }
            if (!this.accept(nowMs)) return;
            this.visibleLevels = 1;
            this.previous = null;
            this.feedback = 'Follow the requested path.';
        }
        validItem(level, item) {
            return Number.isInteger(level) && Number.isInteger(item) && level >= 0 && level < this.visibleLevels &&
                item >= 0 && item < MENU_LABELS[level].length;
        }
        hover(level, item, nowMs) {
            if (this.visibleLevels === 0 || this.resolved || this.frozen || !this.accept(nowMs)) return;
            if (!this.validItem(level, item)) return;
            const onPath = item === MENU_PATH[level];
            this.visibleLevels = onPath && level < this.depth - 1 ? level + 2 : level + 1;
            if (onPath) this.deepest = Math.max(this.deepest, level + 1);
        }
        select(level, item, nowMs) {
            if (this.visibleLevels === 0 || this.resolved || this.frozen || !this.accept(nowMs)) return;
            if (!this.validItem(level, item)) return;
            this.clicks++;
            if (item === MENU_PATH[level] && level < this.depth - 1) { this.hover(level, item, nowMs); return; }
            this.attempts++;
            this.visibleLevels = 0;
            this.previous = null;
            if (level === this.depth - 1 && item === MENU_PATH[level]) {
                this.deepest = this.depth;
                this.results.push(this.result('completed', nowMs));
                this.feedback = '✓ Complete';
                if (this.allCompleted) this.onAllCompleted(nowMs);
            } else {
                this.wrong++;
                this.feedback = 'Different option selected. Reopen the menu and try again.';
            }
        }
        dismiss(nowMs) {
            if (this.visibleLevels === 0 || this.resolved || this.frozen || !this.accept(nowMs)) return;
            this.closures++;
            this.visibleLevels = 0;
            this.previous = null;
            this.feedback = 'Menu closed. Reopen it to continue.';
        }
        move(x, y, nowMs) {
            if (this.visibleLevels === 0 || this.resolved || this.frozen || !this.accept(nowMs)) return;
            if (!finite(x) || !finite(y)) { this.valid = false; this.previous = null; return; }
            if (this.previous) { this.travel += Math.hypot(x - this.previous.x, y - this.previous.y); this.segments++; }
            this.previous = { x, y };
        }
        interrupt() {
            if (this.startMs !== null && !this.resolved) { this.valid = false; this.previous = null; }
        }
        next() {
            if (!this.resolved || this.targetIndex === this.depths.length - 1 || this.frozen) return;
            this.targetIndex++;
            this.startMs = null;
            this.reset();
            this.feedback = 'Open the menu to begin.';
        }
        snapshot() { return this.metrics(); }
        targetResults(nowMs) {
            if (!this.frozen) {
                if (!this.resolved) this.results.push(this.result('abandoned', Math.max(this.lastMs, nowMs)));
                for (let index = this.results.length; index < this.depths.length; index++) {
                    this.results.push(row(index, this.depths.length, 'abandoned', 0, false,
                        { measurement_started: 0, stp_menu_depth: this.depths[index] }, this.attributes(index)));
                }
                this.frozen = true;
                this.visibleLevels = 0;
            }
            return this.results.slice();
        }
        accept(nowMs) {
            if (!finite(nowMs) || nowMs < this.lastMs) { this.valid = false; this.previous = null; return false; }
            this.lastMs = nowMs;
            return true;
        }
        metrics() {
            const out = { measurement_started: this.startMs !== null ? 1 : 0, stp_menu_depth: this.depth };
            if (this.startMs !== null) {
                Object.assign(out, {
                    stp_menu_attempt_count: this.attempts,
                    stp_menu_wrong_selection_count: this.wrong,
                    stp_menu_dismissal_count: this.closures,
                    stp_menu_deepest_level: this.deepest,
                    stp_menu_first_attempt_success: this.attempts === 1 && this.wrong === 0 && this.resolved ? 1 : 0,
                    clicks_total: this.clicks
                });
                if (this.valid && this.segments > 0) out.total_cursor_distance_px = Math.round(this.travel * 10) / 10;
            }
            return out;
        }
        attributes(index) {
            return { stp_target_kind: 'cascading_menu', stp_condition: this.depths[index] + '_levels_10_4_4_4_2',
                stp_measurement: 'app_output', stp_attempt_source: 'terminal_selection' };
        }
        result(status, nowMs) {
            const metrics = this.metrics();
            if (status === 'completed') metrics.stp_menu_first_attempt_success = this.attempts === 1 ? 1 : 0;
            return row(this.targetIndex, this.depths.length, status,
                this.startMs !== null ? Math.max(0, nowMs - this.startMs) : 0,
                this.valid && this.segments > 0, metrics, this.attributes(this.targetIndex));
        }
    }

    return { MENU_LABELS, MENU_PATH, MenuTrials };
});
