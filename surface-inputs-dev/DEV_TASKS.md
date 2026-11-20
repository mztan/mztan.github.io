# Additional guided DEV stages

Hunt-and-peck and Menu are stages four and five of DEV **Start Dogfooding**, after Targeting, Scrolling and twenty-prompt Typing. They are not extra landing choices. Production retains its existing three-stage flow.

## Hunt-and-peck typing

- Use only index or middle fingers; complete ten prompts from the existing natural-language-with-punctuation corpus and press Enter after each.
- Capture, calculations, canonical expected prompt/input stream and final text are unchanged. The task-specific H&P Form receives prompt results plus separate Likert/freeform feedback. Existing typed `keyboard_punctuation` and paired UXR/native feedback remain in APK mode, gated on v2.
- Prescribed finger/style metadata does not verify actual finger use. No new typed schema fields or wire versions are added.

## Menu

- Reach Menu after H&P feedback. Complete the original 3-level then 5-level gray paths. Hover opens submenus; a terminal selection completes each target. Wrong selections and empty-space dismissals remain separate measurements.
- Browser and APK retain local results and send full two-target JSON plus separate Likert/freeform feedback to the task-specific Menu Form. APK adds two original opaque UXR observations and one feedback event through v2.
- Only Menu feedback is final **Finish**. Receipt states and retries remain destination-specific; request sent or sink accepted does not establish server storage. See [Menu details](MENU_TASK.md).

## Preserved Files history

The Files page, original model/driver, collector entry, saved results and outboxes remain outside the new flow. New flow version 3 never rehydrates or relabels old version-2 Files data as Menu; old links restart without deleting history. No new landing choices are introduced.

## Collection and validation

Each task has one Form shared across environments. The parent's Menu endpoint/question mappings are included after the owner's respondent-access update. Parent review and a separately controlled stored-response test precede publication. H&P/Files mappings and prior verification are unchanged; [their earlier verification](TASK_FORM_VERIFICATION.md) is not Menu storage proof.

All client tests intercept HTTP and use mock native ports. They verify full client data/flow and original canvas rendering, not physical headset input, APK networking or Scuba/Google backend receipt. Unavailable configuration, storage or v2 capabilities block measurement without silently dropping a stage.
