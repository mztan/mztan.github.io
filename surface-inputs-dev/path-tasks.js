/* File drag-and-drop trial state, extracted unchanged from jvision/path-tasks.js. Pure logic: no DOM, timers or uploads.
 * Times are caller-supplied monotonic milliseconds (performance.now() in the browser). */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SurfaceInputsPathTasks = api;
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const finite = value => typeof value === "number" && Number.isFinite(value);

    function row(index, count, status, elapsedMs, traceValid, metrics, attributes) {
        return Object.freeze({ index, count, status, elapsed_ms: elapsedMs, trace_valid: traceValid,
            metrics: Object.freeze(Object.assign({}, metrics)), attributes: Object.freeze(Object.assign({}, attributes)) });
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


    return { FileDragTrials, FILE_DRAG_FILES, FILE_DRAG_FOLDERS, FILE_DRAG_SPECS };
});
