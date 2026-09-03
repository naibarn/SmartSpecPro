# Section 06 — Cross-section integration, ten-round gap review, and rollout

## Objective

Prove all sections compose correctly, run at least ten explicit gap-review
rounds, fix every MUST_FIX issue, and hand off only a complete implementation.

## Integration checks

Verify shared exports/imports, one bundle fingerprint from UI through inspection,
terminal prompt, QC, provider, worker, and recovery, actual media checks before
skills and paid admission, terminal prompt equality, explicit provider modes,
legacy compatibility, tenant/credit/task/recovery boundaries, and safe logging.

## Required ten review rounds

1. Contract, migration, revision, fingerprint, and legacy compatibility.
2. Skill inspection coverage, prompt labels, terminal hash/equality, and no
   post-finalization mutation.
3. Provider modes, limits, temporal semantics, and future model registration.
4. UI states, responsive behavior, accessibility, copy, and browser evidence.
5. Security, concurrency, credits, retries, recovery, observability, and
   generated-asset preservation.
6. Worker dispatch, actual ready assets, stop-frame transport, and tenant
   ownership.
7. Local/Library import, MIME truth, bulk generation, and fail-closed errors.
8. Multi-file mixed drop, previews, ordering, and capability-driven limits.
9. Profile-governed reference preservation and version-extensible adapters.
10. Terminal prompt ownership plus MCP/provider forwarding of all modalities.

Each round records MUST_FIX and NICE_TO_HAVE findings. Apply all MUST_FIX
findings, rerun affected tests, and repeat until no MUST_FIX remains.

## TDD/integration tests

Run mocked end-to-end flow from local/Library attachment through bundle snapshot,
inspection, final optimization, persistence, QC, provider mapping, worker,
retry, and recovery. Run focused web/Python suites, migration checks, prompt
hash checks, security checks, and feasible typechecks. A timeout is a limitation,
not a pass.

## Rollout and exit criteria

Keep multimodal modes/profile flags disabled until contract, routing, prompt
equality, recovery, and browser evidence pass. Enable old image-only behavior,
then image references, then video/audio per proven profile. Monitor blocked,
unsupported, stale, inspection, provider, transport, and post-generation failure
classes separately. Preserve completed generated assets before any paid retry.

Update this section with actual files, tests, ten-round findings/fixes, and
known limitations before final handoff.

## UI/UX Contract

### Target User / JTBD
N/A — cross-section verification; the UI contract is implemented and evidenced in section 05.

### Existing Pattern Reference
N/A — this section reviews the existing-pattern decision from section 05.

### Surface Inventory
N/A — no additional browser surface is introduced here.

### Component Map
N/A — no browser components are owned here.

### State Matrix
N/A — cross-section state assertions are covered by section 05 and integration tests.

### Responsive Matrix
N/A — viewport evidence is collected in section 05.

### Accessibility Acceptance
N/A — accessibility evidence is collected in section 05.

### Copy Contract
N/A — no new copy is introduced here.

### Browser Evidence Required
N/A — consume section 05 evidence; do not claim additional browser proof here.

### Implementation status

Six implementation sections are complete. Ten post-implementation gap-review
rounds are recorded under `implementation/reviews/`; all MUST_FIX findings
found during those rounds were applied and affected focused tests were rerun.
