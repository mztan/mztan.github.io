#!/usr/bin/env node

const TrieDictionary = require('./TrieDictionary.js');

// Create a minimal trie
const trie = new TrieDictionary(0.9, ['fantastic', 'facilitate', 'archival', 'the', 'test']);

console.log('Testing trie search:');
console.log('='.repeat(60));

// Test 1: fantasticc -> fantastic
console.log('\n1. Search for "fantasticc":');
const results1 = trie.search('fantasticc', 2);
console.log(`   Found ${results1.length} candidates:`, results1);

// Check if words are in trie
console.log('\n2. Check if "facilitate" is in trie:', trie.contains('facilitate'));
console.log('   Check if "archival" is in trie:', trie.contains('archival'));

// Test 2: facilitatte -> facilitate
console.log('\n3. Search for "facilitatte":');
const results2 = trie.search('facilitatte', 2);
console.log(`   Found ${results2.length} candidates:`, results2);

// Test 3: archivall -> archival
console.log('\n4. Search for "archivall":');
const results3 = trie.search('archivall', 2);
console.log(`   Found ${results3.length} candidates:`, results3);

// Test 4: exact match
console.log('\n4. Search for "fantastic" (exact):');
const results4 = trie.search('fantastic', 2);
console.log(`   Found ${results4.length} candidates:`, results4);

// Test 5: Manual edit distance check
console.log('\n5. Manual edit distance analysis:');
console.log('   "fantasticc" vs "fantastic":');
console.log('   - fantasticc has 10 chars');
console.log('   - fantastic has 9 chars');
console.log('   - difference: 1 extra "c"');
console.log('   - expected edit distance: 1 (deletion)');
console.log('   - minLength:', 10 - 2, 'maxLength:', 10 + 2);
console.log('   - "fantastic" length 9 is in range [8, 12]:', 9 >= 8 && 9 <= 12);
