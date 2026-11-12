/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
 */

const MAX_ZOOM_TRIALS = 10;
const ZOOM_SENSITIVITY = 0.00125;
const ZOOM_TOLERANCE = 0.06;
const ZOOM_HOLD_TIME = 300;
const ZOOM_MIN_SCALE = 0.4;
const ZOOM_MAX_SCALE = 2.5;
const ZOOM_TARGET_SCALE_MIN = 0.55;
const ZOOM_TARGET_SCALE_MAX = 1.8;
const ZOOM_OUTLINE_BORDER_PX = 3;

let zoomCurrentScale = 1.0;
let zoomCursorX = null;
let zoomCursorY = null;
let zoomTargetSize = 0;
let zoomMinSize = 0;
let zoomMaxSize = 0;
let zoomInnerBaseSize = 0;
let zoomHoldTimeout = null;
let touchStartDist = 0;
let touchStartZoomScale = 1.0;
const TOUCH_ZOOM_SENSITIVITY = 1 / 2.5;

function _getZoomData() {
    return {
        targetIndex: successfulClicks,
        currentSize: zoomInnerBaseSize * zoomCurrentScale,
        zoomTargetSize: zoomTargetSize,
        zoomMinSize: zoomMinSize,
        zoomMaxSize: zoomMaxSize,
        zoomCurrentScale: zoomCurrentScale
    };
}

// CTRL+scroll wheel — zoom only with CTRL held (ignore plain mouse scroll)
document.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    applyZoomDelta(e.deltaY, e.deltaMode);
}, { passive: false });

// Two-finger touch pinch
function touchDist(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        touchStartDist = touchDist(e);
        touchStartZoomScale = zoomCurrentScale;
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        trackGesture(200, 'zoom', _getZoomData);
        const dist = touchDist(e);
        const ratio = dist / touchStartDist;
        const dampenedRatio = 1 + (ratio - 1) * TOUCH_ZOOM_SENSITIVITY;
        zoomCurrentScale = touchStartZoomScale * dampenedRatio;
        zoomCurrentScale = Math.max(ZOOM_MIN_SCALE, Math.min(ZOOM_MAX_SCALE, zoomCurrentScale));
        updateZoomUI();
        checkZoomMatch();
    }
}, { passive: false });

// Safari gesture events
document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
    touchStartZoomScale = zoomCurrentScale;
});

document.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    trackGesture(200, 'zoom', _getZoomData);
    const dampenedScale = 1 + (e.scale - 1) * TOUCH_ZOOM_SENSITIVITY;
    zoomCurrentScale = touchStartZoomScale * dampenedScale;
    zoomCurrentScale = Math.max(ZOOM_MIN_SCALE, Math.min(ZOOM_MAX_SCALE, zoomCurrentScale));
    updateZoomUI();
    checkZoomMatch();
});

document.addEventListener('gestureend', (e) => e.preventDefault());

function applyZoomDelta(deltaY, deltaMode) {
    if (!zoomInnerBaseSize) return;
    trackGesture(200, 'zoom', _getZoomData);

    let normalizedDeltaY = deltaY;
    if (deltaMode === 1) {
        normalizedDeltaY *= 16;
    } else if (deltaMode === 2) {
        normalizedDeltaY *= window.innerHeight;
    }

    zoomCurrentScale -= normalizedDeltaY * ZOOM_SENSITIVITY;
    zoomCurrentScale = Math.max(ZOOM_MIN_SCALE, Math.min(ZOOM_MAX_SCALE, zoomCurrentScale));
    updateZoomUI();
    checkZoomMatch();
}

function updateZoomUI() {
    const currentSize = zoomInnerBaseSize * zoomCurrentScale;
    const innerSquare = document.getElementById('zoom-inner-square');
    if (!innerSquare) return;
    innerSquare.style.width = `${currentSize}px`;
    innerSquare.style.height = `${currentSize}px`;
    const inBounds = currentSize >= zoomMinSize && currentSize <= zoomMaxSize;
    innerSquare.style.backgroundColor = inBounds ? '#81c784' : '#7ec8e3';
    EventLogger.updateTrace('zoomValue', {
        zoomCurrentScale: zoomCurrentScale,
        zoomTargetScale: zoomTargetSize / zoomInnerBaseSize,
        targetIndex: successfulClicks,
        zoomThresholdOffset: Math.round(currentSize < zoomMinSize ? currentSize - zoomMinSize : currentSize > zoomMaxSize ? currentSize - zoomMaxSize : 0),
        x: zoomCursorX,
        y: zoomCursorY
    });
}

function generateZoomTarget() {
    let targetScale;
    let attempts = 0;

    const logMin = Math.log(ZOOM_TARGET_SCALE_MIN);
    const logMax = Math.log(ZOOM_TARGET_SCALE_MAX);

    do {
        const logScale = Math.random() * (logMax - logMin) + logMin;
        targetScale = Math.exp(logScale);
        attempts++;
    } while ((Math.abs(targetScale - zoomCurrentScale) / zoomCurrentScale < 0.15 || Math.abs(targetScale - 1.0) < 0.15) && attempts < 50);

    zoomTargetSize = zoomInnerBaseSize * targetScale;
    zoomCurrentScale = 1.0;

    const outerOutlineSize = zoomTargetSize * (1 + ZOOM_TOLERANCE);
    const innerOutlineSize = zoomTargetSize * (1 - ZOOM_TOLERANCE);

    // Success bounds: can't go past outer outline; touching inner outline's border = success
    zoomMaxSize = outerOutlineSize;
    zoomMinSize = innerOutlineSize - 2 * ZOOM_OUTLINE_BORDER_PX;

    const outerOutline = document.getElementById('zoom-target-outline-outer');
    outerOutline.style.width = `${outerOutlineSize}px`;
    outerOutline.style.height = `${outerOutlineSize}px`;

    const innerOutline = document.getElementById('zoom-target-outline-inner');
    innerOutline.style.width = `${innerOutlineSize}px`;
    innerOutline.style.height = `${innerOutlineSize}px`;

    updateZoomUI();
}

function checkZoomMatch() {
    if (zoomHoldTimeout) {
        clearTimeout(zoomHoldTimeout);
        zoomHoldTimeout = null;
    }

    const currentSize = zoomInnerBaseSize * zoomCurrentScale;
    const inBounds = currentSize >= zoomMinSize && currentSize <= zoomMaxSize;

    if (inBounds && !EventLogger.getIsInZoomTarget()) {
        EventLogger.setIsInZoomTarget(true);
        EventLogger.logEvent('zoom_enter_target', { targetIndex: successfulClicks, currentSize: currentSize, zoomTargetSize: zoomTargetSize, zoomMinSize: zoomMinSize, zoomMaxSize: zoomMaxSize, zoomCurrentScale: zoomCurrentScale });
    } else if (!inBounds && EventLogger.getIsInZoomTarget()) {
        EventLogger.setIsInZoomTarget(false);
        EventLogger.logEvent('zoom_exit_target', { targetIndex: successfulClicks, currentSize: currentSize, zoomTargetSize: zoomTargetSize, zoomMinSize: zoomMinSize, zoomMaxSize: zoomMaxSize, zoomCurrentScale: zoomCurrentScale });
    }

    if (inBounds) {
        zoomHoldTimeout = setTimeout(() => {
            const recheckSize = zoomInnerBaseSize * zoomCurrentScale;
            if (recheckSize >= zoomMinSize && recheckSize <= zoomMaxSize) {
                onZoomSuccess();
            }
        }, ZOOM_HOLD_TIME);
    }
}

function zoomMouseMoveHandler(e) {
    zoomCursorX = Math.round(e.clientX);
    zoomCursorY = Math.round(e.clientY);
    var currentSize = zoomInnerBaseSize * zoomCurrentScale;
    EventLogger.updateTrace('zoomValue', {
        zoomCurrentScale: zoomCurrentScale,
        zoomTargetScale: zoomTargetSize / zoomInnerBaseSize,
        targetIndex: successfulClicks,
        zoomThresholdOffset: Math.round(currentSize < zoomMinSize ? currentSize - zoomMinSize : currentSize > zoomMaxSize ? currentSize - zoomMaxSize : 0),
        x: zoomCursorX,
        y: zoomCursorY
    });
}

function zoomTouchMoveHandler(e) {
    if (e.touches.length > 0) {
        zoomCursorX = Math.round(e.touches[0].clientX);
        zoomCursorY = Math.round(e.touches[0].clientY);
    }
}

function onZoomSuccess() {
    if (successfulClicks >= MAX_ZOOM_TRIALS) return;
    successfulClicks += 1;
    playChime(true);
    EventLogger.logEvent('zoom_success', { targetIndex: successfulClicks, zoomCurrentScale: zoomCurrentScale, currentSize: zoomInnerBaseSize * zoomCurrentScale, zoomTargetSize: zoomTargetSize, successfulClicks: successfulClicks });

    if (successfulClicks >= MAX_ZOOM_TRIALS) {
        document.getElementById('start-screen').style.display = "";
        document.getElementById('zoom-body').style.display = "none";

        if (!isPractice) {
            EventLogger.stopTrace('zoomValue');
            document.removeEventListener('mousemove', zoomMouseMoveHandler);
            document.removeEventListener('touchmove', zoomTouchMoveHandler);
            let startText = document.getElementById('start-text');
            let elapsedStr = (elapsed / 1000).toFixed(2);
            startText.innerText = `#${trialNum}, TTC: ${elapsedStr}s, Gestures: ${gestureCount}\n` + startText.innerText;
            submitForm(trialNum, elapsedStr, gestureCount);
            EventLogger.endTrial({ trialNum: trialNum, timeToComplete: elapsedStr, gestureCount: gestureCount });
            EventLogger.downloadLog();
            EventLogger.clearLog();
        }
        trialNum += 1;
    } else {
        generateZoomTarget();
        EventLogger.setIsInZoomTarget(false);
    }
}

function startZoomExperience() {
    rng = new RandomGenerator();
    successfulClicks = 0;
    gestureCount = 0;
    loadChimes();

    zoomCurrentScale = 1.0;
    zoomInnerBaseSize = Math.min(window.innerWidth, window.innerHeight) * 0.25;

    var participantId = document.getElementById('button-pad-id').value;
    EventLogger.startSession({ participantId: participantId, trialType: 'zoom', sessionId: sessionId });
    EventLogger.startTrial(1);
    EventLogger.setIsInZoomTarget(false);

    if (!isPractice) {
        EventLogger.startTrace('zoomValue');
        document.addEventListener('mousemove', zoomMouseMoveHandler);
        document.addEventListener('touchmove', zoomTouchMoveHandler);
    }

    document.getElementById('start-screen').style.display = "none";
    document.getElementById('zoom-body').style.display = "";

    generateZoomTarget();

    startTimer();
}
