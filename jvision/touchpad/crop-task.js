/* Photo gallery → crop task page. Wheel input scrolls the gallery; in the editor plain wheel (two-finger scroll)
 * pans and ctrl+wheel (browser pinch) zooms. A press decides gesture ownership: handle, crop interior or image pan. */
(function (win) {
    'use strict';
    const Crop = win.SurfaceInputsPhotoCrop, Scenes = win.SurfaceInputsPhotoScenes;
    const doc = win.document;
    const canvas = doc.getElementById('crop-canvas'), ctx = canvas.getContext('2d');
    const startButton = doc.getElementById('crop-start'), skipButton = doc.getElementById('crop-skip'), exitButton = doc.getElementById('crop-exit');
    const TOUCH_SLOP_PX = 8;
    const now = () => win.performance.now();
    let width = 0, height = 0, hover = null, frame = 0, pointerId = null, wheelTimer = 0;

    const state = new Crop.PhotoCropTrials({ onEnd: () => win.setTimeout(showResults, 300) });
    const scenario = state.scenario, target = state.targetPhoto;

    const C = {
        background: 'rgb(25, 30, 38)', toolbar: 'rgb(19, 33, 48)', cell: 'rgb(36, 42, 52)', hover: 'rgb(48, 61, 80)',
        pressed: 'rgb(60, 80, 108)', focus: 'rgb(81, 160, 255)', field: 'rgb(44, 52, 64)', action: 'rgb(247, 190, 72)',
        actionText: 'rgb(28, 24, 16)', text: 'rgb(235, 238, 242)', muted: 'rgb(130, 140, 155)', viewport: 'rgb(14, 17, 22)',
        dim: 'rgba(0, 0, 0, 0.55)', crop: 'rgb(255, 255, 255)', handle: 'rgb(255, 255, 255)', active: 'rgb(77, 185, 165)',
        thumb: 'rgb(90, 104, 124)', reference: 'rgb(242, 232, 208)'
    };
    const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize',
        e: 'ew-resize', w: 'ew-resize', move: 'move', pan: 'grab', button: 'pointer', photo: 'pointer' };
    const BUTTON_LABELS = { back: '‹ Gallery', zoomOut: '−', zoomIn: '+', reset: 'Reset', apply: 'Apply' };

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function text(value, x, y, color, align = 'left') {
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(value, x, y);
        ctx.textAlign = 'left';
    }
    const sameOwner = (a, b) => !!a && !!b && a.kind === b.kind && a.handle === b.handle && a.index === b.index && a.name === b.name;
    /* Hover feedback only when no press is active; the active press owner is highlighted instead. */
    const hovered = () => (state.press ? null : hover ? state.targetAt(hover.x, hover.y) : null);
    const pressedOwner = () => (state.press ? state.press.owner : null);

    function draw() {
        frame = 0;
        const dpr = win.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = C.background;
        ctx.fillRect(0, 0, width, height);
        ctx.font = '14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx.textBaseline = 'middle';
        if (state.phase === 'gallery') drawGallery();
        else if (state.phase === 'editor') drawEditor();
        else {
            const message = state.outcome === 'completed' ? '✓ Crop applied' : state.outcome ? 'Task ended' : 'Select Start to open the gallery.';
            text(message, width / 2, height / 2, C.muted, 'center');
        }
        if (canvas.style) canvas.style.cursor = cursor();
        render();
    }
    function cursor() {
        const owner = pressedOwner() || hovered();
        if (!owner) return 'default';
        if (owner.kind === 'resize') return CURSORS[owner.handle];
        if (owner.kind === 'pan' && state.press && state.press.dragging) return 'grabbing';
        return CURSORS[owner.kind] || 'default';
    }
    function drawGallery() {
        const list = state.listRect;
        ctx.save();
        ctx.beginPath(); ctx.rect(list.left, list.top, list.width, list.height); ctx.clip();
        const photos = state.photos;
        for (let index = 0; index < photos.length; index++) {
            const cell = state.cellRect(index);
            if (cell.bottom < list.top || cell.top > list.bottom) continue;
            const owner = { kind: 'photo', index };
            ctx.fillStyle = sameOwner(pressedOwner(), owner) ? C.pressed : sameOwner(hovered(), owner) ? C.hover : C.cell;
            roundRect(cell.left, cell.top, cell.width, cell.height, 4);
            ctx.fill();
            const thumb = state.thumbnailRect(index), photo = photos[index];
            Scenes.drawPhoto(ctx, photo, thumb.left, thumb.top, thumb.width / photo.width);
            text(photo.label, cell.centerX, cell.bottom - 10, C.muted, 'center');
        }
        ctx.restore();
        const max = state.maxOffset;
        if (max > 0) {
            const thumb = Math.max(24, list.height * list.height / (list.height + max));
            ctx.fillStyle = C.thumb;
            ctx.fillRect(list.right - 4, list.top + (list.height - thumb) * (state.offset / max), 4, thumb);
        }
        ctx.fillStyle = C.toolbar;
        ctx.fillRect(0, 0, width, state.toolbarHeight);
        text('Photos  ·  ' + photos.length + ' items', 12, state.toolbarHeight / 2, C.text);
    }
    function drawButton(name) {
        const r = state.buttonRect(name), owner = { kind: 'button', name };
        const pressed = sameOwner(pressedOwner(), owner), over = sameOwner(hovered(), owner);
        ctx.fillStyle = name === 'apply' ? C.action : pressed ? C.pressed : over ? C.hover : C.field;
        roundRect(r.left, r.top, r.width, r.height, 6);
        ctx.fill();
        if (over || pressed) { ctx.strokeStyle = C.focus; ctx.lineWidth = 2; ctx.stroke(); }
        text(BUTTON_LABELS[name], r.centerX, r.centerY, name === 'apply' ? C.actionText : C.text, 'center');
    }
    function drawEditor() {
        const vp = state.viewportRect, photo = state.openPhoto;
        ctx.fillStyle = C.viewport;
        ctx.fillRect(vp.left, vp.top, vp.width, vp.height);
        const image = state.imageScreenRect();
        Scenes.drawPhoto(ctx, photo, image.left, image.top, state.scale, vp);
        const r = state.cropScreenRect();
        ctx.save();
        ctx.beginPath(); ctx.rect(vp.left, vp.top, vp.width, vp.height); ctx.clip();
        // Dim the image outside the crop.
        ctx.fillStyle = C.dim;
        ctx.fillRect(image.left, image.top, image.width, r.top - image.top);
        ctx.fillRect(image.left, r.bottom, image.width, image.bottom - r.bottom);
        ctx.fillRect(image.left, r.top, r.left - image.left, r.height);
        ctx.fillRect(r.right, r.top, image.right - r.right, r.height);
        const owner = pressedOwner() || hovered();
        const activeMove = owner && owner.kind === 'move';
        ctx.strokeStyle = activeMove ? C.active : C.crop;
        ctx.lineWidth = activeMove ? 3 : 2;
        ctx.strokeRect(r.left, r.top, r.width, r.height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        for (const f of [1 / 3, 2 / 3]) {
            ctx.beginPath(); ctx.moveTo(r.left + r.width * f, r.top); ctx.lineTo(r.left + r.width * f, r.bottom); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(r.left, r.top + r.height * f); ctx.lineTo(r.right, r.top + r.height * f); ctx.stroke();
        }
        for (const handle of Crop.HANDLES) drawHandle(r, handle, owner);
        ctx.restore();
        drawReference();
        ctx.fillStyle = C.toolbar;
        ctx.fillRect(0, 0, width, state.toolbarHeight);
        ['back', 'zoomOut', 'zoomIn', 'reset', 'apply'].forEach(drawButton);
        const zoomOut = state.buttonRect('zoomOut');
        text(Math.round(state.view.zoom * 100) + '%', zoomOut.left - 12, state.toolbarHeight / 2, C.muted, 'right');
        text(photo.label, state.buttonRect('back').right + 16, state.toolbarHeight / 2, C.text);
    }
    function drawHandle(r, handle, owner) {
        const x = handle.includes('w') ? r.left : handle.includes('e') ? r.right : r.centerX;
        const y = handle.includes('n') ? r.top : handle.includes('s') ? r.bottom : r.centerY;
        const active = owner && owner.kind === 'resize' && owner.handle === handle;
        const dragging = active && state.press && state.press.dragging;
        ctx.fillStyle = active ? C.active : C.handle;
        const corner = handle.length === 2, size = dragging ? 14 : active ? 12 : 10;
        if (corner) ctx.fillRect(x - size / 2, y - size / 2, size, size);
        else if (handle === 'n' || handle === 's') ctx.fillRect(x - size * 1.4, y - 3, size * 2.8, 6);
        else ctx.fillRect(x - 3, y - size * 1.4, 6, size * 2.8);
    }
    function drawReference() {
        const panel = state.referenceRect, gap = 8, labelH = 20;
        ctx.fillStyle = C.cell;
        ctx.fillRect(panel.left, panel.top, panel.width, panel.height);
        const half = (panel.height - labelH * 2 - gap * 3) / 2;
        text('Reference', panel.left + 10, panel.top + labelH / 2 + 4, C.reference);
        const refBox = { left: panel.left + gap, top: panel.top + labelH + gap, width: panel.width - gap * 2, height: half };
        Scenes.drawRegion(ctx, target, scenario.target, refBox);
        const yourTop = refBox.top + half + gap;
        text('Your crop', panel.left + 10, yourTop + labelH / 2, C.muted);
        Scenes.drawRegion(ctx, state.openPhoto, state.crop, { left: refBox.left, top: yourTop + labelH, width: refBox.width, height: half });
    }
    function render() {
        doc.getElementById('status').textContent = state.feedback;
        doc.getElementById('counts').textContent = 'Submissions: ' + state.c.submits +
            (state.phase === 'editor' ? ' · Zoom: ' + Math.round(state.view.zoom * 100) + '%' : '');
        startButton.disabled = state.started || state.outcome !== null;
        skipButton.disabled = !state.active;
        exitButton.disabled = state.outcome !== null;
    }
    const redraw = () => { if (!frame) frame = win.requestAnimationFrame(draw); };

    function drawReferenceCanvas() {
        const ref = doc.getElementById('reference-canvas');
        if (!ref || !ref.getContext) return;
        const c = ref.getContext('2d'), dpr = win.devicePixelRatio || 1, size = 160;
        ref.width = size * dpr; ref.height = size * dpr;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = C.viewport;
        c.fillRect(0, 0, size, size);
        Scenes.drawRegion(c, target, scenario.target, { left: 4, top: 4, width: size - 8, height: size - 8 });
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
    // Events stamped before the task started or in the future are stale and cancel the gesture.
    function stale(event) {
        const t = now();
        return event.timeStamp > t + 1 || (state.startMs !== null && event.timeStamp < state.startMs - 1);
    }
    function cancel(reason) { pointerId = null; state.cancel(now(), reason); redraw(); }

    canvas.addEventListener('wheel', event => {
        if (!state.active) return;
        event.preventDefault();
        if (stale(event)) { cancel('stale_input'); return; }
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
        const p = local(event);
        state.wheel(event.deltaX * unit, event.deltaY * unit, !!event.ctrlKey, p.x, p.y, now());
        win.clearTimeout(wheelTimer);
        wheelTimer = win.setTimeout(() => { state.tick(now()); redraw(); }, Crop.WHEEL_GAP_MS + 50);
        redraw();
    }, { passive: false });
    canvas.addEventListener('pointerdown', event => {
        if (!state.active) return;
        if (stale(event)) { cancel('stale_input'); return; }
        // A second pointer means the gesture is no longer single-pointer; cancel instead of competing.
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
            hover = event.pointerType === 'mouse' ? p : null;
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
        hover = event.pointerType === 'mouse' ? p : null;
        redraw();
    });
    canvas.addEventListener('pointercancel', event => { if (event.pointerId === pointerId) cancel('pointer_cancel'); });
    canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === pointerId) cancel('lost_capture'); });
    canvas.addEventListener('pointerleave', () => { hover = null; redraw(); });
    const focusLost = () => { pointerId = null; state.focusLost(now()); redraw(); };
    win.addEventListener('blur', focusLost);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) focusLost(); });

    startButton.addEventListener('click', () => { if (state.start(now())) { hover = null; redraw(); } });
    skipButton.addEventListener('click', () => { state.skip(now()); redraw(); });
    exitButton.addEventListener('click', () => { state.exit(now()); redraw(); });

    /* ---------- results, telemetry and rating (after the interaction timer has stopped) ---------- */
    const pct = v => (v === null || v === undefined ? 'unavailable' : (v * 100).toFixed(1) + '%');
    const secs = ms => (ms === null || ms === undefined ? 'unavailable' : (ms / 1000).toFixed(1) + ' s');
    function resultsText(payload) {
        const s = payload.summary, a = s.completed_adjustments, x = s.cancelled_adjustments;
        const resizes = Crop.HANDLES.map(h => h + ' ' + a['resize_' + h]).join(', ');
        const lines = [
            'Outcome: ' + (payload.status === 'completed' ? 'completed' : payload.status === 'unstarted' ? 'not started' : 'ended (' + payload.end_reason + ')') +
                (s.duration_ms !== null ? ' in ' + secs(s.duration_ms) : ''),
            'Time: gallery ' + secs(s.gallery_ms) + ' · other photos ' + secs(s.other_photo_ms) + ' · editor ' + secs(s.editor_ms) +
                ' · recovery after failed Apply ' + secs(s.recovery_ms),
            'Navigation: ' + s.photo_open_count + ' photo opens (' + s.wrong_photo_open_count + ' not requested) · ' + s.backtrack_count + ' returns to gallery',
            'Gallery scrolling: ' + Math.round(s.scroll_distance_px) + ' px · ' + s.scroll_reversal_count + ' reversals · ' +
                (s.scroll_overshoot_count === null ? 'overshoot unavailable' : s.scroll_overshoot_count + ' overshoots') + ' · ' +
                s.scroll_click_count + ' clicks while scrolling',
            'Adjustments: move ' + a.move + ', pan ' + a.pan + ', zoom ' + a.zoom + ', resize ' + resizes,
            'Cancelled: ' + Object.values(x).reduce((sum, v) => sum + v, 0) + ' · resets ' + s.reset_count + ' · unhandled clicks ' + s.unhandled_click_count +
                ' · presses on the crop without dragging ' + s.press_without_drag_count,
            'Cursor travel while holding: ' + (s.hold_travel_px === null ? 'unavailable (' + s.missing.hold_travel_px + ')' : Math.round(s.hold_travel_px) + ' px')
        ];
        lines.push('Submissions (' + s.submit_count + ', ' + s.failed_submit_count + ' unsuccessful):');
        if (!payload.submissions.length) lines.push('  none');
        payload.submissions.forEach(r => {
            lines.push('  #' + (r.index + 1) + ' at ' + secs(r.elapsed_ms) + ': ' + (r.success ? 'success' : 'not accepted (' + r.failures.join(', ') + ')') +
                (r.is_target_photo ? ' · IoU ' + pct(r.iou) + ' · backpack visible ' + pct(r.subject_coverage) + ' · extra area ' + pct(r.excess_ratio) +
                    ' · mean edge error ' + pct(r.mean_edge_error_norm) : ' · wrong photo (' + r.image_id + ')') +
                (r.measurement_valid ? '' : ' · coverage invalid: ' + r.invalid_reasons.join(', ')));
        });
        const missing = Object.entries(s.missing);
        lines.push('Missing data: ' + (missing.length ? missing.map(([k, v]) => k + ' (' + v + ')').join(', ') : 'none'));
        if (payload.events_truncated) lines.push('Events truncated: ' + payload.events_dropped + ' dropped');
        return lines.join('\n');
    }
    function sendTelemetry(observation) {
        const transport = win.SurfaceInputsTransport;
        if (!observation) return 'Nothing to send: only completed runs produce a telemetry row (abandoned and unstarted runs stay local).';
        if (!transport || !transport.isNative || !transport.isNative()) {
            return 'Browser mode: no native host is connected, so nothing was uploaded. This is the row a native host would receive.';
        }
        try {
            transport.enqueue(observation);
            return 'Queued on the native transport; waiting for the sink to acknowledge.';
        } catch (failure) {
            return 'Native transport rejected the row: ' + failure.message;
        }
    }
    function showResults() {
        const rows = state.targetResults(now());
        const payload = state.exportPayload();
        win.SurfaceInputsPathResults.complete(Crop.TASK_ID, 'Photo crop', rows, { telemetry: payload });
        doc.getElementById('completion-title').textContent = payload.status === 'completed' ? 'Photo crop complete'
            : payload.status === 'unstarted' ? 'Photo crop not started' : 'Photo crop ended';
        doc.getElementById('crop-results').textContent = resultsText(payload);
        doc.getElementById('telemetry-status').textContent = sendTelemetry(payload.intent_observation);
        doc.getElementById('crop-telemetry').textContent = payload.intent_observation
            ? '{\n' + Object.entries(payload.intent_observation).map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(v)).join(',\n') + '\n}' : '';
        redraw();
    }

    doc.getElementById('crop-prompt').textContent = scenario.prompt;
    state.feedback = 'Read the instructions, then select Start.';
    drawReferenceCanvas();
    new win.ResizeObserver(resize).observe(canvas);
    resize();
})(window);
