# Research notes

- Root cause is in `enhanced_bridge.py`: `_build_motion_timeline` uses `actions[idx]` for `dialogue[idx]`.
- `_clean_physical_action` removes quoted text and a narrow English speech pattern but leaves Thai mouth-motion directives.
- `_bind_dialogue_to_character_positions` already resolves canonical speaker and position correctly.
- `_intent_policy_conflicts` does not validate action ownership or duplicate mouth movement.
- Existing episode 258 prompt rows reproduce cross-character clauses for shots 1 and 2.
- Existing Enhanced tests assert that speaker anchors exist, but not that the attached action belongs to the speaker.
- `videoPromptBudget.ts` currently returns 4,096 for every Kie.ai model and clamps the global absolute maximum to 4,096.
- The resolver has eleven production call sites plus focused tests. All model-aware call sites should pass model ID/name where available.
- Local `media_models` confirms MiniMax H3 has a 7,000 generic prompt limit; Omni's local/static 5,000 value is stale relative to the approved 20,000 video requirement.
- SocratiCode tools are unavailable in this session, so discovery used bounded `rg`, line reads, logs, and read-only PostgreSQL queries.
- No auth, tenant-isolation, schema, billing, or new dependency change is required.
