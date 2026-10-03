<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test -- --run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-reconciliation-and-contracts
section-02-native-artifact-lifecycle
section-03-astryx-resolution
section-04-spec224-256-handoff
section-05-provider-adapter-boundary
section-06-native-authoring-ui
section-07-hardening-and-evidence
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| 01 | - | 02, 03, 04, 05, 06, 07 | No |
| 02 | 01 | 04, 05, 06, 07 | No |
| 03 | 01 | 06, 07 | No |
| 04 | 01, 02 | 06, 07 | No |
| 05 | 01, 02 | 07 | Yes after 02; remains disabled |
| 06 | 02, 03, 04 | 07 | No |
| 07 | 02, 03, 04, 05, 06 | - | No |

## Execution Order

1. Section 01 establishes G0 record and canonical contracts. If artifact ownership is unresolved, do not add DDL; continue with a storage adapter boundary and record the blocker.
2. Section 02 implements native durable artifact lifecycle only if an existing owner is proven; otherwise complete only safe contract/service boundary work.
3. Sections 03 and 04 integrate resolver and existing 224/256 authorities after 01/02. Section 05 may be worked on in parallel only after 02 and only against mocks; all provider flags stay false.
4. Section 06 uses approved contracts/resolver/handoff.
5. Section 07 closes hardening and evidence gaps without enabling production flags.

## Section Summaries

### section-01-reconciliation-and-contracts
Repository G0, reconciliation record and provider-neutral versioned contract foundations.

### section-02-native-artifact-lifecycle
Native-only create/version/decision lifecycle and a durable storage boundary guarded by owner/recovery evidence.

### section-03-astryx-resolution
Pinned deterministic component resolver and SmartAIHub wrapper/catalog integration.

### section-04-spec224-256-handoff
Capability/action mapping and freshness-bound Spec 224 implementation handoff through canonical authorities.

### section-05-provider-adapter-boundary
Disabled optional provider interface, policy checks, mocked normalization and fallback provenance.

### section-06-native-authoring-ui
Authorized product UI for native authoring, review, decisions and implementation handoff.

### section-07-hardening-and-evidence
Cross-cutting security, lifecycle, accessibility, compatibility and evidence verification.
