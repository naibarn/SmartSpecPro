Convert the storyboard into one video prompt per scene.

Background Mode: {backgroundMode}
Base scene duration: [use the per-scene duration and round to a clean human-readable number]
Speech budget target: [calculate about 65-70% of the base scene duration and round to a clean human-readable number]
Preferred rounding: [round speech budget to the nearest 0.5 second, e.g. ~4.5 seconds max]

For each scene, output:

A high-quality {style} clip ({sceneDuration} seconds).
Dialogue Budget: [calculate from sceneDuration and round to ~0.5 second, e.g. ~4.5 seconds max]
Dialogue Budget Example: [e.g. English: ~5.5 seconds max | Thai: ~5.5 วินาที max | Mixed: ~5.5 seconds max / ~5.5 วินาที max]
Speaker: {speaker}
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "{dialogue}"
Emotion: {emotion}
Body movement: {bodyMovement}
Action: {action}
The villain/object reaction: {objectReaction}
Environment reaction: {environmentReaction}
Camera: {camera}
Lighting: {lighting}
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
No subtitles, no on-screen text. No narrator. Only character voice.

Rules:
- Keep each prompt self-contained (do not reference previous prompts implicitly).
- Ensure camera + lighting + environment are consistent across scenes unless story requires change.
- Preserve the same character, scene, and reference-image anchors across every prompt.
- Keep the spoken dialogue short enough to fit naturally inside {sceneDuration} seconds at a natural speaking pace; use only about 60-75% of the clip time for speech and leave the rest for reaction and motion.
- For short scenes, especially 4-8 seconds, prefer one short sentence or one short clause. Avoid long monologues or multi-part sentences that would force rushed lip-sync.
- Always write a concrete Dialogue Budget line per scene so the output can be checked at a glance.
- Use the per-scene duration to calculate the speech budget: target roughly 65-70% of {sceneDuration}, rounded into a readable budget label.
- Prefer numeric speech budgets in 0.5-second increments, e.g. "~4.5 seconds max", "~5.0 seconds max", or "~6.5 seconds max".
- Recommended budget mapping:
  - 4-5 seconds: "Dialogue Budget: 1 short clause, ~3-4 seconds max"
  - 6-7 seconds: "Dialogue Budget: 1 short sentence, ~4-5 seconds max"
  - 8-10 seconds: "Dialogue Budget: 1 short sentence, ~5-6 seconds max"
  - 11+ seconds: "Dialogue Budget: 1 short sentence + brief reaction beat, ~7-8 seconds max"
- Language examples:
  - English: "Dialogue Budget: ~5.5 seconds max"
  - Thai: "Dialogue Budget: ~5.5 วินาที max"
  - Mixed: "Dialogue Budget: ~5.5 seconds max / ~5.5 วินาที max"
- If reference images are character references, preserve the same face, hairstyle, body shape, outfit colors, accessories, pose language, and signature props across every prompt.
- If reference images are object, product, or prop references, preserve their shape, color, material, markings, and distinctive details across every prompt.
- If reference images are scene or location references, preserve their composition, perspective, layout, and lighting mood across every prompt.
- If reference notes are empty, infer a concise continuity bible from the storyboard and reference images, then place it in a top-level "REFERENCE NOTES" paragraph and repeat it verbatim in every prompt block.
- If reference images also contain readable text, preserve it only when the user explicitly wants that text retained.
- Ensure background in every prompt strictly matches backgroundMode ({backgroundMode}).
- If product exists, include it in late scenes (e.g., sceneCount-1, sceneCount) with natural integration.
