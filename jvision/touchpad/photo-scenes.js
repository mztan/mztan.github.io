/* Paints the photo-crop task's original drawn scenes (no photographs, people or personal data) from the
 * deterministic specs in photo-crop.js. All drawing is in original-image pixels; callers pass the transform. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SurfaceInputsPhotoScenes = api;
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    function mix(a, b, t) {
        const x = hex(a), y = hex(b);
        return 'rgb(' + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(', ') + ')';
    }
    function shade(color, amount) { return mix(color, amount < 0 ? '#000000' : '#ffffff', Math.abs(amount)); }
    function poly(ctx, points, fill) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
    }
    function round(ctx, x, y, w, h, r, fill) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
    }
    function circle(ctx, x, y, r, fill) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
    }
    /* Backpack drawn strictly inside its item box, so the box is the subject annotation. */
    function backpack(ctx, it) {
        const w = it.right - it.left, h = it.bottom - it.top, l = it.left, t = it.top;
        ctx.strokeStyle = shade(it.color, -0.45);
        ctx.lineWidth = w * 0.06;
        ctx.beginPath();
        ctx.arc(l + w / 2, t + h * 0.1 + w * 0.02, w * 0.1, Math.PI, 0);
        ctx.stroke();
        round(ctx, l, t + h * 0.1, w, h * 0.9, w * 0.18, it.color);
        round(ctx, l + w * 0.04, t + h * 0.1, w * 0.92, h * 0.3, w * 0.16, shade(it.color, -0.18));
        round(ctx, l + w * 0.18, t + h * 0.55, w * 0.64, h * 0.36, w * 0.1, shade(it.color, -0.12));
        ctx.fillStyle = shade(it.color, -0.5);
        ctx.fillRect(l + w * 0.2, t + h * 0.62, w * 0.6, h * 0.02);
        ctx.fillRect(l + w * 0.47, t + h * 0.33, w * 0.06, h * 0.06);
    }
    function tote(ctx, it) {
        const w = it.right - it.left, h = it.bottom - it.top, l = it.left, t = it.top;
        ctx.strokeStyle = shade(it.color, -0.35);
        ctx.lineWidth = w * 0.05;
        ctx.beginPath();
        ctx.arc(l + w / 2, t + h * 0.3, w * 0.25, Math.PI, 0);
        ctx.stroke();
        poly(ctx, [[l + w * 0.08, t + h * 0.3], [l + w * 0.92, t + h * 0.3], [l + w, t + h], [l, t + h]], it.color);
        ctx.fillStyle = shade(it.color, -0.2);
        ctx.fillRect(l + w * 0.08, t + h * 0.3, w * 0.84, h * 0.06);
    }
    function jacket(ctx, it) {
        const w = it.right - it.left, h = it.bottom - it.top, l = it.left, t = it.top;
        poly(ctx, [[l + w * 0.1, t + h * 0.2], [l + w * 0.45, t], [l + w * 0.55, t], [l + w * 0.9, t + h * 0.2],
            [l + w, t + h], [l, t + h]], it.color);
        poly(ctx, [[l + w * 0.45, t], [l + w * 0.55, t], [l + w * 0.52, t + h], [l + w * 0.48, t + h]], shade(it.color, -0.3));
    }
    function tree(ctx, x, base, size, dark) {
        ctx.fillStyle = '#5b4330';
        ctx.fillRect(x - size * 0.06, base - size * 0.35, size * 0.12, size * 0.35);
        poly(ctx, [[x, base - size * 1.25], [x + size * 0.45, base - size * 0.3], [x - size * 0.45, base - size * 0.3]], dark);
        poly(ctx, [[x, base - size * 1.5], [x + size * 0.32, base - size * 0.8], [x - size * 0.32, base - size * 0.8]], shade(dark, 0.12));
    }
    function bench(ctx, b, height) {
        const w = b.right - b.left, wood = '#8a5a3a', dark = '#4a3426';
        ctx.fillStyle = dark;
        [0.06, 0.94].forEach(f => {
            ctx.fillRect(b.left + w * f - 10, b.seatY - 190, 20, 190 + height * 0.1);
        });
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = shade(wood, i * 0.06);
            ctx.fillRect(b.left, b.seatY - 180 + i * 50, w, 34);
        }
        ctx.fillStyle = wood;
        ctx.fillRect(b.left - 20, b.seatY, w + 40, 26);
        ctx.fillStyle = shade(wood, -0.25);
        ctx.fillRect(b.left - 20, b.seatY + 26, w + 40, 14);
    }
    function paint(ctx, photo) {
        const s = photo.scene, W = photo.width, H = photo.height, horizon = H * s.horizon, random = rng(s.seed);
        const gradient = typeof ctx.createLinearGradient === 'function' ? ctx.createLinearGradient(0, 0, 0, horizon) : null;
        if (gradient && typeof gradient.addColorStop === 'function') {
            gradient.addColorStop(0, s.sky[0]);
            gradient.addColorStop(1, s.sky[1]);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, W, horizon + 2);
        } else {
            ctx.fillStyle = mix(s.sky[0], s.sky[1], 0.5);
            ctx.fillRect(0, 0, W, horizon + 2);
        }
        if (s.sun) circle(ctx, W * 0.78, horizon * 0.35, Math.min(W, H) * 0.06, '#fff2c4');
        for (let i = 0; i < 3; i++) {
            const cx = W * (0.15 + random() * 0.7), cy = horizon * (0.15 + random() * 0.35), r = W * (0.03 + random() * 0.02);
            [-1.2, 0, 1.2].forEach(k => circle(ctx, cx + k * r, cy + (k === 0 ? -r * 0.3 : 0), r, 'rgba(255, 255, 255, 0.75)'));
        }
        if (s.mountains) {
            const peaks = [[0.0, 0.35], [0.28, 0.12], [0.55, 0.28], [0.8, 0.08], [1.0, 0.3]];
            poly(ctx, [[0, horizon]].concat(peaks.map(([x, y]) => [W * x, horizon * (0.45 + y)])).concat([[W, horizon]]), '#7a8899');
            if (s.snow) peaks.slice(1, 4).forEach(([x, y]) => {
                const px = W * x, py = horizon * (0.45 + y);
                poly(ctx, [[px, py], [px + W * 0.05, py + horizon * 0.08], [px - W * 0.05, py + horizon * 0.08]], '#ffffff');
            });
        }
        ctx.fillStyle = s.ground;
        ctx.fillRect(0, horizon, W, H - horizon);
        if (s.water) {
            ctx.fillStyle = '#4f86b8';
            ctx.fillRect(0, horizon, W, (H - horizon) * 0.35);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            for (let i = 0; i < 6; i++) ctx.fillRect(W * random(), horizon + (H - horizon) * 0.35 * random(), W * 0.08, 4);
        }
        if (s.path) poly(ctx, [[W * 0.46, horizon], [W * 0.54, horizon], [W * 0.8, H], [W * 0.2, H]], '#b59a6e');
        for (let i = 0; i < (s.trees || 0); i++) {
            const left = random() < 0.5;
            const x = left ? W * (0.03 + random() * 0.22) : W * (0.75 + random() * 0.22);
            tree(ctx, x, horizon + (H - horizon) * (0.05 + random() * 0.25), H * (0.22 + random() * 0.12), '#2f5f34');
        }
        if (s.bench) bench(ctx, s.bench, H);
        const it = s.item;
        if (s.rock) {
            const base = it ? it.bottom : H * 0.7, l = it ? it.left - 120 : W * 0.35, r = it ? it.right + 120 : W * 0.65;
            poly(ctx, [[l, base + 200], [l + 30, base + 10], [l + (r - l) * 0.4, base - 20], [r - 40, base], [r, base + 200]], '#8d8f8c');
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.fillRect(l, base + 150, r - l, 50);
        }
        if (it) ({ backpack, tote, jacket })[it.type](ctx, it);
    }
    /* Draws `photo` with its top-left at (x, y) CSS px and `scale` CSS px per image px, clipped to `clip` if given. */
    function drawPhoto(ctx, photo, x, y, scale, clip) {
        ctx.save();
        if (clip) { ctx.beginPath(); ctx.rect(clip.left, clip.top, clip.width, clip.height); ctx.clip(); }
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.beginPath(); ctx.rect(0, 0, photo.width, photo.height); ctx.clip();
        paint(ctx, photo);
        ctx.restore();
    }
    /* Draws the image region `region` (image px) to fit inside `into` (CSS px), centered. */
    function drawRegion(ctx, photo, region, into) {
        const w = region.right - region.left, h = region.bottom - region.top;
        const scale = Math.min(into.width / w, into.height / h);
        const left = into.left + (into.width - w * scale) / 2, top = into.top + (into.height - h * scale) / 2;
        drawPhoto(ctx, photo, left - region.left * scale, top - region.top * scale, scale,
            { left, top, width: w * scale, height: h * scale });
        return { left, top, width: w * scale, height: h * scale };
    }
    return { drawPhoto, drawRegion };
});
