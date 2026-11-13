const AutocorrectEngine = require('./AutocorrectEngine');
const TrieDictionary = require('./TrieDictionary');
const fs = require('fs');

global.TrieDictionary = TrieDictionary;

const words = fs.readFileSync('./hybrid_dictionary.txt', 'utf8')
    .split('\n')
    .filter(w => w.length > 0);

const keyboardLayout = require('./keyboard-layout.js');

const engine = new AutocorrectEngine({
    baseWords: words,
    maxEditDistance: 2,
    keyboardNeighbors: keyboardLayout
});

console.log('\n=== Cost Configuration ===');
console.log(`  adjacentKeyMultiplier: ${engine.adjacentKeyMultiplier}`);
console.log(`  substitutionCost: ${engine.substitutionCost}`);
console.log(`  insertionCost: ${engine.insertionCost}`);
console.log(`  deletionCost: ${engine.deletionCost}`);
console.log('');

console.log('=== Edit Costs for "typin" ===');
const costTyping = engine.levenshteinCost('typin', 'typing');
const costTypic = engine.levenshteinCost('typin', 'typic');
console.log(`  typin → typing (insert g): ${costTyping}`);
console.log(`  typin → typic (substitute n→c): ${costTypic}`);
console.log('');

const correction = engine.findBestCorrectionForPart('typin');
console.log(`Correction result: "${correction}"`);
console.log(`Expected: "typing"`);
console.log(`Success: ${correction === 'typing' ? '✅' : '❌'}`);
console.log('');

console.log('=== Edit Costs for "amise" ===');
const costAmuse = engine.levenshteinCost('amise', 'amuse');
const costCamise = engine.levenshteinCost('amise', 'camise');
const costAmiss = engine.levenshteinCost('amise', 'amiss');
console.log(`  amise → amuse (substitute i→u, neighbors): ${costAmuse}`);
console.log(`  amise → camise (insert c): ${costCamise}`);
console.log(`  amise → amiss (substitute e→s): ${costAmiss}`);
console.log('');

const correction2 = engine.findBestCorrectionForPart('amise');
console.log(`Correction result: "${correction2}"`);
console.log(`Expected: "amuse" or "amiss"`);
console.log(`Success: ${(correction2 === 'amuse' || correction2 === 'amiss') ? '✅' : '❌'}`);
