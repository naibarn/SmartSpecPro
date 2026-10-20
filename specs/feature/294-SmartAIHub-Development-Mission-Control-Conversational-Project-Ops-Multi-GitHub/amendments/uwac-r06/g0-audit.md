# G0 — source and authority audit

Observed 2026-10-21 Asia/Bangkok; immutable inspected base `ce126996921bf710526dfac9949de77210cfb70d`. Raw owner/status/input digests are in [g0-snapshot.json](g0-snapshot.json). This is a source/document/administrative Git review; no production, authenticated browser, persisted runtime, provider, permission or billing acceptance was performed.

`git fetch origin main`, `git ls-remote origin refs/heads/main` and planning preflight agreed on the base. Original user checkout remained at `4539aee1fe866dc682db4421f4e38bc3ba6013cf`, with an untracked supplied R0.6 file. No reset/rebase/clean/staging occurred there. `workspace_authority.py create` admitted a registered clean task worktree on a configured fallback disk after resource admission rejected the first destination. No unrelated workspace was changed. The read-only mission-control command returned partial coverage and unknown workspaces; existence of 924 worktrees is not proof of 924 live sessions.

Read AGENTS.md, configured registry `specs/_config/spec-id-registry.json`, its generated projection and `spec-index.json`, and all 16 named owners' spec/manifests/ledgers. Most manifest authorities remain unresolved; 269 is ACTIVE_CANONICAL and 287 ACTIVE_SUPPORTING. These metadata states do not erase source implementations. Conversely, 295's historical deployment PASS is scoped evidence and is not fresh acceptance of this amendment. The exact SPEC-224 current blockers, continuation, integration, verification and deployment records must be preserved by the official writer.

GitHub main returned `Branch not protected` (404) and no active branch rules. Open PRs #961 (SPEC-224 preview), #398 (provider design) and #939 (source evidence) overlap concepts, not this task's owned paths; their work is not adopted or closed. The GitHub connector search failed argument binding and has no branch-protection endpoint, so `gh` supplied the administrative evidence. No messages/reviews were posted.

Discovery fallback: no specialized codebase index is exposed, so use targeted `rg`, bounded reads and normal Git. Source review anchors below are at the inspected base; [traceability.md](traceability.md) records the actual gap conclusion, not just filename matches.

| Source surface | Inspected evidence | What it proves / limit |
|---|---|---|
| Chat and Skill admission | `apps/web/server/routers/chat.ts:1887`, `:2087`, `:2239`, `:3861`; `services/skillExecutor.ts:1301` | Catalog/detection, intent routes and canonical queued Skill task/polling exist; complete Chat→Work contract is partial |
| Existing job truth | `apps/web/server/services/jobControlPlaneMonitor.ts:1`; `workerJobMonitorService.ts:17`; `jobOutboxRunner.ts` | Existing authenticated monitor and canonical job/outbox machinery; no new ledger needed |
| Observation API/reducer | `apps/web/server/routers/workerJobs.ts:105`; `services/taskObservabilityReadModel.ts:1`, `:53` | Scoped task list/detail/aggregate, signed snapshot tokens and bounded joins; not a complete multi-source immutable timeline |
| Observation UI | `apps/web/client/src/pages/TaskObservabilityMonitor.tsx:19`, `:70`; `components/task-control/TaskAcceptanceEvidence.tsx:14` | Actual polling/filter/detail and evidence surface exists; dual lens/cross-device rendered parity unverified |
| Skill Studio/registry | `apps/web/server/services/skillStudioService.ts:1`, `:51`; `skillRegistry.ts:745`; `client/src/components/skills/SkillStudioDialog.tsx` | create/improve, visibility and registry foundations; full release/eval/signature contract not demonstrated |
| Discovery reuse | `apps/web/server/services/orchestratorCapabilityCatalogService.ts:128`, `:135`, `:307` | Existing catalog filters retired types and projects Skills; not full public SPEC-256 contract |
| Development | `apps/web/server/services/developmentControlPlaneContracts.ts:30`; `agentControlPlaneContracts.ts:32`; `spec224RunnerContinuationReconciler.ts` | Source-specific development/agent contracts and continuation foundation; repositoryRef is a development requirement, not a general Work prerequisite |
| Runner/provider | `apps/web/server/services/runnerSessionContracts.ts:1`; `runnerExecutionSessionService.ts`; `externalAgentRunnerDispatcher.ts`; `apps/runner-app/src/session_command_lane.rs` | Session/control mechanisms exist; control/native/A2A support must be capability-specific and live continuity remains unverified |
| Git authority | `scripts/development-lifecycle/workspace_authority.py`; `canonical_source.py:327`, `:610`; `skills/integration-controller/scripts/promote_ready_pr.py:229` | Registered workspaces, canonical preflight/leases and guarded integration exist and were partly exercised for this task |
| Local build/release | `package.json:19`; `scripts/release-linux-web.sh:30`; `apps/web/scripts/linux_backend_release.py:150` | Canonical exact-source builder and digest-checked sudo-gated Linux promotion code exist; no build/promote executed |
| Remote workflows | `.github/workflows/runner-release.yml:95`; `runner-desktop-release.yml:35`; `deploy-production.yml:26` | Runner workflows accept ref; generic old production workflow is disabled. A shared exact-SHA/provenance remote release path is not established by these files |
| Flags and safe routing | `apps/web/shared/featureFlags.ts:561`, `:562`, `:630`; `services/workOrchestratorFeatureFlags.ts:13` | taskPlannerEnabled=true, retired escalation=false, hermesTaskModes=false are defaults only; actual tenant activation unknown |

## Directly relevant retained gaps

`skillExecutor.ts:551–566` retains a direct legacy Python subprocess path after the retired-sandbox guard. `workOrchestratorSecurityPolicy.ts:62–159` and `shared/workOrchestrator.ts:5–27` retain retired type cases while catalog discovery filters them. This phase adds exclusion/queue-conformance acceptance and implementation work; it neither invokes nor extends those paths. No production exploit or live side effect was tested.

SPEC-277's implemented-dependency wording for 206/224/256 is a frozen-owner compatibility rule, not certification of their full runtime behavior. Preserve its adapter boundary and label actual source coverage independently.

## SPEC-256 documentary identity resolution

The outer and nested spec files were introduced together in `6fffb7478`; chronology alone cannot choose an owner. The outer pack's README lines 11–14 explicitly name the outer canonical `spec.md`; MANIFEST.json identifies its sibling contract/fixture set; VALIDATION-R1.2.md binds validation to that pack. The nested file lacks those siblings and is an embedded distribution copy. Later owner alignment `440c9e5` amended only the outer source. The outer and nested baseline digests are preserved in the snapshot.

Resolve *document identity only* through the existing HandOff writer: outer authority ACTIVE_CANONICAL for this user-directed amendment; nested authority/disposition HISTORICAL_ONLY with a continuation prohibition and pointer to outer. Preserve all bytes of nested spec and its historical requirements. The raw inventory can still report duplicate IDs because the preserved copies differ; that diagnostic is retained, with explicit manifest authority decisions, rather than changing the walker, moving/deleting files or allocating another number. Number allocation/alias registry is unchanged. Runtime acceptance and historical illustrative pack checksums are not certified by this resolution.

## Verification resource profile

Profile `quick`: documentation links/IDs/sections, official HandOff validation and preservation, registry/index consistency and fast Git/secret gate only. At initial resource observation: RAM available 25,044 MiB; fallback disk 73 GiB available. No heavy local typecheck, build, provider call, deployment or DB mutation is required. Exact commands/revisions/times/outcomes are recorded in [verification.json](verification.json) when executed. OOM/137/SIGKILL or missing resource evidence is RESOURCE_BLOCKED, not code failure.

## Continuation

Coordinator owns only these additive documents and official owner HandOff changes. Scout `/root/owner_scout` (gpt-5.6-sol) performed read-only ownership/implementation planning with `ownership_paths=[]`, returned source anchors and SPEC-256 provenance, and finished. Next engineering starts with WP31 after the documented owner/schema compatibility preflight; current SPEC-224 live acceptance continues independently.
