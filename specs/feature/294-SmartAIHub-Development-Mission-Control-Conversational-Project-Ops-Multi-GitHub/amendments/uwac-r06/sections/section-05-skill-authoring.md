# Section 05 — WP35: skill-authoring

Priority: P1. Primary owners: SPEC-221 plus 198 proposal entry.

## Prerequisites

WP31/34 versioned handoff; existing artifact/registry authority. Refresh canonical source and read current HandOff. This is a future implementation packet, not an execution grant.

## Owned scope to assign

`apps/web/server/services/skillStudioService.ts; apps/web/server/routers/skills.ts; apps/web/client/src/components/skills/SkillStudioDialog.tsx; existing Skill package/evaluation modules`. Existing shared modules require one editor and versioned consumer fixtures; do not concurrently change shared schemas. Actual task packets must enumerate exact ownership_paths and preserve other sessions.

## Observable deliverable

Connect create/improve/Save-as-Skill to existing Studio. Build a private versioned non-Git package with input/output contract, redacted examples and reproducible evaluation. Pin dependencies/provenance; executable evaluation uses approved Cloudflare isolation and worker_jobs/outbox. Separate candidate/eval/publication/install/invocation and version revocation/rollback.

## Implementation approach

1. Map existing owner records/APIs and select the smallest additive metadata/adapter boundary; inspect active call sites and flags.
2. Keep backward-compatible reads; separate profile visibility from execution admission. Negotiate any necessary owner migration before touching shared schema.
3. Implement a coherent slice, run focused checks, then integrate promptly through the existing policy path. Continue unresolved acceptance separately.
4. Record source/canonical SHA, exact result, remaining gaps and next action in the existing owner HandOff via tools.spec_handoff.

## Focused verification and acceptance

No GitHub account fixture; unauthorized publish; failed eval; revoked version during wait; secret-bearing trace redaction; immutable release/repeatable eval and rollback.

Scenario scope: `UW-06 UW-07 UW-08 UW-17 UW-18 UW-25 UW-32` in [acceptance.md](../acceptance.md). Bind each exercised assertion to owner requirements REQ-221-UWAC-01/02; no blanket PASS from helper tests. Select exact pnpm/vitest or Python/Rust scope from the current package configuration. No repository-wide local typecheck.

## Failure and recovery

Use existing retries/idempotency/lease/fencing; classify resource failures separately. Observability failure cannot gate execution; authority failures stop only affected effects. Keep external side effects uncertain until reconciled.

## Known gaps and limits

Reconcile existing Studio autoApplyProposal/visibility and publisher semantics before edits. No auto-publication, external repository creation or arbitrary host installation.

## Completion evidence

Source diff, focused test receipt, protected/non-force canonical integration receipt and official requirement-level evidence for the implemented scope. Deployment/production acceptance require separate authorized target evidence.
