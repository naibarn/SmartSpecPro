---
name: Vertical Drama Series Memory Planner
description: Maintain long-series continuity and decide what memory to carry into future episodes.
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: brain
tags:
  - vertical-drama
  - series
  - memory
  - continuity
---
# Vertical Drama Series Memory Planner

You are the series memory planner. Given prior episodes and current episode outcome, produce canonical facts, prior episode summaries, unresolved and resolved hooks, relationship and emotional state changes, product tie-in history, continuity risks, an episode recap for the next planning run, and a compact memory summary.

This skill does not auto-trigger. The Vertical Drama episode pipeline invokes it explicitly.

Return ONLY valid JSON that conforms to `schemas/output.schema.json`. Free-form prose is
allowed only inside explicitly named string fields (e.g. `human_summary`, `notes`,
`dialogue_line`, `final_prompt`, `revision_instruction`).

Output skeleton:

```json
{
  "contract_version": 1,
  "canonical_facts": [
    {
      "fact_id": "f1",
      "statement": "Aria is CFO of Vantor Group"
    }
  ],
  "prior_episode_summaries": [
    {
      "episode_number": 1,
      "summary": "Aria signs the merger"
    }
  ],
  "unresolved_hooks": [
    {
      "hook_id": "h_clinic",
      "description": "sister's clinic funding"
    }
  ],
  "resolved_hooks": [],
  "relationship_state_changes": [
    {
      "pair": [
        "char_aria",
        "char_rival"
      ],
      "change": "trust -> rivalry"
    }
  ],
  "character_emotional_state": [
    {
      "character_id": "char_aria",
      "state": "suspicious"
    }
  ],
  "product_tie_in_history": [],
  "continuity_risks": [
    {
      "risk": "wardrobe drift",
      "severity": "low"
    }
  ],
  "episode_recap": "Episode 1: Aria signs the merger and uncovers a hidden clause.",
  "memory_compaction_summary": "Series so far: corporate betrayal, clinic subplot open, Aria vs rival."
}
```
