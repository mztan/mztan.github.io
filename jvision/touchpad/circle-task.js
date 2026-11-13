/* Circle-tracing task page. Only cursor hover (pointer moving with no button held) is measured;
 * touch, pen, stale events, leaving the area or losing focus interrupt the current lap. */
(function (win) {
    'use strict';
    const { CircleTrials } = win.SurfaceInputsPathTasks;
    const doc = win.document;
    const canvas = doc.getElementById('circle-canvas');
    const ctx = canvas.getContext('2d');
    const TRAIL_LIMIT = 256, STALE_MS = 250;
    const now = () => win.performance.now();
    let width = 0, height = 0, trail = [], lastLap = 0, mouseDown = false, finished = false, frame = 0;

    const state = new CircleTrials(at => {
        finished = true;
        win.setTimeout(() => win.SurfaceInputsPathResults.complete('stp_circle_tracing', 'Circles', state.targetResults(at)), 300);
    });

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
            ctx.fillStyle = '#fff'; ctx.font = '22px system-ui, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('↻', cx, cy);
        }
        doc.getElementById('status').textContent = state.feedback;
        doc.getElementById('laps').textContent = 'Clockwise circles · ' + state.completedLaps + ' of ' + state.lapCount + ' complete';
        const rms = state.completedLaps > 0 ? state.snapshot().stp_circle_radial_rms_px : undefined;
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
        if (event.buttons !== 0) return; // pressed motion is not hover; the native task ignores it
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
        if (mouseDown) { state.click(); redraw(); }
        mouseDown = false;
    });
    canvas.addEventListener('pointercancel', () => { mouseDown = false; });
    canvas.addEventListener('pointerleave', () => { if (!finished) interrupt(); });
    win.addEventListener('blur', () => { if (!finished) interrupt(); });
    doc.addEventListener('visibilitychange', () => { if (doc.hidden && !finished) interrupt(); });

    new win.ResizeObserver(resize).observe(canvas);
    resize();
})(window);
