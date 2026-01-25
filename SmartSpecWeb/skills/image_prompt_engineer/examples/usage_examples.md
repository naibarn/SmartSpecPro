# Image Prompt Engineer v2.0 - Usage Examples

## Table of Contents
1. [Text-to-Image Examples](#text-to-image-examples)
2. [Image-to-Image Examples](#image-to-image-examples)
3. [Inpainting Examples](#inpainting-examples)
4. [Outpainting Examples](#outpainting-examples)
5. [Advanced Examples](#advanced-examples)

---

## Text-to-Image Examples

### Example 1: Basic Text-to-Image
**Use Case**: สร้างภาพพื้นฐานจากคำอธิบาย

```json
{
  "request": "สาวสวยยืนในสวนดอกไม้ยามเช้า แสงแดดอ่อนๆ กรองผ่านกิ่งไม้"
}
```

**Output Prompt**:
```
TEXT-TO-IMAGE: สาวสวยยืนในสวนดอกไม้ยามเช้า แสงแดดอ่อนๆ กรองผ่านกิ่งไม้

Style: photorealistic

Technical requirements:
- High detail and sharpness
- Coherent lighting from single direction
- Physically plausible shadows
- No AI artifacts or distortions

Aspect ratio: 9:16
```

---

### Example 2: Text-to-Image with Style & VFX
**Use Case**: สร้างภาพแบบมีสไตล์และเอฟเฟกต์พิเศษ

```json
{
  "request": "นักรบในยุคกลาง ถือดาบเปลวไฟ",
  "generation_mode": "text_to_image",
  "style": "dark_cinematic",
  "vfx": {
    "effects": [
      "light_god_rays",
      "magic_energy_particles",
      "atmospheric_smoke_atmosphere"
    ]
  },
  "aspect_ratio": "16:9"
}
```

---

### Example 3: Text-to-Image with Typography
**Use Case**: สร้างโปสเตอร์ที่มีข้อความ

```json
{
  "request": "ภูเขาสูงตระหง่านในยามพระอาทิตย์ตก",
  "generation_mode": "text_to_image",
  "style": "epic_cinematic",
  "text_on_image": true,
  "headline": "CONQUER YOUR LIMITS",
  "body_text": "The journey begins here",
  "typography": {
    "font_personality": ["bold_strong"],
    "composition_style": ["centered_layout"],
    "mood_tone": ["energetic_and_bold"],
    "text_effects": ["drop_shadow"]
  },
  "aspect_ratio": "3:2"
}
```

---

## Image-to-Image Examples

### Example 4: Style Transfer
**Use Case**: เปลี่ยนภาพถ่ายให้เป็นภาพวาด

```json
{
  "request": "เปลี่ยนให้เป็นภาพวาดสีน้ำมันแบบ Van Gogh",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "ภาพถ่ายต้นฉบับที่ต้องการแปลง"
    }
  ],
  "style": "oil_painting",
  "advanced_params": {
    "denoising_strength": 0.85,
    "guidance_scale": 9.0
  }
}
```

**Output Prompt**:
```
IMAGE-TO-IMAGE TRANSFORMATION: เปลี่ยนให้เป็นภาพวาดสีน้ำมันแบบ Van Gogh

Using 1 reference image(s):
  Image 1: primary_subject - ภาพถ่ายต้นฉบับที่ต้องการแปลง

Transformation strength: 0.85 (0=minimal change, 1=maximum change)

Aspect ratio: 9:16
Target platform: generic
```

---

### Example 5: Outfit Change with Identity Lock
**Use Case**: เปลี่ยนเสื้อผ้าแต่คงใบหน้าเดิม

```json
{
  "request": "เปลี่ยนเสื้อผ้าให้เป็นชุดธุรกิจสีกรมท่า",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "คงใบหน้าและท่าทางเดิม"
    }
  ],
  "identity_lock": "soft_lock_person",
  "realistic_skin": true,
  "advanced_params": {
    "denoising_strength": 0.6
  }
}
```

---

### Example 6: Product Recolor (Strict Lock)
**Use Case**: เปลี่ยนสีสินค้าแต่คงรูปร่างเดิม 100%

```json
{
  "request": "เปลี่ยนสีรองเท้าเป็นสีแดง",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "product",
      "notes": "รองเท้าที่ต้องการเปลี่ยนสี"
    }
  ],
  "identity_lock": "strict_lock_product",
  "advanced_params": {
    "denoising_strength": 0.4
  }
}
```

---

## Inpainting Examples

### Example 7: Replace Background
**Use Case**: เปลี่ยนพื้นหลังเท่านั้น คนในภาพคงเดิม

```json
{
  "request": "เปลี่ยนพื้นหลังเป็นชายหาดตอนพระอาทิตย์ตก",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "บุคคลในภาพต้นฉบับ"
    }
  ],
  "edit_mask": {
    "type": "prompt_based",
    "segment_prompt": "background",
    "preserve_areas": ["person", "clothing", "accessories"],
    "feather": 20
  },
  "style": "golden_hour_cinematic",
  "identity_lock": "soft_lock_person"
}
```

**Output Prompt**:
```
INPAINTING TASK: เปลี่ยนพื้นหลังเป็นชายหาดตอนพระอาทิตย์ตก

🎯 TARGET AREA: BACKGROUND

✋ PRESERVE EXACTLY (DO NOT MODIFY):
  - person
  - clothing
  - accessories

🎨 EDITING INSTRUCTIONS:
  - Modify ONLY the target area specified above
  - Keep all other regions completely unchanged
  - Blend seamlessly at boundaries
  - Match lighting, color, and perspective with surrounding areas
  - Maintain consistent style throughout the image
  - Soft edge transition: 20px feather

IDENTITY PRESERVATION (Soft Lock - Person):
- Preserve key facial landmarks (~90-95% similarity)
- Allow lighting, shadow, and clarity adjustments
- NO geometry or facial structure changes
```

---

### Example 8: Change Specific Object
**Use Case**: แก้ไขเฉพาะวัตถุที่ระบุ

```json
{
  "request": "เปลี่ยนโซฟาเป็นสีน้ำเงินเข้ม",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "location_background",
      "notes": "ห้องนั่งเล่นที่มีโซฟา"
    }
  ],
  "edit_mask": {
    "type": "prompt_based",
    "segment_prompt": "sofa",
    "preserve_areas": ["floor", "wall", "decorations", "table"],
    "feather": 15
  }
}
```

---

### Example 9: Fix Specific Area (Thai)
**Use Case**: แก้ไขส่วนที่ระบุด้วยภาษาไทย

```json
{
  "request": "เพิ่มหน้าต่างที่ผนังด้านซ้าย",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "location_background",
      "notes": "ห้องที่ต้องการเพิ่มหน้าต่าง"
    }
  ],
  "edit_mask": {
    "type": "prompt_based",
    "segment_prompt": "ผนังด้านซ้าย ตรงกลาง",
    "preserve_areas": ["พื้น", "เฟอร์นิเจอร์", "เพดาน"],
    "feather": 25
  },
  "languages": "th"
}
```

---

### Example 10: Remove Object
**Use Case**: ลบวัตถุออกจากภาพ

```json
{
  "request": "ลบคนที่อยู่ด้านหลังออก ทำให้เป็นพื้นหลังธรรมชาติ",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "primary_subject"
    }
  ],
  "edit_mask": {
    "type": "prompt_based",
    "segment_prompt": "person in background",
    "preserve_areas": ["main subject", "foreground"],
    "feather": 30
  }
}
```

---

## Outpainting Examples

### Example 11: Expand All Sides
**Use Case**: ขยายภาพออกทุกทิศทาง

```json
{
  "request": "ขยายภาพออกไปทุกด้าน แสดงฉากรอบๆ เพิ่มเติม",
  "generation_mode": "outpaint",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "ภาพต้นฉบับที่ต้องการขยาย"
    }
  ],
  "outpaint_config": {
    "expand_left": 256,
    "expand_right": 256,
    "expand_top": 128,
    "expand_bottom": 128,
    "blend_width": 64,
    "match_style": true
  }
}
```

**Output Prompt**:
```
OUTPAINTING TASK: ขยายภาพออกไปทุกด้าน แสดงฉากรอบๆ เพิ่มเติม

📐 EXPANSION CONFIGURATION:
  - Expand LEFT: 256px
  - Expand RIGHT: 256px
  - Expand TOP: 128px
  - Expand BOTTOM: 128px

🎨 OUTPAINTING INSTRUCTIONS:
  - Generate natural continuation of the scene in expanded areas
  - Maintain perspective and vanishing points from original image
  - Match the artistic style of the original image
  - Match lighting direction and color temperature
  - Match detail level and texture quality
  - Blend seamlessly at boundaries between original and extended areas
  - Keep the original image region completely unchanged
```

---

### Example 12: Expand Horizontally Only
**Use Case**: ขยายภาพแนวนอนเพื่อให้เป็น panorama

```json
{
  "request": "ขยายภาพแนวนอนเพื่อสร้าง panorama view",
  "generation_mode": "outpaint",
  "reference_images": [
    {
      "role": "location_background",
      "notes": "ภาพทิวทัศน์ที่ต้องการขยาย"
    }
  ],
  "outpaint_config": {
    "expand_left": 512,
    "expand_right": 512,
    "expand_top": 0,
    "expand_bottom": 0,
    "blend_width": 128,
    "match_style": true
  }
}
```

---

### Example 13: Extend Top (Vertical)
**Use Case**: ขยายภาพขึ้นด้านบนเพื่อแสดงท้องฟ้า

```json
{
  "request": "ขยายภาพขึ้นด้านบนเพื่อแสดงท้องฟ้าและเมฆ",
  "generation_mode": "outpaint",
  "reference_images": [
    {
      "role": "location_background"
    }
  ],
  "outpaint_config": {
    "expand_left": 0,
    "expand_right": 0,
    "expand_top": 384,
    "expand_bottom": 0,
    "blend_width": 96,
    "match_style": true
  }
}
```

---

## Advanced Examples

### Example 14: ControlNet + IP-Adapter
**Use Case**: ควบคุมท่าทางและสไตล์พร้อมกัน

```json
{
  "request": "สร้างภาพในท่าทางเดียวกันแต่เป็นสไตล์การ์ตูนญี่ปุ่น",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "อ้างอิงท่าทางและโพสต์"
    },
    {
      "role": "style_reference",
      "notes": "ภาพการ์ตูนญี่ปุ่นที่ต้องการลอกสไตล์"
    }
  ],
  "style": "anime_style",
  "controlnet": {
    "enabled": true,
    "type": "pose",
    "weight": 1.2,
    "guidance_start": 0.0,
    "guidance_end": 0.8
  },
  "ip_adapter": {
    "enabled": true,
    "mode": "style",
    "weight": 0.75,
    "start_step": 0.0,
    "end_step": 1.0
  },
  "advanced_params": {
    "denoising_strength": 0.7,
    "guidance_scale": 8.5,
    "steps": 60
  }
}
```

---

### Example 15: Platform-Specific (Midjourney)
**Use Case**: สร้าง prompt สำหรับ Midjourney

```json
{
  "request": "futuristic cyberpunk city at night with neon lights",
  "generation_mode": "text_to_image",
  "style": "cyberpunk_neon",
  "vfx": {
    "effects": ["light_neon_glow", "atmospheric_volumetric_fog"]
  },
  "target_platform": "midjourney",
  "aspect_ratio": "16:9",
  "advanced_params": {
    "guidance_scale": 12.0
  }
}
```

---

### Example 16: Variation with Seed
**Use Case**: สร้าง variation จากภาพเดิมด้วย seed ต่างกัน

```json
{
  "request": "สร้าง variation ที่ดูใกล้เคียงกันแต่แตกต่างเล็กน้อย",
  "generation_mode": "variation",
  "reference_images": [
    {
      "role": "primary_subject"
    }
  ],
  "advanced_params": {
    "denoising_strength": 0.4,
    "seed": 987654
  }
}
```

---

### Example 17: Full Detail Mode
**Use Case**: ขอ output แบบละเอียดครบถ้วน

```json
{
  "request": "portrait of a woman in natural light",
  "generation_mode": "text_to_image",
  "style": "natural_light_realism",
  "realistic_skin": true,
  "detail_level": "full",
  "aspect_ratio": "2:3",
  "advanced_params": {
    "guidance_scale": 7.0,
    "steps": 40,
    "sampler": "euler_a"
  }
}
```

---

### Example 18: Multi-Reference Complex Scene
**Use Case**: ใช้หลายภาพอ้างอิงประกอบกัน

```json
{
  "request": "สร้างภาพนายแบบใส่เสื้อแบรนด์ ยืนในร้านกาแฟ",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "ใบหน้าและท่าทางของนายแบบ"
    },
    {
      "role": "outfit",
      "notes": "เสื้อแบรนด์ที่ต้องการให้ใส่"
    },
    {
      "role": "location_background",
      "notes": "บรรยากาศร้านกาแฟ"
    }
  ],
  "identity_lock": "soft_lock_person",
  "realistic_skin": true,
  "style": "soft_commercial",
  "advanced_params": {
    "denoising_strength": 0.65
  }
}
```

---

### Example 19: Typography + Inpaint
**Use Case**: แก้ไขภาพและเพิ่มข้อความ

```json
{
  "request": "เปลี่ยนท้องฟ้าให้เป็นสีชมพูยามเย็น และใส่ข้อความ",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "primary_subject"
    }
  ],
  "edit_mask": {
    "type": "prompt_based",
    "segment_prompt": "sky",
    "feather": 25
  },
  "text_on_image": true,
  "headline": "DREAM BIG",
  "body_text": "Make it happen",
  "typography": {
    "font_personality": ["bold_strong"],
    "composition_style": ["big_title_small_subtext"],
    "color_direction": ["high_contrast"]
  }
}
```

---

### Example 20: All Features Combined
**Use Case**: ใช้ทุกฟีเจอร์ร่วมกัน

```json
{
  "request": "แปลงภาพให้เป็นแบนเนอร์โฆษณา มีข้อความ และปรับพื้นหลัง",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "สินค้าหลัก"
    },
    {
      "role": "style_reference",
      "notes": "โทนสีที่ต้องการ"
    }
  ],
  "edit_mask": {
    "type": "prompt_based",
    "segment_prompt": "background",
    "preserve_areas": ["product"],
    "feather": 20
  },
  "identity_lock": "strict_lock_product",
  "text_on_image": true,
  "headline": "NEW ARRIVAL",
  "body_text": "Limited Edition",
  "typography": {
    "font_personality": ["modern_clean"],
    "composition_style": ["asymmetrical_layout"],
    "mood_tone": ["elegant_and_luxury"],
    "color_direction": ["gradient_modern"],
    "text_effects": ["glow_neon"],
    "use_case_templates": ["branding_headline"]
  },
  "style": "beauty_commercial",
  "vfx": {
    "effects": ["light_soft_glow"]
  },
  "target_platform": "stable_diffusion",
  "aspect_ratio": "21:9",
  "detail_level": "full",
  "advanced_params": {
    "denoising_strength": 0.6,
    "guidance_scale": 7.5,
    "steps": 50,
    "sampler": "dpm_2m_karras"
  },
  "ip_adapter": {
    "enabled": true,
    "mode": "style",
    "weight": 0.5
  }
}
```

---

## Testing Commands

### Python
```bash
# Basic test
echo '{"request": "สาวสวยในสวนดอกไม้"}' | python3 skill.py

# Inpaint test
python3 skill.py --json '{"request":"เปลี่ยนพื้นหลัง","generation_mode":"inpaint","reference_images":[{"role":"primary_subject"}],"edit_mask":{"type":"prompt_based","segment_prompt":"background"}}'

# Full detail test
python3 skill.py --json '{"request":"portrait","detail_level":"full"}'
```

### JavaScript (Node.js)
```bash
# Basic test
node -e 'const skill = require("./index.js"); console.log(JSON.stringify(skill.run({request: "สาวสวยในสวนดอกไม้"}), null, 2))'
```

---

## Notes

- ทุก example สามารถปรับแต่งได้ตามต้องการ
- การเลือก `denoising_strength` ส่งผลมาก: 0.3-0.5 = เปลี่ยนเล็กน้อย, 0.6-0.8 = เปลี่ยนปานกลาง, 0.9+ = เปลี่ยนมาก
- สำหรับ inpainting ควรใช้ `feather` อย่างน้อย 10px เพื่อการผสานที่นุ่มนวล
- `target_platform` จะปรับ format ของ prompt ให้เหมาะสมโดยอัตโนมัติ

---

**Version**: 2.0  
**Last Updated**: January 24, 2026
