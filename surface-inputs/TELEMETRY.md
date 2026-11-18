# Shared browser and APK telemetry

## Production promotion

Production promotes the November18 reviewed dual-destination runtime from dev candidate `0c313c37`. Native wire contracts, fixed typed schema and metrics remain unchanged. Primary completed UXR rows and feedback submit to configured Forms regardless of browser/APK; APK also emits native telemetry, with separate destination receipt flags and retries. Opaque request completion is not HTTP/storage confirmation. No new live Forms or physical-device tests were performed for this promotion.

The v1 field definitions below document backward compatibility, not the current wire version selected on a v2-capable host. Guided feedback occurs after six complete Targeting/Scrolling sets and 20 punctuation Typing prompts. Next/Finish keep the feedback screen visible through navigation; successful short-lived status text is suppressed and errors remain actionable.

## Browser behavior

Primary task result rows and feedback now go to Forms in both browser and APK mode; APK also retains the native SDK observations. Forms use a single explicit web participant label and their own web block/session metadata, never host account/session/model IDs. Native packets keep their measurement-only values and original task context. Direct Form feedback/result linkage is durably reserved before retention, with no context guessing on reload. Destination-specific retries and cleanup preserve independent pending/receipt state.

## Page navigation and results UI

All HTML subpages have an environment-local Home/back link. Targeting's return-screen history card is hidden, without removing its measurement/logging code. Pending native observations block navigation until acknowledgement, and open feedback dialogs keep background navigation inert. Legacy demos and Fitts latency load the shared ready handshake for navigation, not new native intent measurements.

## Native capability handshake

- Host origin: `https://mztan.github.io`, top frame only.
- The native host transfers one `WebMessagePort` with JSON `{ "type": "surface_inputs_host", "version": 1 }`.
- Web accepts only a trusted `MessageEvent` whose source is the current Window or `null`, with exactly one port and exactly the marker fields. Android may dispatch without a Window proxy. Both shapes have unit coverage; neither has been verified on a physical WebView in this change.
- Web sends `{ "version": 1, "type": "ready" }` and waits for the matching native reply. Forms-enabled primary pages preserve the explicitly entered web identity controls until the guided session prepopulates and hides them. This label is never native account attribution.
- The SDK still suppresses raw form-submit navigation after native binding. Primary tasks explicitly submit the configured background HTTPS Form collector in either mode; this does not navigate the WebView or replace native telemetry. Native account attribution stays host-owned.
- The native host must gate task interaction before transferring the port. Before any port transfer the page cannot distinguish APK from browser and retains its browser path.
- This is a capability handshake, not proof of account authentication. Web never supplies native account, session or model attribution.

## Message envelope

All observations use `version: 1`, a stable ASCII `id` of at most 64 bytes, and an explicit prescribed `activity_id`. Transport IDs are not atom session IDs.

Activity values: `keyboard_natural_language`, `keyboard_punctuation`, `keyboard_email`, `keyboard_password`, `keyboard_shortcuts`, `keyboard_arrows`, `touchpad_targeting`, `touchpad_scrolling`, `touchpad_selection`, `touchpad_zoom`. Session feedback uses `session`.

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

`window.SurfaceInputsTransport.submitFeedback(payload)` is used by the post-task UI:

- `activity_id`: prescribed task activity, or `session` for session feedback.
- `scope`: `task` or `session`; task feedback requires `round_id` (at most 64 ASCII bytes).
- `ratings`: object with optional `ease`, `satisfaction`, `frustration`, `control`, `fatigue`, `accuracy`, `lag`, `likelihood`, each an integer 1..5. An empty object supports freeform-only feedback.
- Optional `comment`: at most 1024 UTF-8 bytes.
- Optional `pain_points`: at most eight nonempty strings, each at most 64 UTF-8 bytes.
- The complete serialized feedback message is at most 2048 UTF-8 bytes.

Both destinations are retained before required progress advances. Forms `request_sent` records remain immutable in the 256-record/1MiB bounded outbox; they are never automatically retried or backfilled. `exportRecords()` plus confirmed `clearExportedRecords()` removes only exported completed records not needed by pending/active/inflight work or unfinished feedback destinations. The feedback widget persists native and Forms flags independently; either destination's retry cannot resubmit the other. Native ACK is only sink handoff; opaque Forms completion is only request sent. Storage receipt failures keep a retry-saving-state path instead of network resubmission. Native document queue and navigation guards are unchanged.

### Post-task feedback UI

Guided feedback opens once after six Targeting sets (54 hits), once after six Scrolling sets (36 targets), then after 20 punctuation Typing prompts. The title is Feedback and primary action is Next or final Finish. The immutable dialog stays visible through navigation, with no fleeting sending/success text. Errors and Retry continuation remain available; no rating or completion is manufactured by Escape or Skip. Direct standalone/Practice completion boundaries remain supported.

The widget assigns an ASCII feedback-block identifier. It identifies that local completed-task feedback context; it is not an objective observation attempt ID and does not prove a join to individual intent events. Keyboard observations remain independent and carry no added attempt/order metadata.

    Each response is persisted before native enqueue under `surface-inputs-dev-feedback-v1`. Up to 50 responses are retained on the same browser/origin, with no silent eviction. Upload reports local-only, pending-native, rejected, or native-sink-accepted honestly. Retries reuse the exact ID and payload. ACK status is retained even after closing the dialog. Reloaded native pending/rejected responses can be retried with **Retry saved native feedback** in the next completed task's dialog, after native readiness. Export/clear UI controls are absent; developer-only `getSavedFeedback()`, `exportSavedFeedback()` and `clearExportedFeedback()` APIs on `window.SurfaceInputsFeedback` provide explicit retention management. Clearing requires confirmation after export and removes only that snapshot's IDs. Local storage failure keeps the entered response visible and reports that it was not saved.

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

Run `node --test surface-inputs/tests/*.test.js`. Tests are offline with fake browser/port/Forms sinks. They cover producer wiring, trust/ready/ACK/retry/bounds, metrics golden cases, typed families, identity gating and full corpus hashes. They do not prove physical WebView event behavior or end-to-end server telemetry parity.

Run `node surface-inputs/tests/generate-fixtures.js` to regenerate `tests/fixtures/native-messages.json`. That file is an array of `{ name, message }` from production modules for real native receiver smoke validation. Parent owns Kotlin receiver/build validation.
