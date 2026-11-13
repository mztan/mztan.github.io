// Keyboard layout mapping for neighboring keys on a laptop QWERTY keyboard
// This file contains the keyboard neighbor mapping used by the Levenshtein distance function
// to apply reduced costs for substitutions between physically adjacent keys

// QWERTY keyboard layout (standard US):
// Row 1: 1 2 3 4 5 6 7 8 9 0 - =
// Row 2:  Q W E R T Y U I O P [ ]
// Row 3:   A S D F G H J K L ; '
// Row 4:    Z X C V B N M , . /
//
// Only including keys that physically touch (not far diagonals)

const keyboardNeighbors = {
    'q': ['1', '2', 'w', 'a'],
    'w': ['q', '2', '3', 'e', 'a', 's'],
    'e': ['w', '3', '4', 'r', 's', 'd'],
    'r': ['e', '4', '5', 't', 'd', 'f'],
    't': ['r', '5', '6', 'y', 'f', 'g'],
    'y': ['t', '6', '7', 'u', 'g', 'h'],
    'u': ['y', '7', '8', 'i', 'h', 'j'],
    'i': ['u', '8', '9', 'o', 'j', 'k'],
    'o': ['i', '9', '0', 'p', 'k', 'l'],
    'p': ['o', '0', '-', 'l'],
    'a': ['q', 'w', 's', 'z'],
    's': ['a', 'w', 'e', 'd', 'z', 'x'],
    'd': ['s', 'e', 'r', 'f', 'x', 'c'],
    'f': ['d', 'r', 't', 'g', 'c', 'v'],
    'g': ['f', 't', 'y', 'h', 'v', 'b'],
    'h': ['g', 'y', 'u', 'j', 'b', 'n'],
    'j': ['h', 'u', 'i', 'k', 'n', 'm'],
    'k': ['j', 'i', 'o', 'l', 'm'],
    'l': ['k', 'o', 'p'],
    'z': ['a', 's', 'x'],
    'x': ['z', 's', 'd', 'c'],
    'c': ['x', 'd', 'f', 'v'],
    'v': ['c', 'f', 'g', 'b'],
    'b': ['v', 'g', 'h', 'n'],
    'n': ['b', 'h', 'j', 'm'],
    'm': ['n', 'j', 'k'],
    '1': ['2', 'q'],
    '2': ['1', '3', 'q', 'w'],
    '3': ['2', '4', 'w', 'e'],
    '4': ['3', '5', 'e', 'r'],
    '5': ['4', '6', 'r', 't'],
    '6': ['5', '7', 't', 'y'],
    '7': ['6', '8', 'y', 'u'],
    '8': ['7', '9', 'u', 'i'],
    '9': ['8', '0', 'i', 'o'],
    '0': ['9', '-', 'o', 'p']
};

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = keyboardNeighbors;
}
