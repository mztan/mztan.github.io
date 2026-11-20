# Additional guided DEV stages

Hunt-and-peck and Files are the fourth and fifth stages of DEV **Start Dogfooding**, after Targeting, Scrolling and twenty-prompt Typing. They are not standalone landing choices. Production retains its three-stage flow.

## Hunt-and-peck typing

- Reach **Hunt-and-peck typing** after the first three stages and their feedback.
- Use your index or middle fingers on Surface Keyboard. This is one task, not separate finger-specific tasks; do not use voice dictation.
- Complete **10 prompts** from the existing `keyboard/prompts/nat_lang_with_cap_punc.txt` corpus. Press Enter after each prompt.
- Prompt count and corpus are fixed for this task; ordinary typing retains its existing settings.
- The task reuses the existing keyboard capture and metric calculations. Each completed prompt retains its full canonical expected prompt, input-event stream, final typed text and unchanged metric result before sending to the task-specific Hunt-and-peck Form, shared by DEV and PROD. The task-level Likert score and free-form comment use that same Form as a separate feedback record.
- In APK mode, negotiated v2 is required before typing begins. Existing typed keyboard observations and paired UXR results remain, with task-level feedback also sent through Arcade telemetry. Forms and native retries are destination-specific; no completed prompt is recomputed, truncated or automatically reposted after reload.
- The UXR result metadata identifies `keyboard_hunt_and_peck` and the **prescribed** typing style/fingers. It does not measure or verify which fingers were actually used. Typed keyboard observations remain in the existing `keyboard_punctuation` category; no telemetry schema fields or wire versions are added.

## Files

- Reach **Files** after H&P feedback. Complete the original three file-to-folder targets using the copied jvision drag, scroll, wrong-target and cancellation behavior; its feedback is the only final **Finish**.
- Browser and APK both retain local results and send the complete three-target measurement JSON and separate Likert/free-form feedback to the task-specific Files Form, shared by DEV and PROD. No old primary Forms mapping is reused or invented.
- APK mode also requires negotiated v2 and sends the original per-target UXR measurements and task rating through the existing opaque Arcade channel. Local saving, Forms request-sent state and native acceptance are separate receipts. Forms/native retries remain independent, with no automatic reposts after reload.
- These are custom task UXR results, not new typed touchpad-atom fields. Geometry and measurements match the original task. See [Files task details](FILES_TASK.md).

## Collection readiness

The Forms are task-specific and shared across deployment environments: one Hunt-and-peck Form and one Files Form, each holding that task's objective data and feedback. Their mappings are read from the published respondent pages. The owner updated responder access, and both pages now accept anonymous requests; automatic email collection remains disabled. Collection uses separate task outboxes and never redirects historical submissions to a different Form.

Both tasks block measurement when their task-specific collection configuration is unavailable. Enabling collection does not relax the existing storage, capture or native-capability checks. Forms/native retries remain independent, and historical records retain their original destination rather than being backfilled into the replacement Forms.

## Validation scope

Offline browser tests intercept network requests and use mock native acceptance. The November20 Form check submitted the captured new-task result/feedback bodies as labelled tests to their actual task Forms and verified stored response counts; detailed answer equality remains limited by Google API quota. See [Form verification](TASK_FORM_VERIFICATION.md). Physical Surface Keyboard input, APK networking and Scuba receipt are not established by these checks.
