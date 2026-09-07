# Episode 258 Grok Legacy vs Enhanced dialogue diagnosis

## Classification

- scope: medium diagnostic
- risk: medium; read-only inspection only
- bug_route: true
- route: direct-inline standard light
- sub-agents: none requested or opened
- SocratiCode: unavailable; bounded shell and read-only PostgreSQL fallback

## Evidence ledger

- target: series 53, episode row 258, episode 20
- UI symptom: Grok Enhanced swaps speakers while Legacy is correct; Omni reportedly behaves correctly
- persisted evidence: Enhanced shot 1 and shot 2 bind canonical names, character IDs, positions, and exact Thai lines correctly in the dialogue-lock block
- persisted failure: the Enhanced motion timeline assigns an action describing the other character to each indexed speaker and later repeats standalone mouth-motion actions
- prompt lengths: Enhanced shot 1 is 6,187 chars and shot 2 is 7,083 chars; Grok/Kie budget is 4,096; Legacy shot 2 is 1,835 chars
- code cause: `_build_motion_timeline` pairs `actions[idx]` with `dialogue[idx]` without validating the action subject; `_clean_physical_action` does not remove Thai mouth-motion/speech clauses
- validation gap: current intent checks cover silent-dialogue leakage and already-held pickup only; bridge validation checks shape/hash/40,000-char ceiling but not speaker-action consistency
- confidence: high for malformed Enhanced prompt; provider sensitivity remains an inference because no provider task row/result is present locally

## Safety

- no database writes
- no prompt regeneration, retry, provider submission, or credit spend
- no application implementation changes
- unrelated dirty worktree preserved
