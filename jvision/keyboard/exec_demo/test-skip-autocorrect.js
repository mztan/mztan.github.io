#!/usr/bin/env node

/**
 * Test that autocorrect skips numbers, symbols, and all-caps words
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
        substitutionCost: 1.0
    });

    console.log('='.repeat(70));
    console.log('TEST: Skip autocorrect for special cases');
    console.log('='.repeat(70));
    console.log();

    const testCases = [
        // Numbers
        { input: '123', expected: '123', reason: 'Pure number' },
        { input: '3.14', expected: '3.14', reason: 'Decimal number' },
        { input: '2024', expected: '2024', reason: 'Year' },

        // All-caps (acronyms)
        { input: 'NASA', expected: 'NASA', reason: 'All-caps acronym' },
        { input: 'FBI', expected: 'FBI', reason: 'All-caps acronym' },
        { input: 'USA', expected: 'USA', reason: 'All-caps acronym' },
        { input: 'ASAP', expected: 'ASAP', reason: 'All-caps acronym' },
        { input: 'HTTP', expected: 'HTTP', reason: 'All-caps protocol' },
        { input: 'API', expected: 'API', reason: 'All-caps tech term' },

        // Mixed with symbols
        { input: '$100', expected: '$100', reason: 'Currency symbol' },
        { input: '@username', expected: '@username', reason: 'Social handle' },
        { input: '#hashtag', expected: '#hashtag', reason: 'Hashtag' },
        { input: 'user@email.com', expected: 'user@email.com', reason: 'Email' },

        // Edge cases that SHOULD be corrected
        { input: 'teh', expected: 'the', reason: 'Lowercase typo should correct' },
        { input: 'Teh', expected: 'The', reason: 'Capitalized typo should correct' },
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        const result = engine.findClosestWord(testCase.input);
        const status = result === testCase.expected ? '✅' : '❌';

        if (result === testCase.expected) {
            passed++;
            console.log(`${status} "${testCase.input}" → "${result}"`);
            console.log(`   ${testCase.reason}`);
        } else {
            failed++;
            console.log(`${status} "${testCase.input}" → "${result}" (expected: "${testCase.expected}")`);
            console.log(`   ${testCase.reason}`);
            console.log(`   ⚠️  AUTOCORRECT SHOULD BE SKIPPED!`);
        }
        console.log();
    }

    console.log('='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Passed: ${passed}/${testCases.length}`);
    console.log(`Failed: ${failed}/${testCases.length}`);
    console.log();

    if (failed === 0) {
        console.log('✅ All special cases are handled correctly!');
        process.exit(0);
    } else {
        console.log('❌ Some special cases need to be handled!');
        console.log('   We need to add checks to skip autocorrect for:');
        console.log('   - Numbers (pure digits, decimals)');
        console.log('   - All-caps words (acronyms)');
        console.log('   - Words with symbols (@, #, $, etc.)');
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
