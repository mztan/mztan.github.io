/**
 * Test file to debug why "caninical" is not being corrected to "canonical"
 */

const fs = require('fs');
const AutocorrectEngine = require('./AutocorrectEngine.js');
const TrieDictionary = require('./TrieDictionary.js');

// Make TrieDictionary available globally
global.TrieDictionary = TrieDictionary;

// Load dictionary
const dictionaryPath = './hybrid_dictionary.txt';
const words = fs.readFileSync(dictionaryPath, 'utf8')
    .split('\n')
    .map(word => word.trim().toLowerCase())
    .filter(word => word.length > 0);

console.log(`Loaded ${words.length} words from hybrid dictionary\n`);

// Create autocorrect engine
const engine = new AutocorrectEngine({
    baseWords: words,
    maxEditDistance: 2,
    keyboardNeighbors: {}  // No keyboard neighbors for this test
});

console.log('='.repeat(60));
console.log('Testing: "caninical" -> "canonical"');
console.log('='.repeat(60));

const testWord = 'caninical';
const expectedCorrection = 'canonical';

// Check if both words are in dictionary
console.log(`\n1. Dictionary Check:`);
console.log(`   - Is "caninical" in dictionary? ${engine.hasWord(testWord)}`);
console.log(`   - Is "canonical" in dictionary? ${engine.hasWord(expectedCorrection)}`);

// Check length difference constraint
console.log(`\n2. Length Check:`);
console.log(`   - "caninical" length: ${testWord.length}`);
console.log(`   - "canonical" length: ${expectedCorrection.length}`);
console.log(`   - Length difference: ${Math.abs(testWord.length - expectedCorrection.length)}`);
console.log(`   - Is length difference acceptable? ${engine.isLengthDifferenceAcceptable(testWord, expectedCorrection)}`);

// Calculate edit distance
console.log(`\n3. Edit Distance:`);
const cost = engine.levenshteinCost(testWord, expectedCorrection);
console.log(`   - Edit distance: ${cost}`);
console.log(`   - Max edit distance allowed: ${engine.maxEditDistance}`);
console.log(`   - Within threshold? ${cost <= engine.maxEditDistance}`);

// Test TrieDictionary search
console.log(`\n4. TrieDictionary Search:`);
if (engine.trieDictionary) {
    // Check if canonical exists in the trie
    const hasCanonicalInTrie = engine.trieDictionary.contains(expectedCorrection);
    console.log(`   - Is "canonical" in TrieDictionary? ${hasCanonicalInTrie}`);

    const candidates = engine.trieDictionary.search(testWord, engine.maxEditDistance);
    console.log(`   - Found ${candidates.length} candidates`);

    // Check if "canonical" is in the candidates
    const canonicalCandidate = candidates.find(c => c.word === expectedCorrection);
    if (canonicalCandidate) {
        console.log(`   ✅ "canonical" IS in candidates`);
    } else {
        console.log(`   ❌ "canonical" is NOT in candidates`);
        console.log(`   - Top 10 candidates:`);
        candidates.slice(0, 10).forEach((c, i) => {
            const dist = engine.levenshteinCost(testWord, c.word);
            console.log(`     ${i + 1}. "${c.word}" (cost: ${dist})`);
        });
    }

    // Let's try searching with a higher edit distance to see if canonical shows up
    console.log(`\n   Testing with different edit distances:`);
    for (let dist = 1; dist <= 5; dist++) {
        const testCandidates = engine.trieDictionary.search(testWord, dist);
        const hasCanonical = testCandidates.some(c => c.word === expectedCorrection);
        console.log(`   - Edit distance ${dist}: ${testCandidates.length} candidates, has canonical? ${hasCanonical ? '✅' : '❌'}`);
    }
} else {
    console.log(`   - TrieDictionary not available`);
}

// Test the actual correction
console.log(`\n5. Actual Correction:`);
const correction = engine.findClosestWord(testWord);
console.log(`   - Result: "${testWord}" -> "${correction}"`);
console.log(`   - Expected: "${expectedCorrection}"`);
console.log(`   - Match? ${correction.toLowerCase() === expectedCorrection ? '✅ YES' : '❌ NO'}`);

// Let's manually check what happens in findBestCorrectionForPart
console.log(`\n6. Manual Debug of findBestCorrectionForPart:`);
const manualResult = engine.findBestCorrectionForPart(testWord);
console.log(`   - Result: "${manualResult}"`);

console.log('\n' + '='.repeat(60));
console.log('Summary:');
console.log('='.repeat(60));
if (correction.toLowerCase() === expectedCorrection) {
    console.log('✅ PASS: Autocorrection is working correctly');
} else {
    console.log('❌ FAIL: Autocorrection is NOT working');
    console.log(`   Expected: "${expectedCorrection}"`);
    console.log(`   Got: "${correction}"`);
}
console.log('='.repeat(60));
