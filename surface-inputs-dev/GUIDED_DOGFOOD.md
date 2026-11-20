# Guided dogfooding

## Task sequence

Enter a web participant unixname once, then Start Dogfooding. The same explicit label is required in browsers and APK WebViews; it prepopulates the existing task fields, which stay hidden/read-only in the guided flow. It is not native account attribution and is not put into task URLs.

Each environment remembers the entered unixname in an environment-scoped `localStorage` entry on that browser or APK WebView. New visits prefill the editable landing/primary-task field; replacing or clearing the field updates or removes the remembered value. Active guided runs retain their own participant snapshot. Clearing browser/app data removes the cache, and unavailable storage falls back to manual entry. No native identifiers, numeric UXR participant IDs, feedback or pending delivery records are used as cache sources.

1. Targeting: six complete sets, nine hits each (54 hits), then Next feedback.
2. Scrolling: six complete sets, six highlighted targets each (36 targets), then Next feedback.
3. Typing: twenty prompts from the existing natural-language-with-punctuation corpus, then Next feedback.
4. Hunt-and-peck typing: ten punctuation prompts with the prescribed index-or-middle-finger guidance, then Next feedback.
5. Menu: two original cascading-menu paths (3 levels, then 5 levels), then Finish feedback.

Finish reaches a thank-you page with Return to main page. The development path alone has Skip task. Skips do not fabricate completed sets, ratings or metrics. Existing geometry, prompt corpus, calculations and timing remain unchanged. Startup and between-set setup flashes are suppressed; feedback stays visible through navigation, with errors instead of transient success text.

## Versioned flow and new-task readiness

DEV uses five-stage state version 3 under `arcade-dogfood-v3:surface-inputs-dev`. Old v1 and Files-stage v2 links return to the main page with an explicit restart notice. No old state, pending Form row, feedback or measurement history is erased or extended in place. Production keeps its existing three-stage implementation.

H&P and Menu are stages in this flow, not extra landing links. Both use the saved participant and short-stage web contexts (`<flow_id>_hunt_peck`, `<flow_id>_menu`). In APK mode they require negotiated v2 before measurement. Each task uses its own Form shared across environments. The Menu entry uses the parent's supplied endpoint/question mappings; its live storage verification is a separate parent release check. Existing H&P/Files collector entries and histories remain unchanged. Unavailable configuration stops measurement instead of skipping or dropping a stage.

Reload during completed H&P or Menu feedback restores only the matching retained result, label, context and receipts, without remeasurement or automatic repost. Saved native payloads/ACK state support explicit native retry; an empty new document queue is not evidence of acceptance. In-progress reloads cannot reconstruct missing input, so they instruct restart while retaining history. Menu's custom modal waits for an explicit rating/Skip, both Form request-sent receipts and all required native ACKs. Abort/Skip interrupts selection and suppresses delayed completion; it never creates a result or rating.

## Independent collection destinations

The primary tasks send their complete UXR result rows and post-task feedback to their configured Google Forms in both browsers and APK mode. The 62 question IDs come from the owner's prefilled links (28 Typing, 22 Targeting, 12 Scrolling). Every set and Typing prompt remains a separate result row; feedback shares its web-owned task block. Direct/Practice Forms use a separate Forms block linked to their result snapshots; the native SDK's original task context remains unchanged. Feedback retries drain that Forms block, and cleanup protects the receipt under its actual Forms block while either widget destination remains incomplete. The feedback-to-Forms-block association is persisted before feedback retention; the saved widget state also carries the Forms block. Reload never guesses another task's context: a missing or inconsistent association is an explicit recovery error. Unknown measurements are omitted, never replaced with measured zero.

APK mode additionally emits the existing typed intent and opaque Arcade observations on the trusted private-port SDK. Its wire contracts, limits and metric definitions are unchanged. No native account/session/model identifiers are read into the webapp or sent to Forms. Explicit web labels and web session/block IDs are independent of native attribution. The SDK still blocks raw Form navigation in native mode; the configured background HTTPS collector does not navigate the WebView.

## Persistence and retries

A result snapshot is retained before the native result summary and before task/prompt advancement. A failed storage write preserves the completion snapshot and leaves it retryable. The Forms outbox is bounded to 256 immutable records / 1MiB. `SurfaceInputsTaskUploads.exportRecords()` returns a private snapshot; `clearExportedRecords()` requires confirmation and removes only exported request-sent records no longer needed by pending rows, active tasks, staged/in-flight sends or incomplete widget destinations. Pending and unexported records are protected, with no silent eviction. Native observations keep the existing 32-entry document queue. Storage/capacity checks happen before guided tasks start.

Forms and native feedback delivery flags are persisted separately. A native ACK changes only native state, never Forms state. A Forms retry cannot resend ACKed native observations; native retry cannot send another Form row. Next/Finish waits for the required Forms request completion and native feedback ACK (when native was bound), then also respects pending native navigation guards. Reload restores the same response, IDs, label and independent destination states. Native document-queue destruction still follows the existing recovery warning, not an assumption of delivery.

An opaque `no-cors` response establishes **request sent**, not HTTP acceptance or stored response. The immutable sent record remains locally retained and is never automatically retried. A network error/timeout remains pending/failed; an explicit retry may duplicate a row if delivery was ambiguous. There is no automatic historical backfill, no Forms fallback triggered by native failure, and no permission/authentication bypass. Old saved responses without dual-destination state keep their original delivery contract.

## Verification boundary

Offline tests intercept HTTP and use fake private ports; they do not prove physical APK networking or Scuba receipt. On November20, the two new task Forms were checked after the owner updated responder permissions: anonymous pages and mappings were verified, and labelled request bodies from the full client flow produced 11 stored H&P responses and 2 stored Files responses. Detailed answer readbacks were rate-limited, so backend field-by-field equality is not claimed. See [task Form verification](TASK_FORM_VERIFICATION.md).

## Release scope

Develop in `surface-inputs-dev/` first. Publication and production promotion require the owner-authorized review workflow; do not assume these edits are live. `surface-inputs/`, `jvision/`, the APK, device state and the unrelated dormant collector are unchanged during development.
