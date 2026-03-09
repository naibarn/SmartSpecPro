# Veo 3.1 Prompt Guide — Quick Reference

## Prompt Formula

Every Veo 3.1 prompt should follow this structure:

```
[CINEMATOGRAPHY] Shot size + camera angle + camera movement.
[SUBJECT] Who/what — unique traits, wardrobe, defining marks.
[ACTION] Strong verbs + micro-actions + facial expression.
[CONTEXT] Location + props + time of day + weather + era.
[STYLE & LIGHTING] Film look + palette + key lighting keywords.
[AUDIO] Dialogue with Speaker: format. Ambient + SFX in separate sentences.
[CONSTRAINTS] Aspect ratio, duration, resolution (implicit from API config).
```

## Key Technical Constraints

| Parameter | Values | Notes |
|-----------|--------|-------|
| Duration | 4, 6, 8s | **8s required** for 1080p/4K/reference images |
| Aspect Ratio | 16:9, 9:16 | No 1:1 support |
| Resolution | 720p, 1080p, 4K | Higher = longer generation |
| Reference Images | Max 3 | Preserves subject identity |
| Extension | Max 20 rounds | ~7s/round, max ~148s total, 720p only |
| Frame Rate | 24 fps | Fixed |
| Prompt Language | English | Best results in English for visual description |

## Audio Prompt Patterns

### Dialogue Format
```
Host says (Thai, warm tone): "สวัสดีครับ วันนี้เราจะมาคุยกัน"
Guest replies (Thai, thoughtful): "น่าสนใจมากเลยค่ะ"
```

### Ambient + SFX
```
Ambient: soft café room tone, distant espresso machine hiss.
SFX: ice clinks, door closing softly, keyboard typing.
```

### Mixing Cues
- "in foreground" / "in background" / "subtle" / "distant"
- "dialogue clear in foreground, ambient subtle in background"

## Character Locking Strategy

### Reference Image Allocation (max 3)
- **1 character**: Character portrait + 2 optional scene refs
- **2 characters + scene**: Character A, Character B, Location
- **3 characters**: Character A, B, C (no scene ref)
- **4+ characters**: Split into 2 clips to prevent drift

### Character Bible Pattern
Describe UNIQUE traits that don't change:
- Age, build, hairstyle, hair color
- Facial features (beauty mark, scar, glasses)
- Wardrobe, accessories, colors
- Voice quality descriptor

## Timestamp Multi-Shot Pattern

```
[00:00-00:02] Wide shot, slow pan. Night market alley, colorful lights.
SFX: crowd murmur, sizzling wok.
[00:02-00:04] Close-up of vendor's hands preparing food. Shallow DOF.
SFX: chopping, oil sizzle.
[00:04-00:06] Medium shot, narrator facing camera, calm smile.
Narrator says (Thai): "แค่ 8 วินาทีก็เล่าเรื่องได้"
[00:06-00:08] Slow tilt up to lanterns, ambient fading.
```

## Common Mistakes to Avoid

1. **Don't use negative phrasing** ("no text", "don't show") — describe what IS present
2. **Don't overload sentences** — one concept per sentence
3. **Don't use quotation marks** for non-dialogue text
4. **Don't exceed 3 reference images** — more causes drift
5. **Don't request 4/6s with 1080p/4K** — must be 8s
6. **Don't put multiple events in one shot** — keep scenes focused
7. **Don't ignore audio** — Veo 3.1 generates native audio, always specify

## First & Last Frame Anchoring

The first and last frames of a Veo clip are the most "locked" — Veo commits to them early:
- **First frame**: Anchor your composition here. Place subjects, set lighting, establish the shot.
- **Last frame**: Controls what the extension prompt inherits. If you want smooth extension, end with a stable pose/framing.
- **Transition trick**: Describe the last 1-2 seconds as a subtle motion or hold to create clean extension points.
- For storyboard/multi-clip: Make the last frame of clip N visually compatible with the first frame of clip N+1.

## Extension Best Practices

- Input must be 720p, max 141 seconds
- Voice carries over if present in last 1 second
- Each extension adds ~7 seconds
- Describe "what happens next" in extension prompt
- Total max: ~148 seconds (original + 20 extensions)

## SynthID Watermark

All Veo 3.1 outputs contain an invisible **SynthID** watermark:
- Embedded at generation time; cannot be removed or disabled
- Survives light editing (trim, resize) but may degrade with heavy re-encoding
- Does not affect visual quality
- Used for AI-generated content identification/provenance

## Style-to-Settings Quick Map

| Style | Shot | Movement | Lighting | Audio |
|-------|------|----------|----------|-------|
| Host/Interview | MCU, static | Static/rack focus | 3-point | Dialogue + room tone |
| B-roll | Wide/aerial | Pan/drone | Natural/golden | Ambient + SFX |
| Product | Close-up | Dolly/arc | High-key/rim | SFX + ambient |
| Documentary | Wide/medium | Handheld | Natural | VO + ambient |
| Action | Wide/tracking | Tracking/handheld | Dynamic | SFX heavy |
| Night Scene | Wide/medium | Pan/static | Neon/practical | City ambient |
