#!/usr/bin/env node

const TrieDictionary = require('./TrieDictionary.js');

// Check if adjacentKeysSet is being populated
const keyboardNeighbors = {
    'o': ['i', 'p', 'l', 'k'],
    'p': ['o', 'l'],
};

// Make keyboardNeighbors global for TrieDictionary to see
global.keyboardNeighbors = keyboardNeighbors;

const trie = new TrieDictionary(0.9, ['bowl', 'bawl']);

console.log('Checking adjacentKeysSet:');
console.log('Size:', trie.adjacentKeysSet.size);
console.log('Contains "po":', trie.adjacentKeysSet.has('po'));
console.log('Contains "op":', trie.adjacentKeysSet.has('op'));
console.log('All entries:', Array.from(trie.adjacentKeysSet));
