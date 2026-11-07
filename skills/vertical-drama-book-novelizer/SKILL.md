---
name: vertical-drama-book-novelizer
description: Turn a vertical-drama episode storyboard, synopsis, dialogue, and shot images into a readable novel chapter while preserving source facts and episode boundaries.
---

# Vertical Drama Book Novelizer

Write polished novel prose from the selected episode's ordered source material. The storyboard is evidence for the scene; it is not a template that should become one paragraph per shot.

## Source and fidelity

- Read the episode synopsis/script, ordered shot descriptions, dialogue, series bible, and attached shot images together.
- Preserve the event order, established facts, character identity, relationships, setting, and the episode's ending. Use images only for visible details they support.
- Do not invent actions, inner thoughts, motives, backstory, dialogue, or outcomes. If a detail is uncertain, omit it or use restrained neutral wording.
- Keep every supplied dialogue line and its speaker meaningfully represented. Improve punctuation and natural flow without changing intent.
- Keep names, honorifics, and culturally meaningful terms consistent with the source language and series bible.

## Novel craft

- Write continuous scenes with varied sentence rhythm, clear point of view, sensory details grounded in the source, and natural transitions between shots.
- Combine adjacent shots into coherent paragraphs. Do not mention shot numbers, storyboard, prompts, or production notes in reader-facing prose.
- Place dialogue at the point it occurs in the scene, interleaved with narration. Avoid converting the chapter into a screenplay or transcript.
- Preserve suspense and emotional beats without adding melodrama that is absent from the source.
- Use the source language and the series' established tone. Prefer clear, idiomatic Thai when the source language is Thai.
- Return a concise quality rubric from 1 (needs work) to 5 (strong) for flow, readability, continuity, dialogue integration, source coverage, and unsupported-detail control. Add up to six short findings that help the author decide what to review; never claim a high score when source evidence is missing.

## Quality pass

Before returning the structured chapter, check flow, readability, continuity, character voice, dialogue naturalness, source coverage, and unsupported details. Make at most one focused self-revision. Return the structured chapter blocks plus the six rubric scores and concise findings; attach source shot references to every prose or dialogue block.

## Required output format

Return exactly one JSON object. Do not wrap it in Markdown, add a `novel` field, or put rubric scores at the root. Use this shape:

```json
{
  "blocks": [
    { "type": "paragraph", "sourceShotNumbers": [1, 2], "text": "Narrative prose." },
    { "type": "dialogue", "sourceShotNumbers": [2], "speaker": "Character name", "text": "Dialogue." },
    { "type": "scene_break", "sourceShotNumbers": [3] }
  ],
  "qualityReview": {
    "flow": 4,
    "readability": 4,
    "continuity": 4,
    "dialogue": 4,
    "sourceCoverage": 4,
    "unsupportedDetail": 5,
    "findings": []
  }
}
```

Use only `paragraph`, `dialogue`, and `scene_break` blocks. Every block must include `sourceShotNumbers` using the exact shot numbers supplied for this episode; collectively, the blocks must reference every supplied shot number at least once and must not reference any other number. A dialogue speaker may be `null` when the source does not identify one. Scores are integers from 1 to 5, and `findings` contains no more than six short strings. Do not return chapter metadata or any additional fields.
