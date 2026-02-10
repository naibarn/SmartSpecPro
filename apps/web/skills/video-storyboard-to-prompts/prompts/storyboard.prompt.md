You are creating VIDEO GENERATION PROMPTS for AI video tools (Runway, Pika, Kling, Sora).

User Idea: {userIdea}
Style: {style}
Tone: {tone}
Viral Strategy: {viralStrategy}
Scenes: {sceneCount}
Duration per scene: {targetDurationSeconds} ÷ {sceneCount} seconds
Dialogue Language: {dialogueLanguage}
Background Mode: {backgroundMode}
Include Text Overlays: {includeTextOverlays}

CRITICAL REQUIREMENTS:
1. Generate {sceneCount} prompts that tell a complete story about: {userIdea}
2. Each prompt MUST explicitly mention "{style}" style at the beginning
3. Each prompt must be copy-paste ready for video AI tools
4. Every scene MUST include spoken character dialogue for natural lip-sync in {dialogueLanguage}
5. BACKGROUND MODE RULE: {backgroundMode}
   - If "normal": Use natural/story-specific backgrounds that match each scene.
   - If "green_screen": Every scene must use a clean solid chroma green background, evenly lit, with no detailed location background.
   - Keep background mode consistent across all prompts.
6. TEXT OVERLAY RULE: {includeTextOverlays}
   - If "true": You MAY add one extra line for on-screen text overlay in {dialogueLanguage}
   - If "false": DO NOT include any on-screen text overlay
   - Spoken dialogue is still REQUIRED regardless of includeTextOverlays value
7. Use {viralStrategy} strategy (especially in first prompt for hook)
8. Maintain {tone} tone throughout

OUTPUT FORMAT (plain text, no markdown, no headers, no technical notes):

PROMPT 1 (Hook - [calculated duration] seconds):
A high-quality {style} clip ([calculated duration] seconds).
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
A high-quality {style} clip ([calculated duration] seconds).
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
A high-quality {style} clip ([calculated duration] seconds).
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
A high-quality {style} clip ([calculated duration] seconds).
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
- Ensure background in every prompt strictly matches backgroundMode ({backgroundMode})
- Stay true to concept: {userIdea}
- Plain text only, no code blocks
- If includeTextOverlays is false, NEVER mention on-screen text overlays
