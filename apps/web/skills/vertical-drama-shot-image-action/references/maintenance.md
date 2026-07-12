# Maintenance Notes

- Safe additive changes (new optional input facts, new worked examples) may be
  auto-applied.
- Breaking changes to `contract_version`, required fields, or the 3500-char prompt
  cap require approval.
- `scripts/verify.sh` runs before finalize and must pass without provider
  credentials — this skill never calls paid image/video/TTS providers during
  verification.
- If the skill's output is wrong or incomplete for either action, fix `skill.md`
  (better instructions/examples) or give the skill more input — never patch its
  output with code (see `planning/vertical-drama-skill-first-architecture/plan.md`).
