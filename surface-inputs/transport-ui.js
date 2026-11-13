/* Identity visibility changes only after the private port ready roundtrip. */
(function (win) {
    'use strict';
    function nativeIdentity() {
        if (!win.SurfaceInputsTransport.isNative()) return;
        if (!win.document.getElementById('si-native-style')) {
            const style = win.document.createElement('style');
            style.id = 'si-native-style';
            style.textContent = '#user-id-group,#unix-name-group,#button-pad-id,.button-pad{display:none!important}';
            win.document.head.appendChild(style);
        }
    }
    win.addEventListener('surface-inputs-mode', nativeIdentity);
    win.document.addEventListener('DOMContentLoaded', nativeIdentity);
    win.addEventListener('surface-inputs-transport-error', event => {
        let status = win.document.getElementById('si-transport-status');
        if (!status) {
            status = win.document.createElement('div');
            status.id = 'si-transport-status'; status.setAttribute('role', 'alert');
            status.style.cssText = 'position:fixed;bottom:8px;left:8px;right:8px;z-index:2147483647;padding:10px;background:#fff;color:#111;border:1px solid #b33;font:14px sans-serif';
            const text = win.document.createElement('span'); text.id = 'si-transport-message'; status.appendChild(text);
            const retry = win.document.createElement('button'); retry.textContent = 'Retry pending telemetry';
            retry.style.marginLeft = '8px'; retry.addEventListener('click', () => win.SurfaceInputsTransport.retryPending());
            status.appendChild(retry); win.document.body.appendChild(status);
        }
        win.document.getElementById('si-transport-message').textContent = event.detail.reason;
    });
    win.addEventListener('surface-inputs-ack', () => {
        const status = win.document.getElementById('si-transport-status');
        if (status && win.SurfaceInputsTransport.pendingCount() === 0) status.remove();
    });
    // Pending observations belong to this document and remain immutable until ACK.
    // Do not silently navigate away with unacknowledged observations.
    win.document.addEventListener('click', event => {
        if (win.SurfaceInputsTransport.pendingCount() && event.target.closest && event.target.closest('a[href]')) {
            event.preventDefault(); event.stopImmediatePropagation();
            win.dispatchEvent(new CustomEvent('surface-inputs-transport-error', {
                detail: { reason: 'Wait for sink ACK or retry pending telemetry before leaving this test.' }
            }));
        }
    }, true);
    win.addEventListener('beforeunload', event => {
        if (win.SurfaceInputsTransport.pendingCount()) { event.preventDefault(); event.returnValue = ''; }
    });
})(window);
