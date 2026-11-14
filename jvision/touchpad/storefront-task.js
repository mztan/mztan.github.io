/* Storefront purchase-selection task page. Wheel input (including two-finger touchpad scrolling)
 * scrolls the results; a press released over the same control within the touch slop activates it. */
(function (win) {
    'use strict';
    const { SHOP_PRODUCTS, StorefrontTrials } = win.SurfaceInputsPathTasks;
    const doc = win.document;
    const canvas = doc.getElementById('store-canvas');
    const ctx = canvas.getContext('2d');
    const button = doc.getElementById('store-button');
    const TOUCH_SLOP_PX = 8;
    const now = () => win.performance.now();
    let width = 0, height = 0, hover = null, frame = 0, finished = false, pointerId = null;

    const state = new StorefrontTrials(at => {
        finished = true;
        win.setTimeout(() => win.SurfaceInputsPathResults.complete('stp_storefront_cart', 'Storefront', state.targetResults(at)), 300);
    });

    const C = {
        background: 'rgb(25, 30, 38)', header: 'rgb(19, 33, 48)', rowEven: 'rgb(36, 42, 52)', rowOdd: 'rgb(31, 37, 46)',
        hover: 'rgb(48, 61, 80)', pressed: 'rgb(60, 80, 108)', field: 'rgb(44, 52, 64)', fieldBorder: 'rgb(90, 104, 124)',
        menu: 'rgb(38, 46, 58)', shadow: 'rgba(0, 0, 0, 0.47)', focus: 'rgb(81, 160, 255)', action: 'rgb(247, 190, 72)',
        actionText: 'rgb(28, 24, 16)', thumb: 'rgb(90, 104, 124)', text: 'rgb(235, 238, 242)', muted: 'rgb(130, 140, 155)'
    };
    const SWATCHES = {
        Black: 'rgb(38, 38, 42)', Blue: 'rgb(66, 133, 224)', Brown: 'rgb(121, 85, 61)', Charcoal: 'rgb(70, 74, 82)',
        Gray: 'rgb(150, 155, 162)', Green: 'rgb(76, 150, 92)', Khaki: 'rgb(189, 172, 128)', Navy: 'rgb(36, 52, 102)',
        Orange: 'rgb(232, 128, 52)', Red: 'rgb(200, 62, 58)', Tan: 'rgb(205, 178, 140)', Teal: 'rgb(40, 150, 150)'
    };
    const swatch = color => SWATCHES[color] || 'rgb(128, 128, 128)';
    const rating = index => '4.' + ((index * 7 + 3) % 9 + 1);
    const same = (a, b) => !!a && !!b && a.kind === b.kind && a.index === b.index;
    const hovered = () => (!state.press && hover ? state.controlAt(hover.x, hover.y) : null);
    const highlighted = control => same(state.press && state.press.control, control) || same(hovered(), control);

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function text(value, x, centerY, color, align = 'left') {
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(value, x, centerY);
        ctx.textAlign = 'left';
    }
    function box(r, label, highlight, fill, color = C.text, align = 'center') {
        ctx.fillStyle = fill;
        roundRect(r.left, r.top, r.width, r.height, 6);
        ctx.fill();
        if (highlight) {
            ctx.strokeStyle = C.focus;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.save();
        ctx.beginPath(); ctx.rect(r.left, r.top, r.width, r.height); ctx.clip();
        text(label, align === 'center' ? r.centerX : r.left + 10, r.centerY, color, align);
        ctx.restore();
    }
    function field(kind, r, label, index = -1) {
        const control = { kind, index };
        const open = same(state.openDropdown, control);
        box(r, label, highlighted(control) || open, C.field, C.text, 'left');
        text(open ? '▴' : '▾', r.right - 10, r.centerY, C.muted, 'right');
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
            text(state.resolved ? '✓ Order confirmed' : 'Select Begin to open the store.', width / 2, height / 2, C.muted, 'center');
        } else {
            if (state.screen === 'results') drawResults();
            else if (state.screen === 'details') drawDetails();
            else drawCart();
            drawHeader();
            drawOptions();
        }
        render();
    }
    function drawHeader() {
        ctx.fillStyle = C.header;
        ctx.fillRect(0, 0, width, state.headerHeight);
        if (state.screen === 'results') {
            text('Fieldmart  ·  Results for “hiking”', 12, state.headerHeight / 2, C.text);
        } else {
            box(state.backButtonRect(), '‹ Back to results', highlighted({ kind: 'back', index: -1 }), C.field);
            if (state.screen === 'cart') text('Cart', state.backButtonRect().right + 16, state.headerHeight / 2, C.text);
        }
        if (state.screen !== 'cart') {
            box(state.cartButtonRect(), 'Cart (' + state.cartCount + ')', highlighted({ kind: 'cart', index: -1 }), C.field);
        }
    }
    function drawResults() {
        const list = state.listRect, row = state.rowHeight;
        if (row <= 0) return;
        ctx.save();
        ctx.beginPath(); ctx.rect(list.left, list.top, list.width, list.height); ctx.clip();
        const first = Math.max(0, Math.floor(state.offset / row));
        const last = Math.min(SHOP_PRODUCTS.length - 1, Math.floor((state.offset + list.height) / row));
        for (let index = first; index <= last; index++) {
            const r = state.productRowRect(index), control = { kind: 'product', index };
            ctx.fillStyle = same(state.press && state.press.control, control) ? C.pressed
                : same(hovered(), control) ? C.hover : index % 2 === 0 ? C.rowEven : C.rowOdd;
            ctx.fillRect(r.left, r.top, r.width, r.height);
            const item = SHOP_PRODUCTS[index], tile = row - 16, tileLeft = r.left + 12;
            ctx.fillStyle = swatch(item.colors[0]);
            roundRect(tileLeft, r.top + 8, tile, tile, 6);
            ctx.fill();
            const textLeft = tileLeft + tile + 14;
            text(item.name, textLeft, r.top + row * 0.35, C.text);
            text(item.price + '   ★ ' + rating(index) + '   ' + item.colors.length + ' colors', textLeft, r.top + row * 0.7, C.muted);
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
    function drawDetails() {
        if (state.openProduct === null) return;
        const item = SHOP_PRODUCTS[state.openProduct], image = state.detailsImageRect();
        ctx.fillStyle = swatch(state.selectedColor || item.colors[0]);
        roundRect(image.left, image.top, image.width, image.height, 10);
        ctx.fill();
        text(item.name, state.detailsTitleRect().left, state.detailsTitleRect().centerY, C.text);
        text(item.price + '   ★ ' + rating(state.openProduct), state.detailsPriceRect().left, state.detailsPriceRect().centerY, C.muted);
        field('color', state.colorRect(), 'Color: ' + state.selectedColor);
        field('size', state.sizeRect(), 'Size: ' + (state.selectedSize || 'Select'));
        field('quantity', state.quantityRect(), 'Quantity: ' + state.selectedQuantity);
        box(state.addRect(), 'Add to cart', highlighted({ kind: 'add', index: -1 }), C.action, C.actionText);
    }
    function drawCart() {
        if (!state.cart.length) {
            text('Your cart is empty.', 16, state.headerHeight + 40, C.muted);
            return;
        }
        state.cart.forEach((item, line) => {
            const r = state.cartLineRect(line), quantity = state.lineQuantityRect(line);
            ctx.fillStyle = line % 2 === 0 ? C.rowEven : C.rowOdd;
            ctx.fillRect(r.left, r.top, r.width, r.height);
            ctx.save();
            ctx.beginPath(); ctx.rect(r.left, r.top, quantity.left - 8 - r.left, r.height); ctx.clip();
            text(SHOP_PRODUCTS[item.product].name, r.left + 12, r.top + r.height * 0.35, C.text);
            text(item.color + ', ' + item.size + '   ' + SHOP_PRODUCTS[item.product].price + ' each', r.left + 12, r.top + r.height * 0.72, C.muted);
            ctx.restore();
            field('lineQuantity', quantity, 'Qty: ' + item.quantity, line);
            box(state.deleteRect(line), 'Delete', highlighted({ kind: 'delete', index: line }), C.field);
        });
        const confirm = state.confirmRect();
        text('Subtotal (' + state.cartCount + ' items)', confirm.left - 16, confirm.centerY, C.text, 'right');
        box(confirm, 'Confirm cart', highlighted({ kind: 'confirm', index: -1 }), C.action, C.actionText);
    }
    function drawOptions() {
        const dropdown = state.openDropdown;
        if (!dropdown) return;
        const options = state.options();
        const current = dropdown.kind === 'color' ? state.selectedColor : dropdown.kind === 'size' ? state.selectedSize
            : dropdown.kind === 'quantity' ? String(state.selectedQuantity)
                : state.cart[dropdown.index] && String(state.cart[dropdown.index].quantity);
        const first = state.optionRect(0), last = state.optionRect(options.length - 1);
        if (!first || !last) return;
        ctx.fillStyle = C.shadow;
        ctx.fillRect(first.left + 3, first.top + 3, last.right - first.left, last.bottom - first.top);
        options.forEach((value, option) => {
            const r = state.optionRect(option);
            ctx.fillStyle = highlighted({ kind: 'option', index: option }) ? C.hover : C.menu;
            ctx.fillRect(r.left, r.top, r.width, r.height);
            text(value === current ? '✓ ' + value : '   ' + value, r.left + 10, r.centerY, C.text);
        });
        ctx.strokeStyle = C.fieldBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(first.left, first.top, last.right - first.left, last.bottom - first.top);
    }
    function render() {
        doc.getElementById('order-prompt').textContent = state.order.prompt;
        doc.getElementById('status').textContent = state.feedback;
        doc.getElementById('counts').textContent = 'Order ' + (state.targetIndex + 1) + ' of ' + state.targetCount +
            ' · Cart: ' + state.cartCount + ' · Adds: ' + state.addAttempts;
        button.textContent = state.resolved && !state.allCompleted ? 'Next order' : 'Begin';
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
    // Events stamped before the order started or in the future are stale and cancel the press.
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
        // A second pointer means the gesture is no longer a single-pointer click.
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
            if (hover && !stale(event)) state.hover(p.x, p.y, now());
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
    canvas.addEventListener('pointerleave', () => { hover = null; state.hoverExit(); redraw(); });
    const focusLost = () => { pointerId = null; state.focusLost(now()); redraw(); };
    win.addEventListener('blur', focusLost);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) focusLost(); });

    button.addEventListener('click', () => {
        if (state.resolved) state.next(); else state.begin(now());
        hover = null;
        redraw();
    });

    new win.ResizeObserver(resize).observe(canvas);
    resize();
})(window);
