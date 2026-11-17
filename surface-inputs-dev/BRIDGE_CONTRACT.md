# Stable web telemetry contract

## Channels

The shared `SurfaceInputsTransport` SDK owns private-port negotiation, validation, buffering and retry. It provides two v2 channels:

- **Typed intent:** complete prescribed keyboard input and the existing five typed touchpad metric families. Definitions, units, field types and unavailable values are fixed. Any printable task ID can use an applicable family; there is no v2 task-name or prefix allowlist.
- **Arcade JSON:** task-specific UXR results, feedback and new metrics. The native bridge validates envelope, JSON structure, bounds and `details_version`, then forwards the exact serialized details string without interpreting its task fields or rating ranges.

New task logic and JSON schemas live on the web. New typed fields, wire versions, limits or host origins require an explicit compatible APK upgrade. The initial v2 APK is required once; task additions using the fixed contract do not require new native task enums.

## Handshake and capabilities

The host offers one private port with `{type:"surface_inputs_host",version:1}`. Web and host exchange exactly `{version:1,type:"ready"}`. Only a trusted top-frame offer from the approved HTTPS origin binds native mode. URL parameters, user agents and synthetic messages do not.

The SDK then sends `{version:1,type:"capabilities",id:"ctl_…"}`. The v2 APK replies with the same control ID, `supported_versions:[1,2]`, `message_types:["keyboard","touchpad","arcade"]`, `intent_contract_version:1`, the five metric families and limits from [telemetry-contract.json](telemetry-contract.json). Control IDs do not share the generated observation namespace.

`getCapabilities()` returns a copy of the negotiated capabilities. `requireV2()` throws until v2 is explicitly negotiated. New tasks must call it before timing/interaction when `usesNative()` is true. APK version names are not capability negotiation.

Missing/malformed capabilities retain data and report retry. Only an explicit legacy rejection permits current legacy-compatible v1 observations. New v2 events never downgrade or switch to browser uploads after a native port binds. The existing extra UXR-result facade reports unsupported on a confirmed legacy APK and skips only that new extra channel; legacy typed input and feedback continue.

## Typed envelopes

Common: `version:2`, `type:"keyboard"|"touchpad"`, `id`, `task_id`, `elapsed_ms`, `details`.

Keyboard additionally carries `prompt_id`, `prompt_text` and `input_event_stream`. It is one complete prescribed prompt with canonical control tokens and existing replay eligibility. No partial input, task attempts, ordering, chunks, windows or native identity/model fields are added. Supplemental typed-intent details remain an object with `details_version:1`.

Touchpad additionally carries `metric_family` and the independently typed fields for exactly one of `cursor_movement`, `clicks`, `drag`, `scrolling`, `zooming`. Omitted or `-1` measurements are unavailable, not measured zero. DOM callbacks do not prove physical gesture counts. Multiple families use separate observations.

The canonical manifest defines fields, kinds and units. Generate its embedded SDK copy with `node surface-inputs-dev/tests/generate-contract.js`; `--check` refuses drift. Capture modules and calculators retain their existing definitions.

## Arcade envelope

Web API:

```js
if (SurfaceInputsTransport.usesNative()) SurfaceInputsTransport.requireV2();
SurfaceInputsTransport.submitArcadeEvent({
  task_id: "future_task",
  event_name: "uxr_result",
  task_context_id: "web_block_1",
  elapsed_ms: 1200,
  details: {details_version: 2, new_metric: 0.75, ratings: {new_question: 7}}
});
```

Required wire fields are `version:2`, `type:"arcade"`, `id`, `task_id`, `event_name` and `details`. Optional fields are `task_context_id` and `elapsed_ms`.

The API accepts a plain JSON details object. The wire carries its single serialized **JSON-object string**, with integer `details_version` ≥1. Native forwards that exact string, including escaping, float representation and key order. The bridge does not interpret nested metrics, scale anchors or rating keys. Inner data cannot override native envelope attribution.

Browser Arcade delivery requires an explicit callback. No callback or Forms collector is invented. Existing browser objective Forms and local feedback are unchanged.

## Limits and validation

- Whole message: 32,768 UTF-8 bytes.
- Identifiers: 1–64 printable ASCII bytes.
- Typed-intent details: 512 UTF-8 serialized bytes.
- Keyboard prompt: 512 UTF-8 bytes; complete stream: 2,048.
- Opaque Arcade details string: 2,048 UTF-8 bytes.
- Integer elapsed/count/version values: maximum 2,147,483,647. Counts can also be unavailable `-1`.
- Typed floats fit the existing Float sink; shares are 0–1 or unavailable.
- JSON nesting: at most 32 object/array levels. Quoted braces do not increase depth.

Invalid/truncated data is not sent. Strict JSON rejects comments, trailing data and duplicate keys. API JSON rejects accessors, nonfinite values, sparse arrays and values serialization would erase.

## Delivery and compatibility

The 32-message document-local queue holds bounded logical snapshots during negotiation and immutable wire strings after selection. Retry uses the same IDs and bytes. Backpressure leaves current completions recoverable; it does not publish partial data. ACK version matches the observation version. `accepted` means native sink handoff, never server receipt. Accepted-ID deduplication is bounded to the most recent 1,024 IDs; it is not global exactly-once delivery. Process-kill persistence is not promised; existing feedback has separate bounded local retention.

Current producer facades map existing `activity_id` into v2 `task_id`. Keyboard input and per-prompt UXR results queue atomically; retries retain the first completed stream and original timing. Targeting keeps separate movement/click families plus one opaque round result. Scrolling adds one opaque task result. Web-owned context IDs link these UXR records and feedback; they are not inserted into typed intent or treated as native session/attempt attribution. Confirmed legacy APKs omit only the newly added extra UXR records.

Legacy clients remain v1-compatible with the upgraded APK. Main and UXR touchpad producers retain existing intent coverage; legacy exec demos and latency prototypes remain readiness/navigation-only until honestly instrumented. No APK installation, production promotion, new Forms access or dormant collector activation is authorized by this SDK change.

## Conformance

Run the dev tests and generator checks before release. SDK-generated v1/v2 fixtures cover current producers, unseen tasks, all five families, exact opaque JSON and custom seven-point ratings. The native parser must consume the same fixture strings. Browser tests use intercepted resources and fake ports, never real participant submissions.
