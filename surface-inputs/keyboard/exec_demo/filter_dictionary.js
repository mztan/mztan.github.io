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

rl.on('line', (line) => {
  lineCount++;

  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  // Check if line contains only letters and apostrophes
  const validPattern = /^[a-zA-Z']+$/;
  if (!validPattern.test(trimmed)) {
    return;
  }

  // Check if all letters are uppercase (acronym)
  const lettersOnly = trimmed.replace(/'/g, '');
  if (lettersOnly === lettersOnly.toUpperCase() && lettersOnly.length > 0) {
    return;
  }

  // Line passes all filters
  filteredCount++;
  writeStream.write(trimmed + '\n');
});

rl.on('close', () => {
  writeStream.end();
  console.log(`Processing complete!`);
  console.log(`Total lines read: ${lineCount}`);
  console.log(`Lines written: ${filteredCount}`);
  console.log(`Lines removed: ${lineCount - filteredCount}`);
});

rl.on('error', (err) => {
  console.error('Error reading file:', err);
  process.exit(1);
});

writeStream.on('error', (err) => {
  console.error('Error writing file:', err);
  process.exit(1);
});
