<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-assurance-contracts-context
section-02-durable-attempts-reconciliation
section-03-credit-provider-final-gate
section-04-draft-qc-recovery
section-05-profile-source-admission
section-06-agent-runtime-fallback
section-07-story-prompt-media-adapters
section-08-api-ui-continuity
section-09-security-operations-rollout
section-10-integration-production-proof
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| section-01-assurance-contracts-context | research | all later sections | no |
| section-02-durable-attempts-reconciliation | 01 + persistence inventory | 04, 08, 09, 10 | migration fixture preparation only |
| section-03-credit-provider-final-gate | 01 + credit/provider inventory | 04, 06, 07, 09, 10 | focused fixtures only |
| section-04-draft-qc-recovery | 01, 02, 03 | 08, 10 | no; critical path |
| section-05-profile-source-admission | 01, 02 | 06, 07, 10 | profile fixtures |
| section-06-agent-runtime-fallback | 01, 02, 03 | 07, 10 | Node/Python contract tests |
| section-07-story-prompt-media-adapters | 03, 05, 06 | 10 | pure validators only |
| section-08-api-ui-continuity | 02, 04, 05 | 10 | locale/browser fixtures |
| section-09-security-operations-rollout | 02, 03, 06, 08 | 10 | runbook/metrics preparation |
| section-10-integration-production-proof | 01–09 | release | no |

## Execution Order

1. Implement section 01.
2. Implement section 02, then section 03; independent fixture work may be
   prepared in parallel, but shared files are sequential.
3. Implement section 04.
4. Implement sections 05 and 06 in dependency order; keep shared runtime files
   single-writer.
5. Implement section 07.
6. Implement section 08.
7. Implement section 09.
8. Implement section 10 and run cross-section/production evidence gates.

## Shared Rules

- Existing Node/domain authorities remain final; Agents only propose/evaluate.
- Preserve legacy client fields, wizard routes/step IDs, save/edit/preview, and
  feature-flag-disabled behavior.
- Every section includes tests first, deterministic failure handling, tenant
  scope, idempotency, and a safe rollback/kill-switch note.
- UI sections must keep the full UI/UX contract and browser evidence matrix.
- SocratiCode was unavailable during research; use targeted shell discovery and
  record any later SocratiCode availability as supplemental evidence.

## Section Summaries

### section-01-assurance-contracts-context
Create the versioned production context, domain assurance schemas, task mapping,
stable errors, and pure admission/fingerprint helpers.

### section-02-durable-attempts-reconciliation
Add/reuse durable attempt/event ownership, state transitions, leases, fences,
CAS, Redis recovery, migration projection, and reconciliation.

### section-03-credit-provider-final-gate
Unify adapter billing ownership, provider call IDs, reservations, retries,
one-time authorization, unknown outcome handling, and final readiness checks.

### section-04-draft-qc-recovery
Fix Draft QC baseline recovery, state projection, repair admission, CAS, typed
errors, and regression coverage for the observed error.

### section-05-profile-source-admission
Compose and validate profile/source/visual/claim/B-roll context and require
context admission at all downstream entry points.

### section-06-agent-runtime-fallback
Integrate existing Node/Python Agent Runtime modes, structured output,
guardrails, tracing, redaction, fallback, budgets, and kill switch.

### section-07-story-prompt-media-adapters
Propagate context through story, start-frame/reference/image, video prompt,
B-roll, assembly, post-QC, and season adapters.

### section-08-api-ui-continuity
Expose additive projections and actions in existing routers/components while
preserving UX, localization, responsive behavior, accessibility, and browser
evidence.

### section-09-security-operations-rollout
Complete tenant/security controls, metrics/traces, migration/flags, canary,
rollback, and operator runbook.

### section-10-integration-production-proof
Run all replay/profile/browser/provider/migration gates, review cross-section
interfaces, close gaps, and produce honest release evidence.
