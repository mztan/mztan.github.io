/**
 * Dictionary Loader - Dynamically loads dictionary from text file
 * Replaces the static shared-dictionary.js approach
 */

let sharedDictionary = [];
let dictionaryLoaded = false;
let dictionaryLoadPromise = null;

/**
 * Load dictionary from text file
 * Returns a promise that resolves with the loaded dictionary array
 */
async function loadDictionary() {
    if (dictionaryLoaded) {
        return sharedDictionary;
    }

    // If already loading, return the existing promise
    if (dictionaryLoadPromise) {
        return dictionaryLoadPromise;
    }

    dictionaryLoadPromise = (async () => {
        try {
            // Smart path detection - determine correct path based on current location
            const currentPath = window.location.pathname;
            let dictionaryPath;

            if (currentPath.includes('/typing_test/') || currentPath.includes('/document_editor/')) {
                // We're in a subdirectory - use parent directory
                dictionaryPath = '../hybrid_dictionary.txt';
            } else {
                // We're in the main exec_demo directory
                dictionaryPath = './hybrid_dictionary.txt';
            }

            console.log(`Loading dictionary from: ${dictionaryPath}`);
            const response = await fetch(dictionaryPath);

            if (!response.ok) {
                throw new Error(`Failed to load dictionary from ${dictionaryPath}: ${response.status} ${response.statusText}`);
            }

            console.log(`✅ Dictionary loaded from: ${dictionaryPath}`);

            const text = await response.text();

            // Split by lines and filter out empty lines
            sharedDictionary = text
                .split('\n')
                .map(word => word.trim().toLowerCase())
                .filter(word => word.length > 0);

            dictionaryLoaded = true;
            console.log(`Dictionary loaded successfully: ${sharedDictionary.length} words`);

            return sharedDictionary;

        } catch (error) {
            console.error('Critical Error: Failed to load dictionary:', error);

            // FAIL HARD - no fallback dictionary since TrieDictionary requires proper dictionary
            throw new Error(`Dictionary loading failed and no fallback is allowed for performance. Error: ${error.message}`);
        }
    })();

    return dictionaryLoadPromise;
}

/**
 * Get dictionary (loads if not already loaded)
 * Returns a promise that resolves with the dictionary array
 */
async function getDictionary() {
    return await loadDictionary();
}

/**
 * Check if dictionary is already loaded
 */
function isDictionaryLoaded() {
    return dictionaryLoaded;
}

/**
 * Get dictionary synchronously (only if already loaded)
 * Returns empty array if not loaded yet
 */
function getDictionarySync() {
    return dictionaryLoaded ? sharedDictionary : [];
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadDictionary,
        getDictionary,
        isDictionaryLoaded,
        getDictionarySync,
        get sharedDictionary() { return sharedDictionary; }
    };
} else if (typeof window !== 'undefined') {
    window.loadDictionary = loadDictionary;
    window.getDictionary = getDictionary;
    window.isDictionaryLoaded = isDictionaryLoaded;
    window.getDictionarySync = getDictionarySync;

    // For backward compatibility
    window.sharedDictionary = sharedDictionary;
}
