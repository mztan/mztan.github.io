# Guided dogfooding

## Task sequence

Enter a web participant unixname once, then Start Dogfooding. The same explicit label is required in browsers and APK WebViews; it prepopulates the existing task fields, which stay hidden/read-only in the guided flow. It is not native account attribution and is not put into task URLs.

1. Targeting: six complete sets, nine hits each (54 hits), then Next feedback.
2. Scrolling: six complete sets, six highlighted targets each (36 targets), then Next feedback.
3. Typing: twenty prompts from the existing natural-language-with-punctuation corpus, then Finish feedback.

Finish reaches a thank-you page with Return to main page. The development path alone has Skip task. Skips do not fabricate completed sets, ratings or metrics. Existing geometry, prompt corpus, calculations and timing remain unchanged. Startup and between-set setup flashes are suppressed; feedback stays visible through navigation, with errors instead of transient success text.

## Independent collection destinations

The primary tasks send their complete UXR result rows and post-task feedback to their configured Google Forms in both browsers and APK mode. The 62 question IDs come from the owner's prefilled links (28 Typing, 22 Targeting, 12 Scrolling). Every set and Typing prompt remains a separate result row; feedback shares its web-owned task block. Unknown measurements are omitted, never replaced with measured zero.

APK mode additionally emits the existing typed intent and opaque Arcade observations on the trusted private-port SDK. Its wire contracts, limits and metric definitions are unchanged. No native account/session/model identifiers are read into the webapp or sent to Forms. Explicit web labels and web session/block IDs are independent of native attribution. The SDK still blocks raw Form navigation in native mode; the configured background HTTPS collector does not navigate the WebView.

## Persistence and retries

A result snapshot is retained before the native result summary and before task/prompt advancement. A failed storage write preserves the completion snapshot and leaves it retryable. The Forms outbox is bounded to 256 immutable records / 1MiB. `SurfaceInputsTaskUploads.exportRecords()` returns a private snapshot; `clearExportedRecords()` requires confirmation and removes only exported request-sent records no longer needed by pending rows, active tasks, staged/in-flight sends or incomplete widget destinations. Pending and unexported records are protected, with no silent eviction. Native observations keep the existing 32-entry document queue. Storage/capacity checks happen before guided tasks start.

Forms and native feedback delivery flags are persisted separately. A native ACK changes only native state, never Forms state. A Forms retry cannot resend ACKed native observations; native retry cannot send another Form row. Next/Finish waits for the required Forms request completion and native feedback ACK (when native was bound), then also respects pending native navigation guards. Reload restores the same response, IDs, label and independent destination states. Native document-queue destruction still follows the existing recovery warning, not an assumption of delivery.

An opaque `no-cors` response establishes **request sent**, not HTTP acceptance or stored response. The immutable sent record remains locally retained and is never automatically retried. A network error/timeout remains pending/failed; an explicit retry may duplicate a row if delivery was ambiguous. There is no automatic historical backfill, no Forms fallback triggered by native failure, and no permission/authentication bypass. Old saved responses without dual-destination state keep their original delivery contract.

## Verification boundary

Tests intercept all HTTP and use fake private ports. They do not prove current Google permissions, real APK networking or Scuba receipt. No real Form responses or permission changes are part of this change. The previous labeled browser Typing feedback was verified through Google API readback on November17; that earlier result does not prove the new APK dual path or the other two Forms.

## Release scope

Develop in `surface-inputs-dev/` first. Publication and production promotion require the owner-authorized review workflow; do not assume these edits are live. `surface-inputs/`, `jvision/`, the APK, device state and the unrelated dormant collector are unchanged during development.
