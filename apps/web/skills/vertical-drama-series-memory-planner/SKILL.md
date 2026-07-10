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
trigger_patterns: []
priority: 50
config:
  media_studio:
    auto_learning:
      enabled: false
      prompt_qa_after_auto_prompt: true
      image_qa_after_generation: true
      require_admin_approval: true
      min_prompt_score_to_pass: 85
      min_image_fidelity_score_to_pass: 80
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
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

## Story State — Ledgers & Story State (Feature 132 §5.3, F132B)

When the `verticalDramaQualityLedgers` tenant flag is on, the service
(`server/services/verticalDramaSeriesMemoryPlanning.ts`) appends the
following conditional instruction block to the request ahead of the payload
— it is templated per-request by the service, not statically present in
every call, since this file is loaded verbatim and only the service can
conditionally render it:

```text
STORY STATE (Feature 132 §5.3) — additionally include a "story_state" object
in your JSON response, alongside every field above, shaped exactly like this:

{
  "story_state": {
    "episode": <this episode's number>,
    "knownByProtagonist": ["fact the protagonist now knows"],
    "knownByAudience": ["fact the audience now knows, protagonist may not"],
    "knownOnlyByAntagonist": ["fact only the antagonist/villain knows"],
    "evidenceGained": ["new piece of evidence/clue gained this episode"],
    "evidenceLostOrDamaged": ["evidence destroyed/compromised this episode"],
    "trustChanges": [
      { "characterA": "name", "characterB": "name", "change": "short description of how trust shifted" }
    ],
    "emotionalResidue": [
      { "character": "name", "residue": "lingering emotional state after this episode" }
    ],
    "threatLevel": <integer 1-5, this episode's threat intensity>,
    "unresolvedThreadIds": ["id or short label of a thread still open after this episode"],
    "requiredNextEpisodeResponse": "what the next episode MUST address given how this one ended"
  }
}
```

This is "story-state aware compaction": think of `story_state` as a single,
typed snapshot of exactly what a viewer/character would know and feel
walking out of this episode — later episodes and the deterministic quality
ledgers use it to check that nobody acts on information they shouldn't have
yet, and that nothing important is silently forgotten.

When no such instruction is appended (flag off, or an older service version
that predates this section), omit `story_state` entirely from your response
— every other field's behavior stays byte-for-byte identical to the flow
described above.