# Surface Inputs web tests

The keyboard and touchpad tests are versioned in this Git repository and published through GitHub Pages.

## Environments

- **Production:** [surface-inputs/](https://mztan.github.io/surface-inputs/)
- **Development:** [surface-inputs-dev/](https://mztan.github.io/surface-inputs-dev/)
- **jvision preview:** [jvision/](https://mztan.github.io/jvision/) — a copy of dev with the Menus, Circles, Files, Storefront, Photo crop and Map landmark tasks added; see its README.

Dev is a plain sibling copy for fast iteration, not a separate backend. Its small bottom-right **DEV** pill is rendered at runtime from the `surface-inputs-dev` URL path, not hardcoded in its HTML. **Uploads are enabled in both environments.** Dev retains the same Google Forms and APK telemetry behavior as prod, so testing may write to the existing collection destinations.

Read [DEPLOYMENT.md](DEPLOYMENT.md) for dev refresh, verification, publication and explicit production promotion. Agents must also read [AGENTS.md](AGENTS.md).

The task suites retain upstream source attribution in each environment's README and `UPSTREAM.json`. Browser identity/Google Forms and native WebView message transport are documented in each environment's `TELEMETRY.md`.
