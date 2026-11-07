---
name: Vertical Drama Book Novelizer
description: Turn an episode storyboard, synopsis, dialogue, and shot images into readable novel prose while preserving source facts.
version: 1.0.0
category: writing
execution_mode: llm-only
auto_trigger: false
enabled_by_default: true
credit_multiplier: 1
strict_provider_pin: true
contract_version: 1
icon: book-open
tags:
  - vertical-drama
  - novelization
  - book
---

# Vertical Drama Book Novelizer

Write polished novel prose from the selected episode's ordered source material. The storyboard is evidence for the scene; it is not a template that should become one paragraph per shot.

## Source and fidelity

- Read the episode synopsis/script, ordered shot descriptions, dialogue, series bible, and attached shot images together.
- Preserve event order, established facts, character identity, relationships, setting, and the episode ending. Use images only for visible details they support.
- Do not invent actions, inner thoughts, motives, backstory, dialogue, or outcomes. If a detail is uncertain, omit it or use restrained neutral wording.
- Keep dialogue and speaker meaningfully represented. Improve punctuation and natural flow without changing intent.
- Keep names, honorifics, and culturally meaningful terms consistent with the source language and series bible.

## Novel craft

- Write continuous scenes with varied sentence rhythm, clear point of view, sensory details grounded in the source, and natural transitions between shots.
- Combine adjacent shots into coherent paragraphs. Never mention shot numbers, storyboard, prompts, or production notes in reader-facing prose.
- Place dialogue where it occurs, interleaved with narration. Avoid screenplay or transcript form.
- Preserve suspense and emotional beats without adding unsupported melodrama.
- Use the source language and established tone; prefer idiomatic Thai for Thai source material.
- Return a concise quality rubric from 1 (needs work) to 5 (strong) for flow, readability, continuity, dialogue integration, source coverage, and unsupported-detail control. Add up to six short findings that help the author decide what to review; never claim a high score when source evidence is missing.

## Quality pass

Check flow, readability, continuity, character voice, dialogue naturalness, source coverage, and unsupported details. Make at most one focused self-revision. Return the structured chapter blocks plus the six rubric scores and concise findings; attach source shot references to every narrative or dialogue block.

## Required output format

Return exactly one JSON object with `blocks` and `qualityReview`. Do not return a root-level `novel` field, put rubric values at the root, add other fields, or wrap the JSON in Markdown. Each block must use `paragraph`, `dialogue`, or `scene_break`; include `sourceShotNumbers` from this episode, and collectively cover every supplied shot number exactly at least once. Dialogue speakers may be `null` when unknown. Use integer rubric scores from 1 to 5 and no more than six findings.

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
