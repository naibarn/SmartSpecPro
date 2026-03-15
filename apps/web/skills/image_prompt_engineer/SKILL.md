---
id: image_prompt_engineer
name: image_prompt_engineer
version: '2.1'
type: agent-skill
languages: en, th
category: image_prompt_generation
execution_mode: enhance-prompt
chainTo: image-creator
isAutoTrigger: true
enabledByDefault: true
priority: 50
triggerPatterns:
  - สร้างพรอมต์|เขียนพรอมต์|แต่งพรอมต์|enhance prompt|image prompt|prompt สำหรับภาพ
  - generate.*image.*prompt|พรอมต์.*ภาพ|prompt.*รูป|create.*prompt.*image
  - create image prompt|write image prompt|enhance image prompt|generate image prompt|create prompt|write prompt
  - img prompt|สร้าง prompt|เขียน prompt
description: Auto-imported from skills/image_prompt_engineer
icon: sparkles
tags: []
auto_trigger: true
trigger_patterns:
  - สร้างพรอมต์|เขียนพรอมต์|แต่งพรอมต์|enhance prompt|image prompt|prompt สำหรับภาพ
  - generate.*image.*prompt|พรอมต์.*ภาพ|prompt.*รูป|create.*prompt.*image
  - create image prompt|write image prompt|enhance image prompt|generate image prompt|create prompt|write prompt
  - img prompt|สร้าง prompt|เขียน prompt
enabled_by_default: true
credit_multiplier: 1
strict_provider_pin: false
---
# Image Prompt Engineer (v2.1)

## 🆕 v2.1 Update: Hallucination Control

- ✅ **Prevents nationality/ethnicity hallucination** — Prevents adding unspecified nationality data
- ✅ **Auto-correction** — Automatic correction (e.g. "Korean fashion" → "modern fashion")
- ✅ **Warnings in output** — Alerts when hallucination is detected

## 🎯 Purpose
Create comprehensive, clear "prompts for AI image generation systems" that support all image generation modes:

### ✅ Supported Modes (New in v2.1!)
1. **Text-to-Image** — Generate images from text descriptions
2. **Image-to-Image** — Transform images from reference images
3. **Inpaint** — Edit only selected areas (Text-based masking)
4. **Outpaint** — Expand images beyond the original frame
5. **Variation** — Create variations from an existing image

### 🌟 Key Features
- **Default mode emphasizes realism** (can be changed with Style/VFX)
- Supports **text on image (Typography)** with selectable categories/styles
- Supports **multiple reference images** (assign roles to each image)
- **Text-based Masking** — Specify edit areas using natural language
- **Platform-specific Output** — Adjust prompts per platform
- **Advanced Controls** — Fine-tune advanced parameters

---

## 📊 What's New in v2.1

### 🚀 Major Features

#### 1. Generation Mode Selection
Clearly specify the image generation mode:
```json
{
  "generation_mode": "text_to_image" | "image_to_image" | "inpaint" | "outpaint" | "variation"
}
```

#### 2. Text-based Inpainting
Edit only the desired areas using natural language:
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
Expand images in all directions:
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
Fine-grained control over image generation:
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
Adjust prompts to suit the target platform:
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
  "request": "Description of what you want" // The only required field!
}
```

### Core Fields (All have defaults)
```json
{
  "generation_mode": "text_to_image",  // default
  "background_type": "normal",         // normal | green_screen | blue_screen | transparent
  "task": "final_prompt",              // default
  "detail_level": "standard",          // compact | standard | full
  "languages": "en",                   // en | th
  "aspect_ratio": "9:16",              // 7 options available
  "aspect_ratio_custom": "",           // e.g. "5:4"
  "style": "photorealistic",           // 151+ styles
  "target_platform": "generic"         // 7 platforms
}
```

### Image-to-Image Fields
```json
{
  "reference_images": [
    {
      "role": "primary_subject" | "outfit" | "product" | "location_background" | ...,
      "notes": "Additional description"
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
    "type": "prompt_based",              // or ai_segment, rectangle, brush
    "segment_prompt": "sky",             // "sky", "background", "the woman's dress"
    "preserve_areas": ["face", "hands"], // Areas to preserve
    "feather": 10,                       // Edge softness (px)
    "invert": false                      // Invert mask
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
    "blend_width": 64,     // px (blend zone)
    "match_style": true    // Match original style
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
  "prompt": "Main prompt in the selected language",
  "avoid": ["List of things to avoid"],
  "detail_level": "standard",
  "task": "final_prompt",
  "generation_mode": "text_to_image",
  "target_platform": "generic",
  "parameters": {
    "aspect_ratio": "9:16",
    "generation_mode": "text_to_image",
    "denoising_strength": 0.75,  // if applicable
    "cfg_scale": 7.5,            // if applicable
    "steps": 50                  // if applicable
  },
  "breakdown": {               // if detail_level = full
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
  "request": "Beautiful woman standing in a flower garden in the morning"
}
```
✅ Uses all defaults: photorealistic style, 9:16 aspect ratio, standard detail

### Example 2: Image-to-Image (Style Transfer)
```json
{
  "request": "Transform into an oil painting",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "Keep the original main composition"
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
  "request": "Change the background to a beach at sunset",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "Keep the person in the original image 100%"
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
  "request": "Expand the image in all directions, show more of the surrounding scene",
  "generation_mode": "outpaint",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "Original image to expand"
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
  "request": "Create an image in the same pose but in cartoon style",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "Pose reference"
    },
    {
      "role": "style_reference",
      "notes": "Cartoon style reference"
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

This skill comes with knowledge files serving as catalogs and best practices:

1. **ai_image_style_categories.md** — Style catalog (151+ styles)
2. **prompt_depth_reference.md** — Prompt logic and structure
3. **vfx_effects_menu.md** — Complete VFX menu (50+ effects)
4. **realistic_skin_preservation_rules.md** — Realistic skin rules
5. **identity_consistency_rules.md** — Identity preservation rules
6. **photorealistic_prompting_research_notes.md** — Research notes
7. **legacy_system_prompt_reference.md** — Legacy workflow reference

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

...and many more! See the full catalog in the schema

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

- `final_prompt` — Generate the final ready-to-use prompt
- `background_10` — Generate 10 random background/scene ideas
- `ideas_10` — Generate 10 concept ideas
- `angles_10` — Generate 10 camera angles/compositions
- `storyboard_continue` — Continue from existing storyboard frames (adds next frames)
- `storyboard_6` — Create a 6-scene storyboard
- `infographic_layout` — Infographic layout structure
- `style_catalog` — Show style menu
- `vfx_catalog` — Show VFX menu
- `typography_catalog` — Show Typography menu
- `update_preferences` — Update preferences

---

## 🔧 Default Values Summary

All inputs have the following default values:

```json
{
  "request": "",                    // required field
  "generation_mode": "text_to_image",
  "background_type": "normal",      // normal | green_screen | blue_screen | transparent
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
- ✅ Added generation_mode for all image generation modes
- ✅ Added text-based inpainting (edit_mask)
- ✅ Added outpainting support (outpaint_config)
- ✅ Added advanced_params (strength, CFG, steps, seed, sampler)
- ✅ Added ControlNet and IP-Adapter support
- ✅ Added target_platform selection
- ✅ Improved validation and error handling
- ✅ All inputs have default values

### v1.0 (Legacy)
- Basic text-to-image
- Style catalog and VFX
- Typography support
- Basic reference images

---

## 🎯 Best Practices

1. **Use generation_mode clearly** — Always specify the desired mode
2. **Text-based masking** — Use natural language to specify edit areas
3. **Identity lock** — Choose the appropriate level (soft for people, strict for products)
4. **Denoising strength** — 0.3-0.6 = subtle, 0.7-0.9 = strong transformation
5. **Platform-specific** — Choose the target_platform matching your actual platform

---

## 🎨 Style Value to Description Mapping

**CRITICAL**: When generating prompts, NEVER use the style ID/value directly in the prompt. Instead, always use the descriptive text.

### How to Handle Style Input

When the user selects a style like `pixar_3d_animated`, you MUST convert it to a descriptive phrase:

| Style Value | Use This Description in Prompt |
|-------------|-------------------------------|
| `pixar_3d_animated` | "Pixar-style 3D animation, vibrant colors, expressive characters, smooth rendering" |
| `disney_3d_animated` | "Disney-style 3D animation, magical atmosphere, beautiful and charming characters" |
| `dreamworks_3d` | "DreamWorks-style 3D animation, fun and humorous, dynamic expressions" |
| `claymation` | "Claymation stop-motion style, clay-like texture, handcrafted appearance" |
| `low_poly_3d` | "Low poly 3D style, geometric shapes, minimalist polygonal aesthetic" |
| `photorealistic` | "Photorealistic, ultra-detailed, lifelike textures, natural lighting" |
| `ultra_realistic` | "Ultra-realistic, hyper-detailed, 8K resolution, cinematic quality" |
| `ghibli_style_mood` | "Studio Ghibli-style, warm and nostalgic, hand-painted aesthetic, whimsical atmosphere" |
| `cyberpunk` | "Cyberpunk aesthetic, neon lights, dark urban environment, futuristic technology" |
| `watercolor` | "Watercolor painting style, soft color bleeding, translucent washes, artistic texture" |
| `oil_painting` | "Oil painting style, rich colors, visible brushstrokes, classical artistic technique" |
| `modern_anime` | "Modern anime style, clean lines, vibrant colors, expressive eyes" |

### General Rule

For any style value:
1. Extract the readable parts from the value (replace underscores with spaces)
2. Add descriptive modifiers that enhance the style
3. NEVER output the raw value like "style: pixar_3d_animated" in the prompt

**❌ WRONG**: "A cat, style pixar_3d_animated"
**✅ CORRECT**: "A cat in Pixar-style 3D animation, vibrant colors, expressive features, smooth CGI rendering"

---

## 📊 Prompt Count and Layout Formats

When `prompt_count` is specified with a layout format, generate prompts accordingly:

| Value | Count | Layout Type | Description |
|-------|-------|-------------|-------------|
| `1` | 1 | Single | Single standalone image |
| `2_distinct` | 2 | Distinct | 2 separate, unique shots |
| `2_1x2` | 2 | Grid | Vertical arrangement (1 column, 2 rows) |
| `2_2x1` | 2 | Grid | Horizontal arrangement (2 columns, 1 row) |
| `3_distinct` | 3 | Distinct | 3 separate, unique shots |
| `3_1x3` | 3 | Grid | Vertical strip |
| `3_3x1` | 3 | Grid | Horizontal strip |
| `4_distinct` | 4 | Distinct | 4 separate, unique shots |
| `4_2x2` | 4 | Grid | 2×2 square grid |
| `6_distinct` | 6 | Distinct | 6 separate, unique shots |
| `6_3x2` | 6 | Grid | 3 columns × 2 rows |
| `6_2x3` | 6 | Grid | 2 columns × 3 rows |
| `6_storyboard` | 6 | Storyboard | Sequential story frames with narrative flow |
| `9_3x3` | 9 | Grid | 3×3 square grid |
| `12_4x3` | 12 | Grid | 4 columns × 3 rows |
| `12_3x4` | 12 | Grid | 3 columns × 4 rows |
| `16_4x4` | 16 | Grid | 4×4 square grid |

### Layout Type Behavior

- **Distinct**: Each prompt is independent, focusing on variety and unique compositions
- **Grid**: Prompts should work together as a cohesive set, similar styling and color palette
- **Storyboard**: Sequential narrative flow, each frame follows the previous logically

---

## 📞 Support

For questions or additional suggestions, please contact the development team

**Version**: 2.1
**Last Updated**: February 4, 2026
**License**: Proprietary