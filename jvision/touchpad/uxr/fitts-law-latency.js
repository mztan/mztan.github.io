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

// Variables for cursor latency
let cursorLatency = 100; // Default latency in milliseconds
let cursorPositionQueue = []; // Queue to store cursor positions with timestamps
let lastRenderTime = 0; // Last time the cursor was rendered
let renderedCursorPosition = { x: 0, y: 0 }; // Current position of the rendered cursor
let pendingClickEvent = null; // Store click event to be processed after delay
let clickTimeout = null; // Timeout for delayed click processing

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
    clearTimeout(stopTimeout);
    console.log("Trial data reset. Drag count is now 0.");
}

// Create the rendered cursor
function createRenderedCursor() {
    // Remove any existing rendered cursor
    testAreaSVG.selectAll('#rendered-cursor').remove();

    // Create a new cursor
    testAreaSVG.append('circle')
        .attr('id', 'rendered-cursor')
        .attr('r', 5)
        .attr('fill', 'blue')
        .attr('opacity', 0.7)
        .attr('cx', 0)
        .attr('cy', 0)
        .style('pointer-events', 'none'); // Make sure it doesn't interfere with mouse events
}

// Update the rendered cursor position based on the queue
function updateRenderedCursor(currentTime) {
    // if (!currentTime) {
	// 	console.log("current time update render: " + currentTime)
    // }

	currentTime = Date.now();

    // Calculate the time for which we want to show the cursor position
    const targetTime = currentTime - cursorLatency;

    // Find the position in the queue that is closest to the target time
    let targetPosition = null;

    // Remove positions from the queue that are older than the target time
    while (cursorPositionQueue.length > 0 && cursorPositionQueue[0].time <= targetTime) {
        targetPosition = cursorPositionQueue.shift();
    }

    // If we found a position, update the rendered cursor
    if (targetPosition) {
        renderedCursorPosition = { x: targetPosition.x, y: targetPosition.y };

        testAreaSVG.select('#rendered-cursor')
            .attr('cx', renderedCursorPosition.x)
            .attr('cy', renderedCursorPosition.y);
    }

    // Request the next animation frame
    requestAnimationFrame(updateRenderedCursor);
}

// Process the click event after the delay
function processDelayedClick() {
    if (pendingClickEvent) {
        const { x, y } = pendingClickEvent;
        fittsTest.mouseClicked(x, y);
        pendingClickEvent = null;
    }
}

// Event listener for mouse movement
document.addEventListener('mousemove', (event) => {
	const currentMousePosition = { x: event.clientX, y: event.clientY };
	if (lastMousePosition.x === currentMousePosition.x && lastMousePosition.y === currentMousePosition.y) {
        return;
    }

	lastMousePosition = currentMousePosition;

    if (!isMoving) {
        // Mouse just started moving
        isMoving = true;
        dragCount++; // Increment drag count for this new movement
        console.log(`Drag Count: ${dragCount}`);
    }

    // Reset the stop timeout for every movement
    clearTimeout(stopTimeout);

    // Set a timeout to detect when the mouse stops
    stopTimeout = setTimeout(() => {
        isMoving = false; // Mouse has stopped
    }, 100); // Adjust timeout duration as needed
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
				.style('opacity', 0.5) // Set the opacity to 50%
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
		}
	},

	mouseMoved: function(x, y) {
		if (this.active) {
			// Skip if the mouse did not move
			if (x == this.last.x && y == this.last.y) {
				return;
			}

			// Check if the mouse is inside the target area
			const isInsideTarget = distance({ x: x, y: y }, this.target) < (this.target.w / 2);

			if (isInsideTarget && !this.isInsideTarget) {
				this.targetEntries++; // Increment target entry count
				this.isInsideTarget = true; // Mark as inside target
				console.log("Target entered: " + this.targetEntries);
			} else if (!isInsideTarget) {
				this.isInsideTarget = false; // Reset flag when the user exits the target
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

function mouseMoved() {
	var m = d3.svg.mouse(this);

	// Add the current position to the queue with timestamp
	const currentTime = Date.now();

	cursorPositionQueue.push({
		x: m[0],
		y: m[1],
		time: currentTime
	});

	// Call the original mouseMoved function with the real cursor position
	fittsTest.mouseMoved(m[0], m[1]);
}

function mouseClicked() {
	var m = d3.svg.mouse(this);

	// Store the click event to be processed after the delay
	pendingClickEvent = { x: m[0], y: m[1] };

	// Clear any existing timeout
	if (clickTimeout) {
		clearTimeout(clickTimeout);
	}

	// Set a timeout to process the click after the latency
	clickTimeout = setTimeout(processDelayedClick, cursorLatency);
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

// Function to update the cursor latency
function updateCursorLatency(value) {
	cursorLatency = parseInt(value);
	document.getElementById('latency-value').textContent = value + 'ms';
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
		fittsTest.advanceParams(60, 20);
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

	// Create the rendered cursor and start updating it
	createRenderedCursor();
	requestAnimationFrame(updateRenderedCursor);
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

	startText.innerText = `#${trialNum} C:${conditionSelect.value} TTC:${elapsedStr}s ID:${idStr} IDe:${ideStr} TP:${tpStr} CT:${ct} TE:${te}\n` + startText.innerText;

	submitForm(trialNum, conditionSelect.value, idStr, ideStr, tpStr, elapsedStr, ct, cot, te);

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
	testAreaSVG.select('#rendered-cursor').remove(); // remove the rendered cursor
	//fittsTest.advanceParams();
}

function submitForm(trial, condition, id, ide, tp, ttc, ct, cot, te) {
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

    // Dispatch a synthetic submit event
    // form.dispatchEvent(new Event('submit', { cancelable: true }));
}

function initButtonPad() {
    const participantIdInput = document.getElementById('button-pad-id');
    const buttons = document.querySelectorAll('.button-pad button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.textContent === 'C') {
                participantIdInput.value = '';
            } else if (participantIdInput.value.length < 2) {
                participantIdInput.value += button.textContent;
            }
        });
    });
}

window.addEventListener('load', function() {
    initButtonPad();

    // Initialize the latency slider value
    if (document.getElementById('latency-slider')) {
        document.getElementById('latency-slider').value = cursorLatency;
        document.getElementById('latency-value').textContent = cursorLatency + 'ms';
    }
});

startButton.addEventListener('click', startExperience);
