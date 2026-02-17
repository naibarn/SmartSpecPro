---
id: intelligence-skill-creator
name: Intelligence Skill Creator
version: "0.3.0"
type: automation
languages: en, th
category: skill_development
execution_mode: python
isAutoTrigger: false
enabledByDefault: false
visibleByDefault: false
priority: 10
triggerPatterns:
  - "create skill|improve skill|สร้าง skill|ปรับปรุง skill"
  - "intelligence skill creator|ISC|isc improve"
---

# Intelligence Skill Creator (ISC) — v0.3.0

Multi-agent LLM-powered tool for creating and improving skills.

## Capabilities

- **Planner → Researcher → Coder → Critic** pipeline
- Research-first approach using DuckDuckGo
- Iterative patch→test→validate loop
- Provider-agnostic (OpenAI-compatible gateway)

## Usage

Provide a skill name to improve, along with optional LLM config:

```json
{
  "skill_name": "skill_math_tutor",
  "mode": "llm",
  "rounds": 3,
  "llm": {
    "base_url": "https://your-gateway/v1",
    "api_key": "sk-...",
    "model": "gpt-4o"
  }
}
```

## Input Format (stdin JSON)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `skill_name` | string | required | Skill folder name under `skills/` |
| `mode` | auto\|llm\|heuristic | auto | Improvement strategy |
| `rounds` | int 1-10 | 3 | Iteration rounds |
| `llm.base_url` | string | — | OpenAI-compatible endpoint |
| `llm.api_key` | string | — | API key |
| `llm.model` | string | — | Model name |

## Output Format (stdout JSON)

```json
{ "success": true, "output": "Improved skill_math_tutor in 3 rounds..." }
```
