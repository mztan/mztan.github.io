#!/usr/bin/env node

/**
 * Quick test for "Iam" -> "I am" splitting
 */

const fs = require('fs');
const path = require('path');

const AutocorrectEngine = require('./AutocorrectEngine.js');
const TrieDictionary = require('./TrieDictionary.js');

global.TrieDictionary = TrieDictionary;

async function loadDictionary() {
    const dictPath = path.join(__dirname, 'hybrid_dictionary.txt');
    const content = fs.readFileSync(dictPath, 'utf-8');
    return content.split('\n')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0);
}

async function test() {
    const dictionary = await loadDictionary();
    
    const engine = new AutocorrectEngine({
        baseWords: dictionary,
        keyboardNeighbors: {},
        maxEditDistance: 2,
        enableWordSplitting: true
    });

    console.log('Dictionary has "i":', engine.hasWord('i'));
    console.log('Dictionary has "am":', engine.hasWord('am'));
    console.log('veryCommonWords has "i":', engine.veryCommonWords.has('i'));
    console.log('veryCommonWords has "am":', engine.veryCommonWords.has('am'));
    
    console.log('\nTrying split for "iam":');
    console.log('hasWord("iam"):', engine.hasWord('iam'));
    
    // Manual check of what split should find
    console.log('\nManual split check:');
    console.log('  i=1: "i" + "am"');
    console.log('    hasWord("i"):', engine.hasWord('i'));
    console.log('    hasWord("am"):', engine.hasWord('am'));
    console.log('    "i" is common:', engine.veryCommonWords.has('i'));
    console.log('    "am" is common:', engine.veryCommonWords.has('am'));
    
    const split = engine.findTwoWordSplit('Iam');
    console.log('\nSplit result:', split);
    
    console.log('\nFull correction:');
    const result = engine.findClosestWord('Iam');
    console.log('"Iam" ->', result);
    console.log('Expected: "I am"');
    console.log('Success:', result === 'I am');
}

test().catch(console.error);
