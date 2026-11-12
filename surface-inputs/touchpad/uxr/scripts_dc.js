/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
 */

// Some of these variables are let, so the calling HTML file can override them
let BUTTON_SIZES = [0.01, 0.02, 0.10]; // Button size as a fraction of the viewport width
let SCREEN_AREA_USED = 0.9;    // Area of the screen which is used by the experience
let BUTTON_RESPAWN_MAX_RAD = 0.5;     // Max distance to the new button, in viewport width
const HOLD_DURATION_MS = 1000;
const MOVE_INTERVAL_TIMER_MS = 3000;
const MAX_SCROLL_TRIALS = 6;
const MAX_SELECTION_TRIALS = 6;

let timer;
let backgroundTimer;
let highlightTimeout;
let successfulClicks = 0;
let lastX = window.innerWidth / 2;
let lastY = window.innerHeight / 2;
let successfulHold = false;
let successChimes = [];
let errorChime;
let rng;
let elapsed = 0;
let trialNum = 1;
let gestureCount = 0;
let isGesturing = false;
let gestureStopTimeout = null;
let sessionId;
var scrollCursorX = null;
var scrollCursorY = null;

function scrollMouseMoveHandler(e) {
    scrollCursorX = Math.round(e.clientX);
    scrollCursorY = Math.round(e.clientY);
    var scrollData = _getScrollPositionData();
    EventLogger.updateTrace('scrollPosition', {
        scrollTop: scrollData.scrollTop,
        targetIndex: successfulClicks,
        highlightOffsetFromTarget: scrollData.highlightOffsetFromTarget,
        x: scrollCursorX,
        y: scrollCursorY
    });
}

function scrollTouchMoveHandler(e) {
    if (e.touches.length > 0) {
        scrollCursorX = Math.round(e.touches[0].clientX);
        scrollCursorY = Math.round(e.touches[0].clientY);
    }
}

var suppressNextSelectionChange = false;
var isTextSelectionDragging = false;
var lastSelectionMissText = null;

let _eventLoggerWarnShown = false;
function _warnIfNoEventLogger() {
    if (typeof EventLogger === 'undefined' && !_eventLoggerWarnShown) {
        console.warn('[UXR] EventLogger is not loaded — event logging is inactive. Add ?eventLog=true to enable.');
        _eventLoggerWarnShown = true;
    }
    return typeof EventLogger !== 'undefined';
}

class RandomGenerator {
    constructor(seed) {
        // If no seed is provided, use Math.random() to generate one
        this.seed = seed !== undefined ? seed : Math.floor(Math.random() * Math.pow(2, 32));
        this.a = 1664525;
        this.c = 1013904223;
        this.m = Math.pow(2, 32);
        this.x = this.seed;
    }

    nextInt() {
        this.x = (this.a * this.x + this.c) % this.m;
        return this.x;
    }

    random() {
      return this.nextInt() / this.m;
    }
  }


function loadChimes() {
    for (var i = 1; i <= 1; i++) {
        successChimes.push(new Audio('audio/chime_' + i + '.mp3'));
    }

    errorChime = new Audio('audio/error_1.mp3');
}

function playChime(success) {
    if (success) {
        let soundToPlay = successChimes[Math.floor(rng.random() * successChimes.length)];
        console.log(`Playing chime ${soundToPlay.src}`);
        soundToPlay.pause();
        soundToPlay.currentTime = 0;
        soundToPlay.play();
    } else {
        errorChime.play();
    }
}

function trackGesture(timeout = 200, gesturePrefix, dataFn) {
    if (!isGesturing) {
        isGesturing = true;
        gestureCount++;
        console.log(`[gesture] new gesture #${gestureCount}`);
        if (_warnIfNoEventLogger() && gesturePrefix) {
            EventLogger.logEvent(gesturePrefix + '_start', dataFn ? dataFn() : {});
        }
    }
    clearTimeout(gestureStopTimeout);
    gestureStopTimeout = setTimeout(() => {
        isGesturing = false;
        if (_warnIfNoEventLogger() && gesturePrefix) {
            EventLogger.logEvent(gesturePrefix + '_end', dataFn ? dataFn() : {});
        }
    }, timeout);
}

function checkClick(e, clickMethod) {
    switch (clickMethod) {
        case 'single': {
            return e.which === 1;
        }
        case 'directtouch': {
            return e.which === 1;
        }
        case 'double': {
            return e.detail === 2;
        }
        case 'secondary': {
            return e.which === 3;
        }
    }
    return false;
}

function getRandomRange(min, max) {
    return rng.random() * (max - min + 1) + min;
}

const button_handler = (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (CLICK_METHOD === 'single' || CLICK_METHOD === 'double' || CLICK_METHOD === 'secondary' || CLICK_METHOD === 'directtouch') {
        if (checkClick(e, CLICK_METHOD)) {
            moveTargetButton();
            successfulClicks += 1;
            console.log(`click ${successfulClicks}`);
            playChime(true);
            return;
        }
    }
    if (CLICK_METHOD === 'hold') {
        if (e.which != 1) {
            return; // Ignore right/middle clicks
        }

        if (event.type === 'mousedown') {
            console.log('MouseDown event');
            successfulHold = false;

            e.target.classList.remove('hold-long');
            e.target.classList.add('hold-short');

            timer = setTimeout(() => {
                console.log('Button has been held for 1 second');
                successfulHold = true;
                e.target.classList.add('hold-long');
                e.target.classList.remove('hold-short');
            }, HOLD_DURATION_MS);

        } else if (event.type === 'mouseup' || event.type === 'mouseleave') {
            console.log('MouseUp/MouseLeave event');
            clearTimeout(timer);    // If we got a mouseup before the timer expires, then the user didn't hold the button long enough
            e.target.classList.remove('hold-long');
            e.target.classList.remove('hold-short');

            if (successfulHold) {
                moveTargetButton();
                successfulClicks += 1;
                playChime(true);
                console.log(`click ${successfulClicks}`);
            }
        }
    }
}

function setBackgroundTimer() {
    // Useful for the no-contact action. If the cursor moves anywhere on the page, change the background to red for 2 seconds
    document.getElementById('container-outline').style.backgroundColor = '#ff7573'; // Change the background color to red
    clearTimeout(backgroundTimer); // Clear any existing timer

    playChime(false);   // Play the error chime

    backgroundTimer = setTimeout(() => {
        document.getElementById('container-outline').style.backgroundColor = '#fafafa'; // Reset the background
    }, 2000);
}

function moveTargetButton() {
    const button_size = BUTTON_SIZES[Math.floor(rng.random() * BUTTON_SIZES.length)];
    const buttonSize = window.innerWidth * button_size;

    // Random polar sampling
    const bound = (1 - SCREEN_AREA_USED) / 2
    const minX = bound * window.innerWidth + buttonSize / 2;
    const maxX = (1 - bound) * window.innerWidth - buttonSize / 2;

    const minY = bound * window.innerHeight + buttonSize / 2;
    const maxY = (1 - bound) * window.innerHeight - buttonSize / 2;

    const translate_dist = getRandomRange(0.01, BUTTON_RESPAWN_MAX_RAD) * window.innerWidth;

    for (var i = 0;; i++) {
        // In rare cases this loop may get stuck forever
        const random_theta = getRandomRange(0, 2 * Math.PI);
        newX = lastX + Math.cos(random_theta) * translate_dist;
        newY = lastY + Math.sin(random_theta) * translate_dist;

        if (newX >= minX && newX <= maxX && newY >= minY && newY <= maxY)
            break;

        if (i > 100) {
            // Random cartesian sampling
            newX = getRandomRange(minX, maxX);
            newY = getRandomRange(minY, maxY);
            break;
        }
    }

    targetButton = document.getElementById('target-button');
    targetButton.style.left = `${newX}px`
    targetButton.style.top = `${newY}px`
    targetButton.style.height = `${buttonSize}px`;
    targetButton.style.width = `${buttonSize}px`;

    lastX = newX;
    lastY = newY;
}

function startExperience() {
    rng = new RandomGenerator();
    loadChimes();
    successfulClicks = 0;
    moveTargetButton();

    if (CLICK_METHOD === 'timer') {
        setInterval(moveTargetButton, MOVE_INTERVAL_TIMER_MS); // Move the button at a fixed rate
        document.addEventListener('mousemove', setBackgroundTimer);
        document.addEventListener('mousedown', setBackgroundTimer);
    } else if (CLICK_METHOD === 'hold') {
        document.getElementById('target-button').addEventListener('mousedown', button_handler);
        document.getElementById('target-button').addEventListener('mouseup', button_handler);
        document.getElementById('target-button').addEventListener('mouseleave', button_handler);
    } else if (CLICK_METHOD === 'directtouch') {
        document.addEventListener('click', button_handler);
        document.addEventListener('contextmenu', button_handler);
    } else {
        document.getElementById('target-button').addEventListener('click', button_handler);
        document.getElementById('target-button').addEventListener('contextmenu', button_handler);
    }

    const percentageView = SCREEN_AREA_USED * 100
    document.getElementById('container-outline').style.width = `${percentageView}vw`
    document.getElementById('container-outline').style.height = `${percentageView}vh`

    document.getElementById('start-screen').style.display = "none";
    document.getElementById('experience-screen').style.display = "";
}

function setExperienceTitle(title, explanation) {
    document.getElementById('text-top-left').innerHTML = title;
    document.getElementById('start-title').innerHTML = title;
    document.getElementById('start-explanation').innerHTML = explanation;
    document.title = title;
}

function highlightRandomPhraseScroll() {
    let paragraphs = document.querySelectorAll('.scroll-text');
    paragraphs = Array.from(paragraphs).slice(1, -1);  // remove first and last element so the text is always possible to scroll to
    const randomParagraph = paragraphs[Math.floor(rng.random() * paragraphs.length)];
    const paragraphText = randomParagraph.textContent.replace(/\s+/g, ' ').trim();
    const phrases = paragraphText.split(' ');
    const wordCount = Math.floor(rng.random() * 2) + 3; // Select between 3 and 5 words
    const startIndex = Math.floor(rng.random() * (phrases.length - wordCount));
    const endIndex = startIndex + wordCount;

    const highlight = document.createElement('span');
    highlight.classList.add('highlight');

    highlight.textContent = phrases.slice(startIndex, endIndex).join(' ');
    const beforeText = phrases.slice(0, startIndex).join(' ');
    const afterText = phrases.slice(endIndex).join(' ');
    randomParagraph.innerHTML = `${beforeText} ${highlight.outerHTML} ${afterText}`;
    console.log('Highlighting: ' + highlight.innerHTML);

    if (isHighlightInTargetbox()) {
        removeHighlight();
        highlightRandomPhraseScroll(); // If the highlight is in targetbox, try again
    }

    showUpDownArrows();

    if (successfulClicks >= MAX_SCROLL_TRIALS) {
        // End experience
        document.getElementById('start-screen').style.display = "";
        document.getElementById('scroll-body').style.display = "none";
        removeHighlight();

        document.getElementById('scroll-body').removeEventListener('scroll', onScrollCallback);

        let startText = document.getElementById('start-text');
        let elapsedStr = (elapsed / 1000).toFixed(2)
        startText.innerText = `#${trialNum}, TTC: ${elapsedStr}s, Gestures: ${gestureCount}\n` + startText.innerText;
        submitForm(trialNum, elapsedStr, gestureCount);
        if (_warnIfNoEventLogger()) {
            EventLogger.stopTrace('scrollPosition');
            document.removeEventListener('mousemove', scrollMouseMoveHandler);
            document.removeEventListener('touchmove', scrollTouchMoveHandler);
            EventLogger.endTrial({ trialNum: trialNum, timeToComplete: elapsedStr, gestureCount: gestureCount });
            EventLogger.downloadLog();
            EventLogger.clearLog();
        }
        trialNum += 1;
    } else {
        if (_warnIfNoEventLogger()) EventLogger.setIsInTarget(false);
    }
}


function removeHighlight() {
    const highlights = document.querySelectorAll('.highlight');
    for (const highlight of highlights) {
        const parent = highlight.parentNode;
        parent.innerHTML = parent.textContent; // strip out highlight formatting
    }
}

function isHighlightInTargetbox() {
    highlights = document.querySelectorAll('.highlight');
    targetbox = document.getElementById('targetbox');

    if (highlights.length === 0) {
        return false;
    }

    const highlight = highlights[0];
    const textRect = highlight.getBoundingClientRect();
    const targetRect = targetbox.getBoundingClientRect();

    if (textRect.top >= targetRect.top && textRect.bottom <= targetRect.bottom) {
        return true;
    }

    return false;
}

function showUpDownArrows() {
    highlights = document.querySelectorAll('.highlight');
    targetbox = document.getElementById('targetbox');

    if (highlights.length === 0) {
        return;
    }

    const highlight = highlights[0];
    const textRect = highlight.getBoundingClientRect();
    const targetRect = targetbox.getBoundingClientRect();
    const targetMidpoint = (targetRect.bottom + targetRect.top) / 2;

    if (textRect.bottom > targetRect.bottom) {
        // Text is below target
        document.getElementById('targetarrowup').style.display = "none";
        document.getElementById('targetarrowdown').style.display = "";
    }
    else if (textRect.top < targetRect.top) {
        // Text is above target
        document.getElementById('targetarrowup').style.display = "";
        document.getElementById('targetarrowdown').style.display = "none";
    }
    else {
        // Text somewhere inside targetbox
        document.getElementById('targetarrowup').style.display = "none";
        document.getElementById('targetarrowdown').style.display = "none";
    }
}

function _getScrollPositionData() {
    var container = document.getElementById('scroll-container');
    var highlight = document.querySelector('.highlight');
    var targetbox = document.getElementById('targetbox');
    var data = { targetIndex: successfulClicks, scrollTop: container ? Math.round(container.scrollTop) : null };
    if (targetbox) {
        var tr = targetbox.getBoundingClientRect();
        data.targetBoxTop = Math.round(tr.top);
        data.targetBoxBottom = Math.round(tr.bottom);
        if (highlight) {
            var hr = highlight.getBoundingClientRect();
            var gapAbove = tr.top - hr.top;
            var gapBelow = hr.bottom - tr.bottom;
            if (hr.bottom <= tr.top) {
                data.highlightOffsetFromTarget = Math.round(hr.bottom - tr.top);
            } else if (hr.top >= tr.bottom) {
                data.highlightOffsetFromTarget = Math.round(hr.top - tr.bottom);
            } else if (gapAbove > 0 || gapBelow > 0) {
                data.highlightOffsetFromTarget = Math.round(Math.max(gapAbove, gapBelow));
            } else {
                data.highlightOffsetFromTarget = 0;
            }
        }
    }
    if (highlight && container) {
        var hr = hr || highlight.getBoundingClientRect();
        var containerRect = container.getBoundingClientRect();
        data.highlightPageTop = Math.round(hr.top - containerRect.top + container.scrollTop);
        data.highlightPageBottom = Math.round(hr.bottom - containerRect.top + container.scrollTop);
    }
    return data;
}

function onScrollCallback() {
    trackGesture(100, 'scroll', _getScrollPositionData);
    var scrollData = _getScrollPositionData();
    EventLogger.updateTrace('scrollPosition', {
        scrollTop: scrollData.scrollTop,
        targetIndex: successfulClicks,
        highlightOffsetFromTarget: scrollData.highlightOffsetFromTarget,
        x: scrollCursorX,
        y: scrollCursorY
    });
    clearTimeout(highlightTimeout);
    showUpDownArrows();

    var inTarget = isHighlightInTargetbox();
    if (inTarget && _warnIfNoEventLogger() && !EventLogger.getIsInTarget()) {
        EventLogger.setIsInTarget(true);
        EventLogger.logEvent('enter_target_threshold', Object.assign({ targetIndex: successfulClicks }, _getScrollPositionData()));
    } else if (!inTarget && _warnIfNoEventLogger() && EventLogger.getIsInTarget()) {
        EventLogger.setIsInTarget(false);
        EventLogger.logEvent('exit_target_threshold', Object.assign({ targetIndex: successfulClicks }, _getScrollPositionData()));
    }

    if (inTarget) {
        highlightTimeout = setTimeout(() => {
            if (isHighlightInTargetbox()) {
                successfulClicks += 1;
                console.log(`click ${successfulClicks}`);
                if (_warnIfNoEventLogger()) EventLogger.logEvent('scroll_success', Object.assign({ targetIndex: successfulClicks }, _getScrollPositionData()));
                removeHighlight();
                highlightRandomPhraseScroll();
                playChime(true);
            }
        }, 300);
    }
}

function startScrollExperience() {
    rng = new RandomGenerator();
    successfulClicks = 0;
    gestureCount = 0;
    loadChimes();

    if (_warnIfNoEventLogger()) {
        EventLogger.startSession({
            participantId: document.getElementById('button-pad-id').value,
            trialType: 'scroll',
            sessionId: sessionId
        });
        EventLogger.startTrial(1);
        EventLogger.setIsInTarget(false);
        EventLogger.startTrace('scrollPosition');
        document.addEventListener('mousemove', scrollMouseMoveHandler);
        document.addEventListener('touchmove', scrollTouchMoveHandler);
    }

    document.getElementById('start-screen').style.display = "none";
    document.getElementById('scroll-body').style.display = "";

    document.getElementById('scroll-container').addEventListener('scroll', onScrollCallback);

    document.getElementById('scroll-container').scrollTop = 0;

    highlightRandomPhraseScroll();

    startTimer();

}


function highlightRandomPhraseSelection() {
    let paragraphs = document.querySelectorAll('.selection-text');
    paragraphs = Array.from(paragraphs);
    const lineHeight = parseFloat(window.getComputedStyle(paragraphs[0]).lineHeight);

    while (true) {
        let randomParagraph = paragraphs[Math.floor(rng.random() * paragraphs.length)];
        let paragraphText = randomParagraph.textContent.replace(/\s+/g, ' ').trim();
        let charCount = Math.floor(rng.random() * 11) + 14; // Select between 10 and 20 characters
        let startIndex = Math.floor(rng.random() * (paragraphText.length - charCount));
        let endIndex = startIndex + charCount;
        let selectedText = paragraphText.slice(startIndex, endIndex);

        // Measure if the highlighted text will fit in a single line!!!
        let highlight = document.createElement('span');
        highlight.classList.add('highlight');
        highlight.textContent = selectedText;

        let beforeText = paragraphText.slice(0, startIndex);
        let afterText = paragraphText.slice(endIndex);

        // Temporarily insert the highlight into the paragraph
        randomParagraph.innerHTML = beforeText + highlight.outerHTML + afterText;
        // Measure the highlight
        const highlightElement = randomParagraph.querySelector('.highlight');
        const highlightHeight = highlightElement.getBoundingClientRect().height;
        console.log('Highlighting phrase: ' + highlight.textContent);

        randomParagraph.textContent = paragraphText; // Reset the paragraph

        if (highlightHeight > lineHeight)
        {
            // If it doesn't fit, try again
            continue
        }

        // Subtract 2 from the start/end to make sure spaces or linebreaks aren't included in the highlight. These are handled differently across browsers.
        startIndex += 2
        endIndex -= 2
        selectedText = paragraphText.slice(startIndex, endIndex);


        // Trim leading and trailing spaces
        let trimmedText = selectedText.trim();
        // If trimmed text is too short, try again
        if (trimmedText.length < 10) {
            continue;
        }

        // Find the actual position of the trimmed text in the original paragraph
        let actualStartIndex = paragraphText.indexOf(trimmedText, startIndex - (selectedText.length - trimmedText.length));
        let actualEndIndex = actualStartIndex + trimmedText.length;

        highlight = document.createElement('span');
        highlight.classList.add('highlight');
        highlight.textContent = trimmedText;

        beforeText = paragraphText.slice(0, actualStartIndex);
        afterText = paragraphText.slice(actualEndIndex);

        // Temporarily insert the highlight into the paragraph
        randomParagraph.innerHTML = beforeText + highlight.outerHTML + afterText;
        break;
    }
}


function textSelectionMouseMoveHandler(e) {
    EventLogger.updateTrace('textSelectionCursor', { x: Math.round(e.clientX), y: Math.round(e.clientY), isDragging: isTextSelectionDragging });
}

function textSelectionTouchMoveHandler(e) {
    if (e.touches.length > 0) {
        EventLogger.updateTrace('textSelectionCursor', { x: Math.round(e.touches[0].clientX), y: Math.round(e.touches[0].clientY), isDragging: isTextSelectionDragging });
    }
}

function textSelectionDragStartHandler() {
    isTextSelectionDragging = true;
    var highlight = document.querySelector('.highlight');
    EventLogger.logEvent('pointer_down', { targetIndex: successfulClicks, targetText: highlight ? highlight.textContent : '' });
}

function textSelectionDragEndHandler() {
    isTextSelectionDragging = false;
}

function selectionChangedHandler() {
    if (isTextSelectionDragging) {
        var pointerUpHighlight = document.querySelector('.highlight');
        EventLogger.logEvent('pointer_up', { targetIndex: successfulClicks, targetText: pointerUpHighlight ? pointerUpHighlight.textContent : '', selectedText: window.getSelection().toString() });
    }
    if (suppressNextSelectionChange) {
        suppressNextSelectionChange = false;
        return;
    }
    trackGesture(200);
    const selection = window.getSelection().toString();
    const highlightedClasses = document.querySelector('.highlight');     // Get the highlighted text

    if (highlightedClasses === null)
        return;

    const targetText = highlightedClasses.textContent;                               // Get the full highlighted text without slop
    const indexOfSelection = selection.indexOf(targetText);                          // Check if the user's selection is in the highlighted text
    // console.log(selection.length, targetText.length, indexOfSelection, indexOfSelection + targetText.length);

    if (selection === targetText) { // Check if the user's selection exactly matches the highlighted text
        console.log('User selected the highlighted text! Getting a new phrase.');
        suppressNextSelectionChange = true;
        lastSelectionMissText = null;
        removeHighlight();
        highlightRandomPhraseSelection();
        playChime(true);
        successfulClicks += 1;
        if (_warnIfNoEventLogger()) EventLogger.logEvent('selection_success', { targetIndex: successfulClicks, targetText: targetText, selectedText: selection });

        if (successfulClicks >= MAX_SELECTION_TRIALS) {
            // End experience
            document.getElementById('start-screen').style.display = "";
            document.getElementById('textselection-body').style.display = "none";
            removeHighlight();

            document.removeEventListener('mouseup', selectionChangedHandler);
            document.removeEventListener('touchend', selectionChangedHandler);
            document.removeEventListener('selectionchange', selectionChangeHandler);

            let startText = document.getElementById('start-text');
            let elapsedStr = (elapsed / 1000).toFixed(2)
            startText.innerText = `#${trialNum}, TTC: ${elapsedStr}s, Gestures: ${gestureCount}\n` + startText.innerText;
            submitForm(trialNum, elapsedStr, gestureCount);
            if (_warnIfNoEventLogger()) {
                EventLogger.stopTrace('textSelectionCursor');
                document.removeEventListener('mousemove', textSelectionMouseMoveHandler);
                document.removeEventListener('touchmove', textSelectionTouchMoveHandler);
                document.removeEventListener('mousedown', textSelectionDragStartHandler);
                document.removeEventListener('touchstart', textSelectionDragStartHandler);
                document.removeEventListener('mouseup', textSelectionDragEndHandler);
                document.removeEventListener('touchend', textSelectionDragEndHandler);
                EventLogger.endTrial({ trialNum: trialNum, timeToComplete: elapsedStr, gestureCount: gestureCount });
                EventLogger.downloadLog();
                EventLogger.clearLog();
            }

            trialNum += 1;
        }
    } else if (selection.length > 0) {
        if (_warnIfNoEventLogger() && selection !== lastSelectionMissText) {
            lastSelectionMissText = selection;
            EventLogger.logEvent('selection_miss', { targetIndex: successfulClicks, targetText: targetText, selectedText: selection });
        }
    }
}

let selectionChangeTimer = null;

function selectionChangeHandler() {
    // Clear any existing timer to reset the delay
    clearTimeout(selectionChangeTimer);

    // Set a new timer - only triggers after user stops changing selection for 500ms
    selectionChangeTimer = setTimeout(() => {
        selectionChangedHandler();
    }, 1000); // Wait 1000ms of no selection changes before triggering
}


function removeHighlight() {
    const highlights = document.querySelectorAll('.highlight');
    for (const highlight of highlights) {
        const parent = highlight.parentNode;
        const selection = window.getSelection();      // Save the current selection
        parent.innerHTML = parent.textContent;      // strip out highlight formatting
        selection.removeAllRanges();                // Clear the selection. This fixes a bug where the selection grows since the HTML is modified as the user drags
    }
}

function removeExcessParagraphs() {
    // This function deletes paragraphs until there's no more scrollbar. This is run once on pageload, and it makes sure we don't have a scrollbar.
    const paragraphs = document.querySelectorAll('#textselection-container p');
    const scrollable = document.getElementById('scroller');
    for (let i = paragraphs.length - 1; i >= 0; i--) {
        const hasVerticalScrollbar = scrollable.scrollHeight > scrollable.clientHeight;
        const paragraph = paragraphs[i];
        if (scrollable.scrollHeight > scrollable.clientHeight) {
            paragraph.parentNode.removeChild(paragraph);    // Remove the paragraph from the DOM
            console.log('Removed paragraph ' + i);
        }
    }
}

function startTextSelectionExperience() {
    rng = new RandomGenerator();
    successfulClicks = 0;
    gestureCount = 0;
    loadChimes();

    isTextSelectionDragging = false;

    if (_warnIfNoEventLogger()) {
        EventLogger.startSession({
            participantId: document.getElementById('button-pad-id').value,
            trialType: 'textselection',
            sessionId: sessionId
        });
        EventLogger.startTrial(1);
    }

    document.getElementById('start-screen').style.display = "none";
    document.getElementById('textselection-body').style.display = "";

    removeExcessParagraphs();
    highlightRandomPhraseSelection();

    // Listen for mouse events (desktop/laptop)
    document.addEventListener('mouseup', selectionChangedHandler);

    // Listen for touch events (mobile devices)
    document.addEventListener('touchend', selectionChangedHandler);

    // Listen for selection change events (mobile drag handles)
    document.addEventListener('selectionchange', selectionChangeHandler);

    if (_warnIfNoEventLogger()) {
        EventLogger.startTrace('textSelectionCursor');
        document.addEventListener('mousemove', textSelectionMouseMoveHandler);
        document.addEventListener('touchmove', textSelectionTouchMoveHandler);
        document.addEventListener('mousedown', textSelectionDragStartHandler);
        document.addEventListener('touchstart', textSelectionDragStartHandler);
        document.addEventListener('mouseup', textSelectionDragEndHandler);
        document.addEventListener('touchend', textSelectionDragEndHandler);
    }

    startTimer();
}

function startTimer() {
	let startTime = null;
	console.log('start timer');

	function loop(timestamp) {
		if (!startTime)
			startTime = timestamp;

		elapsed = timestamp - startTime;
		document.getElementById('text-top-left').innerText = (elapsed / 1000).toFixed(2);
		if ((EXPERIENCE_NAME == "Scroll" && successfulClicks >= MAX_SCROLL_TRIALS) || (EXPERIENCE_NAME == "Text Selection" && successfulClicks >= MAX_SELECTION_TRIALS) || (EXPERIENCE_NAME == "Zoom" && typeof MAX_ZOOM_TRIALS !== 'undefined' && successfulClicks >= MAX_ZOOM_TRIALS)) {
			console.log('stop timer');
			return;
		}
		window.requestAnimationFrame(loop);
	}
	window.requestAnimationFrame(loop);
}

function submitForm(trial, ttc, gestures) {
    const form = document.getElementById('bootstrapForm');

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
    document.getElementById('device_os').value = navigator.platform;
    document.getElementById('device_browser').value = navigator.userAgent;
    document.getElementById('participant_id').value = document.getElementById('button-pad-id').value;
    document.getElementById('trial_num').value = trial;
    document.getElementById('time_to_complete').value = ttc;
    if (gestures !== undefined) {
        const gestureInput = document.getElementById('gesture_count');
        if (gestureInput) gestureInput.value = gestures;
    }
    const sessionInput = document.getElementById('session_id');
    if (sessionInput) sessionInput.value = sessionId;

    // Dispatch a synthetic submit event
    form.dispatchEvent(new Event('submit', { cancelable: true }));
}

function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

function initButtonPad() {
    const participantIdInput = document.getElementById('button-pad-id');
    const buttons = document.querySelectorAll('.button-pad button');

    const userIdFromUrl = getUrlParameter('user_id');
    if (userIdFromUrl) {
        participantIdInput.value = userIdFromUrl;
        console.log('Participant ID set from URL parameter: ' + userIdFromUrl);
    }

    sessionId = getUrlParameter('session_id');
    if (sessionId) {
        console.log('Session ID set from URL parameter: ' + sessionId);
    }

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.textContent === 'C') {
                participantIdInput.value = '';
            } else if (participantIdInput.value.length < 4) {
                participantIdInput.value += button.textContent;
            }
        });
    });
}

window.addEventListener('load', initButtonPad);
