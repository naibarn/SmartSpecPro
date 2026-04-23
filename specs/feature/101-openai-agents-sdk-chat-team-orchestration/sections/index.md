<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test && (cd python-backend && uv run pytest)
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contracts-flags
section-02-persistence-migrations
section-03-python-openai-agents-adapter
section-04-node-runtime-client
section-05-skill-capability-manifests
section-06-chat-runtime-integration
section-07-team-runtime-integration
section-08-responses-runtime-integration
section-09-shared-skill-runtime-integration
section-10-ledger-ui-debug
section-11-rollout-replay-release-gates
END_MANIFEST -->

# Implementation Sections Index

## Mixed Stack Note

This feature spans both TypeScript and Python. The top-level `test_command` is a broad project command intended to keep both stacks visible during implementation. Section-local TDD tests remain authoritative for focused work, especially for the Python adapter in section 03 and mixed runtime boundaries in sections 04, 06, 07, 08, 09, and 11.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-shared-contracts-flags | - | 02, 03, 04, 05, 06, 07, 08, 09, 10, 11 | No |
| section-02-persistence-migrations | 01 | 04, 06, 07, 08, 09, 10, 11 | Yes |
| section-03-python-openai-agents-adapter | 01 | 04, 06, 07, 08, 09, 11 | Yes |
| section-04-node-runtime-client | 01, 02, 03 | 06, 07, 08, 09, 10, 11 | No |
| section-05-skill-capability-manifests | 01 | 06, 07, 08, 09, 11 | Yes |
| section-06-chat-runtime-integration | 01, 02, 03, 04, 05 | 10, 11 | Yes |
| section-07-team-runtime-integration | 01, 02, 03, 04, 05 | 10, 11 | No |
| section-08-responses-runtime-integration | 01, 02, 03, 04, 05 | 10, 11 | Yes |
| section-09-shared-skill-runtime-integration | 01, 02, 03, 04, 05 | 10, 11 | Yes |
| section-10-ledger-ui-debug | 01, 02, 04, 07, 08, 09 | 11 | Yes |
| section-11-rollout-replay-release-gates | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10 | - | No |

## Execution Order

1. `section-01-shared-contracts-flags`
2. `section-02-persistence-migrations`, `section-03-python-openai-agents-adapter`, and `section-05-skill-capability-manifests` can proceed in parallel after section 01.
3. `section-04-node-runtime-client` after sections 01, 02, and 03.
4. `section-06-chat-runtime-integration`, `section-07-team-runtime-integration`, `section-08-responses-runtime-integration`, and `section-09-shared-skill-runtime-integration` after sections 01 through 05.
5. `section-10-ledger-ui-debug` after runtime projections/debug DTOs exist for the activated surfaces.
6. `section-11-rollout-replay-release-gates` after all runtime, UI, and persistence sections exist.

## Section Summaries

### section-01-shared-contracts-flags

Create shared TypeScript runtime DTOs, review verdict types, runtime event types, skill manifest schema shell, feature flag registration, runtime selection semantics, and import-boundary guard scaffolding.

### section-02-persistence-migrations

Add additive schema/migration support for `team_runs` runtime metadata, `agent_runtime_traces`, `agent_runtime_checkpoints`, Team message metadata links, legacy rendering contracts, redaction-safe trace persistence, and idempotency keys.

### section-03-python-openai-agents-adapter

Create the isolated Python OpenAI Agents SDK adapter, Pydantic contracts, gateway-only model client, SDK version reporting, trace redaction/export handling, tool/handoff/guardrail construction, and stream/resume/cancel normalization.

### section-04-node-runtime-client

Create Node-side runtime client, request builders, internal Python transport, contract fixtures, trace/checkpoint services, Team projection service, runtime backpressure, and shadow side-effect suppression.

### section-05-skill-capability-manifests

Implement machine-readable capability manifests for runtime-selectable skills, validation, manifest registry/loading, negative constraints, evidence requirements, reviewer/repair metadata, and selection explanation support.

### section-06-chat-runtime-integration

Wire Chat to the shared runtime in shadow and active modes, preserve gateway/model behavior, persist generic checkpoints for Chat approval interruptions, emit comparison traces, and support force rollback for new Chat turns.

### section-07-team-runtime-integration

Wire Team run execution to the shared runtime while preserving deterministic plan order, plan-before-execution, owner result persistence, reviewer verdicts, repair loops, attempt budget guarantees, terminal reasons, and completion gates.

### section-08-responses-runtime-integration

Wire Responses and structured-output execution paths to the shared runtime in shadow and active modes, preserve caller-visible schema contracts, persist checkpoints and traces, and support replay/rollback with no silent prose fallback.

### section-09-shared-skill-runtime-integration

Wire internal/shared skill execution to the shared runtime in shadow and active modes, preserve typed caller contracts, bound recursion, persist traces, and support replay/rollback with fail-closed schema validation.

### section-10-ledger-ui-debug

Expose runtime state through Team ledger and UI/debug panels: persisted plan, step cards, owner/reviewer links, repair attempts, trace links, current terminal reason, runtime metadata for Responses/shared-skill debug/admin views, legacy-safe empty states, and no scroll/focus lock regressions.

### section-11-rollout-replay-release-gates

Add replay fixtures, compatibility suites, SDK upgrade validation docs, rollout gates, shadow comparison metrics, rollback validation, performance gates, and final release readiness checks across Chat, Team, Responses, and shared skill runtime.
