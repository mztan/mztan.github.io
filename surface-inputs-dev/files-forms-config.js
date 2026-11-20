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
            stp_cascading_menu: {
                version:1,enabled:true,fieldsVerified:true,
                endpoint:'https://docs.google.com/forms/d/e/1FAIpQLScnWIA3qghg7crdHop_NYyliTq2IhbIAyCsr0lydjJ3Gtndtw/formResponse',
                fields:{participant_label:'entry.1381742859',task_id:'entry.593771949',task_context_id:'entry.1629083460',submission_id:'entry.1156441207',submission_type:'entry.624375333',results_json:'entry.1281321172',ease:'entry.1942546246',comment:'entry.868071936',rating_skipped:'entry.1663835594'}
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
