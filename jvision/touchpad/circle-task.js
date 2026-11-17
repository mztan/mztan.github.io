/* Freeform circle drawing pad for drift measurement. The participant clicks the blue start point,
 * then circles continuously. Every mouse-type sample after the start click is drawn and kept,
 * wherever it goes; nothing interrupts or resets the run. Clicks are logged and marked with a red
 * X, leaving the pad or losing focus only breaks the drawn stroke, and touch, pen or stale events
 * are counted but not drawn. The run ends after six laps or when Finish is pressed. */
(function (win) {
    'use strict';
    const { CircleTrials } = win.SurfaceInputsPathTasks;
    const doc = win.document;
    const canvas = doc.getElementById('circle-canvas');
    const ctx = canvas.getContext('2d');
    const finishButton = doc.getElementById('finish');
    const STALE_MS = 250;
    const now = () => win.performance.now();
    let width = 0, height = 0, finished = false, frame = 0;
    // Every primary press on the canvas other than the start click, kept relative to the reference
    // circle so marks survive resizes.
    const clicks = [], pageStart = now();

    const state = new CircleTrials(at => done(at));

    function done(at) {
        if (finished) return;
        finished = true;
        const rows = state.targetResults(at);
        redraw();
        win.setTimeout(() => win.SurfaceInputsPathResults.complete('stp_circle_tracing', 'Circles', rows, {
            clicks: clicks.map(({ x, y, t_ms, lap, in_lap }) => ({ x, y, t_ms, lap, in_lap })),
            drift: state.summary,
            path: state.exportPath()
        }), 300);
    }

    // The marker sits at 3 o'clock, where clockwise travel (y down) is straight down the
    // screen, so the arrow points down, along the circle's tangent.
    function drawClockwiseArrow(mx, my, m) {
        ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
        ctx.lineWidth = Math.max(2, m * 0.22); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(mx, my - m * 0.55); ctx.lineTo(mx, my + m * 0.1); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx - m * 0.42, my + m * 0.02);
        ctx.lineTo(mx + m * 0.42, my + m * 0.02);
        ctx.lineTo(mx, my + m * 0.62);
        ctx.closePath(); ctx.fill();
    }

    function drawClickMark(x, y, size) {
        ctx.strokeStyle = 'rgb(230, 61, 46)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - size, y - size); ctx.lineTo(x + size, y + size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + size, y - size); ctx.lineTo(x - size, y + size); ctx.stroke();
    }

    // Draws points [from, to] as one polyline, lifting the pen where the cursor re-entered the pad.
    function drawStroke(from, to, style, cx, cy, r) {
        if (to <= from) return;
        const pts = state.points;
        ctx.strokeStyle = style; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + pts[from].u * r, cy + pts[from].v * r);
        for (let i = from + 1; i <= to; i++) {
            const x = cx + pts[i].u * r, y = cy + pts[i].v * r;
            if (pts[i].gap) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    function draw() {
        frame = 0;
        const dpr = win.devicePixelRatio || 1, r = state.radius, cx = state.centerX, cy = state.centerY;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = 'rgb(25, 30, 38)';
        ctx.fillRect(0, 0, width, height);
        if (r > 0) {
            // Guide only: a faint reference circle and center cross. The drawn path is never constrained to it.
            if (ctx.setLineDash) ctx.setLineDash([6, 8]);
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(175, 197, 222, 0.45)';
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
            if (ctx.setLineDash) ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(175, 197, 222, 0.6)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();

            // Completed laps dimmed, the lap in progress bright.
            state.laps.forEach(lap => drawStroke(lap.from, lap.to, 'rgba(105, 221, 197, 0.45)', cx, cy, r));
            if (state.started && !state.allCompleted) drawStroke(state.lapFrom, state.points.length - 1, 'rgb(105, 221, 197)', cx, cy, r);

            const m = r * state.markerRatio;
            if (!state.started) {
                ctx.fillStyle = 'rgb(81, 160, 255)';
                ctx.beginPath(); ctx.arc(cx + r, cy, m, 0, 2 * Math.PI); ctx.fill();
                drawClockwiseArrow(cx + r, cy, m);
                ctx.fillStyle = '#fff'; ctx.font = '15px system-ui, sans-serif';
                ctx.textBaseline = 'middle';
                const label = 'Click to start', labelWidth = ctx.measureText ? ctx.measureText(label).width : 100;
                if (cx + r + m + 8 + labelWidth <= width - 4) {
                    ctx.textAlign = 'left'; ctx.fillText(label, cx + r + m + 8, cy);
                } else {
                    // Narrow pad: no room beside the marker, so center the label under it, kept on screen.
                    ctx.textAlign = 'center';
                    ctx.fillText(label, Math.min(cx + r, width - 4 - labelWidth / 2), cy + m + 14);
                }
            } else {
                ctx.strokeStyle = 'rgba(81, 160, 255, 0.8)'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(cx + r, cy, m, 0, 2 * Math.PI); ctx.stroke();
                const last = state.points[state.points.length - 1];
                if (last && !finished) {
                    ctx.fillStyle = 'rgb(105, 221, 197)';
                    ctx.beginPath(); ctx.arc(cx + last.u * r, cy + last.v * r, 4, 0, 2 * Math.PI); ctx.fill();
                }
            }

            // After the run: each lap's fitted center, joined in order, shows the drift path.
            if (finished) {
                const centers = state.laps.filter(l => l.fit).map(l => [cx + l.fit.u * r, cy + l.fit.v * r]);
                if (centers.length > 1) {
                    ctx.strokeStyle = 'rgb(234, 195, 111)'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(centers[0][0], centers[0][1]);
                    centers.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
                    ctx.stroke();
                }
                ctx.fillStyle = 'rgb(234, 195, 111)';
                centers.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 2 * Math.PI); ctx.fill(); });
            }

            const size = Math.max(6, r * 0.04);
            clicks.forEach(c => drawClickMark(cx + c.nx * r, cy + c.ny * r, size));
        }
        finishButton.disabled = finished || !state.started;
        doc.getElementById('status').textContent = state.feedback;
        doc.getElementById('laps').textContent = 'Laps · ' + state.completedLaps + ' of ' + state.lapCount + ' complete';
        doc.getElementById('clicks').textContent = 'Clicks: ' + clicks.length;
        // Drift numbers are only shown once the run is over, so they can't steer the drawing.
        const s = finished ? state.summary : null;
        doc.getElementById('last-lap').textContent = s && s.center_drift_total_px !== undefined
            ? 'Center drift: ' + s.center_drift_total_px.toFixed(1) + ' px over ' + s.laps_completed + ' laps · radius change: '
                + (s.lap_radii_px[s.lap_radii_px.length - 1] - s.lap_radii_px[0]).toFixed(1) + ' px'
            : '';
    }
    const redraw = () => { if (!frame) frame = win.requestAnimationFrame(draw); };

    function resize() {
        const rect = canvas.getBoundingClientRect(), dpr = win.devicePixelRatio || 1;
        width = rect.width; height = rect.height;
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
        state.geometry(width / 2, height / 2, Math.min(width, height) * 0.36);
        draw();
    }
    const stale = event => { const t = now(); return event.timeStamp > t + 1 || event.timeStamp < t - STALE_MS; };
    const local = event => { const rect = canvas.getBoundingClientRect(); return [event.clientX - rect.left, event.clientY - rect.top]; };
    const leave = () => { if (!finished) { state.leave(); redraw(); } };

    canvas.addEventListener('pointermove', event => {
        if (finished) return;
        if (event.pointerType !== 'mouse' || stale(event)) { state.ignore(); return; }
        const [x, y] = local(event);
        state.move(x, y, now());
        redraw();
    });
    canvas.addEventListener('pointerdown', event => {
        if (finished) return;
        if (event.pointerType !== 'mouse' || !event.isPrimary || stale(event)) { state.ignore(); return; }
        if (event.button !== 0) return;
        const [x, y] = local(event);
        const inLap = state.started;
        const kind = state.press(x, y, now());
        if (kind === 'click') {
            // Logged and marked; the run carries on.
            clicks.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, t_ms: Math.round(now() - pageStart),
                lap: state.completedLaps + 1, in_lap: inLap,
                nx: (x - state.centerX) / state.radius, ny: (y - state.centerY) / state.radius });
        }
        redraw();
    });
    canvas.addEventListener('pointerleave', leave);
    win.addEventListener('blur', leave);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) leave(); });
    finishButton.addEventListener('click', () => { if (state.started && !finished) done(now()); });

    new win.ResizeObserver(resize).observe(canvas);
    resize();
})(window);
