const fs = require('fs');
const readline = require('readline');

const inputFile = 'hybrid_dictionary.txt';
const outputFile = 'hybrid_dictionary_cleaned.txt';

// Valid 1-letter English words
const valid1Letter = new Set(['a', 'i']);

// Valid 2-letter English words (common and accepted)
const valid2Letter = new Set([
  'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi',
  'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or',
  'so', 'to', 'up', 'us', 'we', 'oh', 'ah', 'uh', 'eh', 'ox',
  'ax', 'ex'
]);

// Valid 3-letter English words (comprehensive list of common words)
const valid3Letter = new Set([
  'aah', 'aba', 'abs', 'aby', 'ace', 'act', 'add', 'ado', 'ads', 'adz',
  'aff', 'aft', 'aga', 'age', 'ago', 'aha', 'aid', 'ail', 'aim', 'air',
  'ais', 'ait', 'ala', 'alb', 'ale', 'all', 'alp', 'als', 'alt', 'ama',
  'ami', 'amp', 'amu', 'ana', 'and', 'ane', 'ani', 'ant', 'any', 'ape',
  'apo', 'app', 'apt', 'arb', 'arc', 'are', 'arf', 'ark', 'arm', 'ars',
  'art', 'ash', 'ask', 'asp', 'ass', 'ate', 'att', 'auk', 'ava', 'ave',
  'avo', 'awa', 'awe', 'awl', 'awn', 'axe', 'aye', 'azo', 'baa', 'bad',
  'bag', 'bah', 'bal', 'bam', 'ban', 'bap', 'bar', 'bas', 'bat', 'bay',
  'bed', 'bee', 'beg', 'bel', 'ben', 'bes', 'bet', 'bey', 'bib', 'bid',
  'big', 'bin', 'bio', 'bis', 'bit', 'biz', 'boa', 'bob', 'bod', 'bog',
  'boo', 'bop', 'bos', 'bot', 'bow', 'box', 'boy', 'bra', 'bro', 'brr',
  'bub', 'bud', 'bug', 'bum', 'bun', 'bur', 'bus', 'but', 'buy', 'bye',
  'bys', 'cab', 'cad', 'cam', 'can', 'cap', 'car', 'cat', 'caw', 'cay',
  'cee', 'cel', 'cep', 'chi', 'cig', 'cob', 'cod', 'cog', 'col', 'con',
  'coo', 'cop', 'cor', 'cos', 'cot', 'cow', 'cox', 'coy', 'coz', 'cry',
  'cub', 'cud', 'cue', 'cum', 'cup', 'cur', 'cut', 'cwm', 'dab', 'dad',
  'dag', 'dah', 'dak', 'dal', 'dam', 'dan', 'dap', 'daw', 'day', 'deb',
  'dee', 'den', 'dev', 'dew', 'dex', 'dey', 'dib', 'did', 'die', 'dig',
  'dim', 'din', 'dip', 'dis', 'dit', 'doc', 'doe', 'dog', 'dol', 'dom',
  'don', 'dor', 'dos', 'dot', 'dow', 'dry', 'dub', 'dud', 'due', 'dug',
  'duh', 'dui', 'dun', 'duo', 'dup', 'dye', 'ear', 'eat', 'ebb', 'edh',
  'eds', 'eel', 'eff', 'efs', 'eft', 'egg', 'ego', 'eke', 'eld', 'elf',
  'elk', 'ell', 'elm', 'els', 'eme', 'emo', 'ems', 'emu', 'end', 'eng',
  'ens', 'eon', 'era', 'ere', 'erg', 'ern', 'err', 'ers', 'ess', 'eta',
  'eth', 'eve', 'ewe', 'eye', 'fab', 'fad', 'fag', 'fan', 'far', 'fas',
  'fat', 'fax', 'fay', 'fez', 'fib', 'fid', 'fie', 'fig', 'fil', 'fin',
  'fir', 'fit', 'fix', 'fiz', 'flu', 'fly', 'fob', 'foe', 'fog', 'foh',
  'fon', 'foo', 'fop', 'for', 'fox', 'foy', 'fro', 'fry', 'fub', 'fud',
  'fug', 'fun', 'fur', 'gab', 'gad', 'gag', 'gal', 'gam', 'gap', 'gar',
  'gas', 'gat', 'gay', 'ged', 'gee', 'gel', 'gem', 'gen', 'get', 'ghi',
  'gib', 'gid', 'gie', 'gig', 'gin', 'git', 'gnu', 'goa', 'gob', 'god',
  'goo', 'gor', 'gos', 'got', 'gox', 'goy', 'gul', 'gum', 'gun', 'gut',
  'guv', 'guy', 'gym', 'gyp', 'had', 'hae', 'hag', 'hah', 'haj', 'ham',
  'hao', 'hap', 'has', 'hat', 'haw', 'hay', 'hem', 'hen', 'hep', 'her',
  'hes', 'het', 'hew', 'hex', 'hey', 'hic', 'hid', 'hie', 'him', 'hin',
  'hip', 'his', 'hit', 'hmm', 'hob', 'hod', 'hoe', 'hog', 'hom', 'hon',
  'hoo', 'hop', 'hot', 'how', 'hoy', 'hub', 'hue', 'hug', 'huh', 'hum',
  'hun', 'hup', 'hut', 'hyp', 'ice', 'ich', 'ick', 'icy', 'ids', 'iff',
  'ifs', 'igg', 'ilk', 'ill', 'imp', 'ink', 'inn', 'ins', 'ion', 'ire',
  'irk', 'ism', 'its', 'ivy', 'jab', 'jag', 'jam', 'jar', 'jaw', 'jay',
  'jee', 'jet', 'jeu', 'jib', 'jig', 'jin', 'job', 'joe', 'jog', 'jot',
  'jow', 'joy', 'jug', 'jun', 'jus', 'jut', 'kab', 'kae', 'kaf', 'kas',
  'kat', 'kay', 'kea', 'kef', 'keg', 'ken', 'kep', 'key', 'khi', 'kid',
  'kif', 'kin', 'kip', 'kir', 'kis', 'kit', 'koa', 'kob', 'koi', 'kop',
  'kor', 'kos', 'kue', 'lab', 'lac', 'lad', 'lag', 'lam', 'lap', 'lar',
  'las', 'lat', 'lav', 'law', 'lax', 'lay', 'lea', 'led', 'lee', 'leg',
  'lei', 'lek', 'let', 'leu', 'lev', 'ley', 'lez', 'lib', 'lid', 'lie',
  'lin', 'lip', 'lis', 'lit', 'lob', 'log', 'loo', 'lop', 'lot', 'low',
  'lox', 'lug', 'lum', 'luv', 'lux', 'lye', 'mac', 'mad', 'mae', 'mag',
  'man', 'map', 'mar', 'mas', 'mat', 'maw', 'max', 'may', 'med', 'mel',
  'mem', 'men', 'met', 'mew', 'mho', 'mib', 'mid', 'mig', 'mil', 'mim',
  'mir', 'mis', 'mix', 'moa', 'mob', 'mod', 'mog', 'mom', 'mon', 'moo',
  'mop', 'mor', 'mos', 'mot', 'mow', 'mud', 'mug', 'mum', 'mun', 'mus',
  'mut', 'nab', 'nae', 'nag', 'nah', 'nam', 'nan', 'nap', 'naw', 'nay',
  'neb', 'nee', 'neg', 'net', 'new', 'nib', 'nil', 'nim', 'nip', 'nit',
  'nix', 'nob', 'nod', 'nog', 'nom', 'noo', 'nor', 'nos', 'not', 'now',
  'nth', 'nub', 'nun', 'nut', 'oak', 'oaf', 'oar', 'oat', 'obe', 'obi',
  'oca', 'och', 'oda', 'odd', 'ode', 'ods', 'oes', 'off', 'oft', 'ohm',
  'oho', 'ohs', 'oil', 'oka', 'oke', 'old', 'ole', 'oms', 'one', 'ono',
  'ons', 'ooh', 'oot', 'ope', 'ops', 'opt', 'ora', 'orb', 'orc', 'ore',
  'ors', 'ort', 'ose', 'oud', 'our', 'out', 'ova', 'owe', 'owl', 'own',
  'owt', 'oxo', 'oxy', 'pac', 'pad', 'pah', 'pal', 'pam', 'pan', 'pap',
  'par', 'pas', 'pat', 'paw', 'pax', 'pay', 'pea', 'pec', 'ped', 'pee',
  'peg', 'peh', 'pen', 'pep', 'per', 'pes', 'pet', 'pew', 'phi', 'pho',
  'pht', 'pia', 'pic', 'pie', 'pig', 'pin', 'pip', 'pis', 'pit', 'piu',
  'pix', 'ply', 'pod', 'poh', 'poi', 'pol', 'pom', 'poo', 'pop', 'pot',
  'pow', 'pox', 'poz', 'pro', 'pry', 'psi', 'pst', 'pub', 'pud', 'pug',
  'pul', 'pun', 'pup', 'pur', 'pus', 'put', 'pya', 'pye', 'pyx', 'qat',
  'qis', 'qua', 'rad', 'rag', 'rah', 'rai', 'raj', 'ram', 'ran', 'rap',
  'ras', 'rat', 'raw', 'rax', 'ray', 'reb', 'rec', 'red', 'ree', 'ref',
  'reg', 'rei', 'rem', 'rep', 'res', 'ret', 'rev', 'rex', 'rho', 'ria',
  'rib', 'rid', 'rif', 'rig', 'rim', 'rin', 'rip', 'rob', 'roc', 'rod',
  'roe', 'rom', 'roo', 'rot', 'row', 'rub', 'rue', 'rug', 'rum', 'run',
  'rut', 'rya', 'rye', 'sab', 'sac', 'sad', 'sae', 'sag', 'sal', 'sap',
  'sat', 'sau', 'saw', 'sax', 'say', 'sea', 'sec', 'see', 'seg', 'sei',
  'sel', 'sen', 'ser', 'set', 'sew', 'sex', 'sha', 'she', 'shh', 'shy',
  'sib', 'sic', 'sim', 'sin', 'sip', 'sir', 'sis', 'sit', 'six', 'ska',
  'ski', 'sky', 'sly', 'sob', 'sod', 'sol', 'som', 'son', 'sop', 'sos',
  'sot', 'sou', 'sow', 'sox', 'soy', 'spa', 'spy', 'sri', 'sty', 'sub',
  'sue', 'sum', 'sun', 'sup', 'suq', 'syn', 'tab', 'tad', 'tae', 'tag',
  'taj', 'tam', 'tan', 'tao', 'tap', 'tar', 'tas', 'tat', 'tau', 'tav',
  'taw', 'tax', 'tea', 'ted', 'tee', 'teg', 'tel', 'ten', 'tet', 'tew',
  'the', 'tho', 'thy', 'tic', 'tie', 'tig', 'til', 'tin', 'tip', 'tis',
  'tit', 'tod', 'toe', 'tog', 'tom', 'ton', 'too', 'top', 'tor', 'tot',
  'tow', 'toy', 'try', 'tsk', 'tub', 'tug', 'tui', 'tum', 'tun', 'tup',
  'tut', 'tux', 'twa', 'two', 'tye', 'udo', 'ugh', 'ugs', 'uke', 'ulu',
  'umm', 'ump', 'ums', 'uni', 'uns', 'upo', 'ups', 'urb', 'urd', 'urn',
  'urp', 'urs', 'use', 'uta', 'ute', 'uts', 'vac', 'van', 'var', 'vas',
  'vat', 'vau', 'vav', 'vaw', 'vee', 'veg', 'vet', 'vex', 'via', 'vid',
  'vie', 'vig', 'vim', 'vis', 'voe', 'vow', 'vox', 'vug', 'vum', 'wab',
  'wad', 'wae', 'wag', 'wan', 'wap', 'war', 'was', 'wat', 'waw', 'wax',
  'way', 'web', 'wed', 'wee', 'wen', 'wet', 'wha', 'who', 'why', 'wig',
  'win', 'wis', 'wit', 'wiz', 'woe', 'wok', 'won', 'woo', 'wop', 'wos',
  'wot', 'wow', 'wry', 'wud', 'wye', 'wyn', 'xis', 'yah', 'yak', 'yam',
  'yap', 'yar', 'yaw', 'yay', 'yea', 'yeh', 'yen', 'yep', 'yes', 'yet',
  'yew', 'yid', 'yin', 'yip', 'yob', 'yod', 'yok', 'yom', 'yon', 'you',
  'yow', 'yuk', 'yum', 'yup', 'zag', 'zap', 'zas', 'zax', 'zed', 'zee',
  'zek', 'zen', 'zep', 'zig', 'zin', 'zip', 'zit', 'zoa', 'zoo', 'zuz',
  'zzz'
]);

const rl = readline.createInterface({
  input: fs.createReadStream(inputFile),
  crlfDelay: Infinity
});

const writeStream = fs.createWriteStream(outputFile);

let lineCount = 0;
let keptCount = 0;
let removedCount = 0;

rl.on('line', (line) => {
  lineCount++;

  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  const len = trimmed.length;

  // Check if word should be removed
  let shouldRemove = false;

  if (len === 1) {
    shouldRemove = !valid1Letter.has(trimmed);
  } else if (len === 2) {
    shouldRemove = !valid2Letter.has(trimmed);
  } else if (len === 3) {
    // Remove if:
    // 1. Not in valid list
    // 2. Contains uppercase (proper nouns, abbreviations)
    // 3. Contains apostrophes (contractions handled separately)
    if (trimmed !== trimmed.toLowerCase()) {
      shouldRemove = true;
    } else if (!valid3Letter.has(trimmed)) {
      shouldRemove = true;
    }
  }

  if (shouldRemove) {
    removedCount++;
    if (removedCount <= 50) {
      console.log(`Removing: "${trimmed}"`);
    }
    return;
  }

  // Keep the line
  keptCount++;
  writeStream.write(trimmed + '\n');
});

rl.on('close', () => {
  writeStream.end();
  console.log(`\n=== Processing Complete ===`);
  console.log(`Total lines read: ${lineCount}`);
  console.log(`Lines kept: ${keptCount}`);
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
