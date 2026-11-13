/* Environment identity is informational; it never changes collection behavior. */
(function (root) {
    'use strict';
    function environmentForPath(pathname) {
        return typeof pathname === 'string' && pathname.split('/')[1] === 'surface-inputs-dev'
            ? 'development' : 'production';
    }
    function applyEnvironment(win) {
        const development = environmentForPath(win.location.pathname) === 'development';
        let badge = win.document.getElementById('environment-badge');
        if (development && !badge) {
            badge = win.document.createElement('span');
            badge.id = 'environment-badge';
            badge.textContent = 'DEV';
            badge.setAttribute('aria-label', 'Development environment');
            badge.style.cssText = 'position:fixed;right:12px;bottom:12px;padding:4px 10px;border:1px solid #4db9a5;border-radius:999px;background:#142338;color:#f2e8d0;font:500 11px/1.4 sans-serif;letter-spacing:.08em;pointer-events:none';
            win.document.body.appendChild(badge);
        }
        if (badge) badge.hidden = !development;
        const title = win.document.title.replace(/ · Development$/, '');
        win.document.title = title + (development ? ' · Development' : '');
        return development;
    }
    if (typeof module === 'object' && module.exports) module.exports = { environmentForPath, applyEnvironment };
    if (root && root.document) {
        root.SurfaceInputsEnvironment = Object.freeze({
            name: environmentForPath(root.location.pathname),
            isDevelopment: environmentForPath(root.location.pathname) === 'development'
        });
        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', () => applyEnvironment(root), { once: true });
        } else applyEnvironment(root);
    }
})(typeof window === 'undefined' ? null : window);
