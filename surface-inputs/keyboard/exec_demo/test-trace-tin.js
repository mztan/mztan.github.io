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

console.log('\n=== Manually trace DP for "typin" → "tin" ===\n');

// Manually compute what the DP should be
const input = "typin";
const dict = "tin";

// Use levenshteinCost to get the correct answer
const correctCost = engine.levenshteinCost(input, dict);
console.log(`Correct cost from levenshteinCost: ${correctCost}\n`);

// Now manually trace what the incremental DP should compute
console.log(`Tracing incremental DP:`);
console.log(`Input: "${input}" (length ${input.length})`);
console.log(`Dictionary: "${dict}" (length ${dict.length})\n`);

// Initial row (before any dict chars)
const row0 = [0, 1, 2, 3, 4, 5];  // Cost to delete 0..5 chars from input
console.log(`Initial row (depth 0): [${row0}]`);

// After 't' (depth 1)
let lastRow = row0;
console.log(`\n--- Following 't' (dict char 0) ---`);
const row1 = [0.5];  // cost to insert 't'
for (let i = 1; i <= input.length; i++) {
    const inputChar = input[i-1];
    const insertCost = 0.5 + row1[i-1];  // insert 't'
    const deleteCost = 1.0 + lastRow[i];  // delete input[i-1]
    const replaceCost = lastRow[i-1] + (inputChar === 't' ? 0 : 1.0);
    row1[i] = Math.min(insertCost, deleteCost, replaceCost);
    console.log(`  row1[${i}] (transform "${input.substring(0,i)}" to "t"): min(insert=${insertCost}, delete=${deleteCost}, replace=${replaceCost}) = ${row1[i]}`);
}
console.log(`Row after 't': [${row1}]`);

// After 'i' (depth 2)
lastRow = row1;
console.log(`\n--- Following 'i' (dict char 1) ---`);
const row2 = [1.0];  // cost to insert 't' + 'i'
for (let i = 1; i <= input.length; i++) {
    const inputChar = input[i-1];
    const insertCost = 0.5 + row2[i-1];  // insert 'i'
    const deleteCost = 1.0 + lastRow[i];  // delete input[i-1]
    const replaceCost = lastRow[i-1] + (inputChar === 'i' ? 0 : 1.0);
    row2[i] = Math.min(insertCost, deleteCost, replaceCost);
    console.log(`  row2[${i}] (transform "${input.substring(0,i)}" to "ti"): min(insert=${insertCost}, delete=${deleteCost}, replace=${replaceCost}) = ${row2[i]}`);
}
console.log(`Row after 'i': [${row2}]`);

// After 'n' (depth 3)
lastRow = row2;
console.log(`\n--- Following 'n' (dict char 2) ---`);
const row3 = [1.5];  // cost to insert 't' + 'i' + 'n'
for (let i = 1; i <= input.length; i++) {
    const inputChar = input[i-1];
    const insertCost = 0.5 + row3[i-1];  // insert 'n'
    const deleteCost = 1.0 + lastRow[i];  // delete input[i-1]
    const replaceCost = lastRow[i-1] + (inputChar === 'n' ? 0 : 1.0);
    row3[i] = Math.min(insertCost, deleteCost, replaceCost);
    console.log(`  row3[${i}] (transform "${input.substring(0,i)}" to "tin"): min(insert=${insertCost}, delete=${deleteCost}, replace=${replaceCost}) = ${row3[i]}`);
}
console.log(`Row after 'n': [${row3}]`);

console.log(`\n✅ Expected final cost: ${row3[input.length]}`);
console.log(`✅ Actual levenshteinCost: ${correctCost}`);

// Now compare with what the incremental DP actually produces
engine.resetIncrementalState();
engine.getIncrementalCorrection(input);

for (const [node, data] of engine.incrementalState.candidates) {
    if (node.word === dict) {
        const actualRow = Array.from(data.row);
        console.log(`\n❌ Incremental DP produced: [${actualRow}]`);
        console.log(`❌ Final cost from incremental: ${actualRow[actualRow.length-1]}`);
        break;
    }
}
