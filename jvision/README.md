# Surface Inputs web tests — jvision preview

`jvision/` is a personal preview copied from `surface-inputs-dev/`, published at https://mztan.github.io/jvision/. It keeps dev's behavior for the existing tasks (including the same Google Forms collection) and adds two touchpad tasks ported from the native Surface Inputs QA app stack D131663691 → D131670572:

- [Menus](touchpad/menu.html) (`stp_cascading_menu`): open the menu and select a 3-level path, then a 5-level path (menu widths 10/4/4/4/2). Hover opens submenus; a click selects; a click on empty space dismisses. Measures attempts, wrong selections, dismissals, deepest level reached, first-attempt success, clicks and cursor travel. As a visual aid, the requested path is shaded light gray and the prompt says "(follow the gray path)". The native task has no such highlight, so results aren't directly comparable.
- [Circles](touchpad/circle.html) (`stp_circle_tracing`): starting at the blue marker, trace six clockwise laps with the cursor, without clicking. Measures per-lap radial RMS/P95 error, closure error, bounding radius, center shift from the first lap, attempts, interruptions and accidental clicks.

Trial logic is in `path-tasks.js`, a line-for-line port of `SurfaceInputsQaMenuTrials` / `SurfaceInputsQaCircleTrials`, with the native unit tests ported in `tests/path-tasks.test.js`. Differences from the native app: browser pointer events replace Android hover/touch events. A touchpad that the browser reports as a mouse counts as hover; touch or pen input invalidates the trace. Two-finger pan classification isn't visible to the page.

**The new tasks don't upload anything.** Their results and optional 1–5 ease rating are saved in this browser's localStorage (`jvision-path-results-v1`, at most 50 runs) and can be downloaded with **Export saved results**. They send no native WebView telemetry: the APK only loads the production/dev URLs, and its sink has no activity IDs for these tasks. Feedback for the existing tasks is stored under `jvision-feedback-v1`, separate from dev's.

Run the checks with `node --test jvision/tests/*.test.js` from the repository root.

The rest of this README is inherited from dev.


This folder consolidates the existing public keyboard and touchpad web test implementations. Task code and assets are copied from the pinned upstream commits recorded in `UPSTREAM.json`; no task rules or measurement formulas are changed.

## Run the tests

The [start page](index.html) presents Targeting, Scrolling, and Typing with the Surface Inputs Arcade aesthetic: a navy background, cream/red condensed wordmark, flat dark activity tiles, mint icons, and 2px corners. The desktop row becomes a compact stacked layout on narrow screens. There is no source footer. All three actions navigate to the local copies in the same tab, so the launcher also works without JavaScript and can be used in a WebView. The shared `df_202611` session label is retained; Typing uses the existing `df` preset with `num_prompts=3` to match the requested short block. This launcher does not itself orchestrate multiple activities or enforce three touchpad runs.

- [Keyboard test](keyboard/?setting_preset=uxr): natural language, punctuation/capitalization, email, password, shortcuts, and arrows.
- [Touchpad targeting](touchpad/index.html).
- [Touchpad scrolling](touchpad/scroll.html).
- [Touchpad text selection](touchpad/textselection.html).
- [Touchpad zoom](touchpad/zoom.html).

The alternate upstream [UXR touchpad variants](touchpad/uxr/index.html) and keyboard `exec_demo` sources are retained for completeness. The targeting and scrolling pages above correspond to the exact root-level pages supplied for this migration, not the alternate `uxr/` protocols.

For local use, run a static HTTP server at the repository root, for example `python3 -m http.server 8000`, and open `/jvision/` or one of its pages. Use HTTP rather than opening HTML files directly, since the keyboard loads prompt files with `fetch`.

## Development visual themes

Targeting, Scrolling and Typing use the Arcade navy/card surfaces, cream text, coral actions and mint feedback. Page-specific override stylesheets are loaded after the original styles; shared task engines, prompt corpora, calculations and telemetry behavior are unchanged. Scrolling keeps its original text font metrics, scroll range, highlight geometry and acceptance band. Typing keeps prompt/input typography, editor behavior, settings and metric calculations. Narrow-screen settings panels stay inside the viewport.

The alternate `touchpad/uxr/` and `keyboard/exec_demo/` pages are not restyled by these overrides. Development uses the same collection destinations as production; there is no upload blocking. See [the deployment workflow](../DEPLOYMENT.md) before publishing. A dev theme change does not promote to `surface-inputs/` or change an Android APK's default URL.

## Post-task feedback

After a complete Targeting, Scrolling or Typing task, a shared Arcade dialog asks **How easy or difficult was this task?** on a 1–5 scale, from Very difficult to Very easy. It also asks **What worked well, or what could be improved?** as optional freeform text. This is original Arcade wording, not Jason's verbatim questionnaire. No rating is preselected, and Skip is available.

A response is bounded to 1,024 UTF-8 comment bytes and the existing 2,048-byte native payload/details limit. It is saved locally before native enqueue; native status distinguishes pending, rejection and sink acceptance. Browser feedback stays on the browser because no feedback collector is configured; use **Export saved feedback** to keep a private copy. At most 50 responses are retained without silent eviction. Clear requires explicit confirmation after export. This adds no telemetry/upload guard and does not change objective task Forms.

See [the telemetry contract](TELEMETRY.md#post-task-feedback-ui) for completion boundaries, retention and the limited meaning of feedback-block IDs.

## Upstream provenance

- Keyboard: [fbotros/si_eval_app](https://github.com/fbotros/si_eval_app), commit `082f9d740ba2e65a6a2714c4b40065082c28e58e`.
- Touchpad: [sheng-shen/sheng-shen.github.io](https://github.com/sheng-shen/sheng-shen.github.io), `data/fitts/`, commit `0867883aa5e63c75c6ed320b32253d71eeb71b4f`.
- Original task sources: https://fbotros.github.io/si_eval_app/, https://sheng-shen.github.io/data/fitts/index.html, and https://sheng-shen.github.io/data/fitts/scroll.html.

Existing upstream notices, comments, license text, libraries, and source README files are preserved. See `touchpad/uxr/readme.md` and the individual vendored library headers for the notices supplied upstream. No new blanket license is asserted for copied code.

The upstream jQuery UI 1.8.6 stylesheet referenced theme images that were absent from its repository. Matching `ui-lightness` images from the official jQuery CDN are bundled under both touchpad variants; their source URLs and hashes are recorded in `UPSTREAM.json`. Original stylesheets, task rules and legacy calculations remain unchanged; narrow telemetry hooks are described below.

## Collection boundary

Browser Google Forms endpoints and identity controls remain unchanged. The keyboard main page and root/UXR touchpad targeting, scrolling, selection and zoom pages now support the private native MessagePort handshake and typed intent observations. Native attribution and collection are host-owned; there is no new web backend or feedback UI. `exec_demo` and the UXR Fitts latency variant remain browser-only.

See [the telemetry contract](TELEMETRY.md) for handshake, bounds, ACK/retry behavior, populated metrics and unavailable measurements. Run the offline transport/producer checks with `node --test surface-inputs/tests/*.test.js` from the repository root. These checks use fake sinks and never submit Forms. Generate receiver fixtures with `node surface-inputs/tests/generate-fixtures.js`.

Public task assets and private feedback/results remain separate. The native queue is document-local and is not a server-upload guarantee.
