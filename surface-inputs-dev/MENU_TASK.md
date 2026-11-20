# DEV Menu task

Final guided stage: `touchpad/menu.html`. It replaces Files in new DEV dogfood runs, after Targeting, Scrolling, twenty-prompt Typing and ten-prompt H&P. Menu feedback is the only final **Finish**. Production keeps its existing flow.

## Source and measurements

`menu-tasks.js` copies only `MENU_LABELS`, `MENU_PATH`, `row`, `finite` and `MenuTrials` from `jvision/path-tasks.js` at `838490499214242c4476c4a2708a9019c556f564`. The driver preserves original canvas geometry/paint, eight-pixel tap slop, hover-open behavior, terminal selection counts, wrong selections, dismissals and cursor-trace eligibility. There are two paths: **3 levels**, then **5 levels**. Direct touch/pen or stale/interrupted input invalidates cursor distance without inventing zero travel. These are prescribed app-output outcomes, not detector accuracy or inferred intent.

## Independent deliveries

- Forms: one complete `{details_version:1, targets:[<both original rows>]}` result and one separate Likert/freeform feedback record. The task-specific nine-field registry entry is `forms.stp_cascading_menu`. Its supplied endpoint/question IDs are for one Menu Form shared across environments; no Files Form or history is reused.
- APK: require negotiated v2 before Open menu. Send two opaque `uxr_result` events and one `feedback_submitted`, all with `task_id: stp_cascading_menu` and the same web-owned context. No new typed atom fields, wire versions or native task enums are added.
- Explicit web participant labels are used only in Forms. Native attribution remains host-owned. Opaque request-sent and native sink acceptance are not server-storage receipts.
- Snapshot data/IDs/destinations stay immutable. Forms and native retries are separate; neither resends the other destination. Reload never automatically posts historical rows or pretends a destroyed document queue was accepted. Explicit native retry can reuse retained exact payloads.

## State and recovery

New DEV flow state is version 3, stored under `arcade-dogfood-v3:surface-inputs-dev`. Old v1/v2 links restart at the main page with a notice; no old state, results, Form receipts or Files data is deleted or relabeled. Files source and its original collector remain available outside the current flow.

Menu's result store is `surface-inputs-dev-menu-results-v1`; its Forms outbox is `surface-inputs-dev-menu-forms-v1`. Context is `<flow_id>_menu`. The result adapter uses an explicit Menu profile; old Files defaults and stores remain separate. A partial Menu reload cannot reconstruct missing input and asks for restart. Completed feedback reload restores only a matching two-row Menu result. Finish waits for the saved rating/explicit Skip, both Form request-sent receipts and required native ACKs. Task Skip interrupts the model and suppresses the delayed completion callback.

## Validation boundary

All client tests intercept network and use fixture native ports. Canvas comparisons use actual Chromium rendering against original jvision at 832×542 and 390×844. Controlled Menu result/feedback request bodies can be captured for the parent to perform the separately authorized real Form test. This implementation does not itself submit Google responses, change access, publish DEV or prove physical headset/backend delivery.
