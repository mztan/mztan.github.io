# Shared browser and APK telemetry

## Browser behavior

The keyboard and touchpad pages keep their original browser identity controls, Google Forms, test logic, geometry, timings and public corpora. URL parameters do not select native mode. The launcher also loads the handshake transport so its links are usable after the APK's input gate is released; standalone browser links remain unchanged.

## Native capability handshake

- Host origin: `https://mztan.github.io`, top frame only.
- The native host transfers one `WebMessagePort` with JSON `{ "type": "surface_inputs_host", "version": 1 }`.
- Web accepts only a trusted `MessageEvent` whose source is the current Window or `null`, with exactly one port and exactly the marker fields. Android may dispatch without a Window proxy. Both shapes have unit coverage; neither has been verified on a physical WebView in this change.
- Web sends `{ "version": 1, "type": "ready" }` on the port. Native replies with the same message. Only that reply activates native mode and hides identity controls.
- After a valid port transfer, Forms are suppressed immediately, including while waiting for ready. Complete observations can queue during that interval.
- The native host must gate task interaction before transferring the port. Before any port transfer the page cannot distinguish APK from browser and retains its browser path.
- This is a capability handshake, not proof of account authentication. Web never supplies native account, session or model attribution.

## Message envelope

All observations use `version: 1`, a stable ASCII `id` of at most 64 bytes, and an explicit prescribed `activity_id`. Transport IDs are not atom session IDs.

Activity values: `keyboard_natural_language`, `keyboard_punctuation`, `keyboard_email`, `keyboard_password`, `keyboard_shortcuts`, `keyboard_arrows`, `touchpad_targeting`, `touchpad_scrolling`, `touchpad_selection`, `touchpad_zoom`. Session feedback uses `session`. Path-task touchpad observations may instead use their dashboard task ID; the only one is `stp_photo_crop` (drag family, `details` with `qa_path_v`/`qa_path`; see [PHOTO_CROP.md](PHOTO_CROP.md)). The native receiver must accept that ID before these rows can land.

### Keyboard observations

- `type`: `keyboard`.
- `elapsed_ms`: nonnegative integer, using original prompt timing.
- `prompt_id`: dataset name plus original corpus line index, at most 64 ASCII bytes.
- `prompt_text`: at most 512 UTF-8 bytes. Text prompts include the required submission `⏎`.
- `input_event_stream`: full committed prompt input, at most 2048 UTF-8 bytes. Controls use `⌫`, `⇥`, `⇤`, `⏎`, `␛` and arrows. Text changes, IME commits and custom autocorrect replacements are captured, without duplicate keydown/input deletion events. This is an input observation, not a claim to reconstruct every physical tap or replay arbitrary caret selections.
- `details`: object, at most 512 UTF-8 bytes after JSON serialization, with integer `details_version: 1`. Text observations carry `replay_eligible`; non-terminal edits, cursor navigation, and unexpected control keys carry explicit exclusion reasons, so raw committed-edit streams are not misrepresented as literal caret replay. `final_text` is included only when the complete value fits. It is not a typed final-text wire field.
- Shortcut/arrow sequence observations use the original chord labels in both prompt and stream with `details.stream_format: "keychord_labels_v1"`. Native shortcut mode does not require the browser Fullscreen/Keyboard Lock APIs.

Observations emit only on complete prompts. No partial streams, chunks, ordering/count/attempt/window metadata or overflow truncation is emitted. Cancelable edits and presses are bounded before acceptance. An unexpected noncancelable overflow invalidates the current capture and explicitly requests reset/retry; it never publishes the retained prefix as a complete prompt. Original corpus files are not filtered or shortened.

### Touchpad observations

- `type`: `touchpad`; `elapsed_ms`: nonnegative integer.
- `metric_family`: `cursor_movement`, `clicks`, `drag`, `scrolling` or `zooming`.
- Exact typed `stp_*` fields are at message top level, not inside a metrics blob.
- `details`: object with `details_version: 1`, at most 512 UTF-8 serialized bytes.
- Unknown fields are omitted or `-1`; unavailable values are never measured zero.

Targeting emits separate CursorMovement and Clicks observations for each acquisition, including the initial target. Cursor calculations use target radius, edge start distance, center endpoint error, 100 ms stroke gaps, 5 px small-stroke threshold, 50 px near-target threshold, first-stroke progress, target entries/reentries and Shannon difficulty. Missing initial cursor position or interrupted/missing trace leaves trace-dependent metrics unavailable. Click counts come directly from that target's actual hit/miss decisions. Legacy aggregate UXR throughput, IDe, drag count and target-entry counters are not mapped into shared fields.

Scrolling uses exact CSS-pixel rectangles to derive the band that contains the entire highlighted phrase. Measured fields are target completion time, start distance, direction and observed overshoot count/max. DOM scroll callbacks omit zero-output native packets, so physical stroke/dial-in/empty-stroke/first-stroke metrics and cursor travel without scrolling remain `-1`.

Selection emits the actual prescribed target text and exact-selection completion. Stable selection callbacks are not labeled physical drag attempts. Zoom emits measured target change percentage, completion time and direction. Physical pinch and cursor metrics remain unavailable.

### Feedback API

`window.SurfaceInputsTransport.submitFeedback(payload)` is used by the development post-task UI:

- `activity_id`: prescribed task activity, or `session` for session feedback.
- `scope`: `task` or `session`; task feedback requires `round_id` (at most 64 ASCII bytes).
- `ratings`: object with optional `ease`, `satisfaction`, `frustration`, `control`, `fatigue`, `accuracy`, `lag`, `likelihood`, each an integer 1..5. An empty object supports freeform-only feedback.
- Optional `comment`: at most 1024 UTF-8 bytes.
- Optional `pain_points`: at most eight nonempty strings, each at most 64 UTF-8 bytes.
- The complete serialized feedback message is at most 2048 UTF-8 bytes.

Native feedback uses the private port. The post-task widget checks both the message and the receiver's final details object against 2048 UTF-8 encoded bytes; escape-heavy comments are rejected visibly, never truncated. Browser feedback through the transport API still requires an explicitly configured callback. There is no configured browser collector in this deployment, so the widget saves browser feedback locally and offers JSON export without calling a guessed form.

### Post-task feedback UI

The root development Targeting and Scrolling pages and keyboard main page load a shared feedback dialog. It opens after nine targeting hits, six scrolling targets, or the full selected typing/shortcut/arrow block. Practice completions also get feedback. Task calculations and timing finish before opening it; individual targets or prompts do not open it.

The new Arcade wording is **How easy or difficult was this task?**, with 1 Very difficult, 2 Difficult, 3 Neither easy nor difficult, 4 Easy, 5 Very easy. The freeform prompt is **What worked well, or what could be improved?** and is optional. No rating is preselected. Users can skip without manufacturing a zero or an answer.

The widget assigns an ASCII feedback-block identifier. It identifies that local completed-task feedback context; it is not an objective observation attempt ID and does not prove a join to individual intent events. Keyboard observations remain independent and carry no added attempt/order metadata.

Each response is persisted before native enqueue under `jvision-feedback-v1`. Up to 50 responses are retained on the same browser/origin, with no silent eviction. Save reports local-only, pending-native, rejected, or native-sink-accepted honestly. Retries reuse the exact ID and payload. ACK status is retained even after closing the dialog. Reloaded native pending/rejected responses can be retried with **Retry saved native feedback** in the next completed task's dialog, after native readiness, using their original IDs and payloads. Exported files contain written responses and should be kept private. Clearing is an explicit confirmation action enabled after export and removes only that exported snapshot's IDs, never later or unexported responses. Local storage failure keeps the entered response visible and reports that it was not saved.

Existing objective Google Forms submissions, collection destinations, native handshake and task code are unchanged except guarded post-completion hooks. Development does not block those writes.

## Delivery and failures

- A 32-entry document-local queue retains immutable message IDs/payloads until ACK.
- ACK: `{ "version": 1, "id": "...", "status": "accepted" | "rejected", "reason": "optional" }`.
- Accepted means handoff to the native sink, not server upload. Duplicate ACKs do nothing. Recently accepted IDs are deduplicated (256-entry cache); the native sink must also deduplicate retries.
- Missing ACK retries the same payload up to five sends, two seconds apart. Rejected/exhausted observations stay pending and show a retry action. `retryPending()` retries those exact IDs, without any Forms fallback.
- A full queue fails explicitly. Keyboard prompts and touchpad targets do not advance on enqueue failure.
- Navigation links and unload are guarded while observations remain pending. The queue is in memory, not persistent storage; process kill cannot preserve it. Native host navigation/destruction handling remains host-owned.

## Coverage and checks

Supported pages: keyboard main page; root and `uxr/` targeting, scrolling, text selection and zoom. `keyboard/exec_demo/` and `touchpad/uxr/fitts-latency.html` remain browser-only. No task UI or original corpus is migrated from an older internal PRAX version.

Run `node --test jvision/tests/*.test.js`. Tests are offline with fake browser/port/Forms sinks. They cover producer wiring, trust/ready/ACK/retry/bounds, metrics golden cases, typed families, identity gating and full corpus hashes. They do not prove physical WebView event behavior or end-to-end server telemetry parity.

Run `node surface-inputs/tests/generate-fixtures.js` to regenerate `tests/fixtures/native-messages.json`. That file is an array of `{ name, message }` from production modules for real native receiver smoke validation. Parent owns Kotlin receiver/build validation.
