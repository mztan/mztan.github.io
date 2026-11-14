# Photo crop task (`stp_photo_crop`)

A jvision-only STP dogfooding task: browse a photo gallery, open the requested photo and crop it to a shown composition. It exercises scrolling, pointing, zooming, panning, dragging crop handles and switching between those gestures. Files:

- `photo-crop.js`: pure task model (state, layout, view transform, gesture ownership, evaluation, summaries, telemetry, export). No DOM, timers or uploads.
- `touchpad/photo-scenes.js`: paints the scenes from deterministic specs.
- `touchpad/crop.html`, `touchpad/crop-task.js`: the canvas page, input wiring, results dialog and transport hand-off.
- Tests: `tests/photo-crop.test.js` (model, evaluator, telemetry), `tests/path-pages.test.js` (real page script against a fake DOM), golden row `tests/fixtures/photo-crop-intent-row.json`.

All results here come from simulated input (Node tests and a Skia canvas render). None of it is real-browser, WebView or STP-hardware verification.

## Flow

1. **Instructions.** The page states the request ("Find the red backpack on the bench. Open the photo and crop around the backpack, keeping the entire backpack visible."), shows the reference composition and lists the gestures. Nothing is timed until **Start**.
2. **Gallery.** 32 thumbnails in a 4-column grid; 2.6 rows are visible. The requested photo (`ph18`, index 17, row 5) always starts below the viewport, and three rows follow it, so overshoot is possible. Distractors are plausible: a blue, orange, green or purple backpack on the same bench, a red backpack on a rock, on the grass or beside the bench, red or blue totes, a red jacket, and empty benches. Every thumbnail opens, and **‹ Gallery** returns.
3. **Crop editor.** The photo is fitted (letterboxed) in the viewport, with a crop rectangle that starts as the whole photo. A persistent side panel shows **Reference** (the authored target crop) and **Your crop** (live). The toolbar has **‹ Gallery**, **−**, **+**, **Reset** and **Apply**, with hover and pressed states. The hovered or dragged handle is highlighted and enlarged, and the cursor shape follows the owner.
4. **Submission and recovery.** **Apply** evaluates the crop. A failure names the edge to move ("Part of the red backpack on the bench is cut off. Move the right edge out.", "Bring the left edge in…"), and editing continues. Apply on a distractor says it isn't the requested photo. A passing crop ends the interaction timer. The results dialog and optional 1–5 rating come after, outside the timer. **Skip task** and **Exit** are available throughout; Exit before Start records an unstarted run.

Images are original drawn scenes defined in code (no photographs, people, personal data or third-party assets), with deterministic IDs, order, dimensions (1500×1000, 1600×1200, 1200×1500) and seeds. A port to the native QA app could swap in licensed photos without changing the geometry or telemetry.

## Gesture ownership

Ownership is decided once, at press, and kept until release or cancellation (pointer capture), so gestures never compete:

| Input | Owner |
| --- | --- |
| Press within 12 CSS px of a crop corner | resize that corner (`nw`, `ne`, `se`, `sw`); corners win over edges |
| Press within 12 px of an edge (zones may extend 12 px past the viewport) | resize that edge (`n`, `e`, `s`, `w`) |
| Press inside the crop | move the crop |
| Press elsewhere on the viewport | pan the image |
| Toolbar press | button; activates on release over the same button |
| Wheel without ctrl (two-finger scroll) | gallery: scroll; editor: pan |
| Wheel with ctrl (browser pinch) or −/+ | zoom about the pointer or center, 100–800% |

A drag starts when the pointer moves more than 8 px (touch slop) from the press. The full delta from the press point is applied, so nothing is lost to the slop. Wheel packets during an active drag are ignored and counted (`wheel_ignored_during_drag_count`). A second pointer cancels the gesture. Wheel adjustments are segmented: a segment ends after 250 ms without packets or when the kind (pan or zoom) changes.

## Geometry

Crops, subject bounds, the target and pan amounts are original-image pixels. Screen interactions go through the inverse view transform `image = center + (screen − viewportCenter) / (fitScale × zoom)`, where `fitScale = min(viewport.w / image.w, viewport.h / image.h)`. Event coordinates are CSS px, so `devicePixelRatio` doesn't matter. The view is clamped so the image is centered when smaller than the viewport and otherwise leaves no gap. Zoom keeps the image point under the anchor fixed. Zooming and panning never change the crop, and that's tested. The crop stays inside the image, with a minimum size of 64×64 image px. Moving keeps the crop's size and clamps at the image edges. A release outside the editor (delivered through pointer capture) keeps the clamped geometry. A cancelled gesture (`pointercancel`, lost capture, focus loss, page hidden, resize, stale or out-of-order event, second pointer) restores the crop and view from before the gesture and emits `adjustment_cancelled` with the reason.

Scenario `red_backpack_bench_v1` (seed 2093) on `ph18` (1500×1000): subject S = the drawn backpack's bounds `{760, 430, 960, 690}`. Target T = `{690, 370, 1040, 740}`, the authored composition `ph18_backpack_crop_v1`. Coordinates are left, top, right, bottom.

## Evaluation (`evaluator_version` 1)

For a submitted crop C:

- Crop IoU = area(C ∩ T) / area(C ∪ T)
- Subject coverage = area(C ∩ S) / area(S). If the subject isn't annotated, it's `null` with reason `no_subject_annotation`, never 0.
- Excess surrounding area = area(C outside T) / area(C)
- Signed edge errors in image px. Positive means the crop edge lies outside T (looser): left = T.left − C.left, right = C.right − T.right, top = T.top − C.top, bottom = C.bottom − T.bottom.
- Normalized edge errors: |left| / image width, |right| / width, |top| / image height, |bottom| / height. The mean of the four is the **mean absolute normalized edge error**.

Before dividing, the evaluator checks for a positive image size and a finite, non-empty crop and target inside the image. A failed check makes every metric `null`, with reason `invalid_image_size`, `invalid_target` or `invalid_crop`. Apply on a distractor gives `null` metrics with reason `wrong_photo`.

**Success thresholds** are configurable through `PhotoCropTrials({ thresholds })`. They are **prototype task tolerances, not validated STP quality gates**:

| Criterion | Initial value | Rationale |
| --- | --- | --- |
| `min_iou` | 0.80 | About ±20 image px per edge on the 350×370 target, or 8–10 CSS px at fit zoom on a ~760 px viewport. Precise, but achievable without zoom; zoom makes it easier. |
| `min_subject_coverage` | 0.99 | "Keep the entire backpack visible", with about 1% slack for edge rounding. |
| `max_excess_ratio` | 0.20 | Mostly implied by IoU ≥ 0.8; it keeps a loose crop around a correct one from passing. |
| `max_mean_edge_error_norm` | 0.03 | About 45 px horizontally or 30 px vertically on average. |

## Measurements

Durations use the page's monotonic clock (`performance.now()`) from Start, and the instruction and rating time is excluded. Times accumulate when the user goes back to an earlier phase. `gallery_ms + other_photo_ms + editor_ms = duration_ms`, which is tested.

| Field | Definition |
| --- | --- |
| `duration_ms` | Start to the successful Apply, Skip or Exit. |
| `gallery_ms` | Time on the gallery, including returns. |
| `other_photo_ms` | Time with a photo other than the requested one open. |
| `editor_ms` | Time with the requested photo open, viewing or adjusting the crop (includes recovery). |
| `recovery_ms` | From each unsuccessful Apply to the next Apply, or to the end. |
| `find_ms` | Start to the first opening of the requested photo. |
| `wrong_photo_open_count`, `photo_open_count`, `backtrack_count` | Distractor opens, all opens, and returns to the gallery. Exploratory navigation, not an STP failure by itself. |
| `submit_count`, `failed_submit_count`, `retry_count`, `reset_count` | Applies, unsuccessful applies, applies after an unsuccessful one, and Resets. |
| `completed_adjustments` / `cancelled_adjustments` | Per type: `move`, `pan`, `zoom` and `resize_<handle>` for all eight handles. |
| `drag_start_count` | Presses held past the 8 px slop, any owner (the established `stp_drag_attempt_count` meaning). |
| `press_without_drag_count` | Presses on the crop or a handle released within the slop. They describe observed input only; no intended handle is inferred. |
| `unhandled_click_count` | Press and release that did nothing: gallery gaps, the viewport outside the crop without a drag, toolbar gaps, the reference panel. |
| `button_press_without_action_count` | Button or thumbnail presses released elsewhere. |
| `scroll_click_count` | Gallery presses within 250 ms of the last wheel packet. That 250 ms after a packet is the **active-scrolling interval**. |
| `scroll_distance_px`, `scroll_reversal_count` | Applied gallery scroll; direction changes after at least 0.25 row of opposite travel. |
| `scroll_overshoot_count`, `scroll_overshoot_max_px`, `corrective_scroll_px` | Using the scroll direction needed to reveal the requested thumbnail, and its visibility band (the offsets that show its whole cell): entries past the far side of the band, the furthest distance past it, and scrolling back after the first overshoot. If the thumbnail were initially visible these would be `null` with reason `target_initially_visible`; this layout prevents that. |
| `pan_reversal_count`, `zoom_reversal_count` | Pan direction changes per axis after 24 CSS px of opposite travel; zoom direction changes after a 5% opposite change. |
| `hold_travel_px` | Pointer travel while holding during completed drags, mouse-type pointers only. A cancelled drag's travel is discarded, so travel never spans a broken segment. It's `null` with reason `non_cursor_pointer` after any touch or pen drag, or `out_of_order_input`. |
| `final_*` | IoU, subject coverage, excess and mean edge error of the last submission, or `null` with reason `no_submission` or `wrong_photo`. |

Missing values are `null` with a reason in `summary.missing`. A measured zero stays 0. Run states are distinct: `completed`; `abandoned` with `end_reason` `skipped` or `exited`; and `unstarted` (Exit before Start, `measurement_started: 0`). Interrupted gestures, focus loss, resizing (which cancels the gesture and marks the submission's coverage invalid), stale events and out-of-order timestamps are handled as described above. These are measures of delivered application behavior, not of detector accuracy or hardware-only drift.

### Per-submission record

Each Apply appends an immutable (deep-frozen) record. Later edits never change it:

`index`, `elapsed_ms`, `editor_elapsed_ms`, `image_id`, `is_target_photo`, `crop` (image px), `iou`, `subject_coverage`, `excess_ratio`, `edge_error_px`, `edge_error_norm`, `mean_edge_error_norm`, `success`, `failures` (from `iou`, `subject_cut`, `excess_area`, `edge_error`, `wrong_photo`, `invalid_geometry`), `missing`, `thresholds`, `evaluator_version`, `adjustments_since_previous`, `cancellations_since_previous`, `measurement_valid` and `invalid_reasons` (`out_of_order_input`, `resized_during_editing`), and `input_source`.

## Telemetry

### Transport and column contract

The task uses the existing **web transport**, `jvision/transport.js`, and its existing touchpad observation contract. That contract mirrors the `surface_inputs_intent_touchpad_event` columns read by the STP dashboard (https://surface-inputs-quality.internalmeta.com/stp). When a native host has completed the handshake (`SurfaceInputsTransport.isNative()`), a completed run enqueues exactly one observation. In a plain browser nothing is sent, and the dialog says so. The only transport change admits the path-task activity `stp_photo_crop`; existing activity IDs, fields, types and bounds are unchanged.

No new columns. The row uses `metric_family = drag`, like `stp_file_drag`, and fills only the columns whose established semantics match:

| Column | Value |
| --- | --- |
| `activity_id` | `stp_photo_crop` (dashboard task ID, as for the QA app's path tasks) |
| `elapsed_ms` | Start to the successful Apply |
| `metric_family` | `drag` |
| `details_version` | 1 |
| `stp_drag_target_text` | `red backpack on the bench` (bounded target text) |
| `stp_drag_attempt_count` | delivered drag starts: presses held past the touch slop, any owner (same as file drag) |
| `stp_drag_first_attempt_selected_target`, `stp_drag_wrong_selection_count`, `stp_drag_selection_start_failure_count`, `stp_drag_nothing_selected_count`, `stp_drag_selection_unchanged_count`, tap-form counts | `-1` (no matching meaning) |
| cursor, click, scrolling and zooming columns | `-1` / `""` (other families) |
| `source`, `session_id`, `stp_model_version`, `stp_model_flow_id` | set by the native host; the page never supplies identity or model attribution |

`details` (at most 512 UTF-8 bytes) keeps the established QA path envelope and key order: `details_version`, `target_index`, `target_count`, `target_status`, `trace_valid`, `run_sequence`, `task_index`, `interaction` (`PhotoCrop`), `stp_condition` (`red_backpack_bench_v1`, the scenario ID and version), then `qa_path_v: 1` and `qa_path`. It adds `crop_eval_v` (evaluator and thresholds version), `qa_subs_n` (submissions) and `qa_subs` (the last three submissions as `[iou, subject_coverage, mean_edge_error_norm, success]`). `qa_path` is a fixed 29-element array (`PATH_FIELDS` in `photo-crop.js`; the dashboard's `PATH_PROTOCOLS.stp_photo_crop.packed` must match). Values are non-negative and rounded to 0.001, and unobservable values are `null`:

```
stp_crop_gallery_ms, stp_crop_other_photo_ms, stp_crop_editor_ms, stp_crop_recovery_ms,
stp_crop_wrong_photo_open_count, stp_crop_backtrack_count, stp_crop_submit_count, stp_crop_failed_submit_count,
stp_crop_reset_count, stp_crop_move_count, stp_crop_edge_resize_count, stp_crop_corner_resize_count,
stp_crop_cancelled_adjust_count, stp_crop_pan_count, stp_crop_pan_reversal_count, stp_crop_zoom_count,
stp_crop_zoom_reversal_count, stp_crop_unhandled_click_count, stp_crop_scroll_distance_px,
stp_crop_scroll_reversal_count, stp_crop_scroll_overshoot_count, stp_crop_corrective_scroll_px,
stp_crop_scroll_click_count, stp_crop_hold_travel_px, stp_crop_final_iou, stp_crop_final_subject_coverage,
stp_crop_final_excess_ratio, stp_crop_final_mean_edge_error_norm, stp_crop_success
```

If `details` would exceed 512 bytes, `qa_subs` is dropped first (`qa_subs_truncated: true`), then `qa_path` (`qa_path_truncated: true`). A worst-case test with 7-digit values stays within the bound by dropping only `qa_subs`. As in the QA producer, abandoned and unstarted runs emit no row and stay in local results. Raw pointer traces, screen coordinates, images and gesture events never leave the browser.

**Integration gap:** the dashboard currently admits only rows with `source = "qa_tool"` (`lib/stpMetrics.ts`), and fbsource has no native receiver for this web transport. The row is contract-compatible and parses in the dashboard (draft D131984777 adds `PATH_PROTOCOLS.stp_photo_crop` and tests it on this exact row), but it won't appear on `/stp` until a native host forwards it with an admitted source.

### Example complete row

From the golden run in `tests/fixtures/photo-crop-intent-row.json` (synthetic: a distractor detour, one loose Apply, then a correct one). `source` and `session_id` are native-supplied placeholders:

```json
{
  "source": "qa_tool",
  "session_id": "synthetic-session",
  "activity_id": "stp_photo_crop",
  "elapsed_ms": 3054,
  "metric_family": "drag",
  "details": "{\"details_version\":1,\"target_index\":0,\"target_count\":1,\"target_status\":\"completed\",\"trace_valid\":true,\"run_sequence\":1,\"task_index\":1,\"interaction\":\"PhotoCrop\",\"stp_condition\":\"red_backpack_bench_v1\",\"crop_eval_v\":1,\"qa_path_v\":1,\"qa_path\":[1076,550,1428,1114,1,1,2,1,0,0,0,4,0,0,0,0,0,0,509.5,0,0,0,0,662.5,1,1,0,0,1],\"qa_subs_n\":2,\"qa_subs\":[[0.453,1,0.071,0],[1,1,0,1]]}",
  "details_version": 1,
  "stp_model_version": "",
  "stp_model_flow_id": "",
  "stp_cursor_movement_target_radius_px": -1,
  "stp_cursor_movement_start_distance_px": -1,
  "stp_cursor_movement_time_ms": -1,
  "stp_cursor_movement_stroke_count": -1,
  "stp_cursor_movement_first_stroke_share": -1,
  "stp_cursor_movement_small_strokes_far_from_target": -1,
  "stp_cursor_movement_small_strokes_near_target": -1,
  "stp_cursor_movement_target_entries": -1,
  "stp_cursor_movement_total_cursor_distance_px": -1,
  "stp_cursor_movement_index_of_difficulty_bits": -1,
  "stp_cursor_movement_overshoot_count": -1,
  "stp_cursor_movement_endpoint_error_px": -1,
  "stp_clicks_target_count": -1,
  "stp_clicks_completed_count": -1,
  "stp_clicks_total": -1,
  "stp_clicks_on_target": -1,
  "stp_clicks_miss_count": -1,
  "stp_drag_target_text": "red backpack on the bench",
  "stp_drag_attempt_count": 4,
  "stp_drag_first_attempt_selected_target": -1,
  "stp_drag_selection_start_failure_count": -1,
  "stp_drag_nothing_selected_count": -1,
  "stp_drag_selection_unchanged_count": -1,
  "stp_drag_wrong_selection_count": -1,
  "stp_drag_tap1_5_count": -1,
  "stp_drag_tap2_5_count": -1,
  "stp_drag_tap3_5_count": -1,
  "stp_scrolling_time_ms": -1,
  "stp_scrolling_start_distance_px": -1,
  "stp_scrolling_direction": "",
  "stp_scrolling_stroke_count": -1,
  "stp_scrolling_dial_in_stroke_count": -1,
  "stp_scrolling_empty_stroke_count": -1,
  "stp_scrolling_first_stroke_share": -1,
  "stp_scrolling_overshoot_count": -1,
  "stp_scrolling_overshoot_max_px": -1,
  "stp_scrolling_cursor_travel_without_scroll_px": -1,
  "stp_zooming_time_ms": -1,
  "stp_zooming_direction": "",
  "stp_zooming_required_change_percent": -1,
  "stp_zooming_pinch_count": -1,
  "stp_zooming_dial_in_pinch_count": -1,
  "stp_zooming_empty_pinch_count": -1,
  "stp_zooming_first_pinch_share": -1,
  "stp_zooming_overshoot_count": -1,
  "stp_zooming_overshoot_max_percent": -1,
  "stp_zooming_cursor_travel_while_zooming_px": -1,
  "stp_zooming_cursor_travel_without_zoom_px": -1
}
```

## Local results and export

Every finished run is saved with the existing local results (`jvision-path-results-v1`, through `path-results.js`) when the user saves or skips the rating. The run record contains the task row plus `telemetry`, the export below. **Export saved results** downloads it as JSON.

Export schema (`schema_version` 1): `schema_version`, `task_id`, `task_version`, `run_id` (random, local, not a person or device identifier; the page has no session identity, matching the other jvision path tasks), `scenario_id`, `scenario_seed`, `image_id`, `authored_target_id`, `image_size`, `target_crop`, `subject_bounds`, `evaluator_version`, `thresholds`, `status`, `end_reason`, `trace_valid`, `summary`, `submissions` (at most 30; `submissions_dropped`), `events` (at most 300; `events_dropped`, `events_truncated`), and `intent_observation`. The serialized export is capped at 96 KB. Events are dropped from the end, keeping the terminal event, and the truncation is reported.

Each event has `event_sequence`, `elapsed_ms` (monotonic, from Start), `type`, `phase` (`gallery`, `editor`, `rating`), and, where relevant, `image_id`, `input_source` (`mouse`, `touch` or `pen` from `PointerEvent.pointerType`, or `wheel` / `wheel_ctrl`), `kind`, `handle` and `reason`. Run-level fields (task, run, scenario) appear once in the envelope and apply to every event. Types: `task_started`, `phase_entered`, `photo_opened`, `returned_to_gallery`, `adjustment_started`, `adjustment_finished` (duration, changed, edge deltas or pan or zoom change, hold travel, `outside_editor`), `adjustment_cancelled`, `crop_reset`, `crop_submitted`, `task_completed`, `task_skipped` and `task_exited`. Events are emitted at gesture boundaries only. Continuous movement is aggregated, never logged per packet.

Example (synthetic run; the event and submission lists are shortened here):

```json
{
  "schema_version": 1,
  "task_id": "stp_photo_crop",
  "task_version": "1.0",
  "run_id": "crop_3f9c2a71b0d84e15",
  "scenario_id": "red_backpack_bench_v1",
  "scenario_seed": 2093,
  "image_id": "ph18",
  "authored_target_id": "ph18_backpack_crop_v1",
  "image_size": {
    "width": 1500,
    "height": 1000
  },
  "target_crop": {
    "left": 690,
    "top": 370,
    "right": 1040,
    "bottom": 740
  },
  "subject_bounds": {
    "left": 760,
    "top": 430,
    "right": 960,
    "bottom": 690
  },
  "evaluator_version": 1,
  "thresholds": {
    "min_iou": 0.8,
    "min_subject_coverage": 0.99,
    "max_excess_ratio": 0.2,
    "max_mean_edge_error_norm": 0.03
  },
  "thresholds_note": "prototype task tolerances, not validated STP quality gates",
  "status": "completed",
  "end_reason": "completed",
  "trace_valid": true,
  "summary": {
    "duration_ms": 2654,
    "gallery_ms": 676,
    "other_photo_ms": 550,
    "editor_ms": 1428,
    "recovery_ms": 1114,
    "find_ms": 1226,
    "photo_open_count": 2,
    "wrong_photo_open_count": 1,
    "backtrack_count": 1,
    "submit_count": 2,
    "failed_submit_count": 1,
    "reset_count": 0,
    "retry_count": 1,
    "completed_adjustments": {
      "move": 0,
      "pan": 0,
      "zoom": 0,
      "resize_nw": 2,
      "resize_n": 0,
      "resize_ne": 0,
      "resize_e": 0,
      "resize_se": 2,
      "resize_s": 0,
      "resize_sw": 0,
      "resize_w": 0
    },
    "cancelled_adjustments": {
      "move": 0,
      "pan": 0,
      "zoom": 0,
      "resize_nw": 0,
      "resize_n": 0,
      "resize_ne": 0,
      "resize_e": 0,
      "resize_se": 0,
      "resize_s": 0,
      "resize_sw": 0,
      "resize_w": 0
    },
    "drag_start_count": 4,
    "press_without_drag_count": 0,
    "button_press_without_action_count": 0,
    "wheel_ignored_during_drag_count": 0,
    "pan_reversal_count": 0,
    "zoom_reversal_count": 0,
    "unhandled_click_count": 0,
    "scroll_click_count": 0,
    "scroll_distance_px": 550,
    "scroll_reversal_count": 0,
    "scroll_overshoot_count": 0,
    "scroll_overshoot_max_px": 0,
    "corrective_scroll_px": 0,
    "hold_travel_px": 662.5,
    "final_iou": 1,
    "final_subject_coverage": 1,
    "final_excess_ratio": 0,
    "final_mean_edge_error_norm": 0,
    "success": 1,
    "missing": {}
  },
  "submissions": [
    {
      "index": 0,
      "elapsed_ms": 1540,
      "editor_elapsed_ms": 314,
      "image_id": "ph18",
      "is_target_photo": true,
      "crop": {
        "left": 600,
        "top": 300,
        "right": 1150,
        "bottom": 820
      },
      "iou": 0.453,
      "subject_coverage": 1,
      "excess_ratio": 0.547,
      "edge_error_px": {
        "left": 90,
        "right": 110,
        "top": 70,
        "bottom": 80
      },
      "edge_error_norm": {
        "left": 0.06,
        "right": 0.073,
        "top": 0.07,
        "bottom": 0.08
      },
      "mean_edge_error_norm": 0.071,
      "success": false,
      "failures": [
        "iou",
        "excess_area",
        "edge_error"
      ],
      "missing": {},
      "thresholds": {
        "min_iou": 0.8,
        "min_subject_coverage": 0.99,
        "max_excess_ratio": 0.2,
        "max_mean_edge_error_norm": 0.03
      },
      "evaluator_version": 1,
      "adjustments_since_previous": 2,
      "cancellations_since_previous": 0,
      "measurement_valid": true,
      "invalid_reasons": [],
      "input_source": "mouse"
    }
  ],
  "submissions_dropped": 0,
  "events": [
    {
      "event_sequence": 1,
      "elapsed_ms": 0,
      "type": "task_started",
      "phase": "instructions",
      "scenario_id": "red_backpack_bench_v1"
    },
    {
      "event_sequence": 5,
      "elapsed_ms": 1176,
      "type": "returned_to_gallery",
      "phase": "editor",
      "image_id": "ph17",
      "input_source": "mouse"
    },
    {
      "event_sequence": 9,
      "elapsed_ms": 1262,
      "type": "adjustment_started",
      "phase": "editor",
      "kind": "resize",
      "handle": "nw",
      "image_id": "ph18",
      "input_source": "mouse"
    },
    {
      "event_sequence": 10,
      "elapsed_ms": 1358,
      "type": "adjustment_finished",
      "phase": "editor",
      "kind": "resize",
      "handle": "nw",
      "image_id": "ph18",
      "duration_ms": 96,
      "input_source": "mouse",
      "hold_travel_px": 338.1,
      "outside_editor": false,
      "changed": true,
      "delta": {
        "left": 600,
        "top": 300,
        "right": 0,
        "bottom": 0
      }
    },
    {
      "event_sequence": 18,
      "elapsed_ms": 2654,
      "type": "crop_submitted",
      "phase": "editor",
      "index": 1,
      "image_id": "ph18",
      "success": true,
      "failures": []
    },
    {
      "event_sequence": 20,
      "elapsed_ms": 2654,
      "type": "task_completed",
      "phase": "rating",
      "duration_ms": 2654
    }
  ],
  "events_dropped": 0,
  "events_truncated": false,
  "intent_observation": "(the observation shown above)"
}
```

## Limitations

- Not verified in a real browser, WebView or on STP hardware. Headless Chrome couldn't start in the authoring environment, so the screenshots are Skia renders of the real page canvas driven by synthetic events.
- The page can't see touchpad gesture classification. A trackpad that the browser reports as a mouse counts as `mouse`; pinch arrives as ctrl+wheel and is indistinguishable from ctrl+mouse wheel.
- No dashboard ingestion yet (see the integration gap above). Draft D131984777 adds parsing only and has not landed.
- The canvas editor has no keyboard alternative.
- One authored scenario. Thresholds are untested with participants.
- A page unload mid-task loses the run (local save happens at the end).
