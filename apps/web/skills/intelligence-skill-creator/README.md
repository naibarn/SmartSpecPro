# Intelligence Skill Creator (ISC) — v0.5.0
LLM-agnostic (OpenAI-compatible gateway) + Research-first + Multi-agent + Validator + Iterative patch→test loop

## Added (6 items)
1) Patch Validator
2) Multi-agent orchestration (Planner→Researcher→Coder→Critic)
3) Delta-debugging / failure triage
4) Research ranking
5) Optional test expansion (asks user: 2–5 choices + other)
6) Provider presets

## Per-session model selection
- env: ISC_LLM_MODEL
- CLI: --llm-model
- input file: schemas/input.schema.json

## JavaScript / GenJS support
- `javascript_runtime: classic` -> `js/skill.js` CommonJS respond() skill
- `javascript_runtime: genjs` -> full sandbox-command bundle with `skill.manifest.json`, `package.json`, `src/index.mjs`, and modular `src/*.mjs`
- Best for schema mapping, prompt pipelines, APIs, web stack automation, JSON-heavy artifact generation, and PptxGenJS-ready workloads
- Generated GenJS bundles expose an optional `request.orchestration` contract for local mode, skill handoff, agency swarm, or hybrid execution

## Commands
```bash
python -m isc.cli improve --skill skill_math_tutor --mode llm --rounds 3 --llm-model "YOUR_MODEL"
python -m isc.cli improve --input-file examples/inputs/improve.skill_math_tutor.json
```

## Schemas
- schemas/input.schema.json
- schemas/ui.schema.json
