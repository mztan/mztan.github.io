const AutocorrectEngine = require('./AutocorrectEngine');
const TrieDictionary = require('./TrieDictionary');
const fs = require('fs');

// Make TrieDictionary globally available
global.TrieDictionary = TrieDictionary;

// Load dictionary
const dictionaryPath = './hybrid_dictionary.txt';
const words = fs.readFileSync(dictionaryPath, 'utf8')
    .split('\n')
    .filter(word => word.length > 0);

// Create engine with default settings
const engine = new AutocorrectEngine({
    baseWords: words,
    maxEditDistance: 2
});

console.log('\n=== Testing "typin" correction ===\n');

const testWord = 'typin';
console.log(`Input: "${testWord}"\n`);

// Test with findBestCorrectionForPart (uses levenshteinCost)
const correction1 = engine.findBestCorrectionForPart(testWord);
console.log(`findBestCorrectionForPart: "${correction1}"`);

// Calculate costs manually
const costToTyping = engine.levenshteinCost(testWord, 'typing');
const costToTypic = engine.levenshteinCost(testWord, 'typic');

console.log(`\nCost from "${testWord}" to "typing": ${costToTyping}`);
console.log(`Cost from "${testWord}" to "typic": ${costToTypic}`);

// Get frequency scores
const freqTyping = engine.getWordFrequencyScore('typing');
const freqTypic = engine.getWordFrequencyScore('typic');

console.log(`\nFrequency score for "typing": ${freqTyping}`);
console.log(`Frequency score for "typic": ${freqTypic}`);

// Test with incremental correction
engine.resetIncrementalState();
const correction2 = engine.getIncrementalCorrection(testWord);
console.log(`\ngetIncrementalCorrection: "${correction2}"`);

// Check if both words are in dictionary
console.log(`\n"typing" in dictionary: ${engine.hasWord('typing')}`);
console.log(`"typic" in dictionary: ${engine.hasWord('typic')}`);
