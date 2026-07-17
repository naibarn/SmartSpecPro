# Research Notes

- Production trace `kZA-xRA1AAbX_XsdmP3BH` received `ภาพเต็มตัว บรรยากาศแสงแดดยามเช้า ห้องสว่าง` but returned a portrait-oriented `primary_portrait_prompt` that honored only morning light.
- `generateCharacterImage` submits `portraitPrompt` unconditionally to `mediaGenerationService.generateImageAsync`.
- The runtime skill is lowercase `skill.md`; it already instructs the model to apply full-body custom instructions to `primary_portrait_prompt`, proving prompt-only enforcement is insufficient.
- Existing router tests assert only flow-through into `generateCharacterVisualPrompts`; they do not inspect the final provider payload.
- The approved-prompt branch currently skips planning and treats `customInstruction` as a no-op.
- SocratiCode preflight failed with `Transport closed`; discovery used bounded log and source reads.
- Target runtime/test files were clean before implementation; the approved design document is newly added.
