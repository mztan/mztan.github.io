# Deployment workflow

## Environment paths

- Production source: `surface-inputs/`
- Production URL: https://mztan.github.io/surface-inputs/
- Development source: `surface-inputs-dev/`
- Development URL: https://mztan.github.io/surface-inputs-dev/
- Branch: `main`; GitHub Pages publishes the committed repository content.

The owner authorized the November18 dual-destination update for dev and production: primary Typing, Targeting and Scrolling result rows and feedback submit to Google Forms in both browsers and APK mode, with APK native telemetry retained. Both modes use one explicitly entered web participant label; native attribution and identifiers remain private to the host. Retries and receipts are independent, and opaque Forms responses are not stored receipts. No historical backfill, APK release/install or jvision changes are included. Tests use intercepted HTTP only.

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
- The APK emits native telemetry with host-owned attribution. Primary tasks also send complete UXR results and feedback to their configured Forms in both environments. Both browser and APK flows ask once for an explicit web participant label, never a value derived from native identifiers. Native and Forms retries update only their own destination.
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

Both environments guide participants through six Targeting sets, six Scrolling sets and 20 punctuation Typing prompts. Enter the web unixname once in either browser or APK mode; it fills the existing task fields and never supplies native attribution. The entered label is remembered in environment-scoped localStorage for returning visits on that browser/WebView, remains editable, and is removed when the field is cleared or site/app data is cleared. Active guided runs retain their participant snapshot; unavailable cache storage falls back to manual entry. Next/Finish respect independent Forms/native completion. DEV and Skip appear only under the exact dev path. [GUIDED_DOGFOOD.md](surface-inputs-dev/GUIDED_DOGFOOD.md) defines the collector and recovery behavior.

The adapter keeps the owner's 62 supplied question mappings. Request-sent Form records remain locally retained and never automatically reposted; explicit export/confirmed cleanup protects pending rows and unfinished widget destinations. The November17 real browser Typing feedback check remains limited evidence; this November18 release is verified with offline mocks, not physical APK networking or Google/Scuba storage. The native SDK contract and raw-Form navigation protection remain unchanged.

## Credentials

Never check tokens, key material or SSH-agent configuration into this repository. Use a repository-scoped deploy key or appropriately scoped credential outside the tree. An encrypted SSH key can persist on a development host, while its unlocked agent state ends on reboot/agent shutdown; unlock the existing key rather than generating replacements. Do not paste secrets into chat, scripts, commits, or build logs.
