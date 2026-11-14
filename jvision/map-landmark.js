/* Map landmark task: navigate a fictional city map, frame the requested landmark at a useful zoom and select it.
 * Pure logic: no DOM, timers or uploads. Times are caller-supplied monotonic ms (performance.now()). Screen values
 * are CSS px; landmarks, regions and the camera are world (map) units. Schema and criteria: jvision/MAP_LANDMARK.md. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SurfaceInputsMapLandmark = api;
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const TASK_ID = 'stp_map_landmark', TASK_VERSION = '1.0', SCHEMA_VERSION = 1, EVALUATOR_VERSION = 1, PROTOCOL_VERSION = 1;
    const INTERACTION = 'MapLandmark', METRIC_FAMILY = 'clicks';
    const DETAILS_MAX_BYTES = 512, EVENT_LIMIT = 300, SUBMISSION_LIMIT = 30, EXPORT_MAX_BYTES = 96 * 1024;
    const MIN_ZOOM = 0, MAX_ZOOM = 5, BASE_SCALE = 0.25, WHEEL_ZOOM_PER_PX = 0.01, BUTTON_ZOOM_STEP = 0.5;
    const WHEEL_GAP_MS = 250, ACTIVE_GESTURE_MS = 250, PAN_REVERSAL_PX = 24, ZOOM_REVERSAL_LOG2 = 0.1;
    const MARKER_HIT_PX = 16, DETAIL_ZOOM = 2.3, LABEL_ZOOM = 0.8;
    /* Prototype task criteria for this scenario; not validated STP quality gates. */
    const THRESHOLDS = Object.freeze({ zoom_min: 2.3, zoom_max: 3.3, min_region_visible: 0.9 });

    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const round1 = value => Math.round(value * 10) / 10;
    const round3 = value => Math.round(value * 1000) / 1000;
    const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);
    const bytes = value => (typeof TextEncoder === 'undefined' ? encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, '_').length
        : new TextEncoder().encode(value).length);
    function deepFreeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
        return value;
    }
    function rect(left, top, right, bottom) {
        return Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top,
            centerX: (left + right) / 2, centerY: (top + bottom) / 2,
            contains(x, y) { return x >= left && x < right && y >= top && y < bottom; } });
    }
    const box = (left, top, right, bottom) => ({ left, top, right, bottom });
    const area = r => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
    const intersection = (a, b) => box(Math.max(a.left, b.left), Math.max(a.top, b.top), Math.min(a.right, b.right), Math.min(a.bottom, b.bottom));
    const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

    /* ---------- Deterministic fictional map (world units; at zoom 2 one unit is one CSS px) ---------- */
    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const lm = (id, name, kind, footprint, point, description) => ({ id, name, kind, footprint, point, description });
    function buildMap(seed) {
        const width = 4000, height = 3000;
        const avenues = [[400, 'Alder Ave'], [1000, 'Birch Ave'], [1600, 'Cedar Ave'], [2200, 'Elm Ave'], [2800, 'Dock Ave'], [3400, 'Fir Ave']]
            .map(([x, name]) => ({ name, x1: x, y1: 0, x2: x, y2: height, width: 24 }));
        const streets = [[350, 'North St'], [900, 'Mill St'], [1350, 'Canal St'], [2000, 'Harbor St'], [2550, 'South St']]
            .map(([y, name]) => ({ name, x1: 0, y1: y, x2: width, y2: y, width: 24 }));
        const minor = [];
        [700, 1300, 1900, 2500, 3100, 3700].forEach(x => minor.push({ name: '', x1: x, y1: 0, x2: x, y2: 1560, width: 10 }, { name: '', x1: x, y1: 1880, x2: x, y2: height, width: 10 }));
        [625, 1150, 2275, 2800].forEach(y => minor.push({ name: '', x1: 0, y1: y, x2: width, y2: y, width: 10 }));
        // River: a band through the middle of the city, centerline points with half-width.
        const river = { name: 'Lark River', halfWidth: 70, points: [[0, 1650], [700, 1690], [1400, 1660], [2100, 1700], [2800, 1730], [3400, 1700], [4000, 1720]] };
        const parks = [{ name: 'Willow Park', ...box(1060, 420, 1540, 860) }, { name: 'Harbor Green', ...box(2860, 2600, 3340, 2930) },
            { name: 'Mill Meadow', ...box(160, 2080, 520, 2480) }];
        const landmarks = [
            lm('lm_riverside_museum', 'Riverside Museum', 'museum', box(2850, 1840, 3010, 1960), [2930, 1966], 'History museum on the south bank, entrance on Harbor St.'),
            lm('lm_riverside_market', 'Riverside Market', 'market', box(1660, 1840, 1820, 1950), [1740, 1956], 'Covered food market on the south bank.'),
            lm('lm_riverview_art', 'Riverview Museum of Art', 'museum', box(3250, 2150, 3420, 2280), [3335, 2286], 'Art museum two blocks south-east of the river.'),
            lm('lm_riverside_library', 'Riverside Library', 'library', box(440, 1840, 580, 1940), [510, 1946], 'Public library on the south bank.'),
            lm('lm_riverside_theatre', 'Riverside Theatre', 'theatre', box(2430, 1835, 2580, 1945), [2505, 1951], 'Theatre on the south bank.'),
            lm('lm_harbor_museum', 'Harbor Maritime Museum', 'museum', box(3460, 2610, 3610, 2730), [3535, 2736], 'Ships and harbor history.'),
            lm('lm_central_station', 'Central Station', 'station', box(1940, 1000, 2260, 1140), [2100, 1146], 'Main rail station.'),
            lm('lm_city_hall', 'City Hall', 'civic', box(1040, 990, 1200, 1110), [1120, 1116], 'Seat of city government.'),
            lm('lm_mill_school', 'Mill Street School', 'school', box(2330, 740, 2470, 860), [2400, 866], 'Primary school on Mill St.'),
            lm('lm_north_tower', 'North Tower', 'tower', box(3010, 380, 3090, 470), [3050, 476], 'Observation tower.'),
            lm('lm_willow_park', 'Willow Park', 'park', box(1060, 420, 1540, 860), [1300, 640], 'Park with a pond.'),
            lm('lm_harbor_green', 'Harbor Green', 'park', box(2860, 2600, 3340, 2930), [3100, 2765], 'Waterfront lawn.'),
            lm('lm_stone_bridge', 'Old Stone Bridge', 'bridge', box(2180, 1610, 2220, 1790), [2200, 1700], 'Pedestrian bridge over the Lark River.'),
            lm('lm_canal_hospital', 'Canal Street Hospital', 'hospital', box(640, 1180, 820, 1320), [730, 1326], 'Hospital on Canal St.')
        ];
        // Ordinary buildings: seeded blocks inside each grid cell, kept off streets, river, parks and landmarks.
        const xs = [0].concat(avenues.map(a => a.x1)).concat([width]), ys = [0].concat(streets.map(s => s.y1)).concat([height]);
        const random = rng(seed), blocks = [];
        const blocked = b => landmarks.some(l => area(intersection(b, box(l.footprint.left - 20, l.footprint.top - 20, l.footprint.right + 20, l.footprint.bottom + 20))) > 0) ||
            parks.some(p => area(intersection(b, p)) > 0) || (b.bottom > 1560 && b.top < 1840) ||
            minor.some(m => area(intersection(b, box(m.x1 - 12, m.y1 - 12, m.x2 + 12, m.y2 + 12))) > 0);
        for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
            for (let k = 0; k < 7; k++) {
                const w = 50 + random() * 80, h = 40 + random() * 70;
                const left = xs[i] + 24 + random() * Math.max(0, xs[i + 1] - xs[i] - 48 - w), top = ys[j] + 24 + random() * Math.max(0, ys[j + 1] - ys[j] - 48 - h);
                const b = box(Math.round(left), Math.round(top), Math.round(left + w), Math.round(top + h));
                if (!blocked(b) && !blocks.some(o => area(intersection(o, box(b.left - 8, b.top - 8, b.right + 8, b.bottom + 8))) > 0)) blocks.push(b);
            }
        }
        return { id: 'lark_city_v1', width, height, avenues, streets, minor, river, parks, landmarks, blocks };
    }
    const MAP = deepFreeze(buildMap(4207));
    const SCENARIOS = deepFreeze([{
        id: 'riverside_museum_v1', seed: 4207, protocol_version: PROTOCOL_VERSION, map_id: MAP.id,
        landmark: 'lm_riverside_museum', condition: 'riverside_museum_v1',
        prompt: 'Find Riverside Museum. Zoom in until its entrance and the surrounding streets are visible, then select the museum.',
        start: { cx: 1000, cy: 700, zoom: 1 },
        // Must remain visible: the museum, its entrance, Dock Ave, Harbor St and the river bank.
        region: { left: 2780, top: 1800, right: 3040, bottom: 2030 }
    }]);

    /* ---------- Telemetry contract ---------- */
    /* Fixed `qa_path` order (details JSON). Dashboard PATH_PROTOCOLS.stp_map_landmark.packed must match. */
    const PATH_FIELDS = Object.freeze([
        'stp_map_first_visible_ms', 'stp_map_first_qualifying_ms', 'stp_map_qualifying_to_select_ms',
        'stp_map_pan_count', 'stp_map_zoom_count', 'stp_map_pan_cancel_count', 'stp_map_zoom_cancel_count',
        'stp_map_pan_distance_norm', 'stp_map_zoom_change_log2', 'stp_map_pan_reversal_count', 'stp_map_zoom_reversal_count',
        'stp_map_visibility_episode_count', 'stp_map_visibility_loss_count', 'stp_map_zoom_overshoot_count',
        'stp_map_corrective_return_count', 'stp_map_distractor_open_count', 'stp_map_target_open_count',
        'stp_map_panel_close_count', 'stp_map_submit_count', 'stp_map_incorrect_selection_count',
        'stp_map_framing_failure_count', 'stp_map_reset_count', 'stp_map_unhandled_click_count',
        'stp_map_active_gesture_click_count', 'stp_map_hold_travel_px', 'stp_map_cursor_distance_px', 'stp_map_final_zoom', 'stp_map_final_zoom_error',
        'stp_map_final_center_offset_norm', 'stp_map_final_region_visible', 'stp_map_success'
    ]);
    /* Existing clicks-family typed columns. The web transport contract admits only the family's own columns, so the
     * cursor path length (a cursor_movement column on native rows) travels in `qa_path` instead. */
    const CLICK_COLUMNS = Object.freeze(['stp_clicks_target_count', 'stp_clicks_completed_count', 'stp_clicks_total',
        'stp_clicks_on_target', 'stp_clicks_miss_count']);
    function randomRunId() {
        const crypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
        if (crypto && crypto.getRandomValues) return 'map_' + Array.from(crypto.getRandomValues(new Uint8Array(8)), v => v.toString(16).padStart(2, '0')).join('');
        return 'map_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    class MapLandmarkTrials {
        constructor(options = {}) {
            this.map = options.map || MAP;
            this.scenario = options.scenario || SCENARIOS[0];
            this.thresholds = options.thresholds || THRESHOLDS;
            this.runId = options.runId || randomRunId();
            this.onEnd = options.onEnd || (() => {});
            this.targetIndex = this.map.landmarks.findIndex(l => l.id === this.scenario.landmark);
            this.viewWidth = 0; this.viewHeight = 0; this.slopPx = 8;
            this.phase = 'instructions'; this.outcome = null;
            this.startMs = null; this.endMs = null; this.lastMs = 0;
            this.camera = { cx: this.scenario.start.cx, cy: this.scenario.start.cy, zoom: this.scenario.start.zoom };
            this.openIndex = null; this.openClick = null; this.press = null; this.wheelSeg = null; this.hoverAt = null;
            this.feedback = 'Read the instructions, then select Start.';
            this.events = []; this.eventsDropped = 0; this.sequence = 0;
            this.submissions = []; this.submissionsDropped = 0; this.lastSubmission = null;
            this.c = { pans: 0, zooms: 0, panCancels: 0, zoomCancels: 0, panDistance: 0, zoomChange: 0, panReversals: 0, zoomReversals: 0,
                episodes: 0, losses: 0, overshoots: 0, corrective: 0, distractorOpens: 0, targetOpens: 0, panelCloses: 0,
                submits: 0, incorrect: 0, framing: 0, retries: 0, resets: 0, unhandled: 0, activeClicks: 0, presses: 0,
                pressNoAction: 0, wheelIgnored: 0 };
            this.sinceSubmit = { pans: 0, zooms: 0, cancelled: 0 };
            this.navigationStarted = false; this.lastWheelMs = null;
            this.firstVisibleMs = null; this.firstQualifyingMs = null; this.lastQualifyingSinceMs = null;
            this.visible = false; this.qualifying = false; this.qualifiedOnce = false;
            this.panDir = { x: 0, y: 0 }; this.panOpposite = { x: 0, y: 0 }; this.zoomDir = 0; this.zoomOpposite = 0;
            this.orderingValid = true; this.resized = false; this.touchHold = false; this.holdTravel = 0;
            this.cursorObserved = false; this.cursorGap = false; this.directInput = false; this.cursorX = NaN; this.cursorY = NaN; this.cursorTravel = 0;
            this.frozenRow = null;
        }
        get target() { return this.map.landmarks[this.targetIndex]; }
        get started() { return this.startMs !== null; }
        get active() { return this.started && this.outcome === null; }
        get openLandmark() { return this.openIndex === null ? null : this.map.landmarks[this.openIndex]; }
        accept(nowMs) {
            if (!finite(nowMs) || nowMs < this.lastMs) { this.orderingValid = false; return false; }
            this.lastMs = nowMs;
            return true;
        }
        elapsed(nowMs) { return this.startMs === null ? 0 : Math.max(0, Math.round(nowMs - this.startMs)); }
        emit(type, nowMs, fields = {}) {
            const terminal = type === 'task_completed' || type === 'task_skipped' || type === 'task_exited';
            if (this.events.length >= EVENT_LIMIT - 1 && !terminal) { this.eventsDropped++; return; }
            this.events.push(deepFreeze(Object.assign({ event_sequence: ++this.sequence, elapsed_ms: this.elapsed(nowMs), type, phase: this.phase }, fields)));
        }

        /* ---- layout (CSS px) ---- */
        geometry(width, height, slop = 8) {
            if (!(width > 0) || !(height > 0)) return;
            const changed = this.viewWidth > 0 && (width !== this.viewWidth || height !== this.viewHeight);
            if (changed && this.active) { this.interrupt(this.lastMs, 'resize'); this.resized = true; }
            this.viewWidth = width; this.viewHeight = height; this.slopPx = slop > 0 ? slop : 8;
            // The camera center and zoom are world values, so the map stays put; only the visible extent changes.
            this.clampCamera();
            if (this.active) this.cameraChanged(this.lastMs);
        }
        get toolbarHeight() { return Math.min(48, this.viewHeight * 0.12); }
        get viewportRect() { return rect(0, this.toolbarHeight, this.viewWidth, this.viewHeight); }
        get overviewRect() {
            const v = this.viewportRect, w = Math.min(160, v.width * 0.2), h = w * this.map.height / this.map.width;
            return rect(v.right - w - 8, v.top + 8, v.right - 8, v.top + 8 + h);
        }
        get panelRect() {
            const v = this.viewportRect, w = Math.min(340, v.width * 0.45), h = Math.min(124, v.height * 0.3);
            return rect(v.left + 8, v.bottom - h - 8, v.left + 8 + w, v.bottom - 8);
        }
        /* Overlays that hide map content: the overview always, the info panel while open. */
        occluders() {
            const list = [{ name: 'overview', rect: this.overviewRect }];
            if (this.openIndex !== null) list.push({ name: 'panel', rect: this.panelRect });
            return list;
        }
        buttonRect(name) {
            const h = this.toolbarHeight - 12, top = 6;
            if (name === 'reset') return rect(8, top, 128, top + h);
            if (name === 'zoomIn') return rect(this.viewWidth - 52, top, this.viewWidth - 8, top + h);
            if (name === 'zoomOut') return rect(this.viewWidth - 104, top, this.viewWidth - 60, top + h);
            const p = this.panelRect, bh = Math.min(34, p.height * 0.3), y = p.bottom - bh - 10;
            if (name === 'choose') return rect(p.left + 12, y, p.left + 12 + Math.min(200, p.width * 0.6), y + bh);
            if (name === 'close') return rect(p.right - 34, p.top + 8, p.right - 8, p.top + 34);
            return null;
        }
        buttonAt(x, y) {
            const names = this.openIndex === null ? ['reset', 'zoomOut', 'zoomIn'] : ['reset', 'zoomOut', 'zoomIn', 'choose', 'close'];
            return names.find(name => this.buttonRect(name).contains(x, y)) || null;
        }

        /* ---- camera: world ↔ screen ---- */
        get scale() { return BASE_SCALE * Math.pow(2, this.camera.zoom); }
        toScreen(wx, wy) { const v = this.viewportRect, s = this.scale; return { x: v.centerX + (wx - this.camera.cx) * s, y: v.centerY + (wy - this.camera.cy) * s }; }
        toWorld(sx, sy) { const v = this.viewportRect, s = this.scale; return { x: this.camera.cx + (sx - v.centerX) / s, y: this.camera.cy + (sy - v.centerY) / s }; }
        screenToWorldRect(r) { const a = this.toWorld(r.left, r.top), b = this.toWorld(r.right, r.bottom); return box(a.x, a.y, b.x, b.y); }
        visibleWorldRect() { return this.screenToWorldRect(this.viewportRect); }
        clampCamera() {
            const v = this.viewportRect, s = this.scale, m = this.map;
            if (!(v.width > 0) || !(v.height > 0)) return;
            this.camera.zoom = clamp(this.camera.zoom, MIN_ZOOM, MAX_ZOOM);
            const halfW = v.width / (2 * this.scale), halfH = v.height / (2 * this.scale);
            this.camera.cx = m.width <= 2 * halfW ? m.width / 2 : clamp(this.camera.cx, halfW, m.width - halfW);
            this.camera.cy = m.height <= 2 * halfH ? m.height / 2 : clamp(this.camera.cy, halfH, m.height - halfH);
            return s;
        }
        /* Marker pin center in screen px. At street-level zoom buildings show the entrance (▲) at the authored point
         * and the pin 16 px above it; otherwise the pin sits on the point. */
        pinScreen(index) {
            const l = this.map.landmarks[index], p = this.toScreen(l.point[0], l.point[1]);
            const raised = this.camera.zoom >= DETAIL_ZOOM && l.kind !== 'park' && l.kind !== 'bridge';
            return { x: p.x, y: raised ? p.y - 16 : p.y, entrance: raised ? p : null };
        }
        /* Landmark under a screen point: nearest pin or entrance within 16 px, else the smallest footprint. */
        landmarkAt(x, y) {
            if (!this.viewportRect.contains(x, y)) return null;
            let best = null, bestDistance = Infinity;
            this.map.landmarks.forEach((l, i) => {
                const pin = this.pinScreen(i), d = Math.min(Math.hypot(x - pin.x, y - pin.y),
                    pin.entrance ? Math.hypot(x - pin.entrance.x, y - pin.entrance.y) : Infinity);
                if (d <= MARKER_HIT_PX && d < bestDistance) { best = i; bestDistance = d; }
            });
            if (best !== null) return best;
            const w = this.toWorld(x, y);
            // Smaller footprints win (a building inside a park).
            const hits = this.map.landmarks.map((l, i) => [i, l]).filter(([, l]) => inside(l.footprint, w.x, w.y))
                .sort((a, b) => area(a[1].footprint) - area(b[1].footprint));
            return hits.length ? hits[0][0] : null;
        }
        /* Press owner: toolbar/panel button > overlay (overview, panel body) > map (pan or landmark click). */
        targetAt(x, y) {
            if (this.phase !== 'map') return null;
            const button = this.buttonAt(x, y);
            if (button) return { kind: 'button', name: button };
            if (!this.viewportRect.contains(x, y)) return null;
            if (this.overviewRect.contains(x, y)) return { kind: 'overview' };
            if (this.openIndex !== null && this.panelRect.contains(x, y)) return { kind: 'panel' };
            return { kind: 'map', landmark: this.landmarkAt(x, y) };
        }

        /* ---- view evaluation (world coordinates) ---- */
        evaluateView(index, occluders = this.occluders()) {
            const l = this.map.landmarks[index], t = this.thresholds, v = this.viewportRect, z = this.camera.zoom;
            const world = this.visibleWorldRect(), occ = occluders.map(o => this.screenToWorldRect(o.rect));
            const [px, py] = l.point;
            const pointInViewport = inside(world, px, py);
            const obscuredBy = occluders.filter((o, i) => inside(occ[i], px, py)).map(o => o.name);
            const halfW = (world.right - world.left) / 2, halfH = (world.bottom - world.top) / 2;
            const centerOffset = Math.max(Math.abs(px - this.camera.cx) / halfW, Math.abs(py - this.camera.cy) / halfH);
            const zoomError = z < t.zoom_min ? z - t.zoom_min : z > t.zoom_max ? z - t.zoom_max : 0;
            let regionVisible = null;
            if (index === this.targetIndex) {
                const region = this.scenario.region, shown = intersection(region, world);
                let visibleArea = area(shown);
                occ.forEach(o => { visibleArea -= area(intersection(shown, o)); });
                regionVisible = round3(Math.max(0, visibleArea) / area(region));
            }
            const failures = [];
            if (!pointInViewport) failures.push('not_in_view');
            else if (obscuredBy.length) failures.push('obscured');
            if (zoomError < 0) failures.push('zoom_too_low');
            if (zoomError > 0) failures.push('zoom_too_high');
            if (regionVisible !== null && regionVisible < t.min_region_visible) failures.push('region_not_visible');
            return { landmark_id: l.id, zoom: round3(z), zoom_error: round3(zoomError), point_in_viewport: pointInViewport,
                obscured_by: obscuredBy, center_offset_norm: round3(centerOffset), region_visible: regionVisible,
                view_ok: failures.length === 0, failures, viewport_px: { width: round1(v.width), height: round1(v.height) } };
        }
        /* Geometric target events after every camera or overlay change. */
        cameraChanged(nowMs) {
            if (!this.active || this.targetIndex < 0) return;
            const view = this.evaluateView(this.targetIndex);
            const visible = view.point_in_viewport && view.obscured_by.length === 0;
            if (visible && !this.visible) {
                this.c.episodes++;
                if (this.firstVisibleMs === null) this.firstVisibleMs = nowMs;
                this.emit('target_visible', nowMs, { episode: this.c.episodes });
            } else if (!visible && this.visible) {
                this.c.losses++;
                this.emit('target_visibility_lost', nowMs, { reason: view.point_in_viewport ? 'obscured' : 'left_viewport' });
            }
            this.visible = visible;
            if (view.view_ok && !this.qualifying) {
                if (this.firstQualifyingMs === null) { this.firstQualifyingMs = nowMs; this.emit('qualifying_view_reached', nowMs, { zoom: view.zoom, region_visible: view.region_visible }); }
                else { this.c.corrective++; this.emit('corrective_return', nowMs, { zoom: view.zoom, region_visible: view.region_visible }); }
                this.lastQualifyingSinceMs = nowMs;
            } else if (!view.view_ok && this.qualifying) this.emit('qualifying_view_lost', nowMs, { failures: view.failures });
            this.qualifying = view.view_ok;
            if (this.wheelSeg && this.wheelSeg.kind === 'zoom') this.trackOvershoot(this.wheelSeg, nowMs);
            if (this.press && this.press.zoomSegment) this.trackOvershoot(this.press.zoomSegment, nowMs);
        }
        side(z) { return z < this.thresholds.zoom_min ? -1 : z > this.thresholds.zoom_max ? 1 : 0; }
        /* Zoom-range overshoot: one continuous zoom adjustment that starts on one side of the range and exits the other. */
        trackOvershoot(segment, nowMs) {
            const side = this.side(this.camera.zoom);
            if (!segment.overshoot && segment.startSide !== 0 && side === -segment.startSide) {
                segment.overshoot = true;
                this.c.overshoots++;
                this.emit('zoom_range_overshoot', nowMs, { from: segment.startSide < 0 ? 'below' : 'above', zoom: round3(this.camera.zoom) });
            }
        }

        /* ---- phase ---- */
        start(nowMs) {
            if (this.started || this.outcome !== null || !(this.viewWidth > 0) || !finite(nowMs)) return false;
            this.startMs = nowMs; this.lastMs = nowMs;
            Object.assign(this.camera, this.scenario.start);
            this.clampCamera();
            this.phase = 'map';
            this.emit('task_started', nowMs, { scenario_id: this.scenario.id, map_id: this.map.id, requested_landmark_id: this.scenario.landmark });
            this.cameraChanged(nowMs);
            this.feedback = 'Find ' + this.target.name + '.';
            return true;
        }
        beginNavigation(nowMs) { if (!this.navigationStarted) { this.navigationStarted = true; this.emit('navigation_started', nowMs); } }

        /* ---- camera adjustments ---- */
        panBy(dxScreen, dyScreen, nowMs) {
            const before = { cx: this.camera.cx, cy: this.camera.cy }, s = this.scale;
            this.camera.cx += dxScreen / s; this.camera.cy += dyScreen / s;
            this.clampCamera();
            const dx = this.camera.cx - before.cx, dy = this.camera.cy - before.cy;
            this.c.panDistance += Math.hypot(dx / this.map.width, dy / this.map.height);
            for (const [axis, applied] of [['x', dx * s], ['y', dy * s]]) {
                const direction = Math.sign(applied);
                if (direction === 0) continue;
                if (this.panDir[axis] === 0 || direction === this.panDir[axis]) { this.panDir[axis] = direction; this.panOpposite[axis] = 0; continue; }
                this.panOpposite[axis] += Math.abs(applied);
                if (this.panOpposite[axis] >= PAN_REVERSAL_PX) { this.c.panReversals++; this.panDir[axis] = direction; this.panOpposite[axis] = 0; }
            }
            if (dx || dy) this.cameraChanged(nowMs);
            return { dx, dy };
        }
        /* Zoom about a screen anchor: the world point under the anchor stays fixed (clamping permitting). */
        zoomTo(zoom, anchorX, anchorY, nowMs) {
            const before = this.camera.zoom, next = Math.round(clamp(zoom, MIN_ZOOM, MAX_ZOOM) * 1e6) / 1e6;
            if (next === before) return 0;
            const v = this.viewportRect, ax = finite(anchorX) ? anchorX : v.centerX, ay = finite(anchorY) ? anchorY : v.centerY;
            const anchor = this.toWorld(ax, ay);
            this.camera.zoom = next;
            const s = this.scale;
            this.camera.cx = anchor.x - (ax - v.centerX) / s; this.camera.cy = anchor.y - (ay - v.centerY) / s;
            this.clampCamera();
            const change = next - before;
            this.c.zoomChange += Math.abs(change);
            const direction = Math.sign(change);
            if (this.zoomDir === 0 || direction === this.zoomDir) { this.zoomDir = direction; this.zoomOpposite = 0; }
            else {
                this.zoomOpposite += Math.abs(change);
                if (this.zoomOpposite >= ZOOM_REVERSAL_LOG2) { this.c.zoomReversals++; this.zoomDir = direction; this.zoomOpposite = 0; }
            }
            this.cameraChanged(nowMs);
            return change;
        }
        wheel(deltaX, deltaY, ctrlKey, x, y, nowMs) {
            if (!this.active || this.phase !== 'map' || !finite(deltaY) || !this.accept(nowMs)) return;
            if (this.press && this.press.dragging) { this.c.wheelIgnored++; return; }
            const kind = ctrlKey ? 'zoom' : 'pan';
            if (this.wheelSeg && (this.wheelSeg.kind !== kind || nowMs - this.wheelSeg.lastMs > WHEEL_GAP_MS)) this.closeWheel();
            this.lastWheelMs = nowMs;
            if (!this.wheelSeg) {
                this.beginNavigation(nowMs);
                this.wheelSeg = { kind, startMs: nowMs, lastMs: nowMs, zoomFrom: this.camera.zoom, startSide: this.side(this.camera.zoom),
                    overshoot: false, distance: 0, source: ctrlKey ? 'wheel_ctrl' : 'wheel' };
                this.emit(kind + '_started', nowMs, { input_source: this.wheelSeg.source, zoom: round3(this.camera.zoom) });
            }
            this.wheelSeg.lastMs = nowMs;
            if (kind === 'zoom') this.zoomTo(this.camera.zoom - deltaY * WHEEL_ZOOM_PER_PX, x, y, nowMs);
            else { const d = this.panBy(finite(deltaX) ? deltaX : 0, deltaY, nowMs); this.wheelSeg.distance += Math.hypot(d.dx / this.map.width, d.dy / this.map.height); }
        }
        closeWheel(cancelReason = null) {
            const w = this.wheelSeg;
            if (!w) return;
            this.wheelSeg = null;
            const fields = { input_source: w.source, duration_ms: Math.round(w.lastMs - w.startMs), zoom: round3(this.camera.zoom) };
            if (w.kind === 'zoom') Object.assign(fields, { zoom_from: round3(w.zoomFrom), zoom_change_log2: round3(this.camera.zoom - w.zoomFrom), overshoot: w.overshoot });
            else fields.distance_norm = round3(w.distance);
            this.finishGesture(w.kind, cancelReason, cancelReason ? Math.max(this.lastMs, w.lastMs) : w.lastMs, fields);
        }
        finishGesture(kind, cancelReason, nowMs, fields) {
            if (cancelReason) {
                if (kind === 'pan') this.c.panCancels++; else this.c.zoomCancels++;
                this.sinceSubmit.cancelled++;
                this.emit(kind + '_cancelled', nowMs, Object.assign({ reason: cancelReason }, fields));
                return;
            }
            if (kind === 'pan') { this.c.pans++; this.sinceSubmit.pans++; } else { this.c.zooms++; this.sinceSubmit.zooms++; }
            this.emit(kind + '_finished', nowMs, fields);
            // Advice from a failed selection goes stale once the view changes; it never hints whether the view now qualifies.
            if (this.lastSubmission && !this.lastSubmission.success && this.feedbackFromSubmission) {
                this.feedbackFromSubmission = false;
                this.feedback = 'Adjust the view, then choose ' + this.target.name + ' again.';
            }
        }
        tick(nowMs) { if (this.wheelSeg && nowMs - this.wheelSeg.lastMs > WHEEL_GAP_MS) this.closeWheel(); }

        /* ---- cursor path (independent pointer only) ---- */
        trackCursor(x, y) {
            if (!finite(x) || !finite(y)) return;
            if (finite(this.cursorX)) this.cursorTravel += Math.hypot(x - this.cursorX, y - this.cursorY);
            this.cursorX = x; this.cursorY = y; this.cursorObserved = true;
        }
        hover(x, y, nowMs) {
            this.hoverAt = finite(x) && finite(y) ? { x, y } : null;
            if (this.active && this.accept(nowMs)) this.trackCursor(x, y);
        }
        hoverExit() {
            this.hoverAt = null;
            if (this.active && this.cursorObserved) this.cursorGap = true;
            this.cursorX = NaN; this.cursorY = NaN;
        }

        /* ---- pointer: press decides ownership; past the slop a map press becomes a pan ---- */
        pressAt(x, y, nowMs, source) {
            if (!this.active || this.press || !finite(x) || !finite(y) || !this.accept(nowMs)) return;
            this.closeWheel();
            this.c.presses++;
            if (this.lastWheelMs !== null && nowMs - this.lastWheelMs <= ACTIVE_GESTURE_MS) this.c.activeClicks++;
            if (source === 'mouse') this.trackCursor(x, y); else this.directInput = true;
            this.press = { owner: this.targetAt(x, y), source, downX: x, downY: y, lastX: x, lastY: y, dragging: false, travel: 0,
                cameraBefore: Object.assign({}, this.camera), distance: 0 };
        }
        move(x, y, nowMs) {
            const p = this.press;
            if (!p || !this.active) return;
            if (!finite(x) || !finite(y) || !this.accept(nowMs)) { this.cancel(nowMs, 'stale_input'); return; }
            if (p.source === 'mouse') this.trackCursor(x, y);
            p.travel += Math.hypot(x - p.lastX, y - p.lastY);
            const dx = x - p.lastX, dy = y - p.lastY;
            p.lastX = x; p.lastY = y;
            if (!p.owner || p.owner.kind !== 'map') return;
            if (!p.dragging) {
                if (Math.hypot(x - p.downX, y - p.downY) <= this.slopPx) return;
                p.dragging = true; p.startMs = nowMs; p.travel = Math.hypot(x - p.downX, y - p.downY);
                this.beginNavigation(nowMs);
                this.emit('pan_started', nowMs, { input_source: p.source, zoom: round3(this.camera.zoom) });
                // Apply the full offset from the press point, so nothing is lost to the slop.
                const d = this.panBy(-(x - p.downX), -(y - p.downY), nowMs);
                p.distance += Math.hypot(d.dx / this.map.width, d.dy / this.map.height);
                return;
            }
            const d = this.panBy(-dx, -dy, nowMs);
            p.distance += Math.hypot(d.dx / this.map.width, d.dy / this.map.height);
        }
        release(x, y, nowMs) {
            const p = this.press;
            if (!p || !this.active) return;
            if (!finite(x) || !finite(y) || !this.accept(nowMs)) { this.cancel(nowMs, 'stale_input'); return; }
            if (p.source === 'mouse') this.trackCursor(x, y);
            this.press = null;
            if (p.dragging) {
                // A pan release never activates the landmark under it.
                p.travel += Math.hypot(x - p.lastX, y - p.lastY);
                const mouse = p.source === 'mouse';
                if (mouse) this.holdTravel += p.travel; else this.touchHold = true;
                this.finishGesture('pan', null, nowMs, { input_source: p.source, duration_ms: Math.round(nowMs - p.startMs),
                    distance_norm: round3(p.distance), hold_travel_px: mouse ? round1(p.travel) : null, zoom: round3(this.camera.zoom) });
                return;
            }
            const owner = p.owner, under = this.targetAt(x, y);
            if (!owner || owner.kind === 'overview' || owner.kind === 'panel') { this.c.unhandled++; return; }
            if (owner.kind === 'button') {
                if (under && under.kind === 'button' && under.name === owner.name) this.activate(owner.name, nowMs, p.source);
                else this.c.pressNoAction++;
                return;
            }
            if (owner.landmark !== null && owner.landmark !== undefined) {
                const w = this.toWorld(x, y);
                this.open(owner.landmark, nowMs, p.source, { x: w.x, y: w.y, scale: this.scale });
            } else if (this.openIndex !== null) this.closePanel(nowMs, 'map_click', p.source);
            else this.c.unhandled++;
        }
        /* Ends an in-progress gesture without completing it. The camera stays where the gesture left it. */
        cancel(nowMs, reason) {
            const p = this.press;
            this.press = null;
            if (!p || !this.active || !p.dragging) return;
            this.finishGesture('pan', reason, Math.max(nowMs, this.lastMs), { input_source: p.source, distance_norm: round3(p.distance), zoom: round3(this.camera.zoom) });
        }
        interrupt(nowMs, reason) {
            this.cancel(nowMs, reason);
            if (this.wheelSeg) this.closeWheel(reason);
        }
        focusLost(nowMs) {
            if (!this.active) return;
            this.interrupt(nowMs, 'focus_lost');
            this.hoverExit();
        }

        /* ---- controls ---- */
        activate(name, nowMs, source) {
            if (name === 'reset') {
                this.c.resets++;
                Object.assign(this.camera, this.scenario.start);
                this.clampCamera();
                this.emit('view_reset', nowMs, { input_source: source });
                this.cameraChanged(nowMs);
                this.feedback = 'View reset to the starting position.';
            } else if (name === 'zoomIn' || name === 'zoomOut') {
                this.beginNavigation(nowMs);
                const segment = { startSide: this.side(this.camera.zoom), overshoot: false }, from = this.camera.zoom;
                this.emit('zoom_started', nowMs, { input_source: source, control: name, zoom: round3(from) });
                this.zoomTo(from + (name === 'zoomIn' ? BUTTON_ZOOM_STEP : -BUTTON_ZOOM_STEP), NaN, NaN, nowMs);
                this.trackOvershoot(segment, nowMs);
                this.finishGesture('zoom', null, nowMs, { input_source: source, control: name, zoom_from: round3(from),
                    zoom_change_log2: round3(this.camera.zoom - from), zoom: round3(this.camera.zoom), overshoot: segment.overshoot });
            } else if (name === 'close') this.closePanel(nowMs, 'close_button', source);
            else if (name === 'choose') this.submit(nowMs, source);
        }
        open(index, nowMs, source, click) {
            const l = this.map.landmarks[index];
            if (this.openIndex === index) { this.openClick = click; return; }
            if (this.openIndex !== null) this.closePanel(nowMs, 'replaced', source);
            this.openIndex = index; this.openClick = click;
            if (index === this.targetIndex) this.c.targetOpens++; else this.c.distractorOpens++;
            this.emit('landmark_opened', nowMs, { landmark_id: l.id, is_requested: index === this.targetIndex, input_source: source, zoom: round3(this.camera.zoom) });
            this.feedback = l.name + ': ' + l.description;
            this.cameraChanged(nowMs);
        }
        closePanel(nowMs, reason, source) {
            if (this.openIndex === null) return;
            const l = this.openLandmark;
            this.openIndex = null; this.openClick = null;
            this.c.panelCloses++;
            this.emit('landmark_panel_closed', nowMs, { landmark_id: l.id, reason, input_source: source });
            this.cameraChanged(nowMs);
        }
        submit(nowMs, source) {
            const index = this.openIndex, l = this.openLandmark, correct = index === this.targetIndex;
            if (this.lastSubmission && !this.lastSubmission.success) this.c.retries++;
            this.c.submits++;
            const view = this.evaluateView(index), click = this.openClick, s = this.scale;
            const failures = correct ? view.failures.slice() : ['wrong_landmark'];
            const selection = click ? { offset_world: { x: round1(click.x - l.point[0]), y: round1(click.y - l.point[1]) },
                offset_norm: round3(Math.hypot(click.x - l.point[0], click.y - l.point[1]) / (MARKER_HIT_PX / click.scale)),
                in_footprint: inside(l.footprint, click.x, click.y) } : null;
            const invalid = [];
            if (!this.orderingValid) invalid.push('out_of_order_input');
            if (this.resized) invalid.push('resized_during_task');
            const record = deepFreeze({ index: this.submissions.length + this.submissionsDropped, landmark_id: l.id, elapsed_ms: this.elapsed(nowMs),
                correct_landmark: correct, zoom: view.zoom, zoom_error: view.zoom_error, center_offset_norm: view.center_offset_norm,
                region_visible: correct ? view.region_visible : null, missing: correct ? {} : { region_visible: 'wrong_landmark' },
                point_in_viewport: view.point_in_viewport, obscured_by: view.obscured_by, selection,
                success: failures.length === 0, failures, thresholds: this.thresholds, evaluator_version: EVALUATOR_VERSION,
                pans_since_previous: this.sinceSubmit.pans, zooms_since_previous: this.sinceSubmit.zooms,
                cancellations_since_previous: this.sinceSubmit.cancelled, measurement_valid: invalid.length === 0, invalid_reasons: invalid,
                input_source: source, scale_px_per_unit: round3(s) });
            if (this.submissions.length < SUBMISSION_LIMIT) this.submissions.push(record); else this.submissionsDropped++;
            this.lastSubmission = record;
            this.sinceSubmit = { pans: 0, zooms: 0, cancelled: 0 };
            this.emit('selection_submitted', nowMs, { index: record.index, landmark_id: l.id, correct_landmark: correct, success: record.success, failures });
            if (record.success) { this.feedback = '✓ ' + l.name + ' selected.'; this.finish('completed', nowMs); return record; }
            if (!correct) { this.c.incorrect++; this.feedback = "That's " + l.name + ', not ' + this.target.name + '. Close this panel and keep looking.'; }
            else { this.c.framing++; this.feedback = this.framingFeedback(failures); this.feedbackFromSubmission = true; }
            return record;
        }
        framingFeedback(failures) {
            const name = this.target.name;
            if (failures.includes('not_in_view')) return 'Pan back so ' + name + ' is on the map, then choose it again.';
            if (failures.includes('obscured')) return name + ' is hidden under the ' + (this.evaluateView(this.targetIndex).obscured_by[0] || 'panel') + '. Pan the map so it is clear.';
            if (failures.includes('zoom_too_low')) return 'Zoom in more: the entrance (▲) and the street names around ' + name + ' should be visible.';
            if (failures.includes('zoom_too_high')) return 'Zoom out a little so the streets around ' + name + ' fit.';
            return 'Pan so ' + name + ' and the streets around it are in view, not cut off or under the panel.';
        }
        skip(nowMs) { return this.finish('skipped', nowMs); }
        exit(nowMs) { return this.finish('exited', nowMs); }
        finish(outcome, nowMs) {
            if (this.outcome !== null) return false;
            if (!this.started) { this.outcome = outcome; this.phase = 'ended'; this.onEnd(this); return true; }
            const at = Math.max(finite(nowMs) ? nowMs : this.lastMs, this.lastMs);
            this.cancel(at, outcome);
            if (this.wheelSeg) this.closeWheel(outcome === 'completed' ? null : outcome);
            this.phase = 'rating'; this.outcome = outcome; this.endMs = at;
            this.emit(outcome === 'completed' ? 'task_completed' : outcome === 'skipped' ? 'task_skipped' : 'task_exited', at, { duration_ms: this.elapsed(at) });
            this.onEnd(this);
            return true;
        }

        /* ---- results ---- */
        get status() { return this.outcome === 'completed' ? 'completed' : this.started ? 'abandoned' : 'unstarted'; }
        get holdTravelValid() { return !this.touchHold && this.orderingValid; }
        get traceValid() { return this.cursorObserved && !this.cursorGap && !this.directInput && this.orderingValid && !this.resized; }
        summary() {
            const c = this.c, end = this.endMs !== null ? this.endMs : this.lastMs, last = this.lastSubmission, missing = {};
            const since = ms => (ms === null ? null : Math.round(ms - this.startMs));
            const out = {
                duration_ms: this.started ? this.elapsed(end) : null,
                first_visible_ms: since(this.firstVisibleMs), first_qualifying_ms: since(this.firstQualifyingMs),
                qualifying_to_select_ms: this.outcome === 'completed' && this.lastQualifyingSinceMs !== null ? Math.round(this.endMs - this.lastQualifyingSinceMs) : null,
                pan_count: c.pans, zoom_count: c.zooms, pan_cancel_count: c.panCancels, zoom_cancel_count: c.zoomCancels,
                pan_distance_norm: round3(c.panDistance), zoom_change_log2: round3(c.zoomChange),
                pan_reversal_count: c.panReversals, zoom_reversal_count: c.zoomReversals,
                visibility_episode_count: c.episodes, visibility_loss_count: c.losses, zoom_overshoot_count: c.overshoots,
                corrective_return_count: c.corrective, distractor_open_count: c.distractorOpens, target_open_count: c.targetOpens,
                panel_close_count: c.panelCloses, submit_count: c.submits, incorrect_selection_count: c.incorrect,
                framing_failure_count: c.framing, retry_count: c.retries, reset_count: c.resets, unhandled_click_count: c.unhandled,
                active_gesture_click_count: c.activeClicks, press_count: c.presses, button_press_without_action_count: c.pressNoAction,
                wheel_ignored_during_drag_count: c.wheelIgnored, hold_travel_px: null, cursor_distance_px: null,
                final_zoom: null, final_zoom_error: null, final_center_offset_norm: null, final_region_visible: null,
                final_correct_landmark: null, success: this.outcome === 'completed' ? 1 : 0
            };
            if (this.started) {
                if (out.first_visible_ms === null) missing.first_visible_ms = 'never_visible';
                if (out.first_qualifying_ms === null) missing.first_qualifying_ms = 'never_qualifying';
                if (out.qualifying_to_select_ms === null) missing.qualifying_to_select_ms = this.outcome === 'completed' ? 'never_qualifying' : 'not_completed';
                if (this.holdTravelValid) out.hold_travel_px = round1(this.holdTravel);
                else missing.hold_travel_px = this.touchHold ? 'non_cursor_pointer' : 'out_of_order_input';
                if (this.traceValid) out.cursor_distance_px = round1(this.cursorTravel);
                else missing.cursor_distance_px = !this.cursorObserved ? 'no_cursor_observed' : this.directInput ? 'non_cursor_pointer'
                    : this.cursorGap ? 'cursor_left_map' : this.resized ? 'resized' : 'out_of_order_input';
                if (last) {
                    Object.assign(out, { final_zoom: last.zoom, final_zoom_error: Math.abs(last.zoom_error), final_center_offset_norm: last.center_offset_norm,
                        final_region_visible: last.region_visible, final_correct_landmark: last.correct_landmark ? 1 : 0 });
                    if (last.region_visible === null) missing.final_region_visible = 'wrong_landmark';
                } else ['final_zoom', 'final_zoom_error', 'final_center_offset_norm', 'final_region_visible', 'final_correct_landmark'].forEach(k => { missing[k] = 'no_submission'; });
            } else Object.keys(out).forEach(k => { if (out[k] === null) missing[k] = 'not_started'; });
            out.missing = missing;
            return out;
        }
        metrics() {
            const s = this.summary(), out = { measurement_started: this.started ? 1 : 0 };
            if (!this.started) return out;
            const set = (name, v) => { if (v !== null && v !== undefined) out[name] = v; };
            const map = { stp_map_first_visible_ms: s.first_visible_ms, stp_map_first_qualifying_ms: s.first_qualifying_ms,
                stp_map_qualifying_to_select_ms: s.qualifying_to_select_ms, stp_map_pan_count: s.pan_count, stp_map_zoom_count: s.zoom_count,
                stp_map_pan_cancel_count: s.pan_cancel_count, stp_map_zoom_cancel_count: s.zoom_cancel_count,
                stp_map_pan_distance_norm: s.pan_distance_norm, stp_map_zoom_change_log2: s.zoom_change_log2,
                stp_map_pan_reversal_count: s.pan_reversal_count, stp_map_zoom_reversal_count: s.zoom_reversal_count,
                stp_map_visibility_episode_count: s.visibility_episode_count, stp_map_visibility_loss_count: s.visibility_loss_count,
                stp_map_zoom_overshoot_count: s.zoom_overshoot_count, stp_map_corrective_return_count: s.corrective_return_count,
                stp_map_distractor_open_count: s.distractor_open_count, stp_map_target_open_count: s.target_open_count,
                stp_map_panel_close_count: s.panel_close_count, stp_map_submit_count: s.submit_count,
                stp_map_incorrect_selection_count: s.incorrect_selection_count, stp_map_framing_failure_count: s.framing_failure_count,
                stp_map_reset_count: s.reset_count, stp_map_unhandled_click_count: s.unhandled_click_count,
                stp_map_active_gesture_click_count: s.active_gesture_click_count, stp_map_hold_travel_px: s.hold_travel_px,
                stp_map_final_zoom: s.final_zoom, stp_map_final_zoom_error: s.final_zoom_error,
                stp_map_final_center_offset_norm: s.final_center_offset_norm, stp_map_final_region_visible: s.final_region_visible,
                stp_map_success: s.success };
            Object.entries(map).forEach(([k, v]) => set(k, v));
            set('stp_map_cursor_distance_px', s.cursor_distance_px);
            out.clicks_total = s.press_count;
            return out;
        }
        attributes() {
            return { stp_target_kind: 'map_landmark', stp_condition: this.scenario.condition, stp_measurement: 'app_output',
                stp_attempt_source: 'delivered_click', requested_landmark_id: this.scenario.landmark, end_reason: this.outcome || 'open' };
        }
        targetResults(nowMs) {
            if (!this.frozenRow) {
                if (this.outcome === null) this.finish('exited', nowMs);
                this.frozenRow = deepFreeze({ index: 0, count: 1, status: this.status === 'completed' ? 'completed' : 'abandoned',
                    elapsed_ms: this.started ? this.elapsed(this.endMs) : 0, trace_valid: this.started && this.traceValid,
                    metrics: this.metrics(), attributes: this.attributes() });
            }
            return [this.frozenRow];
        }
        /* Existing touchpad observation (jvision/transport.js) for the intent row; null unless completed. */
        intentObservation() {
            if (this.status !== 'completed') return null;
            const m = this.metrics(), details = {
                details_version: 1, target_index: 0, target_count: 1, target_status: 'completed', trace_valid: this.traceValid,
                run_sequence: 1, task_index: 1, interaction: INTERACTION, stp_condition: this.scenario.condition,
                map_eval_v: EVALUATOR_VERSION, qa_path_v: 1,
                qa_path: PATH_FIELDS.map(name => (finite(m[name]) && m[name] >= 0 ? round3(m[name]) : null))
            };
            details.qa_subs_n = this.c.submits;
            details.qa_subs = this.submissions.slice(-3).map(r => [r.correct_landmark ? 1 : 0, r.zoom, r.region_visible, r.success ? 1 : 0]);
            if (bytes(JSON.stringify(details)) > DETAILS_MAX_BYTES) { delete details.qa_subs; details.qa_subs_truncated = true; }
            if (bytes(JSON.stringify(details)) > DETAILS_MAX_BYTES) { delete details.qa_path; details.qa_path_truncated = true; }
            const observation = { version: 1, type: 'touchpad', activity_id: TASK_ID, elapsed_ms: this.elapsed(this.endMs), metric_family: METRIC_FAMILY, details };
            CLICK_COLUMNS.forEach(name => { observation[name] = -1; });
            observation.stp_clicks_target_count = 1;
            observation.stp_clicks_total = m.clicks_total;
            return observation;
        }
        exportPayload() {
            const s = this.scenario;
            const payload = {
                schema_version: SCHEMA_VERSION, task_id: TASK_ID, task_version: TASK_VERSION, protocol_version: PROTOCOL_VERSION,
                run_id: this.runId, scenario_id: s.id, scenario_seed: s.seed, map_id: this.map.id, requested_landmark_id: s.landmark,
                map_size: { width: this.map.width, height: this.map.height }, start_camera: s.start, required_region: s.region,
                evaluator_version: EVALUATOR_VERSION, thresholds: this.thresholds,
                thresholds_note: 'prototype task criteria, not validated STP quality gates',
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

    return { TASK_ID, TASK_VERSION, SCHEMA_VERSION, EVALUATOR_VERSION, PROTOCOL_VERSION, INTERACTION, METRIC_FAMILY, THRESHOLDS,
        MAP, SCENARIOS, PATH_FIELDS, CLICK_COLUMNS, DETAILS_MAX_BYTES, EVENT_LIMIT, SUBMISSION_LIMIT, EXPORT_MAX_BYTES,
        MIN_ZOOM, MAX_ZOOM, BASE_SCALE, MARKER_HIT_PX, DETAIL_ZOOM, LABEL_ZOOM, WHEEL_GAP_MS, BUTTON_ZOOM_STEP, rect, MapLandmarkTrials };
});
