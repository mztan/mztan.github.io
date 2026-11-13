/**
 * AutocorrectEngine - A comprehensive autocorrect library
 * Provides spell checking, word splitting, and correction suggestions
 */
class AutocorrectEngine {
    constructor(options = {}) {
        // Cost structure optimized for realistic typing errors
        // These defaults are tuned based on typing research and should not need to be changed at callsites

        console.log('[AutocorrectEngine] Initializing with updated cost structure (v20251014-4)');

        // Neighboring key substitutions are THE MOST COMMON typing error - should be cheapest!
        // But we differentiate based on keyboard position
        // At least one edge key involved (like i/o, t/g) = cheaper (edge keys easier to mistype)
        // Both middle keys (like e/r) = more expensive (both are in home row, less likely to mistype)
        this.neighborSubstitutionCostEdge = options.neighborSubstitutionCostEdge ?? 0.5;      // At least one edge key
        this.neighborSubstitutionCostMiddle = options.neighborSubstitutionCostMiddle ?? 0.65; // Both middle keys

        // Edge keys are easier to miss when typing (periphery of keyboard)
        this.edgeInsertionCost = options.edgeInsertionCost ?? 0.5;
        // Center keys are harder to miss
        this.centerInsertionCost = options.centerInsertionCost ?? 1.0;

        this.deletionCost = options.deletionCost ?? 1.0;   // False positives (extra letters)

        // Non-neighbor substitutions are extremely unlikely (you don't hit 'q' when you meant 'p')
        // Set to a very high cost to effectively reject these edits
        this.nonNeighborSubstitutionCost = options.nonNeighborSubstitutionCost ?? 999;

        // Edge keys (outer edges of keyboard) - easier to mistype
        this.edgeKeys = new Set(['q', 'a', 'z', 'w', 's', 'x', 'p', 'o', 'l', 'm', 'k']);

        // Middle keys (center of keyboard, not on edges) - harder to mistype
        this.middleKeys = new Set(['e', 'r', 't', 'y', 'u', 'i', 'd', 'f', 'g', 'h', 'j', 'c', 'v', 'b', 'n']);

        // Character-specific costs for common punctuation
        this.apostropheInsertionCost = options.apostropheInsertionCost ?? 0.15; // Very cheap to add apostrophes (cheaper than edge substitutions)
        this.apostropheDeletionCost = options.apostropheDeletionCost ?? 0.3;   // Cheap to remove apostrophes

        // Maximum edit distance and cost threshold
        this.maxEditDistance = options.maxEditDistance ?? 2;
        // Reject corrections with cost >= this threshold (prevents delete+insert combos from passing)
        // Use length-adaptive threshold: 20% of word length (min 0.9)
        // This means shorter words are more conservative, longer words allow more edits
        // Minimum of 0.9 allows peripheral insertions (0.5) and neighbor substitutions (0.5) but blocks center insertions (1.0)
        this.useLengthAdaptiveThreshold = options.useLengthAdaptiveThreshold !== false; // Enabled by default
        this.lengthAdaptiveThresholdPercent = options.lengthAdaptiveThresholdPercent ?? 0.2; // 20% by default
        this.minCostThreshold = options.minCostThreshold ?? 0.9; // Minimum threshold (blocks center key insertions)
        // Legacy fixed threshold (used only if useLengthAdaptiveThreshold is false)
        this.maxCostThreshold = options.maxCostThreshold ?? 0.9;

        this.keyboardNeighbors = options.keyboardNeighbors || {};

        // Word splitting options
        this.enableWordSplitting = options.enableWordSplitting !== false; // Enabled by default
        this.wordSplitCost = options.wordSplitCost || 1.5; // Cost of inserting a space (should be higher than most single-char edits)

        // Initialize dictionaries
        this.dictionary = [];
        this.dictionarySet = new Set();
        this.trieDictionary = null;

        // LRU Cache for expensive operations - stores most recently used corrections
        this.correctionCache = new Map();
        this.maxCacheSize = 1000;

        // Incremental autocorrect state
        this.incrementalState = null;

        // Very common words (top 100) - used for word splitting
        this.veryCommonWords = new Set([
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
            'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
            'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
            'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
            'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
            'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
            'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
            'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
            'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
            'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
            'is', 'was', 'are', 'been', 'has', 'had', 'were', 'am'
        ]);

        // Common typo correction overrides - these get checked first for instant corrections
        this.correctionOverrides = options.correctionOverrides || {
            'teh': 'the',
            'tehm': 'them',
            'tehn': 'then',
            'adn': 'and',
            'nad': 'and',
            'cna': 'can',
            'nac': 'can',
            'se': 'we',
            'ot': 'it',
            'ut': 'it',
            'taht': 'that',
            'thta': 'that',
            'htat': 'that',
            'waht': 'what',
            'whta': 'what',
            'hwat': 'what',
            'yuo': 'you',
            'yuor': 'your',
            'youa': 'you a',
            'doenst': 'doesn\'t',
            'doesnt': 'doesn\'t',
            'diesnt': 'doesn\'t',
            'doent': 'doesn\'t',
            'wont': 'won\'t',
            'cant': 'can\'t',
            'didnt': 'didn\'t',
            'hasnt': 'hasn\'t',
            'isnt': 'isn\'t',
            'werent': 'weren\'t',
            'wouldnt': 'wouldn\'t',
            'shouldnt': 'shouldn\'t',
            'dont': 'don\'t'
        };

        // Word frequency map - loaded from word_frequencies.json (generated from NLTK corpus)
        // Lower rank = more common word (e.g., "the"=1, "of"=3, "carrot"=25663)
        // Words not in the map get a high penalty score to indicate they're very uncommon
        this.wordFrequencyMap = new Map();
        this.maxFrequencyScore = 1000000; // Default penalty for words not in frequency list (very uncommon)

        // Add base words if provided (without triggering initializeTrieDictionary yet)
        if (options.baseWords) {
            options.baseWords.forEach(word => {
                const lowerWord = word.toLowerCase();
                if (!this.dictionarySet.has(lowerWord)) {
                    this.dictionary.push(lowerWord);
                    this.dictionarySet.add(lowerWord);
                }
            });
        }

        // Ensure single-letter common words are in dictionary (often filtered out)
        const singleLetterWords = ['i', 'a'];
        for (const word of singleLetterWords) {
            if (!this.dictionarySet.has(word)) {
                this.dictionary.push(word);
                this.dictionarySet.add(word);
            }
        }

        // Initialize TrieDictionary once with all words
        this.initializeTrieDictionary();
    }

    /**
     * Check if the length difference between input and correction is acceptable
     * Max difference: 1 char for strings <= 10, or ceil(10%) for longer strings
     */
    isLengthDifferenceAcceptable(inputWord, correctionWord) {
        const inputLength = inputWord.length;
        const correctionLength = correctionWord.length;
        const lengthDiff = Math.abs(inputLength - correctionLength);

        if (inputLength <= 10) {
            return lengthDiff <= 1;
        }

        const maxDiff = Math.ceil(inputLength * 0.1);
        return lengthDiff <= maxDiff;
    }

    /**
     * Load word frequency data from word_frequencies.json (generated from NLTK)
     * Should be called asynchronously after construction
     */
    async loadFrequencyData(frequencyFilePath = 'word_frequencies.json') {
        try {
            if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
                // Browser environment
                const response = await fetch(frequencyFilePath);
                const frequencyData = await response.json();
                this.wordFrequencyMap = new Map(Object.entries(frequencyData));
            } else {
                // Node.js environment
                const fs = require('fs');
                const path = require('path');

                // Resolve relative path from current working directory
                const resolvedPath = path.resolve(process.cwd(), frequencyFilePath);
                const text = fs.readFileSync(resolvedPath, 'utf8');
                const frequencyData = JSON.parse(text);
                this.wordFrequencyMap = new Map(Object.entries(frequencyData));
            }
            console.log(`✅ Loaded ${this.wordFrequencyMap.size} word frequencies from NLTK corpus`);
        } catch (error) {
            console.warn(`⚠️ Failed to load frequency data from ${frequencyFilePath}:`, error.message);
            console.warn('   Continuing with default frequency scoring');
        }
    }

    /**
     * Get word frequency score - lower score means more common word
     * Returns rank from frequency map, or maxFrequencyScore for unknown words
     */
    getWordFrequencyScore(word) {
        const lowerWord = word.toLowerCase();
        return this.wordFrequencyMap.get(lowerWord) || this.maxFrequencyScore;
    }

    /**
     * Extract words from text using punctuation and space delimiters
     */
    extractWords(text) {
        return text.toLowerCase().split(/[\s.,!?;:"()]+/).filter(word => word.length > 0);
    }

    /**
     * Initialize TrieDictionary with current words
     */
    initializeTrieDictionary() {
        if (typeof TrieDictionary !== 'undefined' && this.dictionary.length > 0) {
            console.log(`🚀 Initializing Quest 3-optimized TrieDictionary with ${this.dictionary.length} words...`);
            // Set keyboardNeighbors globally for TrieDictionary to access
            if (typeof window !== 'undefined') {
                window.keyboardNeighbors = this.keyboardNeighbors;
            } else if (typeof global !== 'undefined') {
                global.keyboardNeighbors = this.keyboardNeighbors;
            }
            this.trieDictionary = new TrieDictionary(this.adjacentKeyMultiplier, this.dictionary);
            console.log(`✅ TrieDictionary initialized - using hybrid dictionary for wicked fast lookups`);
        } else if (typeof TrieDictionary === 'undefined') {
            console.warn('⚠️ TrieDictionary class not found - falling back to brute force search');
        }
    }

    /**
     * Add words to the dictionary
     */
    addWords(words) {
        words.forEach(word => {
            const lowerWord = word.toLowerCase();
            if (!this.dictionarySet.has(lowerWord)) {
                this.dictionary.push(lowerWord);
                this.dictionarySet.add(lowerWord);
            }
        });

        // Reinitialize TrieDictionary with new words
        this.initializeTrieDictionary();
    }

    /**
     * Check if two characters are neighbors on the keyboard
     */
    areNeighboringKeys(char1, char2) {
        const c1 = char1.toLowerCase();
        const c2 = char2.toLowerCase();
        return c1 !== c2 && this.keyboardNeighbors[c1]?.includes(c2) || false;
    }


    /**
     * Calculate Damerau-Levenshtein cost with keyboard-aware substitution costs
     * Supports transpositions which makes "teh" -> "the" cost = 1
     * NOTE: This is a weighted cost function, not standard edit distance
     */
    levenshteinCost(a, b, maxEditCost = null) {
        const maxCost = maxEditCost || this.maxEditDistance;

        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));

        // Initialize first row (cost of deleting all input characters)
        matrix[0][0] = 0;
        for (let j = 1; j <= a.length; j++) {
            const charToDelete = a[j - 1];
            const delCost = (charToDelete === "'") ?
                this.apostropheDeletionCost : this.deletionCost;
            matrix[0][j] = matrix[0][j - 1] + delCost;
        }

        // Initialize first column (cost of inserting all dictionary characters)
        for (let i = 1; i <= b.length; i++) {
            const charToInsert = b[i - 1];
            let insCost;
            if (charToInsert === "'") {
                insCost = this.apostropheInsertionCost;
            } else if (this.edgeKeys.has(charToInsert)) {
                insCost = this.edgeInsertionCost;
            } else {
                insCost = this.centerInsertionCost;
            }
            matrix[i][0] = matrix[i - 1][0] + insCost;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b[i - 1] === a[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1]; // no operation needed
                } else {
                    // Substitution cost - neighboring keys are CHEAP, non-neighbors are rejected
                    // Use position-aware costs: cheaper when at least one edge key involved
                    let substitutionCost;
                    if (this.areNeighboringKeys(a[j - 1], b[i - 1])) {
                        const char1 = a[j - 1].toLowerCase();
                        const char2 = b[i - 1].toLowerCase();
                        // Cheaper if at least one key is an edge key
                        // More expensive only if both are middle keys
                        const hasEdgeKey = this.edgeKeys.has(char1) || this.edgeKeys.has(char2);

                        substitutionCost = hasEdgeKey ?
                            this.neighborSubstitutionCostEdge :
                            this.neighborSubstitutionCostMiddle;
                    } else {
                        substitutionCost = this.nonNeighborSubstitutionCost;
                    }

                    // Character-specific insertion/deletion costs
                    const charToInsert = b[i - 1];
                    const charToDelete = a[j - 1];

                    let insertionCost;
                    if (charToInsert === "'") {
                        insertionCost = this.apostropheInsertionCost;
                    } else if (this.edgeKeys.has(charToInsert)) {
                        insertionCost = this.edgeInsertionCost;
                    } else {
                        insertionCost = this.centerInsertionCost;
                    }

                    const deletionCost = (charToDelete === "'") ?
                        this.apostropheDeletionCost : this.deletionCost;

                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + substitutionCost, // substitution
                        matrix[i - 1][j] + insertionCost,        // insertion (character-specific)
                        matrix[i][j - 1] + deletionCost          // deletion (character-specific)
                    );

                    // Check for transposition (Damerau-Levenshtein)
                    if (i > 1 && j > 1 &&
                        b[i - 1] === a[j - 2] &&
                        b[i - 2] === a[j - 1]) {
                        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
                    }
                }
            }
        }

        return matrix[b.length][a.length];
    }


    /**
     * Find best correction for a word part using cached lookups and trie optimization
     * Made public for testing purposes
     */
    findBestCorrectionForPart(part) {
        // Check for exact override matches first (highest priority)
        if (this.correctionOverrides[part]) {
            return this.correctionOverrides[part];
        }

        if (this.hasWord(part)) return part;

        // Handle possessives EARLY: strip 's or ' suffix, correct base word, then re-apply
        let possessiveSuffix = '';
        let baseWord = part;

        if (part.endsWith("'s")) {
            possessiveSuffix = "'s";
            baseWord = part.slice(0, -2);
        } else if (part.endsWith("'")) {
            possessiveSuffix = "'";
            baseWord = part.slice(0, -1);
        }

        // If we extracted a possessive suffix
        if (possessiveSuffix && baseWord.length > 0) {
            // Check if base word exists (no correction needed)
            if (this.hasWord(baseWord)) {
                return part; // Base word is correct, keep original with possessive
            }

            // Recursively correct the base word WITHOUT the possessive
            const correctedBase = this.findBestCorrectionForPart(baseWord);

            // If we got a valid correction for the base word, add possessive back
            if (correctedBase && correctedBase !== baseWord) {
                return correctedBase + possessiveSuffix;
            }

            // No correction found for base word, return original
            return part;
        }

        // For very short words, be more conservative about corrections
        if (part.length < 2) return null;

        // Check cache first
        if (this.correctionCache.has(part)) {
            return this.correctionCache.get(part);
        }

        let result = null;
        let bestMatch = null;
        let bestDistance = Infinity;

        // Fall back to brute force if TrieDictionary is not available
        let candidates;
        if (this.trieDictionary) {
            // Get candidates from trie - this should return a small set (50-200 words)
            candidates = this.trieDictionary.search(part, this.maxEditDistance);
        } else {
            // Brute force fallback - check all dictionary words
            candidates = this.dictionary.map(word => ({ word: word }));
        }


        let bestFrequencyScore = Infinity;
        let rejectedByLength = 0;

        // Now only run expensive Levenshtein on the small candidate set
        for (const candidate of candidates) {
            const candidateWord = candidate.word;

            // Check length difference constraint first (cheap check)
            if (!this.isLengthDifferenceAcceptable(part, candidateWord)) {
                rejectedByLength++;
                continue;
            }

            const cost = this.levenshteinCost(part, candidateWord);
            const frequencyScore = this.getWordFrequencyScore(candidateWord);

            // Calculate length-adaptive threshold: 20% of word length (min 1.4)
            const costThreshold = this.useLengthAdaptiveThreshold
                ? Math.max(this.minCostThreshold, part.length * this.lengthAdaptiveThresholdPercent)
                : this.maxCostThreshold;

            // Prefer lower cost first, then lower frequency score (more common words)
            // Then prefer similar length (closer to input), finally alphabetically earlier
            if (cost <= this.maxEditDistance && cost < costThreshold) {
                const lengthDiff = Math.abs(candidateWord.length - part.length);
                const bestLengthDiff = bestMatch ? Math.abs(bestMatch.length - part.length) : Infinity;

                const isBetter = cost < bestDistance ||
                               (cost === bestDistance && frequencyScore < bestFrequencyScore) ||
                               (cost === bestDistance && frequencyScore === bestFrequencyScore &&
                                lengthDiff < bestLengthDiff) ||
                               (cost === bestDistance && frequencyScore === bestFrequencyScore &&
                                lengthDiff === bestLengthDiff && candidateWord < bestMatch);

                if (isBetter) {
                    bestDistance = cost;
                    bestFrequencyScore = frequencyScore;
                    bestMatch = candidateWord;
                }
            }
        }
        result = bestMatch;

        if (part.includes('fantastic')) {
            console.log(`🎯 Final result for "${part}": "${result}" (rejected ${rejectedByLength} by length)`);
        }

        // Cache the result using LRU eviction (Least Recently Used)
        // When cache is full, delete the oldest entry (first item in Map)
        if (this.correctionCache.size >= this.maxCacheSize) {
            // Delete first (oldest) entry in the Map
            const firstKey = this.correctionCache.keys().next().value;
            this.correctionCache.delete(firstKey);
        }
        this.correctionCache.set(part, result);

        return result;
    }


    /**
     * Preserve original capitalization in the corrected word
     * Handles both single words and multi-word splits
     */
    preserveCapitalization(originalWord, correctedWord) {
        if (!originalWord || !correctedWord) return correctedWord;

        // If original is all uppercase, make correction all uppercase
        if (originalWord === originalWord.toUpperCase()) {
            return correctedWord.toUpperCase();
        }

        // Check if corrected word is a multi-word split (contains space)
        if (correctedWord.includes(' ')) {
            const words = correctedWord.split(' ');
            const originalLower = originalWord.toLowerCase();

            // Apply original capitalization pattern to split words
            const capitalizedWords = words.map((word, index) => {
                // Find the position in original word where this split word starts
                let posInOriginal = 0;
                for (let i = 0; i < index; i++) {
                    posInOriginal += words[i].length;
                }

                // Check if that position in original was capitalized
                if (posInOriginal < originalWord.length &&
                    originalWord[posInOriginal] === originalWord[posInOriginal].toUpperCase()) {
                    return word.charAt(0).toUpperCase() + word.slice(1);
                }
                return word;
            });

            return capitalizedWords.join(' ');
        }

        // If original starts with capital, capitalize first letter of correction
        if (originalWord[0] === originalWord[0].toUpperCase()) {
            return correctedWord.charAt(0).toUpperCase() + correctedWord.slice(1);
        }

        // Otherwise, keep correction lowercase
        return correctedWord;
    }

    /**
     * Reset incremental state (call on space, click, or new word)
     */
    resetIncrementalState() {
        this.incrementalState = null;
    }

    /**
     * Incremental autocorrect - maintains active candidate set between keystrokes
     * Returns the best candidate or null if no good correction exists
     */
    getIncrementalCorrection(word) {
        const lowerWord = word.toLowerCase();

        // Check for exact override matches first (highest priority)
        if (this.correctionOverrides[lowerWord]) {
            return this.correctionOverrides[lowerWord];
        }

        // If word is in dictionary, no correction needed
        if (this.hasWord(lowerWord)) {
            return null;
        }

        if (!this.trieDictionary) return null;

        // Check if we can do incremental update (one character added)
        const canIncrement = this.incrementalState &&
                            lowerWord.startsWith(this.incrementalState.word) &&
                            lowerWord.length === this.incrementalState.word.length + 1;

        if (!canIncrement) {
            // Start fresh - initialize from root
            this.incrementalState = {
                word: lowerWord,
                candidates: new Map() // Map of trieNode -> {row, depth}
            };

            // Initialize first row of DP matrix
            // First row represents cost of deleting all input characters
            const sz = lowerWord.length;
            const initialRow = new Float32Array(sz + 1);
            initialRow[0] = 0;
            for (let i = 1; i <= sz; i++) {
                // Cost to delete character at position i-1
                const charToDelete = lowerWord[i - 1];
                const delCost = (charToDelete === "'") ?
                    this.apostropheDeletionCost : this.deletionCost;
                initialRow[i] = initialRow[i - 1] + delCost;
            }

            // Explore from root
            for (const [char, node] of this.trieDictionary.root.children) {
                this.expandNode(node, char, initialRow, lowerWord, 1);
            }
        } else {
            // Incremental update - extend existing candidates
            const newChar = lowerWord[lowerWord.length - 1];
            const newCandidates = new Map();

            // Extend each active candidate
            for (const [node, data] of this.incrementalState.candidates) {
                // Try to follow existing children
                for (const [char, childNode] of node.children) {
                    const newRow = this.computeNextRow(data.row, lowerWord, char);
                    const minInRow = Math.min(...newRow);

                    // Only keep if within edit distance threshold
                    if (minInRow <= this.maxEditDistance) {
                        newCandidates.set(childNode, {
                            row: newRow,
                            depth: data.depth + 1
                        });
                    }
                }
            }

            // If we have no candidates after incremental update, restart from scratch
            if (newCandidates.size === 0) {
                // Reset candidates map and rebuild from root
                this.incrementalState.candidates = new Map();
                this.incrementalState.word = lowerWord;

                const sz = lowerWord.length;
                const initialRow = new Float32Array(sz + 1);
                initialRow[0] = 0;
                for (let i = 1; i <= sz; i++) {
                    // Cost to delete character at position i-1
                    const charToDelete = lowerWord[i - 1];
                    const delCost = (charToDelete === "'") ?
                        this.apostropheDeletionCost : this.deletionCost;
                    initialRow[i] = initialRow[i - 1] + delCost;
                }

                // Explore from root
                for (const [char, node] of this.trieDictionary.root.children) {
                    this.expandNode(node, char, initialRow, lowerWord, 1);
                }
            } else {
                this.incrementalState.word = lowerWord;
                this.incrementalState.candidates = newCandidates;
            }
        }

        // Find best candidate from active set
        // Calculate length-adaptive threshold for current input word
        const costThreshold = this.useLengthAdaptiveThreshold
            ? Math.max(this.minCostThreshold, this.incrementalState.word.length * this.lengthAdaptiveThresholdPercent)
            : this.maxCostThreshold;

        let bestCandidate = null;
        let bestDistance = this.maxEditDistance;
        let bestFrequency = Infinity;

        for (const [node, data] of this.incrementalState.candidates) {
            if (node.word && node.word.length > 0) {
                const editDist = data.row[data.row.length - 1];

                // Apply both maxEditDistance and cost threshold checks
                if (editDist <= this.maxEditDistance && editDist < costThreshold) {
                    const freq = this.getWordFrequencyScore(node.word);
                    if (editDist < bestDistance ||
                        (editDist === bestDistance && freq < bestFrequency)) {
                        bestDistance = editDist;
                        bestFrequency = freq;
                        bestCandidate = node.word;
                    }
                }
            }
        }

        return bestCandidate;
    }

    /**
     * Expand a trie node and compute its DP row
     */
    expandNode(node, char, lastRow, word, depth) {
        const sz = word.length;
        const currentRow = new Float32Array(sz + 1);

        // Cost to transform 0 chars of input into current trie depth
        // This is the cost of inserting all the dictionary characters we've followed
        let charInsertionCost;
        if (char === "'") {
            charInsertionCost = this.apostropheInsertionCost;
        } else if (this.edgeKeys.has(char)) {
            charInsertionCost = this.edgeInsertionCost;
        } else {
            charInsertionCost = this.centerInsertionCost;
        }
        currentRow[0] = lastRow[0] + charInsertionCost;

        let minInRow = currentRow[0];

        for (let i = 1; i <= sz; i++) {
            // Character-specific costs for insertions and deletions
            const charToInsert = char;        // Dict char being added
            const charToDelete = word[i - 1]; // Input char being removed

            let dictInsertCost;
            if (charToInsert === "'") {
                dictInsertCost = this.apostropheInsertionCost;
            } else if (this.edgeKeys.has(charToInsert)) {
                dictInsertCost = this.edgeInsertionCost;
            } else {
                dictInsertCost = this.centerInsertionCost;
            }
            const inputDeleteCost = (charToDelete === "'") ?
                this.apostropheDeletionCost : this.deletionCost;

            // insertCost: delete from input (move right in DP matrix)
            // deleteCost: insert dict char (move down in DP matrix)
            const insertCost = inputDeleteCost + currentRow[i - 1];
            const deleteCost = dictInsertCost + lastRow[i];
            let replaceCost = lastRow[i - 1];

            if (word[i - 1] !== char) {
                // Check for adjacent keys first
                const adjacentKey = word[i - 1] + char;
                if (this.trieDictionary.adjacentKeysSet.has(adjacentKey)) {
                    // Use position-aware costs: cheaper when at least one edge key involved
                    const char1 = word[i - 1].toLowerCase();
                    const char2 = char.toLowerCase();
                    const hasEdgeKey = this.edgeKeys.has(char1) || this.edgeKeys.has(char2);

                    replaceCost = (hasEdgeKey ? this.neighborSubstitutionCostEdge : this.neighborSubstitutionCostMiddle) + lastRow[i - 1];
                } else {
                    // Non-neighbor substitution - reject with very high cost
                    replaceCost = this.nonNeighborSubstitutionCost + lastRow[i - 1];
                }
            }

            currentRow[i] = Math.min(insertCost, deleteCost, replaceCost);
            minInRow = Math.min(minInRow, currentRow[i]);
        }

        // Only keep if within threshold
        if (minInRow <= this.maxEditDistance) {
            this.incrementalState.candidates.set(node, {
                row: currentRow,
                depth: depth
            });

            // Recursively expand children
            for (const [nextChar, childNode] of node.children) {
                this.expandNode(childNode, nextChar, currentRow, word, depth + 1);
            }
        }
    }

    /**
     * Compute next DP row when adding one character to the input
     */
    computeNextRow(lastRow, word, char) {
        const sz = word.length;
        const newRow = new Float32Array(sz + 1);

        // Cost to transform 0 chars of input into current trie depth
        let charInsertionCost;
        if (char === "'") {
            charInsertionCost = this.apostropheInsertionCost;
        } else if (this.edgeKeys.has(char)) {
            charInsertionCost = this.edgeInsertionCost;
        } else {
            charInsertionCost = this.centerInsertionCost;
        }
        newRow[0] = lastRow[0] + charInsertionCost;

        for (let i = 1; i <= sz; i++) {
            // Character-specific costs for insertions and deletions
            const charToInsert = char;        // Dict char being added
            const charToDelete = word[i - 1]; // Input char being removed

            let dictInsertCost;
            if (charToInsert === "'") {
                dictInsertCost = this.apostropheInsertionCost;
            } else if (this.edgeKeys.has(charToInsert)) {
                dictInsertCost = this.edgeInsertionCost;
            } else {
                dictInsertCost = this.centerInsertionCost;
            }
            const inputDeleteCost = (charToDelete === "'") ?
                this.apostropheDeletionCost : this.deletionCost;

            // insertCost: delete from input (move right in DP matrix)
            // deleteCost: insert dict char (move down in DP matrix)
            const insertCost = inputDeleteCost + newRow[i - 1];
            const deleteCost = dictInsertCost + lastRow[i];
            let replaceCost = lastRow[i - 1];

            if (word[i - 1] !== char) {
                // Check for adjacent keys first
                const adjacentKey = word[i - 1] + char;
                if (this.trieDictionary.adjacentKeysSet.has(adjacentKey)) {
                    // Use position-aware costs: cheaper when at least one middle key involved
                    const char1 = word[i - 1].toLowerCase();
                    const char2 = char.toLowerCase();
                    const hasMiddleKey = this.middleKeys.has(char1) || this.middleKeys.has(char2);

                    replaceCost = (hasMiddleKey ? this.neighborSubstitutionCostMiddle : this.neighborSubstitutionCostEdge) + lastRow[i - 1];
                } else {
                    // Non-neighbor substitution - reject with very high cost
                    replaceCost = this.nonNeighborSubstitutionCost + lastRow[i - 1];
                }
            }

            newRow[i] = Math.min(insertCost, deleteCost, replaceCost);
        }

        return newRow;
    }

    /**
     * Check if a word should skip autocorrect
     * Returns true for numbers, symbols, all-caps words, mixed-case words, etc.
     */
    shouldSkipAutocorrect(word) {
        if (!word || word.length === 0) return true;

        // Skip if contains numbers
        if (/\d/.test(word)) {
            return true;
        }

        // Skip if contains special symbols (except apostrophes which are valid in words)
        if (/[^a-zA-Z']/.test(word)) {
            return true;
        }

        const alphaChars = word.replace(/[^a-zA-Z]/g, '');

        // Skip if all caps (2+ letters) - likely an acronym
        if (alphaChars.length >= 2 && alphaChars === alphaChars.toUpperCase()) {
            return true;
        }

        // Skip if multiple capitals (camelCase, PascalCase, or mixed case like LinkedIn, AStar)
        // Count uppercase letters - if 2+, skip (handles AStar, LinkedIn, iPhone, etc.)
        const uppercaseCount = (alphaChars.match(/[A-Z]/g) || []).length;
        if (uppercaseCount >= 2) {
            return true;
        }

        return false;
    }

    /**
     * Try to split a concatenated word into two words
     * Only suggests splits where at least one word is very common
     * Returns {firstWord, secondWord} or null
     */
    findTwoWordSplit(word) {
        if (!this.enableWordSplitting || word.length < 3) {
            return null;
        }

        const lowerWord = word.toLowerCase();

        // Check if word is in dictionary AND is reasonably common
        // If it's in dictionary but NOT common, still try to split it
        // (e.g., "iam" might be in some dictionaries but we still want "I am")
        if (this.hasWord(lowerWord)) {
            const wordFreq = this.getWordFrequencyScore(lowerWord);
            // If the word is reasonably common (top 1000), don't split it
            if (wordFreq < 1000) {
                return null;
            }
            // Otherwise, continue to try splitting even if it's in dictionary
        }

        let bestSplit = null;
        let bestScore = Infinity;

        // Try splits at each position (min 1 char per word to handle "I am")
        for (let i = 1; i <= lowerWord.length - 1; i++) {
            const firstPart = lowerWord.substring(0, i);
            const secondPart = lowerWord.substring(i);

            // Both parts must be in dictionary
            if (!this.hasWord(firstPart) || !this.hasWord(secondPart)) {
                continue;
            }

            // At least one word must be very common
            const firstIsCommon = this.veryCommonWords.has(firstPart);
            const secondIsCommon = this.veryCommonWords.has(secondPart);

            if (!firstIsCommon && !secondIsCommon) {
                continue;
            }

            // Score the split (lower is better)
            // Prioritize splits where both words are common
            const firstFreq = this.getWordFrequencyScore(firstPart);
            const secondFreq = this.getWordFrequencyScore(secondPart);
            const score = firstFreq + secondFreq;

            // Only use this split if it's better than keeping the original word
            // Both parts should be more common than the original
            if (score < bestScore) {
                bestScore = score;
                bestSplit = { firstWord: firstPart, secondWord: secondPart };
            }
        }

        return bestSplit;
    }

    /**
     * Find closest word correction (used for actual autocorrect)
     * Uses incremental state if available, tries word splitting, or returns original word
     */
    findClosestWord(word, options = {}) {
        // Skip autocorrect for special cases
        if (this.shouldSkipAutocorrect(word)) {
            return word;
        }

        const lowerWord = word.toLowerCase();

        // Check for exact override matches first (highest priority)
        if (this.correctionOverrides[lowerWord]) {
            return this.preserveCapitalization(word, this.correctionOverrides[lowerWord]);
        }

        if (this.hasWord(lowerWord)) {
            return word;
        }

        // Try single-word correction (built up during typing)
        let singleWordCorrection = null;
        if (this.trieDictionary) {
            const correction = this.getIncrementalCorrection(lowerWord);
            if (correction && correction !== lowerWord) {
                singleWordCorrection = correction;
            } else {
                // Only do fallback search if explicitly requested (final correction)
                // Don't do it for tooltip previews as it's expensive for gibberish words
                const useFallback = options.useFallback !== false;

                if (useFallback) {
                    const fallbackCorrection = this.findBestCorrectionForPart(lowerWord);
                    if (fallbackCorrection && fallbackCorrection !== lowerWord) {
                        singleWordCorrection = fallbackCorrection;
                    }
                }
            }
        } else {
            // No TrieDictionary - use fallback directly
            const fallbackCorrection = this.findBestCorrectionForPart(lowerWord);
            if (fallbackCorrection && fallbackCorrection !== lowerWord) {
                singleWordCorrection = fallbackCorrection;
            }
        }

        // Try word splitting if enabled
        const split = this.findTwoWordSplit(word);

        // Choose between single-word correction and split by comparing costs
        if (singleWordCorrection && split) {
            // Both options available - compare costs
            const singleWordCost = this.levenshteinCost(lowerWord, singleWordCorrection);
            const splitCost = this.wordSplitCost;

            // Prefer single-word correction if costs are equal or better
            if (singleWordCost <= splitCost) {
                return this.preserveCapitalization(word, singleWordCorrection);
            } else {
                const splitResult = split.firstWord + ' ' + split.secondWord;
                return this.preserveCapitalization(word, splitResult);
            }
        }

        // Only split available
        if (split) {
            const splitResult = split.firstWord + ' ' + split.secondWord;
            return this.preserveCapitalization(word, splitResult);
        }

        // Only single-word correction available
        if (singleWordCorrection) {
            return this.preserveCapitalization(word, singleWordCorrection);
        }

        // No correction found - return original word
        return word;
    }

    /**
     * Find closest word for preview (optimized for real-time use)
     */
    findClosestWordForPreview(word) {
        const lowerWord = word.toLowerCase();

        // Check for exact override matches first (highest priority)
        if (this.correctionOverrides[lowerWord]) {
            return this.correctionOverrides[lowerWord].toLowerCase(); // Return lowercase for preview
        }

        // Use the same logic as findClosestWord for consistency
        return this.findClosestWord(word).toLowerCase();
    }

    /**
     * Process text for autocorrection
     * Returns object with { corrected: boolean, originalText: string, correctedText: string }
     */
    processText(text, options = {}) {
        const preservePunctuation = options.preservePunctuation !== false;
        const words = this.extractWords(text);

        if (words.length === 0) {
            return { corrected: false, originalText: text, correctedText: text };
        }

        // For now, just process the last word (maintaining current behavior)
        const lastWord = words[words.length - 1];
        const correction = this.findClosestWord(lastWord);

        if (correction !== lastWord) {
            // Simple replacement for now - can be enhanced for full text processing
            const correctedText = text.replace(new RegExp(lastWord + '$'), correction);
            return {
                corrected: true,
                originalText: text,
                correctedText: correctedText,
                originalWord: lastWord,
                correctedWord: correction
            };
        }

        return { corrected: false, originalText: text, correctedText: text };
    }

    /**
     * Get singular form of a potential plural word
     */

    /**
     * Check if a word is in the dictionary (including plural and possessive forms)
     */
    hasWord(word) {
        const lowerWord = word.toLowerCase();

        // Check exact match first
        if (this.dictionarySet.has(lowerWord)) {
            return true;
        }

        // Check if it's a possessive form (word's or words')
        if (lowerWord.includes("'")) {
            // Handle possessives: mark's -> mark, james's -> james, dogs' -> dogs
            const withoutApostrophe = lowerWord.replace(/'s$/, '').replace(/'$/, '');

            if (this.dictionarySet.has(withoutApostrophe)) {
                return true; // Base word exists
            }
        }

        return false;
    }

    /**
     * Get statistics about the autocorrect engine
     */
    getStats() {
        return {
            dictionarySize: this.dictionary.length,
            cacheSize: this.correctionCache.size,
            maxEditDistance: this.maxEditDistance,
            hasTrieDictionary: !!this.trieDictionary,
            keyboardNeighborsCount: Object.keys(this.keyboardNeighbors).length
        };
    }

    /**
     * Performance measurement: Count how many Levenshtein calculations would be needed
     * with and without TrieDictionary optimization
     */
    measurePerformanceForWord(word) {
        const lowerWord = word.toLowerCase();

        // Without optimization: would check entire dictionary
        const bruteForceCount = this.dictionary.length;

        // With optimization: only check trie candidates
        let trieCount = 0;
        if (this.trieDictionary) {
            const candidates = this.trieDictionary.search(lowerWord, this.maxEditDistance);
            trieCount = candidates.length;
        }

        return {
            word: word,
            bruteForceCalculations: bruteForceCount,
            trieCalculations: trieCount,
            improvement: bruteForceCount > 0 ? (bruteForceCount / Math.max(trieCount, 1)) : 1
        };
    }

    /**
     * Clear correction cache
     */
    clearCache() {
        this.correctionCache.clear();
    }
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AutocorrectEngine;
} else if (typeof window !== 'undefined') {
    window.AutocorrectEngine = AutocorrectEngine;
}
