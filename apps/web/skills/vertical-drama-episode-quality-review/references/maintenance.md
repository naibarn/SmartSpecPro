# Maintenance Notes

- Safe additive changes (new optional fields, new examples) may be auto-applied.
- Breaking changes to required top-level fields or the `scorecard` shape require approval.
- `scripts/verify.sh` runs before finalize and must pass without provider credentials.
- This skill never calls paid image/video/TTS providers — it is a pure text review.
- This skill never blocks generation; do not add a "minimum score" gate to the schema without an explicit product decision.
