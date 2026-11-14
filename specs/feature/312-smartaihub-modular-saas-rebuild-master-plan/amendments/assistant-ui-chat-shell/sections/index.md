<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartaihub/chat test
END_PROJECT_CONFIG -->
<!-- SECTION_MANIFEST
section-01-pin-assistant-ui-and-adapter-contract
section-02-canonical-thread-message-runtime
section-03-transcript-composer-and-attachment-rendering
section-04-responsive-shell-and-truthful-inspector
section-05-integration-tests-and-regression-proof
section-06-development-release-and-spec-handoff
END_MANIFEST -->

# Implementation Sections — assistant-ui Chat Shell

## Dependency graph

| Section | Depends On | Owns | Observable output |
|---|---|---|---|
| 01 | - | Chat package manifest/lock; adapter mapping module | Exact pinned library and public type-compatible mapping primitives |
| 02 | 01 | Chat runtime adapter; thread selection/hydration integration | Existing Core threads/messages exposed to assistant-ui with stable IDs and existing API send path |
| 03 | 02 | Transcript, composer, message parts, attachments | Assistant-ui powered chat interactions with existing Astryx rendering and attachment behavior |
| 04 | 02, 03 | ChatWorkspace layout and scoped styles | Responsive navigation/history, conversation/composer and truthful inspector |
| 05 | 02, 03, 04 | Chat package tests | Focused regression proof for mapping, sends, thread switch, attachments and responsive accessibility |
| 06 | 01–05 | release evidence and SPEC-312 handoff only | Exact-target dev deploy and truthful acceptance/handoff update |

## Rules

- No section may change Core ownership, worker_jobs/outbox/Queue dispatch, credit ledger, auth boundary or deployment target as an incidental UI migration.
- Do not introduce Assistant Cloud, AI SDK, Cloudflare Agents, localStorage message persistence or client-side job orchestration.
- No fake Agent/Run/Attempt/tool/artifact/stream/cancel status. Mark unsupported capabilities as open and explicit.
- Keep code changes in the clean `smartaihub-platform` canonical checkout. Keep SmartSpecPro source paths limited to this amendment and SPEC-312 canonical handoff/evidence.
- Integrate every coherent source checkpoint on source `main`; integrate its matching SPEC/handoff checkpoint on SmartSpecPro `main` without staging other dirty paths.
