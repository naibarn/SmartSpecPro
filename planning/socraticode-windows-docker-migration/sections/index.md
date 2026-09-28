<!-- PROJECT_CONFIG
runtime: operations-windows-wsl-docker
test_command: checkpoint validation from claude-plan-tdd.md
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-secure-bootstrap-preflight
section-02-server-inventory-data-boundary
section-03-source-transfer
section-04-local-runtime-index
section-05-validation-cutover-rollback
END_MANIFEST -->

# Execution Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable for writing |
|---|---|---|---|
| section-01-secure-bootstrap-preflight | - | 02, 03, 04, 05 | Yes |
| section-02-server-inventory-data-boundary | 01 | 03, 04 | Yes |
| section-03-source-transfer | 02 | 04 | Yes |
| section-04-local-runtime-index | 01, 02, 03 | 05 | Yes |
| section-05-validation-cutover-rollback | 04 | - | Yes |

## Execution Order

1. Secure bootstrap and Windows/WSL/Docker preflight.
2. Read-only server inventory and data-lane approval.
3. Safe source transfer.
4. Local runtime creation and fresh index or optional restore.
5. Validation, observation, rollback readiness, and closeout.

Sections may be written independently but must be executed in this order.

## Section Summaries

### section-01-secure-bootstrap-preflight

Verify SSH identity, copy/hash the plan, establish the WSL execution area, and
prove Windows/WSL/Docker resources and tools.

### section-02-server-inventory-data-boundary

Revalidate disabled server state, production health, source inventory, data
classification, approvals, and optional snapshot boundary.

### section-03-source-transfer

Create a fresh WSL clone, optionally transfer reviewed dirty work, and reconcile
commit/status/hash evidence without copying the whole worktree.

### section-04-local-runtime-index

Create controlled local Qdrant/Ollama services, configure local stdio MCP, and
perform a bounded fresh reindex or compatible snapshot evaluation.

### section-05-validation-cutover-rollback

Run functional/fan-out/resource tests, revalidate the server, observe for 24/72
hours, and preserve a non-destructive rollback and retention trail.
