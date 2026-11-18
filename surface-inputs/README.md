# Surface Inputs web tests

This folder consolidates the existing public keyboard and touchpad web test implementations. Task code and assets are copied from the pinned upstream commits recorded in `UPSTREAM.json`; no task rules or measurement formulas are changed.

## Run the tests

The [start page](index.html) asks browser users for a unixname once and starts the guided dogfood sequence: six Targeting sets (54 hits), six Scrolling sets (36 targets), then 20 natural-language-with-punctuation Typing prompts. Task icons are visible on setup screens; repeated identity fields are prepopulated and hidden. Feedback uses Next, Next and Finish, then reaches a thank-you page with Return to main page. Native-ready mode keeps account attribution host-owned and does not ask for a browser identity.

- [Keyboard test](keyboard/?setting_preset=uxr): natural language, punctuation/capitalization, email, password, shortcuts, and arrows.
- [Touchpad targeting](touchpad/index.html).
- [Touchpad scrolling](touchpad/scroll.html).
- [Touchpad text selection](touchpad/textselection.html).
- [Touchpad zoom](touchpad/zoom.html).

The alternate upstream [UXR touchpad variants](touchpad/uxr/index.html) and keyboard `exec_demo` sources are retained for completeness. The targeting and scrolling pages above correspond to the exact root-level pages supplied for this migration, not the alternate `uxr/` protocols.

For local use, run a static HTTP server at the repository root, for example `python3 -m http.server 8000`, and open `/surface-inputs/keyboard/` or a touchpad page. Use HTTP rather than opening HTML files directly, since the keyboard loads prompt files with `fetch`.

## Promoted activity UI

Production matches the owner-approved dev runtime from `6c3c459`: guided task blocks, stable two-channel telemetry SDK, mapped Form results and feedback, task icons, and startup/between-set/final-navigation flicker fixes. The fixed Targeting SVG remains 620×400, with unchanged target sizes, hit rules, prompt corpus and shared calculations.

Environment behavior is URL-derived. The DEV pill and Skip task control are absent at `/surface-inputs/`. Browser feedback uses the task-specific outbox; native traffic remains on the private SDK port. Opaque POST completion and native sink acceptance are not themselves downstream storage receipts.

## Page navigation

Every HTML task/demo subpage has a **Home/back** control returning to the production main page. Typing places it after the app controls; Scrolling uses a compact arrow in free space or a reachable footer below the pane on short screens. The controls do not cover measured task regions. Existing native pending-message guards and feedback-modal inert behavior are preserved.

Targeting no longer shows the result-history card on its return screen. Measurements, logs and collection paths are unchanged. Legacy `exec_demo` and Fitts latency pages use the common capability handshake for APK navigation; native intent measurements were not added to those implementations.

## Upstream provenance

- Keyboard: [fbotros/si_eval_app](https://github.com/fbotros/si_eval_app), commit `082f9d740ba2e65a6a2714c4b40065082c28e58e`.
- Touchpad: [sheng-shen/sheng-shen.github.io](https://github.com/sheng-shen/sheng-shen.github.io), `data/fitts/`, commit `0867883aa5e63c75c6ed320b32253d71eeb71b4f`.
- Original task sources: https://fbotros.github.io/si_eval_app/, https://sheng-shen.github.io/data/fitts/index.html, and https://sheng-shen.github.io/data/fitts/scroll.html.

Existing upstream notices, comments, license text, libraries, and source README files are preserved. See `touchpad/uxr/readme.md` and the individual vendored library headers for the notices supplied upstream. No new blanket license is asserted for copied code.

The upstream jQuery UI 1.8.6 stylesheet referenced theme images that were absent from its repository. Matching `ui-lightness` images from the official jQuery CDN are bundled under both touchpad variants; their source URLs and hashes are recorded in `UPSTREAM.json`. Original stylesheets, task rules and legacy calculations remain unchanged; narrow telemetry hooks are described below.

## Collection boundary

Primary Typing, Targeting and Scrolling use the owner-supplied task-specific question mappings through `task-uploads.js`. Browser result rows and feedback share a task-block ID, with failures retained for immutable retry and queue draining that avoids already-completed requests. A labeled Typing browser test was read back from Google Forms and verified; complete field parity for every result row, the other two Forms and native/Scuba E2E were not established by that test. Never treat an opaque request as verified storage. Native-bound tasks stay on the stable private-port SDK and do not fall back to Forms. The separate dormant collector remains isolated.

See [the telemetry contract](TELEMETRY.md) for handshake, bounds, ACK/retry behavior, populated metrics and unavailable measurements. Run the offline transport/producer checks with `node --test surface-inputs/tests/*.test.js` from the repository root. These checks use fake sinks and never submit Forms. Generate receiver fixtures with `node surface-inputs/tests/generate-fixtures.js`.

Public task assets and private feedback/results remain separate. The native queue is document-local and is not a server-upload guarantee.
