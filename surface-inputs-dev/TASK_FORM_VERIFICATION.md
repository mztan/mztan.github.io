# Task Form integration verification, November 20, 2026

Both task-specific Forms are shared across development and production. Hunt-and-peck uses `15AKNMhAavvjiKt0iZB7VJcjDxL0m1JBKKJ57LRDnJVI`; Files uses `180hTgbcKJX9HGuDABpuRi4Te0a_gJZ0V4HUKRipRwz8`.

At 07:07 Pacific, both anonymous responder pages returned HTTP200 with no sign-in prompt. Their nine published entry mappings match the previously created API question schema. The owner changed responder permissions; this implementation did not modify any sharing permissions.

A complete client-side five-stage flow was run in isolated Chromium using local candidate assets, with HTTP intercepted and native acceptance mocked. It produced 48 Form request bodies and 224 native-mock frames, including 11 task-specific Hunt-and-peck requests and 2 Files requests. Hunt-and-peck results preserve the complete canonical prompt and `x⌫<prompt>⏎` stream; Files preserves all three original measurement rows. The existing native identities never enter Form data.

Only the 13 new-task request bodies were then submitted once to their exact Google endpoints as clearly labelled integration tests. First-three-task Google requests stayed intercepted. All 13 POSTs returned HTTP200. Fresh Google Forms API response lists confirmed 11 stored Hunt-and-peck responses and 2 stored Files responses, with timestamps matching the test run and an empty baseline before the test. These test rows remain in the task Forms under `agent_e2e_forms_20261120`; they are not real participant measurements.

Detailed answer readbacks were attempted but returned shared Google API read-quota429. Thus stored-record counts and schema/entry mapping are verified; full field-by-field backend-value equality is not claimed. Runtime no-cors receipts still mean request-sent, not independently verified storage for every future response.

188 Node checks pass, including separate Form routing for results/feedback, missing/disabled config failure, and historical submissions retaining their original destination. Fixed metrics, capture, SDK, Files geometry, independent Forms/native retries and production/jvision sources remain unchanged. Native-mock acceptance is not physical headset/Scuba E2E evidence.
