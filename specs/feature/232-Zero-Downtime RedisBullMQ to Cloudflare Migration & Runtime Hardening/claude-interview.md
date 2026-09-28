# Deep Plan Interview — Spec 232 G2 Recovery

## Scope question

**Question:** Should this plan cover safe reconciliation and service reopening first, with Durable Objects promotion as a later plan, or combine both in one execution plan?

**Decision used:** Recovery first; keep G2 Durable Objects migration as a distinct, later phase. No reply arrived during the clarification window, so this uses the recommended low-risk sequence already discussed with the user. The user had explicitly approved deep-planning the Spec 232 G2 slice, then reconciling it with Spec 245.

## Inferred constraints from the user's request and repository evidence

- The practical goal is to determine and plan the safe path back to normal service after Web, Backend and Web watchdog were masked during the G2 auth/revocation incident.
- This planning task is not authorization to unmask/start services, change secrets, write to Production Redis/PostgreSQL, deploy Cloudflare resources, or import production data.
- Preserve PostgreSQL-only revocations and import only fresh, verified active Redis revocations after every auth writer is fenced; never choose a Redis-only rollback while PostgreSQL has revocation state Redis cannot represent.
- Recovery evidence must be current, target-specific, privacy-safe and independently reviewable. Local tests, old snapshots and a completed plan do not qualify as production proof.
- Keep Redis running for unrelated G3–G6 consumers; this is not a global Redis shutdown or full Spec 232 cutover.
- After Spec 232 G2 planning is self-reviewed, add a bounded cross-reference/readiness delta to the existing Spec 245 plan instead of replacing its existing plan, research, TDD or sections.

## Unresolved operational inputs (must be obtained in execution, not guessed here)

- Authorized production owner and explicit maintenance-window/reopen approval.
- Complete inventory and fence evidence for all Web instances, token/auth writers, scheduled/background writers and any external origins.
- Approved durable backup destination and encryption/retention owner, plus successful isolated restore proof at the actual Production target/schema level (0349 is already applied per latest recorded evidence).
- Fresh, maintenance-fenced Redis/PostgreSQL snapshots for JTI, login lockout, device authorization and Runner/Worker pairing state.
- Secret-manager keyring version and active key parity across every instance; never include secret bytes in plan artifacts.
- Fresh public/origin health, route inventory and caller-level Redis telemetry needed to establish what reopening would expose.

## Interview closeout

No product decision is inferred for any irreversible Production action. Those remain explicitly owned approval gates in the plan.
