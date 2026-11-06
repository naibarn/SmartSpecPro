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

## Quality pass

Check flow, readability, continuity, character voice, dialogue naturalness, source coverage, and unsupported details. Make at most one focused self-revision. Return only the requested structured result and attach source shot references to every narrative or dialogue block.
