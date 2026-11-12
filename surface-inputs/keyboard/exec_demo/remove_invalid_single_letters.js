const fs = require('fs');
const readline = require('readline');

const inputFile = 'hybrid_dictionary.txt';
const outputFile = 'hybrid_dictionary_filtered.txt';

const rl = readline.createInterface({
  input: fs.createReadStream(inputFile),
  crlfDelay: Infinity
});

const writeStream = fs.createWriteStream(outputFile);

let lineCount = 0;
let filteredCount = 0;
let removedCount = 0;

const validSingleLetters = new Set(['a', 'i']);

rl.on('line', (line) => {
  lineCount++;

  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  // Remove single letters except 'a' and 'i'
  if (trimmed.length === 1 && !validSingleLetters.has(trimmed)) {
    removedCount++;
    console.log(`Removing invalid single letter: "${trimmed}"`);
    return;
  }

  // Keep the line
  filteredCount++;
  writeStream.write(trimmed + '\n');
});

rl.on('close', () => {
  writeStream.end();
  console.log(`\nProcessing complete!`);
  console.log(`Total lines read: ${lineCount}`);
  console.log(`Lines written: ${filteredCount}`);
  console.log(`Lines removed: ${removedCount}`);
});

rl.on('error', (err) => {
  console.error('Error reading file:', err);
  process.exit(1);
});

writeStream.on('error', (err) => {
  console.error('Error writing file:', err);
  process.exit(1);
});
