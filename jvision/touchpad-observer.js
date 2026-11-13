/* Narrow producer hooks. All observations are prescribed targets, never inferred intent. */
(function (win) {
    'use strict';
    const transport = win.SurfaceInputsTransport, metrics = win.SurfaceInputsMetrics;
    let cursor = null, latestPointer = null, scroll = null, selection = null, zoom = null;
    const now = () => Date.now();
    function error(reason) { win.dispatchEvent(new CustomEvent('surface-inputs-transport-error', { detail: { reason } })); }
    function emit(activity, family, started, fields, details = {}) {
        if (!transport.usesNative()) return true;
        try {
            transport.submitTouchpad(Object.assign({ activity_id: activity, metric_family: family,
                elapsed_ms: Math.max(0, now() - started), details: Object.assign({ details_version: 1 }, details) }, fields));
            return true;
        } catch (failure) { error(failure.message); return false; }
    }
    function scrollGeometry() {
        const container = win.document.getElementById('scroll-container');
        const highlight = win.document.querySelector('.highlight'), box = win.document.getElementById('targetbox');
        if (!container || !highlight || !box) return null;
        const h = highlight.getBoundingClientRect(), b = box.getBoundingClientRect(), value = container.scrollTop;
        // value must bring the entire highlight inside the box. Coordinates and
        // scrollTop share CSS pixel units; no legacy rounded offset is reused.
        return { value, lower: value + h.bottom - b.bottom, upper: value + h.top - b.top };
    }
    win.SurfaceInputsTouchpad = {
        resetCursor() { cursor = null; },
        beginCursor(target, practice) {
            const at = now(), geometry = { x: target.x, y: target.y, radius: target.w / 2 };
            cursor = { started: at, practice, total: 0, onTarget: 0,
                accumulator: new metrics.Cursor(geometry, at, latestPointer) };
        },
        cursorMove(x, y) {
            latestPointer = { x, y };
            if (cursor) cursor.accumulator.observe(x, y, now());
        },
        cursorExit() {
            latestPointer = null;
            if (cursor) cursor.interrupted = true;
        },
        cursorClick(x, y, hit) {
            latestPointer = { x, y };
            if (!cursor) return true;
            if (hit && transport.usesNative() && !cursor.practice && !transport.canQueue(2)) {
                error('Native queue full. Current target retained; retry after sink ACK.'); return false;
            }
            cursor.total++;
            if (!hit) return true;
            cursor.onTarget++;
            if (!cursor.practice) {
                const fields = cursor.accumulator.finish(now(), { x, y });
                const traceValid = cursor.accumulator.observed && !!cursor.accumulator.start && !cursor.interrupted;
                if (!traceValid) {
                    for (const key of ['stroke_count', 'first_stroke_share', 'small_strokes_far_from_target',
                        'small_strokes_near_target', 'target_entries', 'total_cursor_distance_px', 'overshoot_count']) {
                        fields['stp_cursor_movement_' + key] = -1;
                    }
                }
                // One acquisition yields two independently typed family observations.
                emit('touchpad_targeting', 'cursor_movement', cursor.started, fields,
                    { cursor_trace: traceValid ? 'observed' : 'unavailable' });
                emit('touchpad_targeting', 'clicks', cursor.started, {
                    stp_clicks_target_count: 1, stp_clicks_completed_count: 1,
                    stp_clicks_total: cursor.total, stp_clicks_on_target: cursor.onTarget,
                    stp_clicks_miss_count: cursor.total - cursor.onTarget
                });
            }
            cursor = null;
            return true;
        },
        beginScroll(practice) {
            const band = scrollGeometry();
            if (!band || band.lower > band.upper || (band.value >= band.lower && band.value <= band.upper)) { scroll = null; return; }
            scroll = { started: now(), practice, band, accumulator: new metrics.Scroll(band.value, band.lower, band.upper) };
        },
        scrollMove() {
            const container = win.document.getElementById('scroll-container');
            if (scroll && container) scroll.accumulator.observe(container.scrollTop, now());
        },
        finishScroll() {
            if (!scroll) return true;
            if (!scroll.practice && !emit('touchpad_scrolling', 'scrolling', scroll.started,
                Object.assign(scroll.accumulator.finish(), {
                    // DOM scroll events omit zero-output native packets. Shared burst
                    // counts/progress cannot be reconstructed from this output-only trace.
                    stp_scrolling_stroke_count: -1,
                    stp_scrolling_dial_in_stroke_count: -1,
                    stp_scrolling_empty_stroke_count: -1,
                    stp_scrolling_first_stroke_share: -1,
                    stp_scrolling_time_ms: now() - scroll.started,
                    stp_scrolling_direction: scroll.band.value < scroll.band.lower ? 'down' : 'up',
                    stp_scrolling_cursor_travel_without_scroll_px: -1
                }))) return false;
            scroll = null;
            return true;
        },
        beginSelection(practice) {
            const highlight = win.document.querySelector('.highlight');
            selection = highlight ? { started: now(), practice, target: highlight.textContent } : null;
        },
        finishSelection() {
            if (!selection) return true;
            // Exact task target is known; stable selectionchange callbacks are not
            // physical drag attempts. Do not relabel them as attempt/tap metrics.
            if (!selection.practice && !emit('touchpad_selection', 'drag', selection.started,
                { stp_drag_target_text: selection.target }, { completion: 'exact_selection' })) return false;
            selection = null; return true;
        },
        beginZoom(scale, targetScale, lower, upper, practice) {
            zoom = { started: now(), scale, targetScale, lower, upper, practice };
        },
        finishZoom() {
            if (!zoom) return true;
            // Raw task geometry and completion time are measured. UXR gestureCount
            // includes wheel/gesture callbacks and is NOT a shared pinch count.
            if (!zoom.practice && !emit('touchpad_zoom', 'zooming', zoom.started, {
                stp_zooming_time_ms: now() - zoom.started,
                stp_zooming_direction: zoom.targetScale > zoom.scale ? 'in' : 'out',
                stp_zooming_required_change_percent: Math.abs(zoom.targetScale / zoom.scale - 1) * 100,
                stp_zooming_pinch_count: -1, stp_zooming_dial_in_pinch_count: -1,
                stp_zooming_empty_pinch_count: -1, stp_zooming_first_pinch_share: -1,
                stp_zooming_overshoot_count: -1, stp_zooming_overshoot_max_percent: -1,
                stp_zooming_cursor_travel_while_zooming_px: -1,
                stp_zooming_cursor_travel_without_zoom_px: -1
            }, { lower_scale: zoom.lower, upper_scale: zoom.upper })) return false;
            zoom = null; return true;
        }
    };
})(window);
