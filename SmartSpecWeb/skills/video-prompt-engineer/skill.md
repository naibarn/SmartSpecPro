# Video Prompt Engineer v1.0

## 📹 Overview

**Video Prompt Engineer** is a professional AI video prompt generation skill that creates high-quality, cinematic prompts for multiple AI video platforms.

### Supported Platforms

- ✅ **Sora** - OpenAI Sora 2 (detailed, 4-20s)
- ✅ **Veo** - Google Veo 3.1 (compact, 4-8s, 500 char limit)
- ✅ **Kling** - Kling AI (cinematic, photorealistic)
- ✅ **Wan** - Wan Show AI (narrative-focused)
- ✅ **Seedance** - Seedance (creative, artistic)
- ✅ **Compatible** - Universal format (all platforms)

### Key Features

- 🎬 **Cinematic Quality** - Professional film terminology and techniques
- 📐 **Multi-Format** - Vertical (9:16), Horizontal (16:9), Square (1:1)
- 🎨 **Visual Styles** - 15+ cinematic styles
- 🎵 **Audio Design** - Comprehensive sound design options
- 📝 **Script Generation** - Bilingual dialogue/voiceover scripts
- ⚡ **Platform Optimization** - TikTok, Instagram, YouTube, etc.
- 🔄 **Smart Defaults** - Intelligent parameter selection

---

## 🎯 Quick Start

### Basic Usage

```json
{
  "request": "A woman walking through a busy street market at sunset",
  "target_platform": "sora",
  "aspect_ratio": "16:9"
}
```

### Fashion Content Example

```json
{
  "request": "Fashion transformation - changing 3 outfits",
  "target_platform": "compatible",
  "aspect_ratio": "9:16",
  "content_type": "fashion_content",
  "montage_style": "fast_cuts",
  "hook_strategy": "before_after"
}
```

### Product Review Example

```json
{
  "request": "Unboxing latest smartphone with detailed features",
  "target_platform": "veo",
  "aspect_ratio": "9:16",
  "content_type": "product_review",
  "sound_design": "balanced",
  "cta": "like"
}
```

---

## 📋 Input Parameters

### Required

| Parameter | Type | Description |
|-----------|------|-------------|
| `request` | string | Main video concept/description |

### Core Settings

| Parameter | Type | Default | Options |
|-----------|------|---------|---------|
| `target_platform` | string | `compatible` | `sora`, `veo`, `kling`, `wan`, `seedance`, `compatible` |
| `language` | string | `en` | `en`, `th`, `auto` |
| `duration` | integer | `8` | 4-60 (platform limits apply) |
| `aspect_ratio` | string | `9:16` | `9:16`, `16:9`, `1:1`, `4:5`, `21:9` |

### Cinematic Style

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cinematic_style` | string | `cinematic` | Overall aesthetic (13 options) |
| `visual_style` | string | `cinematic` | Color grading style (15 options) |
| `camera_movement` | string | `dynamic` | Primary camera movement (14 options) |
| `shot_composition` | string | `medium_shot` | Framing (13 options) |
| `lighting_style` | string | `natural` | Lighting setup (15 options) |

### Audio & Sound

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `audio_language` | string | `english` | Spoken language |
| `sound_design` | string | `balanced` | Audio mix (12 options) |
| `music_mood` | string | `none` | Background music (11 options) |

### Content & Engagement

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `content_type` | string | `general` | Content category (11 types) |
| `hook_strategy` | string | `none` | Opening hook (6 strategies) |
| `cta` | string | `none` | Call-to-action (9 options) |
| `emotion` | string | `neutral` | Emotional tone (12 emotions) |
| `pacing` | string | `medium` | Video rhythm (5 options) |

### Platform & Audience

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `social_platform` | string | `universal` | Social optimization (8 platforms) |
| `target_audience` | string | `general` | Demographics (8 audiences) |

### Advanced

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `montage_style` | string | `none` | Multi-shot editing (11 styles) |
| `text_overlay` | boolean | `false` | Include text (Sora only) |
| `creative_freedom` | integer | `50` | AI creativity (0-100) |
| `color_grading` | string | `natural` | Color preset (10 options) |

---

## 🎬 Cinematic Styles

### Film Genres

- `cinematic` - Professional film aesthetic
- `documentary` - Observational, realistic
- `commercial` - Polished advertising style
- `music_video` - Dynamic, artistic
- `noir` - High contrast, shadows
- `sci_fi` - Futuristic, sleek
- `horror` - Dark, atmospheric
- `romance` - Soft, warm
- `action` - Fast-paced, dynamic
- `drama` - Emotional, intimate

### Visual Treatments

- `photorealistic` - Ultra-realistic rendering
- `vibrant` - Saturated colors
- `minimalist` - Clean, simple
- `retro` - Vintage aesthetic
- `neon` - Cyberpunk, neon lights
- `pastel` - Soft, muted colors
- `dark` - Low-key, moody

---

## 📐 Camera Techniques

### Camera Movements

```
dolly_in/out    - Camera moves closer/farther
pan_left/right  - Camera rotates horizontally  
tilt_up/down    - Camera rotates vertically
tracking        - Camera follows subject
crane           - Camera rises/descends
orbit           - Camera circles subject
handheld        - Handheld camera feel
steadicam       - Smooth, flowing movement
```

### Shot Compositions

```
extreme_close_up    - Very tight on detail
close_up            - Face/object detail
medium_shot         - Waist up
wide_shot           - Full body/scene
extreme_wide        - Vast landscape
pov                 - Point of view
low_angle           - Looking up
high_angle          - Looking down
```

---

## 🎵 Audio Design

### Sound Design Presets

| Preset | Description |
|--------|-------------|
| `silent_subtitles` | No audio, text only |
| `music_only` | Background music dominant |
| `voiceover_dominant` | Voice-over primary |
| `balanced` | Equal mix of all elements |
| `asmr` | Intimate, close sounds |
| `sfx_heavy` | Strong sound effects |
| `dramatic` | Orchestral, emotional |
| `upbeat` | Energetic, positive |
| `lo_fi` | Chill, relaxed |
| `epic` | Grand, cinematic |

### Music Moods

- `upbeat_pop` - Energetic, fun
- `dramatic_orchestral` - Intense, emotional
- `lo_fi_chill` - Relaxed, casual
- `epic_cinematic` - Grand, powerful
- `romantic_piano` - Soft, intimate
- `suspense_tension` - Mysterious, tense
- `corporate_motivational` - Professional, inspiring
- `ambient_nature` - Calm, natural

---

## 📱 Platform Optimization

### TikTok (`aspect_ratio: 9:16`)
- Hook in first 3 seconds
- Fast-paced editing
- Trending sounds
- Clear visuals

### Instagram Reels (`aspect_ratio: 9:16` or `4:5`)
- Aesthetic visuals
- Strong first frame
- Smooth transitions
- Branded content

### YouTube Shorts (`aspect_ratio: 9:16`)
- Attention-grabbing hook
- Clear value proposition
- Longer storytelling
- End screen CTA

### YouTube (`aspect_ratio: 16:9`)
- Cinematic quality
- Detailed storytelling
- Professional production
- Chapter markers

---

## 🎯 Content Types

### Product Review
```json
{
  "content_type": "product_review",
  "hook_strategy": "problem_statement",
  "cta": "product_link",
  "pacing": "medium"
}
```

### Fashion Content
```json
{
  "content_type": "fashion_content",
  "montage_style": "fast_cuts",
  "hook_strategy": "before_after",
  "music_mood": "upbeat_pop"
}
```

### Storytelling
```json
{
  "content_type": "storytelling",
  "pacing": "slow",
  "emotion": "empathy",
  "sound_design": "dramatic"
}
```

---

## 🔧 Platform-Specific Features

### Sora (OpenAI)
- **Duration**: 4-20 seconds
- **Prompt Style**: Detailed, technical
- **Special Features**: 
  - Text overlay support
  - Professional terminology
  - Advanced camera movements
- **Best For**: Cinematic, high-quality content

### Veo (Google)
- **Duration**: 4-8 seconds
- **Char Limit**: 500 characters
- **Structure**: 5-part (Cinematography + Subject + Action + Context + Style)
- **Audio Format**: `SFX: [desc] | Character says, "[dialogue]"`
- **Best For**: Short, impactful clips

### Compatible (Universal)
- **Duration**: 4-60 seconds
- **Style**: Balanced approach
- **Special Features**: Works across all platforms
- **Best For**: Multi-platform distribution

---

## 📊 Output Format

### Standard Output

```json
{
  "prompt": "Cinematic tracking shot follows...",
  "platform": "sora",
  "metadata": {
    "title": "Market Walk",
    "duration": 12,
    "aspect_ratio": "16:9",
    "language": "en"
  },
  "structure": {
    "cinematography": "Tracking shot, 35mm film",
    "subject": "Young woman",
    "action": "Walking through market",
    "setting": "Tokyo street market",
    "lighting": "Golden hour",
    "movement": "Smooth tracking"
  },
  "script": {
    "dialogue": "The best moments...",
    "translation": "The best moments..."
  },
  "technical_specs": {
    "camera": "35mm film camera",
    "lens": "50mm f/1.4",
    "fps": 24
  }
}
```

---

## 💡 Best Practices

### For Viral Content
```json
{
  "optimize_for_virality": true,
  "hook_strategy": "shock_value",
  "pacing": "fast",
  "cta": "share",
  "creative_freedom": 70
}
```

### For Professional Content
```json
{
  "cinematic_style": "commercial",
  "visual_style": "corporate",
  "sound_design": "balanced",
  "creative_freedom": 20
}
```

### For Artistic Content
```json
{
  "cinematic_style": "experimental",
  "creative_freedom": 85,
  "color_grading": "custom",
  "target_platform": "seedance"
}
```

---

## 🎨 Creative Freedom Levels

| Level | % | Description | Use Case |
|-------|---|-------------|----------|
| Conservative | 0-20 | Safe, predictable | Corporate, formal |
| Professional | 20-40 | Polished, tested | Marketing, ads |
| Balanced | 40-60 | Creative + structure | Content creation |
| Creative | 60-80 | Experimental | Artistic projects |
| Bold | 80-95 | Pushing boundaries | Innovative content |
| Chaotic | 95-100 | Maximum creativity | Experimental art |

---

## 📚 Examples

See `examples/` directory for:
- Fashion transformation videos
- Product reviews
- Storytelling narratives
- Documentary style
- Music video concepts
- Commercial spots

---

## 🔄 Version History

**v1.0** (January 2026)
- Initial release
- Multi-platform support (5 platforms)
- Comprehensive input schema
- Bilingual script generation
- Cinematic quality focus
- Vertical & horizontal formats

---

## 📞 Support

For questions or feature requests, please refer to the documentation or examples.

**Platform Compatibility Matrix:**

| Feature | Sora | Veo | Kling | Wan | Seedance | Compatible |
|---------|------|-----|-------|-----|----------|------------|
| Duration (max) | 20s | 8s | 10s | 15s | 12s | 60s |
| Text Overlay | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Technical Terms | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| Script Generation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-language | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

**Status:** ✅ Production Ready  
**Language Support:** English, Thai  
**Last Updated:** January 2026
