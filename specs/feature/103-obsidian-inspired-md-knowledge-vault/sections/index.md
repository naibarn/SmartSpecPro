<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm run -w @smartspec/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-vault-and-knowledge-cache
section-02-note-navigation-and-relationship-panels
section-03-properties-bases-and-search-facets
section-04-canvas-rollout-and-compatibility
section-05-agent-skill-context-packs-and-business-memory
section-06-runtime-and-mcp-integration
section-07-schema-and-router-contracts
section-08-end-to-end-sequence-flows
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-vault-and-knowledge-cache | - | 02, 03, 04, 05, 07, 08 | No |
| section-02-note-navigation-and-relationship-panels | 01 | 04, 08 | Yes |
| section-03-properties-bases-and-search-facets | 01 | 05, 07, 08 | Yes |
| section-04-canvas-rollout-and-compatibility | 01, 02 | 08 | Yes |
| section-05-agent-skill-context-packs-and-business-memory | 01, 03 | 06, 07, 08 | No |
| section-06-runtime-and-mcp-integration | 05 | 07, 08 | No |
| section-07-schema-and-router-contracts | 01, 03, 05, 06 | 08 | No |
| section-08-end-to-end-sequence-flows | 01, 02, 03, 04, 05, 06, 07 | - | No |

## Execution Order

1. `section-01-vault-and-knowledge-cache`
2. `section-02-note-navigation-and-relationship-panels` and `section-03-properties-bases-and-search-facets`
3. `section-05-agent-skill-context-packs-and-business-memory`
4. `section-06-runtime-and-mcp-integration`
5. `section-04-canvas-rollout-and-compatibility` and `section-07-schema-and-router-contracts`
6. `section-08-end-to-end-sequence-flows`

## Section Summaries

### section-01-vault-and-knowledge-cache

Build the rebuildable Markdown knowledge cache, canonical note identity model, extraction pipeline, and tenant-scoped backfill/repair flows.

### section-02-note-navigation-and-relationship-panels

Expose backlinks, outgoing links, unlinked mentions, quick switcher, and inspector-driven note navigation inside Document Management.

### section-03-properties-bases-and-search-facets

Turn note properties, tags, and file metadata into a managed catalog and saved-view system that powers repeatable exploration and curation.

### section-04-canvas-rollout-and-compatibility

Add a durable canvas workspace and define intentional degraded behavior for non-Markdown or connector-backed assets.

### section-05-agent-skill-context-packs-and-business-memory

Finish context-pack CRUD, publish, and resolve behavior so curated note sets can become safe business-memory inputs.

### section-06-runtime-and-mcp-integration

Bridge Library context packs into the shared runtime context engine and narrow delegated-worker MCP access without broadening permissions.

### section-07-schema-and-router-contracts

Lock the backend interfaces, migrations, and shared contracts into implementation-ready Drizzle/Zod/TRPC shapes.

### section-08-end-to-end-sequence-flows

Define rollout order, observability, failure handling, and end-to-end checkpoints across save, backfill, navigation, and runtime handoff flows.
