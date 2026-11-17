# Guided dogfooding

## Task sequence

The main page has one **Start Dogfooding** action. It creates a browser-tab dogfood session and guides the participant through:

1. Targeting: six complete sets, nine hits per set (54 hits total), then feedback.
2. Scrolling: six complete sets, six highlighted targets per set (36 targets total), then feedback.
3. Typing: the existing three-prompt block, then final feedback.

Feedback uses **Next** after Targeting/Scrolling and **Finish** after Typing. Finish reaches a thank-you page with a return-to-main action. Blank freeform text is allowed; the ease rating is still required. The existing exact metric definitions, prompt corpus and fixed Targeting geometry are retained.

## Development and recovery

Only the URL’s exact development path enables **Skip task**. Skipped tasks do not fabricate completed sets, ratings or zero metrics. Native pending observations must be acknowledged before task navigation or another set starts. Reloading an unconfirmed native transition does not assume delivery; the user can return to main and restart. No APK or device changes are part of this web update.

Completed set counts and the current task are stored in sessionStorage. Partial sets restart after reload without counting as complete. Saved feedback is restored by task context with its original response ID, text and delivery channel. A failed storage write must succeed before the set/prompt can advance; retry preserves the completed measurement snapshot.

## Browser Forms

`forms-config.js` holds task-specific endpoints and the 62 question IDs supplied by the owner’s blank prefilled links: 28 Typing, 22 Targeting, 12 Scrolling. These IDs identify form questions, not participant data. No participant values are checked into the repository. The shared API quota blocked blank-schema checks; no ongoing Form watches or retry loops remain.

`task-uploads.js` snapshots each completed result row using the original field values and maps it to those task-specific question IDs. All six sets and all three typing prompts remain separate rows. Task result and feedback rows share `task_block_id`. Feedback-only rows contain identity/session/context, response ID, ease and comment; time/speed/error measurements are not invented.

A bounded local outbox retains failed requests and preserves immutable payloads on retry. A resolved opaque Google Forms POST means **request sent**, not confirmed server storage. Native-bound observations and feedback stay on the shared native SDK, never fall back to Forms.

Browser upload access remains gated until the owner confirms the Forms are published, accepting responses and accessible to the intended dogfooders. Tests override that gate with intercepted network requests; they are not proof of real response storage. No actual participant response or test row was submitted to the real Forms during implementation.

## Release scope

Development first. Production and `jvision/` stay unchanged until explicit promotion. Read `DEPLOYMENT.md` before publishing. The unrelated dormant collector branch remains isolated and is not loaded by this flow.
