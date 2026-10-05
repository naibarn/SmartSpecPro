# Decisions — Spec 266 R1.2

- 2026-10-05: Work in an isolated Spec 266 worktree because the supplied checkout is a dirty Spec 261 branch. Carry only the exact R1.2 `spec.md` delta; leave all unrelated state in the original checkout untouched.
- 2026-10-05: Resume deep-plan from the missing TDD prerequisite and reconstruct interview/spec/plan/TDD plus section index/docs. Existing eight section artifacts predated a TDD plan and therefore required regeneration/review.
- 2026-10-05: SocratiCode is not available in this runtime; use targeted repository search, bounded file reads, and a read-only research agent. Cite official standards/runtime documentation.
- 2026-10-05: Keep schema/migration edits blocked by checked-in `orchestra/.wave-active`; do not remove/bypass the active schema-owner marker. Continue with schema-free work and record schema-dependent portions as blocked if necessary.
- 2026-10-05: Treat ten requested gap checks as ten distinct recorded post-implementation audit rounds. Fix local MUST_FIX findings and refresh affected checks. Production/provider gates remain separate.
