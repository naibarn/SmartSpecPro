# Test Design: Enhanced Prompt Budget Compaction

| Requirement | Level and assertion | RED evidence | Residual boundary |
|---|---|---|---|
| A dense four-character prompt with three canonical Thai lines and custom identity descriptions must fit Grok's 4,096-character budget when compaction can remove only repeated rules. | Unit: `apps/web/skills/generic-commercial-video-director/tests/test_enhanced_audio_bridge.py::test_compact_grok_prompt_avoids_repeating_custom_identity_until_over_budget`; assert length, exact dialogue once, and identity-bound speaker lines. | Before implementation, bridge raised `VIDEO_PROMPT_BUDGET_EXCEEDED` at 4,428 characters. | Does not prove all production shots fit, nor test model interpretation/provider generation. |
| Truly irreducible dialogue remains intact and still fails when it cannot fit. | Unit: existing `test_protected_dialogue_core_fails_when_budget_cannot_hold_it`; it must continue raising the budget error. | Existing passing behavior; guard against unsafe truncation. | Does not establish the production model's undocumented budget if catalog limits change. |

Command: `uv run --project apps/web/skills/generic-commercial-video-director python apps/web/skills/generic-commercial-video-director/tests/test_enhanced_audio_bridge.py`
