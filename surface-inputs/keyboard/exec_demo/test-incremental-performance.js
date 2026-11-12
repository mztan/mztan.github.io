#!/usr/bin/env node

/**
 * Test incremental autocorrect performance
 * Measures if typing character-by-character is actually incremental
 */

const fs = require('fs');
const path = require('path');

const AutocorrectEngine = require('./AutocorrectEngine.js');
const TrieDictionary = require('./TrieDictionary.js');

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

async function loadDictionary() {
    const dictPath = path.join(__dirname, 'hybrid_dictionary.txt');
    const content = fs.readFileSync(dictPath, 'utf-8');
    return content.split('\n')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0);
}

async function runPerformanceTests() {
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
    console.log('INCREMENTAL TYPING PERFORMANCE TEST');
    console.log('='.repeat(70));
    console.log();

    // Test typing "archival" character by character
    const word = "arcival"; // typo: should be "archival"
    const timings = [];
    let currentWord = '';

    console.log(`Typing "${word}" character by character to get "archival":\n`);

    for (let i = 0; i < word.length; i++) {
        currentWord += word[i];

        const start = performance.now();
        const suggestion = engine.getIncrementalCorrection(currentWord);
        const elapsed = performance.now() - start;

        timings.push(elapsed);

        console.log(`  [${i + 1}] "${currentWord}" → ${suggestion || 'no suggestion'} (${elapsed.toFixed(3)}ms)`);
    }

    console.log();
    console.log('─'.repeat(70));
    console.log('TIMING ANALYSIS:');
    console.log('─'.repeat(70));
    console.log(`Total time: ${timings.reduce((a, b) => a + b, 0).toFixed(3)}ms`);
    console.log(`Average per keystroke: ${(timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(3)}ms`);
    console.log(`Min: ${Math.min(...timings).toFixed(3)}ms`);
    console.log(`Max: ${Math.max(...timings).toFixed(3)}ms`);
    console.log();

    // Check if timing is truly incremental (should get faster or stay flat, not slower)
    console.log('📊 Timing progression:');
    for (let i = 0; i < timings.length; i++) {
        const bar = '█'.repeat(Math.round(timings[i] / 2));
        console.log(`  ${i + 1}: ${bar} ${timings[i].toFixed(2)}ms`);
    }
    console.log();

    // Expectation: If truly incremental, later characters should be FASTER
    // because we're pruning the candidate set
    // If NOT incremental, times will stay roughly constant or increase
    console.log('💡 ANALYSIS:');
    const firstHalf = timings.slice(0, Math.floor(timings.length / 2));
    const secondHalf = timings.slice(Math.floor(timings.length / 2));
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    console.log(`   First half avg: ${avgFirst.toFixed(3)}ms`);
    console.log(`   Second half avg: ${avgSecond.toFixed(3)}ms`);

    if (avgSecond < avgFirst * 0.8) {
        console.log('   ✅ INCREMENTAL: Later keystrokes are significantly faster');
    } else if (avgSecond > avgFirst * 1.2) {
        console.log('   ⚠️  NON-INCREMENTAL: Later keystrokes are SLOWER (full search each time)');
    } else {
        console.log('   ⚠️  UNCLEAR: Times are similar (likely doing full search with efficient pruning)');
    }
    console.log();

    // Now test with state reset to see if it matters
    console.log('='.repeat(70));
    console.log('TEST: Does resetIncrementalState() affect performance?');
    console.log('='.repeat(70));
    console.log();

    // Warm up
    engine.getIncrementalCorrection('facilitatte');

    // Test 1: Without reset (supposedly "incremental")
    const t1 = performance.now();
    engine.getIncrementalCorrection('f');
    engine.getIncrementalCorrection('fa');
    engine.getIncrementalCorrection('fac');
    engine.getIncrementalCorrection('faci');
    engine.getIncrementalCorrection('facil');
    const elapsed1 = performance.now() - t1;

    // Test 2: With reset each time (definitely NOT incremental)
    const t2 = performance.now();
    engine.resetIncrementalState();
    engine.getIncrementalCorrection('f');
    engine.resetIncrementalState();
    engine.getIncrementalCorrection('fa');
    engine.resetIncrementalState();
    engine.getIncrementalCorrection('fac');
    engine.resetIncrementalState();
    engine.getIncrementalCorrection('faci');
    engine.resetIncrementalState();
    engine.getIncrementalCorrection('facil');
    const elapsed2 = performance.now() - t2;

    console.log(`Without reset: ${elapsed1.toFixed(3)}ms`);
    console.log(`With reset:    ${elapsed2.toFixed(3)}ms`);
    console.log(`Difference:    ${(elapsed2 - elapsed1).toFixed(3)}ms (${((elapsed2 / elapsed1 - 1) * 100).toFixed(1)}% slower)`);
    console.log();

    if (Math.abs(elapsed2 - elapsed1) < 1) {
        console.log('❌ PROBLEM: Reset makes NO DIFFERENCE!');
        console.log('   This means getIncrementalCorrection() is NOT using incremental state.');
        console.log('   It\'s doing a full trie search from root on every call.');
    } else {
        console.log('✅ Reset makes a difference - incremental state is being used.');
    }
    console.log();
}

runPerformanceTests().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
