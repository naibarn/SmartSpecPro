# Identity Consistency Rules (Option F - Soft Face Lock)

## Purpose
Ensure all generated images preserve the same person's identity with flexibility for natural scene integration.

---

## Soft Lock Approach (90-95%)

### Problem with 100% Lock:
- Unnatural "cut-and-paste" appearance
- Poor lighting integration
- Visible edge artifacts
- Doesn't adapt to scene atmosphere

### Soft Lock Solution (90-95%):
- Strong identity recognition
- Natural lighting integration
- No edge artifacts
- Organic scene blending
- Professional results

---

## Core Philosophy

```
Preserve STRUCTURE (facial landmarks & proportions)
Allow COSMETIC adjustments (lighting, shadows, clarity)
Forbid GEOMETRY changes (bone structure, feature reshaping)
```

---

## What to PRESERVE (Main Landmarks)

### 1. Eye Structure
- Overall eye shape (almond, round, etc.)
- Relative eye spacing
- Eye angle/tilt
- General eyelid fold pattern

### 2. Nose Structure
- Bridge height & width (overall)
- Nose tip shape (general)
- Nostril size ratio
- Overall nose length

### 3. Mouth & Lips
- Lip shape proportions
- Mouth width ratio
- Cupid's bow (general shape)
- Lip thickness ratio

### 4. Jawline & Face Shape
- Overall jaw shape
- Chin position & projection
- Face width proportions
- Cheekbone prominence

---

## What's ALLOWED (Cosmetic)

### Soft Lighting Adjustments
- Match scene color temperature
- Adjust shadow intensity naturally
- Blend with ambient lighting
- Natural highlight placement

### Shadow Smoothing
- Soften harsh shadow edges
- Reduce minor under-eye shadows
- Natural shadow gradients
- Subtle contour adjustments

### Clarity Enhancement
- Improved skin detail
- Sharper feature definition
- Better overall image quality
- Natural sharpness

### Natural Integration
- Blend with scene atmosphere
- Match color palette
- Adapt to lighting conditions
- Organic depth of field

### Minor Touch-ups
- Slight blemish softening
- Minor imperfection smoothing
- Keep natural texture visible
- Maintain authenticity

---

## What's FORBIDDEN (Geometry)

### Facial Geometry Changes
- NO face shape changes
- NO jaw restructuring
- NO cheekbone repositioning
- NO chin alterations
- NO feature resizing

### Structure Modifications
- NO eye size changes
- NO nose reshaping
- NO lip proportion changes
- NO bone structure edits
- NO landmark repositioning

---

## Prompt Templates

### Default (F NOT selected):
```
Subject: Same woman, keep 90-95% facial identity.
```
No Soft Lock section. No landmarks mentioned.

### With F Selected:
```
Subject: Same woman, keep 90-95% facial identity.

Soft Lock: Preserve main landmarks (eyes, nose, mouth,
jaw, cheekbones). Allow soft lighting, shadow smoothing,
clarity—NO geometry changes.
```

---

## Multi-Image Identity Rule

When multiple reference images provided:
- **Image 1 = primary identity anchor**
- All facial geometry must come from Image 1
- Additional images may contribute:
  - Lighting
  - Textures
  - Outfits
  - Backgrounds
  - Poses
- Facial structure MUST NOT be influenced by secondary images

---

## Identity Preservation by Type

| Subject Type | Identity Preservation |
|---|---|
| Person (face) | 90-95% (Soft Lock) |
| Person (body) | General match |
| Product | 100% identical |
| Jewelry | 100% identical |
| Clothing pattern | 100% identical |
| Location | Atmosphere reference |

---

## Forbidden Model Behaviors

The model must not:
- Replace or redesign facial features
- Beautify in a way that alters bone structure
- Change ethnicity or mix features from other sources
- Over-smooth skin to the point of morphology loss
- Modify ratios of eyes, nose, lips, or jaw
- Produce a face that could reasonably appear as a different person

---

## Identity Verification Step

Before finalizing an image, verify:
1. Do all landmark ratios match the reference?
2. Would an ordinary viewer instantly recognize them as the same person?
3. Has the model unintentionally redesigned facial geometry?
4. Are morphological features preserved under new lighting/makeup?

If any answer is NO, regenerate the output.

---

## When to Use Option F

**Use F for**:
- Series shooting (multiple scenes, same person)
- Different lighting conditions
- Various backgrounds/settings
- Natural portrait consistency
- Professional photo series

**Not needed for**:
- Single image generation
- When flexible identity is acceptable
- Stylized/artistic interpretations

---

## Summary

- Identity is defined by landmarks & ratios, not pixels
- Preserve all stable morphology (90-95%)
- Only allow stylistic changes that do not modify bone structure
- Always check identity before finalizing
- Regenerate if identity drift occurs
