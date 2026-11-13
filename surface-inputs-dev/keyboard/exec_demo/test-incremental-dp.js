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

console.log('\n=== Debug DP row computation ===\n');

// Simulate incremental typing
engine.resetIncrementalState();
engine.getIncrementalCorrection('typin');

console.log(`\nChecking DP rows for "typin":\n`);

for (const [node, data] of engine.incrementalState.candidates) {
    if (node.word && ['typing', 'typic', 'tin', 'pin', 'yin'].includes(node.word)) {
        const row = Array.from(data.row);
        const finalDist = row[row.length - 1];
        console.log(`Word: "${node.word}"`);
        console.log(`  DP row: [${row.join(', ')}]`);
        console.log(`  Final distance: ${finalDist}`);
        console.log(`  Word length: ${node.word.length}`);
        console.log(`  Input length: 5 (typin)`);
        console.log('');
    }
}
