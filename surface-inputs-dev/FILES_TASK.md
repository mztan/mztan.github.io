# DEV Files task

Standalone entry: `touchpad/files.html`. The main three-stage guided dogfood flow is unchanged.

## Imported task

The Files task is copied from `jvision/touchpad/files.html` and `files-task.js` at repository commit `1922b0e9d6138b9269639085209ea44dc20b493a`. `path-tasks.js` extracts only `FileDragTrials`, its three authored targets and helpers from `jvision/path-tasks.js`. Canvas colors, layout, eight-pixel touch slop, wheel normalization, timing and measured outputs are retained. The imported golden tests identify the original native reference as `SurfaceInputsQaFileDragTrialsTest` (D131935533).

The objective is explicit: move the named file onto the named folder. Wrong-file/wrong-folder/outside releases and cancelled drags remain distinguishable. App-delivered drag outcomes are not detector accuracy or inferred physical gesture intent.

## Results and feedback

- Browser: local-only results and optional ease rating/comment. No Forms or telemetry endpoint is configured.
- APK: require the existing negotiated v2 `SurfaceInputsTransport` before Begin. Each target result uses `task_id: stp_file_drag`, `event_name: uxr_result`, and `details: {details_version: 1, target: <original row>}`. The three original measurement rows are not rewritten as a new typed drag metric.
- Optional rating/Skip uses one opaque `feedback_submitted` event, linked with the same web-owned task context. No native identifiers or model fields are supplied by the page.
- Completed results are saved locally before native handoff. Feedback updates that retained record once. SDK retries preserve event IDs/payloads; local `pending`, `rejected` and `accepted` receipts remain separate from local storage success. Native acceptance is sink handoff, not server receipt.
- Reload lists retained receipts for export but never automatically resubmits them. The document-local SDK queue does not survive process death; uncertain past deliveries are not automatically backfilled into a new task.
- Local storage is bounded to 50 runs and fails closed before starting when unavailable/full. Export saved results before clearing site data. Native failures expose an explicit Retry control; no browser network fallback is introduced.

## Verification and limits

Run `node --test surface-inputs-dev/tests/file-drag.test.js surface-inputs-dev/tests/files-results.test.js surface-inputs-dev/tests/files-page.test.js`. Other existing DEV suites remain required for integration. Native v2/legacy behavior, local retention, wrong targets/cancellation and browser events are tested offline with fake ports and intercepted requests.

No production/jvision changes, Form mappings, native schema/SDK version changes, physical device validation or downstream receipt claim are included. Parent owns the DEV launcher link, generic environment-verifier entry extension and publication.
