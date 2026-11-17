# Deployment workflow

## Environment paths

- Production source: `surface-inputs/`
- Production URL: https://mztan.github.io/surface-inputs/
- Development source: `surface-inputs-dev/`
- Development URL: https://mztan.github.io/surface-inputs-dev/
- Branch: `main`; GitHub Pages publishes the committed repository content.

These are separate static paths in one repository, not separate backends. Production remains on the previously promoted Home/back navigation, Targeting cleanup, themes and URL-only Form URLs, with legacy unverified field bindings and browser-local feedback. Development now uses the guided sequence and enabled task-specific Form adapter with owner-supplied prefilled-link mappings. Publication was confirmed by the owner; accepting-responses/sign-in settings and server storage are not independently verified. Opaque browser POST or native sink ACK never means confirmed server receipt. Neither environment has a dev upload-blocking guard. `jvision/` is a separate preview and unchanged by this release. Tests must mock uploads unless real collection is explicitly intended.

## Development changes

1. Work under `surface-inputs-dev/`, leaving `surface-inputs/` unchanged.
2. Keep launch links, JS, CSS, images and prompt-file references relative, so dev loads dev assets.
3. The start page loads the shared `environment.js`. It reads `window.location.pathname`: only the first path segment `surface-inputs-dev` selects development. A small `DEV` pill appears at the bottom right and the page title gains Development; production URLs show no pill. No badge text is baked into the HTML. Query strings, similar path names and telemetry settings do not determine the environment.
4. Run relevant tests: `node --test surface-inputs-dev/tests/*.test.js` and `node --test scripts/environment.test.js`. Run `python3 scripts/verify-environments.py` to check labeling, local references, unchanged collection code and an empty production diff. Check modified JS with `node --check <file>` and run `git diff --check`.
5. Review `git diff -- surface-inputs/` and `git diff --cached -- surface-inputs/`; both must be empty for a dev-only change. Commit only the intended dev/documentation files and push `main` when publication is authorized.
6. GitHub Pages deployment is asynchronous. After publication, fetch the dev URL and changed files, confirm they match the committed bytes, and check the production files are unchanged. Browser caching may require a reload or a version query string.

Node tests use offline fakes. They do not prove browser layout, physical input behavior, native WebView message delivery or server telemetry receipt.

## Refresh dev from prod

For the initial copy, run `python3 scripts/sync-dev.py`.

For a deliberate reset, first commit or preserve dev-only work, review what will be discarded, then run `python3 scripts/sync-dev.py --overwrite-dev`. This copies the current production tree, including its collection behavior, into dev and links the shared `environment.js` runtime. The script does not generate badge text or a Development title: the webpage derives both from its URL. It discards dev-only task/theme changes; it never writes production. The script has no deployment or commit side effect. There is no upload guard to preserve.

## Promote to production

**Promote only after the owner explicitly approves production promotion.** Review selected dev changes and manually copy the approved task/theme files into `surface-inputs/`, updating any environment-relative references. Do not copy dev-only documentation into production. A promoted launcher can retain `environment.js`: its URL-based badge will remain hidden at the production path. For an explicitly authorized full runtime promotion, run `python3 scripts/verify-environments.py --allow-production-changes`; this verifies runtime parity and leaves `jvision/` protected. Run both production and dev Node test suites, review the final production diff, commit and publish the approved files. Do not blindly replace the whole production folder.

Use a normal Git revert to roll back a published change. Do not force-push shared history. A repository commit records exactly what changed in each deployment.

## Browser and APK behavior

- Standalone browser tests ask for the upstream identity where required and use their existing Google Forms flow.
- A compatible APK negotiates the native MessagePort transport and emits observations through its telemetry sinks without asking for identity already provided by native telemetry.
- The APK defaults to production. In a compatible **debuggable** APK, launch with `--ez arcade_dev true` to open dev. Release APKs ignore that extra. Website navigation and native telemetry ports remain restricted to the selected environment for the Activity lifetime; use a fresh launch to switch. Dev continues emitting telemetry through the same sinks.
- `arcade_debugger=true` is an independent APK boolean launch extra on a debuggable build, not a web query parameter or deployment environment. In the preflight implementation it previews the calibration screen and lets Calibrate skip it, without sending a calibration request. It does not disable telemetry. A connected Java debugger at Activity creation also enables that preview. The website cannot create that native opt-in.
- Adding dev does not authorize APK deployment, release-channel publication, source landing or changing production defaults.

### APK launch commands

These require an APK containing the dev-selection implementation; older builds only load production.

```bash
# Dev with the ordinary Surface Keyboard readiness check.
adb shell am start -S -n com.meta.surfaceinputsarcade/.SurfaceInputsArcadeActivity --ez arcade_dev true
# Dev with calibration preview; Calibrate skips the real request.
adb shell am start -S -n com.meta.surfaceinputsarcade/.SurfaceInputsArcadeActivity --ez arcade_dev true --ez arcade_debugger true
# Default production launch.
adb shell am start -S -n com.meta.surfaceinputsarcade/.SurfaceInputsArcadeActivity
```

The `-S` option stops the existing activity so the new launch options take effect. `SHOW_MENU` returns to the selected environment; it does not switch environments. Neither launch extra changes device preferences or disables uploads.

## Telemetry SDK compatibility

All new tasks use the shared SDK described in `surface-inputs-dev/BRIDGE_CONTRACT.md`. Keep the fixed typed intent schema and calculations unchanged; new UXR metrics and custom ratings go through the opaque Arcade JSON channel. Tasks requiring v2 must verify native capabilities before timing/interaction. The initial compatible APK upgrade is separate from a web release; do not infer support from its version name or add native task enums.

Run `node surface-inputs-dev/tests/generate-contract.js --check`, the dev conformance tests and actual SDK fixture generation before release. New typed fields, wire versions or origins need an explicit compatibility upgrade. Legacy readiness/intent/feedback behavior stays supported; no browser uploads become a native fallback. The stopped Forms work and dormant collector remain out of scope. Production promotion and headset installation still require separate owner authorization.

## Guided dogfood staging

The development main page uses one Start Dogfooding action and the ordered Targeting → Scrolling → Typing flow. Each touchpad task runs six sets before feedback; Typing retains three prompts. Next/Finish deliver feedback before navigation, and only the exact dev path enables Skip task. See `surface-inputs-dev/GUIDED_DOGFOOD.md` for recovery and Form mapping provenance.

The new task-specific upload adapter uses 62 question IDs supplied through the owner’s blank prefilled links. The owner confirmed all three Forms published on 2026-11-17, enabling browser requests; respondent restrictions and stored responses are not independently verified. Use mocked requests for tests, not real participant submissions, and retain failed uploads. Native-bound traffic remains on the shared SDK. This staging change does not promote the flow to production or install an APK.

## Credentials

Never check tokens, key material or SSH-agent configuration into this repository. Use a repository-scoped deploy key or appropriately scoped credential outside the tree. An encrypted SSH key can persist on a development host, while its unlocked agent state ends on reboot/agent shutdown; unlock the existing key rather than generating replacements. Do not paste secrets into chat, scripts, commits, or build logs.
