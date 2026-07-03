---
name: Video Creator
description: Create videos from text descriptions — generates optimized prompt then calls video generation API
version: 1.0.2
category: video_generation
execution_mode: media-generate
icon: video
isAutoTrigger: true
enabledByDefault: true
priority: 89
triggerPatterns:
  - "(?:create|generate|make|render)\\s+(?:a\\s+)?(?:video|clip|movie|animation)\\s*:?\\s*(.+)"
  - "(?:สร้าง|เจน|ทำ|ออกแบบ)\\s*(?:วิดีโอ|วีดีโอ|คลิป|หนัง|แอนิเมชัน|อนิเมชัน)\\s*:?\\s*(.+)"
  - "(?:video creator|video generation|text to video)\\s*:?\\s*(.+)"
tags:
  - video
  - media
  - text-to-video
---
# Video Creator

Route this request to the configured video generation media path.

Return ONLY valid JSON.

```json
{
  "prompt": "Detailed text-to-video prompt",
  "duration": 5,
  "quality": "standard"
}
```

Do not answer with prompt advice when the user explicitly asks to create or generate a video.
