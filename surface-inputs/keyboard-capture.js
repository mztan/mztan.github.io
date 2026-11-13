/* Complete committed-input observations, independent of legacy UI metrics. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SurfaceInputsKeyboardCapture = api;
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const bytes = value => new TextEncoder().encode(value).length;
    const controls = { Backspace: '⌫', Delete: '⌫', Tab: '⇥', Enter: '⏎', Escape: '␛',
        ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
    function canonical(value) {
        return value.replace(/\r\n|\r|\n/g, '⏎').replace(/\t/g, '⇥').replace(/\u0008/g, '⌫').replace(/\u001b/g, '␛');
    }
    function keyToken(event) { return event.key === 'Tab' && event.shiftKey ? '⇤' : (controls[event.key] || ''); }
    function delta(previous, current) {
        const before = Array.from(previous), after = Array.from(current);
        let start = 0, suffix = 0;
        while (start < before.length && start < after.length && before[start] === after[start]) start++;
        while (suffix < before.length - start && suffix < after.length - start &&
            before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
        return { removed: before.slice(start, before.length - suffix).join(''), inserted: after.slice(start, after.length - suffix).join('') };
    }
    function createCapture(report, enforce = () => true) {
        let stream = '', invalid = false, previous = '', composing = false, compositionBase = '';
        let pendingControl = '';
        function append(token, limit = 2045) {
            if (invalid) return false;
            // Reserve the successful submit Enter before accepting any edit/press.
            if (enforce() && bytes(stream + token) > limit) { report('Input stream limit reached. Reset this prompt and retry; nothing was truncated.'); return false; }
            stream += token;
            return true;
        }
        function input(value, event = {}) {
            if (composing || event.isComposing) return true;
            const edit = delta(previous, value);
            const token = pendingControl === '⌫' && edit.removed ? '' : '⌫'.repeat(Array.from(edit.removed).length);
            pendingControl = '';
            previous = value;
            const ok = append(token + canonical(edit.inserted));
            if (!ok) { invalid = true; report('A noncancelable edit exceeded the stream limit. Reset the current prompt to retry.'); }
            return ok;
        }
        return {
            reset(value = '') { stream = ''; invalid = false; previous = value; pendingControl = ''; composing = false; },
            beforeInput(event, value, selectionStart, selectionEnd) {
                if (invalid) { if (event.cancelable) event.preventDefault(); return false; }
                // IME provisional edits are not committed. Check their potential final size,
                // but only append once the composition commits.
                let reserve = canonical(event.data || '');
                if (event.inputType && event.inputType.startsWith('insert') && selectionEnd > selectionStart) {
                    reserve += '⌫'.repeat(Array.from(value.slice(selectionStart, selectionEnd)).length);
                }
                if (event.inputType && event.inputType.startsWith('delete') && !pendingControl) {
                    reserve += '⌫'.repeat(Math.max(1, Array.from(value.slice(selectionStart, selectionEnd)).length));
                }
                if (event.inputType === 'insertFromPaste' && !event.data) return true; // checked by paste handler
                if (bytes(stream + reserve) > 2045) {
                    if (event.cancelable) event.preventDefault();
                    else invalid = true;
                    report('Input stream limit reached. Finish within the limit or reset this prompt.');
                    return false;
                }
                return true;
            },
            paste(event, currentValue = '', selectionStart = 0, selectionEnd = 0) {
                const value = event.clipboardData && event.clipboardData.getData('text/plain');
                const removed = '⌫'.repeat(Array.from(currentValue.slice(selectionStart, selectionEnd)).length);
                if (typeof value === 'string' && bytes(stream + removed + canonical(value)) > 2045) {
                    event.preventDefault(); report('Paste exceeds the input stream limit. Use a shorter paste or reset the prompt.'); return false;
                }
                return true;
            },
            key(event) {
                const token = keyToken(event);
                if (!token || event.isComposing || event.keyCode === 229) return !invalid;
                if (!append(token, event.key === 'Enter' ? 2048 : 2045)) { event.preventDefault(); return false; }
                pendingControl = token;
                return true;
            },
            input,
            compositionStart(value) { composing = true; compositionBase = value; },
            compositionEnd(value) { composing = false; previous = compositionBase; return input(value); },
            // Custom JS autocorrect is also a committed value change, not a keydown.
            programmaticEdit(before, after) { previous = before; return input(after); },
            appendLabel(label) { return append((stream ? ' ' : '') + label); },
            valid: () => !invalid,
            stream: () => stream,
            complete(prompt, finalText, streamFormat) {
                if (invalid) throw new Error('Current prompt capture is invalid. Reset and retry.');
                const expected = streamFormat ? prompt : canonical(prompt) + '⏎';
                if (bytes(expected) > 512) throw new Error('Prompt exceeds native 512-byte bound. Browser corpus is unchanged.');
                const details = { details_version: 1 };
                if (streamFormat) details.stream_format = streamFormat;
                if (bytes(JSON.stringify(Object.assign({}, details, { final_text: finalText }))) <= 512) details.final_text = finalText;
                return { prompt_text: expected, input_event_stream: stream, details };
            }
        };
    }
    return { createCapture, canonical, keyToken, delta };
});
