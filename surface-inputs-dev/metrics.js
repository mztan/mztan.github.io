/* Observer calculators. Existing public task timings, geometry and UXR results remain untouched. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SurfaceInputsMetrics = api;
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const clamp = value => Math.max(0, Math.min(1, value));
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    class Cursor {
        constructor(target, at, start = null) {
            this.target = target; this.at = at; this.start = start; this.previous = start;
            this.lastAt = at; this.stroke = null; this.strokes = 0; this.total = 0;
            this.smallFar = 0; this.smallNear = 0; this.entries = 0; this.overshoots = 0;
            this.inside = start ? distance(start, target) <= target.radius : false;
            this.left = false; this.firstEnd = null; this.observed = false;
        }
        edge(point) { return Math.max(0, distance(point, this.target) - this.target.radius); }
        close() {
            if (!this.stroke) return;
            if (this.stroke.travel < 5) {
                if (this.stroke.edge > 50) this.smallFar++; else this.smallNear++;
            }
            this.stroke = null;
        }
        observe(x, y, at) {
            if (!Number.isFinite(x) || !Number.isFinite(y) || at < this.lastAt) return false;
            this.observed = true;
            const point = { x, y }, inside = distance(point, this.target) <= this.target.radius;
            if (inside && !this.inside) { this.entries++; if (this.left) this.overshoots++; }
            if (!inside && this.inside) this.left = true;
            this.inside = inside;
            if (this.previous) {
                const travel = distance(point, this.previous);
                if (travel > 0) {
                    if (!this.stroke || at - this.lastAt > 100) {
                        this.close(); this.strokes++;
                        this.stroke = { edge: this.edge(this.previous), travel: 0 };
                    }
                    this.stroke.travel += travel; this.total += travel;
                    if (this.strokes === 1) this.firstEnd = this.edge(point);
                    this.lastAt = at;
                }
            }
            this.previous = point;
            return true;
        }
        finish(at, endpoint) {
            this.close();
            const startEdge = this.start ? this.edge(this.start) : -1;
            const prefix = 'stp_cursor_movement_';
            const result = {
                target_radius_px: this.target.radius, start_distance_px: startEdge,
                time_ms: this.start ? Math.max(0, at - this.at) : -1,
                stroke_count: this.observed ? this.strokes : -1,
                first_stroke_share: this.firstEnd === null || startEdge < 0 ? -1 : startEdge === 0 ? 0 : clamp((startEdge - this.firstEnd) / startEdge),
                small_strokes_far_from_target: this.observed ? this.smallFar : -1,
                small_strokes_near_target: this.observed ? this.smallNear : -1,
                target_entries: this.observed ? this.entries : -1,
                total_cursor_distance_px: this.observed ? this.total : -1,
                index_of_difficulty_bits: this.start && this.target.radius > 0 ? Math.log2(1 + distance(this.start, this.target) / (2 * this.target.radius)) : -1,
                overshoot_count: this.observed ? this.overshoots : -1,
                endpoint_error_px: endpoint ? distance(endpoint, this.target) : -1
            };
            return Object.fromEntries(Object.entries(result).map(([key, value]) => [prefix + key, value]));
        }
    }
    // Pixel position to an inclusive acceptance band. The band comes from actual
    // highlight/box rectangles, not aggregate UXR distance or gesture counts.
    class Scroll {
        constructor(start, lower, upper) {
            this.start = start; this.lower = lower; this.upper = upper; this.current = start;
            this.lastAt = -Infinity; this.active = null; this.count = 0; this.dial = 0;
            this.empty = 0; this.firstEnd = null; this.overshoots = 0; this.max = 0; this.beyond = false;
        }
        distance(value) { return Math.max(this.lower - value, value - this.upper, 0); }
        close() { if (this.active && this.active.travel < 10) this.empty++; this.active = null; }
        observe(value, at) {
            if (!Number.isFinite(value) || at < this.lastAt) return false;
            if (this.active && at - this.lastAt > 100) this.close();
            if (!this.active) {
                this.count++; if (this.distance(this.current) <= 150) this.dial++;
                this.active = { travel: 0 };
            }
            this.active.travel += Math.abs(value - this.current);
            this.current = value; this.lastAt = at;
            if (this.count === 1) this.firstEnd = value;
            const overshoot = this.start < this.lower ? Math.max(0, value - this.upper) : Math.max(0, this.lower - value);
            if (overshoot > 0 && !this.beyond) this.overshoots++;
            this.beyond = overshoot > 0; this.max = Math.max(this.max, overshoot);
            return true;
        }
        finish() {
            this.close();
            const d = this.distance(this.start), direction = this.start < this.lower ? 1 : -1;
            return {
                stp_scrolling_start_distance_px: d,
                stp_scrolling_stroke_count: this.count,
                stp_scrolling_dial_in_stroke_count: this.dial,
                stp_scrolling_empty_stroke_count: this.empty,
                stp_scrolling_first_stroke_share: this.firstEnd === null ? -1 : d === 0 ? 0 : clamp(direction * (this.firstEnd - this.start) / d),
                stp_scrolling_overshoot_count: this.overshoots,
                stp_scrolling_overshoot_max_px: this.max
            };
        }
    }
    return { Cursor, Scroll };
});
