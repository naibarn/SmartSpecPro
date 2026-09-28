# Request

Implement the approved design in `docs/portable-skill-pack/specs/2026-09-07-enhanced-speaker-binding-and-video-prompt-budgets-design.md`.

Requirements:

- Remove index-based coupling between Enhanced physical actions and canonical dialogue.
- Make canonical speaker ID, name, observed position, exact line, and silent-listener behavior authoritative for every target model.
- Remove duplicate English and Thai speech/lip-motion directives from free-form physical actions.
- Reject semantically contradictory terminal prompts before persistence.
- Apply model prompt ceilings: Grok 4,096; MiniMax H3/H3 Max 7,000; Omni Flash 1.1 20,000; Wan 3.0 20,000; Seedance 2.5 30,000.
- Preserve conservative behavior for unknown models.
- Do not mutate database rows, regenerate existing prompts/videos, call paid providers, commit, push, or deploy.

Assumptions:

- The user-provided limits are product requirements.
- The unfinished trailing word “และ” does not add another model requirement.
- Existing unrelated dirty files must remain untouched.
