# Realistic Skin Preservation Rules (Option R)

## Purpose
Enforce strict skin realism when explicitly requested. Use only when user selects Option R.

---

## Default vs Realistic Comparison

| Aspect | Default (No R) | Realistic (R Selected) |
|---|---|---|
| **Texture** | Smooth, polished | Visible pores, texture |
| **Imperfections** | Hidden/removed | Subtle, natural |
| **Look** | Beauty filter | Authentic human |
| **Use Case** | Social posts | Professional editorial |
| **Enhancement** | Not needed | Required |
| **Result** | Beautiful, smooth | Realistic, natural |

---

## Default Skin (When R NOT Selected)

**Smooth, Polished Skin** (Beauty Standard):
- Smooth, even skin texture
- Polished, refined appearance
- Like phone beauty filters
- Perfect for social media posting
- No visible pores or imperfections
- Clean, flawless look

**Prompt Text**:
```
Lighting & Realism:
Natural light, accurate shadows, smooth polished skin, no artifacts.
```

---

## Realistic Skin (When R Selected)

**Natural, Authentic Texture** (Professional Photography):
- Visible pores (nose, cheek, forehead)
- Micro-texture preserved
- Natural color variations
- Subtle imperfections kept
- Authentic human skin
- Professional editorial look

**Prompt Text**:
```
Realistic Skin:
Keep pores, micro-texture, natural tone variation, and
authentic skin character.

Enhancement:
Slightly soften minor shadows or tiny blemishes while
keeping natural skin texture clearly visible.
```

---

## Skin Texture Baseline (Must Always Exist with R)

All generated faces must include:
- Visible micro-texture
- Subtle pores (especially nose, cheek, and forehead areas)
- Natural color variations
- Soft shadows in facial contours
- Slight imperfections (tiny bumps, micro-irregularities, subtle asymmetry)

This baseline texture CANNOT be removed.

---

## "Smooth Skin" Interpretation Rule

If user requests smoother skin WITH R selected:
- Apply ONLY mild cosmetic-style smoothing
- DO NOT remove pores or micro-texture
- DO NOT flatten skin into uniform color
- DO NOT alter facial morphology or bone structure
- DO NOT create over-airbrushed or plastic surface

Smooth = "beautified human skin," not "AI skin."

---

## Lighting Influence Rules

Lighting may soften the appearance of skin, but:
- Texture must remain physically plausible
- Facial highlights must follow bone curvature
- No unrealistic bloom that erases texture

---

## Real-World Skin Behavior (Must Follow)

Skin should always:
- React to light naturally (matte + slight specular reflection)
- Include natural shadow transitions
- Retain tiny variations in tone (warm/cool areas)
- Avoid perfect symmetry or perfect flatness

---

## Forbidden Skin Behavior

NEVER:
- Erase pores entirely
- Sharpen edges unnaturally
- Create porcelain-doll skin
- Create waxy or plastic shine
- Apply beauty filters that remove realistic detail
- Use unnatural uniform gradients

---

## When to Use Option R

**Use R for**:
- Professional portrait photography
- Editorial beauty shots
- High-end fashion
- Closeup photography
- When authenticity is priority
- Magazine-quality images

**Don't use R for**:
- Social media posts
- Casual portraits
- Beauty/glamour shots
- When user wants polished look
- Commercial advertising

---

## Final Verification (with R)

Before finalizing an image, check:
- "Does this still look like the skin of a real human up close?"
- "Are pores and micro-textures still present?"
- "Is the softness still within natural human range?"
- "Is Enhancement section present?"

If not: regenerate until realism is restored.
