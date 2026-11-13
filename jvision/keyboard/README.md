# SI Eval App — Typing Test

A web-based typing test application that measures typing speed (WPM), accuracy, and error rates across multiple datasets. Supports custom autocorrect, QA mode for exact-match validation, and UXR study modes with Google Forms integration.

## Running Locally

This is a static HTML/JS app, but it uses `fetch()` to load prompt files, so it **must be served over HTTP** (opening `index.html` directly via `file://` will fail).

Start a local server from the project directory:

```bash
cd si_eval_app
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

## Features

- **Multiple datasets**: Practice, Natural Language, Natural Language with Punctuation, Emails, Passwords, Metal Keys
- **Autocorrect modes**: Off, System (browser-native), or Custom (keyboard-aware Levenshtein distance)
- **QA Mode**: Requires 100% accuracy with real-time character highlighting
- **UXR Mode**: Activated via URL parameter (`?setting_preset=uxr` or `?setting_preset=uxr_webview`), submits per-prompt results to a Google Form
- **Metrics**: WPM, Adjusted WPM (AWPM), Accuracy, Uncorrected Error Rate (UER), Corrected Error Rate (CER), Total Error Rate (TER)

## Project Structure

```
├── index.html              # Main HTML page
├── script.js               # Core application logic
├── styles.css              # Styles
├── keyboard-layout.js      # QWERTY keyboard neighbor map for autocorrect
├── prompts/                # Prompt datasets (one prompt per line)
│   ├── practice.txt
│   ├── nat_lang_no_punc.txt
│   ├── nat_lang_with_cap_punc.txt
│   ├── emails.txt
│   ├── passwords.txt
│   └── metal_keys.txt
└── favicon-32x32.png
```

## URL Parameters

| Parameter | Values | Description |
|---|---|---|
| `setting_preset` | `qa`, `uxr`, `uxr_webview` | Activates preset configurations |
| `platform` | any string | Recorded in form submissions |
| `dataset` | `practice`, `nat_lang_no_punc`, `nat_lang_with_cap_punc`, `emails`, `passwords`, `metal_keys` | Selects the prompt dataset |
| `autocorrect` | `off`, `system`, `custom` | Sets the autocorrect mode |
| `num_prompts` | integer | Limits the number of prompts to display |
| `user_id` | any string | Sets the user ID for form submissions |
