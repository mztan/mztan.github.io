#!/usr/bin/env node

// Simple test to check if "dp" autocorrects to "do"

const AutocorrectEngine = require('./AutocorrectEngine.js');
const keyboardNeighbors = require('./keyboard-layout.js');

// Create a tiny dictionary with just "do" and a few other 2-letter words
const words = ['do', 'go', 'to', 'is', 'it', 'up', 'on'];

console.log('=== Testing "dp" with minimal dictionary ===\n');

const engine = new AutocorrectEngine({
    baseWords: words,
    keyboardNeighbors: keyboardNeighbors
});

console.log(`Dictionary has ${words.length} words: ${words.join(', ')}`);
console.log(`TrieDictionary available: ${!!engine.trieDictionary}\n`);

// Test direct cost calculation
console.log('=== Direct cost calculation ===');
const cost = engine.levenshteinCost('dp', 'do');
console.log(`Cost of "dp" -> "do": ${cost}`);
console.log(`Expected: 0.5 (neighbor substitution with edge keys)\n`);

// Test autocorrect
console.log('=== Autocorrect test ===');
const result = engine.findClosestWord('dp');
console.log(`Input: "dp"`);
console.log(`Output: "${result}"`);
console.log(`Expected: "do"`);
console.log(`Test ${result === 'do' ? 'PASSED ✅' : 'FAILED ❌'}\n`);

// Test incremental
console.log('=== Incremental correction test ===');
const incremental = engine.getIncrementalCorrection('dp');
console.log(`Incremental result: ${incremental ? `"${incremental}"` : 'null'}`);

// Check the threshold
const threshold = engine.useLengthAdaptiveThreshold
    ? Math.max(engine.minCostThreshold, 'dp'.length * engine.lengthAdaptiveThresholdPercent)
    : engine.maxCostThreshold;
console.log(`\nThreshold for "dp": ${threshold}`);
console.log(`Cost (0.5) < Threshold (${threshold})? ${0.5 < threshold}`);
