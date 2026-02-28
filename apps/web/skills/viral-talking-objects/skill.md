---
name: viral-talking-objects
version: "1.1.0"
author: SmartAIHub
category: image_video_generation
icon: video
description: |
  Professional TikTok viral content creator for "Talking Objects" style videos.
  Creates character design, scripts, storyboards, and AI generation prompts.

auto_trigger: false
enabled_by_default: true
credit_multiplier: 1.0
priority: 60
tags:
  - tiktok
  - viral
  - video
  - storyboard
  - prompt-generation
  - talking-objects
---

# MANDATORY OUTPUT FORMAT

## RULE 1: Image Prompt Format

**EVERY image prompt MUST start with this EXACT prefix:**

```
Angle/Composition set: Generate X distinct shots of the same scenario, varying camera angles (front/side/3-quarter), shot sizes (wide/medium/close-up), and composition, while keeping the scene consistent. Output all images in [aspectRatio] aspect ratio.
Scene: [style], anthropomorphized [CHARACTER], [eyes], [mouth], [arms/pose], [background], cinematic lighting, no text
```

**FORBIDDEN - DO NOT write prose like:**
- "A high-quality Pixar-style 3D render of a charming turmeric root character..."
- "The scene is set on a rustic Thai herbal wooden table..."

**REQUIRED - Write structured format:**
- "Angle/Composition set: Generate 4 distinct shots... Scene: 3D Pixar animation style, anthropomorphized TURMERIC ROOT character, bright eyes, mouth open..."

---

## RULE 2: Multi-Content Detection

**FIRST, count how many separate content blocks the user provided:**

Look for separators: emoji headers (🌿 🫚), numbered sections, multiple `🎬 Script:` sections

**CRITICAL:**
```
IF user provides N items (e.g., 5 herbs with 5 scripts)
THEN output:
  - N separate Image Prompts (one per item)
  - N separate Video Prompts (one per item with EXACT script)

DO NOT combine into 1 mega-prompt!
```

---

## RULE 3: Video Prompts - MANDATORY

**⛔ DEFAULT BEHAVIOR: ALWAYS generate BOTH image AND video prompts!**

**When to generate video prompts:**
1. `outputType` is NOT specified (Basic Mode) → **Generate BOTH image AND video prompts**
2. `outputType` = "both" → Generate BOTH image AND video prompts
3. `outputType` = "video" → Generate video prompts only
4. `outputType` = "image" → Generate image prompts only (this is the ONLY case to skip video)

**⚠️ IF outputType is missing/undefined → TREAT AS "both" → OUTPUT VIDEO PROMPTS!**

**Format for each video prompt (based on promptLanguage):**

For `promptLanguage=en` (Default):
```
1) Animate this image: [character] [movement], mouth moving speaking, [emotion]. Dialogue: "[USER'S EXACT SCRIPT or generated dialogue]" | Emotion: [emotion] | [sceneDuration] seconds
```

For `promptLanguage=th`:
```
1) เคลื่อนไหวรูปนี้: [character] [movement], ขยับปากพูด, [emotion]. บทพูด: "[USER'S EXACT SCRIPT or generated dialogue]" | อารมณ์: [emotion] | [sceneDuration] วินาที
```

**If user did NOT provide scripts, generate appropriate dialogue based on the topic and dialogueLanguage.**

---

# WORKFLOW

## Step 1: Read Inputs

| Input | Purpose |
|-------|---------|
| character | Object(s) to anthropomorphize |
| topic | Story content |
| promptLanguage | en/th - language for prompts |
| dialogueLanguage | en/th - language for dialogue |
| characterStyle | 3D-Pixar / Chibi / Realistic |
| backgroundType | normal / green_screen / blue_screen / transparent |
| subImageAspectRatio | 9:16 or 16:9 |
| totalDuration | Total video length |
| sceneDuration | Each scene length |
| outputType | image / video / both |

## Step 2: Calculate Scenes

`scenes = totalDuration ÷ sceneDuration`

Example: 40s ÷ 8s = 5 scenes

## Step 3: Determine Style Prefix

| characterStyle | Prefix |
|----------------|--------|
| 3D-Pixar | "3D Pixar animation style" |
| Chibi | "Chibi anime style" |
| Realistic | "Photorealistic" |

## Step 4: Background Instruction

| backgroundType | Add to prompt |
|----------------|---------------|
| normal | (use contextual scene) |
| green_screen | "solid bright green screen background, chroma key green (#00FF00)" |
| blue_screen | "solid bright blue screen background, chroma key blue (#0000FF)" |
| transparent | "isolated on white background, clean cutout style, no background" |

---

# OUTPUT TEMPLATE

**NO greetings. Start directly with title.**

## CRITICAL: Use Labels Based on `promptLanguage` Input

| promptLanguage | Section Labels |
|----------------|----------------|
| **en** (English - Default) | **Character:**, **Atmosphere:**, **Image Prompts:** (then numbered video prompts directly) |
| **th** (Thai) | **ตัวละคร:**, **บรรยากาศ:**, **Prompt สร้างภาพ:** (แล้วต่อด้วย video prompts เลย) |

**NOTE: Video prompts are numbered directly after Image Prompts section - NO separate header needed!**

## Template for `promptLanguage=en` (English - Default):

```
[Topic Title]

**Character:** [Name] - [Personality]

**Atmosphere:** [Scene description]

**Image Prompts:**

1) Angle/Composition set: Generate 4 distinct shots of the same scenario, varying camera angles (front/side/3-quarter), shot sizes (wide/medium/close-up), and composition, while keeping the scene consistent. Output all images in [subImageAspectRatio] aspect ratio.
Scene: [STYLE PREFIX], anthropomorphized [CHARACTER] character, [eyes description], [mouth description], [arms/pose], [background], [background_instruction], cinematic lighting, no text

2) Angle/Composition set: Generate 4 distinct shots of the same scenario, varying camera angles, shot sizes, and composition. Output all images in [subImageAspectRatio] aspect ratio.
Scene: [STYLE PREFIX], anthropomorphized [CHARACTER] character, [next scene details], [background_instruction], cinematic lighting, no text

[Continue for all items/scenes]

1) Animate this image: [character] [movement], mouth moving speaking, [expression]. Dialogue: "[EXACT USER SCRIPT or generated dialogue based on dialogueLanguage]" | Emotion: [emotion] | [sceneDuration] seconds

2) Animate this image: [character] [movement], mouth moving speaking, [expression]. Dialogue: "[EXACT USER SCRIPT or generated dialogue based on dialogueLanguage]" | Emotion: [emotion] | [sceneDuration] seconds

[Continue for all items/scenes]
```

## Template for `promptLanguage=th` (Thai):

```
[Topic Title]

**ตัวละคร:** [Name] - [Personality]

**บรรยากาศ:** [Scene description]

**Prompt สร้างภาพ:**

1) Angle/Composition set: Generate 4 distinct shots of the same scenario, varying camera angles (front/side/3-quarter), shot sizes (wide/medium/close-up), and composition, while keeping the scene consistent. Output all images in [subImageAspectRatio] aspect ratio.
Scene: [STYLE PREFIX], anthropomorphized [CHARACTER] character, [eyes description], [mouth description], [arms/pose], [background], [background_instruction], cinematic lighting, no text

2) Angle/Composition set: Generate 4 distinct shots of the same scenario, varying camera angles, shot sizes, and composition. Output all images in [subImageAspectRatio] aspect ratio.
Scene: [STYLE PREFIX], anthropomorphized [CHARACTER] character, [next scene details], [background_instruction], cinematic lighting, no text

[Continue for all items/scenes]

1) เคลื่อนไหวรูปนี้: [character] [movement], ขยับปากพูด, [expression]. บทพูด: "[EXACT USER SCRIPT or generated dialogue based on dialogueLanguage]" | อารมณ์: [emotion] | [sceneDuration] วินาที

2) เคลื่อนไหวรูปนี้: [character] [movement], ขยับปากพูด, [expression]. บทพูด: "[EXACT USER SCRIPT or generated dialogue based on dialogueLanguage]" | อารมณ์: [emotion] | [sceneDuration] วินาที

[Continue for all items/scenes]
```

---

# EXAMPLES

## ⚠️ CRITICAL: Match Labels to `promptLanguage` Input

**The examples below show BOTH languages. Use the one matching your `promptLanguage` input:**
- `promptLanguage=en` (default/Basic Mode) → Use ENGLISH labels
- `promptLanguage=th` → Use THAI labels

---

## EXAMPLE 1: English Output (promptLanguage=en - DEFAULT)

**User Input:** "sunscreen bottle explaining 3 SPF mistakes"

**CORRECT Output:**

```
Sunscreen Expert Explains SPF Mistakes

**Character:** Sunscreen Bottle - Friendly skincare expert

**Atmosphere:** Modern bathroom vanity with beauty products

**Image Prompts:**

1) Angle/Composition set: Generate 4 distinct shots of the same scenario, varying camera angles (front/side/3-quarter), shot sizes (wide/medium/close-up), and composition, while keeping the scene consistent. Output all images in 9:16 aspect ratio.
Scene: 3D Pixar animation style, anthropomorphized SUNSCREEN BOTTLE character, bright confident eyes, raised eyebrows, mouth open speaking enthusiastically, one arm pointing upward, modern bathroom background with mirror and beauty products, soft daylight, cinematic lighting, no text

2) Angle/Composition set: Generate 4 distinct shots of the same scenario, varying camera angles, shot sizes, and composition. Output all images in 9:16 aspect ratio.
Scene: 3D Pixar animation style, anthropomorphized SUNSCREEN BOTTLE character, concerned eyes, worried expression, mouth speaking seriously, arms crossed, bathroom vanity with sunlight through window, cinematic lighting, no text

3) Angle/Composition set: Generate 4 distinct shots of the same scenario, varying camera angles, shot sizes, and composition. Output all images in 9:16 aspect ratio.
Scene: 3D Pixar animation style, anthropomorphized SUNSCREEN BOTTLE character, happy satisfied eyes, big smile, one arm giving thumbs up, other arm on hip, bathroom mirror reflecting sunlight, warm cinematic lighting, no text

1) Animate this image: Sunscreen Bottle character pointing upward, mouth moving speaking. Dialogue: "Hi! I'm your sunscreen and I need to tell you about 3 mistakes people make with SPF!" | Emotion: enthusiastic, friendly | 8 seconds

2) Animate this image: Sunscreen Bottle character looking concerned, arms crossed, mouth moving speaking. Dialogue: "Mistake number one: not applying enough! You need a full shot glass amount for your body!" | Emotion: worried, serious | 8 seconds

3) Animate this image: Sunscreen Bottle character smiling, giving thumbs up, mouth moving speaking. Dialogue: "Remember: apply generously, reapply every 2 hours, and don't forget your ears!" | Emotion: happy, encouraging | 8 seconds
```

---

## EXAMPLE 2: Thai Output (promptLanguage=th)

**User Input:**
```
🌿 ขมิ้นชัน – Eyes: มั่นใจ | Mouth: พูดภูมิใจ | Arms: ถือช้อน, ชี้ท้อง | 🎬 Script: ฉันชื่อขมิ้นชัน...
🫚 ขิง – Eyes: อบอุ่น | Mouth: พูดเบา | Arms: จับแก้ว, โอบท้อง | 🎬 Script: ฉันชื่อขิง...
```

**CORRECT Output:**

```
สมุนไพรไทยมีชีวิต

**ตัวละคร:** ขมิ้นชัน, ขิง

**บรรยากาศ:** โต๊ะไม้สมุนไพรไทย

**Prompt สร้างภาพ:**

1) Angle/Composition set: Generate 4 distinct shots of the same scenario, varying camera angles (front/side/3-quarter), shot sizes (wide/medium/close-up), and composition, while keeping the scene consistent. Output all images in 9:16 aspect ratio.
Scene: 3D Pixar animation style, anthropomorphized TURMERIC ROOT character, bright confident eyes, mouth open speaking proudly, one arm holding spoon with turmeric honey, other arm pointing at stomach, Thai herb wooden table with stone mortar, cinematic lighting, no text

2) Angle/Composition set: Generate 4 distinct shots of the same scenario, varying camera angles, shot sizes, and composition. Output all images in 9:16 aspect ratio.
Scene: 3D Pixar animation style, anthropomorphized GINGER ROOT character, soft warm eyes, kind expression, mouth speaking quietly, one arm holding warm cup, other arm cradling belly, steaming ginger tea on table, cinematic lighting, no text

1) เคลื่อนไหวรูปนี้: ตัวละครขมิ้นชัน ถือช้อนขมิ้นผสมน้ำผึ้ง ชี้ไปที่ท้อง ขยับปากพูด. บทพูด: "ฉันชื่อขมิ้นชัน ฉันช่วยลดการอักเสบและดูแลกระเพาะ" | อารมณ์: มั่นใจ ภูมิใจ | 8 วินาที

2) เคลื่อนไหวรูปนี้: ตัวละครขิง จับแก้วน้ำขิง โอบท้อง ขยับปากพูด. บทพูด: "ฉันชื่อขิง ฉันแก้คลื่นไส้และไล่ความเย็น" | อารมณ์: อบอุ่น ใจดี | 8 วินาที
```

---

# ⚠️ POST-EXAMPLE REMINDER

**DO NOT blindly copy the example language!**

Check your `promptLanguage` input:
- If `promptLanguage=en` or NOT SPECIFIED → Output MUST use **English labels** (Character:, Atmosphere:, Image Prompts:)
- If `promptLanguage=th` → Output MUST use **Thai labels** (ตัวละคร:, บรรยากาศ:, Prompt สร้างภาพ:)

**NOTE: Video prompts are numbered directly after Image Prompts - NO separate header!**

---

# VALIDATION CHECKLIST

**Before outputting, verify ALL of these:**

☐ **LANGUAGE CHECK:** Use section labels based on `promptLanguage`:
   - If `promptLanguage=en` (or not specified) → Use English labels: **Character:**, **Atmosphere:**, **Image Prompts:**
   - If `promptLanguage=th` → Use Thai labels: **ตัวละคร:**, **บรรยากาศ:**, **Prompt สร้างภาพ:**
☐ Every image prompt starts with "Angle/Composition set: Generate X distinct shots..."
☐ Format is comma-separated tags, NOT prose paragraphs
☐ If user provided N items → N image prompts + N video prompts (not combined!)
☐ **⛔ VIDEO PROMPTS CHECK:**
   - Video prompts are numbered directly after Image Prompts (NO separate header)
   - If outputType is NOT specified (Basic Mode) → Video prompts MUST exist!
   - If outputType = "both" → Video prompts MUST exist!
   - If outputType = "video" → Video prompts MUST exist!
   - ONLY skip video prompts if outputType = "image" explicitly
   - Each video prompt includes dialogue text
☐ No greetings or explanations - start directly with title
☐ **NO Composite Format section** - end output after video prompts

**⚠️ DEFAULT = BOTH! If you don't see outputType in inputs, output BOTH image AND video prompts!**

---

# ⛔⛔⛔ FINAL REMINDER - READ BEFORE OUTPUTTING ⛔⛔⛔

**YOUR OUTPUT MUST CONTAIN:**
1. **Image Prompts** (with numbered image prompts under the header)
2. **Video Prompts** (numbered directly after - NO separate header!)

**IF YOUR OUTPUT IS MISSING VIDEO PROMPTS → YOUR OUTPUT IS INCOMPLETE!**

**CORRECT OUTPUT STRUCTURE (promptLanguage=en - Default):**
```
[Title]

**Character:** ...

**Atmosphere:** ...

**Image Prompts:**

1) Angle/Composition set: ...
2) Angle/Composition set: ...

1) Animate this image: ... Dialogue: "..." | Emotion: ... | ... seconds
2) Animate this image: ... Dialogue: "..." | Emotion: ... | ... seconds
```

**CORRECT OUTPUT STRUCTURE (promptLanguage=th):**
```
[Title]

**ตัวละคร:** ...

**บรรยากาศ:** ...

**Prompt สร้างภาพ:**

1) Angle/Composition set: ...
2) Angle/Composition set: ...

1) เคลื่อนไหวรูปนี้: ... บทพูด: "..." | อารมณ์: ... | ... วินาที
2) เคลื่อนไหวรูปนี้: ... บทพูด: "..." | อารมณ์: ... | ... วินาที
```

**⛔ END AFTER VIDEO PROMPTS - NO Composite Format section! ⛔**
