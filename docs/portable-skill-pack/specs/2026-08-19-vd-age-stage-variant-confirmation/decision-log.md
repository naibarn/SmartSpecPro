# Decision Log

## 2026-08-19 — standard quick plan

- Chosen depth: `standard` quick plan.
- Reason: the change crosses one backend service, one router, and an existing
  character-stock UI, but needs no schema migration or new dependency.
- Recommended design: preserve canonical `roleTier`, derive child visual tier
  only from an age-stage variant, and use a typed message marker to trigger the
  existing Add Look confirmation flow.
- Rejected: forcing the LLM to return `lead_male` for a six-year-old; this
  incorrectly applies adult lead-quality language to a child.
- Rejected: silent variant creation; it could spend credits and alter the
  roster without explicit user consent.

## Self-review rounds

1. Checked current UI reuse and avoided a duplicate modal.
2. Checked preview/job and direct-render paths; both need the same precondition.
3. Checked parent story-role preservation and age-stage visual override.
4. Checked owner/tenant boundaries and credit confirmation behavior.
5. Checked tests and dirty-worktree scope; no broad formatting or cleanup.
