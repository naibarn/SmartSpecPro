# Plan Uplift Recommendations (2026-02-11)

These recommendations are additive improvements after applying the tenant-attribution strictness delta.

## U1 - Enforce DB constraints in phased cutover
- severity: high
- impact: high-impact
- affected area: callback/DLQ schema migration
- rationale: strict logic in application code alone can drift; DB constraints are the strongest guardrail.
- recommended plan delta: add phased migration path (`nullable -> backfill -> validation query -> NOT NULL + index + FK`), with explicit rollback checkpoint between phases.

## U2 - Add migration idempotency + lock strategy
- severity: medium
- impact: low-impact
- affected area: migration execution reliability
- rationale: repeated execution or concurrent runs can produce inconsistent attribution states.
- recommended plan delta: require migration lock, idempotent SQL guards, and rerunnable backfill batches.

## U3 - Quarantine operation playbook for unresolved rows
- severity: medium
- impact: low-impact
- affected area: tenant attribution reconciliation
- rationale: unresolved rows are expected in real systems; operators need deterministic handling.
- recommended plan delta: define quarantine queue semantics, owner workflow, and SLA for attribution remediation.

## U4 - Explicit API contract split: tenant-admin vs super-admin global
- severity: high
- impact: high-impact
- affected area: ops router/service boundary
- rationale: mixed-route behavior is a common source of privilege mistakes.
- recommended plan delta: define separate endpoints/permissions/contracts for tenant-admin and super-admin global actions.

## U5 - Security observability baseline
- severity: medium
- impact: low-impact
- affected area: runtime monitoring
- rationale: hardening without observability is difficult to operate safely.
- recommended plan delta: add metrics/log events for denied missing-attribution ops, cross-tenant denial, and quarantine counts.

## U6 - Release gate with tenant-attribution canary checks
- severity: medium
- impact: low-impact
- affected area: release validation
- rationale: catches hidden fallback pathways before full rollout.
- recommended plan delta: add canary validation checklist and automated smoke tests for representative tenants.

## U7 - Upload malware scanning + quarantine flow
- severity: high
- impact: high-impact
- affected area: upload pipeline and file serving
- rationale: URL/policy hardening alone does not catch malicious binaries or weaponized documents uploaded by users.
- recommended plan delta: add scanner integration, deterministic file lifecycle (`scanning`, `quarantined`, `ready`), and fail-closed behavior.
- compatibility note: external `https://` image URLs remain supported because this control targets uploaded-file flow only.

## U8 - Object-level authorization for library/share operations
- severity: high
- impact: high-impact
- affected area: library read/write/share/delete endpoints
- rationale: tenant-scoped controls are insufficient if per-item ownership/share checks are inconsistent.
- recommended plan delta: enforce object-level authorization and add IDOR/cross-tenant negative tests for open/rename/delete/share.

## U9 - Preview CSP and sandbox hardening
- severity: high
- impact: low-impact
- affected area: markdown/document preview surfaces
- rationale: preview rendering is a common XSS target; CSP/sandbox reduces blast radius even when other controls fail.
- recommended plan delta: define strict preview CSP + iframe sandbox policy with compatibility tests.
- compatibility note: retain external image rendering via explicit `img-src` allowances for public `https://`.

## U10 - Rate limiting and abuse protection for high-risk endpoints
- severity: medium
- impact: low-impact
- affected area: upload, image proxy, retry/reprocess operations
- rationale: reduces abuse, brute-force, and resource exhaustion risks.
- recommended plan delta: add tenant/user/IP-aware rate limits, burst+sustained thresholds, and deterministic retry messaging.

## U11 - DB-level tenant guardrails beyond app-layer checks
- severity: high
- impact: high-impact
- affected area: schema integrity and mutation safety
- rationale: app-layer checks can regress; DB constraints provide stronger invariants.
- recommended plan delta: add phased tenant-integrity constraints/guardrails with explicit rollback checkpoints and negative cross-tenant tests.

## U12 - Mandatory backup/restore drill before release
- severity: medium
- impact: low-impact
- affected area: migration safety and recovery readiness
- rationale: rollback plans are not sufficient without validated restore execution.
- recommended plan delta: require backup artifact, restore rehearsal, and integrity verification evidence as hard release gate.
