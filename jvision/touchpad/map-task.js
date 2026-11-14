/* Map landmark task page. Drag or two-finger scroll pans; ctrl+wheel (browser pinch) zooms about the cursor and
 * −/+ zoom about the viewport center. A press that moves past the slop pans and never opens a landmark. */
(function (win) {
    'use strict';
    const Task = win.SurfaceInputsMapLandmark, Render = win.SurfaceInputsMapRender;
    const doc = win.document;
    const canvas = doc.getElementById('map-canvas'), ctx = canvas.getContext('2d');
    const startButton = doc.getElementById('map-start'), skipButton = doc.getElementById('map-skip'), exitButton = doc.getElementById('map-exit');
    const TOUCH_SLOP_PX = 8;
    const now = () => win.performance.now();
    let width = 0, height = 0, frame = 0, pointerId = null, wheelTimer = 0;

    const state = new Task.MapLandmarkTrials({ onEnd: () => win.setTimeout(showResults, 300) });
    const map = state.map, scenario = state.scenario;
    const C = { toolbar: 'rgb(19, 33, 48)', field: 'rgb(44, 52, 64)', hover: 'rgb(48, 61, 80)', pressed: 'rgb(60, 80, 108)',
        focus: 'rgb(81, 160, 255)', action: 'rgb(247, 190, 72)', actionText: 'rgb(28, 24, 16)', text: 'rgb(235, 238, 242)',
        muted: 'rgb(130, 140, 155)', panel: 'rgba(20, 28, 38, 0.94)', chip: 'rgba(20, 28, 38, 0.8)' };
    const LABELS = { reset: 'Reset view', zoomOut: '−', zoomIn: '+', choose: 'Choose this landmark', close: '×' };

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function text(value, x, y, color, align = 'left', font = '14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif') {
        ctx.font = font;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(value, x, y);
        ctx.textAlign = 'left';
    }
    /* Hover feedback only without an active press. */
    const hovered = () => (state.press || !state.hoverAt ? null : state.targetAt(state.hoverAt.x, state.hoverAt.y));
    const pressedOwner = () => (state.press ? state.press.owner : null);
    function view(target = state) {
        return { scale: target.scale, zoom: target.camera.zoom, toScreen: (x, y) => target.toScreen(x, y), pin: i => target.pinScreen(i),
            world: target.visibleWorldRect(), viewport: target.viewportRect };
    }

    function draw() {
        frame = 0;
        const dpr = win.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = 'rgb(25, 30, 38)';
        ctx.fillRect(0, 0, width, height);
        if (state.phase === 'map') drawMapPhase();
        else {
            const message = state.outcome === 'completed' ? '✓ All ' + state.targetCount + ' landmarks selected' : state.outcome ? 'Task ended' : 'Select Start to open the map.';
            text(message, width / 2, height / 2, C.muted, 'center');
        }
        if (canvas.style) canvas.style.cursor = cursor();
        render();
    }
    function cursor() {
        if (state.press && state.press.dragging) return 'grabbing';
        const owner = hovered();
        if (!owner) return 'default';
        if (owner.kind === 'button' || (owner.kind === 'map' && owner.landmark !== null)) return 'pointer';
        return owner.kind === 'map' ? 'grab' : 'default';
    }
    function drawMapPhase() {
        const owner = hovered(), dragging = state.press && state.press.dragging;
        Render.drawMap(ctx, map, view(), { hover: owner && owner.kind === 'map' ? owner.landmark : null, open: state.openIndex,
            done: state.targetOrder.slice(0, state.step), detailZoom: Task.DETAIL_ZOOM, labelZoom: Task.LABEL_ZOOM });
        Render.drawOverview(ctx, map, state.overviewRect, state.visibleWorldRect());
        if (dragging) {
            const v = state.viewportRect;
            ctx.fillStyle = C.chip; roundRect(v.left + 8, v.top + 8, 92, 26, 13); ctx.fill();
            text('✥ Panning', v.left + 54, v.top + 21, C.text, 'center', '13px system-ui, sans-serif');
        }
        if (state.openIndex !== null) drawPanel();
        ctx.fillStyle = C.toolbar;
        ctx.fillRect(0, 0, width, state.toolbarHeight);
        ['reset', 'zoomOut', 'zoomIn'].forEach(drawButton);
        text('Zoom ' + state.camera.zoom.toFixed(1), state.buttonRect('zoomOut').left - 12, state.toolbarHeight / 2, C.muted, 'right');
        text('Find (' + (state.step + 1) + '/' + state.targetCount + '): ' + state.target.name, state.buttonRect('reset').right + 16, state.toolbarHeight / 2, C.text);
    }
    function drawButton(name) {
        const r = state.buttonRect(name), owner = { kind: 'button', name };
        const same = o => !!o && o.kind === 'button' && o.name === name;
        const pressed = same(pressedOwner()), over = same(hovered());
        ctx.fillStyle = name === 'choose' ? C.action : pressed ? C.pressed : over ? C.hover : C.field;
        roundRect(r.left, r.top, r.width, r.height, 6);
        ctx.fill();
        if (over || pressed) { ctx.strokeStyle = C.focus; ctx.lineWidth = 2; ctx.stroke(); }
        text(LABELS[owner.name], r.centerX, r.centerY, name === 'choose' ? C.actionText : C.text, 'center',
            name === 'choose' ? 'bold 14px system-ui, sans-serif' : '14px system-ui, sans-serif');
    }
    function drawPanel() {
        const p = state.panelRect, l = state.openLandmark;
        ctx.fillStyle = C.panel;
        roundRect(p.left, p.top, p.width, p.height, 8);
        ctx.fill();
        ctx.fillStyle = Render.kindColor(l.kind);
        ctx.fillRect(p.left, p.top + 8, 4, p.height - 16);
        text(l.name, p.left + 14, p.top + 20, C.text, 'left', 'bold 15px system-ui, sans-serif');
        // Wrap the description to the panel width (two lines at most).
        ctx.font = '12px system-ui, sans-serif';
        const words = (l.kind.charAt(0).toUpperCase() + l.kind.slice(1) + ' · ' + l.description).split(' '), lines = [''];
        for (const word of words) {
            const next = (lines[lines.length - 1] + ' ' + word).trim();
            if (ctx.measureText(next).width > p.width - 28 && lines[lines.length - 1]) lines.push(word);
            else lines[lines.length - 1] = next;
        }
        lines.slice(0, 2).forEach((line, i) => text(line, p.left + 14, p.top + 40 + i * 15, C.muted, 'left', '12px system-ui, sans-serif'));
        drawButton('choose');
        drawButton('close');
    }
    function render() {
        doc.getElementById('status').textContent = state.feedback;
        doc.getElementById('counts').textContent = (state.phase === 'map' ? 'Landmark ' + (state.step + 1) + ' of ' + state.targetCount + ' · ' : '') +
            'Selections: ' + state.c.submits + (state.phase === 'map' ? ' · Zoom ' + state.camera.zoom.toFixed(1) : '');
        if (shownStep !== state.step) { shownStep = state.step; describeTarget(); }
        startButton.disabled = state.started || state.outcome !== null;
        skipButton.disabled = !state.active;
        exitButton.disabled = state.outcome !== null;
    }
    const redraw = () => { if (!frame) frame = win.requestAnimationFrame(draw); };
    /* Brief and reference for the landmark in progress; they change when a selection succeeds. */
    let shownStep = -1;
    function describeTarget() {
        const spec = state.targetSpec, target = state.target;
        doc.getElementById('map-target').textContent = 'Landmark ' + (state.step + 1) + ' of ' + state.targetCount + ': ' + target.name + '. ' + spec.hint;
        const ref = doc.getElementById('reference-canvas');
        if (ref && ref.setAttribute) ref.setAttribute('aria-label', 'Reference: ' + target.name + ' at street level, with its entrance (▲) and nearby streets');
        drawReference();
    }

    /* Reference thumbnail: the required region at the middle of the accepted zoom range. */
    function drawReference() {
        const ref = doc.getElementById('reference-canvas');
        if (!ref || !ref.getContext) return;
        const c = ref.getContext('2d'), dpr = win.devicePixelRatio || 1, size = 160, region = state.targetSpec.region;
        ref.width = size * dpr; ref.height = size * dpr;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const scale = size / Math.max(region.right - region.left, region.bottom - region.top);
        const cx = (region.left + region.right) / 2, cy = (region.top + region.bottom) / 2;
        const toScreen = (x, y) => ({ x: size / 2 + (x - cx) * scale, y: size / 2 + (y - cy) * scale });
        const zoom = Math.log2(scale / Task.BASE_SCALE);
        const index = state.targetIndex, target = map.landmarks[index];
        const pin = i => {
            const l = map.landmarks[i], p = toScreen(l.point[0], l.point[1]);
            const raised = l.kind !== 'park' && l.kind !== 'bridge';
            return { x: p.x, y: raised ? p.y - 16 : p.y, entrance: raised ? p : null };
        };
        Render.drawMap(c, map, { scale, zoom: Math.max(zoom, Task.DETAIL_ZOOM), toScreen, pin,
            world: { left: cx - size / 2 / scale, top: cy - size / 2 / scale, right: cx + size / 2 / scale, bottom: cy + size / 2 / scale },
            viewport: Task.rect(0, 0, size, size) }, { hover: null, open: index, detailZoom: Task.DETAIL_ZOOM, labelZoom: 99 });
        c.font = 'bold 11px system-ui, sans-serif'; c.fillStyle = '#1f1f1f'; c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillText(target.name, size / 2, 4);
    }

    function resize() {
        const r = canvas.getBoundingClientRect(), dpr = win.devicePixelRatio || 1;
        width = r.width; height = r.height;
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
        state.geometry(width, height, TOUCH_SLOP_PX);
        draw();
    }
    function local(event) {
        const r = canvas.getBoundingClientRect();
        return { x: event.clientX - r.left, y: event.clientY - r.top };
    }
    function stale(event) {
        const t = now();
        return event.timeStamp > t + 1 || (state.startMs !== null && event.timeStamp < state.startMs - 1);
    }
    function cancel(reason) { pointerId = null; state.cancel(now(), reason); redraw(); }

    canvas.addEventListener('wheel', event => {
        if (!state.active) return;
        event.preventDefault();
        if (stale(event)) { cancel('stale_input'); return; }
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1, p = local(event);
        state.wheel(event.deltaX * unit, event.deltaY * unit, !!event.ctrlKey, p.x, p.y, now());
        win.clearTimeout(wheelTimer);
        wheelTimer = win.setTimeout(() => { state.tick(now()); redraw(); }, Task.WHEEL_GAP_MS + 50);
        redraw();
    }, { passive: false });
    canvas.addEventListener('pointerdown', event => {
        if (!state.active) return;
        if (stale(event)) { cancel('stale_input'); return; }
        if (!event.isPrimary || pointerId !== null) { cancel('second_pointer'); return; }
        if (event.button !== 0) return;
        const p = local(event);
        pointerId = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
        state.pressAt(p.x, p.y, now(), event.pointerType || 'unknown');
        redraw();
    });
    canvas.addEventListener('pointermove', event => {
        const p = local(event);
        if (pointerId === null) {
            if (event.pointerType === 'mouse' && !stale(event)) state.hover(p.x, p.y, now());
            redraw();
            return;
        }
        if (event.pointerId !== pointerId) return;
        if (stale(event)) { cancel('stale_input'); return; }
        state.move(p.x, p.y, now());
        redraw();
    });
    canvas.addEventListener('pointerup', event => {
        if (event.pointerId !== pointerId) return;
        pointerId = null;
        if (stale(event)) { state.cancel(now(), 'stale_input'); redraw(); return; }
        const p = local(event);
        state.release(p.x, p.y, now());
        redraw();
    });
    canvas.addEventListener('pointercancel', event => { if (event.pointerId === pointerId) cancel('pointer_cancel'); });
    canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === pointerId) cancel('lost_capture'); });
    canvas.addEventListener('pointerleave', () => { if (pointerId === null) state.hoverExit(); redraw(); });
    const focusLost = () => { pointerId = null; state.focusLost(now()); redraw(); };
    win.addEventListener('blur', focusLost);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) focusLost(); });

    startButton.addEventListener('click', () => { if (state.start(now())) redraw(); });
    skipButton.addEventListener('click', () => { state.skip(now()); redraw(); });
    exitButton.addEventListener('click', () => { state.exit(now()); redraw(); });

    /* ---------- results, telemetry and rating (after the interaction timer stops) ---------- */
    const secs = ms => (ms === null || ms === undefined ? 'unavailable' : (ms / 1000).toFixed(1) + ' s');
    const pct = v => (v === null || v === undefined ? 'unavailable' : (v * 100).toFixed(0) + '%');
    function targetLines(target, submissions) {
        const s = target.summary, name = map.landmarks.find(l => l.id === target.landmark_id).name;
        const head = (target.target_index + 1) + '. ' + name + ': ';
        if (!s) return [head + 'not reached'];
        const lines = [
            head + (target.status === 'completed' ? 'selected' : 'not selected') + ' in ' + secs(s.duration_ms) +
                ' · first visible ' + secs(s.first_visible_ms) + ' · first qualifying view ' + secs(s.first_qualifying_ms) +
                ' · qualifying view to success ' + secs(s.qualifying_to_select_ms),
            '   Zoom: started at ' + s.start_zoom.toFixed(2) + ', lowest while searching ' + s.search_min_zoom.toFixed(2) + ' · ' +
                s.zoom_count + ' gestures (' + s.zoom_cancel_count + ' cancelled), ' + s.zoom_change_log2.toFixed(2) + ' levels, ' +
                s.zoom_reversal_count + ' reversals, ' + s.zoom_overshoot_count + ' range overshoots',
            '   Pan: ' + s.pan_count + ' gestures (' + s.pan_cancel_count + ' cancelled), ' + s.pan_distance_norm.toFixed(2) + ' map-widths, ' +
                s.pan_reversal_count + ' reversals · visibility ' + s.visibility_episode_count + ' episodes, ' + s.visibility_loss_count +
                ' losses, ' + s.corrective_return_count + ' corrective returns',
            '   Exploration: ' + s.distractor_open_count + ' other landmarks opened, ' + s.panel_close_count + ' panels closed · resets ' +
                s.reset_count + ' · unhandled clicks ' + s.unhandled_click_count + ' · clicks during an active pan/zoom ' + s.active_gesture_click_count +
                ' · cursor travel while holding ' + (s.hold_travel_px === null ? 'unavailable (' + s.missing.hold_travel_px + ')' : Math.round(s.hold_travel_px) + ' px'),
            '   Selections (' + s.submit_count + '; ' + s.incorrect_selection_count + ' wrong landmark, ' + s.framing_failure_count + ' unsuitable view):'
        ];
        const mine = submissions.filter(r => r.target_index === target.target_index);
        if (!mine.length) lines.push('     none');
        mine.forEach(r => {
            lines.push('     #' + (r.index + 1) + ' at ' + secs(r.elapsed_ms) + ': ' + r.landmark_id + ' · ' + (r.success ? 'success' : 'not accepted (' + r.failures.join(', ') + ')') +
                ' · zoom ' + r.zoom.toFixed(2) + (r.zoom_error ? ' (off by ' + Math.abs(r.zoom_error).toFixed(2) + ')' : '') +
                ' · offset ' + r.center_offset_norm.toFixed(2) + (r.region_visible === null ? '' : ' · region visible ' + pct(r.region_visible)) +
                (r.measurement_valid ? '' : ' · coverage invalid: ' + r.invalid_reasons.join(', ')));
        });
        const missing = Object.entries(s.missing);
        lines.push('   Missing data: ' + (missing.length ? missing.map(([k, v]) => k + ' (' + v + ')').join(', ') : 'none'));
        return lines;
    }
    function resultsText(payload) {
        let lines = ['Outcome: ' + (payload.status === 'completed' ? 'completed' : payload.status === 'unstarted' ? 'not started' : 'ended (' + payload.end_reason + ')') +
            (payload.duration_ms !== null ? ' in ' + secs(payload.duration_ms) : '') + ' · ' + payload.targets_completed + ' of ' + payload.target_count + ' landmarks selected'];
        payload.targets.forEach(target => { lines = lines.concat(targetLines(target, payload.submissions)); });
        if (payload.events_truncated) lines.push('Events truncated: ' + payload.events_dropped + ' dropped');
        return lines.join('\n');
    }
    function sendTelemetry(observations) {
        const transport = win.SurfaceInputsTransport;
        if (!observations.length) return 'Nothing to send: only completed landmarks produce a telemetry row (abandoned and unstarted ones stay local).';
        const rows = observations.length === 1 ? '1 row' : observations.length + ' rows';
        if (!transport || !transport.isNative || !transport.isNative()) return 'Browser mode: no native host is connected, so nothing was uploaded. These are the ' + rows + ' a native host would receive, one per selected landmark.';
        try { observations.forEach(o => transport.enqueue(o)); return 'Queued ' + rows + ' on the native transport; waiting for the sink to acknowledge.'; }
        catch (failure) { return 'Native transport rejected a row: ' + failure.message; }
    }
    const rowText = o => '{\n' + Object.entries(o).map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(v)).join(',\n') + '\n}';
    function showResults() {
        const rows = state.targetResults(now()), payload = state.exportPayload();
        win.SurfaceInputsPathResults.complete(Task.TASK_ID, 'Map landmark', rows, { telemetry: payload });
        doc.getElementById('completion-title').textContent = payload.status === 'completed' ? 'Map landmarks complete'
            : payload.status === 'unstarted' ? 'Map landmarks not started' : 'Map landmarks ended';
        doc.getElementById('map-results').textContent = resultsText(payload);
        doc.getElementById('telemetry-status').textContent = sendTelemetry(payload.intent_observations);
        doc.getElementById('map-telemetry').textContent = payload.intent_observations.length
            ? '[\n' + payload.intent_observations.map(rowText).join(',\n') + '\n]' : '';
        redraw();
    }

    doc.getElementById('map-prompt').textContent = scenario.prompt;
    describeTarget();
    shownStep = state.step;
    new win.ResizeObserver(resize).observe(canvas);
    resize();
})(window);
