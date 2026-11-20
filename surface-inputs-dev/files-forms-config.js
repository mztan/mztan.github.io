/* One published Form per task, shared by development and production.
 * Mappings are read from each published respondent page, not an environment-specific copy. */
(function (root) {
    const config = {
        version: 1,
        forms: {
            keyboard_hunt_and_peck: {
                version: 1, enabled: true, fieldsVerified: true,
                endpoint: 'https://docs.google.com/forms/d/e/1FAIpQLSdRoCGsOe9l67KAhZ6zIlvhyGHcx2Y7iO3RRZNHDM3KwahCwg/formResponse',
                fields: {
                    participant_label: 'entry.1971703762',
                    task_id: 'entry.1603594130',
                    task_context_id: 'entry.509459817',
                    submission_id: 'entry.972323132',
                    submission_type: 'entry.1827595673',
                    results_json: 'entry.555342810',
                    ease: 'entry.862583435',
                    comment: 'entry.1137999597',
                    rating_skipped: 'entry.1542289532'
                }
            },
            stp_file_drag: {
                version: 1, enabled: true, fieldsVerified: true,
                endpoint: 'https://docs.google.com/forms/d/e/1FAIpQLSc99AyAbAtY7MWo2PwnKIUITtBL-I2VOlNLYy84IK0r79AYtg/formResponse',
                fields: {
                    participant_label: 'entry.1281062840',
                    task_id: 'entry.434538168',
                    task_context_id: 'entry.283946277',
                    submission_id: 'entry.1585347099',
                    submission_type: 'entry.1650541291',
                    results_json: 'entry.346263352',
                    ease: 'entry.2123132688',
                    comment: 'entry.870901010',
                    rating_skipped: 'entry.875022392'
                }
            }
        }
    };
    if (typeof module === 'object' && module.exports) module.exports = config;
    if (root) root.SurfaceInputsFilesFormsConfig = config;
})(typeof window === 'undefined' ? null : window);
