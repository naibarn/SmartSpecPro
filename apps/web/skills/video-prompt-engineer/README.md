# 🎬 Video Prompt Engineer v1.0

**Professional AI Video Prompt Generator for Cinematic Content**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/yourusername/video-prompt-engineer)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platforms-5-orange.svg)](#supported-platforms)

Transform simple video concepts into professional, cinematic AI video prompts optimized for Sora, Veo, Kling, Wan, and Seedance.

---

## ✨ Features

- 🎥 **Multi-Platform Support** - Sora, Veo, Kling, Wan, Seedance
- 🎬 **Cinematic Quality** - Professional film terminology
- 📐 **Multi-Format** - Vertical (9:16), Horizontal (16:9), Square (1:1)
- 🎨 **15+ Visual Styles** - From photorealistic to artistic
- 🎵 **Comprehensive Audio** - Music, SFX, voiceover scripts
- 📱 **Social Optimization** - TikTok, Instagram, YouTube
- 🌐 **Bilingual** - English & Thai support
- ⚡ **Smart Defaults** - Intelligent parameter selection

---

## 🚀 Quick Start

### Installation

```bash
# Using Python
pip install -r requirements.txt

# Using Node.js
npm install
```

### Basic Usage

```python
# Python
from skill import run

result = run({
    "request": "A woman walking through a Tokyo street market at sunset",
    "target_platform": "sora",
    "aspect_ratio": "16:9",
    "cinematic_style": "cinematic"
})

print(result["prompt"])
```

```javascript
// JavaScript
const { buildPrompt } = require('./js/index.js');

const result = buildPrompt({
    request: "A woman walking through a Tokyo street market at sunset",
    target_platform: "sora",
    aspect_ratio: "16:9",
    cinematic_style: "cinematic"
});

console.log(result.prompt);
```

### CLI Usage

```bash
# Python
echo '{"request":"Fashion transformation video"}' | python3 python/skill.py

# Output:
# {
#   "prompt": "A cinematic video with dynamic camera movement...",
#   "platform": "compatible",
#   "metadata": {...}
# }
```

---

## 📋 Supported Platforms

| Platform | Duration | Style | Best For |
|----------|----------|-------|----------|
| **Sora** (OpenAI) | 4-20s | Detailed | Cinematic quality |
| **Veo** (Google) | 4-8s | Compact | Quick clips |
| **Kling** | 5-10s | Cinematic | Photorealistic |
| **Wan** | 4-15s | Narrative | Storytelling |
| **Seedance** | 4-12s | Artistic | Creative |
| **Compatible** | 4-60s | Universal | All platforms |

---

## 🎯 Use Cases

### 1. Product Review (TikTok/Instagram)

```json
{
  "request": "Unboxing new iPhone with feature highlights",
  "target_platform": "veo",
  "aspect_ratio": "9:16",
  "content_type": "product_review",
  "hook_strategy": "curiosity_gap",
  "pacing": "fast",
  "cta": "like"
}
```

**Output:**
> "Dynamic close-up shots of hands unboxing sleek smartphone. Camera pans across features. Upbeat electronic music. Modern, clean aesthetic. Perfect lighting highlights product details."

---

### 2. Fashion Transformation (Instagram Reels)

```json
{
  "request": "Woman changes 3 outfits from casual to elegant",
  "target_platform": "compatible",
  "aspect_ratio": "9:16",
  "content_type": "fashion_content",
  "montage_style": "fast_cuts",
  "hook_strategy": "before_after",
  "music_mood": "upbeat_pop"
}
```

**Output:**
> "Fast-paced fashion montage. Mirror shot, woman spins revealing outfit 1: casual jeans. Quick transition. Outfit 2: business chic. Final spin: elegant evening dress. Upbeat pop music drives energy. Smooth transitions between looks."

---

### 3. Cinematic Storytelling (YouTube)

```json
{
  "request": "A girl discovers an old letter in her grandmother's attic",
  "target_platform": "sora",
  "aspect_ratio": "16:9",
  "cinematic_style": "drama",
  "camera_movement": "dolly_in",
  "lighting_style": "golden_hour",
  "emotion": "nostalgia",
  "pacing": "slow",
  "duration": 15
}
```

**Output:**
> "Cinematic dolly-in shot. Golden hour light streams through dusty attic window. Young woman in her 20s discovers weathered envelope. Shallow depth of field isolates subject. Dust particles dance in light. Shot on 35mm film, anamorphic lens. Emotional piano score. She opens letter, eyes glisten with tears. Intimate, nostalgic atmosphere."

---

## 📚 Documentation

- **[skill.md](skill.md)** - Complete feature documentation
- **[schemas/input.schema.json](schemas/input.schema.json)** - All input parameters
- **[knowledge/cinematic_techniques.md](knowledge/cinematic_techniques.md)** - Film terminology guide
- **[examples/](examples/)** - Usage examples

---

## 🎬 Key Parameters

### Essential

```json
{
  "request": "Your video concept",           // Required
  "target_platform": "sora",                 // sora|veo|kling|wan|seedance|compatible
  "aspect_ratio": "9:16",                    // 9:16|16:9|1:1|4:5|21:9
  "duration": 8                              // 4-60 seconds
}
```

### Cinematic

```json
{
  "cinematic_style": "cinematic",            // 13 film genres
  "visual_style": "photorealistic",          // 15 visual treatments
  "camera_movement": "tracking",             // 14 camera movements
  "shot_composition": "medium_shot",         // 13 compositions
  "lighting_style": "golden_hour"            // 15 lighting setups
}
```

### Audio

```json
{
  "sound_design": "balanced",                // 12 audio mixes
  "music_mood": "upbeat_pop",                // 11 music styles
  "audio_language": "english"                // english|thai|no_dialogue
}
```

### Engagement

```json
{
  "hook_strategy": "question",               // 6 hook types
  "cta": "follow",                           // 9 CTAs
  "emotion": "excitement",                   // 12 emotions
  "pacing": "fast"                           // fast|medium|slow
}
```

---

## 💡 Examples

### Vertical Video (9:16) - TikTok/Reels

```json
{
  "request": "Morning routine - coffee, skincare, outfit",
  "aspect_ratio": "9:16",
  "content_type": "lifestyle_vlog",
  "pacing": "medium",
  "music_mood": "lo_fi_chill",
  "social_platform": "tiktok"
}
```

### Horizontal Video (16:9) - YouTube

```json
{
  "request": "Tech review: Latest laptop performance tests",
  "aspect_ratio": "16:9",
  "content_type": "product_review",
  "cinematic_style": "commercial",
  "visual_style": "corporate",
  "duration": 30
}
```

### Square Video (1:1) - Instagram Feed

```json
{
  "request": "Recipe: Quick pasta dish step-by-step",
  "aspect_ratio": "1:1",
  "content_type": "tutorial",
  "camera_movement": "static",
  "shot_composition": "close_up",
  "pacing": "medium"
}
```

---

## 🎨 Creative Freedom

Control AI creativity level (0-100):

| Level | % | Style | Use For |
|-------|---|-------|---------|
| Conservative | 0-20 | Safe, predictable | Corporate videos |
| Professional | 20-40 | Polished, tested | Marketing content |
| Balanced | 40-60 | Creative + structure | Social media |
| Creative | 60-80 | Experimental | Artistic projects |
| Bold | 80-95 | Boundary-pushing | Viral content |
| Chaotic | 95-100 | Maximum freedom | Experimental art |

```json
{
  "creative_freedom": 70,  // Sweet spot for viral content
  "optimize_for_virality": true
}
```

---

## 🌐 Language Support

### English (Default)

```json
{
  "language": "en",
  "audio_language": "english",
  "script_language": "english"
}
```

### Thai

```json
{
  "language": "th",
  "audio_language": "thai",
  "script_language": "thai"
}
```

### Bilingual

```json
{
  "script_language": "bilingual"  // Includes English + Thai translation
}
```

---

## 📊 Platform Comparison

| Feature | Sora | Veo | Kling | Wan | Seedance |
|---------|------|-----|-------|-----|----------|
| Max Duration | 20s | 8s | 10s | 15s | 12s |
| Prompt Length | Unlimited | 500 char | Unlimited | Unlimited | Unlimited |
| Text Overlay | ✅ | ❌ | ✅ | ✅ | ✅ |
| Technical Terms | ✅ | ❌ | ✅ | ❌ | ✅ |
| Best Quality | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 🔧 Advanced Features

### Multi-Shot Montages

```json
{
  "montage_style": "fast_cuts",      // 11 editing styles
  "pacing": "fast",
  "music_mood": "upbeat_pop"
}
```

### Brand Integration

```json
{
  "brand_elements": {
    "include_branding": true,
    "brand_colors": "blue and gold",
    "brand_tone": "professional"
  }
}
```

### Reference Images

```json
{
  "reference_images": [
    {"role": "start_frame", "notes": "Opening shot"},
    {"role": "end_frame", "notes": "Closing shot"}
  ]
}
```

---

## 📁 Project Structure

```
video_prompt_engineer_v1/
├── README.md                    # This file
├── skill.md                     # Full documentation
├── schemas/
│   ├── input.schema.json       # Input parameters
│   └── output.schema.json      # Output format
├── python/
│   └── skill.py                # Python implementation
├── js/
│   ├── index.js                # JavaScript implementation
│   └── package.json            # NPM package
├── knowledge/
│   └── cinematic_techniques.md # Film terminology guide
└── examples/
    └── usage_examples.json     # Example use cases
```

---

## 🎓 Learning Resources

1. **Film Terminology** - See `knowledge/cinematic_techniques.md`
2. **Platform Guides** - See `skill.md` for platform-specific tips
3. **Examples** - See `examples/` for real-world use cases

---

## 🐛 Troubleshooting

### Veo 500 Character Limit

```python
# Automatic truncation with warning
result = run({
    "target_platform": "veo",
    "request": "Very long description..."
})

if "warnings" in result:
    print("Prompt truncated to 500 chars")
```

### Platform Duration Limits

```python
# Duration auto-adjusted to platform limits
result = run({
    "target_platform": "veo",
    "duration": 20  # Will be capped at 8s for Veo
})
```

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## 📝 License

MIT License - See [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- Inspired by Custom GPT video generation tools
- Built for compatibility with Claude Skills & OpenCode
- Optimized for cinematic quality across all platforms

---

## 📞 Support

- **Documentation**: [skill.md](skill.md)
- **Examples**: [examples/](examples/)
- **Issues**: GitHub Issues

---

## 🗺️ Roadmap

### v1.1 (Coming Soon)
- [ ] More platform support
- [ ] Advanced script generation
- [ ] Multi-language expansion
- [ ] Custom style presets

### v1.2
- [ ] Video storyboarding
- [ ] Shot list generation
- [ ] Timing breakdowns

---

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** January 2026  
**Platforms:** Sora, Veo, Kling, Wan, Seedance, Compatible  
**Languages:** English, Thai

---

⭐ **Star this repo if you find it useful!**

