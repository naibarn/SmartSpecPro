<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation-registry
section-02-data-bindings-readiness
section-03-graph-subflows-layout
section-04-core-data-adapters
section-05-control-human-runtime
section-06-ai-agent-skill-adapters
section-07-tools-media-adapters
section-08-library-marketplace-reuse
section-09-canonical-execution-projection
section-10-mockup-studio-ui
section-11-ai-draft-edit
section-12-certification-rollout
END_MANIFEST -->

# Typed Workflow Node Platform v1 — Implementation Sections

Normative companion: [`../cross-spec-node-coverage.md`](../cross-spec-node-coverage.md)
adds the workflow-facing contracts and execution metadata required to cover
Specs 200, 204, 205, 206, 207, 208, 210, and 211. It is implemented through
Sections 01, 02, 06, 07, 09, and 12; it does not add a competing section or
runtime authority.

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 foundation/registry | Feature 209 contracts | 02–12 | No |
| 02 data/bindings/readiness | 01 | 04–11 | Yes with 03 |
| 03 graph/subflows/layout | 01 | 05, 09, 10, 11 | Yes with 02 |
| 04 core data adapters | 01, 02 | 05, 09 | Yes with 05–08 after 02 |
| 05 control/human runtime | 01–03 | 09, 10 | No |
| 06 AI/agent/skill adapters | 01, 02 | 09, 10 | Yes with 04, 05, 07 |
| 07 tools/media adapters | 01, 02 | 09, 10 | Yes with 04, 05, 06 |
| 08 Library/Marketplace/reuse | 01, 02, 03 | 09, 10, 11 | Yes after 03 |
| 09 canonical execution/projection | 01–08 | 10, 12 | No |
| 10 mockup Studio UI | 01–05, 08, 09 | 11, 12 | No |
| 11 AI Draft/Edit | 01, 03, 08, 10 | 12 | No |
| 12 certification/rollout | 01–11 | - | No |

## Execution order

1. Section 01 establishes shared schemas and the registry.
2. Sections 02 and 03 run after 01; they may be developed in parallel because
   the binding and graph modules have separate ownership paths.
3. Sections 04, 05, 06, 07, and 08 proceed after their listed dependencies;
   adapter sections may run in parallel, while 05 owns control semantics and 08
   owns reuse services.
4. Section 09 integrates every adapter into the canonical durable runtime.
5. Section 10 consumes the finalized registry/runtime projections to implement
   the mockup-led interaction surface.
6. Section 11 adds AI candidate generation/diff/apply on top of the same registry
   and graph APIs.
7. Section 12 performs full catalog/use-case/browser/security/rollout proof.

## Ownership rule

Each section owns only the files listed in its section file. Shared router/page
files are split into named procedure/component regions and must be changed in
the dependency order above; no parallel writer may modify the same region.
New focused modules are preferred over adding more generic branches to a single
large page or executor file.

## Section summaries

### section-01-foundation-registry

Versioned shared node contracts, registry, schema validation, and legacy mapping.

### section-02-data-bindings-readiness

Tenant-safe data source namespaces, input/output bindings, skill form projection,
and truthful readiness.

### section-03-graph-subflows-layout

Typed graph semantics, edges, branch handles, main/subflow navigation, layout,
resize, delete, zoom, and persistence.

### section-04-core-data-adapters

Input, document, data transform, Library/search, and system-context node adapters.

### section-05-control-human-runtime

Control flow, human approval/input, recovery, checkpoints, and partial run modes.

### section-06-ai-agent-skill-adapters

LLM, structured AI, agent, skill, subflow-call, and external-agent adapters.

### section-07-tools-media-adapters

HTTP/MCP/connectors/database/file/artifact and media/provider adapter contracts.

### section-08-library-marketplace-reuse

Reusable version contracts, Mini Apps, Library, Marketplace readiness, and run.

### section-09-canonical-execution-projection

Durable worker admission, event projection, outputs, artifacts, trace/log/cost,
and run controls.

### section-10-mockup-studio-ui

Mockup-led builder layout, node cards, inspector, palette, responsive controls,
and real graph/run interactions.

### section-11-ai-draft-edit

Prompt-driven typed graph generation/editing, explanation, diff, validation, and
safe draft apply.

### section-12-certification-rollout

Catalog matrix, representative workflows, security, browser evidence, build,
regression, rollout, and rollback gates.
