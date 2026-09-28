# Section 07 — Visual QA and Observability

## Goal

Verify generated images against role, identity, age, request, and continuity without giving
the server a second prompt-composition responsibility.

## Ownership

- Existing character image/Prompt-QC integration boundary and new QA result contract.
- Safe provenance/audit event helper.
- QA service and focused tests.

## Behavior

After provider generation, evaluate identity, role fit, age, framing, people count,
wardrobe, hair, continuity, similarity, and production readiness. Return `pass`, `revise`,
or `reject` with scores/issues. A revise result returns a structured revision request to
the same Visual Bible skill. Reject preserves approved DNA and does not mutate identity.

Audit only contract version, skill bundle hash/version, role source, model family, retry
count, validation codes, QA scores, and outcome. Never log full prompts, private story
text, or signed asset URLs.

## TDD stubs

- QA pass persists safe provenance.
- Revise routes through Skill and replaces output, not string concatenation.
- Reject preserves approved DNA and gives retryable state.
- Audit event omits sensitive content while retaining required diagnostics.

## Completion proof

Run QA service/route tests with pass/revise/reject fixtures and inspect audit payload shape.
