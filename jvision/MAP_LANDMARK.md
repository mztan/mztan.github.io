# Map landmark task (`stp_map_landmark`)

A jvision-only STP dogfooding task: navigate a fictional city map to a requested landmark, frame it at a useful zoom, and select it. It exercises pointing, holding, panning, zooming, precise selection and the switches between them. It follows the same structure and telemetry contract as [Photo crop](PHOTO_CROP.md). Files:

- `map-landmark.js`: pure model (map data, camera, transforms, gesture ownership, view evaluation, geometric events, summaries, telemetry, export).
- `touchpad/map-render.js`: map, marker and overview painter.
- `touchpad/map.html`, `touchpad/map-task.js`: the page, input wiring, results dialog and transport hand-off.
- Tests: `tests/map-landmark.test.js` (model, evaluator, telemetry), `tests/path-pages.test.js` (the real page script against a fake DOM), golden row `tests/fixtures/map-landmark-intent-row.json`.

Everything here was checked with simulated input (Node tests and a Skia canvas render), not in a real browser, a WebView or on STP hardware.

## Scenario (protocol version 1)

- **Map** `lark_city_v1`: 4000×3000 world units, bundled and generated from seed 4207. No external map service, API key, location access or real location data. It has six named avenues (Alder, Birch, Cedar, Elm, Dock, Fir), five named streets (North, Mill, Canal, Harbor, South), unnamed minor streets, the Lark River, three parks, seeded building blocks and 14 landmarks. Each landmark has an ID, a name, a kind, a world footprint, an authored interaction point (its entrance) and a description.
- **Scenario** `riverside_museum_v1` (seed 4207): "Find Riverside Museum. Zoom in until its entrance and the surrounding streets are visible, then select the museum."
  - Requested landmark `lm_riverside_museum`: footprint `{2850, 1840, 3010, 1960}`, entrance `(2930, 1966)` on Harbor St. Box coordinates are left, top, right, bottom.
  - Required region `{2780, 1800, 3040, 2030}`: the museum, its entrance, Dock Ave, Harbor St and the river bank.
  - Start camera: center `(1000, 700)`, zoom 1. The museum is off-screen to the south-east, so reaching it takes both panning (about 0.5 map widths) and zooming (+1.3 levels or more).
  - Distractors: Riverside Market, Riverside Theatre, Riverside Library, Riverview Museum of Art, Harbor Maritime Museum, Central Station, City Hall, Mill Street School, North Tower, Willow Park, Harbor Green, Old Stone Bridge and Canal Street Hospital.

## Flow

1. **Instructions.** The prompt, a reference thumbnail (the required region at street-level zoom), a description of where the museum is ("purple building on the south bank, at Dock Ave and Harbor St"), and the gesture list. Nothing is timed until **Start**.
2. **Map.** Labelled landmarks (names from zoom 0.8; street names and entrance markers ▲ from zoom 2.3). The toolbar keeps the task prompt ("Find: Riverside Museum"), **Reset view**, the zoom level, and **−** and **+**. A fixed overview map (whole city plus the viewport outline, identical for every scenario, with no target cue) sits top-right. **Skip task** and **Exit** sit below the map. States: a hovered marker gets a blue ring, an open (selected) one an amber ring, and a pan drag shows a "Panning" chip and the grabbing cursor.
3. **Selection.** A short click on a marker, entrance or footprint opens that landmark's info panel. This is an exploratory opening, recorded separately. **Choose this landmark** commits. A wrong landmark gives "That's Riverside Theatre, not Riverside Museum…", and the right one at an unsuitable view gives a specific instruction ("Zoom in more…", "Zoom out a little…", "… is hidden under the panel…", "Pan so…"). The panel stays open, so you can adjust and choose again. The advice is replaced by a neutral "Adjust the view, then choose … again" after the next adjustment, so it never signals whether the new view qualifies. A successful commit stops the interaction timer. The results dialog and optional rating come after.

## Gesture ownership

The owner is decided at press and kept until release (pointer capture):

| Input | Owner / effect |
| --- | --- |
| Press on a toolbar or panel button | the button; activates on release over the same button |
| Press on the overview or panel body | nothing (an unhandled click) |
| Press on the map, moving more than 8 px | **pan**; the grabbed world point follows the pointer, and the full offset from the press is applied. A pan release never activates the landmark under it. |
| Press on the map, released within 8 px | a **click**: opens the landmark under it (nearest pin or entrance within 16 px, else the smallest footprint), or closes an open panel, otherwise unhandled |
| Wheel without ctrl (two-finger scroll) | pan by the delivered pixels |
| Wheel with ctrl (browser pinch) | zoom anchored at the **cursor**: the world point under the cursor stays fixed; 100 px of wheel delta = 1 zoom level |
| − / + | ±0.5 zoom level, anchored at the **viewport center** |

Wheel input while a drag owns the pointer is ignored and counted. A second pointer cancels the gesture. Wheel adjustments are segmented: a segment ends 250 ms after the last packet or when the kind changes.

## Geometry

Zoom `z` is a log2 level in [0, 5]. Scale = 0.25 × 2^z CSS px per world unit, so zoom 2 is 1 px per unit. `screen = viewportCenter + (world − camera) × scale` and `world = camera + (screen − viewportCenter) / scale`. The same two transforms drive rendering, hit testing, panning, zoom anchoring and evaluation. The camera is clamped so the map fills the viewport, or is centered when it's smaller. A resize keeps the camera center and zoom (world values), cancels any gesture in progress, and marks the run's coverage invalid. The usable viewport is the map area below the toolbar. The overview always occludes part of it, and the info panel does while it's open.

## Evaluation (`evaluator_version` 1)

At each committed selection, in world coordinates:

- `correct_landmark`
- `zoom` and `zoom_error`: signed distance outside the accepted range in log2 levels, 0 inside it.
- `center_offset_norm`: Chebyshev distance from the usable viewport's center, as a fraction of its half-width and half-height. 1 is the edge.
- `point_in_viewport` and `obscured_by` (`overview`, `panel`) for the authored interaction point.
- `region_visible`: area of the required region inside the usable viewport and not under an overlay, divided by the region's area. It's `null` (reason `wrong_landmark`) for other landmarks.
- `selection`: where the click that opened the panel landed, relative to the interaction point. Offset in world units, distance normalized by the 16 px marker radius at that zoom, and whether it fell inside the footprint.

**Success criteria**, configurable through `MapLandmarkTrials({ thresholds })`. They are **prototype task criteria, not validated STP quality gates**:

| Criterion | Initial value | Rationale |
| --- | --- | --- |
| correct landmark | required | |
| interaction point inside the usable viewport, not under the panel or overview | required | |
| `zoom_min` | 2.3 | Street names and entrances appear at 2.3 (1.23 px per unit), the "useful zoom". |
| `zoom_max` | 3.3 | 2.46 px per unit; beyond this, the surrounding streets no longer fit on typical displays. |
| `min_region_visible` | 0.90 | Most of the museum, its entrance and both streets visible; allows a slightly cut edge. |

On a 1000×600 canvas the whole 2.3–3.3 range qualifies with the region centered. On an 800×420 canvas only the lower part does, which is why the map stage has a 420 px minimum height. The criteria are evaluated in world units, so results are comparable across display sizes, but a very small viewport can make the region criterion unreachable.

## Target-related geometric events

These are recorded as geometry, without inferring intent:

- **Visibility episode** (`target_visible`): the requested landmark's interaction point enters the usable viewport, not under an overlay.
- **Visibility loss** (`target_visibility_lost`, with reason `left_viewport` or `obscured`): later navigation moves it out.
- **Zoom-range overshoot** (`zoom_range_overshoot`): one continuous zoom adjustment (a pinch segment or a button press) starts below the accepted range and ends above it, or the reverse.
- **Qualifying view**: the requested landmark would pass every view criterion given the current overlays. `qualifying_view_reached` marks the first time, `qualifying_view_lost` marks losses, and a **corrective return** (`corrective_return`) is a later adjustment that restores a qualifying view.

## Measurements

| Field | Definition |
| --- | --- |
| `duration_ms` | Start to the successful selection, Skip or Exit (monotonic). Instructions and rating excluded; Reset and recovery included. |
| `first_visible_ms` | Start to the first visibility episode. |
| `first_qualifying_ms` | Start to the first qualifying view. |
| `qualifying_to_select_ms` | Start of the current qualifying view to the successful selection. |
| `pan_count`, `zoom_count`, `pan_cancel_count`, `zoom_cancel_count` | Completed and cancelled gestures (drag pans, wheel pan segments, pinch segments, button zooms). |
| `pan_distance_norm` | Σ of √((Δx/4000)² + (Δy/3000)²) over applied camera movement. |
| `zoom_change_log2` | Σ\|Δz\| over applied zoom changes. |
| `pan_reversal_count`, `zoom_reversal_count` | Per-axis pan direction changes after 24 CSS px of opposite travel; zoom direction changes after 0.1 level. Observations, not errors. |
| `visibility_episode_count`, `visibility_loss_count`, `zoom_overshoot_count`, `corrective_return_count` | As defined above. |
| `distractor_open_count`, `target_open_count`, `panel_close_count` | Exploratory panel openings (kept separate from commits) and closings. |
| `submit_count`, `incorrect_selection_count`, `framing_failure_count`, `retry_count` | Commits; wrong-landmark commits; right landmark at an unsuitable view; commits after a failed one. |
| `reset_count`, `unhandled_click_count`, `active_gesture_click_count` | Reset view; clicks that did nothing; presses within 250 ms of the last wheel packet (during an active pan or zoom). |
| `hold_travel_px` | Mouse-type pointer travel while holding, during completed pans. It's `null` after a touch or pen pan (`non_cursor_pointer`) or out-of-order input. A cancelled pan's travel is discarded. |
| `cursor_distance_px` | All mouse-type cursor travel (hover and hold). It's `null` if the cursor left the map, a non-mouse pointer was used, the canvas was resized, or input arrived out of order. |
| `final_*` | Zoom, \|zoom error\|, center offset, region visibility and correctness of the last commit. |

Missing values are `null`, with a reason in `summary.missing`, and a measured zero stays 0. Run states are `completed`; `abandoned` with `end_reason` `skipped` or `exited`; and `unstarted`. These are measures of delivered application behavior, not detector accuracy.

### Per-submission record

Each commit appends an immutable (deep-frozen) record: `index`, `landmark_id`, `elapsed_ms`, `correct_landmark`, `zoom`, `zoom_error`, `center_offset_norm`, `region_visible`, `missing`, `point_in_viewport`, `obscured_by`, `selection`, `success`, `failures` (from `wrong_landmark`, `not_in_view`, `obscured`, `zoom_too_low`, `zoom_too_high`, `region_not_visible`), `thresholds`, `evaluator_version`, `pans_since_previous`, `zooms_since_previous`, `cancellations_since_previous`, `measurement_valid` and `invalid_reasons`, `input_source`, and `scale_px_per_unit`.

## Telemetry

The task uses the same contract as Photo crop. One row per completed run goes through the existing web transport (`jvision/transport.js`, path activity `stp_map_landmark`) when a native host has completed the handshake. Nothing is sent in a plain browser. Abandoned and unstarted runs stay local, like the QA producer. No new columns:

| Column | Value |
| --- | --- |
| `activity_id` | `stp_map_landmark` |
| `elapsed_ms` | Start to the successful selection |
| `metric_family` | `clicks` (like `stp_storefront_cart` and `stp_cascading_menu`) |
| `stp_clicks_target_count` | 1 |
| `stp_clicks_total` | all presses delivered to the map page |
| `stp_clicks_completed_count`, `stp_clicks_on_target`, `stp_clicks_miss_count` | `-1` (their established definitions are acquisition windows) |
| cursor, drag, scrolling and zooming columns | `-1` / `""`. The web touchpad contract admits only the family's own columns, so the cursor path length goes in `qa_path`, unlike the native storefront row. |
| `source`, `session_id`, `stp_model_*` | native-host supplied |

`details` (at most 512 UTF-8 bytes) keeps the QA path envelope (`details_version`, `target_index`, `target_count`, `target_status`, `trace_valid`, `run_sequence`, `task_index`, `interaction` = `MapLandmark`, `stp_condition` = `riverside_museum_v1`). It adds `map_eval_v`, `qa_path_v: 1`, `qa_path` (31 slots in `PATH_FIELDS` order; the dashboard's `PATH_PROTOCOLS.stp_map_landmark.packed` must match), `qa_subs_n` and `qa_subs` (the last three commits as `[correct, zoom, region_visible, success]`). Values are non-negative and rounded to 0.001, and unavailable values are `null`. If `details` would exceed 512 bytes, `qa_subs` is dropped first (`qa_subs_truncated`), then `qa_path` (`qa_path_truncated`). A worst-case test stays within the bound.

```
stp_map_first_visible_ms, stp_map_first_qualifying_ms, stp_map_qualifying_to_select_ms, stp_map_pan_count,
stp_map_zoom_count, stp_map_pan_cancel_count, stp_map_zoom_cancel_count, stp_map_pan_distance_norm,
stp_map_zoom_change_log2, stp_map_pan_reversal_count, stp_map_zoom_reversal_count, stp_map_visibility_episode_count,
stp_map_visibility_loss_count, stp_map_zoom_overshoot_count, stp_map_corrective_return_count,
stp_map_distractor_open_count, stp_map_target_open_count, stp_map_panel_close_count, stp_map_submit_count,
stp_map_incorrect_selection_count, stp_map_framing_failure_count, stp_map_reset_count, stp_map_unhandled_click_count,
stp_map_active_gesture_click_count, stp_map_hold_travel_px, stp_map_cursor_distance_px, stp_map_final_zoom,
stp_map_final_zoom_error, stp_map_final_center_offset_norm, stp_map_final_region_visible, stp_map_success
```

**Integration gap (same as Photo crop):** the dashboard admits only `source = "qa_tool"` rows, and fbsource has no native receiver for this web transport. The row parses in the dashboard: draft D131989566 (stacked on the Photo crop draft D131984777) adds `PATH_PROTOCOLS.stp_map_landmark` and tests it on the golden row. Neither draft has landed. It won't appear on `/stp` until a native host forwards it with an admitted source.

### Example complete row

From the golden run (synthetic: a distractor opened and committed, the museum committed at too low a zoom, then a qualifying view). `source` and `session_id` are native-supplied placeholders:

```json
{
  "source": "qa_tool",
  "session_id": "synthetic-session",
  "activity_id": "stp_map_landmark",
  "elapsed_ms": 2425,
  "metric_family": "clicks",
  "details": "{\"details_version\":1,\"target_index\":0,\"target_count\":1,\"target_status\":\"completed\",\"trace_valid\":true,\"run_sequence\":1,\"task_index\":1,\"interaction\":\"MapLandmark\",\"stp_condition\":\"riverside_museum_v1\",\"map_eval_v\":1,\"qa_path_v\":1,\"qa_path\":[221,1731,694,6,2,0,0,0.74,1.65,3,0,1,0,0,0,1,1,1,3,1,1,0,0,0,1524.2,5591.9,2.65,0,0.303,1,1],\"qa_subs_n\":3,\"qa_subs\":[[0,1.75,null,0],[1,1.75,1,0],[1,2.65,1,1]]}",
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
  "stp_clicks_target_count": 1,
  "stp_clicks_completed_count": -1,
  "stp_clicks_total": 12,
  "stp_clicks_on_target": -1,
  "stp_clicks_miss_count": -1,
  "stp_drag_target_text": "",
  "stp_drag_attempt_count": -1,
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

Finished runs are saved with the existing local results (`jvision-path-results-v1`) together with `telemetry`, the export below. **Export saved results** downloads the JSON. Export schema (`schema_version` 1): `schema_version`, `task_id`, `task_version`, `protocol_version`, `run_id` (random and local; no person or device identifier, matching the other jvision path tasks), `scenario_id`, `scenario_seed`, `map_id`, `requested_landmark_id`, `map_size`, `start_camera`, `required_region`, `evaluator_version`, `thresholds`, `status`, `end_reason`, `trace_valid`, `summary`, `submissions` (at most 30), `events` (at most 300, with the terminal event kept), `events_dropped`, `events_truncated`, and `intent_observation`. The export is capped at 96 KB. Events carry `event_sequence`, `elapsed_ms` (monotonic from Start), `type`, `phase`, and where relevant `input_source` (`mouse`, `touch` or `pen` from `PointerEvent.pointerType`, or `wheel` / `wheel_ctrl`), `landmark_id`, `reason`, and gesture summaries (duration, normalized distance, zoom from/to, overshoot, hold travel). Events are emitted only at gesture boundaries. Raw pointer traces and the continuous camera trajectory are never exported; landmark IDs and scalar summaries are.

Example (synthetic run; the event and submission lists are shortened):

```json
{
  "schema_version": 1,
  "task_id": "stp_map_landmark",
  "task_version": "1.0",
  "protocol_version": 1,
  "run_id": "map_5c1e09a7d24b8f36",
  "scenario_id": "riverside_museum_v1",
  "scenario_seed": 4207,
  "map_id": "lark_city_v1",
  "requested_landmark_id": "lm_riverside_museum",
  "map_size": {
    "width": 4000,
    "height": 3000
  },
  "start_camera": {
    "cx": 1000,
    "cy": 700,
    "zoom": 1
  },
  "required_region": {
    "left": 2780,
    "top": 1800,
    "right": 3040,
    "bottom": 2030
  },
  "evaluator_version": 1,
  "thresholds": {
    "zoom_min": 2.3,
    "zoom_max": 3.3,
    "min_region_visible": 0.9
  },
  "thresholds_note": "prototype task criteria, not validated STP quality gates",
  "status": "completed",
  "end_reason": "completed",
  "trace_valid": true,
  "summary": {
    "duration_ms": 2118,
    "first_visible_ms": 232,
    "first_qualifying_ms": 1566,
    "qualifying_to_select_ms": 552,
    "pan_count": 5,
    "zoom_count": 2,
    "pan_cancel_count": 0,
    "zoom_cancel_count": 0,
    "pan_distance_norm": 0.697,
    "zoom_change_log2": 1.65,
    "pan_reversal_count": 1,
    "zoom_reversal_count": 0,
    "visibility_episode_count": 1,
    "visibility_loss_count": 0,
    "zoom_overshoot_count": 0,
    "corrective_return_count": 0,
    "distractor_open_count": 0,
    "target_open_count": 1,
    "panel_close_count": 0,
    "submit_count": 2,
    "incorrect_selection_count": 0,
    "framing_failure_count": 1,
    "retry_count": 1,
    "reset_count": 0,
    "unhandled_click_count": 0,
    "active_gesture_click_count": 0,
    "press_count": 8,
    "button_press_without_action_count": 0,
    "wheel_ignored_during_drag_count": 0,
    "hold_travel_px": 1302.2,
    "cursor_distance_px": 2965.6,
    "final_zoom": 2.65,
    "final_zoom_error": 0,
    "final_center_offset_norm": 0.303,
    "final_region_visible": 1,
    "final_correct_landmark": 1,
    "success": 1,
    "missing": {}
  },
  "submissions": [
    {
      "index": 0,
      "landmark_id": "lm_riverside_museum",
      "elapsed_ms": 1358,
      "correct_landmark": true,
      "zoom": 1.65,
      "zoom_error": -0.65,
      "center_offset_norm": 0.271,
      "region_visible": 1,
      "missing": {},
      "point_in_viewport": true,
      "obscured_by": [],
      "selection": {
        "offset_world": {
          "x": 0,
          "y": 0
        },
        "offset_norm": 0,
        "in_footprint": false
      },
      "success": false,
      "failures": [
        "zoom_too_low"
      ],
      "thresholds": {
        "zoom_min": 2.3,
        "zoom_max": 3.3,
        "min_region_visible": 0.9
      },
      "evaluator_version": 1,
      "pans_since_previous": 5,
      "zooms_since_previous": 1,
      "cancellations_since_previous": 0,
      "measurement_valid": true,
      "invalid_reasons": [],
      "input_source": "mouse",
      "scale_px_per_unit": 0.785
    }
  ],
  "submissions_dropped": 0,
  "events": [
    {
      "event_sequence": 1,
      "elapsed_ms": 0,
      "type": "task_started",
      "phase": "map",
      "scenario_id": "riverside_museum_v1",
      "map_id": "lark_city_v1",
      "requested_landmark_id": "lm_riverside_museum"
    },
    {
      "event_sequence": 2,
      "elapsed_ms": 36,
      "type": "navigation_started",
      "phase": "map"
    },
    {
      "event_sequence": 4,
      "elapsed_ms": 132,
      "type": "pan_finished",
      "phase": "map",
      "input_source": "mouse",
      "duration_ms": 96,
      "distance_norm": 0.22,
      "hold_travel_px": 403.1,
      "zoom": 1
    },
    {
      "event_sequence": 6,
      "elapsed_ms": 232,
      "type": "target_visible",
      "phase": "map",
      "episode": 1
    },
    {
      "event_sequence": 13,
      "elapsed_ms": 736,
      "type": "zoom_finished",
      "phase": "map",
      "input_source": "wheel_ctrl",
      "duration_ms": 192,
      "zoom": 1.65,
      "zoom_from": 1,
      "zoom_change_log2": 0.65,
      "overshoot": false
    },
    {
      "event_sequence": 16,
      "elapsed_ms": 1318,
      "type": "landmark_opened",
      "phase": "map",
      "landmark_id": "lm_riverside_museum",
      "is_requested": true,
      "input_source": "mouse",
      "zoom": 1.65
    },
    {
      "event_sequence": 17,
      "elapsed_ms": 1358,
      "type": "selection_submitted",
      "phase": "map",
      "index": 0,
      "landmark_id": "lm_riverside_museum",
      "correct_landmark": true,
      "success": false,
      "failures": [
        "zoom_too_low"
      ]
    },
    {
      "event_sequence": 19,
      "elapsed_ms": 1566,
      "type": "qualifying_view_reached",
      "phase": "map",
      "zoom": 2.3,
      "region_visible": 1
    },
    {
      "event_sequence": 22,
      "elapsed_ms": 2118,
      "type": "task_completed",
      "phase": "rating",
      "duration_ms": 2118
    }
  ],
  "events_dropped": 0,
  "events_truncated": false,
  "intent_observation": "(the observation in the example row above)"
}
```

## Limitations

- Not verified in a real browser, WebView or on STP hardware. The screenshots are Skia renders of the real page canvas driven by synthetic events.
- The page can't see touchpad gesture classification. Pinch arrives as ctrl+wheel and is indistinguishable from ctrl+mouse wheel; a trackpad that the browser reports as a mouse counts as `mouse`.
- No dashboard ingestion yet (see the integration gap above).
- One scenario, and the criteria are untested with participants. On very small viewports the region criterion may be unreachable.
- The canvas map has no keyboard alternative. A page unload mid-task loses the run.
