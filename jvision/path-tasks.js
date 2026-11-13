/* Menu-navigation and circle-tracing trial state. Pure logic: no DOM, timers or uploads.
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

    /* Six clockwise laps (screen coordinates, y down) around a reference circle. */
    class CircleTrials {
        constructor(onAllCompleted = () => {}) {
            this.lapCount = 6;
            this.onAllCompleted = onAllCompleted;
            this.radius = 0; this.centerX = 0; this.centerY = 0;
            this.feedback = 'Move to the blue marker, then trace clockwise without clicking.';
            this.startedAtMs = null;
            this.lastMs = 0;
            this.frozen = false;
            this.attempts = 0; this.interruptions = 0; this.clicks = 0;
            this.previous = null; this.origin = null;
            this.progress = 0; this.travel = 0; this.squareError = 0; this.samples = 0;
            this.errors = new Int32Array(401); this.maxError = 0;
            this.minX = 0; this.maxX = 0; this.minY = 0; this.maxY = 0;
            this.baselineCenter = null; this.baselineAllowed = true;
            this.results = [];
        }
        get completedLaps() { return this.results.filter(r => r.status === 'completed').length; }
        get allCompleted() { return this.completedLaps === this.lapCount; }
        get active() { return this.previous !== null; }
        geometry(x, y, r) {
            if (this.frozen || !finite(x) || !finite(y) || !finite(r) || r <= 0) return;
            if (this.radius === r && this.centerX === x && this.centerY === y) return;
            if (this.startedAtMs !== null || this.results.length > 0) this.baselineAllowed = false;
            this.interrupt();
            this.centerX = x; this.centerY = y; this.radius = r;
            // A resize changes the authored reference and cannot share a drift baseline.
            this.baselineCenter = null;
        }
        move(x, y, nowMs) {
            if (this.frozen || this.allCompleted || this.radius <= 0) return;
            if (!finite(x) || !finite(y) || !finite(nowMs) || nowMs < this.lastMs) { this.interrupt(); return; }
            this.lastMs = nowMs;
            const radial = Math.hypot(x - this.centerX, y - this.centerY);
            if (radial < this.radius * 0.5 || radial > this.radius * 1.75) { this.interrupt(); return; }
            const old = this.previous;
            if (!old) {
                if (Math.hypot(x - this.centerX - this.radius, y - this.centerY) > this.radius * 0.18) return;
                if (this.startedAtMs === null) this.startedAtMs = nowMs;
                this.attempts++;
                this.progress = 0; this.travel = 0; this.squareError = 0; this.samples = 0;
                this.errors.fill(0); this.maxError = 0;
                this.minX = this.maxX = x; this.minY = this.maxY = y;
                this.origin = { x, y };
                this.feedback = 'Trace clockwise · Lap ' + (this.completedLaps + 1) + ' of ' + this.lapCount;
            } else {
                const angle = Math.atan2(y - this.centerY, x - this.centerX);
                const oldAngle = Math.atan2(old.y - this.centerY, old.x - this.centerX);
                let delta = angle - oldAngle;
                if (delta > Math.PI) delta -= 2 * Math.PI;
                if (delta < -Math.PI) delta += 2 * Math.PI;
                if (Math.abs(delta) > Math.PI / 2) { this.interrupt(); return; }
                this.progress += delta;
                this.travel += Math.hypot(x - old.x, y - old.y);
            }
            const error = Math.abs(radial - this.radius);
            this.squareError += error * error;
            this.samples++;
            this.maxError = Math.max(this.maxError, error);
            this.errors[Math.min(400, Math.ceil(error / this.radius * 200))]++;
            this.minX = Math.min(this.minX, x); this.maxX = Math.max(this.maxX, x);
            this.minY = Math.min(this.minY, y); this.maxY = Math.max(this.maxY, y);
            this.previous = { x, y };
            if (this.progress >= 2 * Math.PI - 1e-6) {
                this.results.push(this.result('completed', nowMs));
                if (this.baselineCenter === null && this.baselineAllowed) {
                    this.baselineCenter = { x: (this.minX + this.maxX) / 2, y: (this.minY + this.maxY) / 2 };
                }
                this.previous = null;
                this.startedAtMs = null;
                this.attempts = 0; this.interruptions = 0; this.clicks = 0;
                this.feedback = this.allCompleted ? '✓ Six laps complete'
                    : 'Return to the blue marker for lap ' + (this.completedLaps + 1) + '.';
                if (this.allCompleted) this.onAllCompleted(nowMs);
            }
        }
        interrupt() {
            if (this.frozen || this.allCompleted) return;
            if (this.previous !== null) {
                this.interruptions++;
                this.feedback = 'Path interrupted. Return to the blue marker to restart this lap.';
            }
            this.previous = null;
        }
        click() {
            if (!this.frozen && !this.allCompleted && this.startedAtMs !== null) this.clicks++;
        }
        snapshot() {
            const last = this.results[this.results.length - 1];
            return last ? last.metrics : this.metrics();
        }
        targetResults(nowMs) {
            if (!this.frozen) {
                if (!this.allCompleted) this.results.push(this.result('abandoned', Math.max(this.lastMs, nowMs)));
                while (this.results.length < this.lapCount) {
                    this.results.push(row(this.results.length, this.lapCount, 'abandoned', 0, false,
                        { measurement_started: 0 }, this.attributes()));
                }
                this.frozen = true;
            }
            return this.results.slice();
        }
        attributes() {
            return { stp_target_kind: 'circle_lap', stp_condition: 'clockwise_6_laps', stp_measurement: 'app_output' };
        }
        metrics() {
            const out = { measurement_started: this.startedAtMs !== null ? 1 : 0 };
            if (this.startedAtMs !== null) {
                Object.assign(out, {
                    stp_circle_attempt_count: this.attempts,
                    stp_circle_interruption_count: this.interruptions,
                    stp_circle_accidental_click_count: this.clicks,
                    stp_circle_reference_radius_px: this.radius
                });
            }
            return out;
        }
        result(status, nowMs) {
            const valid = status === 'completed' && this.samples > 4;
            const values = this.metrics();
            if (valid) {
                values.stp_circle_sample_count = this.samples;
                values.stp_circle_radial_rms_px = Math.sqrt(this.squareError / this.samples);
                values.stp_circle_radial_p95_px = this.percentile95();
                values.total_cursor_distance_px = this.travel;
                if (this.origin && this.previous) {
                    values.stp_circle_closure_error_px = Math.hypot(this.previous.x - this.origin.x, this.previous.y - this.origin.y);
                }
                const observed = { x: (this.minX + this.maxX) / 2, y: (this.minY + this.maxY) / 2 };
                values.stp_circle_bounds_radius_px = ((this.maxX - this.minX) + (this.maxY - this.minY)) / 4;
                const baseline = this.baselineCenter ||
                    (this.results.length === 0 && this.baselineAllowed ? observed : null);
                if (baseline) values.stp_circle_center_shift_px = Math.hypot(observed.x - baseline.x, observed.y - baseline.y);
            }
            return row(this.results.length, this.lapCount, status,
                this.startedAtMs !== null ? Math.max(0, nowMs - this.startedAtMs) : 0, valid, values, this.attributes());
        }
        percentile95() {
            const target = Math.ceil(this.samples * 0.95);
            let count = 0;
            for (let index = 0; index < this.errors.length; index++) {
                count += this.errors[index];
                if (count >= target) return Math.min(this.maxError, index * this.radius / 200);
            }
            return this.maxError;
        }
    }

    return { MENU_LABELS, MENU_PATH, MenuTrials, CircleTrials };
});
