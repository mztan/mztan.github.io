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
        instructions: 'Use your index or middle fingers to hunt and peck on the Surface Keyboard. Copy each prompt as quickly as you can without sacrificing accuracy. Do not use voice dictation. Press Enter to move to the next prompt.',
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
