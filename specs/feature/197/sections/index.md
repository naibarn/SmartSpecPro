<!-- PROJECT_CONFIG
runtime: rust-cargo
test_command: cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml
END_PROJECT_CONFIG -->
<!-- SECTION_MANIFEST
section-01-runner-contracts
section-02-identity-and-discovery
section-03-claims-and-leasing
section-04-control-and-recovery
section-05-ui-and-mcp-boundary
section-06-migration-and-acceptance
END_MANIFEST -->

# Feature 197 Sections

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| 01 | Features 195/196 | 02–06 | No |
| 02 | 01 | 03–06 | No |
| 03 | 01–02 | 04–06 | No |
| 04 | 01–03 | 05–06 | No |
| 05 | 01–04 | 06 | No |
| 06 | 01–05 | — | No |

## Source Coverage

The six sections cover every source heading 0–79, all Runner/MCP/security/learning/UI/case-study/migration/acceptance addenda and the trailing codebase summary.

## Execution Order

Contracts → identity/discovery → claims/leasing → control/recovery → UI/MCP → migration/acceptance.

