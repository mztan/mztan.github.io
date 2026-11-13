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

console.log('\n=== Verify actual costs ===\n');

const testCases = [
    ['typin', 'typing'],
    ['typin', 'typic'],
    ['typin', 'tin'],
    ['typin', 'pin'],
    ['typin', 'yin']
];

for (const [from, to] of testCases) {
    const cost = engine.levenshteinCost(from, to);
    console.log(`"${from}" → "${to}": ${cost}`);
}
