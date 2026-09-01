<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contracts
section-02-projection-inventory-acl
section-03-catalog-routing
section-04-worker-runtime
section-05-ui-selectors
section-06-lifecycle-billing-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shared-contracts | - | 02, 03, 04 | Yes |
| section-02-projection-inventory-acl | 01 | 03, 04, 06 | No |
| section-03-catalog-routing | 01, 02 | 05, 06 | No |
| section-04-worker-runtime | 01, 02 | 05, 06 | No |
| section-05-ui-selectors | 01, 03, 04 | 06 | No |
| section-06-lifecycle-billing-rollout | 01-05 | - | No |

## Execution Order

1. section-01-shared-contracts
2. section-02-projection-inventory-acl
3. section-03-catalog-routing and section-04-worker-runtime
4. section-05-ui-selectors
5. section-06-lifecycle-billing-rollout

## Section Summaries

### section-01-shared-contracts
Versioned schemas, capability/source discrimination, scopes, and compatibility tests.

### section-02-projection-inventory-acl
Database projection, inventory sync, modelRef mapping, sharing policy integrity, and ACL.

### section-03-catalog-routing
Actor-aware catalog, all selector consumers, pinned Worker resolution, and no-fallback routing.

### section-04-worker-runtime
Worker local registry, adapters, control-plane inventory/events/cancel, and execution.

### section-05-ui-selectors
Worker Local AI settings, Group share controls, unified model selector states, and browser proof.

### section-06-lifecycle-billing-rollout
Credits, retries, cancellation/revocation lifecycle, retention, observability, flags, and final gates.
