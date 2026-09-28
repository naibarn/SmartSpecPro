# Request

Implement the approved Vertical Drama episode-cover safety rewrite so the
final cover prompt is reviewed and minimally softened before either Hermes or
normal media submission.

## Constraints

- Preserve story facts, language, characters, reference selection, logos,
  layout, and aspect ratio.
- Do not bypass provider policy or transform inherently disallowed intent.
- Do not add a database migration or change credit/idempotency semantics.
- Preserve unrelated dirty-worktree changes.

## Acceptance

The safety skill is attempted for every episode-cover request; allowed risky
wording is rewritten, disallowed intent is blocked before charge/submission,
both transports receive the same prepared prompt, and focused regression tests
pass.
