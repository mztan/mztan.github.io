#!/usr/bin/env node

// Test to debug why "dp" is not being autocorrected to "do"

const AutocorrectEngine = require('./AutocorrectEngine.js');
const keyboardNeighbors = require('./keyboard-layout.js');
const fs = require('fs');

// Load dictionary
const dictionaryPath = './hybrid_dictionary.txt';
const words = fs.readFileSync(dictionaryPath, 'utf-8')
    .split('\n')
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0);

console.log(`Loaded ${words.length} words from dictionary`);

// Initialize autocorrect engine
const engine = new AutocorrectEngine({
    baseWords: words,
    keyboardNeighbors: keyboardNeighbors
});

console.log('\n=== Testing "dp" autocorrect ===\n');

// Check if "do" is in dictionary
console.log(`Is "do" in dictionary? ${engine.hasWord('do')}`);
console.log(`Is "dp" in dictionary? ${engine.hasWord('dp')}`);

// Check if 'p' and 'o' are neighbors
console.log(`\nAre 'p' and 'o' neighbors? ${engine.areNeighboringKeys('p', 'o')}`);
console.log(`Keyboard neighbors of 'p': ${JSON.stringify(keyboardNeighbors['p'])}`);
console.log(`Keyboard neighbors of 'o': ${JSON.stringify(keyboardNeighbors['o'])}`);

// Check edge key status
console.log(`\nIs 'p' an edge key? ${engine.edgeKeys.has('p')}`);
console.log(`Is 'o' an edge key? ${engine.edgeKeys.has('o')}`);

// Calculate cost manually
const cost = engine.levenshteinCost('dp', 'do');
console.log(`\nCost of "dp" -> "do": ${cost}`);
console.log(`Expected: 0.5 (neighbor substitution with edge keys)`);

// Get threshold
const threshold = engine.useLengthAdaptiveThreshold
    ? Math.max(engine.minCostThreshold, 'dp'.length * engine.lengthAdaptiveThresholdPercent)
    : engine.maxCostThreshold;
console.log(`\nCost threshold for "dp" (length ${2}): ${threshold}`);
console.log(`minCostThreshold: ${engine.minCostThreshold}`);
console.log(`lengthAdaptiveThresholdPercent: ${engine.lengthAdaptiveThresholdPercent}`);
console.log(`Calculated threshold: ${Math.max(engine.minCostThreshold, 2 * engine.lengthAdaptiveThresholdPercent)}`);

// Try to find closest word
console.log('\n=== Finding closest word for "dp" ===');
const result = engine.findClosestWord('dp');
console.log(`Result: ${JSON.stringify(result, null, 2)}`);

// Check specific candidates
console.log('\n=== Checking specific candidates ===');
const candidates = ['do', 'up', 'op', 'dr', 'dp'];
for (const candidate of candidates) {
    if (engine.hasWord(candidate)) {
        const candidateCost = engine.levenshteinCost('dp', candidate);
        console.log(`"${candidate}": cost = ${candidateCost}, passes threshold (${threshold})? ${candidateCost < threshold}`);
    }
}

// Test with TrieDictionary if available
if (engine.trieDictionary) {
    console.log('\n=== TrieDictionary search ===');
    const trieCandidates = engine.trieDictionary.search('dp', 2);
    console.log(`Found ${trieCandidates.length} candidates:`);
    for (const candidate of trieCandidates.slice(0, 10)) {
        console.log(`  "${candidate.word}": distance = ${candidate.distance}`);
    }
}
