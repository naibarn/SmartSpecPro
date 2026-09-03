# Final Prompt Safety Wording Design

## Goal

Reduce false-positive provider safety refusals in provider-ready Vertical Drama
image prompts by making the final optimizer skill rewrite risk-sensitive wording
in context, while preserving the scene, child safety, identity continuity, and
the user's intended action.

## Scope

- Update both `apps/web/skills/cinematic-prompt-refiner-pro/SKILL.md` and
  `skill.md` as byte-identical skill twins.
- Apply the wording policy inside the final optimizer skill, not through a
  deterministic code-level replacement after the skill returns.
- Target image prompts containing attached references, minor/child context, or
  strict likeness language. Leave unrelated video and ordinary prompts
  semantically unchanged.
- Add contract-level regression coverage for the skill instructions and twin
  parity.

## Design

The skill will add a final provider-safe wording pass after semantic compression.
It will replace absolute likeness language with natural continuity language such
as “closely matching the attached reference” or “consistent appearance based on
the reference.” In child/family contexts it will prefer “age-appropriate,
natural family framing” and “keeps the screen angled away” over wording that can
be interpreted as romantic, intimate, or secretive in an unsafe sense.

The pass must not remove or weaken age-appropriateness, fully-clothed,
non-romantic, no-danger, or other child-safety constraints. It must not add
characters, props, plot events, or a different action. Protected fragments remain
verbatim; if a protected fragment contains a required phrase, the skill records
the risk in `risk_flags` rather than changing that fragment.

The optimized prompt remains the sole final prompt artifact. Runtime code will
continue to accept the skill output as-is, with no post-optimizer string
replacement or safety-clause append.

## Failure handling

If the wording pass cannot be completed, the existing optimizer validation and
provider-ready fail-closed behavior remain authoritative. The system must not
silently bypass safety or retry a paid provider task automatically.

## Verification

- Both skill files are byte-identical.
- The skill contract contains the provider-safe wording pass, synonym guidance,
  protected-fragment rule, and child-safety preservation rule.
- Existing prompt QC tests continue to prove the optimizer output is the
  terminal prompt artifact.
