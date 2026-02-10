Convert the storyboard into one video prompt per scene.

Background Mode: {backgroundMode}

For each scene, output:

A high-quality {style} clip ({sceneDuration} seconds).
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
- Ensure background in every prompt strictly matches backgroundMode ({backgroundMode}).
- If product exists, include it in late scenes (e.g., sceneCount-1, sceneCount) with natural integration.
