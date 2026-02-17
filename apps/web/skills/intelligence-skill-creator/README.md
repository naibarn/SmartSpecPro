# Intelligence Skill Creator (ISC) — v0.3.0
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

## Commands
```bash
python -m isc.cli improve --skill skill_math_tutor --mode llm --rounds 3 --llm-model "YOUR_MODEL"
python -m isc.cli improve --input-file examples/inputs/improve.skill_math_tutor.json
```

## Schemas
- schemas/input.schema.json
- schemas/ui.schema.json
