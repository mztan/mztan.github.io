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

// Load keyboard neighbors
const keyboardLayout = require('./keyboard-layout.js');

// Create engine
const engine = new AutocorrectEngine({
    baseWords: words,
    maxEditDistance: 2,
    keyboardNeighbors: keyboardLayout
});

console.log('\n=== Debug levenshteinCost for "amise" → "camise" ===\n');

console.log('Cost breakdown:');
console.log(`  insertionCost: ${engine.insertionCost}`);
console.log(`  deletionCost: ${engine.deletionCost}`);
console.log(`  substitutionCost: ${engine.substitutionCost}`);

// Manually trace the DP matrix
const a = 'amise';
const b = 'camise';

console.log(`\nTransform "${a}" → "${b}"`);
console.log('This requires INSERT a "c" at the beginning\n');

// Check what levenshteinCost returns
const cost = engine.levenshteinCost(a, b);
console.log(`levenshteinCost result: ${cost}`);

// Trace the DP matrix manually
console.log('\nDP Matrix:');
const matrix = [];
for (let i = 0; i <= b.length; i++) {
    matrix[i] = [];
    for (let j = 0; j <= a.length; j++) {
        matrix[i][j] = 0;
    }
}

// Initialize first row and column
for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

console.log('Initial:');
console.log(`       ""  a   m   i   s   e`);
for (let i = 0; i <= b.length; i++) {
    const rowLabel = i === 0 ? '  ""  ' : `  ${b[i-1]}   `;
    console.log(rowLabel + matrix[i].map(v => v.toFixed(1)).join('  '));
}

// Fill the matrix
for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
            matrix[i][j] = matrix[i - 1][j - 1];
        } else {
            const insertionCost = engine.insertionCost;
            const deletionCost = engine.deletionCost;
            const substitutionCost = engine.substitutionCost;

            matrix[i][j] = Math.min(
                matrix[i - 1][j - 1] + substitutionCost,  // substitution
                matrix[i - 1][j] + insertionCost,          // insertion
                matrix[i][j - 1] + deletionCost            // deletion
            );
        }
    }
}

console.log('\nFinal:');
console.log(`       ""  a   m   i   s   e`);
for (let i = 0; i <= b.length; i++) {
    const rowLabel = i === 0 ? '  ""  ' : `  ${b[i-1]}   `;
    console.log(rowLabel + matrix[i].map(v => v.toFixed(1)).join('  '));
}

console.log(`\nFinal cost: ${matrix[b.length][a.length]}`);
