---
id: intelligence-skill-creator
name: Intelligence Skill Creator
version: "0.4.0"
type: automation
languages: en, th
category: automation
execution_mode: python
isAutoTrigger: false
enabledByDefault: false
visibleByDefault: true
priority: 10
tags: [skill-builder, code-generation, llm, python, javascript, schema]
triggerPatterns:
  - "create skill|build skill|สร้าง skill|ทำ skill ใหม่|ออกแบบ skill"
  - "improve skill|ปรับปรุง skill|พัฒนา skill|แก้ไข skill"
  - "intelligence skill creator|ISC|isc create|isc improve"
---

# Intelligence Skill Creator (ISC) — v0.4.0

7-phase multi-agent LLM pipeline that creates complete, production-ready SmartAIHub skills from a natural language description — or iteratively improves existing ones.

## Category & Execution Mode Rules

ISC must generate skills using the platform's supported categories and matching execution modes:

- `article_generation` -> `llm-only`
- `image_prompt_generation` -> `llm-only` or `enhance-prompt`
- `video_prompt_generation` -> `llm-only` or `enhance-prompt`
- `prompt_enhancement` -> `llm-only` or `enhance-prompt`
- `image_generation`, `video_generation`, `image_video_generation`, `audio_generation`, `sound_effects` -> `media-generate`
- `automation`, `code_assistant`, `document_analysis`, `web_search`, `data_analysis`, `translation`, `summarization`, `chat_assistant`, `other` -> `llm-only` or `python`

`execution_mode` describes runtime behavior, not the implementation language.
If ISC generates `python/skill.py`, that does **not** automatically mean the final skill's `execution_mode` should be `python`.

## Capabilities

### 🔨 Create Mode (NEW in v0.4.0)
- **Phase 1 — Plan:** LLM analyzes description, designs skill architecture (inputs, outputs, logic, language)
- **Phase 2 — Schemas:** Generates all 3 mandatory schemas in sequence:
  - `schemas/input.schema.json` — full input validation with enums, ranges, examples
  - `schemas/output.schema.json` — structured output specification
  - `schemas/ui.schema.json` — SmartAIHub UI form with Thai + English labels
- **Phase 3 — skill.md:** Generates manifest with YAML frontmatter, input/output tables, usage examples
- **Phase 4 — Code:** Generates complete `python/skill.py` OR `js/skill.js` with stdlib only
- **Phase 5 — Critic:** Second LLM pass reviews and fixes correctness, edge cases, security
- **Phase 6 — Tests:** Generates `tests/tests.json` with structured assertions for happy path, edge cases, and error cases
- **Phase 7 — Write:** Writes all artifacts to `apps/web/skills/{skill-name}/`

### 🔧 Improve Mode (since v0.3.0)
- Iterative **evaluate → research → patch → test** loop
- DuckDuckGo web research informs LLM patch generation
- Heuristic fallback when LLM unavailable
- Safety constraints: path restriction, no new deps, respond() signature enforcement

## Schema Contract

Every skill created by ISC **must** (and will) include:

```
skills/{skill-name}/
├── schemas/
│   ├── input.schema.json    ← MANDATORY (JSON Schema draft-07, full validation)
│   ├── output.schema.json   ← MANDATORY (output structure spec)
│   └── ui.schema.json       ← MANDATORY (SmartAIHub UI form, Thai + English)
├── skill.md                 ← manifest + YAML frontmatter
├── python/skill.py          ← if language=python (respond() entry point)
│   OR js/skill.js           ← if language=javascript
└── tests/tests.json         ← 5-6 structured test cases (happy path + edge + error)
```

## Usage — Create Mode

```json
{
  "mode": "create",
  "description": "A skill that converts Thai dates between Buddhist Era (BE) and Common Era (CE), supporting formats like '15/04/2567', '15 เมษายน 2567', and ISO '2024-04-15'",
  "skill_language": "python",
  "complexity": "moderate",
  "llm_base_url": "https://api.openai.com/v1",
  "llm_model": "gpt-4o"
}
```

## Usage — Improve Mode

```json
{
  "mode": "improve",
  "skill_name": "skill_math_tutor",
  "rounds": 3,
  "llm_model": "gpt-4o"
}
```

## Input Parameters

| Parameter | Mode | Type | Default | Description |
|-----------|------|------|---------|-------------|
| `mode` | both | string | `auto` | `create` \| `improve` \| `auto` |
| `description` | create | string | — | What the new skill should do |
| `skill_language` | create | string | `auto` | `python` \| `javascript` \| `auto` |
| `complexity` | create | string | `moderate` | `simple` \| `moderate` \| `complex` |
| `skill_name` | both | string | — | Slug override (create) or existing skill (improve) |
| `rounds` | improve | int | `3` | Improvement iterations (1-10) |
| `llm_base_url` | both | string | env | OpenAI-compatible API endpoint |
| `llm_model` | both | string | env | Model name (e.g. `gpt-4o`, `claude-opus-4-6`) |
| `llm_temperature` | both | float | `0` | 0=deterministic, 1=creative |
| `llm_timeout_s` | both | int | `180` | Max seconds per LLM call |

## Output Format

```json
{
  "success": true,
  "output": "✅ Skill `thai-date-converter` created successfully!\n\n📁 Location: ...\n📄 Files created:\n  ✅ schemas/input.schema.json\n  ✅ schemas/output.schema.json\n  ✅ schemas/ui.schema.json\n  ✅ skill.md\n  ✅ python/skill.py\n  ✅ tests/tests.json",
  "skill_path": "/path/to/apps/web/skills/thai-date-converter"
}
```

## Language Selection Guide

| Use Python when... | Use JavaScript when... |
|--------------------|------------------------|
| Math / statistics | Async/event-driven logic |
| NLP / text analysis | JSON transformation |
| Data parsing (CSV, XML) | URL manipulation |
| Complex algorithms | Template rendering |
| File processing | HTTP-heavy operations |

## Architecture

```
python/skill.py (entry point)
  ↓ respond(input, context) → _normalise() → _detect_mode()
  ↓
  ├── CREATE → isc/creator.py → SkillCreator.create()
  │     Phase 1: _phase_plan()           → LLM JSON
  │     Phase 2: _phase_input_schema()   → LLM JSON
  │             _phase_output_schema()  → LLM JSON
  │             _phase_ui_schema()      → LLM JSON
  │     Phase 3: _phase_skill_md()       → string
  │     Phase 4: _phase_code()           → Python or JS string
  │     Phase 5: _phase_critic()         → fixed code + issues
  │     Phase 6: _phase_tests()          → list[dict]
  │     Phase 7: _phase_write()          → writes ALL files
  │
  └── IMPROVE → isc/runner.py → iterate_improve()
        evaluate → research (DuckDuckGo) → LLM patch → validate → apply → repeat
```
