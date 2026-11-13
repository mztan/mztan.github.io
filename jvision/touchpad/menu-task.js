/* Cascading-menu task page. Hover navigates submenus; a tap/click selects; a click on empty
 * space dismisses. Direct touch or pen invalidates the cursor trace, as in the native task. */
(function (win) {
    'use strict';
    const { MENU_LABELS, MENU_PATH, MenuTrials } = win.SurfaceInputsPathTasks;
    const doc = win.document;
    const canvas = doc.getElementById('menu-canvas');
    const ctx = canvas.getContext('2d');
    const button = doc.getElementById('menu-button');
    const TAP_SLOP_PX = 8;
    const now = () => win.performance.now();
    let width = 0, height = 0, hovered = null, pressed = null, down = null, tap = false, finished = false, frame = 0;

    const state = new MenuTrials(at => {
        finished = true;
        win.setTimeout(() => win.SurfaceInputsPathResults.complete('stp_cascading_menu', 'Menus', state.targetResults(at)), 300);
    });

    const rowHeight = () => Math.min(36, height / 10);
    const columnWidth = () => width / 5;
    function itemBounds(level, item) {
        const parentTop = level === 0 ? 0 : itemBounds(level - 1, MENU_PATH[level - 1]).top;
        const top = Math.min(parentTop, height - MENU_LABELS[level].length * rowHeight());
        return { left: level * columnWidth(), top: top + item * rowHeight(), right: (level + 1) * columnWidth(),
            bottom: top + (item + 1) * rowHeight() };
    }
    function hit(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        for (let level = 0; level < state.visibleLevels; level++) {
            for (let item = 0; item < MENU_LABELS[level].length; item++) {
                const b = itemBounds(level, item);
                if (x >= b.left && x < b.right && y >= b.top && y < b.bottom) return { level, item };
            }
        }
        return null;
    }
    const same = (a, b) => (a === null && b === null) || (a !== null && b !== null && a.level === b.level && a.item === b.item);

    function draw() {
        frame = 0;
        const dpr = win.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = 'rgb(25, 30, 38)';
        ctx.fillRect(0, 0, width, height);
        ctx.font = '14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx.textBaseline = 'middle';
        for (let level = 0; level < state.visibleLevels; level++) {
            for (let item = 0; item < MENU_LABELS[level].length; item++) {
                const b = itemBounds(level, item);
                ctx.fillStyle = same(hovered, { level, item }) ? 'rgb(194, 222, 255)' : 'rgb(245, 247, 250)';
                ctx.fillRect(b.left + 1, b.top + 1, b.right - b.left - 2, b.bottom - b.top - 2);
                ctx.save();
                ctx.beginPath(); ctx.rect(b.left, b.top, b.right - b.left, b.bottom - b.top); ctx.clip();
                ctx.fillStyle = 'rgb(25, 30, 38)';
                const mid = (b.top + b.bottom) / 2;
                ctx.fillText(MENU_LABELS[level][item], b.left + 10, mid);
                if (item === MENU_PATH[level] && level < state.depth - 1) ctx.fillText('›', b.right - 16, mid);
                ctx.restore();
            }
        }
        render();
    }
    function render() {
        doc.getElementById('requested-path').textContent = state.requestedPath;
        doc.getElementById('status').textContent = state.feedback;
        const m = state.snapshot();
        doc.getElementById('counts').textContent = 'Selections: ' + (m.stp_menu_attempt_count || 0) +
            ' · Wrong: ' + (m.stp_menu_wrong_selection_count || 0);
        doc.getElementById('trial').textContent = 'Path ' + (state.targetIndex + 1) + ' of ' + state.depths.length;
        button.textContent = state.resolved && !state.allCompleted ? 'Next path' : 'Open menu';
        button.disabled = state.allCompleted || finished;
    }
    const redraw = () => { if (!frame) frame = win.requestAnimationFrame(draw); };

    function resize() {
        const rect = canvas.getBoundingClientRect(), dpr = win.devicePixelRatio || 1;
        width = rect.width; height = rect.height;
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
        draw();
    }
    function local(event) {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    // Events older than the trial start or from the future (clock skew) invalidate the trace.
    function stale(event) {
        const t = now();
        return event.timeStamp > t + 1 || event.timeStamp < (state.startedAtMs === null ? t : state.startedAtMs) - 1;
    }
    function interrupt() { tap = false; state.interrupt(); redraw(); }

    canvas.addEventListener('pointermove', event => {
        if (finished) return;
        if (stale(event)) { interrupt(); return; }
        const p = local(event);
        if (down && Math.hypot(p.x - down.x, p.y - down.y) > TAP_SLOP_PX) tap = false;
        // Hover only: the native task measures motion with no button held.
        if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
        const t = now();
        state.move(p.x, p.y, t);
        hovered = hit(p.x, p.y);
        if (hovered) state.hover(hovered.level, hovered.item, t);
        redraw();
    });
    canvas.addEventListener('pointerdown', event => {
        if (finished) return;
        if (stale(event)) { interrupt(); return; }
        if (!event.isPrimary) { tap = false; return; }
        if (event.button !== 0) return;
        down = local(event);
        pressed = hit(down.x, down.y);
        tap = true;
        if (event.pointerType !== 'mouse') state.interrupt();
        redraw();
    });
    canvas.addEventListener('pointercancel', () => { tap = false; down = null; });
    canvas.addEventListener('pointerup', event => {
        if (finished || !event.isPrimary || event.button !== 0) return;
        if (stale(event)) { interrupt(); return; }
        const p = local(event);
        if (tap && same(hit(p.x, p.y), pressed)) {
            const t = now();
            if (pressed) state.select(pressed.level, pressed.item, t); else state.dismiss(t);
            hovered = hit(p.x, p.y);
        }
        tap = false; down = null;
        redraw();
    });
    canvas.addEventListener('pointerleave', () => { hovered = null; state.interrupt(); redraw(); });
    win.addEventListener('blur', interrupt);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) interrupt(); });

    button.addEventListener('click', () => {
        if (state.resolved) state.next(); else state.open(now());
        hovered = null;
        redraw();
    });

    new win.ResizeObserver(resize).observe(canvas);
    resize();
})(window);
