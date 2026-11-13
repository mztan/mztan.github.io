'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTransport, validate, utf8Bytes, metrics } = require('../transport.js');
const { environment } = require('./harness.js');
function setup(options = {}) {
    const env = environment('?native=true&user_id=&session_id=not-attribution');
    env.transport = createTransport(env.win, options);
    return env;
}
const keyboard = (extra = {}) => Object.assign({ version: 1, type: 'keyboard', id: 'observation_1',
    activity_id: 'keyboard_natural_language', elapsed_ms: 123,
    prompt_id: 'prompt_1', prompt_text: 'hello⏎', input_event_stream: 'hello⏎', details: { details_version: 1 } }, extra);
const feedback = (extra = {}) => Object.assign({ version: 1, type: 'feedback', id: 'feedback_1',
    activity_id: 'keyboard_natural_language', scope: 'task', round_id: 'round_1',
    ratings: { ease: 5, frustration: 1 }, comment: 'Some feedback' }, extra);

test('URL and UA do not bind mode; source, trust, origin, top frame, marker and one port all matter', () => {
    const e = setup();
    assert.equal(e.transport.getMode(), 'browser');
    const invalid = [
        { source: {} }, { source: null, isTrusted: false }, { isTrusted: false },
        { ports: [] }, { ports: [e.port, e.port] }, { data: '{' },
        { data: JSON.stringify({ type: 'surface_inputs_host', version: 2 }) },
        { data: JSON.stringify({ type: 'surface_inputs_host', version: 1, session_id: 'secret' }) }
    ];
    invalid.forEach(value => { e.handshake(value); assert.equal(e.transport.getMode(), 'browser'); });
    e.win.top = {}; e.handshake(); assert.equal(e.transport.getMode(), 'browser'); e.win.top = e.win;
    e.win.location.origin = 'https://other.github.io'; e.handshake(); assert.equal(e.transport.getMode(), 'browser');
    e.win.location.origin = 'https://mztan.github.io';
    e.handshake({ source: null });
    assert.equal(e.transport.getMode(), 'connecting'); assert.equal(e.transport.isNative(), false);
    assert.deepEqual(e.port.sent, [{ version: 1, type: 'ready' }]);
    e.port.receive({ version: 2, type: 'ready' }); assert.equal(e.transport.isNative(), false);
    e.port.receive({ version: 1, type: 'ready', unexpected: true }); assert.equal(e.transport.isNative(), false);
    e.port.receive({ version: 1, type: 'ready' }); assert.equal(e.transport.isNative(), true);
});

test('connecting buffers complete observations; ready drains once, accepted means sink ACK', () => {
    const e = setup(); e.handshake();
    e.transport.submitKeyboard(keyboard());
    assert.equal(e.transport.pendingCount(), 1); assert.equal(e.port.sent.length, 1);
    e.port.receive({ version: 1, type: 'ready' });
    assert.equal(e.port.sent.length, 2); assert.deepEqual(e.port.sent[1], keyboard());
    e.port.receive({ version: 1, type: 'ready' }); assert.equal(e.port.sent.length, 2);
    e.port.receive({ version: 1, id: 'observation_1', status: 'uploaded' }); assert.equal(e.transport.pendingCount(), 1);
    e.port.receive({ version: 2, id: 'observation_1', status: 'accepted' }); assert.equal(e.transport.pendingCount(), 1);
    e.port.receive({ version: 1, id: 'unknown', status: 'accepted' }); assert.equal(e.transport.pendingCount(), 1);
    e.port.receive({ version: 1, id: 'observation_1', status: 'accepted' }); assert.equal(e.transport.pendingCount(), 0);
    e.port.receive({ version: 1, id: 'observation_1', status: 'accepted' }); assert.equal(e.transport.pendingCount(), 0);
    e.transport.submitKeyboard(keyboard()); assert.equal(e.port.sent.length, 2);
    assert.throws(() => e.transport.submitKeyboard(keyboard({ prompt_text: 'different⏎' })), /reuse accepted/);
});

test('bounded retries preserve immutable id/payload and retain rejected/unacknowledged work', () => {
    const e = setup({ maxAttempts: 2, queueLimit: 1 }); e.ready();
    const failures = []; e.win.addEventListener('surface-inputs-transport-error', event => failures.push(event.detail));
    e.transport.submitKeyboard(keyboard());
    e.transport.submitKeyboard(keyboard()); assert.equal(e.port.sent.length, 2);
    assert.throws(() => e.transport.submitKeyboard(keyboard({ input_event_stream: 'wrong⏎' })), /reuse id/);
    assert.throws(() => e.transport.submitKeyboard(keyboard({ id: 'observation_2' })), /queue full/);
    const firstRetry = [...e.timers.keys()][0]; e.runTimer(firstRetry);
    assert.deepEqual(e.port.sent[1], e.port.sent[2]);
    e.runTimer([...e.timers.keys()][0]);
    assert.equal(e.transport.pendingCount(), 1); assert.match(failures[0].reason, /retained/);
    e.transport.retryPending(); assert.equal(e.port.sent.length, 4);
    e.port.receive({ version: 1, id: 'observation_1', status: 'rejected', reason: 'sink unavailable' });
    assert.equal(e.transport.pendingCount(), 1); assert.equal(e.timers.size, 0);
    assert.equal(failures.at(-1).reason, 'sink unavailable');
    e.transport.retryPending(); assert.deepEqual(e.port.sent.at(-1), keyboard());
    e.port.receive({ version: 1, id: 'observation_1', status: 'accepted' }); assert.equal(e.transport.canQueue(), true);
});

test('keyboard schema is bounded complete observations, never attempt/order/attribution metadata', () => {
    validate(keyboard());
    for (const extra of [{ session_id: 'session' }, { account_id: 'account' }, { model_version: 'model' },
        { final_text: 'final' }, { attempt_id: 'attempt' }, { observation_count: 2 }]) {
        assert.throws(() => validate(keyboard(extra)), /Unknown field/);
    }
    assert.throws(() => validate(keyboard({ id: 'é' })), /ASCII/);
    assert.throws(() => validate(keyboard({ prompt_id: 'p'.repeat(65) })), /ASCII/);
    assert.throws(() => validate(keyboard({ prompt_text: 'é'.repeat(257) })), /prompt_text/);
    assert.throws(() => validate(keyboard({ input_event_stream: '⌫'.repeat(683) })), /input_event_stream/);
    assert.throws(() => validate(keyboard({ details: { details_version: 1, attempt_count: 1 } })), /Unknown field/);
    assert.throws(() => validate(keyboard({ details: { details_version: 1, final_text: 'x'.repeat(500) } })), /details/);
    assert.throws(() => validate(keyboard({ prompt_text: 'a\n' })), /canonical/);
    assert.throws(() => validate(keyboard({ elapsed_ms: -1 })), /elapsed_ms/);
    assert.equal(utf8Bytes('⇤'), 3);
});

test('touchpad schema is typed top-level, family specific and unavailable distinct from zero', () => {
    const base = { version: 1, type: 'touchpad', id: 't1', activity_id: 'touchpad_targeting',
        elapsed_ms: 1, metric_family: 'clicks', details: { details_version: 1 } };
    validate(Object.assign({}, base, { stp_clicks_total: 0, stp_clicks_miss_count: -1 }));
    assert.throws(() => validate(Object.assign({}, base, { stp_cursor_movement_time_ms: 1 })), /Unknown field/);
    assert.throws(() => validate(Object.assign({}, base, { metrics: { stp_clicks_total: 5 } })), /Unknown field/);
    assert.throws(() => validate(Object.assign({}, base, { stp_clicks_total: 0.5 })), /stp_clicks_total/);
    assert.throws(() => validate(Object.assign({}, base, { stp_clicks_total: -0.5 })), /stp_clicks_total/);
    assert.throws(() => validate(Object.assign({}, base, { stp_clicks_total: Infinity })), /stp_clicks_total/);
    for (const [family, fields] of Object.entries(metrics)) {
        const values = Object.fromEntries(Object.entries(fields).map(([key, kind]) => [key,
            kind === 'text' ? 'target' : kind.endsWith('Direction') ? '' : -1]));
        validate(Object.assign({}, base, { metric_family: family }, values));
    }
});

test('feedback validates linkage/ratings/UTF8 and requires browser callback, never invents endpoint', () => {
    const e = setup();
    assert.throws(() => e.transport.submitFeedback(feedback()), /explicit existing-form callback/);
    const routed = []; e.transport.setBrowserFeedbackCallback(payload => { routed.push(payload); return 'callback-result'; });
    assert.equal(e.transport.submitFeedback(feedback()), 'callback-result'); assert.equal(routed.length, 1);
    assert.equal(e.requests.length, 0);
    validate(feedback({ comment: 'é'.repeat(512), pain_points: ['x'.repeat(64)] }));
    assert.throws(() => validate(feedback({ comment: 'é'.repeat(513) })), /comment/);
    assert.throws(() => validate(feedback({ round_id: undefined })), /round_id/);
    assert.throws(() => validate(feedback({ ratings: { ease: 0 } })), /1..5/);
    assert.throws(() => validate(feedback({ ratings: { accuracy: 1.5 } })), /1..5/);
    assert.throws(() => validate(feedback({ pain_points: Array(9).fill('pain') })), /Too many/);
    assert.throws(() => validate(feedback({ pain_points: ['é'.repeat(33)] })), /pain_point/);
    e.ready(); e.transport.submitFeedback(feedback()); assert.equal(e.port.sent.at(-1).type, 'feedback');
    assert.equal(routed.length, 1); assert.equal(e.transport.pendingCount(), 1);
});
