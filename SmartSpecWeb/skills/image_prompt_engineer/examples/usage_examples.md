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
**Use Case**: Create a basic image from a description

```json
{
  "request": "Beautiful woman standing in a flower garden in the morning, soft sunlight filtering through branches"
}
```

**Output Prompt**:
```
TEXT-TO-IMAGE: Beautiful woman standing in a flower garden in the morning, soft sunlight filtering through branches

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
**Use Case**: Create an image with style and special effects

```json
{
  "request": "Medieval warrior holding a flaming sword",
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
**Use Case**: Create a poster with text

```json
{
  "request": "Towering mountain at sunset",
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
**Use Case**: Transform a photograph into a painting

```json
{
  "request": "Transform into a Van Gogh-style oil painting",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "Original photograph to transform"
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
IMAGE-TO-IMAGE TRANSFORMATION: Transform into a Van Gogh-style oil painting

Using 1 reference image(s):
  Image 1: primary_subject - Original photograph to transform

Transformation strength: 0.85 (0=minimal change, 1=maximum change)

Aspect ratio: 9:16
Target platform: generic
```

---

### Example 5: Outfit Change with Identity Lock
**Use Case**: Change clothing while keeping the original face

```json
{
  "request": "Change clothing to a navy blue business suit",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "Keep original face and pose"
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
**Use Case**: Recolor a product while keeping 100% original shape

```json
{
  "request": "Change shoe color to red",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "product",
      "notes": "Shoe to recolor"
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
**Use Case**: Change background only, keep person unchanged

```json
{
  "request": "Change background to a beach at sunset",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "Person in the original image"
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
INPAINTING TASK: Change background to a beach at sunset

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
**Use Case**: Edit only the specified object

```json
{
  "request": "Change the sofa to dark blue",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "location_background",
      "notes": "Living room with sofa"
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
**Use Case**: Edit a specified area using Thai language

```json
{
  "request": "Add a window on the left wall",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "location_background",
      "notes": "Room where window should be added"
    }
  ],
  "edit_mask": {
    "type": "prompt_based",
    "segment_prompt": "left wall, center",
    "preserve_areas": ["floor", "furniture", "ceiling"],
    "feather": 25
  },
  "languages": "th"
}
```

---

### Example 10: Remove Object
**Use Case**: Remove an object from the image

```json
{
  "request": "Remove the person in the background, make it a natural background",
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
**Use Case**: Expand image in all directions

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

**Output Prompt**:
```
OUTPAINTING TASK: Expand the image in all directions, show more of the surrounding scene

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
**Use Case**: Expand image horizontally to create a panorama

```json
{
  "request": "Expand image horizontally to create a panorama view",
  "generation_mode": "outpaint",
  "reference_images": [
    {
      "role": "location_background",
      "notes": "Landscape image to expand"
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
**Use Case**: Expand image upward to show the sky

```json
{
  "request": "Expand image upward to show sky and clouds",
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
**Use Case**: Control pose and style simultaneously

```json
{
  "request": "Create an image in the same pose but in Japanese cartoon style",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "Pose and position reference"
    },
    {
      "role": "style_reference",
      "notes": "Japanese cartoon image to copy style from"
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
**Use Case**: Create a prompt for Midjourney

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
**Use Case**: Create variations from an existing image with different seeds

```json
{
  "request": "Create a variation that looks similar but slightly different",
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
**Use Case**: Request full detailed output

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
**Use Case**: Use multiple reference images together

```json
{
  "request": "Create an image of a male model wearing branded clothing, standing in a coffee shop",
  "generation_mode": "image_to_image",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "Face and pose of the male model"
    },
    {
      "role": "outfit",
      "notes": "Branded clothing to wear"
    },
    {
      "role": "location_background",
      "notes": "Coffee shop atmosphere"
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
**Use Case**: Edit image and add text

```json
{
  "request": "Change the sky to pink evening colors and add text",
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
**Use Case**: Use all features together

```json
{
  "request": "Transform image into an advertising banner with text and adjusted background",
  "generation_mode": "inpaint",
  "reference_images": [
    {
      "role": "primary_subject",
      "notes": "Main product"
    },
    {
      "role": "style_reference",
      "notes": "Desired color tone"
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
echo '{"request": "Beautiful woman in a flower garden"}' | python3 skill.py

# Inpaint test
python3 skill.py --json '{"request":"Change background","generation_mode":"inpaint","reference_images":[{"role":"primary_subject"}],"edit_mask":{"type":"prompt_based","segment_prompt":"background"}}'

# Full detail test
python3 skill.py --json '{"request":"portrait","detail_level":"full"}'
```

### JavaScript (Node.js)
```bash
# Basic test
node -e 'const skill = require("./index.js"); console.log(JSON.stringify(skill.run({request: "Beautiful woman in a flower garden"}), null, 2))'
```

---

## Notes

- All examples can be customized as needed
- The `denoising_strength` choice has a big impact: 0.3-0.5 = minor change, 0.6-0.8 = moderate change, 0.9+ = major change
- For inpainting, use `feather` of at least 10px for smooth blending
- `target_platform` automatically adjusts the prompt format to be appropriate

---

**Version**: 2.0  
**Last Updated**: January 24, 2026
