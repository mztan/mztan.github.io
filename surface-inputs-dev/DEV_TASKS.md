# Additional DEV tasks

These task entries are available only in `surface-inputs-dev/`. They do not change the existing three-stage **Start Dogfooding** run or production.

## Hunt-and-peck typing

- Open **Hunt-and-peck typing** from the DEV home page.
- Use your index or middle fingers on Surface Keyboard. This is one task, not separate finger-specific tasks; do not use voice dictation.
- Complete **10 prompts** from the existing `keyboard/prompts/nat_lang_with_cap_punc.txt` corpus. Press Enter after each prompt.
- Prompt count and corpus are fixed for this task; ordinary typing retains its existing settings.
- The task reuses the existing keyboard capture, metric calculations, prompt-result Forms mapping and task-rating workflow. In APK mode it requires negotiated v2 before typing starts and emits the same complete typed keyboard observations plus existing UXR result rows.
- The UXR result metadata identifies `keyboard_hunt_and_peck` and the **prescribed** typing style/fingers. It does not measure or verify which fingers were actually used. Typed keyboard observations remain in the existing `keyboard_punctuation` category; no telemetry schema fields or wire versions are added.

## Files

The DEV entry imports jvision’s file drag-and-drop task as a separate task. The imported source and result behavior are documented with the task implementation; it is not added to the original guided run.

## Validation scope

Browser tests intercept all network requests. Mock native acceptance verifies client payloads and flow, not physical Surface Keyboard input or downstream Google Forms/Scuba storage.
