# Orchestra Plan

## Task
Implement the approved SocratiCode runtime lifecycle hardening so SSH/Codex reconnect fan-out and stale MCP containers cannot recreate sustained host memory pressure.

## Classification
- scope: medium
- risk: critical
- affected_domains: host runtime, Docker/cgroups, systemd, operational monitoring, tests
- estimated_file_count: 9-12 runtime/config/test files plus planning artifacts
- chosen_route: quick-plan-chain -> direct-inline-waves -> security/performance gates
- task_summary: add fail-closed container ownership and cleanup, request watchdogs, bounded services/logs, alert coverage, and a reversible live rollout
- bug_route: performance/resource-exhaustion incident
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light
- security_gate_required: true

## Activation
- Orchestra auto-activated because the user delegated end-to-end implementation of a production-host incident prevention change.
- Brainstorming gate is satisfied by the approved design at `docs/portable-skill-pack/specs/2026-07-16-socraticode-runtime-lifecycle-hardening-design.md` and the user's explicit implementation approval.
- Deep Plan Quick is used to convert the approved design into an implementation/TDD package.
- SocratiCode was active and narrowed the relevant repository surface to the approved design and `scripts/system-crash-monitor.sh`; the authoritative live runtime remains `/home/dev/tools/socraticode-docker`.

## Impact Preflight
- Staged source changes under `ops/socraticode-runtime/`: launcher wrapper, persistent watcher, index runner role metadata, cleanup helper, cleanup systemd service/timer, watcher unit, logrotate policy, focused tests; validated copies are installed to the active host paths after backup.
- Repository change: `scripts/system-crash-monitor.sh` for user-slice/session/container observability; SocratiCode reports no repository callers for this script.
- Production data, database volumes, web/backend contracts, auth, tenant isolation, and application code are out of scope and must not be modified.
- Existing dirty work is extensive. All edits stay within the exact paths listed in the quick plan; no broad staging or destructive git command is allowed.
- Runtime backup is mandatory before install. Cleanup must be dry-run first and fail closed.
- Confidence: high; prior-boot kernel/cgroup evidence isolated the incident to SocratiCode/SSH lifecycle pressure.

## Evidence Ledger
- source: kernel journal, cgroup counters, SSH journal, system monitor logs
- identifier: previous boot `2026-07-16 19:03-22:48 +07`
- observed failure: three Node memcg OOM kills; memory PSI 77-98% for 17 minutes; 51 SSH sessions started with about 37 not deactivated before shutdown
- data state: `user-1000.slice` peaked at 23.6 GiB RAM and 4 GiB swap; `system-smartspec-agent.slice` peaked at 8.1 GiB; production web/backend/DB remained healthy
- confidence: high
- next evidence needed: focused regression tests and post-rollout cgroup/health stability snapshots

## Parallelization Preflight
- candidate_agents: runtime implementer, test reviewer, operations/security reviewer
- same_wave_candidates: tests and documentation could be independent, but live runtime files and their tests share exact contracts
- ownership_map: conductor owns all runtime/config/test files; no sub-agent writers
- dependency_edges: tests define behavior -> implementation -> install -> live verification -> convergence review
- dispatch_mode: sequential_exception
- sequential_reason: standard light mode plus a critical production runtime rollout; one conductor must preserve exact backup/install/rollback ordering and avoid collisions in the dirty tree

## Waves
1. TDD fixtures and planning package: define cleanup/watchdog failure cases.
2. Runtime implementation: launcher ownership/traps, cleanup helper, watcher watchdog, service/timer/logrotate, monitor extensions.
3. Safe rollout: backup, validate, install, dry-run cleanup, restart only dedicated watcher, enable cleanup timer, rotate logs.
4. Verification and convergence: focused tests, systemd/logrotate checks, MCP smoke, PSI/cgroup/session/health snapshots, security/performance review.

## Incident Follow-up - 2026-07-17 Emergency Pause
- scope: small operational containment
- risk: critical
- bug_route: recurring performance/resource-exhaustion incident
- evidence: the previous boot recorded 16 SocratiCode Node memcg OOM kills from 00:01 through 14:58 +07; 19 minutes after the next reboot, ten managed MCP containers already consumed about 6 GiB in `system-smartspec-agent.slice`, with the watcher alone at about 3.57 GiB.
- chosen_route: direct standard-light containment; no sub-agents and no repository source-code changes.
- containment: disable and stop the watcher/index/cleanup units, remove execute permission from the live MCP launcher, stop all managed MCP containers, and stop Qdrant while preserving its named data volume.
- impact boundary: SmartSpecPro web/backend/database services, application data, Docker volumes, and unrelated dirty work remain untouched.
- restore boundary: re-enabling SocratiCode requires an explicit operator action to restore launcher mode `0755`, enable the units, restore Qdrant `unless-stopped`, and start Qdrant before the watcher.
