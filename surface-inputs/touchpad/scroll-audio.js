/* Scrolling reuses one unlocked context and decoded clip across all guided sets. */
(function (win, doc) {
    'use strict';
    const AudioContext = win.AudioContext || win.webkitAudioContext;
    if (!AudioContext) return;
    let context, buffer, loading;
    let generation = 0;

    function activate() {
        if (!context || context.state === 'closed') {
            context = new AudioContext();
            buffer = null;
            loading = null;
        }
        return context.state === 'running' ? Promise.resolve() : context.resume();
    }

    function decode() {
        if (buffer) return Promise.resolve(buffer);
        if (!loading) {
            loading = win.fetch('audio/chime_1.mp3')
                .then(response => {
                    if (!response.ok) throw new Error('Chime unavailable');
                    return response.arrayBuffer();
                })
                .then(bytes => context.decodeAudioData(bytes))
                .then(value => { buffer = value; return value; })
                .catch(error => { loading = null; throw error; });
        }
        return loading;
    }

    function warn() {
        // Audio failures must not affect task progress or result collection.
        console.warn('Scrolling audio cue unavailable');
    }

    function unlock() {
        try {
            const resumed = activate();
            Promise.all([resumed, decode()]).catch(warn);
        } catch (_) { warn(); }
    }

    function play() {
        const requestedGeneration = generation;
        try {
            const resumed = activate();
            Promise.all([resumed, decode()]).then(([, clip]) => {
                if (requestedGeneration !== generation || doc.hidden || context.state !== 'running') return;
                const source = context.createBufferSource();
                source.buffer = clip;
                source.connect(context.destination);
                source.onended = () => source.disconnect();
                source.start();
            }).catch(warn);
        } catch (_) { warn(); }
    }

    // Resume within the trusted gesture, before the 300 ms completion callback.
    for (const event of ['pointerdown', 'keydown', 'click']) {
        doc.addEventListener(event, unlock, {capture: true, passive: true});
    }
    const cancel = () => { generation++; };
    win.addEventListener('dogfood-task-abort', cancel);
    win.addEventListener('pagehide', cancel);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); });
    win.SurfaceInputsScrollAudio = {unlock, play};
    try {
        context = new AudioContext();
        decode().catch(warn);
    } catch (_) { warn(); }
})(window, document);
