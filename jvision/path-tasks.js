/* Menu-navigation, circle-tracing and file drag-and-drop trial state. Pure logic: no DOM, timers or uploads.
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

    /* File drag and drop: find a named file in a scrollable list and drag it onto a named folder. */
    const FILE_DRAG_FILES = Object.freeze([
        'Agenda.docx', 'Brand guidelines.pdf', 'Brand guidelines final.pdf', 'Brand guidelines final (old).pdf',
        'Client contacts.csv', 'Expense policy.pdf', 'Hiring plan.xlsx', 'Interview notes.docx',
        'Launch checklist.md', 'Meeting notes 0412.docx', 'Office floor plan.pdf', 'Onboarding guide.pdf',
        'Partner contract.pdf', 'Press release draft.docx', 'Q2 budget final.xlsx', 'Q3 budget draft.xlsx',
        'Q3 budget final.xlsx', 'Q3 budget final (1).xlsx', 'Q4 forecast.xlsx', 'Quarterly review.pptx',
        'Release notes.md', 'Research summary.pdf', 'Roadmap 2027.pptx', 'Sales pipeline.xlsx',
        'Security review.pdf', 'Server inventory.csv', 'Site photos.zip', 'Site plan.pdf',
        'Site survey notes v1.pdf', 'Site survey notes v2.pdf', 'Site survey notes v2 (copy).pdf', 'Style sheet.css',
        'Team offsite photos.zip', 'Travel itinerary.pdf', 'Vendor list.xlsx', 'Weekly status.docx'
    ]);
    const FILE_DRAG_FOLDERS = Object.freeze(['Documents', 'Finance', 'Finance archive', 'Projects',
        'Project templates', 'Shared', 'Archive']);
    const fileSpec = (file, folder, startAtEnd, foldersOnLeft, condition) => Object.freeze({
        file, folder, startAtEnd, foldersOnLeft, condition,
        fileIndex: FILE_DRAG_FILES.indexOf(file), folderIndex: FILE_DRAG_FOLDERS.indexOf(folder)
    });
    const FILE_DRAG_SPECS = Object.freeze([
        fileSpec('Q3 budget final.xlsx', 'Finance', false, true, 'scroll_down_short_folder_left_upper'),
        fileSpec('Site survey notes v2.pdf', 'Projects', false, false, 'scroll_down_long_folder_right_middle'),
        fileSpec('Brand guidelines final.pdf', 'Archive', true, true, 'scroll_up_long_folder_left_lower')
    ]);
    const SCROLL_ACTIVE_MS = 250, ACCIDENTAL_REGRAB_MS = 800, REVERSAL_ROWS = 0.25, OVERSHOOT_EPSILON_PX = 0.5;
    const round1 = value => Math.round(value * 10) / 10;
    const round3 = value => Math.round(value * 1000) / 1000;
    function rect(left, top, right, bottom) {
        return Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top,
            centerX: (left + right) / 2, centerY: (top + bottom) / 2,
            contains: (x, y) => x >= left && x < right && y >= top && y < bottom,
            edgeDistance: (x, y) => Math.hypot(Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom)) });
    }

    class FileDragTrials {
        constructor(onAllCompleted = () => {}, specs = FILE_DRAG_SPECS) {
            this.specs = specs;
            this.onAllCompleted = onAllCompleted;
            this.targetIndex = 0;
            this.feedback = 'Select Begin to show the files.';
            this.rowHeight = 0;
            this.listRect = rect(0, 0, 0, 0);
            this.folderRects = [];
            this.slopPx = 0;
            this.view = null;
            this.frozen = false;
            this.results = [];
            this.lastMs = 0;
            this.reset();
        }
        reset() {
            this.offset = 0; this.press = null; this.startedAtMs = null;
            this.clicks = 0; this.attempts = 0; this.wrongFile = 0; this.wrongFolder = 0; this.outside = 0;
            this.inferredAccidental = 0; this.cancelled = 0; this.pressWithoutDrag = 0;
            this.firstAttemptCorrect = null; this.grabMs = null; this.visibleMs = null; this.dragStartMs = 0;
            this.lastOutsideReleaseMs = null; this.missEdge = null; this.holdTravel = 0; this.holdValid = true;
            this.orderingValid = true; this.resized = false; this.startDistance = 0; this.approach = 0;
            this.lastScrollMs = null; this.scrollDistance = 0; this.scrollDirection = 0; this.oppositeTravel = 0;
            this.reversals = 0; this.overshoots = 0; this.overshootMax = 0; this.beyond = false;
            this.corrective = 0; this.scrollClicks = 0;
        }
        get spec() { return this.specs[this.targetIndex]; }
        get targetCount() { return this.specs.length; }
        get started() { return this.startedAtMs !== null; }
        get resolved() { return this.results.length > this.targetIndex; }
        get active() { return this.started && !this.resolved && !this.frozen; }
        get allCompleted() { return this.results.length === this.specs.length && this.results.every(r => r.status === 'completed'); }
        get maxOffset() { return Math.max(0, FILE_DRAG_FILES.length * this.rowHeight - this.listRect.height); }
        get dropFolder() { return this.press && this.press.dragging ? this.folderAt(this.press.x, this.press.y) : null; }
        get traceValid() { return this.attempts > 0 && this.holdValid && this.orderingValid && !this.resized; }

        geometry(width, height, density, slop) {
            if (this.frozen || !(width > 0) || !(height > 0) || !(density > 0)) return;
            const rows = this.rowHeight > 0 ? this.offset / this.rowHeight : NaN;
            if (this.press) this.cancel(this.lastMs);
            this.view = { width, height, density };
            this.slopPx = slop > 0 ? slop : 8 * density;
            this.layout();
            if (this.active) {
                this.resized = true;
                this.offset = Number.isFinite(rows) ? Math.min(Math.max(rows * this.rowHeight, 0), this.maxOffset) : 0;
                this.checkVisible(this.lastMs);
            }
        }
        /* Each target authors its own folder side, so the layout follows the current target. */
        layout() {
            if (!this.view) return;
            const { width, height, density } = this.view;
            const gap = 12 * density, sidebar = width * 0.34, left = this.spec.foldersOnLeft;
            this.rowHeight = Math.min(40 * density, height / 6);
            this.listRect = left ? rect(sidebar + gap, 0, width, height) : rect(0, 0, width - sidebar - gap, height);
            const sidebarLeft = left ? 0 : width - sidebar;
            const slot = height / FILE_DRAG_FOLDERS.length, inset = Math.min(4 * density, slot / 8);
            this.folderRects = FILE_DRAG_FOLDERS.map((_, i) =>
                rect(sidebarLeft, i * slot + inset, sidebarLeft + sidebar, (i + 1) * slot - inset));
        }
        fileAt(x, y) {
            if (!this.listRect.contains(x, y) || this.rowHeight <= 0) return null;
            const index = Math.floor((y - this.listRect.top + this.offset) / this.rowHeight);
            return index >= 0 && index < FILE_DRAG_FILES.length ? index : null;
        }
        folderAt(x, y) {
            const index = this.folderRects.findIndex(r => r.contains(x, y));
            return index >= 0 ? index : null;
        }
        begin(nowMs) {
            if (this.frozen || this.started || this.resolved || this.rowHeight <= 0) return;
            this.startedAtMs = nowMs;
            this.lastMs = nowMs;
            this.offset = this.spec.startAtEnd ? this.maxOffset : 0;
            const [lo, hi] = this.visibleBand();
            this.approach = this.offset < lo ? 1 : this.offset > hi ? -1 : 0;
            this.startDistance = Math.max(lo - this.offset, this.offset - hi, 0);
            this.feedback = 'Find ' + this.spec.file + '.';
            this.checkVisible(nowMs);
        }
        scroll(deltaPx, nowMs) {
            if (!this.active || !finite(deltaPx) || deltaPx === 0) return;
            if (!this.accept(nowMs)) return;
            this.lastScrollMs = nowMs;
            const applied = Math.min(Math.max(this.offset + deltaPx, 0), this.maxOffset) - this.offset;
            if (applied === 0) return;
            this.offset += applied;
            this.scrollDistance += Math.abs(applied);
            const direction = Math.sign(applied);
            if (this.scrollDirection === 0 || direction === this.scrollDirection) {
                this.scrollDirection = direction;
                this.oppositeTravel = 0;
            } else {
                this.oppositeTravel += Math.abs(applied);
                if (this.oppositeTravel >= this.rowHeight * REVERSAL_ROWS) {
                    this.reversals++;
                    this.scrollDirection = direction;
                    this.oppositeTravel = 0;
                }
            }
            if (this.approach !== 0) {
                const [lo, hi] = this.visibleBand();
                const past = this.approach > 0 ? this.offset - hi : lo - this.offset;
                if (past > OVERSHOOT_EPSILON_PX) {
                    if (!this.beyond) this.overshoots++;
                    this.beyond = true;
                    this.overshootMax = Math.max(this.overshootMax, past);
                } else this.beyond = false;
                if (this.overshoots > 0 && direction === -this.approach) this.corrective += Math.abs(applied);
            }
            this.checkVisible(nowMs);
        }
        pressAt(x, y, nowMs, independent) {
            if (!this.active || this.press) return;
            if (!this.accept(nowMs) || !finite(x) || !finite(y)) return;
            this.clicks++;
            if (this.lastScrollMs !== null && nowMs - this.lastScrollMs <= SCROLL_ACTIVE_MS) this.scrollClicks++;
            const file = this.fileAt(x, y);
            if (file === this.spec.fileIndex) {
                if (this.grabMs === null) this.grabMs = nowMs;
                if (this.lastOutsideReleaseMs !== null && nowMs - this.lastOutsideReleaseMs <= ACCIDENTAL_REGRAB_MS) this.inferredAccidental++;
            }
            this.lastOutsideReleaseMs = null;
            this.press = { file, downX: x, downY: y, independent, x, y, travel: 0, dragging: false };
        }
        move(x, y, nowMs) {
            const current = this.press;
            if (!current || !this.active) return;
            if (!this.accept(nowMs) || !finite(x) || !finite(y)) { this.cancel(nowMs); return; }
            const next = Object.assign({}, current, { x, y, travel: current.travel + Math.hypot(x - current.x, y - current.y) });
            if (!next.dragging && next.file !== null && Math.hypot(x - next.downX, y - next.downY) > this.slopPx) {
                next.dragging = true;
                this.attempts++;
                this.dragStartMs = nowMs;
                if (next.file !== this.spec.fileIndex) this.wrongFile++;
                this.feedback = 'Dragging ' + FILE_DRAG_FILES[next.file];
            }
            this.press = next;
        }
        release(x, y, nowMs) {
            const current = this.press;
            if (!current || !this.active) return;
            if (!this.accept(nowMs) || !finite(x) || !finite(y)) { this.cancel(nowMs); return; }
            this.press = null;
            if (!current.dragging) {
                if (current.file !== null) {
                    this.pressWithoutDrag++;
                    if (current.file === this.spec.fileIndex) this.feedback = 'Keep the press held and move to drag the file.';
                }
                return;
            }
            const travel = current.travel + Math.hypot(x - current.x, y - current.y);
            if (current.independent) this.holdTravel += travel; else this.holdValid = false;
            const file = current.file, folder = this.folderAt(x, y), target = this.folderRects[this.spec.folderIndex];
            const success = file === this.spec.fileIndex && folder === this.spec.folderIndex;
            if (this.firstAttemptCorrect === null) this.firstAttemptCorrect = success;
            if (success) {
                this.results.push(this.result('completed', nowMs, x, y, nowMs - this.dragStartMs));
                this.feedback = '✓ Moved ' + this.spec.file + ' to ' + this.spec.folder;
                if (this.allCompleted) this.onAllCompleted(nowMs);
            } else if (file !== this.spec.fileIndex) {
                if (folder === null) this.outside++;
                this.feedback = 'That was ' + FILE_DRAG_FILES[file] + '. Find ' + this.spec.file + '.';
            } else if (folder !== null) {
                this.wrongFolder++;
                this.missEdge = target.edgeDistance(x, y);
                this.feedback = 'Dropped on ' + FILE_DRAG_FOLDERS[folder] + '. Drag it to ' + this.spec.folder + '.';
            } else {
                this.outside++;
                this.missEdge = target.edgeDistance(x, y);
                this.lastOutsideReleaseMs = nowMs;
                this.feedback = 'Released outside a folder. Drag the file onto ' + this.spec.folder + '.';
            }
        }
        /* A cancelled gesture is not a delivered release. */
        cancel(nowMs) {
            const current = this.press;
            if (!current) return;
            this.press = null;
            if (current.dragging && this.active) {
                this.cancelled++;
                if (this.firstAttemptCorrect === null) this.firstAttemptCorrect = false;
                this.feedback = 'Drag cancelled. Press and drag the file again.';
            }
            if (nowMs < this.lastMs) this.orderingValid = false;
        }
        next() {
            if (!this.resolved || this.targetIndex === this.specs.length - 1 || this.frozen) return;
            this.targetIndex++;
            this.reset();
            this.layout();
            this.feedback = 'Select Begin to show the next files.';
        }
        snapshot() { return this.metrics(false); }
        targetResults(nowMs) {
            if (!this.frozen) {
                if (this.press) this.cancel(nowMs);
                if (this.started && !this.resolved) this.results.push(this.result('abandoned', Math.max(this.lastMs, nowMs)));
                for (let index = this.results.length; index < this.specs.length; index++) {
                    this.results.push(row(index, this.specs.length, 'abandoned', 0, false,
                        { measurement_started: 0 }, this.attributes(index)));
                }
                this.frozen = true;
            }
            return this.results.slice();
        }
        visibleBand() {
            const top = this.spec.fileIndex * this.rowHeight, max = this.maxOffset;
            const lo = Math.min(Math.max(top + this.rowHeight - this.listRect.height, 0), max);
            const hi = Math.min(Math.max(top, 0), max);
            return [lo, Math.max(lo, hi)];
        }
        checkVisible(nowMs) {
            if (this.startedAtMs === null || this.visibleMs !== null) return;
            const [lo, hi] = this.visibleBand();
            if (this.offset >= lo - 0.5 && this.offset <= hi + 0.5) this.visibleMs = Math.max(0, nowMs - this.startedAtMs);
        }
        accept(nowMs) {
            if (!finite(nowMs) || nowMs < this.lastMs) { this.orderingValid = false; return false; }
            this.lastMs = nowMs;
            return true;
        }
        metrics(completed, dropX, dropY, dragMs) {
            const start = this.startedAtMs, out = { measurement_started: start !== null ? 1 : 0 };
            if (start === null) return out;
            Object.assign(out, {
                drag_attempt_count: this.attempts,
                drag_wrong_selection_count: this.wrongFile
            });
            if (this.firstAttemptCorrect !== null) out.drag_first_attempt_selected_target = this.firstAttemptCorrect ? 1 : 0;
            Object.assign(out, {
                clicks_total: this.clicks,
                stp_file_retry_count: Math.max(0, this.attempts - 1),
                stp_file_wrong_folder_drop_count: this.wrongFolder,
                stp_file_outside_release_count: this.outside,
                stp_file_inferred_accidental_release_count: this.inferredAccidental,
                stp_file_cancelled_drag_count: this.cancelled,
                stp_file_press_without_drag_count: this.pressWithoutDrag,
                stp_file_start_distance_px: round1(this.startDistance)
            });
            if (this.grabMs !== null) out.stp_file_time_to_find_ms = Math.max(0, this.grabMs - start);
            if (this.visibleMs !== null) out.stp_file_time_to_visible_ms = this.visibleMs;
            if (completed && dragMs !== undefined) {
                const folder = this.folderRects[this.spec.folderIndex];
                const dx = dropX - folder.centerX, dy = dropY - folder.centerY;
                out.stp_file_drag_completion_ms = Math.max(0, dragMs);
                out.stp_file_drop_center_error_px = round1(Math.hypot(dx, dy));
                out.stp_file_drop_center_error_norm = round3(Math.max(Math.abs(dx) / (folder.width / 2), Math.abs(dy) / (folder.height / 2)));
            }
            if (this.missEdge !== null) out.stp_file_miss_edge_distance_px = round1(this.missEdge);
            if (this.traceValid) out.stp_file_hold_travel_px = round1(this.holdTravel);
            out.stp_file_scroll_distance_px = round1(this.scrollDistance);
            out.stp_file_scroll_reversal_count = this.reversals;
            out.stp_file_scroll_click_count = this.scrollClicks;
            if (this.approach !== 0) {
                out.stp_file_scroll_overshoot_count = this.overshoots;
                out.stp_file_scroll_overshoot_max_px = round1(this.overshootMax);
                out.stp_file_corrective_scroll_px = round1(this.corrective);
            }
            return out;
        }
        attributes(index) {
            const spec = this.specs[index];
            return { stp_target_kind: 'file_drag', stp_condition: spec.condition, stp_measurement: 'app_output',
                stp_attempt_source: 'delivered_drag', drag_target_text: spec.file + ' → ' + spec.folder };
        }
        result(status, nowMs, dropX, dropY, dragMs) {
            return row(this.targetIndex, this.specs.length, status,
                this.startedAtMs !== null ? Math.max(0, nowMs - this.startedAtMs) : 0,
                this.traceValid, this.metrics(status === 'completed', dropX, dropY, dragMs), this.attributes(this.targetIndex));
        }
    }


    /* Storefront purchase selection: find a product, choose its variant and quantity, fix and confirm the cart. */
    const APPAREL = ['S', 'M', 'L', 'XL'], SHOES = ['7', '8', '8.5', '9', '9.5', '10', '11'], ONE_SIZE = ['One size'];
    const SHIRT_COLORS = ['Gray', 'Navy', 'Blue', 'Green'], RUNNER_COLORS = ['Charcoal', 'Black', 'Blue'];
    const product = (name, price, colors, sizes) => Object.freeze({ name, price, colors, sizes });
    const SHOP_PRODUCTS = Object.freeze([
        product('Basecamp Fleece Jacket', '$64.00', ['Gray', 'Green', 'Navy'], APPAREL),
        product('Canyon Rain Shell', '$89.00', ['Red', 'Black', 'Blue'], APPAREL),
        product('Cedar Flannel Shirt', '$38.00', ['Red', 'Green', 'Blue'], APPAREL),
        product('Ridge Merino Base Layer', '$72.00', ['Black', 'Gray'], APPAREL),
        product('Summit Daypack 22L', '$54.00', ['Blue', 'Black', 'Orange'], ONE_SIZE),
        product('Trailhead Hiking Shirt, Long Sleeve', '$36.00', SHIRT_COLORS, APPAREL),
        product('Trailhead Hiking Shirt', '$32.00', SHIRT_COLORS, APPAREL),
        product('Trailhead Hiking Shirt, Sleeveless', '$28.00', SHIRT_COLORS, APPAREL),
        product('Trailhead Kids Hiking Shirt', '$24.00', SHIRT_COLORS, ['S', 'M', 'L']),
        product('Trailhead Hiking Shorts', '$34.00', ['Khaki', 'Gray', 'Navy'], APPAREL),
        product('Lakeside Sun Hat', '$22.00', ['Tan', 'Green'], ONE_SIZE),
        product('Switchback Trekking Poles', '$58.00', ['Black', 'Blue'], ONE_SIZE),
        product('Glacier Water Bottle 1L', '$18.00', ['Blue', 'Green', 'Gray'], ONE_SIZE),
        product('Ember Headlamp', '$29.00', ['Black', 'Orange'], ONE_SIZE),
        product('Pinecrest Camp Chair', '$45.00', ['Green', 'Gray'], ONE_SIZE),
        product('Alpine Down Vest', '$79.00', ['Black', 'Navy', 'Red'], APPAREL),
        product('Summit Trail Runner GTX', '$139.00', RUNNER_COLORS, SHOES),
        product('Summit Trail Runner', '$119.00', RUNNER_COLORS, SHOES),
        product("Summit Trail Runner, Women's", '$119.00', ['Charcoal', 'Black', 'Teal'], SHOES),
        product('Summit Approach Shoe', '$109.00', ['Black', 'Brown'], SHOES),
        product('Riverbed Water Sandal', '$49.00', ['Black', 'Gray'], SHOES),
        product('Trail Socks 3-Pack', '$19.00', ['Gray', 'Black'], ['M', 'L']),
        product('Meadow Picnic Blanket', '$35.00', ['Red', 'Blue'], ONE_SIZE),
        product('Granite Chalk Bag', '$21.00', ['Black', 'Orange'], ONE_SIZE)
    ]);
    const shopOrder = (productIndex, color, size, quantity, prompt, condition) => Object.freeze({
        product: productIndex, color, size, quantity, prompt, condition,
        text: quantity + ' × ' + SHOP_PRODUCTS[productIndex].name + ' (' + color + ', ' + size + ')'
    });
    const SHOP_ORDERS = Object.freeze([
        shopOrder(6, 'Blue', 'M', 2, 'Add two blue, medium Trailhead Hiking Shirts to your cart, then confirm the cart.',
            'shirt_mid_list_variant_qty2'),
        shopOrder(17, 'Black', '9', 1, 'Add one pair of black Summit Trail Runners, size 9, to your cart, then confirm the cart.',
            'runner_late_list_variant_qty1')
    ]);
    const SHOP_MAX_QUANTITY = 5, SHOP_MAX_LINES = 6;
    const sameVariant = (a, b) => a.product === b.product && a.color === b.color && a.size === b.size;
    const lineName = line => SHOP_PRODUCTS[line.product].name;
    const lineVariant = line => line.color + ', ' + line.size;
    const control = (kind, index = -1) => ({ kind, index });
    const sameControl = (a, b) => !!a && !!b && a.kind === b.kind && a.index === b.index;

    class StorefrontTrials {
        constructor(onAllCompleted = () => {}, orders = SHOP_ORDERS) {
            this.orders = orders;
            this.onAllCompleted = onAllCompleted;
            this.targetIndex = 0;
            this.feedback = 'Select Begin to open the store.';
            this.headerHeight = 0;
            this.rowHeight = 0;
            this.controlHeight = 0;
            this.listRect = rect(0, 0, 0, 0);
            this.viewWidth = 0;
            this.viewHeight = 0;
            this.density = 0;
            this.slopPx = 0;
            this.frozen = false;
            this.results = [];
            this.reset();
        }
        reset() {
            this.screen = 'results';
            this.offset = 0;
            this.openProduct = null;
            this.selectedColor = null;
            this.selectedSize = null;
            this.selectedQuantity = 1;
            this.openDropdown = null;
            this.press = null;
            this.cart = [];
            this.startedAtMs = null;
            this.lastMs = 0;
            this.clicks = 0; this.noAction = 0; this.cancelledPresses = 0;
            this.productOpens = 0; this.wrongProductOpens = 0; this.wrongVariantSelects = 0; this.wrongQuantitySelects = 0;
            this.dropdownOpens = 0; this.dropdownDismissals = 0;
            this.addAttempts = 0; this.blockedAdds = 0;
            this.wrongProductAdds = 0; this.wrongVariantAdds = 0; this.wrongQuantityAdds = 0;
            this.confirmAttempts = 0; this.wrongConfirms = 0;
            this.corrections = 0; this.removals = 0; this.backtracks = 0;
            this.firstOpenMs = null; this.itemAddedMs = null; this.wrongSinceMs = null; this.correctionMs = 0;
            this.variantSelected = false; this.quantitySelected = false; this.itemAdded = false;
            this.orderingValid = true; this.resized = false; this.directTouch = false;
            this.cursorObserved = false; this.cursorGap = false; this.cursorX = NaN; this.cursorY = NaN; this.cursorTravel = 0;
            this.approach = 0; this.lastScrollMs = null; this.scrollDistance = 0; this.scrollDirection = 0;
            this.oppositeTravel = 0; this.reversals = 0; this.overshoots = 0; this.beyond = false;
            this.corrective = 0; this.scrollClicks = 0;
        }
        get order() { return this.orders[this.targetIndex]; }
        get targetCount() { return this.orders.length; }
        get started() { return this.startedAtMs !== null; }
        get resolved() { return this.results.length > this.targetIndex; }
        get active() { return this.started && !this.resolved && !this.frozen; }
        get allCompleted() { return this.results.length === this.orders.length && this.results.every(r => r.status === 'completed'); }
        get cartCount() { return this.cart.reduce((sum, line) => sum + line.quantity, 0); }
        get maxOffset() { return Math.max(0, SHOP_PRODUCTS.length * this.rowHeight - this.listRect.height); }

        geometry(width, height, density, slop) {
            if (this.frozen || !(width > 0) || !(height > 0) || !(density > 0)) return;
            const rows = this.rowHeight > 0 ? this.offset / this.rowHeight : NaN;
            if (this.press) this.cancel(this.lastMs);
            this.viewWidth = width; this.viewHeight = height; this.density = density;
            this.slopPx = slop > 0 ? slop : 8 * density;
            this.headerHeight = Math.min(48 * density, height * 0.14);
            this.rowHeight = Math.min(64 * density, (height - this.headerHeight) / 4);
            this.controlHeight = Math.min(40 * density, (height - this.headerHeight - 16 * density) / 7);
            this.listRect = rect(0, this.headerHeight, width, height);
            if (this.active) {
                this.resized = true;
                this.offset = finite(rows) ? Math.min(Math.max(rows * this.rowHeight, 0), this.maxOffset) : 0;
            }
        }
        begin(nowMs) {
            if (this.frozen || this.started || this.resolved || this.rowHeight <= 0) return;
            this.startedAtMs = nowMs;
            this.lastMs = nowMs;
            this.offset = 0;
            const [lo, hi] = this.visibleBand();
            this.approach = this.offset < lo ? 1 : this.offset > hi ? -1 : 0;
            this.feedback = 'Find ' + SHOP_PRODUCTS[this.order.product].name + '.';
        }

        get pad() { return 8 * this.density; }
        cartButtonRect() { const p = this.pad; return rect(this.viewWidth - p - 120 * this.density, p * 0.75, this.viewWidth - p, this.headerHeight - p * 0.75); }
        backButtonRect() { const p = this.pad; return rect(p, p * 0.75, p + 150 * this.density, this.headerHeight - p * 0.75); }
        productRowRect(index) {
            const top = this.listRect.top + index * this.rowHeight - this.offset;
            return rect(this.listRect.left, top, this.listRect.right, top + this.rowHeight);
        }
        detailsLeft() { return this.viewWidth * 0.38; }
        detailsSlot(slot) {
            const step = this.controlHeight + this.pad * 0.75, top = this.headerHeight + this.pad + slot * step;
            const left = this.detailsLeft(), width = Math.min(this.viewWidth - left - this.pad, 300 * this.density);
            return rect(left, top, left + width, top + this.controlHeight);
        }
        detailsImageRect() {
            const p = this.pad, size = Math.min(this.detailsLeft() - p * 3, this.viewHeight - this.headerHeight - p * 2);
            return rect(p * 2, this.headerHeight + p, p * 2 + size, this.headerHeight + p + size);
        }
        detailsTitleRect() { return this.detailsSlot(0); }
        detailsPriceRect() { return this.detailsSlot(1); }
        colorRect() { return this.detailsSlot(2); }
        sizeRect() { return this.detailsSlot(3); }
        quantityRect() { return this.detailsSlot(4); }
        addRect() { return this.detailsSlot(5); }
        confirmRect() {
            const p = this.pad;
            return rect(this.viewWidth - p - 160 * this.density, this.viewHeight - p - this.controlHeight, this.viewWidth - p, this.viewHeight - p);
        }
        cartLineRect(line) {
            const top = this.headerHeight + this.pad;
            const available = this.viewHeight - top - this.controlHeight - this.pad * 3;
            const height = Math.min(this.rowHeight, available / SHOP_MAX_LINES);
            return rect(this.pad, top + line * height, this.viewWidth - this.pad, top + (line + 1) * height);
        }
        lineQuantityRect(line) {
            const row = this.cartLineRect(line), height = Math.min(this.controlHeight, row.height - this.pad * 0.5);
            return rect(row.right - 220 * this.density, row.centerY - height / 2, row.right - 120 * this.density, row.centerY + height / 2);
        }
        deleteRect(line) {
            const quantity = this.lineQuantityRect(line);
            return rect(quantity.right + 12 * this.density, quantity.top, this.cartLineRect(line).right, quantity.bottom);
        }
        options(dropdown = this.openDropdown) {
            const item = this.openProduct === null ? null : SHOP_PRODUCTS[this.openProduct];
            switch (dropdown && dropdown.kind) {
            case 'color': return item ? item.colors : [];
            case 'size': return item ? item.sizes : [];
            case 'quantity': case 'lineQuantity':
                return Array.from({ length: SHOP_MAX_QUANTITY }, (_, i) => String(i + 1));
            default: return [];
            }
        }
        dropdownRect(dropdown) {
            switch (dropdown.kind) {
            case 'color': return this.colorRect();
            case 'size': return this.sizeRect();
            case 'quantity': return this.quantityRect();
            case 'lineQuantity': return this.lineQuantityRect(dropdown.index);
            default: return null;
            }
        }
        optionRect(option) {
            const dropdown = this.openDropdown;
            const field = dropdown && this.dropdownRect(dropdown);
            if (!field) return null;
            const count = this.options(dropdown).length;
            if (!(option >= 0 && option < count)) return null;
            const height = Math.min(this.controlHeight, (this.viewHeight - this.headerHeight) / count);
            const top = Math.max(Math.min(field.bottom, this.viewHeight - count * height), this.headerHeight);
            return rect(field.left, top + option * height, field.right, top + (option + 1) * height);
        }
        controlAt(x, y) {
            if (!this.started || !finite(x) || !finite(y)) return null;
            if (this.openDropdown) {
                const option = this.options().findIndex((_, i) => this.optionRect(i).contains(x, y));
                return option >= 0 ? control('option', option) : null;
            }
            if (this.screen !== 'cart' && this.cartButtonRect().contains(x, y)) return control('cart');
            if (this.screen !== 'results' && this.backButtonRect().contains(x, y)) return control('back');
            if (this.screen === 'results') {
                const index = this.productAt(x, y);
                return index === null ? null : control('product', index);
            }
            if (this.screen === 'details') {
                const hit = [['color', this.colorRect()], ['size', this.sizeRect()], ['quantity', this.quantityRect()], ['add', this.addRect()]]
                    .find(([, r]) => r.contains(x, y));
                return hit ? control(hit[0]) : null;
            }
            if (this.cart.length && this.confirmRect().contains(x, y)) return control('confirm');
            for (let line = 0; line < this.cart.length; line++) {
                if (this.lineQuantityRect(line).contains(x, y)) return control('lineQuantity', line);
                if (this.deleteRect(line).contains(x, y)) return control('delete', line);
            }
            return null;
        }
        productAt(x, y) {
            if (this.screen !== 'results' || !this.listRect.contains(x, y) || this.rowHeight <= 0) return null;
            const index = Math.floor((y - this.listRect.top + this.offset) / this.rowHeight);
            return index >= 0 && index < SHOP_PRODUCTS.length ? index : null;
        }

        hover(x, y, nowMs) {
            if (this.active && this.accept(nowMs)) this.trackCursor(x, y);
        }
        hoverExit() {
            if (this.active && this.cursorObserved) this.cursorGap = true;
            this.cursorX = NaN; this.cursorY = NaN;
        }
        scroll(deltaPx, nowMs) {
            if (!this.active || this.screen !== 'results') return;
            if (!finite(deltaPx) || deltaPx === 0 || !this.accept(nowMs)) return;
            this.lastScrollMs = nowMs;
            const applied = Math.min(Math.max(this.offset + deltaPx, 0), this.maxOffset) - this.offset;
            if (applied === 0) return;
            this.offset += applied;
            this.scrollDistance += Math.abs(applied);
            const direction = Math.sign(applied);
            if (this.scrollDirection === 0 || direction === this.scrollDirection) {
                this.scrollDirection = direction;
                this.oppositeTravel = 0;
            } else {
                this.oppositeTravel += Math.abs(applied);
                if (this.oppositeTravel >= this.rowHeight * REVERSAL_ROWS) {
                    this.reversals++;
                    this.scrollDirection = direction;
                    this.oppositeTravel = 0;
                }
            }
            if (this.approach !== 0) {
                const [lo, hi] = this.visibleBand();
                const past = this.approach > 0 ? this.offset - hi : lo - this.offset;
                if (past > OVERSHOOT_EPSILON_PX) {
                    if (!this.beyond) this.overshoots++;
                    this.beyond = true;
                } else this.beyond = false;
                if (this.overshoots > 0 && direction === -this.approach) this.corrective += Math.abs(applied);
            }
        }
        pressAt(x, y, nowMs, independent) {
            if (!this.active || this.press) return;
            if (!this.accept(nowMs) || !finite(x) || !finite(y)) return;
            this.clicks++;
            if (this.lastScrollMs !== null && nowMs - this.lastScrollMs <= SCROLL_ACTIVE_MS) this.scrollClicks++;
            if (independent) this.trackCursor(x, y); else this.directTouch = true;
            this.press = { control: this.controlAt(x, y), downX: x, downY: y, moved: false };
        }
        move(x, y, nowMs) {
            if (!this.press || !this.active) return;
            if (!this.accept(nowMs) || !finite(x) || !finite(y)) { this.cancel(nowMs); return; }
            if (!this.directTouch) this.trackCursor(x, y);
            if (!this.press.moved && Math.hypot(x - this.press.downX, y - this.press.downY) > this.slopPx) this.press.moved = true;
        }
        release(x, y, nowMs) {
            const current = this.press;
            if (!current || !this.active) return;
            if (!this.accept(nowMs) || !finite(x) || !finite(y)) { this.cancel(nowMs); return; }
            this.press = null;
            if (!this.directTouch) this.trackCursor(x, y);
            const under = this.controlAt(x, y);
            if (current.moved || !current.control || !sameControl(under, current.control)) {
                if (this.openDropdown && !current.moved && under === null) {
                    this.dropdownDismissals++;
                    this.openDropdown = null;
                } else this.noAction++;
                return;
            }
            this.activate(current.control, nowMs);
        }
        cancel(nowMs) {
            if (!this.press) return;
            this.press = null;
            if (this.active) this.cancelledPresses++;
            if (nowMs < this.lastMs) this.orderingValid = false;
        }
        focusLost(nowMs) {
            this.cancel(nowMs);
            this.openDropdown = null;
        }
        activate(target, nowMs) {
            const dropdown = this.openDropdown;
            switch (target.kind) {
            case 'product': this.openProductPage(target.index, nowMs); break;
            case 'cart':
                this.screen = 'cart';
                this.feedback = this.cart.length ? 'Review the cart, then confirm it.' : 'Your cart is empty.';
                break;
            case 'back':
                this.backtracks++;
                this.screen = 'results';
                this.openProduct = null;
                this.feedback = 'Find ' + SHOP_PRODUCTS[this.order.product].name + '.';
                break;
            case 'color': case 'size': case 'quantity': case 'lineQuantity':
                this.dropdownOpens++;
                this.openDropdown = target;
                break;
            case 'option': if (dropdown) this.choose(dropdown, target.index, nowMs); break;
            case 'add': this.addToCart(nowMs); break;
            case 'delete': {
                const [line] = this.cart.splice(target.index, 1);
                this.removals++;
                this.corrections++;
                this.feedback = 'Removed ' + lineName(line) + ' (' + lineVariant(line) + ').';
                this.cartChanged(nowMs);
                break;
            }
            case 'confirm': this.confirm(nowMs); break;
            }
        }
        openProductPage(index, nowMs) {
            this.productOpens++;
            if (index !== this.order.product) this.wrongProductOpens++;
            else if (this.firstOpenMs === null) this.firstOpenMs = nowMs;
            this.openProduct = index;
            const item = SHOP_PRODUCTS[index];
            this.selectedColor = item.colors[0];
            this.selectedSize = item.sizes.length === 1 ? item.sizes[0] : null;
            this.selectedQuantity = 1;
            this.screen = 'details';
            this.feedback = this.selectedSize === null ? 'Choose a color, size and quantity.' : 'Choose a color and quantity.';
        }
        choose(dropdown, option, nowMs) {
            const value = this.options(dropdown)[option], order = this.order;
            this.openDropdown = null;
            const requested = this.openProduct === order.product;
            if (dropdown.kind === 'lineQuantity') {
                const line = this.cart[dropdown.index], quantity = Number(value);
                if (!line || quantity === line.quantity) return;
                this.cart[dropdown.index] = Object.assign({}, line, { quantity });
                this.corrections++;
                this.feedback = 'Changed ' + lineName(line) + ' (' + lineVariant(line) + ') to ' + quantity + '.';
                this.cartChanged(nowMs);
                return;
            }
            if (dropdown.kind === 'color') {
                this.selectedColor = value;
                if (requested && value !== order.color) this.wrongVariantSelects++;
            } else if (dropdown.kind === 'size') {
                this.selectedSize = value;
                if (requested && value !== order.size) this.wrongVariantSelects++;
            } else {
                this.selectedQuantity = Number(value);
                if (requested && this.selectedQuantity !== order.quantity) this.wrongQuantitySelects++;
            }
            if (requested && this.selectedColor === order.color && this.selectedSize === order.size) {
                this.variantSelected = true;
                if (this.selectedQuantity === order.quantity) this.quantitySelected = true;
            }
        }
        addToCart(nowMs) {
            this.addAttempts++;
            if (this.openProduct === null) return;
            if (this.selectedSize === null) {
                this.blockedAdds++;
                this.feedback = 'Choose a size before adding to the cart.';
                return;
            }
            const order = this.order;
            const added = { product: this.openProduct, color: this.selectedColor, size: this.selectedSize, quantity: this.selectedQuantity };
            const existing = this.cart.findIndex(line => sameVariant(line, added));
            if (existing < 0 && this.cart.length >= SHOP_MAX_LINES) {
                this.blockedAdds++;
                this.feedback = 'The cart is full. Remove an item first.';
                return;
            }
            let line = added;
            if (existing < 0) this.cart.push(added);
            else {
                line = Object.assign({}, this.cart[existing], { quantity: Math.min(SHOP_MAX_QUANTITY, this.cart[existing].quantity + added.quantity) });
                this.cart[existing] = line;
            }
            if (added.product !== order.product) this.wrongProductAdds++;
            else if (added.color !== order.color || added.size !== order.size) this.wrongVariantAdds++;
            else {
                if (!this.itemAdded) this.itemAddedMs = nowMs;
                this.itemAdded = true;
                if (line.quantity === order.quantity) this.quantitySelected = true; else this.wrongQuantityAdds++;
            }
            this.feedback = 'Added ' + added.quantity + ' × ' + lineName(added) + ' (' + lineVariant(added) + '). Cart: ' + this.cartCount + '.';
            this.cartChanged(nowMs);
        }
        confirm(nowMs) {
            this.confirmAttempts++;
            const problem = this.cartProblem();
            if (problem !== null) {
                this.wrongConfirms++;
                this.feedback = problem;
                return;
            }
            this.cartChanged(nowMs);
            this.results.push(this.result('completed', nowMs));
            this.feedback = '✓ Order confirmed: ' + this.order.text;
            if (this.allCompleted) this.onAllCompleted(nowMs);
        }
        wanted() {
            const order = this.order;
            return { product: order.product, color: order.color, size: order.size, quantity: order.quantity };
        }
        cartProblem() {
            const wanted = this.wanted();
            const extra = this.cart.find(line => !sameVariant(line, wanted));
            if (extra) return lineName(extra) + ' (' + lineVariant(extra) + ") isn't in the order. Delete it.";
            const line = this.cart[0];
            if (!line) return "The cart doesn't have " + this.order.text + ' yet.';
            return line.quantity !== wanted.quantity
                ? 'Change the ' + lineName(line) + ' (' + lineVariant(line) + ') quantity to ' + wanted.quantity + '.'
                : null;
        }
        cartChanged(nowMs) {
            const wrong = this.cart.length > 0 && this.cartProblem() !== null;
            if (wrong && this.wrongSinceMs === null) this.wrongSinceMs = nowMs;
            if (!wrong && this.wrongSinceMs !== null) {
                this.correctionMs += Math.max(0, nowMs - this.wrongSinceMs);
                this.wrongSinceMs = null;
            }
            const wanted = this.wanted();
            if (this.cart.some(line => sameVariant(line, wanted) && line.quantity === wanted.quantity)) this.quantitySelected = true;
        }
        next() {
            if (!this.resolved || this.targetIndex === this.orders.length - 1 || this.frozen) return;
            this.targetIndex++;
            this.reset();
            this.feedback = 'Select Begin to open the store for the next order.';
        }
        snapshot() { return this.metrics(false, this.lastMs); }
        targetResults(nowMs) {
            if (!this.frozen) {
                if (this.press) this.cancel(nowMs);
                if (this.started && !this.resolved) this.results.push(this.result('abandoned', Math.max(this.lastMs, nowMs)));
                for (let index = this.results.length; index < this.orders.length; index++) {
                    this.results.push(row(index, this.orders.length, 'abandoned', 0, false,
                        { measurement_started: 0 }, this.attributes(index)));
                }
                this.frozen = true;
                this.openDropdown = null;
            }
            return this.results.slice();
        }
        trackCursor(x, y) {
            if (!finite(x) || !finite(y)) return;
            if (finite(this.cursorX)) this.cursorTravel += Math.hypot(x - this.cursorX, y - this.cursorY);
            this.cursorX = x; this.cursorY = y;
            this.cursorObserved = true;
        }
        visibleBand() {
            const top = this.order.product * this.rowHeight, max = this.maxOffset;
            const lo = Math.min(Math.max(top + this.rowHeight - this.listRect.height, 0), max);
            const hi = Math.min(Math.max(top, 0), max);
            return [lo, Math.max(lo, hi)];
        }
        accept(nowMs) {
            if (!finite(nowMs) || nowMs < this.lastMs) { this.orderingValid = false; return false; }
            this.lastMs = nowMs;
            return true;
        }
        get traceValid() {
            return this.cursorObserved && !this.cursorGap && !this.directTouch && this.orderingValid && !this.resized;
        }
        metrics(completed, nowMs) {
            const start = this.startedAtMs, out = { measurement_started: start !== null ? 1 : 0 };
            if (start === null) return out;
            if (this.firstOpenMs !== null) out.stp_shop_find_ms = Math.max(0, this.firstOpenMs - start);
            if (this.firstOpenMs !== null && this.itemAddedMs !== null) out.stp_shop_configure_ms = Math.max(0, this.itemAddedMs - this.firstOpenMs);
            Object.assign(out, {
                stp_shop_correction_ms: this.correctionMs + (this.wrongSinceMs !== null ? Math.max(0, nowMs - this.wrongSinceMs) : 0),
                stp_shop_product_open_count: this.productOpens,
                stp_shop_wrong_product_open_count: this.wrongProductOpens,
                stp_shop_wrong_variant_select_count: this.wrongVariantSelects,
                stp_shop_wrong_quantity_select_count: this.wrongQuantitySelects,
                stp_shop_dropdown_open_count: this.dropdownOpens,
                stp_shop_dropdown_dismiss_count: this.dropdownDismissals,
                stp_shop_add_attempt_count: this.addAttempts,
                stp_shop_add_blocked_count: this.blockedAdds,
                stp_shop_wrong_product_add_count: this.wrongProductAdds,
                stp_shop_wrong_variant_add_count: this.wrongVariantAdds,
                stp_shop_wrong_quantity_add_count: this.wrongQuantityAdds,
                stp_shop_incorrect_add_count: this.wrongProductAdds + this.wrongVariantAdds + this.wrongQuantityAdds,
                stp_shop_confirm_attempt_count: this.confirmAttempts,
                stp_shop_wrong_confirm_count: this.wrongConfirms,
                stp_shop_correction_count: this.corrections,
                stp_shop_removal_count: this.removals,
                stp_shop_backtrack_count: this.backtracks,
                stp_shop_scroll_distance_px: round1(this.scrollDistance),
                stp_shop_scroll_reversal_count: this.reversals
            });
            if (this.approach !== 0) {
                out.stp_shop_scroll_overshoot_count = this.overshoots;
                out.stp_shop_corrective_scroll_px = round1(this.corrective);
            }
            Object.assign(out, {
                stp_shop_scroll_click_count: this.scrollClicks,
                stp_shop_no_action_click_count: this.noAction,
                stp_shop_cancelled_press_count: this.cancelledPresses,
                stp_shop_step_product_opened: this.firstOpenMs !== null ? 1 : 0,
                stp_shop_step_variant_selected: this.variantSelected ? 1 : 0,
                stp_shop_step_quantity_selected: this.quantitySelected ? 1 : 0,
                stp_shop_step_item_added: this.itemAdded ? 1 : 0,
                stp_shop_step_cart_verified: completed ? 1 : 0,
                clicks_total: this.clicks
            });
            if (this.traceValid) out.total_cursor_distance_px = round1(this.cursorTravel);
            return out;
        }
        attributes(index) {
            const order = this.orders[index];
            return { stp_target_kind: 'storefront_order', stp_condition: order.condition, stp_measurement: 'app_output',
                stp_attempt_source: 'delivered_click', stp_order_text: order.text };
        }
        result(status, nowMs) {
            return row(this.targetIndex, this.orders.length, status,
                this.startedAtMs !== null ? Math.max(0, nowMs - this.startedAtMs) : 0,
                this.traceValid, this.metrics(status === 'completed', nowMs), this.attributes(this.targetIndex));
        }
    }

    return { MENU_LABELS, MENU_PATH, MenuTrials, CircleTrials, FILE_DRAG_FILES, FILE_DRAG_FOLDERS, FILE_DRAG_SPECS, FileDragTrials,
        SHOP_PRODUCTS, SHOP_ORDERS, StorefrontTrials };
});
