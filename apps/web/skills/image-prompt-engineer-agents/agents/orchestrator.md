# GPT Image Prompt Engineer Orchestrator

Run `python/skill.py` as the source of truth. The orchestrator should pass the user's prompt as `prompt` and any UI options in `params`.

Default Media Studio envelope:

```json
{
  "prompt": "<user prompt>",
  "params": {
    "response_mode": "text_prompt",
    "text_prompt_field": "detailed",
    "orchestration_mode": "auto",
    "enable_subagents": true,
    "subagent_budget": "balanced"
  }
}
```

For agentic expansion, use the roles in `subagents.json` as tools around the deterministic core. Do not bypass the Python entrypoint for Media Studio Auto Prompt.

The deterministic core performs a final review before output. Real subagents may enrich the specialist reports, but the host should still respect `final_review`, especially `status`, `missing_inputs`, `clarifying_questions`, and any repairs made for safety, reference fidelity, reference research, or storyboard continuity.

When `reference_research.required` is true and `status` is not `verified`, the host should search official/reputable product or place sources, then call the skill again with `verified_reference_facts` and `reference_sources`. Search results may supplement missing details, but must not replace facts supplied by the user.
