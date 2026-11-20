/* DEV-only presets reuse the existing typing capture, metrics and result collectors. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) {
        root.SurfaceInputsTypingTask = api;
        const apply = () => api.apply(root.document, api.profile(root.location));
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', apply, {once: true});
        else apply();
    }
})(typeof window === 'undefined' ? null : window, function () {
    'use strict';
    const HUNT_AND_PECK = Object.freeze({
        id: 'keyboard_hunt_and_peck', title: 'Hunt-and-peck typing', promptCount: 10,
        dataset: 'natural-language-punct',
        instructions: 'Use only your index or middle fingers, with the other fingers curled back. Find each key and tap it individually. Do not touch-type or use voice dictation. Copy 10 prompts, including capitals and punctuation. Press Enter after each prompt.',
        parameters: Object.freeze({setting_preset: 'df', num_prompts: '10', dataset: 'natural-language-punct'}),
        prescription: Object.freeze({typing_style: 'hunt_and_peck', prescribed_fingers: Object.freeze(['index', 'middle'])})
    });
    function profile(location) {
        const params = new URLSearchParams(location.search);
        return location.pathname.split('/')[1] === 'surface-inputs-dev' && params.get('task') === 'hunt-and-peck' ? HUNT_AND_PECK : null;
    }
    function apply(doc, task) {
        if (!task) return;
        doc.title = task.title + ' · Surface Inputs Arcade';
        doc.querySelector('h1').textContent = task.title;
        doc.querySelector('.instructions').textContent = task.instructions;
        const instructions = doc.querySelector('.instructions');
        const guidance = doc.createElement('section');
        guidance.className = 'hunt-peck-guidance';
        const figure = doc.createElement('figure');
        const image = doc.createElement('img');
        image.src = 'hunt-and-peck.svg?v=hunt-peck-pose-3';
        image.width = 480; image.height = 220;
        image.alt = 'Two pointing hands with only the index fingers extended; the other fingers are folded into the palms.';
        const caption = doc.createElement('figcaption');
        caption.textContent = 'Example: index fingers extended; other fingers curled back.';
        figure.append(image, caption);
        instructions.before(guidance);
        guidance.append(figure, instructions);
        doc.body.classList.add('typing-task-preset');
        const dataset = doc.getElementById('natural-language-punct');
        dataset.checked = true;
        doc.getElementById('physical-keyboard').checked = true;
        doc.getElementById('prompt-count').value = task.promptCount;
        for (const group of doc.querySelectorAll('.settings-group')) {
            if (group.id === 'unix-name-group' || group.id === 'user-id-group') continue;
            group.hidden = true;
            for (const control of group.querySelectorAll('input, button')) control.disabled = true;
        }
    }
    return {profile, apply};
});
