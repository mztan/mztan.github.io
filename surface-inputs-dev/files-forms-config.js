/* Exact mappings supplied by the parent from authenticated Google Forms question readback.
 * Delivery stays disabled until the parent confirms a marked integration response and enables it. */
(function (root) {
    const config = {
        version: 1,
        enabled: false,
        fieldsVerified: false,
        endpoint: 'https://docs.google.com/forms/d/e/1FAIpQLSeNlypYPLoAPt_aVLL060oONKpMMdyryJb8VhVfuJSklrsKhQ/formResponse',
        fields: {
            participant_label: 'entry.2066335983',
            task_id: 'entry.160579621',
            task_context_id: 'entry.998603343',
            submission_id: 'entry.358376567',
            submission_type: 'entry.2020537919',
            results_json: 'entry.1410215278',
            ease: 'entry.946194392',
            comment: 'entry.1363832759',
            rating_skipped: 'entry.1298900302'
        }
    };
    if (typeof module === 'object' && module.exports) module.exports = config;
    if (root) root.SurfaceInputsFilesFormsConfig = config;
})(typeof window === 'undefined' ? null : window);
