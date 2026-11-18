# Guided dogfooding

## Task sequence

The main page has one **Start Dogfooding** action. It creates a browser-tab dogfood session and guides the participant through:

1. Targeting: six complete sets, nine hits per set (54 hits total), then feedback.
2. Scrolling: six complete sets, six highlighted targets per set (36 targets total), then feedback.
3. Typing: twenty prompts from the existing natural-language-with-punctuation corpus, then final feedback.

Feedback uses **Next** after Targeting/Scrolling and **Finish** after Typing. Finish reaches a thank-you page with a return-to-main action. Blank freeform text is allowed; the ease rating is still required. The existing exact metric definitions, prompt corpus and fixed Targeting geometry are retained.

## One-time browser identity

The browser start page asks for a unixname once before Start Dogfooding. The entered value is scoped to that tab's guided run, prepopulates the existing Targeting/Scrolling participant fields and Typing unixname/user fields, and stays hidden/read-only on task pages. It is not placed in task URLs. Native-ready APK mode hides the initial field and asks for no browser identity; native account attribution remains host-owned.

## Initial page paint

Guided task pages keep a stable navy background and hide the raw setup until saved state and identity prepopulation are applied. This prevents the old setup/user-ID form flashing during the Start Dogfooding navigation. A ten-second initialization failure reveals an actionable error and return-to-main link rather than leaving the page hidden. Direct standalone/Practice pages keep their normal startup visibility.

## Between-set transitions

After the first Start, the guided block keeps its task setup screen hidden between sets, including while awaiting native ACKs. The existing playfield remains visible until the next set starts. The initial setup and legitimate storage-retry/reload recovery screens remain available. Direct standalone and Practice behavior are unchanged.

## Development and recovery

Only the URL’s exact development path enables **Skip task**. Skipped tasks do not fabricate completed sets, ratings or zero metrics. Native pending observations must be acknowledged before task navigation or another set starts. Reloading an unconfirmed native transition does not assume delivery; the user can return to main and restart. No APK or device changes are part of this web update.

Completed set counts and the current task are stored in sessionStorage. Partial sets restart after reload without counting as complete. Saved feedback is restored by task context with its original response ID, text and delivery channel. A failed storage write must succeed before the set/prompt can advance; retry preserves the completed measurement snapshot.

## Browser Forms

`forms-config.js` holds task-specific endpoints and the 62 question IDs supplied by the owner’s blank prefilled links: 28 Typing, 22 Targeting, 12 Scrolling. These IDs identify form questions, not participant data. No participant values are checked into the repository. The shared API quota blocked blank-schema checks; no ongoing Form watches or retry loops remain.

`task-uploads.js` snapshots each completed result row using the original field values and maps it to those task-specific question IDs. All six sets and all three typing prompts remain separate rows. Task result and feedback rows share `task_block_id`. Feedback-only rows contain identity/session/context, response ID, ease and comment; time/speed/error measurements are not invented.

A bounded local outbox retains failed requests and preserves immutable payloads on retry. A resolved opaque Google Forms POST means **request sent**, not confirmed server storage. Native-bound observations and feedback stay on the shared native SDK, never fall back to Forms.

The owner confirmed **all three Forms are published** on 2026-11-17. Browser submissions are enabled using the supplied mappings. Accepting-responses, sign-in settings and actual server storage have not been independently verified. A resolved opaque POST only establishes that a request was sent; failures remain retained for retry. Tests intercept every submission, so they never write test rows to the real Forms.

## Release scope

Development first. Production and `jvision/` stay unchanged until explicit promotion. Read `DEPLOYMENT.md` before publishing. The unrelated dormant collector branch remains isolated and is not loaded by this flow.
