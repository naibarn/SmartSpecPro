# Maintenance Notes

- Safe additive changes (new optional fields, new examples) may be auto-applied.
- Breaking changes to required top-level fields or the `scorecard` shape require approval.
- `scripts/verify.sh` runs before finalize and must pass without provider credentials.
- This skill never calls paid image/video/TTS providers — it is a pure text review.
- This skill never blocks generation; do not add a "minimum score" gate to the schema without an explicit product decision.
- Scorecard v2 (`contract_version: 2`, added 2026-07-07) is a strict superset of v1 — it adds `hook_strength`/`cliffhanger_strength`/`continuity_consistency`/`tie_in_naturalness`, `tie_in_assessment`, and `density_metrics`, all optional. It does not change the "never blocks" guarantee above: gating on scorecard values is the CALLER's policy decision (see the quality-loop feature), never this skill's.
- `density_metrics`, when present in the input, must be echoed verbatim in the output — never re-estimated. Treat any change to that behavior as a breaking change requiring approval.
