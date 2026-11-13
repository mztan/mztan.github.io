#!/usr/bin/env node

/**
 * Test two-word splitting for common concatenated words
 */

const fs = require('fs');
const path = require('path');

const AutocorrectEngine = require('./AutocorrectEngine.js');
const TrieDictionary = require('./TrieDictionary.js');

global.TrieDictionary = TrieDictionary;

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

    const engine = new AutocorrectEngine({
        baseWords: dictionary,
        keyboardNeighbors: keyboardNeighbors,
        maxEditDistance: 2,
        adjacentKeyMultiplier: 0.9,
        insertionCost: 0.5,
        deletionCost: 1.0,
        substitutionCost: 1.0,
        enableWordSplitting: true  // Enable word splitting
    });

    console.log('='.repeat(70));
    console.log('TEST: Two-word splitting for concatenated words');
    console.log('='.repeat(70));
    console.log();

    const testCases = [
        // Common word pairs
        { input: 'canyou', expected: 'can you', reason: 'Common: can + you' },
        { input: 'Iam', expected: 'I am', reason: 'Common: I + am (preserve caps)' },
        { input: 'aregoing', expected: 'are going', reason: 'Common: are + going' },
        { input: 'inthe', expected: 'in the', reason: 'Common: in + the' },
        { input: 'ofthe', expected: 'of the', reason: 'Common: of + the' },
        { input: 'tothe', expected: 'to the', reason: 'Common: to + the' },
        { input: 'ifyou', expected: 'if you', reason: 'Common: if + you' },
        { input: 'doyou', expected: 'do you', reason: 'Common: do + you' },
        { input: 'willbe', expected: 'will be', reason: 'Common: will + be' },
        { input: 'canbe', expected: 'can be', reason: 'Common: can + be' },
        
        // One common + one uncommon (should still work)
        { input: 'thearchive', expected: 'the archive', reason: 'Common the + uncommon archive' },
        { input: 'withfacilitate', expected: 'with facilitate', reason: 'Common with + uncommon facilitate' },
        
        // Should NOT split - valid dictionary words
        { input: 'another', expected: 'another', reason: 'Valid word, should not split to "an other"' },
        { input: 'within', expected: 'within', reason: 'Valid word, should not split to "with in"' },
        { input: 'therefore', expected: 'therefore', reason: 'Valid word, should not split' },
        
        // Should NOT split - both words uncommon
        { input: 'archivefacilitate', expected: 'archivefacilitate', reason: 'Both uncommon, no split' },
        
        // Capitalization tests
        { input: 'CanYou', expected: 'Can You', reason: 'Preserve capitalization in split' },
        { input: 'CANYOU', expected: 'CANYOU', reason: 'All caps - skip (likely acronym)' },
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        const result = engine.findClosestWord(testCase.input);
        const status = result === testCase.expected ? '✅' : '⚠️ ';
        
        if (result === testCase.expected) {
            passed++;
            console.log(`${status} "${testCase.input}" → "${result}"`);
            console.log(`   ${testCase.reason}`);
        } else {
            failed++;
            console.log(`${status} "${testCase.input}" → "${result}" (expected: "${testCase.expected}")`);
            console.log(`   ${testCase.reason}`);
        }
        console.log();
    }

    console.log('='.repeat(70));
    console.log('PERFORMANCE TEST: Splitting should be fast');
    console.log('='.repeat(70));
    console.log();

    // Test performance - splitting should be very fast (just Set lookups)
    const perfTestWords = ['canyou', 'Iam', 'aregoing', 'inthe', 'ifyou'];
    const timings = [];

    for (const word of perfTestWords) {
        const start = performance.now();
        engine.findClosestWord(word);
        const elapsed = performance.now() - start;
        timings.push(elapsed);
        console.log(`  "${word}": ${elapsed.toFixed(3)}ms`);
    }

    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log();
    console.log(`Average time: ${avgTime.toFixed(3)}ms`);
    
    if (avgTime < 5) {
        console.log('✅ Word splitting is FAST (< 5ms average)');
    } else {
        console.log('⚠️  Word splitting is SLOW (> 5ms average)');
    }
    console.log();

    console.log('='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Passed: ${passed}/${testCases.length}`);
    console.log(`Failed: ${failed}/${testCases.length}`);
    console.log();

    if (failed === 0) {
        console.log('✅ All word splitting tests passed!');
        process.exit(0);
    } else {
        console.log(`⚠️  ${failed} tests failed - word splitting needs adjustment`);
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
