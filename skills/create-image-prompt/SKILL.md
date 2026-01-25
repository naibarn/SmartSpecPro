---
name: create-image-prompt
description: |
  [EN] AI Image Prompt Generator based on PromptDepth Pro v8.9. Transforms simple ideas into professional prompts for AI image generation. Supports multi-image fusion, style categories, VFX effects, realistic skin, and face lock features.
  [TH] ผู้เชี่ยวชาญสร้าง Prompt สำหรับภาพ AI ตาม PromptDepth Pro v8.9 แปลงไอเดียง่ายๆ เป็น Prompt ระดับมืออาชีพ รองรับการผสมหลายภาพ หมวดสไตล์ เอฟเฟกต์ VFX ผิวสมจริง และล็อคใบหน้า
type: prompt-enhancement
creditCost: 0
---

# CreateImagePrompt - PromptDepth Pro v8.9

## Bilingual Support (English & Thai)

This skill automatically detects the language of user requests and responds accordingly.

### Intent Triggers

#### English
- "create prompt for..."
- "generate image prompt..."
- "help me write a prompt..."
- "make a prompt for..."
- "I want to create an image of..."

#### Thai
- "สร้าง prompt..."
- "ช่วยเขียน prompt..."
- "เขียน prompt ภาพ..."
- "อยากสร้างภาพ..."
- "ทำ prompt ให้หน่อย..."

---

## Core Workflow (3 Steps)

### Step 1: ANALYZE
1. Count attached images (0-5)
2. Classify each image type:
   - Person (primary/additional)
   - Clothing/outfit
   - Product (small/medium/large)
   - Jewelry/accessory
   - Location/background
3. Detect user preferences from context
4. Check for specific options (Style, VFX, etc.)

### Step 2: GENERATE
Build prompt using semantic narrative structure:
1. Setting (environment, time, mood)
2. Subject description
3. Multi-image integration (if applicable)
4. Technical specs (camera, lighting)
5. Apply selected options (Style, VFX, R, F)

### Step 3: DELIVER
Output format:
- Final Prompt (EN + TH)
- Options Menu for refinement

---

## Output Format

### Default (Compact Mode)
```
**[English Prompt]**
[Full prompt in English]

**[Thai Prompt / พรอมต์ภาษาไทย]**
[Full prompt in Thai]

---
Options: Style | VFX | R(Skin) | F(Face) | Ideas
```

---

## Prompt Template

### For Person/Portrait:
```
Using image(s) as reference, generate **[Subject]**.

[IF 2+ images:] Multi-Image Fusion: Image 1=primary. [Integration details]

Subject: Same person, keep 90-95% facial identity.

[IF F selected:] Soft Lock: Preserve landmarks (eyes, nose, mouth, jaw, cheekbones). Allow lighting, shadow, clarity—NO geometry changes.

[IF R selected:] Realistic Skin: Pores, micro-texture, tone variation.
Enhancement: Soften shadows/blemishes, keep texture visible.

Scene: [Background description]. [VFX if selected]

Fashion: [Outfit description]

Lighting & Realism: Natural light, shadows, [R: realistic skin with texture | Default: smooth polished skin], no artifacts.

[IF Style selected:] Style: [Style description]

Vibe: [Mood]. [Additional modifications]

9:16 vertical.
```

### For Product/Object:
```
Using image(s) as reference, generate **[Product/Object]**.

Subject: Keep product 100% identical to reference.

Scene: [Background/setting]

Lighting: [Lighting setup]

Style: [If selected]

[Aspect ratio]
```

---

## Multi-Image Fusion Rules

| Image Type | Action | Identity |
|---|---|---|
| Image 1 | Primary reference | Face 90-95% |
| Clothing | "wearing the outfit from Image N" | Preserve patterns |
| Person+ | "alongside person from Image N" | Face 90-95% |
| Product | "holding/near product from Image N" | 100% identical |
| Accessory | "wearing accessory from Image N" | 100% identical |
| Location | "set in environment from Image N" | Atmosphere |

---

## Available Options

### Style Categories (A-M)
Reference: [AI_Image_Style_Categories.md](references/AI_Image_Style_Categories.md)

13 main categories with 100+ styles:
- A. Photorealism / Real-World
- B. Cinematic / Film
- C. Illustration & Art
- D. Fantasy & Mythical
- E. Surreal / Abstract
- F. Anime / Manga
- G. Sci-Fi / Futuristic
- H. 3D / CGI / Game
- I. Minimal / Modern
- J. Vintage / Retro
- K. Nature / Botanical
- L. Character & Fashion
- M. Experimental / Hybrid

### VFX Effects (P/L/W/M/A/T)
Reference: [VFX_Summary.md](references/VFX_Summary.md)

6 categories:
- P. Particles (dust, smoke, fire, water, sparks, pollen)
- L. Lighting (glow, flare, rays, neon, streaks)
- W. Weather (rain, snow, lightning, storm, wind)
- M. Magic (aura, circle, portal, runes, field)
- A. Atmospheric (mist, fog, haze, steam)
- T. Motion (blur, speed lines, impact, shockwave)

### R - Realistic Skin
Reference: [Realistic_Skin_Rules.md](references/Realistic_Skin_Rules.md)

Adds:
- Visible pores (nose, cheek, forehead)
- Micro-texture preservation
- Natural color variations
- Subtle imperfections

### F - Face Lock (Soft Lock 90-95%)
Reference: [Identity_Consistency.md](references/Identity_Consistency.md)

Preserves:
- Main landmarks (eyes, nose, mouth, jaw, cheekbones)
- Allows lighting, shadow, clarity adjustments
- Forbids geometry/bone structure changes

---

## Quality Rules

### DO:
- Write semantic narratives (not keywords)
- Use 3-5 imperfections per prompt for realism
- Specify physics (scale, lighting, placement)
- Apply Realism Default unless style selected
- Use Image 1 as primary reference

### DON'T:
- Stack keywords with commas
- Over-use imperfections (>5)
- Skip physics rules
- Over-smooth skin (unless intentional)
- Change bone structure (identity)
- Float objects (specify ground contact)

---

## Response Examples

### Example 1: Simple Portrait Request
**User**: "Create a prompt for a woman in a coffee shop"

**Response**:
```
**[English]**
A woman sits at a cozy coffee shop during golden hour. She has naturally flowing hair with individual strands catching the warm afternoon light. Her expression is relaxed and contemplative as she holds a ceramic coffee cup. The background shows softly blurred wooden furniture and warm ambient lighting. Natural skin texture with visible pores and subtle color variation creates photographic realism.

Lighting & Realism: Natural window light from the side, accurate shadows, smooth polished skin, no artifacts.

Vibe: Cozy, peaceful, urban lifestyle.

9:16 vertical.

**[Thai / พรอมต์ภาษาไทย]**
ผู้หญิงนั่งอยู่ในร้านกาแฟอบอุ่นช่วง golden hour เธอมีผมสลวยธรรมชาติที่จับแสงอาทิตย์ยามบ่าย สีหน้าผ่อนคลายและครุ่นคิดขณะถือถ้วยกาแฟเซรามิก ฉากหลังเป็นเฟอร์นิเจอร์ไม้เบลอนุ่มและแสงอบอุ่น พื้นผิวผิวธรรมชาติพร้อมรูขุมขนและความแตกต่างของสีสร้างความสมจริงแบบภาพถ่าย

แสงและความสมจริง: แสงธรรมชาติจากหน้าต่างด้านข้าง เงาถูกต้อง ผิวเรียบเนียน ไม่มี artifacts

บรรยากาศ: อบอุ่น สงบ ไลฟ์สไตล์ในเมือง

9:16 แนวตั้ง
```

Options: Style | VFX | R(Skin) | F(Face) | Ideas

---

### Example 2: With Reference Image + Style
**User**: "Use this image, create prompt with cinematic style"

**Response**:
```
**[English]**
Using image as reference, generate the same woman in a cinematic setting.

Subject: Same woman, keep 90-95% facial identity.

Scene: Modern city rooftop at dusk, city lights glowing in background.

Fashion: Elegant dark coat with collar turned up.

Lighting & Realism: Teal and orange cinematic color grading, dramatic rim lighting, smooth polished skin, no artifacts.

Style: Hollywood cinematic with teal & orange color palette, moody atmosphere, professional film look.

Vibe: Dramatic, confident, urban.

9:16 vertical.

**[Thai / พรอมต์ภาษาไทย]**
ใช้ภาพอ้างอิงสร้างผู้หญิงคนเดียวกันในฉากซีนีมาติก

หัวข้อ: ผู้หญิงคนเดียวกัน รักษา 90-95% ใบหน้า

ฉาก: ดาดฟ้าเมืองสมัยใหม่ยามพลบค่ำ แสงเมืองเรืองรองในฉากหลัง

แฟชั่น: เสื้อโค้ทสีเข้มหรูหราพับปกขึ้น

แสงและความสมจริง: การเกรดสีแบบซีนีมาติก teal & orange แสงขอบดราม่า ผิวเรียบเนียน ไม่มี artifacts

สไตล์: ซีนีมาติกฮอลลีวูดพร้อมโทนสี teal & orange บรรยากาศมู้ดดี้ ลุคภาพยนตร์มืออาชีพ

บรรยากาศ: ดราม่า มั่นใจ เมือง

9:16 แนวตั้ง
```

Options: Style | VFX | R(Skin) | F(Face) | Ideas

---

## Integration with Media Studio

This skill can be used as "Auto Prompt" in Media Studio:
1. User provides basic idea or reference images
2. Skill generates professional prompt
3. User can refine with options (Style, VFX, etc.)
4. Final prompt is used for image generation

---

## Version Info

**Version**: 8.9
**Features**: Multi-Image Fusion, 13 Style Categories, 6 VFX Categories, Realistic Skin (R), Face Lock (F)
**Status**: Production Ready
