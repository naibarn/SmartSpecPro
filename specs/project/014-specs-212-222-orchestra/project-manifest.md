<!-- SPLIT_MANIFEST
01-authority-freeze
02-spec-214-node-contracts
03-spec-215-compiler-runtime
04-spec-216-studio-cutover
05-spec-220-security-gateway
06-spec-217-product-identity
07-spec-222-foundation
08-spec-221-skill-contracts
09-spec-218-development-control
10-spec-219-managed-runtime
11-integration-hardening
12-spec-212-r20-certification
END_MANIFEST -->

# Project Manifest — Specs 195–222 Orchestra Execution

The split names are planning units, not replacement feature-spec paths. The
canonical source for each unit remains the existing `specs/feature/*/spec.md`
path listed below. P213 is a bounded parallel lane attached to unit 11 and is
not allowed to reorder the manifest.

## Execution units

| Unit | Scope | Primary source | Depends on | Output |
|---|---|---|---|---|
| W0 | Existing authority freeze | Features 195/199/200/206/207/208/209/211 | repository baseline | authority ledger, ownership freeze, stale-evidence boundary |
| W1 | Spec 214 | `specs/feature/214-node-type-contract-architecture/spec.md` | W0 | canonical node registry/contracts/admission |
| W2 | Spec 215 | `specs/feature/215-workflow-compiler-runtime-execution-architecture/spec.md` | W1 | compiler/runtime/plan/job contracts |
| W3 | Spec 216 Phases 0–3 | `specs/feature/216-workflow-studio-node-runtime-miniapp-upgrade/spec.md` | W2 | Studio canonical cutover |
| W4 | Spec 220 core | `specs/feature/220-tenant-data-capability-security-gateway/spec.md` | W3 | gateway/security enforcement core |
| W5 | Spec 217 | `specs/feature/217-ai-product-white-label-tenant-platform/spec.md` | W4 | Tenant/Product identity and release lineage |
| W6 | Spec 222 foundation → 221 | Specs 222 and 221 | W5; 222 foundation before 221 | context/harness and Skill contracts |
| W7 | Spec 218 | `specs/feature/218-ai-product-development-control-plane/spec.md` | W6 | DevelopmentJob, ChangeSet, ReleaseCandidate |
| W8 | Spec 219 | `specs/feature/219-managed-tenant-runtime-deployment-cloudflare/spec.md` | W7 | managed runtime/deployment |
| W9 | Integration hardening | Specs 216/217/220/221/222 | W8 and all contract outputs | cross-system conformance |
| W10 | Spec 212 R20 | `specs/feature/212-AI Workflow studio capability validation benchmark harness/spec.md` | W9; P213 certification | certification and release gate |
| P213 | Parallel Computer Use lane | `specs/feature/213-jev-system-one-post-implementation-upgrade/spec.md` | W0 and Spec 208 authority | provider-neutral upgrade certification; no harness admission until certified |

## Dependency interpretation

The user-supplied order is the bootstrap/topological execution contract. Existing
spec `Depends on` text may describe full integration rather than bootstrap order;
it cannot reorder this manifest without a new contradiction supported by direct
evidence. The prior 212–222 audit order is historical and is superseded for this
execution by the user contract.

## Completion rule

The manifest is not an implementation claim. A unit becomes releasable only when
all seven lifecycle stages are closed and its downstream stale-gate set is empty.
