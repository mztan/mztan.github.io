/* Parent replaces only this disabled placeholder with verified, owner-published Files Form fields.
 * No endpoint or question mapping is inferred by the task. */
(function (root) {
    const config = { version: 1, enabled: false, fieldsVerified: false, endpoint: '', fields: {} };
    if (typeof module === 'object' && module.exports) module.exports = config;
    if (root) root.SurfaceInputsFilesFormsConfig = config;
})(typeof window === 'undefined' ? null : window);
