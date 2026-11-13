#!/usr/bin/env python3
"""
Generate word frequency data from NLTK corpora and serialize to JSON
This creates a frequency score for each word that can be used for tiebreaking
"""

import json
import nltk
from collections import Counter
from pathlib import Path

def ensure_nltk_data():
    """Download required NLTK data if not already present"""
    required_datasets = [
        'brown',      # Brown Corpus - balanced corpus of American English
        'gutenberg',  # Project Gutenberg texts
        'webtext',    # Web and chat text
    ]
    
    for dataset in required_datasets:
        try:
            nltk.data.find(f'corpora/{dataset}')
            print(f"✓ Found {dataset} corpus")
        except LookupError:
            print(f"⚠ Downloading {dataset} corpus...")
            nltk.download(dataset, quiet=True)

def get_word_frequencies():
    """
    Extract word frequencies from NLTK corpora
    Returns dict mapping word -> frequency score (lower = more common)
    """
    print("\n📊 Collecting word frequencies from NLTK corpora...")
    
    word_counts = Counter()
    
    # Collect from Brown corpus (most authoritative)
    print("  - Brown corpus...")
    try:
        from nltk.corpus import brown
        for word in brown.words():
            word_lower = word.lower()
            # Only include alphabetic words (no numbers, punctuation)
            if word_lower.isalpha():
                word_counts[word_lower] += 1
    except Exception as e:
        print(f"    Warning: Could not load Brown corpus: {e}")
    
    # Collect from Gutenberg (literary texts)
    print("  - Gutenberg corpus...")
    try:
        from nltk.corpus import gutenberg
        for word in gutenberg.words():
            word_lower = word.lower()
            if word_lower.isalpha():
                word_counts[word_lower] += 1
    except Exception as e:
        print(f"    Warning: Could not load Gutenberg corpus: {e}")
    
    # Collect from webtext (more modern/informal language)
    print("  - Web text corpus...")
    try:
        from nltk.corpus import webtext
        for word in webtext.words():
            word_lower = word.lower()
            if word_lower.isalpha():
                word_counts[word_lower] += 1
    except Exception as e:
        print(f"    Warning: Could not load webtext corpus: {e}")
    
    print(f"\n✅ Collected {len(word_counts)} unique words")
    
    # Convert to frequency scores (rank-based)
    # Most common word gets score 1, second gets 2, etc.
    sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
    
    frequency_scores = {}
    for rank, (word, _count) in enumerate(sorted_words, start=1):
        frequency_scores[word] = rank
    
    return frequency_scores

def save_frequency_data(frequency_scores, output_path):
    """Save frequency data to JSON file"""
    print(f"\n💾 Saving frequency data to {output_path}...")
    
    # Create compact JSON (no extra whitespace)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(frequency_scores, f, ensure_ascii=False, separators=(',', ':'))
    
    file_size_mb = Path(output_path).stat().st_size / (1024 * 1024)
    print(f"✅ Saved {len(frequency_scores)} words ({file_size_mb:.2f} MB)")
    
    # Print some examples
    print("\n📝 Sample frequencies:")
    sample_words = ['the', 'of', 'and', 'carrot', 'typing', 'fantastic', 'carlot']
    for word in sample_words:
        if word in frequency_scores:
            print(f"  '{word}': {frequency_scores[word]}")
        else:
            print(f"  '{word}': NOT FOUND (will use default)")

def main():
    print("=" * 60)
    print("NLTK Word Frequency Data Generator")
    print("=" * 60)
    
    # Ensure NLTK data is available
    ensure_nltk_data()
    
    # Get frequency data
    frequency_scores = get_word_frequencies()
    
    # Save to JSON
    output_path = Path(__file__).parent / 'word_frequencies.json'
    save_frequency_data(frequency_scores, output_path)
    
    print("\n" + "=" * 60)
    print("✨ Done! You can now use word_frequencies.json in JavaScript")
    print("=" * 60)

if __name__ == '__main__':
    main()
