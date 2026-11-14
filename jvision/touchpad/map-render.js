/* Paints the map landmark task's fictional city from the world data in map-landmark.js. Shapes are drawn in
 * world units through the camera transform; text is drawn in screen space so labels stay readable. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SurfaceInputsMapRender = api;
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const KIND_COLORS = { museum: '#8e5bb5', market: '#d9822b', library: '#2f7fb8', theatre: '#c0392b', station: '#555f6b',
        civic: '#7a6a3a', school: '#3c9a5f', tower: '#6b4f8a', park: '#3f8a3a', bridge: '#8a7a66', hospital: '#d0453b' };
    const C = { land: '#ebe6da', block: '#d8d1c3', park: '#bcdba4', water: '#9fc8e8', street: '#ffffff', streetEdge: '#c9c1b1',
        minor: '#f7f4ee', label: '#2b2b2b', halo: 'rgba(255, 255, 255, 0.85)', streetLabel: '#6b6457' };
    const kindColor = kind => KIND_COLORS[kind] || '#666666';
    function halo(ctx, text, x, y, color, font, align = 'center') {
        ctx.font = font;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = C.halo;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        ctx.textAlign = 'left';
    }
    function polyline(ctx, points) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    }
    const overlaps = (r, v) => r.right >= v.left && r.left <= v.right && r.bottom >= v.top && r.top <= v.bottom;
    /* view: { scale, zoom, toScreen(x, y), pin(index) → {x, y, entrance}, world: visible world rect, viewport: screen rect }.
     * state: { hover: index|null, open: index|null, detailZoom, labelZoom }. */
    function drawMap(ctx, map, view, state) {
        const v = view.viewport, s = view.scale, origin = view.toScreen(0, 0), world = view.world;
        ctx.save();
        ctx.beginPath(); ctx.rect(v.left, v.top, v.width, v.height); ctx.clip();
        ctx.fillStyle = '#c9c3b6';
        ctx.fillRect(v.left, v.top, v.width, v.height);
        ctx.save();
        ctx.translate(origin.x, origin.y);
        ctx.scale(s, s);
        ctx.fillStyle = C.land;
        ctx.fillRect(0, 0, map.width, map.height);
        map.parks.forEach(p => { if (overlaps(p, world)) { ctx.fillStyle = C.park; ctx.fillRect(p.left, p.top, p.right - p.left, p.bottom - p.top); } });
        ctx.strokeStyle = C.water;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = map.river.halfWidth * 2;
        polyline(ctx, map.river.points); ctx.stroke();
        ctx.fillStyle = C.block;
        map.blocks.forEach(b => { if (overlaps(b, world)) ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top); });
        ctx.lineCap = 'butt';
        const minPx = 1.5 / s;
        for (const street of map.minor) {
            ctx.strokeStyle = C.minor; ctx.lineWidth = Math.max(street.width, minPx);
            ctx.beginPath(); ctx.moveTo(street.x1, street.y1); ctx.lineTo(street.x2, street.y2); ctx.stroke();
        }
        for (const street of map.avenues.concat(map.streets)) {
            ctx.strokeStyle = C.streetEdge; ctx.lineWidth = Math.max(street.width + 6, minPx * 2);
            ctx.beginPath(); ctx.moveTo(street.x1, street.y1); ctx.lineTo(street.x2, street.y2); ctx.stroke();
        }
        for (const street of map.avenues.concat(map.streets)) {
            ctx.strokeStyle = C.street; ctx.lineWidth = Math.max(street.width, minPx);
            ctx.beginPath(); ctx.moveTo(street.x1, street.y1); ctx.lineTo(street.x2, street.y2); ctx.stroke();
        }
        map.landmarks.forEach((l, i) => {
            if (l.kind === 'park' || !overlaps(l.footprint, world)) return;
            const f = l.footprint;
            ctx.fillStyle = kindColor(l.kind);
            ctx.globalAlpha = state.open === i ? 0.75 : 0.45;
            ctx.fillRect(f.left, f.top, f.right - f.left, f.bottom - f.top);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = kindColor(l.kind); ctx.lineWidth = 2 / s;
            ctx.strokeRect(f.left, f.top, f.right - f.left, f.bottom - f.top);
        });
        ctx.restore();
        // Screen-space text and markers.
        if (view.zoom >= 1) {
            const p = view.toScreen(map.river.points[2][0], map.river.points[2][1]);
            halo(ctx, map.river.name, p.x, p.y, '#2f6f9f', 'italic 13px system-ui, sans-serif');
        }
        if (view.zoom >= 1.5) map.parks.forEach(pk => {
            const p = view.toScreen((pk.left + pk.right) / 2, pk.top + 30);
            halo(ctx, pk.name, p.x, p.y, '#2f6a2a', 'italic 12px system-ui, sans-serif');
        });
        if (view.zoom >= state.detailZoom) {
            for (const street of map.avenues) for (let y = 175; y < map.height; y += 350) {
                if (y < world.top || y > world.bottom || street.x1 < world.left || street.x1 > world.right) continue;
                const p = view.toScreen(street.x1, y);
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-Math.PI / 2);
                halo(ctx, street.name, 0, 0, C.streetLabel, '11px system-ui, sans-serif'); ctx.restore();
            }
            for (const street of map.streets) for (let x = 150; x < map.width; x += 350) {
                if (x < world.left || x > world.right || street.y1 < world.top || street.y1 > world.bottom) continue;
                const p = view.toScreen(x, street.y1);
                halo(ctx, street.name, p.x, p.y, C.streetLabel, '11px system-ui, sans-serif');
            }
        }
        map.landmarks.forEach((l, i) => {
            const pin = view.pin(i);
            if (pin.x < v.left - 40 || pin.x > v.right + 40 || pin.y < v.top - 40 || pin.y > v.bottom + 40) return;
            const hovered = state.hover === i, open = state.open === i;
            if (pin.entrance) {
                // Entrance marker (▲) at the authored point, shown only at street-level zoom.
                const e = pin.entrance;
                ctx.fillStyle = '#1f1f1f';
                ctx.beginPath(); ctx.moveTo(e.x, e.y - 6); ctx.lineTo(e.x + 6, e.y + 5); ctx.lineTo(e.x - 6, e.y + 5); ctx.closePath(); ctx.fill();
            }
            const r = open ? 10 : hovered ? 9 : 6;
            const cx = pin.x, cy = pin.y;
            if (open || hovered) {
                ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
                ctx.fillStyle = open ? 'rgba(247, 190, 72, 0.9)' : 'rgba(81, 160, 255, 0.55)'; ctx.fill();
            }
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = kindColor(l.kind); ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
            if (view.zoom >= state.labelZoom || hovered || open) {
                halo(ctx, l.name, cx, cy - r - 10, C.label, (open || hovered ? 'bold ' : '') + '12px system-ui, sans-serif');
            }
        });
        ctx.restore();
    }
    /* Whole-map overview with the current viewport outline; identical for every scenario (no target cue). */
    function drawOverview(ctx, map, rect, world) {
        const s = Math.min(rect.width / map.width, rect.height / map.height);
        ctx.save();
        ctx.fillStyle = 'rgba(20, 28, 38, 0.85)';
        ctx.fillRect(rect.left - 2, rect.top - 2, rect.width + 4, rect.height + 4);
        ctx.beginPath(); ctx.rect(rect.left, rect.top, rect.width, rect.height); ctx.clip();
        ctx.translate(rect.left, rect.top); ctx.scale(s, s);
        ctx.fillStyle = C.land; ctx.fillRect(0, 0, map.width, map.height);
        map.parks.forEach(p => { ctx.fillStyle = C.park; ctx.fillRect(p.left, p.top, p.right - p.left, p.bottom - p.top); });
        ctx.strokeStyle = C.water; ctx.lineWidth = map.river.halfWidth * 2; ctx.lineJoin = 'round';
        polyline(ctx, map.river.points); ctx.stroke();
        ctx.strokeStyle = C.street; ctx.lineWidth = 30;
        for (const st of map.avenues.concat(map.streets)) { ctx.beginPath(); ctx.moveTo(st.x1, st.y1); ctx.lineTo(st.x2, st.y2); ctx.stroke(); }
        ctx.fillStyle = '#5a5a5a';
        map.landmarks.forEach(l => { ctx.beginPath(); ctx.arc(l.point[0], l.point[1], 40, 0, Math.PI * 2); ctx.fill(); });
        ctx.strokeStyle = '#e63d2e'; ctx.lineWidth = 3 / s;
        ctx.strokeRect(Math.max(0, world.left), Math.max(0, world.top), Math.min(map.width, world.right) - Math.max(0, world.left),
            Math.min(map.height, world.bottom) - Math.max(0, world.top));
        ctx.restore();
    }
    return { drawMap, drawOverview, kindColor };
});
