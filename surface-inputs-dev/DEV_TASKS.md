# Additional DEV tasks

These task entries are available only in `surface-inputs-dev/`. They do not change the existing three-stage **Start Dogfooding** run or production.

## Hunt-and-peck typing

- Open **Hunt-and-peck typing** from the DEV home page.
- Use your index or middle fingers on Surface Keyboard. This is one task, not separate finger-specific tasks; do not use voice dictation.
- Complete **10 prompts** from the existing `keyboard/prompts/nat_lang_with_cap_punc.txt` corpus. Press Enter after each prompt.
- Prompt count and corpus are fixed for this task; ordinary typing retains its existing settings.
- The task reuses the existing keyboard capture and metric calculations. Each completed prompt retains its full canonical expected prompt, input-event stream, final typed text and unchanged metric result before sending to the dedicated DEV task Form. The task-level Likert score and free-form comment use the same Form as a separate feedback record.
- In APK mode, negotiated v2 is required before typing begins. Existing typed keyboard observations and paired UXR results remain, with task-level feedback also sent through Arcade telemetry. Forms and native retries are destination-specific; no completed prompt is recomputed, truncated or automatically reposted after reload.
- The UXR result metadata identifies `keyboard_hunt_and_peck` and the **prescribed** typing style/fingers. It does not measure or verify which fingers were actually used. Typed keyboard observations remain in the existing `keyboard_punctuation` category; no telemetry schema fields or wire versions are added.

## Files

- Open **Files** from the DEV home page. Complete the original three file-to-folder targets using the copied jvision drag, scroll, wrong-target and cancellation behavior.
- Browser and APK both retain local results and send the complete three-target measurement JSON and separate Likert/free-form feedback to the dedicated DEV task Form. No old primary Forms mapping is reused or invented.
- APK mode also requires negotiated v2 and sends the original per-target UXR measurements and task rating through the existing opaque Arcade channel. Local saving, Forms request-sent state and native acceptance are separate receipts. Forms/native retries remain independent, with no automatic reposts after reload.
- These are custom task UXR results, not new typed touchpad-atom fields. Geometry and measurements match the original task. See [Files task details](FILES_TASK.md).

## Collection readiness

The dedicated Form is created and published. Its current anonymous respondent request returns Google’s sign-in page, and the marked integration test was not stored. Automatic Google email collection is disabled, but sign-in is still required. The captured endpoint/question mappings remain disabled and unverified for live delivery until respondent access and an actual stored-response check are resolved. No public sharing or access-widening change was made.

Both tasks block measurement when their dedicated collection configuration is unavailable. Offline tests use an explicitly enabled fixture configuration and intercept every network request; they do not substitute for live Form or headset/backend proof.

## Validation scope

Browser tests intercept all network requests. Mock native acceptance verifies client payloads and flow, not physical Surface Keyboard input or downstream Google Forms/Scuba storage.
