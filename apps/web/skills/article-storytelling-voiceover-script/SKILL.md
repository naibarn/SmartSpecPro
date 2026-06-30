---
name: "Article Storytelling Voiceover Script"
description: Convert article pages into structured single-narrator or two-speaker storytelling scripts mapped to Storyboard Review video shots.
category: audio_generation
version: 1.0.0
icon: mic
tags:
  - presentation
  - storyboard-review
  - article-video
  - voiceover
auto_trigger: false
trigger_patterns: []
enabled_by_default: false
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
---
# Article Storytelling Voiceover Script

Transform article page content into spoken storytelling for Article to Storyboard Video projects.

## Purpose

The input is an article split into pages/shots. The output becomes narration or dialogue for a Storyboard Review project where each article page is one video shot. Write the spoken story only. Do not write camera directions, production notes, CSS overlay instructions, or prompt instructions.

## Output Contract

Return valid JSON only. Do not use Markdown code fences.

Required shape:

```json
{
  "mode": "single_narrator",
  "language": "th-TH",
  "speakers": [
    { "speaker": "ผู้บรรยาย", "voiceId": "TH-KantapongPremiumHD" }
  ],
  "segments": [
    {
      "shotId": "article-video-shot-1",
      "pageId": "page-1",
      "speaker": "ผู้บรรยาย",
      "voiceId": "TH-KantapongPremiumHD",
      "text": "ข้อความที่ใช้พูดจริง...",
      "targetDurationSeconds": 5
    }
  ],
  "targetDurationSeconds": 15,
  "warnings": []
}
```

For `two_speaker_dialogue`, alternate natural turns between the provided speakers. Each segment must include the matching `speaker` and `voiceId`.

## Storytelling Rules

- Preserve the article's real meaning and order.
- Make the script feel like a clear story, not a slide readout.
- For one narrator: concise, warm, explanatory, and easy to listen to.
- For two speakers: make the second speaker ask or react naturally; do not make both speakers read the same article paragraph.
- Keep each shot's spoken text close to its target duration.
- Prefer Thai when `language` is Thai.
- Do not invent claims, numbers, sources, quotes, guarantees, or factual details not present in the article.
- Do not mention CSS, overlay, camera movement, reference images, video model, TTS provider, API, or implementation details.

## Safety Rules

- No provider credentials, hidden metadata, tokens, URLs, or signed upload links.
- No code fences.
- No implementation instructions.
- No unsupported medical, financial, legal, safety, or performance claims.
- If the article content is too thin, return a short segment and add a warning instead of fabricating.

## Duration Guidance

- 5 seconds: one compact sentence.
- 10 seconds: one or two short sentences.
- 20 seconds: two to four natural spoken lines.
- Longer projects should distribute ideas across shots instead of making one long monologue.
