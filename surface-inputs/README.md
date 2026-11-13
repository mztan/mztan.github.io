# Surface Inputs web tests

This folder consolidates the existing public keyboard and touchpad web test implementations. Task code and assets are copied from the pinned upstream commits recorded in `UPSTREAM.json`; no task rules or measurement formulas are changed.

## Run the tests

The [start page](index.html) presents Targeting, Scrolling, and Typing with the Surface Inputs Arcade aesthetic: a navy background, cream/red condensed wordmark, flat dark activity tiles, mint icons, and 2px corners. The desktop row becomes a compact stacked layout on narrow screens. There is no source footer. All three actions navigate to the local copies in the same tab, so the launcher also works without JavaScript and can be used in a WebView. The shared `df_202611` session label is retained; Typing uses the existing `df` preset with `num_prompts=3` to match the requested short block. This launcher does not itself orchestrate multiple activities or enforce three touchpad runs.

- [Keyboard test](keyboard/?setting_preset=uxr): natural language, punctuation/capitalization, email, password, shortcuts, and arrows.
- [Touchpad targeting](touchpad/index.html).
- [Touchpad scrolling](touchpad/scroll.html).
- [Touchpad text selection](touchpad/textselection.html).
- [Touchpad zoom](touchpad/zoom.html).

The alternate upstream [UXR touchpad variants](touchpad/uxr/index.html) and keyboard `exec_demo` sources are retained for completeness. The targeting and scrolling pages above correspond to the exact root-level pages supplied for this migration, not the alternate `uxr/` protocols.

For local use, run a static HTTP server at the repository root, for example `python3 -m http.server 8000`, and open `/surface-inputs/keyboard/` or a touchpad page. Use HTTP rather than opening HTML files directly, since the keyboard loads prompt files with `fetch`.

## Upstream provenance

- Keyboard: [fbotros/si_eval_app](https://github.com/fbotros/si_eval_app), commit `082f9d740ba2e65a6a2714c4b40065082c28e58e`.
- Touchpad: [sheng-shen/sheng-shen.github.io](https://github.com/sheng-shen/sheng-shen.github.io), `data/fitts/`, commit `0867883aa5e63c75c6ed320b32253d71eeb71b4f`.
- Original task sources: https://fbotros.github.io/si_eval_app/, https://sheng-shen.github.io/data/fitts/index.html, and https://sheng-shen.github.io/data/fitts/scroll.html.

Existing upstream notices, comments, license text, libraries, and source README files are preserved. See `touchpad/uxr/readme.md` and the individual vendored library headers for the notices supplied upstream. No new blanket license is asserted for copied code.

The upstream jQuery UI 1.8.6 stylesheet referenced theme images that were absent from its repository. Matching `ui-lightness` images from the official jQuery CDN are bundled under both touchpad variants; their source URLs and hashes are recorded in `UPSTREAM.json`. The original stylesheet and task scripts remain unchanged.

## Collection boundary

This is source consolidation only. Existing upstream Google Forms logging endpoints remain unchanged. This migration does not configure a new collection backend, publish participant data, implement the shortened dogfooding sequence, or add the Android WebView bridge. Static validation does not run test sessions or submit forms.

Public task assets and private feedback/results must remain separate when the collection integration is added.
