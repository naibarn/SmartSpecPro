# Gap audit round 2 — skill and runtime

Checked: local skill package loading, duration 12 support, structured output limits,
semantic retry, reference authorization, prompt persistence, shot cardinality, and run status.

Fixes applied: corrected the skill package path; normalized the canonical full skill output
shape into the existing prompt-card contract; added allowed-reference validation; resolved
approved character portraits; persisted running/failed/succeeded states and attempt metadata;
stored exactly the returned 1–5 frames/clips without normal nine-shot padding.

Evidence: skill adapter and contract tests pass; Vite build passes. Live LLM/provider output
and credit settlement are not proven in this local run and remain release verification items.
