---
name: cinematic-prompt-refiner-pro
description: Imported from shared skill bundle (cinematic-prompt-refiner-pro.zip)
category: other
version: 1.0.0
icon: sparkles
tags:
  - shared-skill
  - imported
auto_trigger: false
trigger_patterns: []
enabled_by_default: false
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
config:
  media_studio:
    auto_learning:
      enabled: false
      prompt_qa_after_auto_prompt: true
      image_qa_after_generation: true
      require_admin_approval: true
      min_prompt_score_to_pass: 85
      min_image_fidelity_score_to_pass: 80
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Cinematic Prompt Refiner Pro

## Purpose
Convert any user-provided prompt into a complete cinematic prompt for image generation or video generation while preserving the original intent, scene purpose, characters, actions, emotional direction, and narrative meaning.

This skill is designed for workflows where reference images may already be attached. Therefore, the refined prompt should not waste space describing character appearance, clothing, face identity, product details, or location details unless those details are story-critical or explicitly requested by the source prompt.

The main focus is cinematic expression: movement, acting, emotion, micro-expression, gaze, blocking, camera language, framing, pacing, lighting mood, and continuity.

## Character Limits
- Image prompt: aim to stay under 3500 characters.
- Video prompt: aim to stay under 2000 characters.
- If the source prompt is long, compress intelligently while preserving core intent.
- Never mention the character limit inside the final optimized prompt.

## Non-Negotiable Preservation Rule
The refined prompt must not change the original purpose.

Preserve:
- main subject
- action
- emotional goal
- relationship between characters
- scene meaning
- shot purpose
- product or story objective
- required aspect ratio
- required camera angle or lighting if specified
- negative constraints given by the user

Do not add:
- new characters
- new locations
- new plot events
- new props
- unrelated visual motifs
- exaggerated emotions
- action that contradicts the source prompt

Only add cinematic details that clarify or strengthen the original intent.

## Target Type Logic

### Auto
If target_type is `auto`, infer the best target:
- Use `image` when the source prompt asks for a still frame, start frame, key visual, poster, product image, storyboard panel, or single image.
- Use `video` when the source prompt mentions motion, camera movement, duration, transition, action sequence, start/stop frame, audio, or image-to-video.
- If both are present, prioritize `video` unless the prompt clearly asks only for a still start frame.

### Image Prompt Mode
For image prompts, translate motion into a visually frozen cinematic moment.

Prioritize:
- still-frame clarity
- frozen action
- pose tension
- eye direction
- facial micro-expression
- body language
- composition
- negative space
- foreground/background depth
- light quality
- cinematic realism

Use language such as:
- cinematic vertical 9:16 still frame
- captured mid-action
- frozen moment
- subtle posture tension
- eyes reveal alertness
- medium shot / close-up / wide shot
- eye-level / low angle / overhead
- soft natural light / cool overcast / warm dusk glow
- negative space toward the direction of gaze
- background stays soft and non-distracting

Avoid excessive movement terms in image mode. Prefer “captured as if just beginning to move” instead of “walks forward continuously.”

### Video Prompt Mode
For video prompts, prioritize motion and temporal acting beats.

Prioritize:
- movement path
- camera motion
- pacing
- timing
- facial expression transition
- body mechanics
- gaze shift
- interaction with environment
- continuity from attached image
- subtle realism

Use language such as:
- subtle slow push-in
- controlled handheld tension
- eyes shift first, body follows
- breath catches
- delayed reaction
- slight head turn
- shoulders tighten
- pacing begins restrained then tightens
- camera remains steady with minimal drift
- preserve identity and scene continuity

Avoid dense location or appearance description unless required.

## Cinematic Style Modes

### Neutral Cinematic
Default realistic cinematic enhancement. Suitable for most prompts.

### Drama
Emphasize acting nuance, emotional tension, micro-expression, gaze direction, silence, hesitation, subtext, and character dynamics. Avoid melodrama unless requested.

### Commercial
Emphasize clean visibility, product clarity, natural lifestyle use, polished lighting, brand-safe realism, and smooth motion. Do not over-stylize. Keep the product or main subject recognizable.

### Social Clip
Emphasize clarity, fast readability, clean action beats, strong first-frame hook, short-form pacing, and minimal ambiguity. Keep motion simple and visually understandable.

### Storyboard
Emphasize shot structure, panel clarity, visual continuity, distinct beats, and scene progression. If a single frame is requested, keep it as one frame; do not create multiple panels unless requested.

## Preservation Strength

### Flexible
Allows moderate cinematic interpretation while preserving the core intent.

### Standard
Default. Improves cinematic quality while keeping all key actions and emotional meaning intact.

### Strict
Use when the user needs high fidelity to the original prompt.
- Keep all key actions.
- Keep named characters.
- Keep specified composition, lighting, aspect ratio, mood, camera angle, and constraints.
- Do not introduce additional scene elements.
- Only refine language, reduce ambiguity, and strengthen cinematic clarity.

## Enhancement Intensity

### Light
Minimal rewrite. Clean grammar, remove ambiguity, add only small cinematic improvements.

### Balanced
Recommended default. Improves structure, camera language, emotion, and action while preserving the source prompt.

### Strong
More cinematic and production-ready. Still must not change the original intent.

## Handling Attached Images
When reference images are attached or expected:
- Assume character identity, clothing, face, product design, room layout, and location appearance are already defined by the images.
- Say “preserve the attached reference identity/product/location” only if helpful.
- Do not re-describe visual identity in detail.
- Spend prompt budget on acting, movement, camera, pacing, and emotional direction.

## Output Language
Use the requested output language:
- `auto`: preserve the language style of the source prompt when possible.
- `english`: produce the optimized prompt in English.
- `thai`: produce the optimized prompt in Thai.
- `bilingual`: produce the optimized prompt primarily in English with short Thai support notes only when useful.

For most image/video generation tools, English prompt output is often preferred. If the user chooses Thai, still keep key cinematic terms clear and tool-friendly.

## Negative Constraint Handling
If include_negative_constraints is true, add a compact final constraint line when useful.
Examples:
- no text, no captions, no extra characters, no exaggerated motion, no identity drift, no distorted hands, no low-key darkness

Do not overload negative constraints. Keep them short and relevant.

## Compression Strategy
If the source prompt is too long:
1. Preserve required intent and actions.
2. Keep the strongest emotional and cinematic details.
3. Remove repeated adjectives.
4. Remove redundant appearance/location details covered by attached images.
5. Keep only one clear camera direction.
6. Keep only the most important lighting instruction.
7. Keep negative constraints only if they prevent common failure.

## Output Requirements
Return structured output according to the output schema:
- target_type
- optimized_prompt
- character_count
- within_limit
- preserved_intent_summary
- changes_made
- risk_flags
- notes

The optimized_prompt must be directly usable as the final generation prompt.
Do not include analysis inside optimized_prompt.
Do not include markdown headings inside optimized_prompt unless the user explicitly requests formatting.
