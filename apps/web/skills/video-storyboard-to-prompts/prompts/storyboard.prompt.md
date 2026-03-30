You are creating VIDEO GENERATION PROMPTS for AI video tools (Runway, Pika, Kling, Sora).

User Idea: {userIdea}
Continuity Notes: {continuityNotes}
Reference Notes: {referenceNotes}
Style: {style}
Tone: {tone}
Viral Strategy: {viralStrategy}
Scenes: {sceneCount}
Duration per scene: {targetDurationSeconds} ÷ {sceneCount} seconds
Base scene duration: [calculate targetDurationSeconds ÷ sceneCount and round to a clean human-readable number]
Speech budget target: [calculate about 65-70% of the base scene duration and round to a clean human-readable number]
Dialogue Language: {dialogueLanguage}
Background Mode: {backgroundMode}
Include Text Overlays: {includeTextOverlays}

CRITICAL REQUIREMENTS:
1. Generate {sceneCount} prompts that tell a complete story about: {userIdea}
2. Each prompt MUST explicitly mention "{style}" style at the beginning
3. Each prompt must be copy-paste ready for video AI tools
4. Every scene MUST include spoken character dialogue for natural lip-sync in {dialogueLanguage}
5. CHARACTER CONSISTENCY RULE:
   - Establish one fixed protagonist and any recurring supporting characters before writing Prompt 1.
   - Reuse the exact same character names, age, species, facial traits, clothing colors, accessories, and signature objects in every prompt.
   - If Continuity Notes are provided, treat them as the canonical character bible and repeat them consistently in every prompt.
   - If Continuity Notes are empty, infer a short but specific character bible from the User Idea and any reference images, and keep it identical across all prompts.
6. REFERENCE IMAGE RULE:
   - If reference images are attached, inspect them as the source of truth for character identity and visual continuity.
   - If the image is a character reference, preserve the same face, hairstyle, body shape, outfit colors, accessories, pose language, and signature props across all prompts.
   - If the image is an object, product, or prop reference, preserve its shape, color, material, markings, and distinctive details across all prompts.
   - If the image is a scene or location reference, preserve its composition, perspective, layout, and lighting mood across all prompts.
   - If the image also contains readable text or lettering, preserve it only when that text is part of the intended design and is explicitly meant to remain visible.
   - If Reference Notes are provided, treat them as the authoritative note for what the attached image should contribute.
   - If Reference Notes are empty, synthesize a concise continuity bible from the User Idea and reference images, then reuse it verbatim in every prompt.
7. SCENE CONSISTENCY RULE:
   - Reuse the exact same core location, time of day, weather, and background anchors across prompts unless the story intentionally changes them.
   - Every prompt must clearly anchor the viewer in the same story world so each clip feels like one continuous narrative.
8. DIALOGUE TIMING RULE:
   - Spoken dialogue must fit naturally inside the scene duration without rushing.
   - Use only about 60-75% of the scene time for speech, leaving the rest for reaction, movement, camera beats, and breath.
   - For 4-8 second scenes, prefer one short line or one short clause instead of a long sentence.
   - If the scene needs more words than the duration can comfortably hold, move the extra information into the next scene.
   - Think of each scene as having a speech budget: shorter scenes get shorter dialogue, and short platforms like Veo 3.1 should stay especially compact.
   - Also output a concrete speech budget label per scene so the prompt reads clearly, such as "Dialogue Budget: 1 short sentence, ~5-6 seconds max" or "Dialogue Budget: 1 short clause, ~3-4 seconds max" depending on duration.
   - Recommended mapping:
     * 4-5 seconds: "Dialogue Budget: 1 short clause, ~3-4 seconds max"
     * 6-7 seconds: "Dialogue Budget: 1 short sentence, ~4-5 seconds max"
     * 8-10 seconds: "Dialogue Budget: 1 short sentence, ~5-6 seconds max"
     * 11+ seconds: "Dialogue Budget: 1 short sentence + brief reaction beat, ~7-8 seconds max"
   - Language examples:
     * English: "Dialogue Budget: ~5.5 seconds max"
     * Thai: "Dialogue Budget: ~5.5 วินาที max"
     * Mixed: "Dialogue Budget: ~4.5 seconds max / ~4.5 วินาที max"
   - Prefer numeric speech budgets in 0.5-second increments when possible, such as "~4.5 seconds max" or "~6.0 seconds max", so the prompt has a consistent numeric benchmark.
9. BACKGROUND MODE RULE: {backgroundMode}
   - If "normal": Use natural/story-specific backgrounds that match each scene.
   - If "green_screen": Every scene must use a clean solid chroma green background, evenly lit, with no detailed location background.
   - Keep background mode consistent across all prompts.
10. TEXT OVERLAY RULE: {includeTextOverlays}
   - If "true": You MAY add one extra line for on-screen text overlay in {dialogueLanguage}
   - If "false": DO NOT include any on-screen text overlay
   - Spoken dialogue is still REQUIRED regardless of includeTextOverlays value
11. Use {viralStrategy} strategy (especially in first prompt for hook)
12. Maintain {tone} tone throughout
13. Every prompt must begin with a short Continuity Lock line that repeats the fixed character, scene, and reference-image anchors verbatim.
14. Do not invent new recurring characters or major setting changes after Prompt 1 unless the user explicitly asks for a story shift.

OUTPUT FORMAT (plain text, no markdown, no headers, no technical notes):

REFERENCE NOTES (shared across all prompts):
[if the user left Reference Notes empty, generate a concise inferred continuity bible here with recurring character + location anchors, then repeat it verbatim in every prompt]

PROMPT 1 (Hook - [calculated duration] seconds):
Continuity Lock: [repeat the exact fixed character, setting, and reference-image anchors here]
A high-quality {style} clip ([calculated duration] seconds).
Dialogue Budget: [calculate from base scene duration; e.g. ~4.5 seconds max / ~5.0 seconds max / ~6.5 seconds max]
Dialogue Budget Example: [e.g. English: ~5.5 seconds max | Thai: ~5.5 วินาที max | Mixed: ~5.5 seconds max / ~5.5 วินาที max]
Speaker: [character name]
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "[exact spoken line]"
Emotion: [emotion and intensity]
Body movement: [body movement]
Action: [what happens in this scene]
The villain/object reaction: [reaction if any]
Environment reaction: [lighting/background reaction]
Camera: [camera framing and movement]
Lighting: [lighting setup]
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
[ONLY IF includeTextOverlays is true: On-screen text overlay in {dialogueLanguage}: "[exact text]"]
No subtitles, no on-screen text (except optional overlay when enabled), no narrator. Only character voice.

PROMPT 2 ([calculated duration] seconds):
Continuity Lock: [repeat the exact fixed character, setting, and reference-image anchors here]
A high-quality {style} clip ([calculated duration] seconds).
Dialogue Budget: [calculate from base scene duration; e.g. ~4.0 seconds max / ~4.5 seconds max / ~5.5 seconds max]
Dialogue Budget Example: [e.g. English: ~4.5 seconds max | Thai: ~4.5 วินาที max | Mixed: ~4.5 seconds max / ~4.5 วินาที max]
Speaker: [character name]
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "[exact spoken line]"
Emotion: [emotion and intensity]
Body movement: [body movement]
Action: [what happens in this scene]
The villain/object reaction: [reaction if any]
Environment reaction: [lighting/background reaction]
Camera: [camera framing and movement]
Lighting: [lighting setup]
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
[ONLY IF includeTextOverlays is true: On-screen text overlay in {dialogueLanguage}: "[exact text]"]
No subtitles, no on-screen text (except optional overlay when enabled), no narrator. Only character voice.

PROMPT 3 ([calculated duration] seconds):
Continuity Lock: [repeat the exact fixed character, setting, and reference-image anchors here]
A high-quality {style} clip ([calculated duration] seconds).
Dialogue Budget: [calculate from base scene duration; e.g. ~6.5 seconds max / ~7.0 seconds max]
Dialogue Budget Example: [e.g. English: ~6.5 seconds max | Thai: ~6.5 วินาที max | Mixed: ~6.5 seconds max / ~6.5 วินาที max]
Speaker: [character name]
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "[exact spoken line]"
Emotion: [emotion and intensity]
Body movement: [body movement]
Action: [what happens in this scene]
The villain/object reaction: [reaction if any]
Environment reaction: [lighting/background reaction]
Camera: [camera framing and movement]
Lighting: [lighting setup]
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
[ONLY IF includeTextOverlays is true: On-screen text overlay in {dialogueLanguage}: "[exact text]"]
No subtitles, no on-screen text (except optional overlay when enabled), no narrator. Only character voice.

[... continue for all {sceneCount} scenes ...]

PROMPT {sceneCount} ([calculated duration] seconds):
Continuity Lock: [repeat the exact fixed character, setting, and reference-image anchors here]
A high-quality {style} clip ([calculated duration] seconds).
Dialogue Budget: [calculate from base scene duration; keep it concise and proportional to the same scene-duration formula, rounded to ~0.5 second]
Dialogue Budget Example: [e.g. English: ~5.0 seconds max | Thai: ~5.0 วินาที max | Mixed: ~5.0 seconds max / ~5.0 วินาที max]
Speaker: [character name]
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "[exact spoken line]"
Emotion: [emotion and intensity]
Body movement: [body movement]
Action: [what happens in this scene]
The villain/object reaction: [reaction if any]
Environment reaction: [lighting/background reaction]
Camera: [camera framing and movement]
Lighting: [lighting setup]
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
[ONLY IF includeTextOverlays is true: On-screen text overlay in {dialogueLanguage}: "[exact text]"]
No subtitles, no on-screen text (except optional overlay when enabled), no narrator. Only character voice.

REMEMBER:
- Output ONLY the prompts (PROMPT 1, PROMPT 2, etc.)
- NO headers before prompts
- NO technical notes after prompts
- Ensure every prompt includes Speaker + spoken dialogue + lip-sync instruction
- Ensure every prompt includes the exact same Continuity Lock and fixed recurring character, scene, and reference-image anchors
- Ensure each spoken line is concise enough to fit the scene duration naturally; for short scenes, shorten the dialogue instead of forcing every detail into one prompt
- If Reference Notes were empty, generate them from the User Idea/reference images and keep them consistent across all prompts
- Ensure background in every prompt strictly matches backgroundMode ({backgroundMode})
- Stay true to concept: {userIdea}
- Plain text only, no code blocks
- If includeTextOverlays is false, NEVER mention on-screen text overlays
