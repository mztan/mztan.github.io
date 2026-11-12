const fs = require('fs');
const readline = require('readline');

const inputFile = 'hybrid_dictionary.txt';

const rl = readline.createInterface({
  input: fs.createReadStream(inputFile),
  crlfDelay: Infinity
});

const shortWords = {
  1: [],
  2: [],
  3: []
};

rl.on('line', (line) => {
  const trimmed = line.trim();

  if (trimmed.length >= 1 && trimmed.length <= 3) {
    shortWords[trimmed.length].push(trimmed);
  }
});

rl.on('close', () => {
  console.log('=== 1-LETTER WORDS ===');
  console.log(`Count: ${shortWords[1].length}`);
  console.log(shortWords[1].join(', '));

  console.log('\n=== 2-LETTER WORDS ===');
  console.log(`Count: ${shortWords[2].length}`);
  console.log(shortWords[2].sort().join(', '));

  console.log('\n=== 3-LETTER WORDS ===');
  console.log(`Count: ${shortWords[3].length}`);
  console.log(shortWords[3].sort().join(', '));

  // Known valid English words for comparison
  const validOneLetterWords = new Set(['a', 'i']);

  const validTwoLetterWords = new Set([
    'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi',
    'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or',
    'so', 'to', 'up', 'us', 'we'
  ]);

  // Check for invalid 1-letter words
  console.log('\n=== INVALID 1-LETTER WORDS ===');
  const invalid1 = shortWords[1].filter(w => !validOneLetterWords.has(w));
  console.log(invalid1.length > 0 ? invalid1.join(', ') : 'None');

  // Check for suspicious 2-letter words
  console.log('\n=== SUSPICIOUS 2-LETTER WORDS (not in common list) ===');
  const suspicious2 = shortWords[2].filter(w => !validTwoLetterWords.has(w));
  console.log(`Count: ${suspicious2.length}`);
  console.log(suspicious2.join(', '));
});

rl.on('error', (err) => {
  console.error('Error reading file:', err);
  process.exit(1);
});
