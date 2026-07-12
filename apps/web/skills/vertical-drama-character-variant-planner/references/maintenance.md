# Maintenance Notes

- Safe additive changes (new optional input facts, new worked examples) may be
  auto-applied.
- Breaking changes to `contract_version` or required fields require approval.
- `scripts/verify.sh` runs before finalize and must pass without provider
  credentials — this skill never calls paid image/video/TTS providers during
  verification.
- If the skill's output is wrong or incomplete (e.g. proposing variants the story
  doesn't support, or missing an obvious twin case), fix `skill.md` (better
  instructions/worked examples) or give the skill more input — never patch its
  output with code (see `planning/vertical-drama-skill-first-architecture/plan.md`
  and `planning/vertical-drama-character-variants/plan.md`).
- `skill.md`'s three worked examples (outfit variants, age-stage variant, twin
  detection) must always stay in sync with `schemas/output.schema.json` and
  `fixtures/pass.output.json` — a future edit to one must be checked against the
  other two.
