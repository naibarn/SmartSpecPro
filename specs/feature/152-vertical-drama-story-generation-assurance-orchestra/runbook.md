# Feature 152 Story Generation Assurance Runbook

## Rollout

1. Apply and verify migration `0238_vertical_drama_story_generation_assurance`
   in a non-production environment.
2. Set `VERTICAL_DRAMA_STORY_ASSURANCE=true` for a tenant-safe canary only
   after parent-run, credit, queue-recovery, and API tests pass.
3. Keep `VERTICAL_DRAMA_STORY_AGENTS_RUNTIME=false` until the existing Feature
   151 adapter has an installed, reviewed runtime and redacted trace proof.
4. Observe active runs, `needs_repair`, `awaiting_approval`, and
   `awaiting_reconciliation` before widening rollout.

## Recovery

- `partial`: inspect checkpoint and call `resumeStoryGeneration`.
- `needs_repair`: inspect validation report and call `repairStoryGeneration`.
- `awaiting_approval`: approve only the reported scope; reject leaves the
  accepted plan/current content untouched.
- `awaiting_reconciliation`: reconcile by provider request ID and credit
  transaction id. Never retry a provider call by creating a new unbound charge.
- Stale worker: allow the lease/fence recovery path to redeliver; do not edit
  candidate artifacts manually.

## Rollback

Set `VERTICAL_DRAMA_STORY_ASSURANCE=false` to stop new admissions. Existing
durable runs remain readable and resumable through the Feature 152 API. Do not
drop the table or delete snapshots while open/resumable runs exist.

## Evidence boundary

Focused tests and local migration checks do not prove production migration,
live provider behavior, browser rendering, deployment, or live OpenAI Agents
SDK behavior. Those require separate controlled evidence.
