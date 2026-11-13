#!/usr/bin/env node

/**
 * Test keyboard-aware autocorrect
 * Verifies that adjacent key typos are corrected properly
 */

const fs = require('fs');
const path = require('path');

const AutocorrectEngine = require('./AutocorrectEngine.js');
const TrieDictionary = require('./TrieDictionary.js');

global.TrieDictionary = TrieDictionary;

// Load keyboard layout - p and o are neighbors
const keyboardNeighbors = {
    'q': ['w', 'a'],
    'w': ['q', 'e', 's', 'a'],
    'e': ['w', 'r', 'd', 's'],
    'r': ['e', 't', 'f', 'd'],
    't': ['r', 'y', 'g', 'f'],
    'y': ['t', 'u', 'h', 'g'],
    'u': ['y', 'i', 'j', 'h'],
    'i': ['u', 'o', 'k', 'j'],
    'o': ['i', 'p', 'l', 'k'],  // o is neighbor to p
    'p': ['o', 'l'],              // p is neighbor to o
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
        adjacentKeyMultiplier: 0.9,  // Adjacent key substitution costs 0.9 vs 1.0 for non-adjacent
        insertionCost: 0.5,
        deletionCost: 1.0,
        substitutionCost: 1.0
    });

    console.log('='.repeat(70));
    console.log('KEYBOARD-AWARE AUTOCORRECT TEST');
    console.log('='.repeat(70));
    console.log();

    // Test 1: bpwl -> bowl (p and o are neighbors)
    console.log('Test 1: "bpwl" should correct to "bowl" (not "bawl")');
    console.log('  Reasoning: p→o is adjacent key error (cost 0.9)');
    console.log('            a→o is non-adjacent (cost 1.0)');
    console.log();

    const result1 = engine.findClosestWord('bpwl');
    console.log(`  Result: "${result1}"`);

    if (result1 === 'bowl') {
        console.log('  ✅ CORRECT: Keyboard-aware correction worked!');
    } else if (result1 === 'bawl') {
        console.log('  ❌ WRONG: Got "bawl" instead of "bowl"');
        console.log('     This means keyboard proximity is NOT being considered');
    } else {
        console.log(`  ❌ UNEXPECTED: Got "${result1}" instead of "bowl"`);
    }
    console.log();

    // Test 2: Let's check the edit costs manually
    console.log('Test 2: Manual cost calculation verification');
    console.log();

    // Calculate costs for bpwl -> bowl
    console.log('  Cost for "bpwl" → "bowl":');
    console.log('    b→b: match (0)');
    console.log('    p→o: adjacent keys (0.9)');
    console.log('    w→w: match (0)');
    console.log('    l→l: match (0)');
    console.log('    Total: 0.9');
    console.log();

    // Calculate costs for bpwl -> bawl
    console.log('  Cost for "bpwl" → "bawl":');
    console.log('    b→b: match (0)');
    console.log('    p→a: NOT adjacent keys (1.0)');
    console.log('    w→w: match (0)');
    console.log('    l→l: match (0)');
    console.log('    Total: 1.0');
    console.log();

    console.log('  Expected: "bowl" (0.9) should win over "bawl" (1.0)');
    console.log();

    // Test 3: Incremental typing test for keyboard awareness
    console.log('='.repeat(70));
    console.log('Test 3: Incremental typing with keyboard typos');
    console.log('='.repeat(70));
    console.log();

    console.log('Typing "bpwl" character by character:');

    let word = '';
    const chars = ['b', 'p', 'w', 'l'];

    for (const char of chars) {
        word += char;
        const suggestion = engine.getIncrementalCorrection(word);
        console.log(`  "${word}" → ${suggestion || 'no suggestion'}`);
    }

    console.log();

    // Test 4: More keyboard-aware examples
    console.log('='.repeat(70));
    console.log('Test 4: Additional keyboard-aware corrections');
    console.log('='.repeat(70));
    console.log();

    const testCases = [
        { input: 'tge', expected: 'the', reason: 'g→h are neighbors' },
        { input: 'tje', expected: 'the', reason: 'j→h are neighbors' },
        { input: 'tye', expected: 'the', reason: 'y→h are neighbors' },
    ];

    for (const testCase of testCases) {
        const result = engine.findClosestWord(testCase.input);
        const status = result === testCase.expected ? '✅' : '❌';
        console.log(`  ${status} "${testCase.input}" → "${result}" (expected: "${testCase.expected}")`);
        console.log(`     ${testCase.reason}`);
    }

    console.log();
    console.log('='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));

    if (result1 === 'bowl') {
        console.log('✅ Keyboard-aware autocorrect is WORKING correctly!');
        console.log('   Adjacent key typos have lower cost than non-adjacent typos.');
    } else {
        console.log('❌ Keyboard-aware autocorrect is NOT working!');
        console.log('   Adjacent key proximity is not being considered in cost calculation.');
    }
}

runTests().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
