---

## 🆕 v2.1 Update: Hallucination Control

- ✅ **Prevents nationality/ethnicity hallucination** — ป้องกันการเพิ่มข้อมูลสัญชาติที่ไม่ได้ระบุ
- ✅ **Auto-correction** — แก้ไขอัตโนมัติ (เช่น "Korean fashion" → "modern fashion")
- ✅ **Warnings in output** — แจ้งเตือนเมื่อตรวจพบ hallucination

id: image_prompt_engineer
name: Image Prompt Engineer
version: 2.1
type: agent-skill
languages: en, th
category: creative
---

# Image Prompt Engineer (v2.1)

## 🎯 Purpose
สร้าง "พรอมต์สำหรับระบบสร้างภาพ AI" ที่ครบถ้วน ชัดเจน และรองรับทุกโหมดการสร้างภาพ:

### ✅ โหมดที่รองรับ (New in v2.1!)
1. **Text-to-Image** — สร้างภาพจากคำอธิบาย
2. **Image-to-Image** — แปลงภาพจากภาพอ้างอิง
3. **Inpaint** — แก้ไขเฉพาะส่วนที่เลือก (Text-based masking)
4. **Outpaint** — ขยายภาพออกนอกกรอบเดิม
5. **Variation** — สร้างรูปแบบต่างๆ จากภาพเดิม

### 🌟 จุดเด่น
- **โหมดเริ่มต้นเน้นความสมจริง** (สามารถเปลี่ยนด้วย Style/VFX)
- รองรับ **ข้อความบนภาพ (Typography)** แบบเลือกหมวด/สไตล์ได้
- รองรับ **ภาพอ้างอิงหลายภาพ** (กำหนดบทบาทของภาพแต่ละใบได้)
- **Text-based Masking** — ระบุพื้นที่แก้ไขด้วยภาษาธรรมชาติ
- **Platform-specific Output** — ปรับ prompt ตาม platform
- **Advanced Controls** — ควบคุม parameters ขั้นสูง

---

## 📊 What's New in v2.1

### 🚀 Major Features

#### 1. Generation Mode Selection
ระบุโหมดการสร้างภาพได้ชัดเจน:
```json
{
  "generation_mode": "text_to_image" | "image_to_image" | "inpaint" | "outpaint" | "variation"
}
```

#### 2. Text-based Inpainting
แก้ไขเฉพาะส่วนที่ต้องการด้วยภาษาธรรมชาติ:
```json
{
  "generation_mode": "inpaint",
  "edit_mask": {
    "type": "prompt_based",
    "segment_prompt": "sky",
    "preserve_areas": ["foreground", "people"]
  }
}
```

#### 3. Outpainting Support
ขยายภาพออกไปทุกทิศทาง:
```json
{
  "generation_mode": "outpaint",
  "outpaint_config": {
    "expand_left": 256,
    "expand_right": 256,
    "expand_top": 128,
    "expand_bottom": 128
  }
}
```

#### 4. Advanced Parameters
ควบคุมการสร้างภาพแบบละเอียด:
```json
{
  "advanced_params": {
    "denoising_strength": 0.75,
    "guidance_scale": 7.5,
    "steps": 50,
    "seed": 123456,
    "sampler": "dpm_2m_karras"
  }
}
```

#### 5. ControlNet & IP-Adapter Support
```json
{
  "controlnet": {
    "enabled": true,
    "type": "pose",
    "weight": 1.0
  },
  "ip_adapter": {
    "enabled": true,
    "mode": "style",
    "weight": 0.6
  }
}
```

#### 6. Platform Selection
ปรับ prompt ให้เหมาะกับ platform:
```json
{
  "target_platform": "stable_diffusion" | "midjourney" | "dall_e_3" | "gemini_imagen" | "flux" | "firefly"
}
```

---

## 📋 Input Schema

### Required Fields
```json
{
  "request": "คำอธิบายสิ่งที่ต้องการ" // เพียงฟิลด์เดียวที่ required!
}
```

### Core Fields (มี Default ทั้งหมด)
```json
{
  "generation_mode": "text_to_image",  // default
  "task": "final_prompt",              // default
  "detail_level": "standard",          // compact | standard | full
  "languages": "en",                   // en | th
  "aspect_ratio": "9:16",              // มีตัวเลือก 7 แบบ
  "aspect_ratio_custom": "",           // เช่น "5:4"
  "style": "photorealistic",           // 151+ สไตล์
  "target_platform": "generic"         // 7 platforms
}
```

### Image-to-Image Fields
```json
{
  "reference_images": [
    {
      "role": "primary_subject" | "outfit" | "product" | "location_background" | ...,
      "notes": "คำอธิบายเพิ่มเติม"
    }
  ],
  "identity_lock": "none" | "soft_lock_person" | "strict_lock_product",
  "realistic_skin": false
}
```

### Inpainting Fields
```json
{
  "edit_mask": {
    "type": "prompt_based",              // หรือ ai_segment, rectangle, brush
    "segment_prompt": "sky",             // "ท้องฟ้า", "background", "the woman's dress"
    "preserve_areas": ["face", "hands"], // พื้นที่ที่ต้องการคงไว้
    "feather": 10,                       // ความนุ่มขอบ (px)
    "invert": false                      // กลับด้าน mask
  }
}
```

### Outpainting Fields
```json
{
  "outpaint_config": {
    "expand_left": 0,      // px
    "expand_right": 0,     // px  
    "expand_top": 0,       // px
    "expand_bottom": 0,    // px
    "blend_width": 64,     // px (โซนผสาน)
    "match_style": true    // จับสไตล์เดิม
  }
}
```

### Advanced Parameters
```json
{
  "advanced_params": {
    "denoising_strength": 0.75,  // 0-1 (img2img)
    "guidance_scale": 7.5,        // CFG: 1-30
    "steps": 50,                  // sampling steps: 1-150
    "seed": -1,                   // -1 = random
    "sampler": "dpm_2m_karras",   // euler_a, ddim, etc.
    "clip_skip": 1                // 1-12
  }
}
```

### ControlNet Configuration
```json
{
  "controlnet": {
    "enabled": false,
    "type": "canny",              // depth, pose, normal, scribble, mlsd, lineart, softedge
    "weight": 1.0,                // 0-2
    "guidance_start": 0.0,        // 0-1
    "guidance_end": 1.0           // 0-1
  }
}
```

### IP-Adapter Configuration
```json
{
  "ip_adapter": {
    "enabled": false,
    "mode": "style",              // content, face, composition
    "weight": 0.6,                // 0-2
    "start_step": 0.0,            // 0-1
    "end_step": 1.0               // 0-1
  }
}
```

### VFX Effects
```json
{
  "vfx": {
    "effects": [
      "light_volumetric_lighting",
      "atmospheric_mist"
    ],
    "effects_custom": ["custom effect description"]
  }
}
```

### Typography (Text-on-Image)
```json
{
  "text_on_image": false,
  "headline": "Main text",
  "body_text": "Supporting text",
  "typography": {
    "font_personality": ["modern_clean"],
    "composition_style": ["centered_layout"],
    "mood_tone": ["minimal_and_calm"],
    "color_direction": ["monochrome"],
    "text_effects": ["drop_shadow"],
    "use_case_templates": ["poster_typography"],
    "modern_trend_packs": ["korean_clean_typography"],
    "layout_add_ons": ["with_shapes"]
  }
}
```

---

## 📤 Output Schema

```json
{
  "prompt": "พรอมต์หลักในภาษาที่เลือก",
  "avoid": ["รายการสิ่งที่ควรหลีกเลี่ยง"],
  "detail_level": "standard",
  "task": "final_prompt",
  "generation_mode": "text_to_image",
  "target_platform": "generic",
  "parameters": {
    "aspect_ratio": "9:16",
    "generation_mode": "text_to_image",
    "denoising_strength": 0.75,  // ถ้ามี
    "cfg_scale": 7.5,            // ถ้ามี
    "steps": 50                  // ถ้ามี
  },
  "breakdown": {               // ถ้า detail_level = full
    "generation_mode": "...",
    "subject": "...",
    "style": "..."
  }
}
```

---

## 💡 Usage Examples

### Example 1: Text-to-Image (Simple)
```json
{
  "request": "สาวสวยยืนในสวนดอกไม้ยามเช้า"
}
```
✅ ใช้ default ทั้งหมด: photorealistic style, 9:16 aspect ratio, standard detail

### Example 2: Image-to-Image (Style Transfer)
```json
{
  "request": "เปลี่ยนให้เป็นภาพวาดสีน้ำมัน",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "คงองค์ประกอบหลักเดิม"
    }
  ],
  "style": "oil_painting",
  "advanced_params": {
    "denoising_strength": 0.8
  }
}
```

### Example 3: Inpainting (Replace Background)
```json
{
  "request": "เปลี่ยนพื้นหลังเป็นชายหาดตอนพระอาทิตย์ตก",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "คงบุคคลในภาพเดิม 100%"
    }
  ],
  "edit_mask": {
    "type": "prompt_based",
    "segment_prompt": "background",
    "preserve_areas": ["person", "clothing"],
    "feather": 20
  },
  "style": "golden_hour_cinematic",
  "identity_lock": "soft_lock_person"
}
```

### Example 4: Outpainting (Expand Canvas)
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

### Example 5: Advanced - ControlNet + Style
```json
{
  "request": "สร้างภาพในท่าทางเดียวกันแต่เป็นสไตล์การ์ตูน",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "อ้างอิงท่าทาง"
    },
    {
      "role": "style_reference",
      "notes": "อ้างอิงสไตล์การ์ตูน"
    }
  ],
  "style": "anime_style",
  "controlnet": {
    "enabled": true,
    "type": "pose",
    "weight": 1.2
  },
  "ip_adapter": {
    "enabled": true,
    "mode": "style",
    "weight": 0.8
  },
  "advanced_params": {
    "denoising_strength": 0.7,
    "guidance_scale": 8.0
  }
}
```

---

## 📚 Knowledge Base

Skill นี้มาพร้อม knowledge files เพื่อเป็นแคตตาล็อกและ best practices:

1. **ai_image_style_categories.md** — แคตตาล็อกสไตล์ (151+ styles)
2. **prompt_depth_reference.md** — ตรรกะและโครงสร้างพรอมต์
3. **vfx_effects_menu.md** — เมนู VFX ทั้งหมด (50+ effects)
4. **realistic_skin_preservation_rules.md** — กฎผิวสมจริง
5. **identity_consistency_rules.md** — กฎคงเอกลักษณ์
6. **photorealistic_prompting_research_notes.md** — โน้ตวิจัย
7. **legacy_system_prompt_reference.md** — อ้างอิงเวิร์กโฟลว์เดิม

---

## 🎨 Style Catalog (151+ Styles)

### Photorealism
- photorealistic, ultra_realistic, raw_realism, dslr_look
- natural_light_realism, street_photography, documentary
- soft_commercial, lifestyle_photography, beauty_commercial
- kodak_portra, fujifilm_superia, cinestill_800t, polaroid

### Cinematic
- hollywood_cinematic, teal_and_orange, dark_cinematic
- film_noir, moody_cinematic, golden_hour_cinematic
- suspense_thriller_style, romance_cinematic, sci_fi_cinematic

### Illustration & Art
- watercolor, oil_painting, gouache, charcoal, sketch_pencil
- clean_vector, flat_illustration, isometric
- anime_style, manga_style, webtoon_style

### Fantasy & Sci-Fi
- medieval_fantasy, cyberpunk_neon, steampunk_industrial
- post_apocalyptic, alien_world, underwater_fantasy

...และอีกมากมาย! ดู full catalog ใน schema

---

## 🌐 Platform Support

| Platform | text-to-image | image-to-image | inpaint | outpaint |
|----------|---------------|----------------|---------|----------|
| **Generic** | ✅ | ✅ | ✅ | ✅ |
| **Stable Diffusion** | ✅ | ✅ | ✅ | ✅ |
| **Midjourney** | ✅ | ✅ | ❌ | ❌ |
| **DALL-E 3** | ✅ | ✅ | ✅ | ⚠️ |
| **Gemini/Imagen** | ✅ | ✅ | ✅ | ✅ |
| **Flux** | ✅ | ✅ | ⚠️ | ❌ |
| **Firefly** | ✅ | ✅ | ✅ | ⚠️ |

---

## ⚙️ Task Types

- `final_prompt` — สร้างพรอมต์สุดท้ายพร้อมใช้งาน
- `ideas_10` — สร้างไอเดีย 10 แบบ
- `angles_10` — สร้างมุมกล้อง/คอมโพส 10 แบบ
- `storyboard_6` — สร้าง storyboard 6 ซีน
- `infographic_layout` — โครงสร้างเลย์เอาต์แบบอินโฟกราฟิก
- `style_catalog` — แสดงเมนูสไตล์
- `vfx_catalog` — แสดงเมนู VFX
- `typography_catalog` — แสดงเมนู Typography
- `update_preferences` — อัปเดต preferences

---

## 🔧 Default Values Summary

ทุกๆ input มี default values ดังนี้:

```json
{
  "request": "",                    // required field
  "generation_mode": "text_to_image",
  "task": "final_prompt",
  "detail_level": "standard",
  "languages": "en",
  "aspect_ratio": "9:16",
  "aspect_ratio_custom": "",
  "style": "photorealistic",
  "target_platform": "generic",
  "text_on_image": false,
  "realistic_skin": false,
  "identity_lock": "none",
  "reference_images": [],
  "edit_mask": {},
  "outpaint_config": {},
  "advanced_params": {
    "denoising_strength": 0.75,
    "guidance_scale": 7.5,
    "steps": 50,
    "seed": -1,
    "sampler": "dpm_2m_karras",
    "clip_skip": 1
  },
  "controlnet": {
    "enabled": false,
    "type": "canny",
    "weight": 1.0
  },
  "ip_adapter": {
    "enabled": false,
    "mode": "style",
    "weight": 0.6
  }
}
```

---

## 📝 Version History

### v2.1 (Current)
- ✅ เพิ่ม generation_mode สำหรับทุกโหมดการสร้างภาพ
- ✅ เพิ่ม text-based inpainting (edit_mask)
- ✅ เพิ่ม outpainting support (outpaint_config)
- ✅ เพิ่ม advanced_params (strength, CFG, steps, seed, sampler)
- ✅ เพิ่ม ControlNet และ IP-Adapter support
- ✅ เพิ่ม target_platform selection
- ✅ ปรับปรุง validation และ error handling
- ✅ ทุก input มี default values

### v1.0 (Legacy)
- Text-to-image พื้นฐาน
- Style catalog และ VFX
- Typography support
- Reference images พื้นฐาน

---

## 🎯 Best Practices

1. **ใช้ generation_mode ให้ชัดเจน** — ระบุ mode ที่ต้องการทุกครั้ง
2. **Text-based masking** — ใช้ภาษาธรรมชาติระบุพื้นที่แก้ไข
3. **Identity lock** — เลือกระดับที่เหมาะสม (soft สำหรับคน, strict สำหรับสินค้า)
4. **Denoising strength** — 0.3-0.6 = subtle, 0.7-0.9 = strong transformation
5. **Platform-specific** — เลือก target_platform ให้ตรงกับที่จะใช้จริง

---

## 📞 Support

สำหรับคำถามหรือข้อเสนอแนะเพิ่มเติม กรุณาติดต่อทีมพัฒนา

**Version**: 2.0  
**Last Updated**: January 24, 2026  
**License**: Proprietary
