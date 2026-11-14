/* Photo gallery → crop task state, crop evaluation and telemetry. Pure logic: no DOM, timers or uploads.
 * Times are caller-supplied monotonic milliseconds (performance.now() in the browser). Screen values are CSS px;
 * crops, subject bounds and pan amounts are original-image pixels. Schema and thresholds: jvision/PHOTO_CROP.md. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SurfaceInputsPhotoCrop = api;
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const TASK_ID = 'stp_photo_crop', TASK_VERSION = '1.0', SCHEMA_VERSION = 1, EVALUATOR_VERSION = 1;
    const INTERACTION = 'PhotoCrop', METRIC_FAMILY = 'drag';
    const DETAILS_MAX_BYTES = 512, EVENT_LIMIT = 300, SUBMISSION_LIMIT = 30, EXPORT_MAX_BYTES = 96 * 1024;
    const SCROLL_ACTIVE_MS = 250, REVERSAL_ROWS = 0.25, OVERSHOOT_EPSILON_PX = 0.5, WHEEL_GAP_MS = 250;
    const PAN_REVERSAL_PX = 24, ZOOM_REVERSAL_RATIO = 0.05, MIN_ZOOM = 1, MAX_ZOOM = 8, ZOOM_STEP = 1.5;
    const MIN_CROP_PX = 64, HANDLE_HIT_PX = 12, GALLERY_COLUMNS = 4, GALLERY_VISIBLE_ROWS = 2.6;
    const HANDLES = Object.freeze(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
    const BUTTONS = Object.freeze(['back', 'zoomOut', 'zoomIn', 'reset', 'apply']);
    /* Prototype task tolerances chosen for this scenario; they are not validated STP quality gates. */
    const THRESHOLDS = Object.freeze({ min_iou: 0.8, min_subject_coverage: 0.99, max_excess_ratio: 0.2, max_mean_edge_error_norm: 0.03 });

    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const round1 = value => Math.round(value * 10) / 10;
    const round3 = value => Math.round(value * 1000) / 1000;
    const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);
    const bytes = value => (typeof TextEncoder === 'undefined' ? encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, '_').length
        : new TextEncoder().encode(value).length);
    function deepFreeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.freeze(value);
            Object.values(value).forEach(deepFreeze);
        }
        return value;
    }
    function rect(left, top, right, bottom) {
        return Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top,
            centerX: (left + right) / 2, centerY: (top + bottom) / 2,
            contains(x, y) { return x >= left && x < right && y >= top && y < bottom; } });
    }
    const box = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

    /* Original drawn scenes (no photographs, people or personal data). Coordinates are image pixels. */
    const sceneItem = (type, color, left, top, right, bottom) => ({ type, color, left, top, right, bottom });
    const BENCH = (left, seatY, right) => ({ left, seatY, right });
    const P = (id, label, width, height, scene) => deepFreeze({ id, label, width, height, scene });
    const DAY = ['#8fc3ea', '#d8ecf7'], DUSK = ['#f2a65a', '#f7d9a8'], GREY = ['#a7b4c0', '#dfe5ea'];
    const PHOTOS = deepFreeze([
        P('ph01', 'IMG_2031', 1600, 1200, { sky: DAY, ground: '#5f8f4e', horizon: 0.62, mountains: true, water: true, trees: 3, seed: 1 }),
        P('ph02', 'IMG_2034', 1200, 1500, { sky: DAY, ground: '#4c7a3d', horizon: 0.45, trees: 7, path: true, seed: 2 }),
        P('ph03', 'IMG_2036', 1500, 1000, { sky: DAY, ground: '#6d9a55', horizon: 0.55, trees: 2, bench: BENCH(430, 690, 1130), seed: 3 }),
        P('ph04', 'IMG_2040', 1600, 1200, { sky: DAY, ground: '#e3cf9c', horizon: 0.58, water: true, sun: true, seed: 4 }),
        P('ph05', 'IMG_2041', 1500, 1000, { sky: DAY, ground: '#6d9a55', horizon: 0.55, trees: 2, bench: BENCH(430, 690, 1130),
            item: sceneItem('backpack', '#2f6fd0', 770, 430, 970, 690), seed: 5 }),
        P('ph06', 'IMG_2047', 1600, 1200, { sky: DUSK, ground: '#5c6b45', horizon: 0.6, mountains: true, sun: true, seed: 6 }),
        P('ph07', 'IMG_2050', 1500, 1000, { sky: DAY, ground: '#6d9a55', horizon: 0.55, trees: 1, bench: BENCH(430, 690, 1130),
            item: sceneItem('tote', '#c8322d', 760, 470, 930, 690), seed: 7 }),
        P('ph08', 'IMG_2052', 1600, 1200, { sky: DAY, ground: '#7aa35c', horizon: 0.5, trees: 1, seed: 8 }),
        P('ph09', 'IMG_2058', 1500, 1000, { sky: DAY, ground: '#7c8a6a', horizon: 0.5, rock: true,
            item: sceneItem('backpack', '#c8322d', 640, 380, 840, 640), seed: 9 }),
        P('ph10', 'IMG_2061', 1600, 1200, { sky: GREY, ground: '#55794a', horizon: 0.6, water: true, trees: 4, seed: 10 }),
        P('ph11', 'IMG_2063', 1500, 1000, { sky: DAY, ground: '#6d9a55', horizon: 0.55, trees: 2, bench: BENCH(430, 690, 1130),
            item: sceneItem('jacket', '#c8322d', 700, 540, 1010, 690), seed: 11 }),
        P('ph12', 'IMG_2070', 1200, 1500, { sky: GREY, ground: '#3f6a35', horizon: 0.4, trees: 9, seed: 12 }),
        P('ph13', 'IMG_2072', 1500, 1000, { sky: DAY, ground: '#6d9a55', horizon: 0.55, trees: 3, bench: BENCH(430, 690, 1130),
            item: sceneItem('backpack', '#3d8a4a', 780, 430, 980, 690), seed: 13 }),
        P('ph14', 'IMG_2077', 1600, 1200, { sky: DAY, ground: '#f1f4f6', horizon: 0.6, mountains: true, snow: true, seed: 14 }),
        P('ph15', 'IMG_2080', 1200, 1500, { sky: DAY, ground: '#567f45', horizon: 0.45, trees: 5, path: true, seed: 15 }),
        P('ph16', 'IMG_2084', 1500, 1000, { sky: DAY, ground: '#7aa35c', horizon: 0.5, trees: 2,
            item: sceneItem('backpack', '#c8322d', 680, 560, 880, 820), seed: 16 }),
        P('ph17', 'IMG_2089', 1500, 1000, { sky: DAY, ground: '#6d9a55', horizon: 0.55, trees: 2, bench: BENCH(430, 690, 1130),
            item: sceneItem('backpack', '#e5762c', 760, 430, 960, 690), seed: 17 }),
        P('ph18', 'IMG_2093', 1500, 1000, { sky: DAY, ground: '#6d9a55', horizon: 0.55, trees: 2, bench: BENCH(430, 690, 1130),
            item: sceneItem('backpack', '#c8322d', 760, 430, 960, 690), seed: 18 }),
        P('ph19', 'IMG_2095', 1500, 1000, { sky: DAY, ground: '#6d9a55', horizon: 0.55, trees: 2, bench: BENCH(430, 690, 1130),
            item: sceneItem('backpack', '#c8322d', 1180, 640, 1360, 880), seed: 19 }),
        P('ph20', 'IMG_2101', 1600, 1200, { sky: DUSK, ground: '#4e6b47', horizon: 0.62, water: true, sun: true, seed: 20 }),
        P('ph21', 'IMG_2104', 1500, 1000, { sky: DUSK, ground: '#5f7d4c', horizon: 0.55, trees: 1, bench: BENCH(430, 690, 1130), seed: 21 }),
        P('ph22', 'IMG_2110', 1600, 1200, { sky: DAY, ground: '#86ad64', horizon: 0.48, trees: 2, seed: 22 }),
        P('ph23', 'IMG_2113', 1500, 1000, { sky: GREY, ground: '#7c8a6a', horizon: 0.5, rock: true,
            item: sceneItem('tote', '#c8322d', 650, 420, 820, 640), seed: 23 }),
        P('ph24', 'IMG_2119', 1200, 1500, { sky: DAY, ground: '#3f6a35', horizon: 0.42, trees: 8, seed: 24 }),
        P('ph25', 'IMG_2122', 1500, 1000, { sky: DAY, ground: '#6d9a55', horizon: 0.55, trees: 3, bench: BENCH(430, 690, 1130),
            item: sceneItem('backpack', '#8a2be2', 760, 430, 960, 690), seed: 25 }),
        P('ph26', 'IMG_2126', 1600, 1200, { sky: DAY, ground: '#e3cf9c', horizon: 0.55, water: true, seed: 26 }),
        P('ph27', 'IMG_2130', 1200, 1500, { sky: DUSK, ground: '#4c7a3d', horizon: 0.45, trees: 6, path: true, seed: 27 }),
        P('ph28', 'IMG_2133', 1500, 1000, { sky: GREY, ground: '#6d9a55', horizon: 0.55, trees: 2, bench: BENCH(430, 690, 1130),
            item: sceneItem('tote', '#2f6fd0', 760, 470, 930, 690), seed: 28 }),
        P('ph29', 'IMG_2137', 1600, 1200, { sky: DAY, ground: '#5c6b45', horizon: 0.6, mountains: true, trees: 2, seed: 29 }),
        P('ph30', 'IMG_2140', 1500, 1000, { sky: DAY, ground: '#7c8a6a', horizon: 0.5, rock: true,
            item: sceneItem('backpack', '#e5762c', 640, 380, 840, 640), seed: 30 }),
        P('ph31', 'IMG_2144', 1600, 1200, { sky: GREY, ground: '#f1f4f6', horizon: 0.6, mountains: true, snow: true, trees: 3, seed: 31 }),
        P('ph32', 'IMG_2149', 1500, 1000, { sky: DUSK, ground: '#6d9a55', horizon: 0.55, trees: 2, bench: BENCH(430, 690, 1130), seed: 32 })
    ]);
    const SCENARIOS = deepFreeze([{
        id: 'red_backpack_bench_v1', seed: 2093, photo: 17, target_id: 'ph18_backpack_crop_v1',
        condition: 'red_backpack_bench_v1', subject_label: 'red backpack on the bench',
        prompt: 'Find the red backpack on the bench. Open the photo and crop around the backpack, keeping the entire backpack visible.',
        // Original-image coordinates. Subject = the drawn backpack's bounds; target = authored composition around it.
        subject: { left: 760, top: 430, right: 960, bottom: 690 },
        target: { left: 690, top: 370, right: 1040, bottom: 740 }
    }]);

    /* ---------- Crop geometry and evaluation ---------- */
    const area = r => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
    const intersection = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
        right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
    function validBox(r, width, height) {
        return !!r && [r.left, r.top, r.right, r.bottom].every(finite) && r.left >= 0 && r.top >= 0 &&
            r.right <= width && r.bottom <= height && r.right > r.left && r.bottom > r.top;
    }
    const EDGE_NAMES = { left: 'left', right: 'right', top: 'top', bottom: 'bottom' };
    /* crop/target/subject are image-pixel boxes; subject may be null (no annotation). */
    function evaluateCrop(crop, target, subject, width, height, thresholds = THRESHOLDS) {
        const out = { evaluator_version: EVALUATOR_VERSION, thresholds, valid: false, iou: null, subject_coverage: null,
            excess_ratio: null, edge_error_px: null, edge_error_norm: null, mean_edge_error_norm: null,
            success: false, failures: [], missing: {} };
        if (!(width > 0) || !(height > 0)) { out.missing.all = 'invalid_image_size'; out.failures.push('invalid_geometry'); return out; }
        if (!validBox(target, width, height)) { out.missing.all = 'invalid_target'; out.failures.push('invalid_geometry'); return out; }
        if (!validBox(crop, width, height)) { out.missing.all = 'invalid_crop'; out.failures.push('invalid_geometry'); return out; }
        out.valid = true;
        const overlap = area(intersection(crop, target)), cropArea = area(crop), union = cropArea + area(target) - overlap;
        out.iou = round3(overlap / union);
        out.excess_ratio = round3((cropArea - overlap) / cropArea);
        if (subject && validBox(subject, width, height)) out.subject_coverage = round3(area(intersection(crop, subject)) / area(subject));
        else out.missing.subject_coverage = subject ? 'invalid_subject_annotation' : 'no_subject_annotation';
        // Signed: positive = crop edge lies outside the target (looser), negative = inside (tighter).
        const signed = { left: target.left - crop.left, right: crop.right - target.right,
            top: target.top - crop.top, bottom: crop.bottom - target.bottom };
        out.edge_error_px = { left: round1(signed.left), right: round1(signed.right), top: round1(signed.top), bottom: round1(signed.bottom) };
        out.edge_error_norm = { left: round3(Math.abs(signed.left) / width), right: round3(Math.abs(signed.right) / width),
            top: round3(Math.abs(signed.top) / height), bottom: round3(Math.abs(signed.bottom) / height) };
        out.mean_edge_error_norm = round3((Math.abs(signed.left) / width + Math.abs(signed.right) / width +
            Math.abs(signed.top) / height + Math.abs(signed.bottom) / height) / 4);
        if (out.iou < thresholds.min_iou) out.failures.push('iou');
        if (out.subject_coverage !== null && out.subject_coverage < thresholds.min_subject_coverage) out.failures.push('subject_cut');
        if (out.excess_ratio > thresholds.max_excess_ratio) out.failures.push('excess_area');
        if (out.mean_edge_error_norm > thresholds.max_mean_edge_error_norm) out.failures.push('edge_error');
        out.success = out.failures.length === 0;
        out.signed = signed;
        return out;
    }
    /* Actionable feedback naming the edge that most needs to move. */
    function feedbackFor(result, crop, subject, label) {
        if (result.success) return '✓ Crop matches the reference.';
        if (!result.valid) return 'That crop could not be measured. Select Reset and try again.';
        if (subject && result.failures.includes('subject_cut')) {
            const cut = [['left', crop.left > subject.left], ['right', crop.right < subject.right],
                ['top', crop.top > subject.top], ['bottom', crop.bottom < subject.bottom]].filter(([, c]) => c).map(([e]) => e);
            return 'Part of the ' + label + ' is cut off. Move the ' + cut.join(' and ') + ' edge' + (cut.length > 1 ? 's' : '') + ' out.';
        }
        const s = result.signed, norm = result.edge_error_norm;
        const worst = Object.keys(norm).sort((a, b) => norm[b] - norm[a])[0];
        return 'Close, but not yet. ' + (s[worst] > 0 ? 'Bring the ' + EDGE_NAMES[worst] + ' edge in' : 'Move the ' + EDGE_NAMES[worst] + ' edge out') +
            ' to match the reference.';
    }

    /* ---------- Telemetry contract ---------- */
    /* Fixed `qa_path` order (details JSON). Dashboard PATH_PROTOCOLS.stp_photo_crop.packed must match. */
    const PATH_FIELDS = Object.freeze([
        'stp_crop_gallery_ms', 'stp_crop_other_photo_ms', 'stp_crop_editor_ms', 'stp_crop_recovery_ms',
        'stp_crop_wrong_photo_open_count', 'stp_crop_backtrack_count', 'stp_crop_submit_count', 'stp_crop_failed_submit_count',
        'stp_crop_reset_count', 'stp_crop_move_count', 'stp_crop_edge_resize_count', 'stp_crop_corner_resize_count',
        'stp_crop_cancelled_adjust_count', 'stp_crop_pan_count', 'stp_crop_pan_reversal_count', 'stp_crop_zoom_count',
        'stp_crop_zoom_reversal_count', 'stp_crop_unhandled_click_count', 'stp_crop_scroll_distance_px',
        'stp_crop_scroll_reversal_count', 'stp_crop_scroll_overshoot_count', 'stp_crop_corrective_scroll_px',
        'stp_crop_scroll_click_count', 'stp_crop_hold_travel_px', 'stp_crop_final_iou', 'stp_crop_final_subject_coverage',
        'stp_crop_final_excess_ratio', 'stp_crop_final_mean_edge_error_norm', 'stp_crop_success'
    ]);
    /* Existing drag-family typed columns. Only target text and drag starts match their established semantics. */
    const DRAG_COLUMNS = Object.freeze(['stp_drag_target_text', 'stp_drag_attempt_count', 'stp_drag_first_attempt_selected_target',
        'stp_drag_selection_start_failure_count', 'stp_drag_nothing_selected_count', 'stp_drag_selection_unchanged_count',
        'stp_drag_wrong_selection_count', 'stp_drag_tap1_5_count', 'stp_drag_tap2_5_count', 'stp_drag_tap3_5_count']);

    function randomRunId() {
        const crypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
        if (crypto && crypto.getRandomValues) {
            const values = crypto.getRandomValues(new Uint8Array(8));
            return 'crop_' + Array.from(values, v => v.toString(16).padStart(2, '0')).join('');
        }
        return 'crop_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    /* ---------- Task state ---------- */
    class PhotoCropTrials {
        constructor(options = {}) {
            this.scenario = options.scenario || SCENARIOS[0];
            this.photos = options.photos || PHOTOS;
            this.thresholds = options.thresholds || THRESHOLDS;
            this.runId = options.runId || randomRunId();
            this.onEnd = options.onEnd || (() => {});
            this.viewWidth = 0; this.viewHeight = 0; this.slopPx = 8;
            this.phase = 'instructions';
            this.outcome = null;       // completed | skipped | exited
            this.startMs = null; this.endMs = null; this.lastMs = 0;
            this.feedback = 'Read the instructions, then select Start.';
            this.offset = 0; this.openIndex = null; this.crops = new Map(); this.view = null;
            this.press = null; this.wheelSeg = null; this.hoverAt = null;
            this.events = []; this.eventsDropped = 0; this.sequence = 0;
            this.submissions = []; this.submissionsDropped = 0;
            this.c = { galleryMs: 0, otherMs: 0, editorMs: 0, recoveryMs: 0, wrongOpens: 0, opens: 0, backtracks: 0,
                submits: 0, failed: 0, resets: 0, retries: 0, unhandled: 0, scrollClicks: 0, pressNoDrag: 0, buttonsNoAction: 0,
                dragStarts: 0, wheelIgnored: 0, cancelled: 0 };
            this.completed = Object.fromEntries(['move', 'pan', 'zoom'].concat(HANDLES.map(h => 'resize_' + h)).map(k => [k, 0]));
            this.cancelledBy = Object.assign({}, this.completed);
            this.sinceSubmit = { adjustments: 0, cancelled: 0 };
            this.viewSince = null; this.recoverySince = null; this.firstTargetOpenMs = null;
            this.orderingValid = true; this.resizedInEditor = false; this.touchHold = false; this.holdTravel = 0;
            this.scrollDistance = 0; this.scrollDirection = 0; this.oppositeTravel = 0; this.reversals = 0;
            this.overshoots = 0; this.overshootMax = 0; this.beyond = false; this.corrective = 0; this.lastScrollMs = null; this.approach = 0;
            this.panDir = { x: 0, y: 0 }; this.panOpposite = { x: 0, y: 0 }; this.panReversals = 0;
            this.zoomDir = 0; this.zoomOpposite = 1; this.zoomReversals = 0;
            this.frozenRow = null;
        }
        /* ---- basic state ---- */
        get targetPhoto() { return this.photos[this.scenario.photo]; }
        get started() { return this.startMs !== null; }
        get active() { return this.started && this.outcome === null; }
        get editing() { return this.active && this.phase === 'editor'; }
        get openPhoto() { return this.openIndex === null ? null : this.photos[this.openIndex]; }
        get isTargetOpen() { return this.openIndex === this.scenario.photo; }
        accept(nowMs) {
            if (!finite(nowMs) || nowMs < this.lastMs) { this.orderingValid = false; return false; }
            this.lastMs = nowMs;
            return true;
        }
        elapsed(nowMs) { return this.startMs === null ? 0 : Math.max(0, Math.round(nowMs - this.startMs)); }
        emit(type, nowMs, fields = {}) {
            const terminal = type === 'task_completed' || type === 'task_skipped' || type === 'task_exited';
            if (this.events.length >= EVENT_LIMIT - 1 && !terminal) { this.eventsDropped++; return; }
            this.events.push(deepFreeze(Object.assign({ event_sequence: ++this.sequence, elapsed_ms: this.elapsed(nowMs), type,
                phase: this.phase }, fields)));
        }

        /* ---- layout (CSS px) ---- */
        geometry(width, height, slop = 8) {
            if (!(width > 0) || !(height > 0)) return;
            const rows = this.rowHeight > 0 ? this.offset / this.rowHeight : 0;
            if (this.viewWidth > 0 && (width !== this.viewWidth || height !== this.viewHeight) && this.active) {
                this.interrupt(this.lastMs, 'resize');
                if (this.phase === 'editor') this.resizedInEditor = true;
            }
            this.viewWidth = width; this.viewHeight = height; this.slopPx = slop > 0 ? slop : 8;
            this.offset = clamp(rows * this.rowHeight, 0, this.maxOffset);
            if (this.view) this.clampView();
        }
        get toolbarHeight() { return Math.min(48, this.viewHeight * 0.12); }
        get pad() { return 8; }
        get listRect() { return rect(0, this.toolbarHeight, this.viewWidth, this.viewHeight); }
        get rowHeight() { return this.viewHeight > 0 ? (this.viewHeight - this.toolbarHeight) / GALLERY_VISIBLE_ROWS : 0; }
        get cellWidth() { return (this.viewWidth - this.pad) / GALLERY_COLUMNS; }
        get maxOffset() { return Math.max(0, Math.ceil(this.photos.length / GALLERY_COLUMNS) * this.rowHeight + this.pad - this.listRect.height); }
        cellRect(index) {
            const col = index % GALLERY_COLUMNS, row = Math.floor(index / GALLERY_COLUMNS);
            const left = this.pad + col * this.cellWidth, top = this.toolbarHeight + this.pad + row * this.rowHeight - this.offset;
            return rect(left, top, left + this.cellWidth - this.pad, top + this.rowHeight - this.pad);
        }
        thumbnailRect(index) {
            const cell = this.cellRect(index), photo = this.photos[index], caption = 20;
            const scale = Math.min(cell.width / photo.width, (cell.height - caption) / photo.height);
            const w = photo.width * scale, h = photo.height * scale, left = cell.centerX - w / 2, top = cell.top + (cell.height - caption - h) / 2;
            return rect(left, top, left + w, top + h);
        }
        photoAt(x, y) {
            if (this.phase !== 'gallery' || !this.listRect.contains(x, y)) return null;
            for (let index = 0; index < this.photos.length; index++) if (this.cellRect(index).contains(x, y)) return index;
            return null;
        }
        /* Visible band of offsets where the requested thumbnail's cell is fully inside the list. */
        visibleBand() {
            const row = Math.floor(this.scenario.photo / GALLERY_COLUMNS), list = this.listRect, max = this.maxOffset;
            const top = this.pad + row * this.rowHeight, bottom = top + this.rowHeight - this.pad;
            const lo = clamp(bottom - list.height, 0, max), hi = clamp(top, 0, max);
            return [lo, Math.max(lo, hi)];
        }
        get referenceRect() {
            const width = Math.min(220, this.viewWidth * 0.24), p = this.pad;
            return rect(this.viewWidth - width - p, this.toolbarHeight + p, this.viewWidth - p, this.viewHeight - p);
        }
        get viewportRect() { return rect(this.pad, this.toolbarHeight + this.pad, this.referenceRect.left - this.pad, this.viewHeight - this.pad); }
        buttonRect(name) {
            const h = this.toolbarHeight - 12, top = 6, p = this.pad;
            if (name === 'back') return rect(p, top, p + 120, top + h);
            const right = { apply: 0, reset: 1, zoomIn: 2, zoomOut: 3 }[name];
            const widths = [96, 84, 44, 44];
            let r = this.viewWidth - p;
            for (let i = 0; i < right; i++) r -= widths[i] + 8;
            return rect(r - widths[right], top, r, top + h);
        }
        buttonAt(x, y) {
            if (this.phase !== 'editor') return null;
            return BUTTONS.find(name => this.buttonRect(name).contains(x, y)) || null;
        }

        /* ---- view transform: image px ↔ CSS px ---- */
        get fitScale() { const p = this.openPhoto, vp = this.viewportRect; return p ? Math.min(vp.width / p.width, vp.height / p.height) : 0; }
        get scale() { return this.view ? this.fitScale * this.view.zoom : 0; }
        clampView() {
            const p = this.openPhoto, vp = this.viewportRect, s = this.scale;
            if (!p || !(s > 0)) return;
            const halfW = vp.width / (2 * s), halfH = vp.height / (2 * s);
            this.view.cx = p.width <= 2 * halfW ? p.width / 2 : clamp(this.view.cx, halfW, p.width - halfW);
            this.view.cy = p.height <= 2 * halfH ? p.height / 2 : clamp(this.view.cy, halfH, p.height - halfH);
        }
        toScreen(ix, iy) { const vp = this.viewportRect, s = this.scale; return { x: vp.centerX + (ix - this.view.cx) * s, y: vp.centerY + (iy - this.view.cy) * s }; }
        toImage(sx, sy) { const vp = this.viewportRect, s = this.scale; return { x: this.view.cx + (sx - vp.centerX) / s, y: this.view.cy + (sy - vp.centerY) / s }; }
        imageScreenRect() {
            const p = this.openPhoto, a = this.toScreen(0, 0), b = this.toScreen(p.width, p.height);
            return rect(a.x, a.y, b.x, b.y);
        }
        get crop() { return this.openIndex === null ? null : this.crops.get(this.openIndex); }
        cropScreenRect() {
            const c = this.crop, a = this.toScreen(c.left, c.top), b = this.toScreen(c.right, c.bottom);
            return rect(a.x, a.y, b.x, b.y);
        }
        /* Gesture owner for a press at (x, y): handle (corner before edge) > crop interior > image pan. */
        targetAt(x, y) {
            if (this.phase === 'gallery') { const photo = this.photoAt(x, y); return photo === null ? null : { kind: 'photo', index: photo }; }
            if (this.phase !== 'editor') return null;
            const button = this.buttonAt(x, y);
            if (button) return { kind: 'button', name: button };
            const vp = this.viewportRect, r = this.cropScreenRect(), t = HANDLE_HIT_PX;
            // Handle zones may extend up to HANDLE_HIT_PX past the viewport edge; pan and move need the viewport.
            if (!(x >= vp.left - t && x <= vp.right + t && y >= vp.top - t && y <= vp.bottom + t)) return null;
            const nearX = { w: Math.abs(x - r.left) <= t, e: Math.abs(x - r.right) <= t };
            const nearY = { n: Math.abs(y - r.top) <= t, s: Math.abs(y - r.bottom) <= t };
            const withinX = x >= r.left - t && x <= r.right + t, withinY = y >= r.top - t && y <= r.bottom + t;
            const v = nearY.n ? 'n' : nearY.s ? 's' : '', h = nearX.w ? 'w' : nearX.e ? 'e' : '';
            if (v && h) return { kind: 'resize', handle: v + h };
            if (v && withinX) return { kind: 'resize', handle: v };
            if (h && withinY) return { kind: 'resize', handle: h };
            if (!vp.contains(x, y)) return null;
            if (r.contains(x, y)) return { kind: 'move' };
            return { kind: 'pan' };
        }

        /* ---- phase transitions ---- */
        enterView(next, nowMs) {
            if (this.viewSince !== null) {
                const spent = Math.max(0, nowMs - this.viewSince);
                if (this.phase === 'gallery') this.c.galleryMs += spent;
                else if (this.phase === 'editor') { if (this.isTargetOpen) this.c.editorMs += spent; else this.c.otherMs += spent; }
            }
            this.viewSince = next === 'gallery' || next === 'editor' ? nowMs : null;
            if (next !== this.phase) { this.phase = next; this.emit('phase_entered', nowMs, this.openIndex !== null && next === 'editor' ? { image_id: this.openPhoto.id } : {}); }
        }
        start(nowMs) {
            if (this.started || this.outcome !== null || !(this.viewWidth > 0) || !finite(nowMs)) return false;
            this.startMs = nowMs; this.lastMs = nowMs; this.offset = 0;
            const [lo, hi] = this.visibleBand();
            this.approach = this.offset < lo ? 1 : this.offset > hi ? -1 : 0;
            this.emit('task_started', nowMs, { scenario_id: this.scenario.id });
            this.enterView('gallery', nowMs);
            this.feedback = 'Find the ' + this.scenario.subject_label + '.';
            return true;
        }
        openPhotoAt(index, nowMs, source) {
            this.c.opens++;
            const target = index === this.scenario.photo;
            if (!target) this.c.wrongOpens++;
            else if (this.firstTargetOpenMs === null) this.firstTargetOpenMs = nowMs;
            const photo = this.photos[index];
            this.openIndex = index;
            if (!this.crops.has(index)) this.crops.set(index, { left: 0, top: 0, right: photo.width, bottom: photo.height });
            this.view = { zoom: 1, cx: photo.width / 2, cy: photo.height / 2 };
            this.emit('photo_opened', nowMs, { image_id: photo.id, is_target: target, input_source: source });
            this.enterView('editor', nowMs);
            this.feedback = 'Drag the crop edges or corners to match the reference. Drag inside the crop to move it.';
        }
        back(nowMs, source) {
            const photo = this.openPhoto;
            this.c.backtracks++;
            this.closeWheel();
            this.emit('returned_to_gallery', nowMs, { image_id: photo.id, input_source: source });
            this.enterView('gallery', nowMs);
            this.openIndex = null; this.view = null;
            this.feedback = 'Find the ' + this.scenario.subject_label + '.';
        }
        reset(nowMs, source) {
            const photo = this.openPhoto;
            this.c.resets++;
            this.closeWheel();
            this.crops.set(this.openIndex, { left: 0, top: 0, right: photo.width, bottom: photo.height });
            this.view = { zoom: 1, cx: photo.width / 2, cy: photo.height / 2 };
            this.emit('crop_reset', nowMs, { image_id: photo.id, input_source: source });
            this.feedback = 'Crop reset to the whole photo.';
        }
        zoomBy(factor, nowMs, source, anchorX, anchorY) {
            if (!this.view) return;
            const before = this.view.zoom, next = clamp(before * factor, MIN_ZOOM, MAX_ZOOM);
            if (next === before) return 0;
            const vp = this.viewportRect;
            const ax = finite(anchorX) ? anchorX : vp.centerX, ay = finite(anchorY) ? anchorY : vp.centerY;
            const anchor = this.toImage(ax, ay);
            this.view.zoom = next;
            // Keep the image point under the anchor fixed on screen.
            const s = this.scale;
            this.view.cx = anchor.x - (ax - vp.centerX) / s;
            this.view.cy = anchor.y - (ay - vp.centerY) / s;
            this.clampView();
            this.trackZoom(Math.log(next / before));
            return next / before;
        }
        trackZoom(logChange) {
            const direction = Math.sign(logChange);
            if (direction === 0) return;
            if (this.zoomDir === 0 || direction === this.zoomDir) { this.zoomDir = direction; this.zoomOpposite = 0; return; }
            this.zoomOpposite += Math.abs(logChange);
            if (this.zoomOpposite >= Math.log(1 + ZOOM_REVERSAL_RATIO)) { this.zoomReversals++; this.zoomDir = direction; this.zoomOpposite = 0; }
        }
        panBy(dxImage, dyImage) {
            const before = { cx: this.view.cx, cy: this.view.cy };
            this.view.cx += dxImage; this.view.cy += dyImage;
            this.clampView();
            const s = this.scale, ax = (this.view.cx - before.cx) * s, ay = (this.view.cy - before.cy) * s;
            for (const [axis, applied] of [['x', ax], ['y', ay]]) {
                const direction = Math.sign(applied);
                if (direction === 0) continue;
                if (this.panDir[axis] === 0 || direction === this.panDir[axis]) { this.panDir[axis] = direction; this.panOpposite[axis] = 0; continue; }
                this.panOpposite[axis] += Math.abs(applied);
                if (this.panOpposite[axis] >= PAN_REVERSAL_PX) { this.panReversals++; this.panDir[axis] = direction; this.panOpposite[axis] = 0; }
            }
            return { x: this.view.cx - before.cx, y: this.view.cy - before.cy };
        }

        /* ---- wheel: gallery scroll, editor pan (plain) or zoom (ctrl/pinch) ---- */
        wheel(deltaX, deltaY, ctrlKey, x, y, nowMs) {
            if (!this.active || !finite(deltaY) || !this.accept(nowMs)) return;
            if (this.phase === 'gallery') { this.scroll(deltaY, nowMs); return; }
            if (this.phase !== 'editor') return;
            if (this.press && this.press.dragging) { this.c.wheelIgnored++; return; }
            const kind = ctrlKey ? 'zoom' : 'pan';
            if (this.wheelSeg && (this.wheelSeg.kind !== kind || nowMs - this.wheelSeg.lastMs > WHEEL_GAP_MS)) this.closeWheel();
            if (!this.wheelSeg) {
                this.wheelSeg = { kind, startMs: nowMs, lastMs: nowMs, zoomFrom: this.view.zoom, dx: 0, dy: 0, changed: false };
                this.emit('adjustment_started', nowMs, { kind, image_id: this.openPhoto.id, input_source: ctrlKey ? 'wheel_ctrl' : 'wheel' });
            }
            this.wheelSeg.lastMs = nowMs;
            if (kind === 'zoom') {
                if (this.zoomBy(Math.exp(-deltaY * 0.01), nowMs, 'wheel_ctrl', x, y)) this.wheelSeg.changed = true;
            } else {
                const s = this.scale, moved = this.panBy((finite(deltaX) ? deltaX : 0) / s, deltaY / s);
                this.wheelSeg.dx += moved.x; this.wheelSeg.dy += moved.y;
                if (moved.x || moved.y) this.wheelSeg.changed = true;
            }
        }
        /* Ends a wheel segment at its last packet; segments split after 250 ms without packets. */
        closeWheel() {
            const w = this.wheelSeg;
            if (!w) return;
            this.wheelSeg = null;
            this.finishAdjustment(w.kind, null, w.lastMs, { duration_ms: Math.round(w.lastMs - w.startMs), changed: w.changed,
                input_source: w.kind === 'zoom' ? 'wheel_ctrl' : 'wheel',
                ...(w.kind === 'zoom' ? { zoom_from: round3(w.zoomFrom), zoom_to: round3(this.view ? this.view.zoom : w.zoomFrom) }
                    : { pan_dx: round1(w.dx), pan_dy: round1(w.dy) }) });
        }
        tick(nowMs) { if (this.wheelSeg && nowMs - this.wheelSeg.lastMs > WHEEL_GAP_MS) this.closeWheel(); }
        finishAdjustment(kind, handle, nowMs, fields) {
            const key = kind === 'resize' ? 'resize_' + handle : kind;
            this.completed[key]++;
            this.sinceSubmit.adjustments++;
            this.emit('adjustment_finished', nowMs, Object.assign({ kind, ...(handle ? { handle } : {}), image_id: this.openPhoto ? this.openPhoto.id : null }, fields));
        }
        scroll(deltaPx, nowMs) {
            this.lastScrollMs = nowMs;
            const applied = clamp(this.offset + deltaPx, 0, this.maxOffset) - this.offset;
            if (applied === 0) return;
            this.offset += applied;
            this.scrollDistance += Math.abs(applied);
            const direction = Math.sign(applied);
            if (this.scrollDirection === 0 || direction === this.scrollDirection) { this.scrollDirection = direction; this.oppositeTravel = 0; }
            else {
                this.oppositeTravel += Math.abs(applied);
                if (this.oppositeTravel >= this.rowHeight * REVERSAL_ROWS) { this.reversals++; this.scrollDirection = direction; this.oppositeTravel = 0; }
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
        }

        /* ---- pointer: press decides ownership; drags start past the slop ---- */
        pressAt(x, y, nowMs, source) {
            if (!this.active || this.press || !finite(x) || !finite(y) || !this.accept(nowMs)) return;
            this.closeWheel();
            if (this.phase === 'gallery' && this.lastScrollMs !== null && nowMs - this.lastScrollMs <= SCROLL_ACTIVE_MS) this.c.scrollClicks++;
            const owner = this.targetAt(x, y);
            this.press = { owner, source, downX: x, downY: y, lastX: x, lastY: y, downMs: nowMs, dragging: false, travel: 0,
                cropBefore: this.crop ? Object.assign({}, this.crop) : null, viewBefore: this.view ? Object.assign({}, this.view) : null,
                anchor: this.view && owner && owner.kind !== 'button' ? this.toImage(x, y) : null };
        }
        move(x, y, nowMs) {
            const p = this.press;
            if (!p || !this.active) return;
            if (!finite(x) || !finite(y) || !this.accept(nowMs)) { this.cancel(nowMs, 'stale_input'); return; }
            p.travel += Math.hypot(x - p.lastX, y - p.lastY);
            p.lastX = x; p.lastY = y;
            const draggable = p.owner && (p.owner.kind === 'move' || p.owner.kind === 'resize' || p.owner.kind === 'pan');
            if (!draggable) return;
            if (!p.dragging) {
                if (Math.hypot(x - p.downX, y - p.downY) <= this.slopPx) return;
                p.dragging = true; p.startMs = nowMs; p.travel = Math.hypot(x - p.downX, y - p.downY);
                this.c.dragStarts++;
                this.emit('adjustment_started', nowMs, Object.assign({ kind: p.owner.kind }, p.owner.handle ? { handle: p.owner.handle } : {},
                    { image_id: this.openPhoto.id, input_source: p.source }));
            }
            this.applyDrag(x, y);
        }
        applyDrag(x, y) {
            const p = this.press, photo = this.openPhoto;
            if (p.owner.kind === 'pan') {
                // The image point grabbed stays under the pointer (clamped at the image bounds).
                const s = this.scale;
                this.panBy(p.viewBefore.cx - (x - p.downX) / s - this.view.cx, p.viewBefore.cy - (y - p.downY) / s - this.view.cy);
                return;
            }
            const point = this.toImage(x, y), dx = point.x - p.anchor.x, dy = point.y - p.anchor.y, b = p.cropBefore;
            const c = Object.assign({}, b);
            if (p.owner.kind === 'move') {
                const w = b.right - b.left, h = b.bottom - b.top;
                c.left = clamp(b.left + dx, 0, photo.width - w); c.top = clamp(b.top + dy, 0, photo.height - h);
                c.right = c.left + w; c.bottom = c.top + h;
            } else {
                const handle = p.owner.handle, min = Math.min(MIN_CROP_PX, photo.width, photo.height);
                if (handle.includes('w')) c.left = clamp(b.left + dx, 0, b.right - min);
                if (handle.includes('e')) c.right = clamp(b.right + dx, b.left + min, photo.width);
                if (handle.includes('n')) c.top = clamp(b.top + dy, 0, b.bottom - min);
                if (handle.includes('s')) c.bottom = clamp(b.bottom + dy, b.top + min, photo.height);
            }
            this.crops.set(this.openIndex, c);
        }
        release(x, y, nowMs) {
            const p = this.press;
            if (!p || !this.active) return;
            if (!finite(x) || !finite(y) || !this.accept(nowMs)) { this.cancel(nowMs, 'stale_input'); return; }
            if (p.dragging) {
                // Pointer capture delivers releases outside the editor; the clamped geometry is kept.
                p.travel += Math.hypot(x - p.lastX, y - p.lastY);
                this.applyDrag(x, y);
                this.press = null;
                const mouse = p.source === 'mouse';
                if (mouse) this.holdTravel += p.travel; else this.touchHold = true;
                const fields = { duration_ms: Math.round(nowMs - p.startMs), input_source: p.source, hold_travel_px: mouse ? round1(p.travel) : null,
                    outside_editor: !this.viewportRect.contains(x, y) };
                if (p.owner.kind === 'pan') Object.assign(fields, { pan_dx: round1(this.view.cx - p.viewBefore.cx), pan_dy: round1(this.view.cy - p.viewBefore.cy) });
                else {
                    const c = this.crop, b = p.cropBefore;
                    Object.assign(fields, { changed: c.left !== b.left || c.top !== b.top || c.right !== b.right || c.bottom !== b.bottom,
                        delta: { left: round1(c.left - b.left), top: round1(c.top - b.top), right: round1(c.right - b.right), bottom: round1(c.bottom - b.bottom) } });
                }
                this.finishAdjustment(p.owner.kind, p.owner.handle || null, nowMs, fields);
                return;
            }
            this.press = null;
            const under = this.targetAt(x, y), owner = p.owner;
            if (!owner || owner.kind === 'pan') { this.c.unhandled++; return; }
            if (owner.kind === 'move' || owner.kind === 'resize') { this.c.pressNoDrag++; return; }
            const same = under && under.kind === owner.kind && under.index === owner.index && under.name === owner.name;
            if (!same) { this.c.buttonsNoAction++; return; }
            if (owner.kind === 'photo') this.openPhotoAt(owner.index, nowMs, p.source);
            else this.activate(owner.name, nowMs, p.source);
        }
        activate(name, nowMs, source) {
            if (name === 'back') this.back(nowMs, source);
            else if (name === 'reset') this.reset(nowMs, source);
            else if (name === 'apply') this.submit(nowMs, source);
            else {
                const before = this.view.zoom;
                const factor = this.zoomBy(name === 'zoomIn' ? ZOOM_STEP : 1 / ZOOM_STEP, nowMs, source);
                this.emit('adjustment_started', nowMs, { kind: 'zoom', image_id: this.openPhoto.id, input_source: source });
                this.finishAdjustment('zoom', null, nowMs, { duration_ms: 0, input_source: source, control: name,
                    changed: !!factor, zoom_from: round3(before), zoom_to: round3(this.view.zoom) });
            }
        }
        /* Cancels an in-progress gesture and restores the geometry it started from. */
        cancel(nowMs, reason) {
            const p = this.press;
            if (!p) return;
            this.press = null;
            if (!this.active || !p.dragging) return;
            if (p.cropBefore) this.crops.set(this.openIndex, p.cropBefore);
            if (p.viewBefore) this.view = p.viewBefore;
            const key = p.owner.kind === 'resize' ? 'resize_' + p.owner.handle : p.owner.kind;
            this.cancelledBy[key]++;
            this.c.cancelled++;
            this.sinceSubmit.cancelled++;
            this.emit('adjustment_cancelled', Math.max(nowMs, this.lastMs), Object.assign({ kind: p.owner.kind }, p.owner.handle ? { handle: p.owner.handle } : {},
                { image_id: this.openPhoto ? this.openPhoto.id : null, reason, input_source: p.source }));
        }
        interrupt(nowMs, reason) { this.cancel(nowMs, reason); this.closeWheel(); }
        focusLost(nowMs) { if (this.active) this.interrupt(nowMs, 'focus_lost'); }
        hover(x, y) { this.hoverAt = finite(x) && finite(y) ? { x, y } : null; }

        /* ---- submission ---- */
        submit(nowMs, source) {
            const photo = this.openPhoto, s = this.scenario, crop = Object.assign({}, this.crop);
            const isTarget = this.isTargetOpen;
            if (this.recoverySince !== null) { this.c.recoveryMs += Math.max(0, nowMs - this.recoverySince); this.recoverySince = null; this.c.retries++; }
            this.c.submits++;
            const editorMs = this.c.editorMs + (isTarget && this.viewSince !== null ? Math.max(0, nowMs - this.viewSince) : 0);
            let result;
            if (isTarget) result = evaluateCrop(crop, s.target, s.subject, photo.width, photo.height, this.thresholds);
            else {
                result = { evaluator_version: EVALUATOR_VERSION, thresholds: this.thresholds, valid: false, iou: null, subject_coverage: null,
                    excess_ratio: null, edge_error_px: null, edge_error_norm: null, mean_edge_error_norm: null, success: false,
                    failures: ['wrong_photo'], missing: { all: 'wrong_photo' } };
            }
            const invalid = [];
            if (!this.orderingValid) invalid.push('out_of_order_input');
            if (this.resizedInEditor) invalid.push('resized_during_editing');
            const record = deepFreeze({ index: this.submissions.length + this.submissionsDropped, elapsed_ms: this.elapsed(nowMs),
                editor_elapsed_ms: Math.round(editorMs), image_id: photo.id, is_target_photo: isTarget,
                crop: { left: round1(crop.left), top: round1(crop.top), right: round1(crop.right), bottom: round1(crop.bottom) },
                iou: result.iou, subject_coverage: result.subject_coverage, excess_ratio: result.excess_ratio,
                edge_error_px: result.edge_error_px, edge_error_norm: result.edge_error_norm, mean_edge_error_norm: result.mean_edge_error_norm,
                success: result.success, failures: result.failures, missing: result.missing,
                thresholds: result.thresholds, evaluator_version: result.evaluator_version,
                adjustments_since_previous: this.sinceSubmit.adjustments, cancellations_since_previous: this.sinceSubmit.cancelled,
                measurement_valid: invalid.length === 0, invalid_reasons: invalid, input_source: source });
            if (this.submissions.length < SUBMISSION_LIMIT) this.submissions.push(record); else this.submissionsDropped++;
            this.lastSubmission = record;
            this.sinceSubmit = { adjustments: 0, cancelled: 0 };
            this.emit('crop_submitted', nowMs, { index: record.index, image_id: photo.id, success: record.success, failures: record.failures });
            if (record.success) { this.finish('completed', nowMs); this.feedback = '✓ Crop matches the reference.'; return record; }
            this.c.failed++;
            this.recoverySince = nowMs;
            this.feedback = isTarget ? feedbackFor(result, crop, s.subject, s.subject_label)
                : "This isn't the requested photo. Select Back to return to the gallery.";
            return record;
        }
        skip(nowMs) { return this.finish('skipped', nowMs); }
        exit(nowMs) { return this.finish('exited', nowMs); }
        finish(outcome, nowMs) {
            if (this.outcome !== null) return false;
            if (!this.started) { this.outcome = outcome; this.phase = 'ended'; this.onEnd(this); return true; }
            const at = Math.max(finite(nowMs) ? nowMs : this.lastMs, this.lastMs);
            this.cancel(at, outcome === 'completed' ? 'completed' : outcome);
            this.closeWheel();
            if (this.recoverySince !== null) { this.c.recoveryMs += Math.max(0, at - this.recoverySince); this.recoverySince = null; }
            this.enterView('rating', at);
            this.outcome = outcome; this.endMs = at;
            this.emit(outcome === 'completed' ? 'task_completed' : outcome === 'skipped' ? 'task_skipped' : 'task_exited', at,
                { duration_ms: this.elapsed(at) });
            this.onEnd(this);
            return true;
        }

        /* ---- results ---- */
        get status() { return this.outcome === 'completed' ? 'completed' : this.started ? 'abandoned' : 'unstarted'; }
        get holdTravelValid() { return !this.touchHold && this.orderingValid; }
        summary() {
            const c = this.c, end = this.endMs !== null ? this.endMs : this.lastMs, last = this.lastSubmission || null, missing = {};
            const value = (name, v, reason) => { if (v === null || v === undefined) missing[name] = reason; return v === undefined ? null : v; };
            const out = {
                duration_ms: this.started ? this.elapsed(end) : null,
                gallery_ms: this.started ? Math.round(c.galleryMs) : null, other_photo_ms: this.started ? Math.round(c.otherMs) : null,
                editor_ms: this.started ? Math.round(c.editorMs) : null, recovery_ms: this.started ? Math.round(c.recoveryMs) : null,
                find_ms: this.firstTargetOpenMs !== null ? Math.round(this.firstTargetOpenMs - this.startMs) : null,
                photo_open_count: c.opens, wrong_photo_open_count: c.wrongOpens, backtrack_count: c.backtracks,
                submit_count: c.submits, failed_submit_count: c.failed, reset_count: c.resets, retry_count: c.retries,
                completed_adjustments: Object.assign({}, this.completed), cancelled_adjustments: Object.assign({}, this.cancelledBy),
                drag_start_count: c.dragStarts, press_without_drag_count: c.pressNoDrag, button_press_without_action_count: c.buttonsNoAction,
                wheel_ignored_during_drag_count: c.wheelIgnored, pan_reversal_count: this.panReversals, zoom_reversal_count: this.zoomReversals,
                unhandled_click_count: c.unhandled, scroll_click_count: c.scrollClicks,
                scroll_distance_px: round1(this.scrollDistance), scroll_reversal_count: this.reversals,
                scroll_overshoot_count: null, scroll_overshoot_max_px: null, corrective_scroll_px: null,
                hold_travel_px: null, final_iou: null, final_subject_coverage: null, final_excess_ratio: null,
                final_mean_edge_error_norm: null, success: this.outcome === 'completed' ? 1 : 0
            };
            if (this.approach !== 0) Object.assign(out, { scroll_overshoot_count: this.overshoots, scroll_overshoot_max_px: round1(this.overshootMax), corrective_scroll_px: round1(this.corrective) });
            else ['scroll_overshoot_count', 'scroll_overshoot_max_px', 'corrective_scroll_px'].forEach(k => { missing[k] = this.started ? 'target_initially_visible' : 'not_started'; });
            if (this.holdTravelValid) out.hold_travel_px = round1(this.holdTravel);
            else missing.hold_travel_px = this.touchHold ? 'non_cursor_pointer' : 'out_of_order_input';
            if (!last) ['final_iou', 'final_subject_coverage', 'final_excess_ratio', 'final_mean_edge_error_norm'].forEach(k => { missing[k] = 'no_submission'; });
            else {
                out.final_iou = value('final_iou', last.iou, last.missing.all);
                out.final_subject_coverage = value('final_subject_coverage', last.subject_coverage, last.missing.all || last.missing.subject_coverage);
                out.final_excess_ratio = value('final_excess_ratio', last.excess_ratio, last.missing.all);
                out.final_mean_edge_error_norm = value('final_mean_edge_error_norm', last.mean_edge_error_norm, last.missing.all);
            }
            if (!this.started) Object.keys(out).forEach(k => { if (out[k] === null && !missing[k]) missing[k] = 'not_started'; });
            out.missing = missing;
            return out;
        }
        /* Flat row metrics for the local path-results record and the dashboard `qa_path` packing. */
        metrics() {
            const s = this.summary(), out = { measurement_started: this.started ? 1 : 0 };
            if (!this.started) return out;
            const done = this.completed, edge = done.resize_n + done.resize_e + done.resize_s + done.resize_w;
            const corner = done.resize_nw + done.resize_ne + done.resize_se + done.resize_sw;
            const set = (name, v) => { if (v !== null && v !== undefined) out[name] = v; };
            set('stp_crop_gallery_ms', s.gallery_ms); set('stp_crop_other_photo_ms', s.other_photo_ms);
            set('stp_crop_editor_ms', s.editor_ms); set('stp_crop_recovery_ms', s.recovery_ms);
            set('stp_crop_wrong_photo_open_count', s.wrong_photo_open_count); set('stp_crop_backtrack_count', s.backtrack_count);
            set('stp_crop_submit_count', s.submit_count); set('stp_crop_failed_submit_count', s.failed_submit_count);
            set('stp_crop_reset_count', s.reset_count); set('stp_crop_move_count', done.move);
            set('stp_crop_edge_resize_count', edge); set('stp_crop_corner_resize_count', corner);
            set('stp_crop_cancelled_adjust_count', this.c.cancelled); set('stp_crop_pan_count', done.pan);
            set('stp_crop_pan_reversal_count', s.pan_reversal_count); set('stp_crop_zoom_count', done.zoom);
            set('stp_crop_zoom_reversal_count', s.zoom_reversal_count); set('stp_crop_unhandled_click_count', s.unhandled_click_count);
            set('stp_crop_scroll_distance_px', s.scroll_distance_px); set('stp_crop_scroll_reversal_count', s.scroll_reversal_count);
            set('stp_crop_scroll_overshoot_count', s.scroll_overshoot_count); set('stp_crop_corrective_scroll_px', s.corrective_scroll_px);
            set('stp_crop_scroll_click_count', s.scroll_click_count); set('stp_crop_hold_travel_px', s.hold_travel_px);
            set('stp_crop_final_iou', s.final_iou); set('stp_crop_final_subject_coverage', s.final_subject_coverage);
            set('stp_crop_final_excess_ratio', s.final_excess_ratio); set('stp_crop_final_mean_edge_error_norm', s.final_mean_edge_error_norm);
            set('stp_crop_success', s.success);
            out.drag_attempt_count = this.c.dragStarts;
            return out;
        }
        attributes() {
            return { stp_target_kind: 'photo_crop', stp_condition: this.scenario.condition, stp_measurement: 'app_output',
                stp_attempt_source: 'delivered_drag', drag_target_text: this.scenario.subject_label, end_reason: this.outcome || 'open' };
        }
        get traceValid() { return this.orderingValid && !this.resizedInEditor && this.holdTravelValid; }
        /* Freezes and returns the single target row (path-results format). Ends an open run as exited. */
        targetResults(nowMs) {
            if (!this.frozenRow) {
                if (this.outcome === null) this.finish('exited', nowMs);
                const status = this.status === 'completed' ? 'completed' : 'abandoned';
                this.frozenRow = deepFreeze({ index: 0, count: 1, status, elapsed_ms: this.started ? this.elapsed(this.endMs) : 0,
                    trace_valid: this.started && this.traceValid, metrics: this.metrics(), attributes: this.attributes() });
            }
            return [this.frozenRow];
        }
        /* Existing touchpad observation (jvision/transport.js) → intent row. Null when the producer contract emits nothing. */
        intentObservation() {
            if (this.status !== 'completed') return null;
            const metrics = this.metrics(), details = {
                details_version: 1, target_index: 0, target_count: 1, target_status: 'completed', trace_valid: this.traceValid,
                run_sequence: 1, task_index: 1, interaction: INTERACTION, stp_condition: this.scenario.condition,
                crop_eval_v: EVALUATOR_VERSION, qa_path_v: 1,
                qa_path: PATH_FIELDS.map(name => (finite(metrics[name]) && metrics[name] >= 0 ? round3(metrics[name]) : null))
            };
            const recent = this.submissions.slice(-3).map(r => [r.iou, r.subject_coverage, r.mean_edge_error_norm, r.success ? 1 : 0]);
            details.qa_subs_n = this.c.submits;
            details.qa_subs = recent;
            if (bytes(JSON.stringify(details)) > DETAILS_MAX_BYTES) { delete details.qa_subs; details.qa_subs_truncated = true; }
            if (bytes(JSON.stringify(details)) > DETAILS_MAX_BYTES) { delete details.qa_path; details.qa_path_truncated = true; }
            const observation = { version: 1, type: 'touchpad', activity_id: TASK_ID, elapsed_ms: this.elapsed(this.endMs),
                metric_family: METRIC_FAMILY, details };
            DRAG_COLUMNS.forEach(name => { observation[name] = -1; });
            observation.stp_drag_target_text = this.scenario.subject_label;
            observation.stp_drag_attempt_count = this.c.dragStarts;
            return observation;
        }
        /* Local JSON export: envelope, summary, immutable submissions and bounded gesture-boundary events. */
        exportPayload() {
            const s = this.scenario, photo = this.targetPhoto;
            const payload = {
                schema_version: SCHEMA_VERSION, task_id: TASK_ID, task_version: TASK_VERSION, run_id: this.runId,
                scenario_id: s.id, scenario_seed: s.seed, image_id: photo.id, authored_target_id: s.target_id,
                image_size: { width: photo.width, height: photo.height }, target_crop: s.target, subject_bounds: s.subject,
                evaluator_version: EVALUATOR_VERSION, thresholds: this.thresholds, thresholds_note: 'prototype task tolerances, not validated STP quality gates',
                status: this.status, end_reason: this.outcome, trace_valid: this.started && this.traceValid,
                summary: this.summary(), submissions: this.submissions.slice(), submissions_dropped: this.submissionsDropped,
                events: this.events.slice(), events_dropped: this.eventsDropped, events_truncated: this.eventsDropped > 0,
                intent_observation: this.intentObservation()
            };
            while (bytes(JSON.stringify(payload)) > EXPORT_MAX_BYTES && payload.events.length > 1) {
                payload.events.splice(payload.events.length - 2, 1);
                payload.events_dropped++; payload.events_truncated = true;
            }
            return deepFreeze(payload);
        }
    }

    return { TASK_ID, TASK_VERSION, SCHEMA_VERSION, EVALUATOR_VERSION, INTERACTION, METRIC_FAMILY, THRESHOLDS, PHOTOS, SCENARIOS,
        PATH_FIELDS, DRAG_COLUMNS, HANDLES, DETAILS_MAX_BYTES, EVENT_LIMIT, SUBMISSION_LIMIT, EXPORT_MAX_BYTES, MIN_CROP_PX,
        HANDLE_HIT_PX, SCROLL_ACTIVE_MS, WHEEL_GAP_MS, GALLERY_COLUMNS, evaluateCrop, feedbackFor, rect, PhotoCropTrials };
});
