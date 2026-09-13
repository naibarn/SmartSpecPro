# TDD Plan

1. Add pure contract tests first for role disjointness, known-key filtering,
   mentioned-only handling, phone/video caller mapping, barrier/shout mapping,
   separate-location dual view, text-message handling, and low-confidence failure.
2. Add prompt-builder tests asserting current shot, prior-shot context, prior
   episode ending, roster keys, and explicit no-invention instructions are sent.
3. Add mocked LLM service tests for valid output, malformed output, bounded retry,
   and credit charge metadata; no real provider call.
4. Add projection tests proving `required_character_refs` and
   `screen_caller_refs` are corrected while `scene_intent` is retained.
5. Add pipeline tests proving invocation occurs before storyboard persistence and
   that a manual `characterRefsCustomized` frame is preserved downstream.
6. Run focused Vitest suites, `git diff --check`, and skill bundle verification.
   Do not claim deployment, browser, provider, credit-spend, or production proof.
