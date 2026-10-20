# Requirement traceability and source gap matrix

Base `ce126996921bf710526dfac9949de77210cfb70d`; source review only. All UWAC requirement rows remain final_state OPEN / implementation_status UNVERIFIED in canonical ledgers. Source-component classifications below do not upgrade those rows or establish production acceptance. Definitions: [C10](amendment.md#c10--acceptance-and-rollout-boundary). `MISSING` is scoped to inspected paths; `BLOCKED` identifies only its affected authority path.

| Trace | Requested capability | Owner | Source status | Evidence / limitation at inspected base | Work package | Acceptance |
|---|---|---|---|---|---|---|
| T01 | General Work/Goal semantics | 196/269 | PARTIAL | assistantTeams/workerJobs schema and shared taskGoalProgress; full Work profile/parent acceptance not demonstrated | WP31 | UW-02 UW-03 UW-09 UW-28 UW-29 |
| T02 | Chat intent conversion/tracking | 198 | PARTIAL | chat.ts:1887/2087/2239/3861; complete shared Chat-to-Work/Skill/Develop contract not shown | WP33 | UW-01 UW-02 UW-05 UW-25 UW-29 |
| T03 | Non-code report/media results | 269/294 | PARTIAL | workerJobMonitorService.ts imports workerArtifacts/libraryItems; full outcome-specific evidence adapters not demonstrated | WP37 | UW-03 UW-04 UW-12 |
| T04 | Discovery projection | 256 | PARTIAL | orchestratorCapabilityCatalogService.ts:128/135/307; selection freshness/effect receipts incomplete | WP34 | UW-05 UW-17 UW-18 UW-32 |
| T05 | Skill Studio create/improve | 221 | PARTIAL | skillStudioService.ts:51 and SkillStudioDialog.tsx; no universal Git request field, full immutable eval/release proof absent | WP35 | UW-06 UW-07 UW-08 UW-25 |
| T06 | Provider-neutral agent contracts | 200 | PARTIAL | agentControlPlaneContracts.ts:32/59; narrower provider enum and event kinds than full heterogeneous fleet | WP32/36 | UW-09 UW-10 UW-19 UW-31 |
| T07 | Runner session/control/replay | 205 | PARTIAL | runnerSessionContracts.ts, runnerExecutionSessionService.ts and session_command_lane.rs; live native cross-session recovery not exercised | WP36 | UW-11 UW-18 UW-22 UW-31 |
| T08 | A2A negotiation/public adapter | 206 | SPEC_ONLY | SPEC206 codebase audit says no A2A adapter/router/schema/flag; native/MCP presence is not A2A proof | WP32/36 | UW-10 UW-19 UW-31 |
| T09 | General command ingress contract | 279 | SPEC_ONLY | SPEC279 R1.4 has detailed ingress/delegation contract; scoped search found Runner job commands but no full universal profile implementation | WP36 | UW-09 UW-17 UW-21 UW-31 |
| T10 | Task observability API | 294 | IMPLEMENTED | workerJobs.ts:105/125 and taskObservabilityReadModel.ts:53 implement scoped list/detail/aggregate and signed tokens; source-only capability claim | WP32 | UW-19 UW-20 UW-21 UW-26 |
| T11 | Unified cross-harness activity timeline | 294 | MISSING | taskObservabilityReadModel joins task/runner evidence; no complete normalized Work/Skill/session event timeline in inspected UI/API scope | WP32 | UW-19 UW-23 UW-26 UW-27 |
| T12 | Simple/Developer navigation and responsive parity | 277/287 | PARTIAL | TaskObservabilityMonitor.tsx exists; no implemented dual-lens unified shell found in this surface; rendered parity untested | WP33/39 | UW-13 UW-20 UW-22 UW-33 |
| T13 | Source-specific development contracts | 218 | IMPLEMENTED | developmentControlPlaneContracts.ts:30 requires repositoryRef for DevelopmentJob; do not generalize to all Work | WP38 | UW-14 UW-29 |
| T14 | Development continuation/incremental integration | 224 | PARTIAL | spec224RunnerContinuationReconciler.ts and integrated HandOff evidence; unresolved live/grant/DB/source trust obligations remain | WP38 | UW-14 UW-15 UW-29 UW-35 |
| T15 | Canonical worktree/source authority | 293 | IMPLEMENTED | workspace_authority.py create and canonical_source.py preflight exercised at base; source guards inspected; not a general multi-host acceptance claim | WP38 | UW-15 UW-16 UW-23 UW-30 |
| T16 | Single protected integration path | 293/224 | IMPLEMENTED | promote_ready_pr.py:229 and development-lifecycle policy; main currently unprotected, non-force direct path allowed | WP38 | UW-14 UW-15 UW-30 |
| T17 | Local exact-source build/release provenance | 295 | PARTIAL | canonical_source.py and linux_backend_release.py:150 plus release-linux-web.sh source reviewed; no build/promotion run here | WP38 | UW-16 UW-30 UW-34 UW-36 |
| T18 | Remote/local common provenance | 295 | SPEC_ONLY | Runner Actions workflows accept ref; old deploy-production job disabled at line26; full local/Actions release provenance not demonstrated | WP38 | UW-30 UW-34 UW-35 UW-36 |
| T19 | Long Skill execution queue conformance | 221/256 | PARTIAL | skillExecutor.ts:1301 queues long work, but :551-566 retains direct Python subprocess; exclude from new paths and plan remediation | WP34/35 | UW-07 UW-28 UW-32 |
| T20 | Retired type exclusion at all boundaries | 196/198/256/269/279 | PARTIAL | catalog filters at orchestratorCapabilityCatalogService.ts:128; security policy/shared enum retain retired cases; never extend or invoke them | WP31/34/36 | UW-28 UW-32 |
| T21 | Source schema/feature flags/tenant rollout | 256/277/294 | UNVERIFIED | shared/featureFlags.ts and workOrchestratorFeatureFlags.ts show defaults, not actual tenant enablement or complete UWAC capability coverage | WP31/39 | UW-17 UW-21 UW-32 |
| T22 | Billing/permission/multi-tenant live acceptance | 279 plus existing 207/220/280 | UNVERIFIED | taskObservabilityReadModel scope checks and existing ledger joins; no authenticated live revoke/settlement exercise in this task | WP36/39 | UW-10 UW-17 UW-18 UW-21 UW-24 |
| T23 | SPEC224 protected live acceptance | 224 | BLOCKED | Existing HandOff R11_DISPOSABLE_AUTHORITY_ACCEPTANCE and continuation DB/source-trust/Runner prerequisites, not newly tested or closed | existing SPEC224 live lane | UW-14 UW-35 |
| T24 | Fresh production/environment acceptance | all owners | UNVERIFIED | No target runtime/production action requested or performed; historical 295 deployment flag does not certify this amendment | WP39 + existing release controls | UW-30 UW-33 UW-34 UW-35 UW-36 |

## Exact owner requirement IDs

| Owner | Canonical normative requirements | Clauses | Acceptance cases |
|---|---|---|---|
| [196](../../../196-universal-goal-orchestration/spec.md) | REQ-196-UWAC-01; REQ-196-UWAC-02 | C1/C2 | UW-01 UW-02 UW-09 UW-28 UW-29 |
| [198](../../../198-intelligent-chat-universal-orchestration-capability-evolution/spec.md) | REQ-198-UWAC-01; REQ-198-UWAC-02 | C1/C3/C5 | UW-01 UW-02 UW-05 UW-25 UW-28 UW-29 |
| [200](../../../200-universal-coding-agent-control-plane/spec.md) | REQ-200-UWAC-01; REQ-200-UWAC-02 | C2/C3/C4 | UW-09 UW-10 UW-11 UW-19 UW-31 |
| [205](../../../205-smartaihub-runner-cross-platform/spec.md) | REQ-205-UWAC-01; REQ-205-UWAC-02 | C2/C3/C4 | UW-10 UW-11 UW-18 UW-22 UW-31 |
| [206](../../../206-a2a-first-hybrid-external-agent-interoperability/spec.md) | REQ-206-UWAC-01; REQ-206-UWAC-02 | C2/C3/C4 | UW-09 UW-10 UW-11 UW-19 UW-31 |
| [218](../../../218-ai-product-development-control-plane/spec.md) | REQ-218-UWAC-01; REQ-218-UWAC-02 | C1/C8 | UW-14 UW-15 UW-29 UW-30 |
| [221](../../../221-smartaihub-skill-engineering-framework/spec.md) | REQ-221-UWAC-01; REQ-221-UWAC-02 | C6/C7 | UW-06 UW-07 UW-08 UW-17 UW-18 UW-25 UW-32 |
| [224](../../../224-Autonomous Development Orchestrator Runtime/spec.md) | REQ-224-UWAC-01; REQ-224-UWAC-02 | C1/C8/C9/C10 | UW-14 UW-15 UW-16 UW-29 UW-30 UW-35 |
| [256](../../../256-skill-first-capability-discovery-intent-execution/spec.md) | REQ-256-UWAC-01; REQ-256-UWAC-02 | C1/C6 | UW-05 UW-10 UW-17 UW-18 UW-25 UW-28 UW-32 |
| [269](../../../269-smartaihub-primary-specialist-assistant-teams-autonomous-workforce/spec.md) | REQ-269-UWAC-01; REQ-269-UWAC-02 | C1/C2/C7 | UW-02 UW-03 UW-04 UW-09 UW-12 UW-28 UW-29 |
| [277](../../../277-task-control-experience-r1-6/spec.md) | REQ-277-UWAC-01; REQ-277-UWAC-02 | C4/C5 | UW-13 UW-19 UW-20 UW-21 UW-22 UW-23 UW-26 UW-27 UW-33 |
| [279](../../../279-universal-command-ingress-agent-delegation-gateway-r1-0/spec.md) | REQ-279-UWAC-01; REQ-279-UWAC-02 | C2/C3 | UW-09 UW-17 UW-18 UW-21 UW-29 UW-31 UW-32 |
| [287](../../../287-Unified-UI-Governance-Rendering-Conformance-MiniApp-Design-Contract/spec.md) | REQ-287-UWAC-01; REQ-287-UWAC-02 | C5/C10 | UW-13 UW-20 UW-22 UW-27 UW-33 |
| [293](../../../293-SmartAIHub-Unified-Git-Workspace-Repository-Federation/spec.md) | REQ-293-UWAC-01; REQ-293-UWAC-02 | C1/C8 | UW-13 UW-14 UW-15 UW-16 UW-23 UW-30 UW-34 |
| [294](../../spec.md) | REQ-294-UWAC-01; REQ-294-UWAC-02 | C2/C4/C5/C7/C10 | UW-03 UW-09 UW-11 UW-12 UW-19 UW-20 UW-21 UW-22 UW-23 UW-26 UW-27 UW-33 |
| [295](../../../295-SmartAIHub-Production-Release-Deployment-Runtime-Data-Migration-Operations/spec.md) | REQ-295-UWAC-01; REQ-295-UWAC-02 | C8/C9/C10 | UW-14 UW-16 UW-24 UW-30 UW-34 UW-35 UW-36 |

## User-request coverage

| Request | Deliverable / verification boundary |
|---|---|
| G0 latest main, registry/index/HandOff/PR/worktrees and source | g0-audit.md + g0-snapshot.json; 17 records including duplicate 256, all 16 requested IDs inspected |
| A additive owner amendments | 32 owner-specific requirements appended; no new numbered SPEC; C1–C10 reuse previous owners |
| B1–B10 UX | C3–C5 plus UW-01/13/19–23/26–27/31/33; command authority and nonblocking monitoring preserved |
| C canonical source/build/deploy | C8–C9 plus UW-14–16/30/34–36; local/remote provenance planned, runtime NOT_RUN |
| D at least ten substantive reviews | review-log.md with 15 scoped lenses and source-derived corrections; document/source review, not production tests |
| E1–E3 canonical spec/ownership/traceability | Owner spec.md + ownership.md + this matrix |
| E4–E5 work packages/acceptance | claude-plan.md, nine section plans, acceptance.md UW-01–36 |
| E6 official ledger/HandOff | tools.spec_handoff reconcile/update/batch writer, prior row preservation and generated index |
| E7 files/commit/merge/unverified | verification.json + handoff/evidence/uwac-r06-checkpoint-20261021.md and final report; no production claim |

## Source freshness and future work

Re-run targeted audit when implementing against a newer canonical SHA; do not overwrite these baseline conclusions with unbound current observations. Resolve exact active tenant rollout, provider capability and trusted input/source authority before effects. Source audit gaps T19/T20 require queue/exclusion conformance work, not retired-system development or destructive removal. SPEC224 live lane continues under its original blockers; WP38 is an additive consumer plan only.
