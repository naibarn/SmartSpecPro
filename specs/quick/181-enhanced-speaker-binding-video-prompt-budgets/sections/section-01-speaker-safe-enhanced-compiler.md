# Section 01: Speaker-safe Enhanced compiler

## Ownership

- `apps/web/skills/generic-commercial-video-director/src/smartaihub_video_director/enhanced_bridge.py`
- `apps/web/skills/generic-commercial-video-director/tests/test_enhanced_audio_bridge.py`

## Requirements

- Write failing episode 258-style cross-character action tests first.
- Remove dialogue/action index coupling.
- Keep canonical speech events deterministic and separate from sanitized physical actions.
- Sanitize redundant English and Thai speech/lip-motion content.
- Add terminal semantic validation and protected-core budget handling.
- Do not call an LLM or provider from tests.

## Acceptance checks

- Focused Python test file passes.
- Prompt remains within a supplied 4,096-character budget without losing canonical dialogue.
- A protected core larger than its budget fails clearly.

## Implementation notes

- Implemented canonical speech events independently from sanitized physical-action events; action order may supply temporal adjacency but never speaker ownership.
- Added Thai/English speech and mouth-motion removal plus fail-closed timeline validation.
- Added deterministic full, compact, and minimal prompt tiers measured with JavaScript-compatible UTF-16 length; protected dialogue failure returns `VIDEO_PROMPT_BUDGET_EXCEEDED`.
- Verification: `tests.test_enhanced_audio_bridge` passes 14/14 cases without provider or LLM calls.
