/* File drag-and-drop task page. Wheel input (including two-finger touchpad scrolling) scrolls the
 * list; a press that moves past the touch slop while held drags a file; the release drops it. */
(function (win) {
    'use strict';
    const { FILE_DRAG_FILES, FILE_DRAG_FOLDERS, FileDragTrials } = win.SurfaceInputsPathTasks;
    const doc = win.document;
    const canvas = doc.getElementById('files-canvas');
    const ctx = canvas.getContext('2d');
    const button = doc.getElementById('files-button');
    const TOUCH_SLOP_PX = 8;
    const now = () => win.performance.now();
    let width = 0, height = 0, hover = null, frame = 0, finished = false, pointerId = null;

    const state = new FileDragTrials(at => {
        finished = true;
        win.setTimeout(() => win.SurfaceInputsPathResults.complete('stp_file_drag', 'Files', state.targetResults(at)), 300);
    });

    const C = {
        background: 'rgb(25, 30, 38)', rowEven: 'rgb(36, 42, 52)', rowOdd: 'rgb(31, 37, 46)',
        hoverRow: 'rgb(48, 61, 80)', pressedRow: 'rgb(60, 80, 108)', folderTile: 'rgb(41, 52, 68)',
        folderIcon: 'rgb(234, 195, 111)', fileIcon: 'rgb(175, 197, 222)', drop: 'rgb(105, 221, 197)',
        chip: 'rgba(81, 160, 255, 0.9)', thumb: 'rgb(90, 104, 124)', text: 'rgb(235, 238, 242)', muted: 'rgb(130, 140, 155)'
    };
    const middle = (top, h) => top + h / 2;

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function draw() {
        frame = 0;
        const dpr = win.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = C.background;
        ctx.fillRect(0, 0, width, height);
        ctx.font = '14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx.textBaseline = 'middle';
        if (!state.started) {
            ctx.fillStyle = C.muted;
            ctx.textAlign = 'center';
            ctx.fillText(state.resolved ? '✓ Moved' : 'Select Begin to show the files.', width / 2, height / 2);
            ctx.textAlign = 'left';
        } else {
            drawFolders();
            drawList();
            drawDragged();
        }
        render();
    }
    function drawFolders() {
        const target = state.dropFolder;
        state.folderRects.forEach((r, index) => {
            ctx.fillStyle = C.folderTile;
            roundRect(r.left, r.top, r.width, r.height, 6);
            ctx.fill();
            if (index === target) {
                ctx.strokeStyle = C.drop;
                ctx.lineWidth = 3;
                ctx.stroke();
            }
            const icon = Math.min(r.height * 0.5, 22), left = r.left + 12, top = r.centerY - icon * 0.4;
            ctx.fillStyle = C.folderIcon;
            ctx.fillRect(left, top - icon * 0.15, icon * 0.45, icon * 0.15);
            ctx.fillRect(left, top, icon, icon * 0.75);
            ctx.save();
            ctx.beginPath(); ctx.rect(r.left, r.top, r.width, r.height); ctx.clip();
            ctx.fillStyle = C.text;
            ctx.fillText(FILE_DRAG_FOLDERS[index], left + icon + 10, r.centerY);
            ctx.restore();
        });
    }
    function drawList() {
        const list = state.listRect, row = state.rowHeight;
        if (row <= 0) return;
        ctx.save();
        ctx.beginPath(); ctx.rect(list.left, list.top, list.width, list.height); ctx.clip();
        const first = Math.max(0, Math.floor(state.offset / row));
        const last = Math.min(FILE_DRAG_FILES.length - 1, Math.floor((state.offset + list.height) / row));
        const press = state.press;
        const hovered = hover && !press ? state.fileAt(hover.x, hover.y) : null;
        for (let index = first; index <= last; index++) {
            const top = list.top + index * row - state.offset;
            ctx.fillStyle = press && press.file === index ? C.pressedRow
                : hovered === index ? C.hoverRow : index % 2 === 0 ? C.rowEven : C.rowOdd;
            ctx.fillRect(list.left, top, list.width, row);
            const dimmed = press && press.dragging && press.file === index;
            const icon = row * 0.42, left = list.left + 12;
            ctx.fillStyle = dimmed ? C.muted : C.fileIcon;
            ctx.fillRect(left, top + (row - icon) / 2, icon * 0.78, icon);
            ctx.fillStyle = dimmed ? C.muted : C.text;
            ctx.fillText(FILE_DRAG_FILES[index], left + icon + 12, middle(top, row));
        }
        ctx.restore();
        const max = state.maxOffset;
        if (max > 0) {
            const thumb = Math.max(24, list.height * list.height / (list.height + max));
            const top = list.top + (list.height - thumb) * (state.offset / max);
            ctx.fillStyle = C.thumb;
            ctx.fillRect(list.right - 4, top, 4, thumb);
        }
    }
    function drawDragged() {
        const press = state.press;
        if (!press || !press.dragging) return;
        const name = FILE_DRAG_FILES[press.file], pad = 10;
        const w = ctx.measureText(name).width + pad * 2, h = state.rowHeight * 0.9;
        const left = press.x + 8, top = press.y + 8;
        ctx.fillStyle = C.chip;
        roundRect(left, top, w, h, 6);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(name, left + pad, middle(top, h));
    }
    function render() {
        doc.getElementById('requested-file').textContent = state.spec.file;
        doc.getElementById('requested-folder').textContent = state.spec.folder;
        doc.getElementById('status').textContent = state.feedback;
        doc.getElementById('counts').textContent = 'File ' + (state.targetIndex + 1) + ' of ' + state.targetCount +
            ' · Drags: ' + state.attempts + ' · Wrong file: ' + state.wrongFile;
        button.textContent = state.resolved && !state.allCompleted ? 'Next file' : 'Begin';
        button.disabled = finished || state.allCompleted || state.active;
    }
    const redraw = () => { if (!frame) frame = win.requestAnimationFrame(draw); };

    function resize() {
        const r = canvas.getBoundingClientRect(), dpr = win.devicePixelRatio || 1;
        width = r.width; height = r.height;
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
        state.geometry(width, height, 1, TOUCH_SLOP_PX);
        draw();
    }
    function local(event) {
        const r = canvas.getBoundingClientRect();
        return { x: event.clientX - r.left, y: event.clientY - r.top };
    }
    // Events stamped before the target started or in the future are stale and cancel the gesture.
    function stale(event) {
        const t = now();
        return event.timeStamp > t + 1 || (state.startedAtMs !== null && event.timeStamp < state.startedAtMs - 1);
    }
    function cancel() { pointerId = null; state.cancel(now()); redraw(); }

    canvas.addEventListener('wheel', event => {
        if (finished || !state.active) return;
        event.preventDefault();
        if (stale(event)) { cancel(); return; }
        const unit = event.deltaMode === 1 ? state.rowHeight : event.deltaMode === 2 ? state.listRect.height : 1;
        state.scroll(event.deltaY * unit, now());
        redraw();
    }, { passive: false });
    canvas.addEventListener('pointerdown', event => {
        if (finished) return;
        if (stale(event)) { cancel(); return; }
        // A second pointer means the gesture is no longer a single-pointer drag.
        if (!event.isPrimary || pointerId !== null) { cancel(); return; }
        if (event.button !== 0) return;
        const p = local(event);
        pointerId = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
        state.pressAt(p.x, p.y, now(), event.pointerType === 'mouse');
        redraw();
    });
    canvas.addEventListener('pointermove', event => {
        if (finished) return;
        const p = local(event);
        if (pointerId === null) {
            hover = event.pointerType === 'mouse' ? p : null;
            redraw();
            return;
        }
        if (event.pointerId !== pointerId) return;
        if (stale(event)) { cancel(); return; }
        state.move(p.x, p.y, now());
        redraw();
    });
    canvas.addEventListener('pointerup', event => {
        if (finished || event.pointerId !== pointerId) return;
        pointerId = null;
        if (stale(event)) { state.cancel(now()); redraw(); return; }
        const p = local(event);
        state.release(p.x, p.y, now());
        redraw();
    });
    canvas.addEventListener('pointercancel', event => { if (event.pointerId === pointerId) cancel(); });
    canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === pointerId) cancel(); });
    canvas.addEventListener('pointerleave', () => { hover = null; redraw(); });
    win.addEventListener('blur', cancel);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); });

    button.addEventListener('click', () => {
        if (state.resolved) state.next(); else state.begin(now());
        hover = null;
        redraw();
    });

    new win.ResizeObserver(resize).observe(canvas);
    resize();
})(window);
