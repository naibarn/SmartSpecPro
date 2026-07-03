---
name: Image Creator
description: Create images from text descriptions — generates optimized prompt then calls image generation API
version: 1.0.2
category: image_generation
execution_mode: media-generate
icon: image
isAutoTrigger: true
enabledByDefault: true
priority: 90
defaultModel: gpt-image-2
triggerPatterns:
  - "(?:create|generate|make|draw|render)\\s+(?:an?\\s+)?(?:image|picture|photo|portrait|illustration|artwork)\\s*:?\\s*(.+)"
  - "(?:สร้าง|เจน|วาด|ทำ|ออกแบบ)\\s*(?:รูปภาพ|รูป|ภาพ|ภาพถ่าย|พอร์ตเทรต|ภาพประกอบ)\\s*:?\\s*(.+)"
  - "(?:image creator|image generation|text to image)\\s*:?\\s*(.+)"
tags:
  - image
  - media
  - text-to-image
---
# Image Creator

Route this request to the configured image generation media path.

Return ONLY valid JSON.

```json
{
  "prompt": "Detailed text-to-image prompt",
  "model": "gpt-image-2",
  "numImages": 1,
  "quality": "standard"
}
```

Do not answer with prompt advice when the user explicitly asks to create or generate an image.
