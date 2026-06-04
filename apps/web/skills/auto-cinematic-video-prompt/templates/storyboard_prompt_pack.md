# Storyboard Prompt Pack Template

Create a cinematic multi-shot video prompt package in {{aspect_ratio}} at {{frame_rate}} fps. Total duration: {{duration.total_seconds}} seconds.

Master continuity: use the reference material as the visual ground truth. Preserve identity, wardrobe, materials, colors, hair, makeup, skin texture, set geometry, props, lighting direction, shadow quality, atmosphere, and color grade across every shot.

Storyboard rules:
- Each shot must have a unique camera position or shot scale.
- Do not repeat near-identical compositions in adjacent shots.
- Keep motion slow, elegant, and physically plausible.
- Maintain cinematic continuity, not redesign.
- No new characters, no new outfits, no new props, no background morphing.

For each shot, output:
1. Shot ID
2. Duration
3. Camera position
4. Camera movement
5. Subject action
6. Start visual state
7. End visual state
8. Seedance-ready prompt
9. Negative prompt

Negative prompt for all shots: {{negative_prompt}}
