# Agent instructions

Read [DEPLOYMENT.md](DEPLOYMENT.md) before editing or publishing.

- `surface-inputs/` is production. `surface-inputs-dev/` is the development preview. `jvision/` is a separate personal preview (a copy of dev plus the Menus/Circles/Files/Storefront tasks); changes there don't touch production or dev.
- Make new task and UI changes in dev first. Do not edit or promote into production unless the owner explicitly asks.
- A push to `main` can publish both directories through GitHub Pages. Check the complete Git diff before pushing; a dev-only request must leave all production files unchanged.
- Development does **not** block telemetry, Google Forms, or feedback writes. It uses the same collection behavior and destinations as the copied production implementation. Development runs can enter those datasets. Do not introduce an upload guard unless requested.
- Keep task calculations, geometry, timing, and input behavior unchanged for visual-only requests.
- Keep assets and launch links relative to their environment directory. The start page may load the shared root `environment.js`; this adds a bottom-right `DEV` pill based only on the URL path and does not change telemetry. Do not point dev links at production tests.
- The Android APK's default website URL is maintained separately. Creating or promoting a web environment does not authorize changing that default or deploying/landing an APK.
- Never commit credentials, private keys, participant responses, or private account data. Use repository-scoped credentials kept outside the repository.
- Preserve upstream attribution and describe intentional modifications. `UPSTREAM.json` identifies the original imported sources, not a promise that later modified files remain byte-identical.
- Verify the relevant Node tests, script syntax, local asset paths, intended production/dev changes and live published URLs. Do not claim physical WebView, input-device or downstream-upload validation from static/Node tests.
