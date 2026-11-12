/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
 */

"use strict";

/**
 * Create dimensions from the given values and store them for later use.
 * All values should be positive and make sense.
 * @param {number} width The outer width of the area.
 * @param {number} height The outer height of the area.
 * @param {number} top Margin form the top edge.
 * @param {number} right Margin form the right edge.
 * @param {number} bottom Margin form the bottom edge.
 * @param {number} left Margin form the left edge.
 */
function makeDimension(width, height, top, right, bottom, left) {
	return {width: width,
		height: height,
		innerWidth: width - (left + right),
		innerHeight: height - (top + bottom),
		top: top,
		right: right,
		bottom: bottom,
		left: left,
		cx: (width - (left + right)) / 2 + left,
		cy: (height - (top + bottom)) / 2 + top};
}

// set up dimensions for the plotting.
var testDimension = makeDimension(620, 400, 30, 30, 30, 30);

var MAX_SPEED = 2; // pixel/ms
var elapsed = 0;
var fittsID = 0;
var trialNum = 1;

// Variables for tracking movement
let isMoving = false; // Tracks if the mouse is currently moving
let dragCount = 0;    // Counter for start-stop movements
let stopTimeout;      // Timer to detect when the mouse stops
let lastMousePosition = { x: null, y: null };

let conditionId;
let conditionValue;

// Session ID read from URL parameter
let sessionId;

let _eventLoggerWarnShown = false;
function _warnIfNoEventLogger() {
    if (typeof EventLogger === 'undefined' && !_eventLoggerWarnShown) {
        console.warn('[UXR] EventLogger is not loaded — event logging is inactive. Add ?eventLog=true to enable.');
        _eventLoggerWarnShown = true;
    }
    return typeof EventLogger !== 'undefined';
}

const experienceScreen = document.getElementById('experience-screen');
const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');
const timer = document.getElementById('timer');
const startText = document.getElementById('start-text');
const conditionSelect = document.getElementById('condition');

function rHit(r, rTarget) {
	return ((plotHitsDimension.innerWidth / 2) / rTarget) * r;
};

// Function to reset drag count and related variables
function resetTrialData() {
    isMoving = false;
    dragCount = 0;
    fittsTest.totalCursorDistance = 0; // Reset cursor distance tracking
    clearTimeout(stopTimeout);
    console.log("Trial data reset. Drag count is now 0.");
}

// Event listener for mouse movement
document.addEventListener('mousemove', () => {
	const currentMousePosition = { x: event.clientX, y: event.clientY };
	if (_warnIfNoEventLogger()) {
		var svgRect = testAreaSVG.node().getBoundingClientRect();
		var svgX = event.clientX - svgRect.left;
		var svgY = event.clientY - svgRect.top;
		var target = fittsTest.target;
		var dist = distance({x: svgX, y: svgY}, target) - (target.w / 2);
		EventLogger.updateCursorPosition(event.clientX, event.clientY, {
			targetIndex: fittsTest.currentPosition,
			distanceToTarget: Math.max(0, Math.round(dist))
		});
	}
	if (lastMousePosition.x === currentMousePosition.x && lastMousePosition.y === currentMousePosition.y) {
        return;
    }

	lastMousePosition = currentMousePosition;

    if (!isMoving) {
        isMoving = true;
        dragCount++;
        console.log(`Drag Count: ${dragCount}`);
        if (_warnIfNoEventLogger()) EventLogger.logEvent('movement_start', { x: currentMousePosition.x, y: currentMousePosition.y, targetIndex: fittsTest.currentPosition });
    }

    // Reset the stop timeout for every movement
    clearTimeout(stopTimeout);

    // Set a timeout to detect when the mouse stops
    stopTimeout = setTimeout(() => {
        isMoving = false;
        if (_warnIfNoEventLogger()) EventLogger.logEvent('movement_stop', { x: lastMousePosition.x, y: lastMousePosition.y, targetIndex: fittsTest.currentPosition });
    }, 100);
});

function v(v) {
	var colour = 'rgb(' + clampInt(0, 255, (v / MAX_SPEED) * 255) + ', 0, 0)';
	return colour;
};

var fittsTest = {
	target: {x: 0, y: 0, r: 10},
	start: {x: 0, y: 0, t: 0},
	last: {},

	isoPositions: [],
	currentPosition: 0,
	currentCount: 0,
	miss: 0,
	isoLimits: {minD: 120, maxD: 300, minW:10 , maxW: 100},
	isoParams: {num: 9, distance: 200, width: 50, randomize: true},

	active: false,

	clicksTotal: 0,
	clicksOnTarget: 0,

	targetEntries: 1, // test doesnt start until the first click so we add one here
	isInsideTarget: false,

	totalCursorDistance: 0, // Track total cursor movement distance

	clickHistory: [],
	lastIDe: 0,
	lastTP: 0,

	colour: d3.scale.category10(),

	generateTarget: function() {
		this.target = this.isoPositions[this.currentPosition];
		this.target.distance = this.isoParams.distance;

		var target = testAreaSVG.selectAll('#target').data([this.target]);

		var insert = function(d) {
			d.attr('cx', function(d) { return d.x; })
			.attr('cy', function(d) { return d.y; })
			.attr('r', function(d) { return d.w / 2; });
		}

		target.enter()
			.append('circle')
				.attr('id', 'target')
				.style('fill', 'red')
				.call(insert);

		target.transition()
				.call(insert);
	},

	updateISOCircles: function() {
		this.generateISOPositions(this.isoParams.num,
			this.isoParams.distance,
			this.isoParams.width);

		var circles = testAreaSVG.selectAll('circle').data(this.isoPositions);

		var insert = function(d) {
			d.attr('cx', function(d) { return d.x; })
			.attr('cy', function(d) { return d.y; })
			.attr('r', function(d) { return d.w / 2; });
		}

		circles.enter()
			.append('circle')
				.attr('class', 'iso')
				.call(insert);

		circles.transition()
			.call(insert);

		circles.exit()
			.transition()
				.attr('r', 0)
				.remove();

		// this.currentPosition = 0;
		this.generateTarget();
	},

	generateISOPositions: function(num, d, w) {
		this.isoPositions = [];

		for (var i = 0; i < num; i++) {
			this.isoPositions[i] = {x: testDimension.cx + ((d/2) * Math.cos((2 * Math.PI * i) / num)),
				y: testDimension.cy + ((d/2) * Math.sin((2 * Math.PI * i) / num)),
				w: w};
		}
	},

	removeTarget: function() {
		// Remove the currently active target
		testAreaSVG.selectAll('#target').data([])
			.exit()
				.remove();
	},



	mouseClicked: function(x, y) {
		var isHit = distance({ x: x, y: y }, this.target) < (this.target.w / 2);
		this.clicksTotal++;
		//updateClickCounts(isHit); // Update the click counts

	if (isHit) {
			this.clicksOnTarget++;
			if (_warnIfNoEventLogger()) EventLogger.logEvent('click_target', { x: x, y: y, targetX: this.target.x, targetY: this.target.y, targetRadius: this.target.w / 2, targetIndex: this.currentPosition });
			if (!this.active) {
				console.log('start active');
				startTimer();
				this.active = true;
			}

			this.addDataPoint({start: this.start,
				target: this.target,
				path: this.currentPath,
				hit: {x: x, y: y, t: (new Date).getTime()}});

			this.currentCount++;
			this.currentPosition = (this.currentPosition + Math.ceil(this.isoPositions.length/2)) % this.isoPositions.length;
			this.removeTarget();
			this.generateTarget();

			// If we've gone around the whole circle
			// if (this.currentPosition === 0) {
			// 	this.advanceParams();
			// }

			if (this.currentCount === 9) {
				this.active = false;
				endExperience();
			}

			this.last = {x: x, y: y, t: (new Date).getTime()};
			this.start = this.last;
		}
		else {
			this.miss++;
			if (_warnIfNoEventLogger()) EventLogger.logEvent('click_miss', { x: x, y: y, targetX: this.target.x, targetY: this.target.y, targetRadius: this.target.w / 2, targetIndex: this.currentPosition });
		}
	},

	mouseMoved: function(x, y) {
		if (this.active) {
			// Skip if the mouse did not move
			if (x == this.last.x && y == this.last.y) {
				return;
			}

			// Calculate and accumulate cursor distance
			if (this.last.x !== undefined && this.last.y !== undefined) {
				const movementDistance = distance({ x: x, y: y }, { x: this.last.x, y: this.last.y });
				this.totalCursorDistance += movementDistance;
			}

			// Check if the mouse is inside the target area
			const isInsideTarget = distance({ x: x, y: y }, this.target) < (this.target.w / 2);

		if (isInsideTarget && !this.isInsideTarget) {
				this.targetEntries++;
				this.isInsideTarget = true;
				console.log("Target entered: " + this.targetEntries);
				if (_warnIfNoEventLogger()) EventLogger.logEvent('cursor_enter_target', { cursorX: x, cursorY: y, targetX: this.target.x, targetY: this.target.y, targetRadius: this.target.w / 2, targetIndex: this.currentPosition });
			} else if (!isInsideTarget && this.isInsideTarget) {
				this.isInsideTarget = false;
				if (_warnIfNoEventLogger()) EventLogger.logEvent('cursor_exit_target', { cursorX: x, cursorY: y, targetX: this.target.x, targetY: this.target.y, targetRadius: this.target.w / 2, targetIndex: this.currentPosition });
			} else if (!isInsideTarget) {
				this.isInsideTarget = false;
			}

			this.last = { x: x, y: y, t: (new Date).getTime() };
		}
	},

	advanceParams: function(distance, width) {
		console.log('advance params, current count: ' + this.currentCount);
		// if (this.currentCount >= 18) {
		// 	this.isoParams.distance = 250;
		// 	this.isoParams.width = 100;
		// } else if (this.currentCount >= 9) {
		// 	this.isoParams.distance = 150;
		// 	this.isoParams.width = 30;
		// } else {
		// 	this.isoParams.distance = 200;
		// 	this.isoParams.width = 50;
		// }

		this.isoParams.distance = distance;
		this.isoParams.width = width;

		// this.isoParams.distance = Math.floor(randomAB(this.isoLimits.minD, this.isoLimits.maxD));
		// this.isoParams.width = Math.floor(randomAB(this.isoLimits.minW, this.isoLimits.maxW));

		this.clickHistory = []

		fittsID = Math.log2(distance / width + 1);
		console.log(`dist ${distance} width ${width} fitts id ${fittsID}`);

		this.updateISOCircles();
	},

	addDataPoint: function(in_click) {
		// add point to data array for plotting into ID/time scatter plot
		if (this.active == false)
			return;

		var dt = in_click.hit.t - in_click.start.t;

		if (dt < 10000)  // skip if obvious outlier
		{
			var dist = distance(in_click.target, in_click.start);
			var id = shannon(dist, in_click.target.w);

			this.clickHistory.push({time: dt, distance: in_click.target.distance, width: in_click.target.w, hit: in_click.hit,
				start: in_click.start, target: in_click.target, path: in_click.path});
			console.log(`id ${id} dt ${dt} dist ${dist}`);
		}
	},
};

function randomAB(a, b) {
	return a + Math.random() * (b - a);
}

function mouseMoved()
{
	var m = d3.svg.mouse(this);
	fittsTest.mouseMoved(m[0], m[1])
}

function mouseClicked()
{
	var m = d3.svg.mouse(this);
	fittsTest.mouseClicked(m[0], m[1]);
}

function distance(a, b) {
	var dx = a.x - b.x;
	var dy = a.y - b.y;
	return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
}

function clampInt(lower, upper, x) {
	return Math.min(upper, Math.max(lower, Math.floor(x)));
}

function shannon(A, W) {
	return Math.log(A / W + 1) / Math.log(2);
}

function project(A, B, p) {
	/**
	 * Project a point q onto the line p0-p1
	 * Code taken from: http://www.alecjacobson.com/weblog/?p=1486
	 */
	var AB = minus(B, A);
	var AB_squared = dot(AB, AB);
	if (AB_squared == 0) {
		return A;
	}
	else {
		var Ap = minus(p, A);
		var t = dot(Ap, AB) / AB_squared;
		return {x: A.x + t * AB.x,
				y: A.y + t * AB.y,
				t: t};
	}
}

function dot(a, b) {
	return (a.x * b.x) + (a.y * b.y);
}

// coutesy of http://stackoverflow.com/questions/3461453/determine-which-side-of-a-line-a-point-lies
function isLeft(A, B, p){
     return ((B.x - A.x)*(p.y - A.y) - (B.y - A.y)*(p.x - A.x)) >= 0 ? 1: -1;
}

function minus(a, b) {
	return {x: a.x - b.x, y: a.y - b.y};
}

function sign(a) {
	return a >=0 ? 1 : -1;
}

// _empirical_ covariance
function cov(data, extractorA, extractorB) {

	if (data.length <= 1) { // no covariance for 0 or 1 element.
		return 0;
	}

	var mA = mean(data, extractorA);
	var mB = mean(data, extractorB);

	var cov = 0;
	for (var i = 0; i < data.length; i++) {
		cov += (extractorA(data[i]) - mA) * (extractorB(data[i]) - mB);
	}

	return cov / (data.length - 1);
}

function variance(data, extractor) {
	return cov(data, extractor, extractor);
}

function mean(data, extractor) {
	var sum = 0;
	for (var i = 0; i < data.length; i++) {
		sum += extractor(data[i]);
	}
	return sum / data.length;
}


function bgRect(d, dim) {
	return d.append('rect')
		.attr('cx', 0)
		.attr('cy', 0)
		.attr('width', dim.width)
		.attr('height', dim.height)
		.attr('class', 'back');
}



var testAreaSVG = d3.select('#test-area').append('svg')
	.attr('width', testDimension.width)
	.attr('height', testDimension.height)
	.style('pointer-events', 'all')
    .on('mousemove', mouseMoved)
	.on('mousedown', mouseClicked)
	.call(bgRect, testDimension);


function startTimer() {
	let startTime = null;
	console.log('start timer');

	function loop(timestamp) {
		if (!startTime)
			startTime = timestamp;

		elapsed = timestamp - startTime;
		timer.innerText = (elapsed / 1000).toFixed(2);
		if (!fittsTest.active) {
			console.log('stop timer');
			return;
		}
		window.requestAnimationFrame(loop);
	}
	window.requestAnimationFrame(loop);
}

function startExperience() {
	resetTrialData();
	let condition = conditionSelect.value;
	console.log('start experience, condition: ' + condition);

	if (_warnIfNoEventLogger()) {
		if (trialNum === 1) {
			EventLogger.startSession({
				participantId: document.getElementById('button-pad-id').value,
				trialType: 'fitts',
				sessionId: sessionId
			});
		}
		EventLogger.startTrial(trialNum);
	}

	if (condition === '1') {
		fittsTest.advanceParams(300, 75);
	}
	else if (condition === '2') {
		fittsTest.advanceParams(300, 38);
	}
	else if (condition === '3') {
		fittsTest.advanceParams(300, 20);
	}
	else if (condition === '4') {
		fittsTest.advanceParams(300, 12);
	}
	else
	{
		return
	}
	// else if (condition === '5') {
	// 	fittsTest.advanceParams(150, 100);
	// }

	startScreen.style.display = "none";
	experienceScreen.style.display = "";
	if (_warnIfNoEventLogger()) EventLogger.startCursorTrace(testAreaSVG.node());
}

function endExperience() {
	experienceScreen.style.display = "none";
	startScreen.style.display = "";

	// Compute IDe
	var groups = [];
	for (var i = 0; i < fittsTest.clickHistory.length; i++) { // for each datum
		var datum = fittsTest.clickHistory[i];
		var groupID = datum.distance.toString() + datum.width.toString();
		if (!groups[groupID]) {
			groups[groupID] = [];
		}

		var q = project(datum.start, datum.target, datum.hit);
		var x = distance(q, datum.start) * sign(q.t);
		var y = distance(q, datum.hit) * isLeft(datum.start, datum.target, datum.hit);

		datum.realDistance = distance(datum.start, datum.hit); // use real distance here.
		datum.projectedHitOffsetX = distance(q, datum.target) * sign(q.t - 1);
		datum.projectedHitOffsetY = y;
		// datum.hitOffset = distance(datum.target, datum.hit);

		// console.log(`i ${i} realD ${datum.realDistance} hitD ${datum.hitOffset}`);

		groups[groupID].push(datum);
	}

	var newData = [];
	for (var group in groups) {
		var thisGroup = groups[group];
		if (thisGroup.length < 3) { // exclude groups with length < 3
			continue;
		}

		var xEffective = 4.133 * Math.sqrt(variance(thisGroup, function(d) { return d.projectedHitOffsetX; }))
		var yEffective = 4.133 * Math.sqrt(variance(thisGroup, function(d) { return d.projectedHitOffsetY; }))
		var We = Math.min(xEffective, yEffective); // SMALLER-OF model (MacKenzie, Buxton 92)

		// var eEffective = 4.133 * Math.sqrt(variance(thisGroup, function(d) { return d.hitOffset; }))
		// var We = eEffective * 2


		var dEffective = mean(thisGroup, function(d) { return d.realDistance; });

		var De = dEffective;
		var IDe = shannon(De, We);
		console.log(`We ${We} De ${De} IDe ${IDe} xeff ${xEffective} yeff ${yEffective} deff ${dEffective}`);
		// console.log(`We ${We} De ${De} IDe ${IDe} eeff ${eEffective} deff ${dEffective}`);

		var totalThroughput = 0;
		var totalTime = 0;
		for (var i = 0; i < thisGroup.length; i++) {
			var datum = thisGroup[i];
			datum.IDe = IDe;
			datum.throughput = 1000 * (datum.IDe/datum.time);
			// console.log(`i ${i} throughput ${datum.throughput}`);
			totalThroughput += datum.throughput;
			totalTime += datum.time;
			newData.push(datum);
		}
		var averageThroughput = totalThroughput / thisGroup.length;
		console.log(`Average throughput: ${averageThroughput} totaltime ${totalTime}`);
		fittsTest.lastIDe = IDe;
		fittsTest.lastTP = averageThroughput;
	}

	let elapsedStr = (elapsed / 1000).toFixed(2);
	let idStr = fittsID.toFixed(2);
	let ideStr = fittsTest.lastIDe.toFixed(2);
	let tpStr = fittsTest.lastTP.toFixed(2);
	let numTargets = fittsTest.currentCount - 1;
	let ct = fittsTest.clicksTotal;
	let cot = fittsTest.clicksOnTarget;
	let te = fittsTest.targetEntries;
	let tcd = fittsTest.totalCursorDistance.toFixed(1);

	startText.innerText = `#${trialNum} C:${conditionSelect.value} TTC:${elapsedStr}s ID:${idStr} IDe:${ideStr} TP:${tpStr} CT:${ct} TE:${te} TCD:${tcd}px\n` + startText.innerText;

	submitForm(trialNum, conditionSelect.value, idStr, ideStr, tpStr, elapsedStr, ct, cot, te, tcd);

	if (_warnIfNoEventLogger()) {
		EventLogger.endTrial({
			trialNum: trialNum,
			condition: conditionSelect.value,
			timeToComplete: elapsedStr,
			indexOfDifficulty: idStr,
			effectiveId: ideStr,
			throughput: tpStr,
			clicksTotal: ct,
			clicksOnTarget: cot,
			targetEntries: te,
			dragCount: dragCount,
			totalCursorDistance: tcd
		});
		EventLogger.stopCursorTrace();
		EventLogger.downloadLog();
		EventLogger.clearLog();
	}

	trialNum += 1;

	// init code
	fittsTest.currentPosition = 0,
	fittsTest.currentCount = 0,
	fittsTest.miss = 0,
	fittsTest.active = false;
	fittsTest.clicksTotal = 0;
	fittsTest.clicksOnTarget = 0;
	fittsTest.targetEntries = 1;
	fittsTest.isInsideTarget = false;
	timer.innerText = "";
	testAreaSVG.selectAll('line').remove(); // remove all cursor trails
	//fittsTest.advanceParams();
}

function submitForm(trial, condition, id, ide, tp, ttc, ct, cot, te, tcd) {
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
    document.getElementById('condition_num').value = condition;
    document.getElementById('index_of_difficulty').value = id;
    document.getElementById('effective_id').value = ide;
    document.getElementById('throughput').value = tp;
    document.getElementById('time_to_complete').value = ttc;

    // Add clicksTotal and clicksOnTarget to the form
    document.getElementById('clicks_total').value = ct; // Total clicks
    document.getElementById('clicks_on_target').value = cot; // Clicks on target

	// Add target entires to the form
	document.getElementById('target_entries').value = te;

	// Add drag count
	document.getElementById('drag_count').value = dragCount;

	// Add total cursor distance
	document.getElementById('total_cursor_distance').value = tcd;

	// Populate condition fields
    document.getElementById('condition_id').value = conditionId;
    document.getElementById('condition_value').value = conditionValue;

	// Populate session ID
	document.getElementById('session_id').value = sessionId;

    // Dispatch a synthetic submit event
    form.dispatchEvent(new Event('submit', { cancelable: true }));
}


// Function to get URL parameters
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}


function initButtonPad() {
    const participantIdInput = document.getElementById('button-pad-id');
    const buttons = document.querySelectorAll('.button-pad button');

    // Check for user_id URL parameter and populate the ID field
    const userIdFromUrl = getUrlParameter('user_id');
    if (userIdFromUrl) {
        participantIdInput.value = userIdFromUrl;
        console.log('Participant ID set from URL parameter: ' + userIdFromUrl);
    }

    // Check for session_id URL parameter
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

// register listener for data passed to WebView from Unity
window.addEventListener('vuplexmessage', event => {
	const data = JSON.parse(event.value);
	console.log("received condition data: " + data.conditionId + ", " + data.conditionValue);
	if (data.conditionId){
		conditionId = data.conditionId;
	}
	if (data.conditionValue){
		conditionValue = data.conditionValue;
	}
});

// Test function to simulate Vuplex messages with mock data
// Usage: Call testVuplexMessage() from browser console or testVuplexMessage({conditionId: "5", conditionValue: "CustomCondition"})
function testVuplexMessage(mockData) {
    const defaultMockData = {
        conditionId: "42",
        conditionValue: "TestCondition_Mock"
    };

    const data = mockData || defaultMockData;

    // Create a mock event that mimics the Vuplex message structure
    const mockEvent = new CustomEvent('vuplexmessage', {
        detail: data
    });
    mockEvent.value = JSON.stringify(data);

    console.log("=== Testing Vuplex Message Integration ===");
    console.log("Dispatching mock vuplexmessage with data:", data);

    // Dispatch the mock event
    window.dispatchEvent(mockEvent);

    // Verify the values were set correctly
    console.log("After dispatch - conditionId:", conditionId);
    console.log("After dispatch - conditionValue:", conditionValue);

    // Check if values match expected
    const success = conditionId === data.conditionId && conditionValue === data.conditionValue;
    if (success) {
        console.log("✅ TEST PASSED: Vuplex message integration working correctly!");
    } else {
        console.error("❌ TEST FAILED: Values not set correctly");
    }

    return { conditionId, conditionValue, success };
}

// Expose test function globally for console access
window.testVuplexMessage = testVuplexMessage;


window.addEventListener('load', initButtonPad);
startButton.addEventListener('click', startExperience);
