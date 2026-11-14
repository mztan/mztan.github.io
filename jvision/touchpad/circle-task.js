/* Circle-tracing task page. Mouse-type pointer motion is measured, including while a button is
 * held, so clicking never interrupts a lap. Every click is logged and marked with a red X.
 * Touch, pen, stale events, leaving the area or losing focus interrupt the current lap. */
(function (win) {
    'use strict';
    const { CircleTrials } = win.SurfaceInputsPathTasks;
    const doc = win.document;
    const canvas = doc.getElementById('circle-canvas');
    const ctx = canvas.getContext('2d');
    const TRAIL_LIMIT = 256, STALE_MS = 250;
    const now = () => win.performance.now();
    let width = 0, height = 0, trail = [], lastLap = 0, mouseDown = false, finished = false, frame = 0;
    // Every primary click on the canvas, kept relative to the circle so marks survive resizes.
    const clicks = [], pageStart = now();

    const state = new CircleTrials(at => {
        finished = true;
        win.setTimeout(() => win.SurfaceInputsPathResults.complete('stp_circle_tracing', 'Circles', state.targetResults(at),
            { clicks: clicks.map(({ x, y, t_ms, lap, in_lap }) => ({ x, y, t_ms, lap, in_lap })) }), 300);
    });

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

    function draw() {
        frame = 0;
        const dpr = win.devicePixelRatio || 1, r = state.radius, cx = state.centerX, cy = state.centerY;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = 'rgb(25, 30, 38)';
        ctx.fillRect(0, 0, width, height);
        if (r > 0) {
            ctx.lineWidth = r * 0.12; ctx.strokeStyle = 'rgb(42, 59, 80)';
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
            ctx.lineWidth = 2; ctx.strokeStyle = 'rgb(175, 197, 222)';
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
            if (trail.length > 1) {
                ctx.strokeStyle = 'rgb(105, 221, 197)';
                ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y);
                for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
                ctx.stroke();
            }
            ctx.fillStyle = 'rgb(81, 160, 255)';
            ctx.beginPath(); ctx.arc(cx + r, cy, r * 0.09, 0, 2 * Math.PI); ctx.fill();
            drawClockwiseArrow(cx + r, cy, r * 0.09);
            ctx.fillStyle = '#fff'; ctx.font = '22px system-ui, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('↻', cx, cy);
            const size = Math.max(6, r * 0.04);
            clicks.forEach(c => drawClickMark(cx + c.nx * r, cy + c.ny * r, size));
        }
        doc.getElementById('status').textContent = state.feedback;
        doc.getElementById('laps').textContent = 'Clockwise circles · ' + state.completedLaps + ' of ' + state.lapCount + ' complete';
        const rms = state.completedLaps > 0 ? state.snapshot().stp_circle_radial_rms_px : undefined;
        doc.getElementById('clicks').textContent = 'Clicks: ' + clicks.length;
        doc.getElementById('last-lap').textContent = rms === undefined ? '' : 'Last lap: ' + rms.toFixed(1) + ' px RMS path error';
    }
    const redraw = () => { if (!frame) frame = win.requestAnimationFrame(draw); };

    function resize() {
        const rect = canvas.getBoundingClientRect(), dpr = win.devicePixelRatio || 1;
        width = rect.width; height = rect.height;
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
        trail = [];
        state.geometry(width / 2, height / 2, Math.min(width, height) * 0.36);
        draw();
    }
    function interrupt() { mouseDown = false; state.interrupt(); trail = []; redraw(); }
    const stale = event => { const t = now(); return event.timeStamp > t + 1 || event.timeStamp < t - STALE_MS; };

    canvas.addEventListener('pointermove', event => {
        if (finished) return;
        if (event.pointerType !== 'mouse' || stale(event)) { interrupt(); return; }
        const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
        state.move(x, y, now());
        if (lastLap !== state.completedLaps || !state.active) trail = [];
        lastLap = state.completedLaps;
        if (state.active) {
            if (trail.length === TRAIL_LIMIT) trail.shift();
            trail.push({ x, y });
        }
        redraw();
    });
    canvas.addEventListener('pointerdown', event => {
        if (finished) return;
        if (event.pointerType !== 'mouse' || !event.isPrimary || stale(event)) { interrupt(); return; }
        if (event.button === 0) mouseDown = true;
    });
    canvas.addEventListener('pointerup', event => {
        if (finished || event.pointerType !== 'mouse' || event.button !== 0) return;
        if (mouseDown) {
            // Logged and marked, but the lap carries on: no interruption, no reset.
            const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
            const inLap = state.startedAtMs !== null;
            state.click();
            clicks.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, t_ms: Math.round(now() - pageStart),
                lap: state.completedLaps + 1, in_lap: inLap,
                nx: (x - state.centerX) / state.radius, ny: (y - state.centerY) / state.radius });
            redraw();
        }
        mouseDown = false;
    });
    canvas.addEventListener('pointercancel', () => { mouseDown = false; });
    canvas.addEventListener('pointerleave', () => { if (!finished) interrupt(); });
    win.addEventListener('blur', () => { if (!finished) interrupt(); });
    doc.addEventListener('visibilitychange', () => { if (doc.hidden && !finished) interrupt(); });

    new win.ResizeObserver(resize).observe(canvas);
    resize();
})(window);
