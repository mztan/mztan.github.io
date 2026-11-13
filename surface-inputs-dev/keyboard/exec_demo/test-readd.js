const fs = require('fs');
const path = require('path');
const AutocorrectEngine = require('./AutocorrectEngine');
const TrieDictionary = require('./TrieDictionary');

global.TrieDictionary = TrieDictionary;

async function loadDictionary() {
  const dictPath = path.join(__dirname, 'hybrid_dictionary.txt');
  const content = fs.readFileSync(dictPath, 'utf-8');
  return content.split('\n')
    .map(word => word.trim().toLowerCase())
    .filter(word => word.length > 0);
}

async function testReadd() {
  console.log('Testing "readd" autocorrect behavior...\n');

  const dictionary = await loadDictionary();
  const engine = new AutocorrectEngine({
    baseWords: dictionary,
    keyboardNeighbors: {},
    maxEditDistance: 2,
    enableWordSplitting: true
  });

  const testWords = ['readd', 'Readd', 'READD', 'readded', 'reading'];

  for (const word of testWords) {
    const hasWord = engine.hasWord(word.toLowerCase());
    const correction = engine.findClosestWord(word);

    console.log(`Word: "${word}"`);
    console.log(`  In dictionary: ${hasWord}`);
    console.log(`  Correction: "${correction}"`);
    console.log(`  Was corrected: ${correction !== word}`);
    console.log();
  }

  console.log('Testing word splitting for "readd":');
  const split = engine.findTwoWordSplit('readd');
  console.log(`  Split result:`, split);

  console.log('\nChecking individual words:');
  console.log('  hasWord("re"):', engine.hasWord('re'));
  console.log('  hasWord("add"):', engine.hasWord('add'));
  console.log('  "re" is common:', engine.veryCommonWords.has('re'));
  console.log('  "add" is common:', engine.veryCommonWords.has('add'));
}

testReadd().catch(console.error);
