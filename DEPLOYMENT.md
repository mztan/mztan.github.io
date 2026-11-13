# Deployment workflow

## Environment paths

- Production source: `surface-inputs/`
- Production URL: https://mztan.github.io/surface-inputs/
- Development source: `surface-inputs-dev/`
- Development URL: https://mztan.github.io/surface-inputs-dev/
- Branch: `main`; GitHub Pages publishes the committed repository content.

These are separate static paths in one repository. They do not provide separate collectors, credentials, or backends. Development retains production's Google Forms and native-message telemetry behavior: **there is no dev upload blocking**. Do not use real participant data for a casual UI test unless that collection is intended.

## Development changes

1. Work under `surface-inputs-dev/`, leaving `surface-inputs/` unchanged.
2. Keep launch links, JS, CSS, images and prompt-file references relative, so dev loads dev assets.
3. Keep the `DEVELOPMENT` home label and Development page title.
4. Run relevant tests: `node --test surface-inputs-dev/tests/*.test.js`. Run `python3 scripts/verify-environments.py` to check labeling, local references, unchanged collection code and an empty production diff. Check modified JS with `node --check <file>` and run `git diff --check`.
5. Review `git diff -- surface-inputs/` and `git diff --cached -- surface-inputs/`; both must be empty for a dev-only change. Commit only the intended dev/documentation files and push `main` when publication is authorized.
6. GitHub Pages deployment is asynchronous. After publication, fetch the dev URL and changed files, confirm they match the committed bytes, and check the production files are unchanged. Browser caching may require a reload or a version query string.

Node tests use offline fakes. They do not prove browser layout, physical input behavior, native WebView message delivery or server telemetry receipt.

## Refresh dev from prod

For the initial copy, run `python3 scripts/sync-dev.py`.

For a deliberate reset, first commit or preserve dev-only work, review what will be discarded, then run `python3 scripts/sync-dev.py --overwrite-dev`. This copies the current production tree, including its collection behavior, into dev and reapplies the Development label/title. It discards dev-only task/theme changes; it never writes production. The script has no deployment or commit side effect. There is no upload guard to preserve.

## Promote to production

**Promote only after the owner explicitly approves production promotion.** Review selected dev changes and manually copy the approved task/theme files into `surface-inputs/`, updating any environment-relative references. Do not copy the dev home label/title or dev-only documentation into production. Run production tests, review the final production diff, commit and publish the approved files. Do not blindly replace the whole production folder.

Use a normal Git revert to roll back a published change. Do not force-push shared history. A repository commit records exactly what changed in each deployment.

## Browser and APK behavior

- Standalone browser tests ask for the upstream identity where required and use their existing Google Forms flow.
- A compatible APK negotiates the native MessagePort transport and emits observations through its telemetry sinks without asking for identity already provided by native telemetry.
- The APK's default URL is a separate source-code choice. It currently points to production. This dev path does not automatically switch it. The APK's page/origin allowlist must explicitly support dev before loading dev inside it; otherwise use a normal browser for dev.
- `arcade_debugger=true` is an APK boolean launch extra on a debuggable build, not a web query parameter or deployment environment. In the preflight implementation it previews the calibration screen and lets Calibrate skip it, without sending a calibration request. It does not disable telemetry. A connected Java debugger at Activity creation also enables that preview. The website cannot create that native opt-in.
- Adding dev does not authorize APK deployment, release-channel publication, source landing or changing production defaults.

## Credentials

Never check tokens, key material or SSH-agent configuration into this repository. Use a repository-scoped deploy key or appropriately scoped credential outside the tree. An encrypted SSH key can persist on a development host, while its unlocked agent state ends on reboot/agent shutdown; unlock the existing key rather than generating replacements. Do not paste secrets into chat, scripts, commits, or build logs.
