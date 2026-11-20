# DEV Files task

Final DEV dogfood stage: `touchpad/files.html`, reached after H&P. The five-stage flow owns its web context and participant; Files feedback advances to Finish only after both configured delivery destinations satisfy their separate receipt contracts.

## Imported measurements

`FileDragTrials` and its three targets/helpers are extracted unchanged from `jvision/path-tasks.js` at commit `1922b0e9d6138b9269639085209ea44dc20b493a`. The Files driver retains canvas paint/layout, eight-pixel touch slop, wheel normalization, timing and outcome calculations. Wrong file, wrong folder, outside release and cancelled drag remain separate app-delivered outcomes, not detector accuracy.

## Delivery configuration

Each Form's question IDs are shown in `files-forms-config.js`; `forms.stp_file_drag` and `forms.keyboard_hunt_and_peck` hold separate task destinations. The same task-specific Form is used by DEV and PROD, not a separate Form per environment. The owner updated responder permissions on November20; both anonymous respondent pages now load successfully. Complete result and feedback requests are verified before publication.

```js
{version: 1, enabled: true, fieldsVerified: true, endpoint: '<exact formResponse URL>',
 fields: {participant_label, task_id, task_context_id, submission_id, submission_type,
          results_json, ease, comment, rating_skipped}} // each value is a unique entry.N
```

Begin fails closed without a valid nine-field mapping, explicit web participant label and writable bounded storage. In the guided flow the label comes from the saved web participant snapshot, never host identity. A preflight label panel, where present, is removed before measurement without changing canvas dimensions.

`files-forms.js` is reusable by the parent's H&P shim: `SurfaceInputsFilesForms.create(win, config, {task_id: 'keyboard_hunt_and_peck'})`; the default task is `stp_file_drag`. These are the only allowed task IDs and have separate outbox keys. API: `canBegin(label, expectedSubmissions)`, `stageSubmission({id, block, participant_label, submission_type, results, ease, comment, rating_skipped})` returns a retained immutable ID; `send(id)` returns an opaque request-sent promise or rejects with retained uncertainty; `retry(block, confirmUnknown)`, `status(id)`, `list()`, `exportRecords()` and `subscribe(listener)`. The Files-specific `stage(run, kind)` is only a convenience wrapper. H&P can stage each complete prompt's full JSON object with its own submission ID, then separate task feedback. This module never emits native telemetry.

## Objective results and feedback

- **Google Forms, browser and APK:** one `result` row contains full `{details_version: 1, targets: [all three original measurement rows]}` in `results_json`, plus explicit web label/task/context/submission IDs. A separate `feedback` row carries ease 1..5 (or explicit Skip), optional freeform comment, and `rating_skipped`. No user agent, native identity, model attribution, field omission or JSON truncation is introduced.
- **Native APK:** require negotiated v2 before Begin. Preserve three existing opaque `uxr_result` events (`task_id: stp_file_drag`, `details: {details_version: 1, target: <original row>}`), plus one `feedback_submitted` event. The Form label is never added to native payloads. Fixed typed metric definitions and shared SDK remain unchanged.
- **Local retention:** objective rows are frozen and saved before handoff; feedback updates the retained run once. The Forms outbox retains immutable destination mappings, values and submission IDs separately from native SDK receipts.
- **Receipts:** Google `request_sent` means an opaque request resolved, not verified server storage. Failed/lost responses remain `delivery_unknown`. Native `accepted` means sink handoff, not server receipt.
- **Retries:** Google Forms and native Retry controls are independent. Form retries never resend native events; native retries never resend Form rows. Opaque-sent rows are never reposted. Unknown Form retries warn about possible duplicates. Reload never automatically resubmits historical records; retained copies remain exportable.
- **Bounds:** 50 local task runs; 100 Form submissions / 1 MiB outbox; full results JSON up to 32 KiB; native per-target details retain the existing 2 KiB contract. Oversized data fails explicitly without truncation. Optional feedback must also fit the unchanged native details bound.

Offline tests use fixture mappings, fake native ports and intercepted network requests. The November20 integration check submitted only labelled new-task request bodies to the separate actual Forms and confirmed stored response counts through the Google API; detailed answer reads were rate-limited. See [Form verification](TASK_FORM_VERIFICATION.md). Physical headset/native backend proof and production/jvision source changes are not included.
