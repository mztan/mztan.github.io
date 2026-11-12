#!/usr/bin/env node

/**
 * Command-line tests for AutocorrectEngine
 * Run with: node test-autocorrect.js
 */

const fs = require('fs');
const path = require('path');

// Load dependencies
const AutocorrectEngine = require('./AutocorrectEngine.js');
const TrieDictionary = require('./TrieDictionary.js');

// Make TrieDictionary available globally for AutocorrectEngine
global.TrieDictionary = TrieDictionary;

// Load keyboard layout
const keyboardNeighbors = {
    'q': ['w', 'a'],
    'w': ['q', 'e', 's', 'a'],
    'e': ['w', 'r', 'd', 's'],
    'r': ['e', 't', 'f', 'd'],
    't': ['r', 'y', 'g', 'f'],
    'y': ['t', 'u', 'h', 'g'],
    'u': ['y', 'i', 'j', 'h'],
    'i': ['u', 'o', 'k', 'j'],
    'o': ['i', 'p', 'l', 'k'],
    'p': ['o', 'l'],
    'a': ['q', 'w', 's', 'z'],
    's': ['a', 'w', 'e', 'd', 'z', 'x'],
    'd': ['s', 'e', 'r', 'f', 'x', 'c'],
    'f': ['d', 'r', 't', 'g', 'c', 'v'],
    'g': ['f', 't', 'y', 'h', 'v', 'b'],
    'h': ['g', 'y', 'u', 'j', 'b', 'n'],
    'j': ['h', 'u', 'i', 'k', 'n', 'm'],
    'k': ['j', 'i', 'o', 'l', 'm'],
    'l': ['k', 'o', 'p'],
    'z': ['a', 's', 'x'],
    'x': ['z', 's', 'd', 'c'],
    'c': ['x', 'd', 'f', 'v'],
    'v': ['c', 'f', 'g', 'b'],
    'b': ['v', 'g', 'h', 'n'],
    'n': ['b', 'h', 'j', 'm'],
    'm': ['n', 'j', 'k']
};

// Test results
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    testsRun++;
    if (condition) {
        testsPassed++;
        console.log(`✅ PASS: ${message}`);
    } else {
        testsFailed++;
        console.log(`❌ FAIL: ${message}`);
    }
}

function assertEquals(actual, expected, message) {
    testsRun++;
    if (actual === expected) {
        testsPassed++;
        console.log(`✅ PASS: ${message}`);
        console.log(`   Expected: "${expected}", Got: "${actual}"`);
    } else {
        testsFailed++;
        console.log(`❌ FAIL: ${message}`);
        console.log(`   Expected: "${expected}", Got: "${actual}"`);
    }
}

async function loadDictionary() {
    const dictPath = path.join(__dirname, 'hybrid_dictionary.txt');
    const content = fs.readFileSync(dictPath, 'utf-8');
    return content.split('\n')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0);
}

async function runTests() {
    console.log('🧪 Loading dictionary...\n');
    const dictionary = await loadDictionary();
    console.log(`📚 Loaded ${dictionary.length} words\n`);

    // Initialize autocorrect engine
    const engine = new AutocorrectEngine({
        baseWords: dictionary,
        keyboardNeighbors: keyboardNeighbors,
        maxEditDistance: 2,
        adjacentKeyMultiplier: 0.9,
        insertionCost: 0.5,
        deletionCost: 1.0,
        substitutionCost: 1.0
    });

    console.log('='.repeat(60));
    console.log('TEST SUITE: Basic Autocorrect');
    console.log('='.repeat(60) + '\n');

    // Test 1: facilitatte -> facilitate
    console.log('Test 1: "facilitatte" should correct to "facilitate"');
    const result1 = engine.findClosestWord('facilitatte');
    assertEquals(result1, 'facilitate', 'facilitatte -> facilitate');
    console.log();

    // Test 2: teh -> the
    console.log('Test 2: "teh" should correct to "the" (common typo override)');
    const result2 = engine.findClosestWord('teh');
    assertEquals(result2, 'the', 'teh -> the');
    console.log();

    // Test 3: exact match should return itself
    console.log('Test 3: "facilitate" should return "facilitate" (exact match)');
    const result3 = engine.findClosestWord('facilitate');
    assertEquals(result3, 'facilitate', 'exact match returns itself');
    console.log();

    // Test 4: fantasticc -> fantastic
    console.log('Test 4: "fantasticc" should correct to "fantastic"');
    const result4 = engine.findClosestWord('fantasticc');
    assertEquals(result4, 'fantastic', 'fantasticc -> fantastic');
    console.log();

    // Test 5: archivall -> archival
    console.log('Test 5: "archivall" should correct to "archival"');
    const result5 = engine.findClosestWord('archivall');
    assertEquals(result5, 'archival', 'archivall -> archival');
    console.log();

    console.log('='.repeat(60));
    console.log('TEST SUITE: Incremental Typing Simulation');
    console.log('='.repeat(60) + '\n');

    // Test 6: Incremental typing "f" -> "fa" -> "fac" -> "fa" (backspace) -> "fac"
    console.log('Test 6: Simulating typing with backspaces');
    console.log('  Typing: f -> fa -> fac -> (backspace) -> fa -> fac');

    let incrementalWord = 'f';
    console.log(`  After "f": looking for correction...`);
    let incResult1 = engine.getIncrementalCorrection(incrementalWord);
    console.log(`    Result: ${incResult1 || 'no correction'}`);

    incrementalWord = 'fa';
    console.log(`  After "fa": looking for correction...`);
    let incResult2 = engine.getIncrementalCorrection(incrementalWord);
    console.log(`    Result: ${incResult2 || 'no correction'}`);

    incrementalWord = 'fac';
    console.log(`  After "fac": looking for correction...`);
    let incResult3 = engine.getIncrementalCorrection(incrementalWord);
    console.log(`    Result: ${incResult3 || 'no correction'}`);

    // Backspace simulation - reset state
    console.log(`  Backspace pressed - resetting state`);
    engine.resetIncrementalState();

    incrementalWord = 'fa';
    console.log(`  After backspace to "fa": looking for correction...`);
    let incResult4 = engine.getIncrementalCorrection(incrementalWord);
    console.log(`    Result: ${incResult4 || 'no correction'}`);

    incrementalWord = 'fac';
    console.log(`  After "fac" again: looking for correction...`);
    let incResult5 = engine.getIncrementalCorrection(incrementalWord);
    console.log(`    Result: ${incResult5 || 'no correction'}`);

    // Final check after more typing
    incrementalWord = 'facilitatte';
    console.log(`  After complete word "facilitatte": looking for correction...`);
    let incResult6 = engine.getIncrementalCorrection(incrementalWord);
    assertEquals(incResult6, 'facilitate', 'incremental typing ends with correct suggestion');
    console.log();

    console.log('='.repeat(60));
    console.log('TEST SUITE: Edge Cases');
    console.log('='.repeat(60) + '\n');

    // Test 7: Very short words
    console.log('Test 7: Single character "a" should not be corrected');
    const result7 = engine.findClosestWord('a');
    assertEquals(result7, 'a', 'single char no correction');
    console.log();

    // Test 8: Word not in dictionary, no close match
    console.log('Test 8: "xyzqwerty" should return itself (no match)');
    const result8 = engine.findClosestWord('xyzqwerty');
    assertEquals(result8, 'xyzqwerty', 'no match returns original');
    console.log();

    // Test 9: Capitalization preservation
    console.log('Test 9: "Facilitatte" should correct to "Facilitate" (preserve caps)');
    const result9 = engine.findClosestWord('Facilitatte');
    assertEquals(result9, 'Facilitate', 'capitalization preserved');
    console.log();

    console.log('='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${testsRun}`);
    console.log(`Passed: ${testsPassed} ✅`);
    console.log(`Failed: ${testsFailed} ❌`);
    console.log('='.repeat(60));

    if (testsFailed === 0) {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('\n💥 Some tests failed!');
        process.exit(1);
    }
}

// Run tests
runTests().catch(err => {
    console.error('Error running tests:', err);
    process.exit(1);
});
