document.addEventListener('DOMContentLoaded', async function () {
    function getURLParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    let surfaceDifference = -1;
    let conditionId = -1;
    let conditionValue = -1;
    let qrHeight = -1;

    // Array of prompts for the typing test - loaded from prompts.txt
    let originalPrompts = [];

    // Counters for tracking during a prompt
    let keyPressCount = 0;
    let correctedErrorCount = 0;
    let pendingSoftKeyTap = false;
    let pendingSoftKeyLogEntry = null;

    // Autocorrect modes enum
    const AUTOCORRECT_MODE = {
        OFF: 'OFF',       // Turn off autocorrect completely
        SYSTEM: 'SYSTEM', // Use OS/browser autocorrect
        CUSTOM: 'CUSTOM'  // Use our custom autocorrect implementation
    };

    // Number of prompts to use per test (default: 5)
    let maxPromptsPerTest = 5;

    // Configuration for dataset-specific settings
    const datasetConfig = {
        'practice': {
            file: 'prompts/practice.txt',
            autocorrect: AUTOCORRECT_MODE.SYSTEM
        },
        'natural-language': {
            file: 'prompts/nat_lang_no_punc.txt',
            autocorrect: AUTOCORRECT_MODE.SYSTEM
        },
        'natural-language-punct': {
            file: 'prompts/nat_lang_with_cap_punc.txt',
            autocorrect: AUTOCORRECT_MODE.SYSTEM
        },
        'emails': {
            file: 'prompts/emails.txt',
            autocorrect: AUTOCORRECT_MODE.OFF
        },
        'passwords': {
            file: 'prompts/passwords.txt',
            autocorrect: AUTOCORRECT_MODE.OFF
        },
        'metal-keys': {
            file: 'prompts/metal_keys.txt',
            autocorrect: AUTOCORRECT_MODE.OFF
        },
        'shortcuts': {
            file: 'prompts/shortcuts.txt',
            autocorrect: AUTOCORRECT_MODE.OFF,
            mode: 'keychord' // key-chord capture instead of textarea typing
        },
        'arrows': {
            file: 'prompts/arrows.txt',
            autocorrect: AUTOCORRECT_MODE.OFF,
            mode: 'keychord' // plain arrow-key sequences (same capture path)
        }
    };

    // Function to get the selected dataset filename
    function getSelectedDatasetFile() {
        const selectedDataset = document.querySelector('input[name="dataset"]:checked');
        if (!selectedDataset) {
            return datasetConfig['practice'].file; // Default fallback
        }

        const config = datasetConfig[selectedDataset.value];
        return config ? config.file : datasetConfig['practice'].file; // Default fallback
    }

    // Interaction mode for the current dataset: 'text' (type into textarea) or
    // 'keychord' (capture keyboard shortcuts). Datasets opt into 'keychord' via
    // datasetConfig.mode.
    function getSelectedDatasetMode() {
        const selectedDataset = document.querySelector('input[name="dataset"]:checked');
        const config = selectedDataset ? datasetConfig[selectedDataset.value] : null;
        return (config && config.mode) ? config.mode : 'text';
    }

    // Track user-selected autocorrect mode (initialize with SYSTEM as default)
    let userSelectedAutocorrectMode = AUTOCORRECT_MODE.SYSTEM;

    // Track QA Mode state (initialize with false as default - off)
    let qaMode = false;

    // Function to get the autocorrect mode for the current dataset
    function getAutocorrectMode() {
        // Always use the user-selected mode
        return userSelectedAutocorrectMode;
    }

    // Function to update the autocorrect radio buttons to match the given mode
    function updateAutocorrectRadioButtons(mode) {
        // Find the radio button that corresponds to the mode
        let radioId;
        switch (mode) {
            case AUTOCORRECT_MODE.OFF:
                radioId = 'autocorrect-off';
                break;
            case AUTOCORRECT_MODE.SYSTEM:
                radioId = 'autocorrect-system';
                break;
            case AUTOCORRECT_MODE.CUSTOM:
            default:
                radioId = 'autocorrect-custom';
                break;
        }

        // Set the corresponding radio button as checked
        document.getElementById(radioId).checked = true;
    }

    // Function to enable/disable autocorrect radio buttons
    function setAutocorrectRadioButtonsEnabled(enabled) {
        const autocorrectRadios = document.querySelectorAll('input[name="autocorrect-mode"]');
        autocorrectRadios.forEach(radio => {
            radio.disabled = !enabled;
        });
    }

    // Function to check if custom autocorrect is enabled for the current dataset
    function isCustomAutocorrectEnabled() {
        return getAutocorrectMode() === AUTOCORRECT_MODE.CUSTOM;
    }

    // Function to load prompts from the selected dataset file
    async function loadPromptsFromFile() {
        try {
            const filename = getSelectedDatasetFile();
            const response = await fetch(filename);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            // Split by lines and filter out empty lines
            originalPrompts = text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            return originalPrompts;
        } catch (error) {
            console.error('Error loading prompts from file:', error);
            // throw dialog box with error message
            alert(`Error loading prompts from file: ${error.message}`);
            return [];
        }
    }

    // Function to initialize prompts for testing (shuffle, limit, and update UI)
    function initializePromptsForTest() {
        // Create a fresh copy with index tracking
        prompts = originalPrompts.map((text, index) => ({
            text: text,
            originalIndex: index
        }));
        shuffleArray(prompts);

        // Limit to MAX_PROMPTS_PER_TEST prompts
        prompts = prompts.slice(0, maxPromptsPerTest);

        // Update UI
        totalPromptsElement.textContent = prompts.length;
        currentPromptIndex = 0;
        updateCurrentPrompt();
    }

    // Function to reload prompts when dataset changes
    async function reloadPromptsForNewDataset() {
        await loadPromptsFromFile();
        resetTest();
    }

    // Create a copy of the prompts that we'll shuffle
    let prompts = [];

    const sampleTextElement = document.getElementById('sample-text');
    const currentPromptElement = document.getElementById('current-prompt');
    const totalPromptsElement = document.getElementById('total-prompts');

    let currentPromptIndex = 0;
    let promptResults = [];

    // Normalize iOS "smart punctuation" substitutions back to ASCII so
    // accuracy / QA-mode comparisons aren't penalized when iOS rewrites the
    // user's straight quotes/dashes into typographic variants.
    function normalizeText(s) {
        return s
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // single quotes
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // double quotes
            .replace(/\u2014/g, '--')                       // em dash
            .replace(/\u2013/g, '-')                        // en dash
            .replace(/\u2026/g, '...');                     // ellipsis
    }

    // Fisher-Yates shuffle algorithm
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
        return array;
    }

    function updateCurrentPrompt() {
        // In key-chord mode the textarea/sample-text flow is inactive; the
        // keychord UI renders the target instead.
        if (currentMode === 'keychord') {
            updateKeychordProgress();
            renderKeychordTarget();
            return;
        }

        currentPromptElement.textContent = currentPromptIndex + 1;
        sampleTextElement.innerText = prompts[currentPromptIndex].text;

        // Update QA Mode display if enabled
        updateQAModeDisplay();
    }

    // Get the current prompt text
    function getCurrentPromptText() {
        return prompts[currentPromptIndex].text;
    }

    // Get the current prompt's original index
    function getCurrentPromptOriginalIndex() {
        return prompts[currentPromptIndex].originalIndex;
    }

    // Function to update QA Mode display
    function updateQAModeDisplay() {
        const sampleTextHighlighted = document.getElementById('sample-text-highlighted');

        if (qaMode) {
            // Hide normal sample text, show highlighted version
            sampleTextElement.style.display = 'none';
            sampleTextHighlighted.style.display = 'block';

            // Initialize with the current prompt
            updateQAHighlighting('');
        } else {
            // Show normal sample text, hide highlighted version
            sampleTextElement.style.display = 'block';
            sampleTextHighlighted.style.display = 'none';
        }
    }

    // Function to update QA Mode highlighting based on typed text
    function updateQAHighlighting(typedText) {
        if (!qaMode) return;

        const sampleTextHighlighted = document.getElementById('sample-text-highlighted');
        const promptText = getCurrentPromptText();
        // Normalize both sides so iOS smart-punctuation substitutions don't
        // light up as red mismatches in QA-mode highlighting.
        const normalizedTyped = normalizeText(typedText);
        const normalizedPrompt = normalizeText(promptText);

        let highlightedHtml = '';

        for (let i = 0; i < promptText.length; i++) {
            const promptChar = promptText[i];
            let className = 'char-untyped';

            if (i < normalizedTyped.length) {
                const typedChar = normalizedTyped[i];
                if (typedChar === normalizedPrompt[i]) {
                    className = 'char-correct';
                } else {
                    className = 'char-incorrect';
                }
            }

            // Handle special characters for HTML
            let displayChar = promptChar;
            if (promptChar === ' ') {
                displayChar = '&nbsp;';
            } else if (promptChar === '<') {
                displayChar = '&lt;';
            } else if (promptChar === '>') {
                displayChar = '&gt;';
            } else if (promptChar === '&') {
                displayChar = '&amp;';
            }

            highlightedHtml += `<span class="${className}">${displayChar}</span>`;
        }

        sampleTextHighlighted.innerHTML = highlightedHtml;
    }

    const inputArea = document.getElementById('input-area');
    const startButton = document.getElementById('start-button');
    const results = document.getElementById('results');
    const wpmElement = document.getElementById('wpm');
    const accuracyElement = document.getElementById('accuracy');

    let testActive = false;
    let startTime = 0; // Track when the current prompt started
    let endTime = 0; // Track when the last key was entered
    let promptTimingStarted = false; // Track if timing has started for current prompt

    // Function to start the test
    function startTest() {
        if (testActive) return;

        // Start the test
        testActive = true;
        results.style.display = 'none';
        promptResults = []; // Clear previous results
        promptTimingStarted = false; // Reset timing flag

    }

    // ======================================================================
    // Shortcut (key-chord) mode
    // ----------------------------------------------------------------------
    // The "shortcuts" dataset reuses the normal test UI (sample-text box,
    // progress indicator, results panel, Start button) but captures keyboard
    // shortcuts instead of typed text. Fullscreen + the Keyboard Lock API let
    // us intercept even browser-reserved combos (Ctrl+T / Ctrl+W / Ctrl+N).
    // Matching is platform-agnostic: Ctrl and Cmd (Meta) are interchangeable.
    // ======================================================================
    let currentMode = 'text';       // 'text' | 'keychord'
    let keychordActive = false;     // true from Start until finish/exit
    let keychordLocked = false;     // Keyboard Lock currently held
    let kcPromptStartedAt = null;   // timestamp of the first key tap this prompt
    let kcWrongAttempts = 0;        // wrong presses on the current target
    let kcResults = [];             // per-sequence results for the run
    let kcPrompts = [];             // sequences: array of arrays of combo strings
    let kcStepIndex = 0;            // index of the current combo within a sequence
    let kcKeysDown = new Set();     // codes physically down (auto-repeat filter)
    let kcTyped = [];               // combos actually pressed this prompt (incl. wrong)

    const DEFAULT_INSTRUCTIONS = document.querySelector('.instructions').textContent;
    const SHORTCUT_INSTRUCTIONS = 'Press each shortcut in order - each turns green as you complete it. Tap X or press Esc to exit full-screen. Cmd works for Ctrl on Mac.';
    const kcExitBtn = document.getElementById('kc-exit-btn');

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Map a key token ("z", "Escape", "Tab", "1") to a KeyboardEvent.code.
    function tokenToCode(tok) {
        if (tok.length === 1 && /[a-z]/i.test(tok)) return 'Key' + tok.toUpperCase();
        if (tok.length === 1 && /[0-9]/.test(tok)) return 'Digit' + tok;
        const map = {
            escape: 'Escape', esc: 'Escape', tab: 'Tab', space: 'Space',
            enter: 'Enter', up: 'ArrowUp', down: 'ArrowDown',
            left: 'ArrowLeft', right: 'ArrowRight'
        };
        return map[tok.toLowerCase()] || tok;
    }

    function displayKey(tok) {
        const arrows = {
            left: '←', right: '→', up: '↑', down: '↓',
            arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓'
        };
        const low = tok.toLowerCase();
        if (arrows[low]) return arrows[low];
        if (tok.length === 1) return tok.toUpperCase();
        return tok.charAt(0).toUpperCase() + tok.slice(1);
    }

    // Parse "Ctrl+Shift+Z" into a chord descriptor.
    function parseChord(str) {
        const raw = (str || '').trim();
        const tokens = raw.split('+').map(s => s.trim()).filter(Boolean);
        const chord = { ctrl: false, shift: false, alt: false, code: null, key: null, parts: [] };
        tokens.forEach(tok => {
            const low = tok.toLowerCase();
            if (['ctrl', 'control', 'cmd', 'command', 'meta'].includes(low)) {
                chord.ctrl = true; chord.parts.push('Ctrl');
            } else if (low === 'shift') {
                chord.shift = true; chord.parts.push('Shift');
            } else if (['alt', 'option', 'opt'].includes(low)) {
                chord.alt = true; chord.parts.push('Alt');
            } else {
                chord.key = tok; chord.code = tokenToCode(tok); chord.parts.push(displayKey(tok));
            }
        });
        return chord;
    }

    // Does a keydown event satisfy the chord? Ctrl and Cmd are interchangeable.
    function chordMatches(e, chord) {
        const primaryMod = e.ctrlKey || e.metaKey;
        if (chord.ctrl !== primaryMod) return false;
        if (chord.shift !== e.shiftKey) return false;
        if (chord.alt !== e.altKey) return false;
        if (e.code && chord.code && e.code === chord.code) return true;
        if (e.key && chord.key && e.key.toLowerCase() === chord.key.toLowerCase()) return true;
        return false;
    }

    // Turn an actual keydown into a combo label for the "typed" record — using
    // the same word tokens as the prompt file (e.g. "Ctrl+C", "Tab", "Ctrl+Left")
    // so typed_prompt is directly comparable to expected_prompt. Reflects what
    // was really pressed, mistakes and all. (On-screen display uses arrow
    // symbols separately via displayKey.)
    function eventToComboLabel(e) {
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
        if (e.shiftKey) parts.push('Shift');
        if (e.altKey) parts.push('Alt');
        const arrowWords = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down' };
        let k = arrowWords[e.key] || e.key;
        k = (k.length === 1) ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1);
        parts.push(k);
        return parts.join('+');
    }

    // Load static sequences from the shortcuts file, in order (no shuffle).
    // Each line is one sequence; combos within a line are space-separated.
    function buildShortcutSequences() {
        kcPrompts = originalPrompts
            .slice(0, maxPromptsPerTest)
            .map(function (line) { return line.split(/\s+/).filter(Boolean); });
        currentPromptIndex = 0;
        kcStepIndex = 0;
    }

    // Toggle the visible UI between text-typing and key-chord modes. Both modes
    // share the same DOM; we only swap which metrics/instructions show and what
    // the sample-text box and Start button do.
    function updateModeUI() {
        currentMode = getSelectedDatasetMode();
        const sampleHighlighted = document.getElementById('sample-text-highlighted');
        const autocorrectGroup = document.querySelector('input[name="autocorrect-mode"]').closest('.settings-group');
        const qaGroup = document.querySelector('input[name="qa-mode"]').closest('.settings-group');
        const textMetrics = document.getElementById('text-metrics');
        const shortcutMetrics = document.getElementById('shortcut-metrics');
        const instructions = document.querySelector('.instructions');

        // The exit-X only belongs on-screen during an active full-screen run.
        if (kcExitBtn) kcExitBtn.style.display = 'none';

        if (currentMode === 'keychord') {
            inputArea.style.display = 'none';
            if (sampleHighlighted) sampleHighlighted.style.display = 'none';
            sampleTextElement.style.display = 'block';
            if (autocorrectGroup) autocorrectGroup.style.display = 'none';
            if (qaGroup) qaGroup.style.display = 'none';
            if (textMetrics) textMetrics.style.display = 'none';
            if (shortcutMetrics) shortcutMetrics.style.display = 'block';
            if (instructions) instructions.textContent = SHORTCUT_INSTRUCTIONS;
            results.style.display = 'none';
            startButton.style.display = 'block';
            startButton.textContent = 'Start';
            keychordActive = false;
            kcResults = [];
            kcWrongAttempts = 0;
            buildShortcutSequences();
            updateKeychordProgress();
            renderKeychordTarget();
        } else {
            inputArea.style.display = '';
            if (autocorrectGroup) autocorrectGroup.style.display = '';
            if (qaGroup) qaGroup.style.display = '';
            if (textMetrics) textMetrics.style.display = '';
            if (shortcutMetrics) shortcutMetrics.style.display = 'none';
            if (instructions) instructions.textContent = DEFAULT_INSTRUCTIONS;
            releaseKeychordLock();
            // Clear any leftover key-chord content/flash from the sample-text box
            // and re-render the text prompt (updateCurrentPrompt ran earlier with
            // a stale mode, so the box may still show the shortcut sequence).
            sampleTextElement.classList.remove('kc-wrong');
            if (prompts.length) {
                updateCurrentPrompt();
            } else {
                updateQAModeDisplay(); // restores sample-text vs highlighted visibility
            }
        }
    }

    function updateKeychordProgress() {
        if (!kcPrompts.length) return;
        currentPromptElement.textContent = currentPromptIndex + 1;
        totalPromptsElement.textContent = kcPrompts.length;
    }

    // Render the current sequence into the shared sample-text box. Completed
    // combos are green, the current one is outlined, upcoming ones plain.
    function renderKeychordTarget() {
        if (!kcPrompts.length) return;
        const seq = kcPrompts[currentPromptIndex] || [];
        sampleTextElement.innerHTML = seq.map(function (comboStr, idx) {
            const chord = parseChord(comboStr);
            const keys = chord.parts.map(p => `<kbd class="kc-key">${escapeHtml(p)}</kbd>`).join('+');
            let cls = 'kc-combo';
            if (idx < kcStepIndex) cls += ' kc-done';
            else if (idx === kcStepIndex) cls += ' kc-current';
            return `<span class="${cls}">${keys}</span>`;
        }).join('<span class="kc-sep">&rarr;</span>');
    }

    // Flash the sample-text box red as wrong-press feedback.
    function flashWrong() {
        sampleTextElement.classList.remove('kc-wrong');
        void sampleTextElement.offsetWidth; // reflow so the flash restarts
        sampleTextElement.classList.add('kc-wrong');
        setTimeout(function () { sampleTextElement.classList.remove('kc-wrong'); }, 250);
    }

    async function startShortcutRun() {
        // In DF/UXR mode, require the identifier before starting so form
        // submissions are attributable (keychord mode bypasses the textarea
        // gate that normally enforces this).
        if (uxrModeEnabled && !document.getElementById('user-id').value.trim()) {
            alert('Please enter a User ID first.');
            return;
        }
        if (dfModeEnabled && !document.getElementById('unix-name').value.trim()) {
            alert('Please enter your unix name first.');
            return;
        }

        // Fresh run: build new random sequences + reset counters.
        buildShortcutSequences();
        kcResults = [];
        kcWrongAttempts = 0;
        kcTyped = [];
        kcKeysDown.clear();
        detailedLogEvents = [];
        detailedLogAccumulated = [];
        results.style.display = 'none';
        startButton.style.display = 'none';

        // Fullscreen + Keyboard Lock: allowed only inside a user gesture. We
        // fullscreen the whole test card so the UI is unchanged, just filling
        // the screen.
        const card = document.querySelector('.container');
        let fsOk = false;
        try {
            if (card && card.requestFullscreen) {
                await card.requestFullscreen();
                fsOk = !!document.fullscreenElement;
            }
        } catch (err) {
            fsOk = false;
        }

        if (!fsOk) {
            // No fullscreen (e.g. selection came from a synthetic event with no
            // user gesture) -> stay idle and let the user start with a click.
            startButton.style.display = 'block';
            startButton.textContent = 'Start';
            if (kcExitBtn) kcExitBtn.style.display = 'none';
            updateKeychordProgress();
            renderKeychordTarget();
            return;
        }

        if (navigator.keyboard && navigator.keyboard.lock) {
            try {
                await navigator.keyboard.lock();
                keychordLocked = true;
            } catch (err) {
                console.warn('Keyboard lock failed:', err);
            }
        }

        if (kcExitBtn) kcExitBtn.style.display = 'block';
        keychordActive = true;
        testActive = true;
        kcPromptStartedAt = null; // timer starts on the first key tap
        updateKeychordProgress();
        renderKeychordTarget();
    }

    function recordKeychordResult() {
        const seq = kcPrompts[currentPromptIndex] || [];
        const correct = seq.length;                 // one correct press per combo
        const total = correct + kcWrongAttempts;    // correct + wrong presses
        const timeMs = kcPromptStartedAt ? Date.now() - kcPromptStartedAt : 0;
        const accuracy = total > 0 ? (correct / total) * 100 : 0;
        kcResults.push({ timeMs: timeMs, accuracy: accuracy });

        // Detailed logging: accumulate a per-prompt record, then clear the
        // per-prompt event buffer for the next sequence.
        if (detailedLogEnabled) {
            detailedLogAccumulated.push(buildKeychordPayload(seq, currentPromptIndex, {
                timeMs: timeMs, accuracy: accuracy, correct: correct,
                total: total, wrongAttempts: kcWrongAttempts
            }));
            detailedLogEvents = [];
        }

        // Google Form submission: reuse the same promptFinishedEvent the text
        // mode dispatches, so the DF/UXR preset listeners submit each prompt.
        // Shortcut data is mapped onto the existing form fields (text-only
        // metrics like WPM/UER/CER/TER are N/A here and sent as 0).
        document.dispatchEvent(new CustomEvent('promptFinishedEvent', {
            detail: {
                message: {
                    promptText: seq.join(' '),   // e.g. "Ctrl+C Ctrl+V Ctrl+Z Ctrl+X"
                    typedText: kcTyped.join(' '), // combos actually pressed (incl. wrong)
                    wpm: 0, awpm: 0, uer: 0, cer: 0, ter: 0,
                    accuracy: accuracy,          // per-prompt: correct / total
                    timeSpentMs: timeMs,         // first key -> completion
                    totalChars: correct,         // # shortcuts in the sequence
                    keyPresses: total,           // correct + wrong presses
                    correctedErrors: 0,
                    uncorrectedErrors: kcWrongAttempts,
                    surfaceDifference: -1,
                    conditionId: -1,
                    conditionValue: -1,
                    qrHeight: -1
                }
            }
        }));
    }

    // Detailed-log one key event (keydown/keyup, modifier or not) during a run.
    function logKeychordEvent(type, e, extra) {
        if (!detailedLogEnabled) return;
        const now = Date.now();
        const entry = {
            type: type,
            timestamp: now,
            timestampIso: new Date(now).toISOString(),
            timeSincePromptStartMs: kcPromptStartedAt ? now - kcPromptStartedAt : null,
            key: e.key,
            code: e.code,
            keyCode: e.keyCode,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey
        };
        if (extra) Object.assign(entry, extra);
        detailedLogEvents.push(entry);
    }

    // Assemble the per-prompt detailed-log record (mirrors buildDetailedLogPayload).
    function buildKeychordPayload(seq, promptIndex, result) {
        return {
            userId: dfModeEnabled
                ? (document.getElementById('unix-name').value || 'anonymous')
                : (document.getElementById('user-id').value || 'anonymous'),
            dataset: (document.querySelector('input[name="dataset"]:checked') || {}).value || 'shortcuts',
            inputType: inputType,
            uxrMode: uxrModeEnabled,
            userAgent: navigator.userAgent,
            prompt: seq.join(' '),
            promptIndex: promptIndex,
            promptStartedAt: kcPromptStartedAt,
            promptSubmittedAt: Date.now(),
            results: result,
            events: detailedLogEvents
        };
    }

    function advanceKeychord() {
        if (currentPromptIndex < kcPrompts.length - 1) {
            currentPromptIndex += 1;
            kcStepIndex = 0;
            kcWrongAttempts = 0;
            kcTyped = [];
            kcPromptStartedAt = null; // timer starts on the first key of the new prompt
            updateKeychordProgress();
            renderKeychordTarget();
        } else {
            finishKeychord();
        }
    }

    function finishKeychord() {
        keychordActive = false;
        testActive = false;
        releaseKeychordLock();

        const n = kcResults.length;
        const avgAccuracy = n ? kcResults.reduce((s, r) => s + r.accuracy, 0) / n : 0;
        const totalMs = kcResults.reduce((s, r) => s + r.timeMs, 0);
        const avgMs = n ? totalMs / n : 0;

        document.getElementById('kc-accuracy').textContent = avgAccuracy.toFixed(0) + '%';
        document.getElementById('kc-time').textContent = (totalMs / 1000).toFixed(1);
        document.getElementById('kc-avg-time').textContent = (avgMs / 1000).toFixed(1);

        // Reuse the normal results panel (shortcut-metrics are the visible set
        // in key-chord mode).
        if (kcExitBtn) kcExitBtn.style.display = 'none';
        results.style.display = 'block';
        startButton.style.display = 'block';
        startButton.textContent = 'Start New Test';

        flushDetailedLogs(); // download the per-prompt JSON (no-op if logging off)
    }

    function releaseKeychordLock() {
        if (keychordLocked && navigator.keyboard && navigator.keyboard.unlock) {
            try { navigator.keyboard.unlock(); } catch (e) { /* ignore */ }
        }
        keychordLocked = false;
        if (document.fullscreenElement) {
            try { document.exitFullscreen(); } catch (e) { /* ignore */ }
        }
    }

    // Capture-phase document listener so we intercept shortcuts before anything
    // else on the page. Only acts while a key-chord run is live.
    document.addEventListener('keydown', function (e) {
        if (currentMode !== 'keychord' || !keychordActive) return;
        // Ignore auto-repeat from held keys so a held key doesn't flood the log
        // or rack up matches.
        if (e.repeat) return;
        // OculusBrowser fires auto-repeat keydowns for held keys WITHOUT setting
        // e.repeat, flooding the log with duplicate (esp. modifier) presses.
        // Track physically-down keys and ignore a keydown already marked down.
        if (kcKeysDown.has(e.code)) return;
        kcKeysDown.add(e.code);
        // First key tap of the prompt starts the timer (modifier or not).
        if (kcPromptStartedAt === null) kcPromptStartedAt = Date.now();

        // Log lone modifier presses, but never score/advance on them.
        if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'OS'].includes(e.key)) {
            logKeychordEvent('keydown', e, { isModifier: true });
            return;
        }

        e.preventDefault();
        if (!kcPrompts.length) return;
        const seq = kcPrompts[currentPromptIndex];
        const expected = seq[kcStepIndex];
        const chord = parseChord(expected);
        const matched = chordMatches(e, chord);
        logKeychordEvent('keydown', e, { expectedCombo: expected, stepIndex: kcStepIndex, matched: matched });
        kcTyped.push(eventToComboLabel(e)); // what was actually pressed (incl. wrong)
        if (matched) {
            kcStepIndex += 1;
            renderKeychordTarget(); // turn the just-completed combo green
            if (kcStepIndex >= seq.length) {
                recordKeychordResult();
                advanceKeychord();
            }
        } else {
            kcWrongAttempts += 1;
            flashWrong();
        }
    }, true);

    // Log key releases during a run (modifiers included) for full down/up pairs.
    document.addEventListener('keyup', function (e) {
        if (currentMode !== 'keychord' || !keychordActive) return;
        kcKeysDown.delete(e.code);
        const isModifier = ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'OS'].includes(e.key);
        logKeychordEvent('keyup', e, { isModifier: isModifier });
    }, true);

    // If the user leaves fullscreen mid-run (hold Esc), reset back to idle so
    // they can restart with the Start button.
    document.addEventListener('fullscreenchange', function () {
        if (currentMode === 'keychord' && keychordActive && !document.fullscreenElement) {
            keychordActive = false;
            if (keychordLocked && navigator.keyboard && navigator.keyboard.unlock) {
                try { navigator.keyboard.unlock(); } catch (e) { /* ignore */ }
            }
            keychordLocked = false;
            if (kcExitBtn) kcExitBtn.style.display = 'none';
            results.style.display = 'none';
            startButton.style.display = 'block';
            startButton.textContent = 'Start';
            updateKeychordProgress();
            renderKeychordTarget();
            flushDetailedLogs(); // save any completed-prompt logs
            detailedLogEvents = [];       // don't leak partial-run events into other datasets
            detailedLogAccumulated = [];
        }
    });

    // Exit (X) button: bail out of a running shortcut test back to idle.
    function exitShortcutRun() {
        keychordActive = false;
        releaseKeychordLock(); // unlock + exit fullscreen
        if (kcExitBtn) kcExitBtn.style.display = 'none';
        results.style.display = 'none';
        startButton.style.display = 'block';
        startButton.textContent = 'Start';
        updateKeychordProgress();
        renderKeychordTarget();
        flushDetailedLogs(); // save any completed-prompt logs
        detailedLogEvents = [];       // don't leak partial-run events into other datasets
        detailedLogAccumulated = [];
    }
    if (kcExitBtn) kcExitBtn.addEventListener('click', exitShortcutRun);

    // Base dictionary of common words - make it a global window property for debugging
    window.typingTestDictionary = [
        // Common English words
        'a', 'an', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against',
        'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
        'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further',
        'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
        'any', 'both', 'each', 'few', 'more', 'most', 'some', 'other', 'have',
        'has', 'had', 'do', 'does', 'did', 'but', 'if', 'or', 'because', 'until',
        'while', 'of', 'this', 'these', 'those', 'am', 'are', 'was', 'were',
        'nation', 'stability', 'rectangular', 'objects', 'sides', 'silly', 'questions',
        'learn', 'walk', 'run', 'important', 'news', 'always', 'seems', 'late',
        'quick', 'brown', 'fox', 'jumps', 'lazy', 'dog', 'steep', 'learning',
        'curve', 'riding', 'unicycle', 'discreet', 'meeting', 'raindrops', 'falling',
        'head', 'excellent', 'communicate',
    ];

    // Use the window property as our dictionary
    let dictionary = window.typingTestDictionary;
    // Performance optimization: Convert dictionary to Set for faster lookups
    let dictionarySet = new Set(dictionary);

    // Function to extract words from a string
    function extractWords(text) {
        // Split by punctuation and spaces
        return text.toLowerCase()
            .split(/[\s.,!?;:"()]+/)
            .filter(word => word.length > 0);
    }

    // Function to add all words from prompts to the dictionary
    function addPromptWordsToDictionary() {
        // Reset dictionary to base dictionary
        dictionary = [...window.typingTestDictionary];
        dictionarySet = new Set(dictionary);

        // Extract all words from all prompts
        originalPrompts.forEach(prompt => {
            const words = extractWords(prompt);
            words.forEach(word => {
                // Add word to dictionary if it's not already there
                if (!dictionarySet.has(word)) {
                    dictionary.push(word);
                    dictionarySet.add(word);
                }
            });
        });

        // Make the dictionary accessible for debugging
        window.getDictionary = function () {
            return dictionary;
        };

        // Add a function to test the autocorrect
        window.testAutocorrect = function (word) {
            const corrected = findClosestWord(word);
            return corrected;
        };
    }

    function standardLevenshtein(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const curr = [i];
            for (let j = 1; j <= b.length; j++) {
                curr[j] = Math.min(
                    curr[j - 1] + 1,
                    prev[j] + 1,
                    prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
                );
            }
            prev = curr;
        }
        return prev[b.length];
    }

    // Function to check if two characters are neighbors on the keyboard
    function areNeighboringKeys(char1, char2) {
        const c1 = char1.toLowerCase();
        const c2 = char2.toLowerCase();

        if (c1 === c2) return false; // Same character, not a substitution

        return keyboardNeighbors[c1] && keyboardNeighbors[c1].includes(c2);
    }

    // Calculate Levenshtein distance between two strings with early stopping and keyboard-aware substitution costs
    function levenshteinDistance(a, b, maxEditDist = 2) {
        if (a.length === 0) return b.length > maxEditDist ? maxEditDist + 1 : b.length;
        if (b.length === 0) return a.length > maxEditDist ? maxEditDist + 1 : a.length;

        // Early exit if length difference exceeds maxEditDist
        if (Math.abs(a.length - b.length) > maxEditDist) {
            return maxEditDist + 1;
        }

        const matrix = [];

        // Initialize matrix
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        // Fill in the rest of the matrix
        for (let i = 1; i <= b.length; i++) {
            let minInRow = Infinity;

            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    // Calculate substitution cost based on keyboard proximity
                    const char1 = a.charAt(j - 1);
                    const char2 = b.charAt(i - 1);
                    const substitutionCost = areNeighboringKeys(char1, char2) ? 0.4 : 1.0;

                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + substitutionCost, // substitution with keyboard-aware cost
                        matrix[i][j - 1] + 1,                   // insertion
                        matrix[i - 1][j] + 1                    // deletion
                    );
                }

                // Track minimum value in current row
                minInRow = Math.min(minInRow, matrix[i][j]);
            }

            // Early stopping: if all values in current row exceed maxEditDist, we can stop
            if (minInRow > maxEditDist) {
                return maxEditDist + 1;
            }
        }

        return matrix[b.length][a.length];
    }

    // Find the closest word in the dictionary
    function findClosestWord(word) {
        // If the word is already in the dictionary, return it (using Set for O(1) lookup)
        if (dictionarySet.has(word)) {
            return word;
        }

        let closestWord = null;
        let minDistance = Infinity;

        // Find words with edit distance of up to 2
        for (const dictWord of dictionary) {
            const distance = levenshteinDistance(word, dictWord);

            // Consider words with edit distance of 1 or 2
            if (distance <= 2 && distance < minDistance) {
                minDistance = distance;
                closestWord = dictWord;
            }
        }

        // Return the closest word if found, otherwise return the original word
        return closestWord || word;
    }

    // Track the previous input value to detect changes
    let previousInputValue = '';
    let lastWordCorrected = false;

    // Load prompts from file and initialize the app
    await loadPromptsFromFile();

    // Add prompt words to dictionary after loading prompts
    addPromptWordsToDictionary();

    // Initialize prompts for testing
    initializePromptsForTest();

    // Initialize prompt count input with default value
    document.getElementById('prompt-count').value = maxPromptsPerTest;

    // Add event listeners for prompt count controls
    const promptCountInput = document.getElementById('prompt-count');
    const decreasePromptsButton = document.getElementById('decrease-prompts');
    const increasePromptsButton = document.getElementById('increase-prompts');

    // Function to update the prompt count
    function updatePromptCount(newCount) {
        // Ensure the count is within valid range (1-20)
        newCount = Math.max(1, Math.min(100, newCount));

        // Update the input value
        promptCountInput.value = newCount;

        // Update the maxPromptsPerTest variable
        maxPromptsPerTest = newCount;

        // Reset the test to apply the new prompt count
        resetTest();
    }

    // Function to handle decrease button action
    function decreasePromptCount() {
        updatePromptCount(parseInt(promptCountInput.value) - 1);
    }

    // Function to handle increase button action
    function increasePromptCount() {
        updatePromptCount(parseInt(promptCountInput.value) + 1);
    }

    // Event listeners for the decrease button (both click and touch)
    decreasePromptsButton.addEventListener('click', decreasePromptCount);
    decreasePromptsButton.addEventListener('touchstart', function (e) {
        e.preventDefault(); // Prevent default touch behavior
        decreasePromptCount();
    }, { passive: true });

    // Event listeners for the increase button (both click and touch)
    increasePromptsButton.addEventListener('click', increasePromptCount);
    increasePromptsButton.addEventListener('touchstart', function (e) {
        e.preventDefault(); // Prevent default touch behavior
        increasePromptCount();
    }, { passive: true });

    // Event listener for direct input changes
    promptCountInput.addEventListener('change', function () {
        updatePromptCount(parseInt(this.value));
    });

    // Add event listeners for dataset radio buttons
    const datasetRadios = document.querySelectorAll('input[name="dataset"]');
    datasetRadios.forEach(radio => {
        radio.addEventListener('change', function () {
            if (this.checked) {
                // Only change autocorrect settings if QA Mode is not enabled
                if (!qaMode) {
                    // Get the dataset's default autocorrect mode
                    const datasetValue = this.value;
                    const config = datasetConfig[datasetValue];
                    const datasetAutocorrectMode = config ? config.autocorrect : AUTOCORRECT_MODE.SYSTEM;

                    // Update the user-selected mode to match the dataset's default
                    userSelectedAutocorrectMode = datasetAutocorrectMode;

                    // Update the radio buttons to reflect the dataset's default mode
                    updateAutocorrectRadioButtons(datasetAutocorrectMode);
                }

                // Update input area configuration when dataset changes
                configureInputArea();

                // Key-chord datasets auto-start (enter fullscreen + lock) right
                // after prompts load. Selecting the radio is a user gesture, so
                // the fullscreen request is allowed. Without a gesture (e.g.
                // dataset set via URL -> synthetic change event) startShortcutRun
                // falls back to showing the Start button.
                if (getSelectedDatasetMode() === 'keychord') {
                    reloadPromptsForNewDataset().then(startShortcutRun);
                } else {
                    reloadPromptsForNewDataset();
                }
            }
        });
    });

    let inputType = 'physical-keyboard';

    // Add event listeners for dataset radio buttons
    const inputTypeRadios = document.querySelectorAll('input[name="input-type"]');
    inputTypeRadios.forEach(radio => {
        radio.addEventListener('change', function () {
            if (this.checked) {
                inputType = this.value;
            }
        });
    });

    // Add event listeners for autocorrect mode radio buttons
    const autocorrectRadios = document.querySelectorAll('input[name="autocorrect-mode"]');
    autocorrectRadios.forEach(radio => {
        radio.addEventListener('change', function () {
            if (this.checked) {
                // Set the user-selected autocorrect mode based on the radio value
                switch (this.value) {
                    case 'off':
                        userSelectedAutocorrectMode = AUTOCORRECT_MODE.OFF;
                        break;
                    case 'system':
                        userSelectedAutocorrectMode = AUTOCORRECT_MODE.SYSTEM;
                        break;
                    case 'custom':
                    default:
                        userSelectedAutocorrectMode = AUTOCORRECT_MODE.CUSTOM;
                        break;
                }

                // Update input area configuration when autocorrect mode changes
                configureInputArea();

                // Reset the test when autocorrect mode changes
                resetTest();

                // If switching to custom mode, ensure dictionary is updated with prompt words
                if (userSelectedAutocorrectMode === AUTOCORRECT_MODE.CUSTOM) {
                    addPromptWordsToDictionary();
                }
            }
        });
    });

    function qaModeChanged(enabled) {
        if (enabled) {
            // If QA Mode is enabled, set autocorrect to off and disable autocorrect selection
            userSelectedAutocorrectMode = AUTOCORRECT_MODE.OFF;
            updateAutocorrectRadioButtons(AUTOCORRECT_MODE.OFF);
            setAutocorrectRadioButtonsEnabled(false);
            configureInputArea();
        } else {
            // If QA Mode is disabled, re-enable autocorrect selection
            setAutocorrectRadioButtonsEnabled(true);
        }

        // Update QA Mode display immediately
        updateQAModeDisplay();

        // Reset the test when QA Mode changes
        resetTest();
    }

    // Add event listeners for QA Mode radio buttons
    const qaModeRadios = document.querySelectorAll('input[name="qa-mode"]');
    qaModeRadios.forEach(radio => {
        radio.addEventListener('change', function () {
            if (this.checked) {
                qaMode = this.value === 'on';
                qaModeChanged(qaMode);
            }
        });
    });

    // Track if UXR mode is enabled
    let uxrModeEnabled = false;

    // Track if DF mode is enabled
    let dfModeEnabled = false;

    // === Detailed logging mode (URL-gated via ?detailedLog=true) ===
    // Captures three event types per prompt — keydown, keyup, textChange —
    // and auto-downloads a JSON file when the user submits each prompt.
    let detailedLogEnabled = false;
    let detailedLogEvents = [];
    let detailedLogPromptStartedAt = null;
    let detailedLogAccumulated = [];

    function detailedLogTimestamps() {
        const now = Date.now();
        return {
            timestamp: now,
            timestampIso: new Date(now).toISOString(),
            timeSincePromptStartMs: detailedLogPromptStartedAt ? now - detailedLogPromptStartedAt : null
        };
    }

    function logKeyEvent(type, e) {
        if (!detailedLogEnabled) return null;
        const entry = Object.assign({ type: type }, detailedLogTimestamps(), {
            key: e.key,
            code: e.code,
            keyCode: e.keyCode,
            isComposing: e.isComposing
        });
        detailedLogEvents.push(entry);
        return entry;
    }

    function logTextChange(prevValue, currValue) {
        if (!detailedLogEnabled) return;
        detailedLogEvents.push(Object.assign({ type: 'textChange' }, detailedLogTimestamps(), {
            previousValue: prevValue,
            currentValue: currValue,
            selectionStart: inputArea.selectionStart,
            selectionEnd: inputArea.selectionEnd
        }));
    }

    function buildDetailedLogPayload(promptResult) {
        return {
            userId: dfModeEnabled
                ? (document.getElementById('unix-name').value || 'anonymous')
                : (document.getElementById('user-id').value || 'anonymous'),
            dataset: (document.querySelector('input[name="dataset"]:checked') || {}).value || 'unknown',
            inputType: inputType,
            autocorrectMode: getAutocorrectMode(),
            uxrMode: uxrModeEnabled,
            userAgent: navigator.userAgent,
            prompt: getCurrentPromptText(),
            promptStartedAt: detailedLogPromptStartedAt,
            promptSubmittedAt: Date.now(),
            results: promptResult,
            events: detailedLogEvents
        };
    }

    function flushDetailedLogs() {
        if (!detailedLogEnabled || detailedLogAccumulated.length === 0) return;

        const userId = dfModeEnabled
            ? (document.getElementById('unix-name').value || 'anonymous')
            : (document.getElementById('user-id').value || 'anonymous');
        const dataset = detailedLogAccumulated[0].dataset || 'unknown';
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitize = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${sanitize(userId)}_${sanitize(dataset)}_${ts}.json`;

        const blob = new Blob([JSON.stringify(detailedLogAccumulated, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        detailedLogAccumulated = [];
        detailedLogEvents = [];
        detailedLogPromptStartedAt = null;
    }

    function checkSettingPresetInUrlParameter() {
        let value = getURLParameter('setting_preset')
        if (value == null) {
            return;
        }

        value = value.toLowerCase();
        if (value === 'qa') {
            document.getElementById("qa-mode-on").checked = true;
            qaMode = true;
            qaModeChanged(qaMode);
        }
        else if (value === 'uxr') {
            uxrModeEnabled = true;
            detailedLogEnabled = true;
            inputType = "physical-keyboard";
            document.getElementById("physical-keyboard").checked = true;
            updatePromptCount(100);

            // Show User ID field when UXR mode is enabled
            document.getElementById('user-id-group').style.display = 'block';

            // Disable input area until user ID is provided
            checkAndUpdateInputAreaState();

            document.addEventListener('promptFinishedEvent', function (e) {
                submitPromptResultToGoogleForm(e.detail.message);
            });
        }
        else if (value === 'uxr2') {
            // Second parallel UXR study. Identical to 'uxr' but routes results
            // to the UXR2 form (schema-identical copy, so we just override the
            // resultForm action and reuse the same submitter).
            uxrModeEnabled = true;
            detailedLogEnabled = true;
            inputType = "physical-keyboard";
            document.getElementById("physical-keyboard").checked = true;
            updatePromptCount(100);

            // Route submissions to the UXR2 form.
            document.getElementById('resultForm').action =
                'https://docs.google.com/forms/d/e/1FAIpQLSdAuVaWh53BvFkNTSHVki0QqIlw7CQn-xTptVpmRtHrk2ULEA/formResponse';

            // Show User ID field when UXR mode is enabled
            document.getElementById('user-id-group').style.display = 'block';

            // Disable input area until user ID is provided
            checkAndUpdateInputAreaState();

            document.addEventListener('promptFinishedEvent', function (e) {
                submitPromptResultToGoogleForm(e.detail.message);
            });
        }
        else if (value === 'df') {
            dfModeEnabled = true;
            inputType = "physical-keyboard";
            document.getElementById("physical-keyboard").checked = true;
            updatePromptCount(5);

            // Show unix name field when DF mode is enabled
            document.getElementById('unix-name-group').style.display = 'block';

            // Disable input area until unix name is provided
            checkAndUpdateInputAreaState();

            document.addEventListener('promptFinishedEvent', function (e) {
                submitPromptResultToDFGoogleForm(e.detail.message);
            });
        }
        else if (value === 'uxr_webview') {
            uxrModeEnabled = true;
            detailedLogEnabled = true;
            inputType = "skb";
            document.getElementById("skb").checked = true;
            updatePromptCount(100);

            // Show User ID field when UXR mode is enabled
            document.getElementById('user-id-group').style.display = 'block';

            // Disable input area until user ID is provided
            checkAndUpdateInputAreaState();

            // register listener for data passed to WebView from Unity
            window.addEventListener('vuplexmessage', event => {
                const surfaces = JSON.parse(event.value);
                console.log("received surfaces: " + surfaces.handBasedSurface + ", " + surfaces.fiducialBasedSurface + ", " + surfaces.conditionId + ", " + surfaces.conditionValue);
                if (surfaces.fiducialBasedSurface){
                    qrHeight = surfaces.fiducialBasedSurface;
                }

                if (surfaces.handBasedSurface && surfaces.fiducialBasedSurface) {
                    surfaceDifference = surfaces.handBasedSurface - surfaces.fiducialBasedSurface;
                }

                if (surfaces.conditionId){
                    conditionId = surfaces.conditionId;
                }

                if (surfaces.conditionValue){
                    conditionValue = surfaces.conditionValue;
                }
            });

            document.addEventListener('promptFinishedEvent', function (e) {
                let result = e.detail.message;
                result['conditionId'] = conditionId;
                result['conditionValue'] = conditionValue;
                result['qrHeight'] = qrHeight;
                if (surfaceDifference != -1) {
                    result['surfaceDifference'] = surfaceDifference;
                }
                submitPromptResultToGoogleForm(result);
            });
        }
    }

    // Function to check if input area should be disabled based on UXR/DF mode and user ID/unix name
    function checkAndUpdateInputAreaState() {
        if (uxrModeEnabled) {
            const userIdInput = document.getElementById('user-id');
            const userIdValue = userIdInput.value.trim();

            if (userIdValue === '') {
                inputArea.disabled = true;
                inputArea.placeholder = "Please enter a User ID first to begin typing test";
            } else {
                inputArea.disabled = false;
                inputArea.placeholder = "Start typing here...";
            }
        } else if (dfModeEnabled) {
            const unixNameInput = document.getElementById('unix-name');
            const unixNameValue = unixNameInput.value.trim();

            if (unixNameValue === '') {
                inputArea.disabled = true;
                inputArea.placeholder = "Please enter your unix name first to begin typing test";
            } else {
                inputArea.disabled = false;
                inputArea.placeholder = "Start typing here...";
            }
        }
    }

    checkSettingPresetInUrlParameter();

    // Check for URL parameter overrides (these take priority over presets)
    function applyURLParameterOverrides() {
        // Check for num_prompts URL parameter (takes priority over preset)
        const numPromptsParam = getURLParameter('num_prompts');
        if (numPromptsParam !== null) {
            const numPrompts = parseInt(numPromptsParam, 10);
            if (!isNaN(numPrompts) && numPrompts > 0) {
                updatePromptCount(numPrompts);
            }
        }

        // Check for user_id URL parameter
        const userIdParam = getURLParameter('user_id');
        if (userIdParam !== null) {
            const userIdInputElement = document.getElementById('user-id');
            userIdInputElement.value = userIdParam;
            // Show user ID field if it was set via URL
            document.getElementById('user-id-group').style.display = 'block';
            // Update input area state in case UXR mode is enabled
            checkAndUpdateInputAreaState();
        }

        // Check for dataset URL parameter
        const datasetParam = getURLParameter('dataset');
        if (datasetParam !== null) {
            // Find the radio button with the matching value
            const datasetRadio = document.querySelector(`input[name="dataset"][value="${datasetParam}"]`);
            if (datasetRadio) {
                datasetRadio.checked = true;
                // Trigger the change event to reload prompts for the new dataset
                datasetRadio.dispatchEvent(new Event('change'));
            }
        }

        // Check for autocorrect URL parameter
        const autocorrectParam = getURLParameter('autocorrect');
        if (autocorrectParam !== null) {
            const modeUpper = autocorrectParam.toUpperCase();
            if (AUTOCORRECT_MODE[modeUpper]) {
                userSelectedAutocorrectMode = AUTOCORRECT_MODE[modeUpper];
                updateAutocorrectRadioButtons(userSelectedAutocorrectMode);
                configureInputArea();
            }
        }

        // Check for input_type URL parameter (physical-keyboard, floating-keyboard, skb, phone, tablet)
        const inputTypeParam = getURLParameter('input_type');
        if (inputTypeParam !== null) {
            const inputTypeRadio = document.querySelector(`input[name="input-type"][value="${inputTypeParam}"]`);
            if (inputTypeRadio) {
                inputTypeRadio.checked = true;
                inputType = inputTypeParam;
            }
        }

        // Check for detailedLog URL parameter
        if (getURLParameter('detailedLog') === 'true') {
            detailedLogEnabled = true;
        }
    }

    // Apply URL parameter overrides after presets are applied
    applyURLParameterOverrides();

    // Ensure the correct mode UI (text vs key-chord) is shown on load.
    updateModeUI();

    // Add event listener for user ID input to handle UXR mode restrictions
    const userIdInput = document.getElementById('user-id');
    userIdInput.addEventListener('input', function() {
        checkAndUpdateInputAreaState();
    });

    // Add event listener for unix name input to handle DF mode restrictions
    const unixNameInput = document.getElementById('unix-name');
    unixNameInput.addEventListener('input', function() {
        // Strip non-alphanumeric characters
        this.value = this.value.replace(/[^a-zA-Z0-9]/g, '');
        checkAndUpdateInputAreaState();
    });

    // Optimized input event handler
    // Configure input area based on autocorrect mode
    function configureInputArea() {
        const mode = getAutocorrectMode();

        // Configure spellcheck attribute based on autocorrect mode
        if (mode === AUTOCORRECT_MODE.SYSTEM) {
            inputArea.setAttribute('spellcheck', 'true');
            inputArea.setAttribute('autocorrect', 'on');
            inputArea.setAttribute('autocomplete', 'on');
        } else {
            // For both OFF and CUSTOM modes, disable browser's built-in features
            inputArea.setAttribute('spellcheck', 'false');
            inputArea.setAttribute('autocorrect', 'off');
            inputArea.setAttribute('autocomplete', 'off');
        }
    }

    // Configure input area on page load
    configureInputArea();

    // Track input value changes for cross-browser compatibility
    let previousInputLength = 0;

    // Quest/Android soft keyboards report every tap (letter, backspace,
    // mode switch) as keydown(keyCode: 229, key: "Unidentified") — there's
    // no way to tell what was tapped at keydown time. We defer counting
    // until the input event reveals whether the textarea grew (typing) or
    // shrunk (delete). Stays at most 1 because new keydowns supersede
    // unresolved ones (a 229 tap that produced no input event was a no-op).
    // Handle all input events in a single handler for better cross-browser compatibility
    inputArea.addEventListener('input', function () {
        if (!testActive) {
            startTest();
            previousInputLength = 0;
        }

        // Start timing for current prompt on first keystroke
        if (!promptTimingStarted) {
            startTime = Date.now();
            endTime = startTime; // Reset endTime to startTime for new prompt
            promptTimingStarted = true;
            detailedLogPromptStartedAt = startTime;
        }

        // Get the current input value and length
        const currentValue = inputArea.value;
        const currentLength = currentValue.length;

        // Detailed logging: capture the textarea change before previousInputValue
        // is overwritten below.
        logTextChange(previousInputValue, currentValue);

        // Resolve a pending Quest/Android soft-key tap based on diff direction.
        // No input event would fire if the tap didn't change text, so just
        // checking the delta here guarantees we only count real edits.
        if (pendingSoftKeyTap) {
            const lengthDelta = currentLength - previousInputLength;
            let derivedKey = null;
            if (lengthDelta < 0) {
                correctedErrorCount += 1;
                derivedKey = 'Backspace';
            } else if (lengthDelta > 0) {
                keyPressCount += 1;
                // Derive the inserted text from the diff so the keydown log
                // entry can show what was actually typed instead of just
                // "Unidentified". Find the change region between previous
                // and current values.
                let cp = 0;
                const minLen = Math.min(previousInputValue.length, currentValue.length);
                while (cp < minLen && previousInputValue.charCodeAt(cp) === currentValue.charCodeAt(cp)) cp++;
                let cs = 0;
                const maxSuffix = minLen - cp;
                while (cs < maxSuffix &&
                       previousInputValue.charCodeAt(previousInputValue.length - 1 - cs) ===
                       currentValue.charCodeAt(currentValue.length - 1 - cs)) cs++;
                derivedKey = currentValue.substring(cp, currentValue.length - cs);
            }
            // Backfill the keydown log entry's derivedKey (preserves raw
            // key/code/keyCode for forensic accuracy).
            if (pendingSoftKeyLogEntry && derivedKey !== null) {
                pendingSoftKeyLogEntry.derivedKey = derivedKey;
            }
            pendingSoftKeyTap = false;
            pendingSoftKeyLogEntry = null;
        }

        // Reset the correction flag if the user is typing a new character.
        // keyPressCount and correctedErrorCount are tracked from keydown
        // events instead of textarea length changes so that autocorrect-
        // induced insertions/deletions don't inflate the metrics.
        if (currentLength > previousInputLength) {
            lastWordCorrected = false;

            // Check if a space or punctuation was added for autocorrect
            const lastChar = currentValue.slice(-1);
            if (/[\s.,.!?;:"()]/.test(lastChar) && isCustomAutocorrectEnabled() && !lastWordCorrected) {
                performAutocorrect(previousInputValue, lastChar);
            }
        }

        // Update previous values for next comparison.
        // Re-read inputArea.value because performAutocorrect may have mutated
        // it synchronously above, and we want previousInputValue to reflect
        // the actual current state (otherwise the next textChange in the
        // detailed log records a stale previousValue).
        previousInputValue = inputArea.value;
        previousInputLength = inputArea.value.length;

        // Update QA Mode highlighting if enabled
        if (qaMode) {
            updateQAHighlighting(inputArea.value);
        }
    });

    // Skip Enter keyup — its keydown isn't logged (it triggers submission),
    // and the keyup fires after the buffer resets, leaking into the next prompt.
    inputArea.addEventListener('keyup', function (e) {
        if (e.key === 'Enter') return;
        logKeyEvent('keyup', e);
    });

    // Handle key presses for Enter key
    inputArea.addEventListener('keydown', function (e) {
        // Detailed logging: log every keydown except the submit Enter.
        let keydownEntry = null;
        if (e.key !== 'Enter') {
            keydownEntry = logKeyEvent('keydown', e);
        }

        // Count user keystrokes here (not from input-event length deltas) so
        // autocorrect — which fires input events without keydowns — can't
        // inflate the metrics. Counted regardless of testActive so the very
        // first keystroke (which itself starts the test) is included.
        //   Backspace / Delete  → corrected error
        //   key.length === 1    → printable char on hardware keyboard / iOS
        //   keyCode === 229     → Quest/Android soft-keyboard tap (key is
        //                         reported as "Unidentified")
        if (e.key === 'Backspace' || e.key === 'Delete') {
            // Only count if the keystroke will actually delete something:
            // a non-empty selection, OR Backspace with chars before the caret,
            // OR Delete with chars after the caret.
            const hasSelection = inputArea.selectionStart !== inputArea.selectionEnd;
            const canBackspace = e.key === 'Backspace' && inputArea.selectionStart > 0;
            const canForwardDelete = e.key === 'Delete' && inputArea.selectionStart < inputArea.value.length;
            if (hasSelection || canBackspace || canForwardDelete) {
                correctedErrorCount += 1;
            }
        } else if (e.keyCode === 229) {
            // Quest/Android soft-keyboard tap — could be typing OR backspace
            // OR a no-op (mode switch, backspace at pos 0). Defer to the
            // input event handler to classify by diff direction. Also stash
            // the log entry so we can backfill a derivedKey field once the
            // input event reveals what the tap actually was.
            pendingSoftKeyTap = true;
            pendingSoftKeyLogEntry = keydownEntry;
        } else if (e.key !== 'Enter' && e.key.length === 1) {
            keyPressCount += 1;
        }

        if (!testActive) return;

        // Update end time for all keys except Enter (to track until last key entered)
        if (e.key !== 'Enter') {
            endTime = Date.now();
        }

        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent default Enter behavior

            if (pendingSoftKeyLogEntry) {
                pendingSoftKeyLogEntry.derivedKey = 'Enter';
                pendingSoftKeyTap = false;
                pendingSoftKeyLogEntry = null;
            }

            const typedText = inputArea.value;
            const promptText = getCurrentPromptText();

            // Check QA Mode - if enabled, require 100% match (after normalizing
            // iOS smart-punctuation substitutions so the user isn't blocked
            // when iOS rewrites their straight quotes to curly).
            if (qaMode) {
                if (normalizeText(typedText) !== normalizeText(promptText)) {
                    // Show error message for QA Mode mismatch
                    const qaErrorElement = document.getElementById('qa-error-message');
                    qaErrorElement.style.display = 'block';
                    return; // Don't proceed to next prompt
                }
            }

            // Check if typed text is less than 80% of target prompt length
            const minRequiredLength = Math.ceil(promptText.length * 0.8);
            if (typedText.length < minRequiredLength) {
                // Show error message for insufficient length
                const lengthErrorElement = document.getElementById('length-error-message');
                lengthErrorElement.style.display = 'block';
                // Hide QA error message if it was showing
                const qaErrorElement = document.getElementById('qa-error-message');
                qaErrorElement.style.display = 'none';
                return; // Don't proceed to next prompt
            }

            // Hide error messages if we get here (validation passed)
            const qaErrorElement = document.getElementById('qa-error-message');
            const lengthErrorElement = document.getElementById('length-error-message');
            qaErrorElement.style.display = 'none';
            lengthErrorElement.style.display = 'none';

            // Calculate results for the current prompt
            const promptResult = calculatePromptResult();
            promptResults.push(promptResult);

            // Detailed logging: accumulate per-prompt log, clear event buffer
            if (detailedLogEnabled) {
                const payload = buildDetailedLogPayload(promptResult);
                detailedLogAccumulated.push(payload);
                detailedLogEvents = [];
                detailedLogPromptStartedAt = null;
            }

            // Move to the next prompt or end the test
            if (currentPromptIndex < prompts.length - 1) {
                currentPromptIndex++;
                updateCurrentPrompt();
                inputArea.value = '';
                promptTimingStarted = false; // Reset timing flag for new prompt
                previousInputValue = ''; // Reset input value for new prompt
                previousInputLength = 0; // Reset input length for new prompt

                // Reset counters for new prompt
                keyPressCount = 0;
                correctedErrorCount = 0;
                pendingSoftKeyTap = false;
                pendingSoftKeyLogEntry = null;
            } else {
                // End the test if all prompts are completed
                endTest();
            }
        }
    });

    // Optimized autocorrect function
    function performAutocorrect(currentText, appendChar) {
        try {
            const text = currentText;
            if (text.length > 0 && appendChar.length == 1) {

                let words = text.trim().split(/\s+/);

                // filter out empty strings
                words = words.filter(word => word.length > 0);
                if (words.length === 0) return false;

                const originalLastWord = words[words.length - 1];

                // if last char of last word ends in punctuation, return false
                if(/[\s.,.!?;:"()]/.test(originalLastWord.slice(-1))) return false;


                // Check if the original word is capitalized (first character only)
                const isCapitalized = originalLastWord.length > 0 &&
                                    originalLastWord[0] >= 'A' && originalLastWord[0] <= 'Z';

                const lastWord = originalLastWord.toLowerCase();

                // Skip very short words (1-2 characters)
                if (lastWord.length > 2) {
                    // Find the closest word in the dictionary
                    const correctedWord = findClosestWord(lastWord);

                    // If a correction was found and it's different from the original word
                    if (correctedWord !== originalLastWord) {
                        // Capitalize the corrected word if the original word was capitalized
                        const finalCorrectedWord = isCapitalized ?
                            correctedWord.charAt(0).toUpperCase() + correctedWord.slice(1) :
                            correctedWord;

                        // Replace the last word with the corrected one
                        const lastIndex = text.lastIndexOf(originalLastWord);
                        if (lastIndex !== -1) {
                            const newText = text.substring(0, lastIndex) + finalCorrectedWord;

                            // Capture pre-correction value for the detailed log
                            const preCorrectionValue = inputArea.value;

                            // Direct update approach for better cross-browser compatibility
                            inputArea.value = newText + appendChar;

                            // Try to move cursor to the end - wrapped in try/catch for browser compatibility
                            try {
                                inputArea.selectionStart = inputArea.value.length;
                                inputArea.selectionEnd = inputArea.value.length;
                            } catch (e) {
                                // Some browsers might not support selection manipulation
                                console.log("Selection adjustment not supported");
                            }

                            // Detailed logging: programmatic .value writes don't fire
                            // input events, so manually emit a textChange so the
                            // custom-autocorrect replacement appears in the log.
                            logTextChange(preCorrectionValue, inputArea.value);

                            return true; // Correction was made
                        }
                    }
                }
            }
            return false; // No correction was made
        } catch (error) {
            console.error("Autocorrect error:", error);
            return false; // Error occurred, don't attempt correction
        }
    }

    // Reset button functionality
    startButton.addEventListener('click', function () {
        if (currentMode === 'keychord') {
            startShortcutRun();
            return;
        }
        resetTest();
    });

    function endTest() {
        testActive = false;

        flushDetailedLogs();

        // Disable the input area so users can't type anymore
        inputArea.disabled = true;

        // Change button text
        startButton.textContent = 'Start New Test';

        // Calculate and display average results
        calculateAverageResults();

        // Display results (hide in UXR/DF mode)
        if (!uxrModeEnabled && !dfModeEnabled) {
            results.style.display = 'block';
        }
    }

    function resetTest() {
        testActive = false;

        inputArea.value = '';
        inputArea.disabled = false;
        startButton.textContent = 'Reset Test';
        results.style.display = 'none';

        // Update dictionary with any new prompt words
        addPromptWordsToDictionary();

        // Initialize prompts for testing
        initializePromptsForTest();
        promptResults = [];

        // Reset tracking variables
        previousInputValue = '';
        lastWordCorrected = false;
        promptTimingStarted = false;

        // Reset counters
        keyPressCount = 0;
        correctedErrorCount = 0;
        pendingSoftKeyTap = false;
        pendingSoftKeyLogEntry = null;

        flushDetailedLogs();

        // Show/hide key-chord vs text UI for the current dataset.
        updateModeUI();

        // Key-chord mode manages its own entry/focus via the overlay button.
        if (currentMode === 'keychord') {
            return;
        }

        // Focus the input area after reset
        inputArea.focus();
    }

    // Calculate results for the current prompt
    function calculatePromptResult() {
        const typedText = inputArea.value;
        const promptText = getCurrentPromptText();
        const typedLength = typedText.length;
        const promptLength = promptText.length;

        // Use Levenshtein distance to calculate edit distance (no cap for accuracy measurement).
        // Normalize iOS smart-punctuation substitutions so they don't inflate the distance.
        const editDistance = standardLevenshtein(normalizeText(typedText), normalizeText(promptText));

        // Calculate accuracy as 1 minus normalized edit distance
        const maxDistance = Math.max(typedLength, promptLength);
        const normalizedDistance = maxDistance > 0 ? editDistance / maxDistance : 0;
        const accuracy = (1 - normalizedDistance) * 100;

        // Calculate time spent on this prompt in minutes
        const timeSpentMs = endTime - startTime;
        const minutes = timeSpentMs / 60000; // Convert ms to minutes

        // Calculate error metrics
        const correct = keyPressCount - correctedErrorCount;
        const incorrect_fixed = correctedErrorCount;
        const incorrect_not_fixed = editDistance;
        const denominator = correct + incorrect_fixed + incorrect_not_fixed;
        const ter = denominator > 0 ? (incorrect_fixed + incorrect_not_fixed) / denominator : 0;
        const uer = denominator > 0 ? incorrect_not_fixed / denominator : 0;
        const cer = denominator > 0 ? incorrect_fixed / denominator : 0;

        // Calculate WPM
        const words = (typedLength-1) / 5; // Assume average word is 5 characters
        const wpm = minutes > 0 ? words / minutes : 0;
        const awpm = wpm * (1 - uer); // Adjusted WPM based on uncorrected errors

        const promptResult = {
            promptIndex: currentPromptIndex,
            originalPromptIndex: getCurrentPromptOriginalIndex(),
            promptText: promptText,
            typedText: typedText,
            wpm: wpm,
            awpm: awpm,
            accuracy: accuracy,
            editDistance: editDistance,
            totalChars: typedLength,
            timeSpentMs: timeSpentMs,
            keyPresses: keyPressCount,
            correctedErrors: correctedErrorCount,
            uncorrectedErrors: editDistance,
            ter: ter,
            uer: uer,
            cer: cer
        };

        const promptFinishedEvent = new CustomEvent('promptFinishedEvent', {
            detail: { message: promptResult },
        });
        document.dispatchEvent(promptFinishedEvent);

        return promptResult;
    }

    // Calculate average results across all completed prompts
    function calculateAverageResults() {
        if (promptResults.length === 0) {
            return;
        }

        // Calculate averages
        let totalWpm = 0;
        let totalAccuracy = 0;
        let totalChars = 0;
        let totalUncorrectedErrors = 0;
        let totalCorrectedErrors = 0;
        let totalKeyPresses = 0;

        promptResults.forEach(result => {
            totalWpm += result.wpm;
            totalAccuracy += result.accuracy;
            totalChars += result.totalChars;
            totalUncorrectedErrors += result.uncorrectedErrors;
            totalCorrectedErrors += result.correctedErrors;
            totalKeyPresses += result.keyPresses;
        });

        const avgWpm = totalWpm / promptResults.length;
        const avgAccuracy = totalAccuracy / promptResults.length;

        // Calculate additional metrics
        const avgAwpm = avgWpm * (avgAccuracy / 100); // Adjusted WPM based on accuracy

        // Calculate error rates
        const totalTypedChars = totalKeyPresses;
        const uerValue = totalTypedChars > 0 ? (totalUncorrectedErrors / totalTypedChars) * 100 : 0;
        const cerValue = totalTypedChars > 0 ? (totalCorrectedErrors / totalTypedChars) * 100 : 0;
        const terValue = totalTypedChars > 0 ? ((totalUncorrectedErrors + totalCorrectedErrors) / totalTypedChars) * 100 : 0;

        // Format error rates to 2 decimal places
        const uer = uerValue.toFixed(2);
        const cer = cerValue.toFixed(2);
        const ter = terValue.toFixed(2);

        // Update results display
        wpmElement.textContent = avgWpm.toFixed(1);
        document.getElementById('awpm').textContent = avgAwpm.toFixed(1);
        accuracyElement.textContent = `${avgAccuracy.toFixed(1)}%`;
        document.getElementById('uer').textContent = `${uer}%`;
        document.getElementById('cer').textContent = `${cer}%`;
        document.getElementById('ter').textContent = `${ter}%`;

    }

    function submitPromptResultToGoogleForm(data) {
        const form = document.getElementById('resultForm');
        if (!form.dataset.submitHandlerAdded) {
            form.addEventListener('submit', (e) => {
                e.preventDefault(); // Prevent redirection to new page
                const formData = new FormData(form);
                fetch(form.action, {
                    method: 'POST',
                    body: formData,
                    mode: 'no-cors' // Google Forms requires no-cors mode
                })
                    .then(() => {
                        console.log('Form submitted successfully');
                    })
                    .catch((error) => {
                        console.error('Error submitting form:', error);
                    });
            });
            form.dataset.submitHandlerAdded = 'true';
        }

        // Populate the form fields
        document.getElementById('result_user_id').value = document.getElementById('user-id').value;
        document.getElementById('result_corpus').value = document.querySelector('input[name="dataset"]:checked').value;
        document.getElementById('result_input_type').value = inputType;
        document.getElementById('result_auto_correct').value = getAutocorrectMode();
        document.getElementById('result_expected_prompt').value = data.promptText;
        document.getElementById('result_typed_prompt').value = data.typedText;
        document.getElementById('result_wpm').value = data.wpm;
        document.getElementById('result_awpm').value = data.awpm;
        document.getElementById('result_accuracy').value = data.accuracy;
        document.getElementById('result_time_spent_ms').value = data.timeSpentMs;
        document.getElementById('result_uer').value = data.uer;
        document.getElementById('result_cer').value = data.cer;
        document.getElementById('result_ter').value = data.ter;
        document.getElementById('result_total_chars').value = data.totalChars;
        document.getElementById('result_total_key_presses').value = data.keyPresses;
        document.getElementById('result_total_corrected_errors').value = data.correctedErrors;
        document.getElementById('result_total_uncorrected_errors').value = data.uncorrectedErrors;
        document.getElementById('result_surface_difference_mm').value = data.surfaceDifference * 1000;
        document.getElementById('result_platform').value = getURLParameter('platform');
        document.getElementById('result_condition_id').value = data.conditionId;
        document.getElementById('result_condition_value').value = data.conditionValue;
        document.getElementById('result_qr_height').value = data.qrHeight;
        document.getElementById('result_session_id').value = getURLParameter('session_id');

        console.log("Submitting prompt result to Google Form: " + JSON.stringify(data));

        // Dispatch a synthetic submit event
        form.dispatchEvent(new Event('submit', { cancelable: true }));
    }

    function submitPromptResultToDFGoogleForm(data) {
        const form = document.getElementById('dfResultForm');
        if (!form.dataset.submitHandlerAdded) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                fetch(form.action, {
                    method: 'POST',
                    body: formData,
                    mode: 'no-cors'
                })
                    .then(() => {
                        console.log('DF Form submitted successfully');
                    })
                    .catch((error) => {
                        console.error('Error submitting DF form:', error);
                    });
            });
            form.dataset.submitHandlerAdded = 'true';
        }

        document.getElementById('df_result_user_id').value = document.getElementById('unix-name').value;
        document.getElementById('df_result_corpus').value = document.querySelector('input[name="dataset"]:checked').value;
        document.getElementById('df_result_input_type').value = inputType;
        document.getElementById('df_result_auto_correct').value = getAutocorrectMode();
        document.getElementById('df_result_expected_prompt').value = data.promptText;
        document.getElementById('df_result_typed_prompt').value = data.typedText;
        document.getElementById('df_result_wpm').value = data.wpm;
        document.getElementById('df_result_awpm').value = data.awpm;
        document.getElementById('df_result_accuracy').value = data.accuracy;
        document.getElementById('df_result_time_spent_ms').value = data.timeSpentMs;
        document.getElementById('df_result_uer').value = data.uer;
        document.getElementById('df_result_cer').value = data.cer;
        document.getElementById('df_result_ter').value = data.ter;
        document.getElementById('df_result_total_chars').value = data.totalChars;
        document.getElementById('df_result_total_key_presses').value = data.keyPresses;
        document.getElementById('df_result_total_corrected_errors').value = data.correctedErrors;
        document.getElementById('df_result_total_uncorrected_errors').value = data.uncorrectedErrors;
        document.getElementById('df_result_surface_difference_mm').value = data.surfaceDifference * 1000;
        document.getElementById('df_result_platform').value = getURLParameter('platform');
        document.getElementById('df_result_condition_id').value = data.conditionId;
        document.getElementById('df_result_condition_value').value = data.conditionValue;
        document.getElementById('df_result_qr_height').value = data.qrHeight;
        document.getElementById('df_result_session_id').value = getURLParameter('session_id');

        console.log("Submitting prompt result to DF Google Form: " + JSON.stringify(data));

        form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
});
