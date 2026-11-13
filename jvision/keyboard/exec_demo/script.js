// Keyboard neighbors are loaded from ../keyboard-layout.js


// Typing test prompts will be loaded from prompts.txt
let prompts = [];

// Initialize AutocorrectEngine
let autocorrectEngine = null;

// Fisher-Yates shuffle algorithm to randomize array
function shuffleArray(array) {
    const shuffled = [...array]; // Create a copy to avoid mutating the original
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function shufflePrompts() {
    prompts = shuffleArray(prompts);
}

async function loadPrompts() {
    // Load two prompt files
    const easyResponse = await fetch('./prompts.txt');
    const hardResponse = await fetch('./hard_prompts.txt');

    const easyText = await easyResponse.text();
    const hardText = await hardResponse.text();

    // Parse prompts from each file
    const easyPrompts = easyText.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    const hardPrompts = hardText.split('\n').map(p => p.trim()).filter(p => p.length > 0);

    // Shuffle each category using the existing shuffleArray function
    const shuffledEasy = shuffleArray(easyPrompts);
    const shuffledHard = shuffleArray(hardPrompts);

    // Create ordered sequence: 2 easy, 2 hard
    prompts = [
        ...shuffledEasy.slice(0, 2),
        ...shuffledHard.slice(0, 2)
    ];
}

async function initializeAutocorrect() {
    // Load dictionary from text file - now includes comprehensive word list with verb forms
    const baseDictionary = await loadDictionary();

    // Initialize AutocorrectEngine with loaded dictionary and keyboard layout
    autocorrectEngine = new AutocorrectEngine({
        baseWords: baseDictionary,
        keyboardNeighbors: typeof keyboardNeighbors !== 'undefined' ? keyboardNeighbors : {}
        // Using default cost parameters from AutocorrectEngine
    });

    // Load word frequency data (CRITICAL for correct word selection!)
    await autocorrectEngine.loadFrequencyData('./word_frequencies.json');
}

let currentPromptIndex = 0;
let testActive = false;
let promptResults = [];
let startTime = 0;
let endTime = 0;
let promptTimingStarted = false;

// Autocorrect tracking variables
let keyPressCount = 0;
let tooltipDebounceTimer = null;
const TOOLTIP_DEBOUNCE_MS = 50; // Debounce time for tooltip updates
let correctedErrorCount = 0;
let previousInputValue = '';
let lastWordCorrected = false;
let suppressAutocorrect = false;

// Cache the last tooltip suggestion to avoid re-computation
let lastTooltipSuggestion = null;
let lastTooltipWord = null;

// Simple autocorrect suppression: if user backspaces, suppress until they type 2+ new chars
let charsTypedSinceLastBackspace = 0;

// Helper function to reset backspace counter
function resetBackspaceCounter(reason) {
    charsTypedSinceLastBackspace = 0;
}

const sampleTextElement = document.getElementById('sample-text');
const currentPromptElement = document.getElementById('current-prompt');
const inputArea = document.getElementById('input-area');
const results = document.getElementById('results');
const wpmElement = document.getElementById('wpm');
const accuracyElement = document.getElementById('accuracy');
const restartButtonFinal = document.getElementById('restart-button-final');
const autocorrectTooltip = document.getElementById('autocorrect-tooltip');
const correctionText = document.getElementById('correction-text');

// Popup elements
const popupOverlay = document.getElementById('results-popup-overlay');
const popupWpmElement = document.getElementById('popup-wpm');
const popupAccuracyElement = document.getElementById('popup-accuracy');
const feedbackInput = document.getElementById('feedback-input');

// Initialize the first prompt
function initializeTest() {
    currentPromptIndex = 0;
    promptResults = [];
    testActive = false;
    promptTimingStarted = false;
    updateCurrentPrompt();
    inputArea.value = '';
    inputArea.disabled = false;
    results.style.display = 'none';

    // Focus and select the input field for immediate typing
    inputArea.focus();
    inputArea.select();
}

function updateCurrentPrompt() {
    currentPromptElement.textContent = currentPromptIndex + 1;
    sampleTextElement.innerText = prompts[currentPromptIndex];
    updateDifficultyIndicator();
}

function updateDifficultyIndicator() {
    const charsetIcons = document.getElementById('charset-icons');

    // Determine difficulty based on prompt index
    // Prompts 0-1: Easy (a-z)
    // Prompts 2-3: Hard (a-z, .?!)

    if (currentPromptIndex <= 1) {
        // Easy prompts
        charsetIcons.textContent = 'a-z';
    } else {
        // Hard prompts
        charsetIcons.textContent = 'a-z, .?!';
    }
}

function startTest() {
    if (testActive) return;
    testActive = true;
    promptTimingStarted = false;
}


function getCurrentIncompleteWord() {
    const currentValue = inputArea.value;
    const cursorPos = inputArea.selectionStart;

    if (!currentValue || cursorPos === undefined) return '';

    // Directly get word at cursor position without creating substring
    // This avoids O(n) substring operation for documents with lots of text
    const wordAtCursor = getWordAtPosition(currentValue, cursorPos);

    return wordAtCursor.word;
}

// Get the word at a specific cursor position with boundaries
function getWordAtPosition(text, position) {
    if (!text || position < 0 || position > text.length) {
        return { word: '', start: position, end: position, beforeCursor: '', afterCursor: '' };
    }

    // Define word boundaries (letters, apostrophes, hyphens, and special chars like @#$_ are part of words)
    // This prevents autocorrect on emails, usernames, hashtags, etc.
    const wordChar = /[a-zA-Z'\-@#$_&+=]/;

    // Find start of word (scan backwards from cursor)
    let start = position;
    while (start > 0 && wordChar.test(text[start - 1])) {
        start--;
    }

    // Find end of word (scan forwards from cursor)
    let end = position;
    while (end < text.length && wordChar.test(text[end])) {
        end++;
    }

    // Extract only the word - DON'T create full-document substrings
    // This dramatically improves performance as document length increases
    const word = text.substring(start, end);

    // Note: beforeCursor and afterCursor are expensive and rarely used
    // If needed, they should be computed lazily by the caller for the specific context

    return { word, start, end };
}

// Check if cursor is at a word boundary (space, punctuation, start/end of text)
function isAtWordBoundary(text, position) {
    if (position <= 0 || position >= text.length) return true;

    const charBefore = text[position - 1];
    const charAfter = text[position];
    const wordChar = /[a-zA-Z'\-@#$_&+=]/;

    // At boundary if either side is not a word character
    return !wordChar.test(charBefore) || !wordChar.test(charAfter);
}

// Check if we're editing within an existing word
function isEditingWithinWord(text, position) {
    const wordInfo = getWordAtPosition(text, position);
    return wordInfo.word.length > 0 && position > wordInfo.start && position < wordInfo.end;
}

// Cache for caret position calculations to reduce DOM operations
let caretPositionCache = {
    lastText: '',
    lastPosition: -1,
    lastResult: null,
    mirrorDiv: null
};

function getCaretPosition() {
    const element = inputArea;
    const position = element.selectionStart;

    // Use cached result if position and full text haven't changed
    // Check full text to detect any changes, avoiding expensive substring
    if (caretPositionCache.lastPosition === position &&
        caretPositionCache.lastText === element.value &&
        caretPositionCache.lastResult) {
        return caretPositionCache.lastResult;
    }

    // Only create substring when we actually need to recalculate
    const currentText = element.value.substring(0, position);

    // Reuse or create mirror div to reduce DOM creation overhead
    let div = caretPositionCache.mirrorDiv;
    if (!div) {
        div = document.createElement('div');
        caretPositionCache.mirrorDiv = div;

        const computed = getComputedStyle(element);

        // Copy essential styles that affect text layout
        const properties = [
            'width', 'height', 'overflowY', 'overflowX',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontSize', 'fontFamily', 'fontWeight', 'lineHeight',
            'letterSpacing', 'wordSpacing', 'textIndent', 'textAlign',
            'boxSizing', 'borderTopWidth', 'borderRightWidth',
            'borderBottomWidth', 'borderLeftWidth'
        ];

        properties.forEach(prop => {
            div.style[prop] = computed[prop];
        });

        // Position off-screen
        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.top = '-9999px';
        div.style.left = '-9999px';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordWrap = 'break-word';
    }

    // Only append to DOM when needed
    if (!div.parentNode) {
        document.body.appendChild(div);
    }

    // Update content
    div.textContent = currentText;

    // Add a span to mark where caret would be
    let span = div.querySelector('span.caret-marker');
    if (!span) {
        span = document.createElement('span');
        span.className = 'caret-marker';
        span.textContent = '|';
        div.appendChild(span);
    }

    // Get the span position
    const coordinates = {
        top: span.offsetTop,
        left: span.offsetLeft
    };

    // Convert to viewport coordinates
    const elementRect = element.getBoundingClientRect();
    const x = elementRect.left + coordinates.left - element.scrollLeft;
    const y = elementRect.top + coordinates.top - element.scrollTop;

    const result = { x, y };

    // Cache the result
    caretPositionCache.lastText = currentText;
    caretPositionCache.lastPosition = position;
    caretPositionCache.lastResult = result;

    return result;
}

function showAutocorrectTooltip(originalWord, correctedWord) {
    if (originalWord === correctedWord) {
        hideAutocorrectTooltip();
        return;
    }

    // Cache the suggestion for use in actual autocorrect
    lastTooltipWord = originalWord.toLowerCase();
    lastTooltipSuggestion = correctedWord;

    // Set only the corrected word as tooltip content immediately
    correctionText.textContent = correctedWord;

    // Schedule positioning for next frame to avoid blocking current input
    requestAnimationFrame(() => {
        const caretPos = getCaretPosition();
        autocorrectTooltip.style.position = 'fixed';
        autocorrectTooltip.style.visibility = 'hidden';
        autocorrectTooltip.style.display = 'block';

        // Get tooltip width to position it to the left of cursor
        const tooltipRect = autocorrectTooltip.getBoundingClientRect();
        autocorrectTooltip.style.left = (caretPos.x - tooltipRect.width + 10) + 'px';

        // Use line height to calculate vertical offset
        const computedStyle = window.getComputedStyle(inputArea);
        const lineHeight = parseInt(computedStyle.lineHeight) || parseInt(computedStyle.fontSize) * 1.2;
        autocorrectTooltip.style.top = (caretPos.y - lineHeight - 10) + 'px';
        autocorrectTooltip.style.zIndex = '10000';
        autocorrectTooltip.style.visibility = 'visible';

        // Show tooltip with animation
        autocorrectTooltip.classList.add('show');
    });
}

function hideAutocorrectTooltip() {
    autocorrectTooltip.classList.remove('show');
    // Clear cached suggestion when tooltip is hidden
    lastTooltipWord = null;
    lastTooltipSuggestion = null;
}

// Simple autocorrect suppression logic
function shouldSuppressAutocorrect() {
    // Suppress autocorrect until user has typed 2 or more characters after backspace
    // This prevents autocorrect from immediately re-applying when user is fixing a word
    return charsTypedSinceLastBackspace < 2;
}

// Debounced autocorrect preview to prevent blocking on every keystroke
let autocorrectPreviewTimer = null;
function scheduleAutocorrectPreview() {
    // Cancel any pending preview
    if (autocorrectPreviewTimer) {
        clearTimeout(autocorrectPreviewTimer);
    }

    // Schedule new preview with debounce to avoid showing tooltips too eagerly
    autocorrectPreviewTimer = setTimeout(() => {
        performAutocorrectPreview();
        autocorrectPreviewTimer = null;
    }, TOOLTIP_DEBOUNCE_MS); // Show tooltip after user pauses typing
}

function performAutocorrectPreview() {
    const currentValue = inputArea.value;
    const cursorPos = inputArea.selectionStart;

    // Check if we're editing within an existing word (cursor is NOT at the end of the word)
    // This avoids creating the expensive textBeforeCursor substring
    const wordInfo = getWordAtPosition(currentValue, cursorPos);
    const isWithinWord = wordInfo.word.length > 0 && cursorPos > wordInfo.start && cursorPos < wordInfo.end;

    // Don't show preview if editing within an existing word (not at the end)
    if (isWithinWord) {
        hideAutocorrectTooltip();
        return;
    }

    const incompleteWord = getCurrentIncompleteWord();

    if (incompleteWord.length > 2) {
        if (shouldSuppressAutocorrect()) {
            hideAutocorrectTooltip();
        } else {
            // Perform autocorrect check with optimized scheduling
            // Use requestIdleCallback for better performance when available
            const performSuggestionCheck = () => {
                const suggestion = autocorrectEngine.findClosestWordForPreview(incompleteWord.toLowerCase());
                if (suggestion !== incompleteWord.toLowerCase()) {
                    showAutocorrectTooltip(incompleteWord, suggestion);
                } else {
                    hideAutocorrectTooltip();
                }
            };

            // Schedule with requestIdleCallback if available for smoother performance
            if (window.requestIdleCallback) {
                requestIdleCallback(performSuggestionCheck);
            } else {
                performSuggestionCheck();
            }
        }
    } else {
        hideAutocorrectTooltip();
    }
}

// Generic function to trigger autocorrect (works for any terminating character)
function triggerAutocorrect(terminatingChar = ' ') {
    if (lastWordCorrected) return false;

    hideAutocorrectTooltip();

    // Check suppression using CURRENT counter value (before resetting)
    const shouldSuppress = shouldSuppressAutocorrect();

    // Reset counter after word termination (new word starts) - AFTER checking suppression
    resetBackspaceCounter('word termination');

    // Apply suppression logic
    if (suppressAutocorrect) {
        suppressAutocorrect = false;
        return false;
    } else if (!shouldSuppress) {
        // Get current cursor position and text
        const currentText = inputArea.value;
        const cursorPos = inputArea.selectionStart;

        // Don't autocorrect if we were editing within an existing word before the terminating char
        // We need to check the state BEFORE the terminating character was added
        const textBeforeTerminatingChar = currentText.substring(0, cursorPos - 1);
        const positionBeforeTerminatingChar = textBeforeTerminatingChar.length;

        // If we were in the middle of a word (not at the end), skip autocorrect
        if (textBeforeTerminatingChar.length > 0) {
            const wordInfo = getWordAtPosition(textBeforeTerminatingChar, positionBeforeTerminatingChar);
            const wasInMiddle = wordInfo.word.length > 0 && positionBeforeTerminatingChar > wordInfo.start && positionBeforeTerminatingChar < wordInfo.end;

            if (wasInMiddle) {
                return false; // We were in the middle of a word
            }
        }

        return performCursorAwareAutocorrect(terminatingChar);
    }

    return false;
}


// Cursor-aware autocorrect function - only considers text before cursor
function performCursorAwareAutocorrect(appendChar) {
    try {
        const currentText = inputArea.value;
        const cursorPos = inputArea.selectionStart;

        // Check if the terminating character was actually added to the text
        // For Enter key, no character is added, so don't subtract from cursor position
        let adjustedCursorPos = cursorPos;
        const actualLastChar = currentText.charAt(cursorPos - 1);

        // Only subtract 1 if the terminating character is actually in the text
        if (appendChar !== '\n' && actualLastChar === appendChar) {
            adjustedCursorPos = cursorPos - 1;
        }

        // ONLY work with text before the cursor - ignore everything after
        const textBeforeCursor = currentText.substring(0, adjustedCursorPos);
        const textAfterCursor = currentText.substring(cursorPos); // Everything after cursor

        // Get word that was just completed at the end of the "before cursor" text
        const wordInfo = getWordAtPosition(textBeforeCursor, textBeforeCursor.length);

        if (!wordInfo.word || wordInfo.word.length <= 2) {
            return false; // No word or too short to correct
        }

        // Skip autocorrect if word contains special characters (@, #, $, _, &, +, =)
        // These indicate emails, usernames, hashtags, variables, etc. that shouldn't be corrected
        if (/[@#$_&+=]/.test(wordInfo.word)) {
            return false; // Don't autocorrect words with special characters
        }

        // Extract word core - keep original capitalization for the autocorrect engine
        const wordPattern = /^([^a-zA-Z]*)([a-zA-Z']+)([^a-zA-Z]*)$/;
        const match = wordInfo.word.match(wordPattern);

        if (!match) return false; // No alphabetic content to correct

        const [, prefixPunct, wordCore, suffixPunct] = match;
        const lowerWord = wordCore.toLowerCase();

        let correctedWord;
        let isPossessive = false;
        let baseWord = wordCore;
        let possessiveSuffix = '';

        // Check for possessive forms (word's or words')
        if (lowerWord.endsWith("'s")) {
            baseWord = wordCore.slice(0, -2); // Remove 's
            possessiveSuffix = "'s";
            isPossessive = true;
        } else if (lowerWord.endsWith("s'")) {
            baseWord = wordCore.slice(0, -2); // Remove s'
            possessiveSuffix = "s'";
            isPossessive = true;
        }

        // Use cached suggestion if available and matches current word
        if (lastTooltipWord === lowerWord && lastTooltipSuggestion) {
            correctedWord = lastTooltipSuggestion;
        } else {
            // For possessives, check the base word (e.g., "markk" in "markk's")
            const wordToCheck = isPossessive ? baseWord : wordCore;

            // Pass the original word with capitalization to the autocorrect engine
            // Use useFallback: true for trigger keys to get full Damerau-Levenshtein support (transpositions)
            const correctedBase = autocorrectEngine.findClosestWord(wordToCheck, { useFallback: true });

            // If possessive, reconstruct with possessive suffix
            if (isPossessive) {
                correctedWord = correctedBase + possessiveSuffix;
            } else {
                correctedWord = correctedBase;
            }
        }

        // Check if corrected word is an "I" contraction that needs capitalization
        const lowerCorrected = correctedWord.toLowerCase();
        if (lowerCorrected === 'i' || lowerCorrected === "i've" || lowerCorrected === "i'm" ||
            lowerCorrected === "i'd" || lowerCorrected === "i'll" || lowerCorrected === "i'd've") {
            correctedWord = 'I' + correctedWord.slice(1);
        }

        // If a correction was found and it's different from the original
        if (correctedWord !== wordCore && correctedWord !== lowerWord) {
            // Reconstruct with original punctuation
            const finalCorrectedWord = prefixPunct + correctedWord + suffixPunct;

            // Rebuild text: [text before word] + [corrected word] + [terminating char] + [text after cursor]
            const beforeWord = textBeforeCursor.substring(0, wordInfo.start);
            const newText = beforeWord + finalCorrectedWord + appendChar + textAfterCursor;

            // Update text area with corrected word
            inputArea.value = newText;

            // Position cursor after the corrected word and terminating character
            const newCursorPos = beforeWord.length + finalCorrectedWord.length + 1;
            try {
                inputArea.selectionStart = newCursorPos;
                inputArea.selectionEnd = newCursorPos;
            } catch (e) {
                // Some browsers might not support selection manipulation
            }

            // Clear cache after successful correction
            lastTooltipWord = null;
            lastTooltipSuggestion = null;

            return true; // Correction was made
        }

        return false; // No correction was made
    } catch (error) {
        return false; // Error occurred, don't attempt correction
    }
}

// Legacy autocorrect function (kept for compatibility)
function performAutocorrect(currentText, appendChar) {
    // Redirect to cursor-aware version
    return performCursorAwareAutocorrect(appendChar);
}

// Standard Levenshtein distance for accuracy calculation (uniform costs of 1)
function standardLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1]; // no operation needed
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution (cost = 1)
                    matrix[i - 1][j] + 1,     // insertion (cost = 1)
                    matrix[i][j - 1] + 1      // deletion (cost = 1)
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

// Calculate results for the current prompt
function calculatePromptResult() {
    const typedText = inputArea.value.trim();
    const promptText = prompts[currentPromptIndex];
    const typedLength = typedText.length;
    const promptLength = promptText.length;

    // Use STANDARD Levenshtein distance for accuracy calculation (not weighted)
    const editDistance = standardLevenshteinDistance(typedText, promptText);

    // Calculate accuracy as 1 minus normalized edit distance
    // Normalize by prompt length only (the "correct" reference text)
    const normalizedDistance = promptLength > 0 ? editDistance / promptLength : 0;
    const accuracy = Math.max(0, (1 - normalizedDistance) * 100);

    // Calculate time spent on this prompt in minutes
    const timeSpentMs = endTime - startTime;
    const minutes = timeSpentMs / 60000; // Convert ms to minutes

    // Calculate WPM (assuming average word is 5 characters)
    // Subtract 1 because WPM measures time between keystrokes, not total characters
    const characters = Math.max(0, typedLength - 1);
    const words = characters / 5;
    const wpm = minutes > 0 ? words / minutes : 0;

    return {
        promptText: promptText,
        typedText: typedText,
        wpm: wpm,
        accuracy: accuracy,
        timeSpentMs: timeSpentMs
    };
}

// Calculate weighted average results across all completed prompts
function calculateAverageResults() {
    if (promptResults.length === 0) return;

    let totalEffectiveChars = 0; // For WPM weighting (typedLength - 1)
    let totalPromptChars = 0;    // For accuracy weighting (promptLength)
    let weightedWpmSum = 0;
    let weightedAccuracySum = 0;

    promptResults.forEach(result => {
        const typedLength = result.typedText.length;
        const promptLength = result.promptText.length;
        const effectiveChars = Math.max(0, typedLength - 1);

        // Weight WPM by effective characters (typedLength - 1)
        totalEffectiveChars += effectiveChars;
        weightedWpmSum += result.wpm * effectiveChars;

        // Weight accuracy by prompt length (not typed length)
        totalPromptChars += promptLength;
        weightedAccuracySum += result.accuracy * promptLength;
    });

    const avgWpm = totalEffectiveChars > 0 ? weightedWpmSum / totalEffectiveChars : 0;
    const avgAccuracy = totalPromptChars > 0 ? weightedAccuracySum / totalPromptChars : 0;

    // Update results display
    wpmElement.textContent = Math.round(avgWpm);
    accuracyElement.textContent = Math.round(avgAccuracy) + '%';
}


function endTest() {
    testActive = false;
    inputArea.disabled = true;
    calculateAverageResults();
    showResultsPopup();
}

function showResultsPopup() {
    // Calculate and display results in popup
    if (promptResults.length === 0) return;

    let totalEffectiveChars = 0; // For WPM weighting (typedLength - 1)
    let totalPromptChars = 0;    // For accuracy weighting (promptLength)
    let weightedWpmSum = 0;
    let weightedAccuracySum = 0;

    promptResults.forEach(result => {
        const typedLength = result.typedText.length;
        const promptLength = result.promptText.length;
        const effectiveChars = Math.max(0, typedLength - 1);

        // Weight WPM by effective characters (typedLength - 1)
        totalEffectiveChars += effectiveChars;
        weightedWpmSum += result.wpm * effectiveChars;

        // Weight accuracy by prompt length (not typed length)
        totalPromptChars += promptLength;
        weightedAccuracySum += result.accuracy * promptLength;
    });

    const avgWpm = totalEffectiveChars > 0 ? weightedWpmSum / totalEffectiveChars : 0;
    const avgAccuracy = totalPromptChars > 0 ? weightedAccuracySum / totalPromptChars : 0;

    // Update popup display
    popupWpmElement.textContent = Math.round(avgWpm);
    popupAccuracyElement.textContent = Math.round(avgAccuracy) + '%';

    // Clear feedback input
    feedbackInput.value = '';

    // Show popup with animation
    popupOverlay.classList.add('show');

    // Auto-focus the feedback text box after popup animation completes
    setTimeout(() => {
        feedbackInput.focus();
    }, 300); // Wait for popup animation to complete (matches CSS transition duration)
}

function hideResultsPopup() {
    popupOverlay.classList.remove('show');
}

function restartTest() {
    shufflePrompts(); // Shuffle prompts each time the test is restarted
    hideAutocorrectTooltip(); // Hide tooltip on restart
    resetBackspaceCounter('restart test'); // Reset suppression counter
    initializeTest();
}


// Track input value changes for autocorrect
let previousInputLength = 0;

// Handle input events
inputArea.addEventListener('input', function() {
    if (!testActive) {
        startTest();
        previousInputLength = 0;
    }

    // Get the current input value and length
    const currentValue = inputArea.value;
    const currentLength = currentValue.length;


    // If input field is empty, restart the timer and hide tooltip
    if (currentLength === 0) {
        promptTimingStarted = false;
        startTime = 0;
        endTime = 0;
        hideAutocorrectTooltip();
        resetBackspaceCounter('empty input'); // Reset suppression counter
        return;
    }

    // Start timing for current prompt on first keystroke
    if (!promptTimingStarted) {
        startTime = Date.now();
        endTime = startTime; // Reset endTime to startTime for new prompt
        promptTimingStarted = true;
    }

    // Reset the correction flag if the user is typing a new character
    if (currentLength > previousInputLength) {
        lastWordCorrected = false;

        // Count characters typed, but handle space separately
        const charsAdded = currentLength - previousInputLength;
        const cursorPos = inputArea.selectionStart;

        // Get the character that was actually just typed (at cursor position - 1)
        const actualTypedChar = currentValue.charAt(cursorPos - 1);
        // Only obvious punctuation triggers autocorrect - NOT @#$_&+= (for emails, usernames, etc.)
        // Apostrophe is NOT a trigger - it's part of words (contractions, possessives)
        const isSpaceOrPunct = /[\s.,.!?;:"()]/.test(actualTypedChar);

        // If tooltip is visible and user types another regular character, hide it AND clear the cached suggestion
        // This ensures determinism - we don't apply stale suggestions
        if (!isSpaceOrPunct) {
            const isRegularChar = /[a-zA-Z0-9']/.test(actualTypedChar);
            if (isRegularChar && autocorrectTooltip.classList.contains('show')) {
                // Hide the tooltip AND clear the cached suggestion state to maintain determinism
                hideAutocorrectTooltip();
                // The hideAutocorrectTooltip function already clears lastTooltipWord and lastTooltipSuggestion
            }
        }

        // Only count non-space characters toward backspace penalty
        if (!isSpaceOrPunct) {
            charsTypedSinceLastBackspace += charsAdded;
        }

        keyPressCount += charsAdded;

        // Real-time autocorrect preview (only for non-space chars) - using async processing
        if (!isSpaceOrPunct) {
            // Schedule autocorrect preview to run after current event loop
            scheduleAutocorrectPreview();
        }

        // Handle space/punctuation for autocorrect
        if (isSpaceOrPunct) {
            // Special case: if apostrophe was typed, check if we're forming a contraction
            // Don't trigger autocorrect if current word + 't (or other suffixes) forms a valid word
            let shouldTriggerAutocorrect = true;

            if (actualTypedChar === "'") {
                const currentWord = getCurrentIncompleteWord();
                const lowerWord = currentWord.toLowerCase();

                // Common contraction patterns: word + 't, word + 's, word + 'd, word + 'll, word + 're, word + 've
                const contractionSuffixes = ['t', 's', 'd', 'll', 're', 've', 'm'];

                // Check if any contraction suffix would form a valid dictionary word
                for (const suffix of contractionSuffixes) {
                    const potentialContraction = lowerWord + "'" + suffix;
                    if (autocorrectEngine && autocorrectEngine.dictionarySet &&
                        autocorrectEngine.dictionarySet.has(potentialContraction)) {
                        shouldTriggerAutocorrect = false;
                        break;
                    }
                }
            }

            if (shouldTriggerAutocorrect) {
                const correctionMade = triggerAutocorrect(actualTypedChar);
            }

            // Always check for auto-advance after punctuation (not just after autocorrect)
            setTimeout(() => checkAutoAdvance(), 0);
        }

        // Check for auto-advance after each character (when not editing within a word)
        if (!isSpaceOrPunct) {
            // Only check auto-advance if we're at the end of the input (not editing within)
            const cursorPos = inputArea.selectionStart;
            const currentText = inputArea.value;
            if (cursorPos === currentText.length) {
                checkAutoAdvance();
            }
        }
    }
    // If length decreased, count as corrected error (backspace)
    else if (currentLength < previousInputLength) {
        correctedErrorCount += 1;

        // Reset counter on backspace (suppresses autocorrect until 2+ new chars typed)
        resetBackspaceCounter('backspace detected');

        // Check if backspace moved cursor from whitespace/delimiter into a word
        // If so, disable autocorrect until user types a delimiter
        const currentCursorPos = inputArea.selectionStart;
        const charBeforeCursor = currentCursorPos > 0 ? currentValue[currentCursorPos - 1] : null;
        const charAfterCursor = currentCursorPos < currentValue.length ? currentValue[currentCursorPos] : null;

        // Check previous state (before backspace)
        const prevCursorPos = currentCursorPos; // Cursor is at same position after backspace
        const prevCharBeforeCursor = prevCursorPos > 0 ? previousInputValue[prevCursorPos - 1] : null;

        const isDelimiter = (char) => char === null || /[\s,;.!?'"\/\-\n]/.test(char);
        const isWordChar = (char) => char !== null && /[a-zA-Z'@#$_&+=]/.test(char);

        // If we were after a delimiter and now we're after a word character, we backspaced into a word
        const wasAfterDelimiter = isDelimiter(prevCharBeforeCursor);
        const nowAfterWordChar = isWordChar(charBeforeCursor);

        if (wasAfterDelimiter && nowAfterWordChar) {
            // Backspaced from whitespace into a word - disable autocorrect
            suppressAutocorrect = true;
        }

        // Always hide tooltip after backspace (non-blocking)
        hideAutocorrectTooltip();

        // Clear position cache since text has changed
        caretPositionCache.lastResult = null;
    }

    // Update previous values for next comparison
    previousInputValue = inputArea.value;
    previousInputLength = previousInputValue.length;

    // Invalidate caret position cache on any input change
    if (caretPositionCache.lastResult) {
        caretPositionCache.lastResult = null;
    }
});

// Handle cursor position changes (clicks, arrow keys, etc.)
inputArea.addEventListener('selectionchange', function() {
    // Hide tooltip when cursor moves to prevent confusion
    hideAutocorrectTooltip();

    // Invalidate caret position cache
    if (caretPositionCache.lastResult) {
        caretPositionCache.lastResult = null;
    }
});

// Handle clicks in the text area
inputArea.addEventListener('click', function() {
    // Hide tooltip when user clicks to position cursor
    hideAutocorrectTooltip();

    // Invalidate caret position cache
    if (caretPositionCache.lastResult) {
        caretPositionCache.lastResult = null;
    }
});

// Handle arrow key navigation (capture phase to run before other handlers)
inputArea.addEventListener('keydown', function(e) {
    // Hide tooltip when user navigates with arrow keys
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        hideAutocorrectTooltip();

        // Invalidate caret position cache
        if (caretPositionCache.lastResult) {
            caretPositionCache.lastResult = null;
        }
    }
}, true);

// Track consecutive Enter presses for advancement override
let consecutiveEnterPresses = 0;
let lastEnterPressTime = 0;

// Check if user typed the prompt completely and correctly for auto-advance
function checkAutoAdvance() {
    if (!testActive) return false;

    const typedText = inputArea.value.trim();
    const promptText = prompts[currentPromptIndex];

    // Must match exactly and be complete
    if (typedText === promptText) {
        // Auto-advance to next prompt
        advanceToNextPrompt();
        return true;
    }

    return false;
}

// Function to advance to next prompt (shared logic)
function advanceToNextPrompt() {
    // Update end time when advancing
    endTime = Date.now();

    // Calculate results for the current prompt
    const promptResult = calculatePromptResult();
    promptResults.push(promptResult);

    // Clear consecutive Enter counter when advancing
    consecutiveEnterPresses = 0;

    // Move to the next prompt or end the test
    if (currentPromptIndex < 3) {  // Stop after 4 prompts (index 0-3)
        currentPromptIndex++;
        updateCurrentPrompt();
        inputArea.value = '';
        promptTimingStarted = false; // Reset timing flag for new prompt
        hideAutocorrectTooltip(); // Hide tooltip when moving to next prompt
        resetBackspaceCounter('new prompt'); // Reset suppression counter for new prompt
    } else {
        // End the test after 6 prompts are completed
        hideAutocorrectTooltip(); // Hide tooltip when test ends
        resetBackspaceCounter('test end'); // Reset suppression counter
        endTest();
    }
}

// Handle Enter key to move to next prompt with new logic
inputArea.addEventListener('keydown', function(e) {
    if (!testActive) return;

    // Update end time for all keys except Enter (to track until last key entered)
    if (e.key !== 'Enter') {
        endTime = Date.now();
        // Reset consecutive Enter counter on any other key
        consecutiveEnterPresses = 0;
    }

    if (e.key === 'Enter') {
        e.preventDefault(); // Prevent default Enter behavior

        // Check if autocorrect would be applied (without actually applying it)
        const currentText = inputArea.value;
        const cursorPos = inputArea.selectionStart;
        const textBeforeCursor = currentText.substring(0, cursorPos);
        const wordInfo = getWordAtPosition(textBeforeCursor, textBeforeCursor.length);

        let autocorrectWouldApply = false;
        if (wordInfo.word && wordInfo.word.length > 2) {
            const wordPattern = /^([^a-zA-Z]*)([a-zA-Z']+)([^a-zA-Z]*)$/;
            const match = wordInfo.word.match(wordPattern);
            if (match) {
                const [, , wordCore] = match;
                const correctedWord = autocorrectEngine.findClosestWord(wordCore);
                autocorrectWouldApply = (correctedWord !== wordCore && correctedWord !== wordCore.toLowerCase());
            }
        }

        // Apply autocorrect, but suppress newline if correction is made
        if (autocorrectWouldApply) {
            // Apply autocorrect without adding newline (use empty string instead of '\n')
            triggerAutocorrect('');
        } else {
            // No autocorrect needed, normal flow
            triggerAutocorrect('\n');
        }

        // Check for auto-advance after autocorrect (in case autocorrect completed the prompt)
        // Use setTimeout to ensure autocorrect has fully completed
        let autoAdvanceTriggered = false;
        setTimeout(() => {
            if (checkAutoAdvance()) {
                autoAdvanceTriggered = true;
            }
        }, 0);

        // Small delay to let auto-advance check complete, then proceed with Enter logic if needed
        setTimeout(() => {
            if (autoAdvanceTriggered) {
                return; // Auto-advance already handled it
            }

            const typedText = inputArea.value.trim();
            const promptText = prompts[currentPromptIndex];

            // Require at least some text to proceed
            if (typedText.length === 0) {
                return;
            }

            // Calculate length percentage
            const lengthPercentage = (typedText.length / promptText.length) * 100;

            // Track consecutive Enter presses with timing
            const currentTime = Date.now();
            if (currentTime - lastEnterPressTime < 1000) { // Within 1 second
                consecutiveEnterPresses++;
            } else {
                consecutiveEnterPresses = 1; // Reset counter if too much time passed
            }
            lastEnterPressTime = currentTime;

            // Decision logic for advancement
            if (lengthPercentage >= 90) {
                // Length is ≥90%, advance normally
                advanceToNextPrompt();
                consecutiveEnterPresses = 0; // Reset counter after successful advance
            } else if (consecutiveEnterPresses >= 2) {
                // Length is <90% but Enter was pressed twice, force advance
                advanceToNextPrompt();
                consecutiveEnterPresses = 0; // Reset counter after forced advance
            } else {
                // Length is <90% and first Enter press, suppress (do nothing)
                // consecutiveEnterPresses is already incremented above
                // Visual feedback could be added here (optional)
            }
        }, 1); // Very small delay to let auto-advance check complete first
    }
});

// Restart button event listener (original one, but now hidden)
restartButtonFinal.addEventListener('click', async function() {
    await loadPrompts();
    await initializeAutocorrect();
    restartTest();
});

// Note: Clicking outside the modal does nothing (intentionally)
// Users must use buttons within the modal to dismiss it

// Feedback contenteditable autocorrect functionality (same logic as document editor)
let feedbackAutocorrectEnabled = true;
let feedbackCurrentAutocorrectSuggestion = null;
let feedbackWordToReplaceWithSuggestion = null;
let feedbackLastTextLength = 0;
let feedbackLastCursorPosition = 0;
let feedbackLastTextContent = '';
let feedbackIsApplyingAutocorrect = false;
let feedbackCharsTypedSinceBackspace = 0;

// Create tooltip element for feedback contenteditable
function createFeedbackTooltip() {
    const tooltip = document.createElement('div');
    tooltip.className = 'autocorrect-tooltip';
    tooltip.id = 'feedback-autocorrect-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.zIndex = '10001'; // Higher than modal

    const textSpan = document.createElement('span');
    textSpan.id = 'feedback-correction-text';
    tooltip.appendChild(textSpan);

    document.body.appendChild(tooltip);
    return tooltip;
}

// Initialize feedback tooltip (created lazily)
let feedbackTooltip = null;
let feedbackCorrectionText = null;

function getFeedbackTooltipElements() {
    if (!feedbackTooltip) {
        feedbackTooltip = createFeedbackTooltip();
        feedbackCorrectionText = document.getElementById('feedback-correction-text');
    }
    return { tooltip: feedbackTooltip, correctionText: feedbackCorrectionText };
}

// Feedback contenteditable helper functions (reuses document editor pattern)
function getFeedbackEditorText() {
    let text = feedbackInput.innerText || '';
    text = text.replace(/\n+$/, '');
    return text;
}

function getFeedbackCursorOffset() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return 0;

    const range = selection.getRangeAt(0);
    let cursorPos = 0;
    let foundCursor = false;

    function walkNodes(node) {
        if (foundCursor) return;

        if (node.nodeType === Node.TEXT_NODE) {
            if (node === range.startContainer) {
                cursorPos += range.startOffset;
                foundCursor = true;
                return;
            } else {
                cursorPos += node.textContent.length;
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.nodeName === 'BR') {
                cursorPos += 1;
            } else if (node.nodeName === 'DIV' && node !== feedbackInput) {
                if (cursorPos > 0) {
                    cursorPos += 1;
                }
            }

            for (const child of node.childNodes) {
                walkNodes(child);
                if (foundCursor) break;
            }
        }
    }

    walkNodes(feedbackInput);
    return cursorPos;
}

function getFeedbackCurrentWord() {
    if (!autocorrectEngine) return '';

    const selection = window.getSelection();
    if (selection.rangeCount === 0) return '';

    try {
        const fullEditorText = getFeedbackEditorText();
        const cursorPos = getFeedbackCursorOffset();

        const textBeforeCursor = fullEditorText.substring(0, cursorPos);
        // Include special characters @#$_&+= as part of words (for emails, usernames, etc.)
        const wordMatch = textBeforeCursor.match(/[\w'@#$_&+=]+$/);
        const currentWord = wordMatch ? wordMatch[0] : '';

        return currentWord;
    } catch (error) {
        return '';
    }
}

function getFeedbackCursorPosition() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return null;

    try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const editorRect = feedbackInput.getBoundingClientRect();

        return {
            x: rect.left - editorRect.left,
            y: rect.top - editorRect.top - 35
        };
    } catch (error) {
        return null;
    }
}

function feedbackIsDelimiterBeforeCursor() {
    try {
        const fullText = getFeedbackEditorText();
        const cursorPos = getFeedbackCursorOffset();

        if (cursorPos === 0) return true;

        const charBeforeCursor = fullText[cursorPos - 1];
        return /[\s,;.!?'"\/\-]/.test(charBeforeCursor);
    } catch (error) {
        return true;
    }
}

function showFeedbackAutocorrectTooltip(text, x, y) {
    const { tooltip, correctionText } = getFeedbackTooltipElements();

    correctionText.textContent = text;
    tooltip.classList.remove('show');

    const editorRect = feedbackInput.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    const absoluteX = editorRect.left + scrollLeft + x;
    const absoluteY = editorRect.top + scrollTop + y;

    tooltip.style.position = 'absolute';
    tooltip.style.visibility = 'visible';
    tooltip.style.top = '0px';
    tooltip.style.left = '0px';

    const tooltipWidth = tooltip.offsetWidth;

    let finalX = absoluteX - tooltipWidth + 8 + 10 - 3;
    let finalY = absoluteY;

    const viewportWidth = window.innerWidth;
    if (finalX + tooltipWidth > viewportWidth - 10) {
        finalX = viewportWidth - tooltipWidth - 10;
    }
    if (finalX < 10) {
        finalX = 10;
    }
    if (finalY < 0) {
        finalY = absoluteY + 30;
    }

    tooltip.style.left = finalX + 'px';
    tooltip.style.top = finalY + 'px';
    tooltip.classList.add('show');
}

function hideFeedbackAutocorrectTooltip() {
    const { tooltip } = getFeedbackTooltipElements();
    tooltip.classList.remove('show');
    tooltip.style.visibility = 'hidden';
}

function checkFeedbackForAutocorrect() {
    if (!autocorrectEngine) return;

    const currentWord = getFeedbackCurrentWord();

    if (!feedbackAutocorrectEnabled) {
        if (currentWord.length === 0 || feedbackIsDelimiterBeforeCursor()) {
            feedbackAutocorrectEnabled = true;
        } else {
            feedbackCurrentAutocorrectSuggestion = null;
            hideFeedbackAutocorrectTooltip();
            return;
        }
    }

    // Suppress autocorrect preview if user deleted text and hasn't typed 2+ chars yet
    if (feedbackCharsTypedSinceBackspace < 2) {
        feedbackCurrentAutocorrectSuggestion = null;
        hideFeedbackAutocorrectTooltip();
        return;
    }

    if (currentWord.length < 3) {
        feedbackCurrentAutocorrectSuggestion = null;
        hideFeedbackAutocorrectTooltip();
        return;
    }

    // Skip autocorrect if word contains special characters (@, #, $, _, &, +, =)
    // These indicate emails, usernames, hashtags, variables, etc. that shouldn't be corrected
    if (/[@#$_&+=]/.test(currentWord)) {
        feedbackCurrentAutocorrectSuggestion = null;
        hideFeedbackAutocorrectTooltip();
        return;
    }

    // Check for possessive forms (word's or words') and extract base word
    let isPossessive = false;
    let baseWord = currentWord;
    let possessiveSuffix = '';
    const lowerCurrentWord = currentWord.toLowerCase();

    if (lowerCurrentWord.endsWith("'s")) {
        baseWord = currentWord.slice(0, -2); // Remove 's
        possessiveSuffix = "'s";
        isPossessive = true;
    } else if (lowerCurrentWord.endsWith("s'")) {
        baseWord = currentWord.slice(0, -2); // Remove s'
        possessiveSuffix = "s'";
        isPossessive = true;
    }

    // For possessives, check the base word (e.g., "markk" in "markk's")
    const wordToCheck = isPossessive ? baseWord : currentWord;

    const isCapitalized = wordToCheck[0] === wordToCheck[0].toUpperCase() && wordToCheck.length > 1;
    const wordForLookup = isCapitalized ? wordToCheck.toLowerCase() : wordToCheck;

    const correctedBase = autocorrectEngine.findClosestWord(wordForLookup);

    // If possessive, reconstruct with possessive suffix
    const suggestion = isPossessive ? correctedBase + possessiveSuffix : correctedBase;

    if (suggestion && suggestion !== wordForLookup && suggestion !== currentWord.toLowerCase()) {
        let finalSuggestion = suggestion;
        if (isCapitalized && suggestion.length > 0) {
            finalSuggestion = suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
        }

        feedbackCurrentAutocorrectSuggestion = finalSuggestion;
        feedbackWordToReplaceWithSuggestion = currentWord;

        const cursorPos = getFeedbackCursorPosition();
        if (cursorPos) {
            showFeedbackAutocorrectTooltip(finalSuggestion, cursorPos.x, cursorPos.y);
        }
    } else {
        feedbackCurrentAutocorrectSuggestion = null;
        feedbackWordToReplaceWithSuggestion = null;
        hideFeedbackAutocorrectTooltip();
    }
}

let feedbackAutocorrectTimeout;
function debouncedFeedbackAutocorrectCheck() {
    clearTimeout(feedbackAutocorrectTimeout);
    feedbackAutocorrectTimeout = setTimeout(checkFeedbackForAutocorrect, TOOLTIP_DEBOUNCE_MS);
}

function replaceFeedbackCurrentWord(wordToDelete, suggestion) {
    try {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const wordRange = document.createRange();

        let startContainer = range.startContainer;
        let startOffset = range.startOffset;
        let remainingChars = wordToDelete.length;

        while (remainingChars > 0 && startContainer) {
            if (startContainer.nodeType === Node.TEXT_NODE) {
                const availableChars = startOffset;
                const charsToTake = Math.min(remainingChars, availableChars);

                startOffset -= charsToTake;
                remainingChars -= charsToTake;

                if (remainingChars > 0) {
                    const walker = document.createTreeWalker(
                        feedbackInput,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    walker.currentNode = startContainer;
                    const prevNode = walker.previousNode();
                    if (prevNode) {
                        startContainer = prevNode;
                        startOffset = prevNode.textContent.length;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
        }

        wordRange.setStart(startContainer, startOffset);
        wordRange.setEnd(range.startContainer, range.startOffset);

        const selectedText = wordRange.toString();

        if (selectedText === wordToDelete) {
            selection.removeAllRanges();
            selection.addRange(wordRange);
            document.execCommand('insertText', false, suggestion);
        } else {
            for (let i = 0; i < wordToDelete.length; i++) {
                document.execCommand('delete', false, null);
            }
            document.execCommand('insertText', false, suggestion);
        }
    } catch (error) {
        try {
            for (let i = 0; i < wordToDelete.length; i++) {
                document.execCommand('delete', false, null);
            }
            document.execCommand('insertText', false, suggestion);
        } catch (fallbackError) {
            // Ignore
        }
    }
}

// Helper to get text before cursor in feedback input
function getFeedbackTextBeforeCursor() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return '';

    const range = selection.getRangeAt(0);
    const fullEditorText = getFeedbackEditorText();

    // Calculate cursor position using same logic as getFeedbackCursorOffset
    let cursorPos = 0;
    let foundCursor = false;

    function walkNodes(node, isFirstChild) {
        if (foundCursor) return;

        if (node.nodeType === Node.TEXT_NODE) {
            if (node === range.startContainer) {
                cursorPos += range.startOffset;
                foundCursor = true;
                return;
            } else {
                cursorPos += node.textContent.length;
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.nodeName === 'BR') {
                cursorPos += 1;
            } else if (node.nodeName === 'DIV' && node !== feedbackInput) {
                if (!isFirstChild && cursorPos > 0) {
                    cursorPos += 1;
                }
            }

            const children = Array.from(node.childNodes);
            for (let i = 0; i < children.length; i++) {
                walkNodes(children[i], i === 0 && isFirstChild);
                if (foundCursor) break;
            }
        }
    }

    walkNodes(feedbackInput, true);
    return fullEditorText.substring(0, cursorPos);
}

// Helper to check if we're at the start of a sentence in feedback input
function isFeedbackAtSentenceStart(textBeforeCursor) {
    // Empty document or start of document
    if (!textBeforeCursor || textBeforeCursor.length === 0) {
        return true;
    }

    // Check for newline at end (start of new line)
    if (textBeforeCursor.endsWith('\n')) {
        return true;
    }

    // Check for period/question mark/exclamation + whitespace
    // Match patterns like ". ", ".\n", "! ", etc.
    if (/[.!?][\s\n]+$/.test(textBeforeCursor)) {
        return true;
    }

    return false;
}

// Handle feedback input events
feedbackInput.addEventListener('input', function(e) {
    const currentTextContent = getFeedbackEditorText();
    const currentTextLength = currentTextContent.length;
    const currentCursorPosition = getFeedbackCursorOffset();

    if (feedbackIsApplyingAutocorrect) {
        feedbackIsApplyingAutocorrect = false;
        feedbackLastTextContent = currentTextContent;
        feedbackLastTextLength = currentTextLength;
        feedbackLastCursorPosition = currentCursorPosition;
        feedbackAutocorrectEnabled = true;
        feedbackCharsTypedSinceBackspace = 0; // Reset on autocorrect
        debouncedFeedbackAutocorrectCheck();
        return;
    }

    const textLengthChange = currentTextLength - feedbackLastTextLength;

    if (textLengthChange < 0) {
        // Backspace detected - reset counter
        feedbackCharsTypedSinceBackspace = 0;

        const wasAfterDelimiter = feedbackLastCursorPosition === 0 ||
            (feedbackLastTextContent.length >= feedbackLastCursorPosition &&
                /[\s,;.!?'"\/\-]/.test(feedbackLastTextContent[feedbackLastCursorPosition - 1]));
        const isAfterDelimiter = feedbackIsDelimiterBeforeCursor();

        if (wasAfterDelimiter && !isAfterDelimiter) {
            feedbackAutocorrectEnabled = false;
        } else if (!wasAfterDelimiter && !isAfterDelimiter) {
            // Keep current state
        } else {
            feedbackAutocorrectEnabled = true;
        }
    } else if (textLengthChange > 0) {
        // Character added - increment counter (but only for non-delimiter chars)
        const justTypedDelimiter = feedbackIsDelimiterBeforeCursor();

        // If tooltip is visible and user types another regular character, hide it AND clear the cached suggestion
        // This ensures determinism - we don't apply stale suggestions
        if (!justTypedDelimiter) {
            const { tooltip } = getFeedbackTooltipElements();
            if (tooltip.classList.contains('show')) {
                // Hide the tooltip AND clear the cached suggestion state to maintain determinism
                hideFeedbackAutocorrectTooltip();
                feedbackCurrentAutocorrectSuggestion = null;
                feedbackWordToReplaceWithSuggestion = null;
            }
        }

        if (!justTypedDelimiter) {
            feedbackCharsTypedSinceBackspace += textLengthChange;
        }

        if (justTypedDelimiter) {
            feedbackAutocorrectEnabled = true;
        }
    }

    feedbackLastTextContent = currentTextContent;
    feedbackLastTextLength = currentTextLength;
    feedbackLastCursorPosition = currentCursorPosition;
    debouncedFeedbackAutocorrectCheck();
});

// Handle feedback clicks
feedbackInput.addEventListener('mousedown', function(e) {
    setTimeout(() => {
        feedbackAutocorrectEnabled = feedbackIsDelimiterBeforeCursor();
    }, 0);
});

// Handle feedback keydown events
feedbackInput.addEventListener('keydown', function(e) {
    if (feedbackIsApplyingAutocorrect) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }

    const isEnter = e.key === 'Enter';
    const isSpace = e.key === ' ';
    const isPunctuation = [',', '.', ';', '/', '"', '?', '!'].includes(e.key);
    const isTriggerKey = isEnter || isSpace || isPunctuation;

    if (isTriggerKey) {
        const currentWord = getFeedbackCurrentWord();

        // Check suppression before attempting autocorrect
        if (!feedbackCurrentAutocorrectSuggestion && currentWord && currentWord.length >= 3 && feedbackAutocorrectEnabled && feedbackCharsTypedSinceBackspace >= 2) {
            // Check for possessive forms (word's or words')
            let isPossessive = false;
            let baseWord = currentWord;
            let possessiveSuffix = '';
            const lowerCurrentWord = currentWord.toLowerCase();

            if (lowerCurrentWord.endsWith("'s")) {
                baseWord = currentWord.slice(0, -2); // Remove 's
                possessiveSuffix = "'s";
                isPossessive = true;
            } else if (lowerCurrentWord.endsWith("s'")) {
                baseWord = currentWord.slice(0, -2); // Remove s'
                possessiveSuffix = "s'";
                isPossessive = true;
            }

            // For possessives, check the base word (e.g., "markk" in "markk's")
            const wordToCheck = isPossessive ? baseWord : currentWord;

            const correctedBase = autocorrectEngine.findClosestWord(wordToCheck, { useFallback: true });

            // If possessive, reconstruct with possessive suffix
            const suggestion = isPossessive ? correctedBase + possessiveSuffix : correctedBase;

            if (suggestion && suggestion.toLowerCase() !== currentWord.toLowerCase()) {
                feedbackCurrentAutocorrectSuggestion = suggestion;
                feedbackWordToReplaceWithSuggestion = currentWord;
            }
        }
    }

    if (isSpace || isEnter) {
        feedbackAutocorrectEnabled = true;
    }

    // Check for capitalization FIRST (even without autocorrect)
    if (isTriggerKey && feedbackCharsTypedSinceBackspace >= 0) {
        const currentWord = getFeedbackCurrentWord();

        if (currentWord && currentWord.length > 0) {
            const textBeforeCursor = getFeedbackTextBeforeCursor();
            const textBeforeWord = textBeforeCursor.substring(0, textBeforeCursor.length - currentWord.length);

            let shouldCapitalize = false;
            let newWord = currentWord;

            // Check if at sentence start
            if (isFeedbackAtSentenceStart(textBeforeWord)) {
                // Capitalize first letter if it's lowercase
                if (currentWord[0] >= 'a' && currentWord[0] <= 'z') {
                    shouldCapitalize = true;
                    newWord = currentWord.charAt(0).toUpperCase() + currentWord.slice(1);
                }
            }

            // Check for "i" contractions and fix them
            const lowerWord = currentWord.toLowerCase();
            if (lowerWord === 'i') {
                shouldCapitalize = true;
                newWord = 'I';
            } else if (lowerWord === "i've" || lowerWord === "i'm" || lowerWord === "i'd" ||
                       lowerWord === "i'll" || lowerWord === "i'd've") {
                // Has apostrophe - just capitalize
                shouldCapitalize = true;
                newWord = 'I' + currentWord.slice(1);
            } else if (lowerWord === 'im') {
                shouldCapitalize = true;
                newWord = "I'm";
            } else if (lowerWord === 'ive') {
                shouldCapitalize = true;
                newWord = "I've";
            } else if (lowerWord === 'id') {
                shouldCapitalize = true;
                newWord = "I'd";
            }

            // Apply capitalization if needed (and there's no autocorrect suggestion)
            if (shouldCapitalize && !feedbackCurrentAutocorrectSuggestion) {
                e.preventDefault();
                e.stopPropagation();

                feedbackIsApplyingAutocorrect = true;

                setTimeout(() => {
                    try {
                        replaceFeedbackCurrentWord(currentWord, newWord);

                        hideFeedbackAutocorrectTooltip();
                        feedbackCurrentAutocorrectSuggestion = null;
                        feedbackWordToReplaceWithSuggestion = null;

                        if (e.key === 'Enter') {
                            document.execCommand('insertLineBreak', false, null);
                        } else {
                            document.execCommand('insertText', false, e.key);
                        }
                    } finally {
                        feedbackIsApplyingAutocorrect = false;
                    }
                }, 0);

                return false;
            }
        }
    }

    // Also check suppression before applying cached suggestion
    if (feedbackCurrentAutocorrectSuggestion && feedbackWordToReplaceWithSuggestion && isTriggerKey && feedbackCharsTypedSinceBackspace >= 2) {
        const wordToDelete = getFeedbackCurrentWord();
        let suggestionToApply = feedbackCurrentAutocorrectSuggestion;

        // Check if we need to capitalize (sentence start)
        const textBeforeCursor = getFeedbackTextBeforeCursor();
        // Get text before the word we're about to replace
        const textBeforeWord = textBeforeCursor.substring(0, textBeforeCursor.length - wordToDelete.length);

        if (isFeedbackAtSentenceStart(textBeforeWord)) {
            // Capitalize first letter of suggestion
            suggestionToApply = suggestionToApply.charAt(0).toUpperCase() + suggestionToApply.slice(1);
        }

        // Special case: standalone "i" should become "I"
        if (wordToDelete.toLowerCase() === 'i' && wordToDelete.length === 1) {
            suggestionToApply = 'I';
        }

        e.preventDefault();
        e.stopPropagation();

        feedbackIsApplyingAutocorrect = true;

        setTimeout(() => {
            try {
                if (wordToDelete) {
                    replaceFeedbackCurrentWord(wordToDelete, suggestionToApply);
                }

                hideFeedbackAutocorrectTooltip();
                feedbackCurrentAutocorrectSuggestion = null;
                feedbackWordToReplaceWithSuggestion = null;

                if (e.key === 'Enter') {
                    document.execCommand('insertLineBreak', false, null);
                } else {
                    document.execCommand('insertText', false, e.key);
                }
            } finally {
                feedbackIsApplyingAutocorrect = false;
            }
        }, 0);

        return false;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        hideFeedbackAutocorrectTooltip();
        feedbackCurrentAutocorrectSuggestion = null;
        feedbackWordToReplaceWithSuggestion = null;
    }

    e.stopPropagation();
});

// Configure input area to disable browser autocorrect
function configureInputArea() {
    // Disable browser's built-in features so our custom autocorrect works
    inputArea.setAttribute('spellcheck', 'false');
    inputArea.setAttribute('autocorrect', 'off');
    inputArea.setAttribute('autocomplete', 'off');

    // Handle clicks to check word boundary state
    // Autocorrect is DISABLED when clicking in the middle of a word
    // and RE-ENABLED when typing a trigger character (whitespace/punctuation)
    inputArea.addEventListener('click', function() {
        // After click, check if cursor is in a safe position for autocorrect
        setTimeout(() => {
            const text = inputArea.value;
            const cursorPos = inputArea.selectionStart;

            // ALWAYS enable if empty or at start
            if (text.length === 0 || cursorPos === 0) {
                suppressAutocorrect = false;
                resetBackspaceCounter('click at start/empty');
                return;
            }

            // Check what's BEFORE and AFTER the cursor
            const charBeforeCursor = cursorPos > 0 ? text[cursorPos - 1] : null;
            const charAfterCursor = cursorPos < text.length ? text[cursorPos] : null;

            // Delimiter pattern (whitespace, obvious punctuation, newlines)
            // NOT @#$_&+= which are part of emails/usernames
            const isDelimiter = (char) => char === null || /[\s,;.!?'"\/\-\n]/.test(char);

            const beforeIsDelimiter = isDelimiter(charBeforeCursor);
            const afterIsDelimiter = isDelimiter(charAfterCursor);

            // ENABLE autocorrect ONLY if:
            // 1. Whitespace/delimiter on BOTH sides (cursor between words)
            // 2. Whitespace/delimiter on one side and nothing on the other (start/end of doc)
            //
            // DISABLE autocorrect if:
            // - Letter/word character on at least one side (in the middle of a word)
            const inWhitespaceOrBoundary = beforeIsDelimiter && afterIsDelimiter;

            suppressAutocorrect = !inWhitespaceOrBoundary;

            // Reset counter when at safe boundary
            if (inWhitespaceOrBoundary) {
                resetBackspaceCounter('click at boundary');
            }
        }, 0);
    });
}

// Initialize the test on page load
document.addEventListener('DOMContentLoaded', async function() {
    // Load prompts from prompts.txt
    await loadPrompts();
    // Initialize dictionary with prompt words and common words from file
    await initializeAutocorrect();
    // Configure input area
    configureInputArea();
    initializeTest();

    // Hide loading overlay and focus input area
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        // Wait for fade transition to complete before focusing
        setTimeout(() => {
            const inputArea = document.getElementById('input-area');
            if (inputArea) {
                inputArea.focus();
            }
        }, 300);
    }
});
