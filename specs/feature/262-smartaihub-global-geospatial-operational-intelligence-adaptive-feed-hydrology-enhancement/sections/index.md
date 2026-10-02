<!-- PROJECT_CONFIG
runtime: node-npm
test_command: npm --prefix apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-baseline-map-provider
section-02-platform-routing-chat-context
section-03-map-ux-and-commands
section-04-viewport-adaptive-feed
section-05-feed-semantics-and-weather
section-06-source-acquisition-durable-jobs
section-07-hydrology-observations-timeseries
section-08-hydro-network-impact
section-09-thailand-provider-pack
section-10-compound-hazards-and-exposure
section-11-global-regional-capabilities
section-12-localization-and-geographic-search
section-13-watches-api-mcp-chat-actions
section-14-privacy-federation-retention
section-15-offline-accessibility-device-sync
section-16-provider-admin-operations
section-17-model-governance-replay-recovery
section-18-integrated-acceptance-release-evidence
END_MANIFEST -->

# Section index and ownership map

The complete active spec is covered by the traceability matrix in `claude-plan.md`. Spec headings 0–50, appendices A–C, all normative additions R1.1–R1.8, acceptance tests 1–513 and scenarios A–AR are allocated below. Shared authority: Spec260 owns emergency identity/routes/disclosure/audit and `worker_jobs`/outbox execution. DB/journal and shared public contracts are serial conductor-owned. Parallel work must stay within declared ownership.

| Section | Scope / Spec anchors | Initial ownership paths | Dependency |
|---|---|---|---|
| 01 baseline map/provider | 0–4, 46A, R1.8.1 | emergency map renderer, provider resolver/runtime, map worker asset tests, CF proxy tests | none |
| 02 platform/routing/chat | 2–6, 8, 13, 38, 41, 46, R1.8.1–2 | trusted runtime capability resolver, route manifest integration, FeedbackButton Chat context bridge | 01 |
| 03 map UX/commands | 7–8, 30, 35, R1.1-20/21, R1.2 6/13/14/18, R1.7 71 | emergency map controls/layers, typed commands, coverage/provenance UI | 01–02 |
| 04 adaptive feed | 9–13, 29, 43.1, R1.1-12/13, R1.2 5, R1.3 13/16, R1.7 61/64 | shared viewport contracts, bounded feed service/API | 02 |
| 05 feed semantics/weather | 10–15, 29, 35, 39–40, R1.1-16, R1.3 18 | ranking, digest, weather/fact/freshness models | 04, 06 |
| 06 acquisition/durable jobs | R1.1-2/23B, R1.2 7, R1.4 33/35, R1.5 37–39/49, R1.6 50/56/57/59, R1.7 68 | source adapters and registry; executor/outbox bindings (no duplicate queue) | 02 |
| 07 hydro observation series | 16–18, R1.1-15/18, R1.2 3, R1.4 25/28/30, R1.5 48, R1.6 51–53, R1.7 62–63 | canonical observation schema/migration, unit/CRS, trend/detector | 06; migration serial |
| 08 hydro graph/impact | 19–22, R1.1-4/5/13/23A/C/D/F, R1.2 1/2/11, R1.3 15/20/22, R1.4 26/27, R1.5 42 | topology, impact graph, deterministic propagation/corridor services | 07 |
| 09 Thailand pack | 23–25, R1.1-3/6–11/23, scenarios A–C/G/S–U/AE–AG | Thailand provider adapters/fixtures/capability pack | 06–08 |
| 10 compound impacts | 21–24, R1.1-5–11/23C–F, R1.2 2/9, R1.3 15, R1.4 26/31, R1.5 40/43, R1.7 63 | flood/flash/coast/water quality/defense/roads/evacuation exposure | 08–09 |
| 11 global/regional capabilities | 26–30, R1.1-14, R1.2 4/9, R1.3 16/19/23, R1.4 33/36/45, R1.5 37/45, R1.7 66 | geographic registry, pack manifests, coverage projection | 06 |
| 12 localization/search | 31–34, R1.1-23, R1.2 4/6/9, R1.3 21, R1.5 44 | Thai/English copy, translation/provenance, gazetteer and local service adapters | 11 |
| 13 watches/API/MCP/Chat | 5–6, 13, 35–38, R1.2 5, R1.3 13/24, R1.7 64/70, R1.8.2–4 | watches, shared capability skills/tools, Chat bridge/actions | 02, 04–05, 11 |
| 14 privacy/federation | 8, 41, R1.2 7/9, R1.3 22–24, R1.4 32/36, R1.5 45/46, R1.6 57, R1.7 66/69/72 | geometry disclosure, federation grants, privacy retention/delete policy | 02, 06–08 |
| 15 offline/accessibility | R1.2 6, R1.3 16, R1.6 54, R1.7 65/70/71; L/AH/AN/AP | offline manifests/outbox, device state and map-equivalent accessible lists | 03, 11, 14 |
| 16 admin/provider operations | 42–45, R1.1-19/23B, R1.2 10, R1.4 33, R1.5 47, R1.6 56–58, R1.7 68 | admin configuration, rights/attribution/rotation, cost/metrics/health | 06, 11 |
| 17 governance/replay/recovery | 17–18, 39–40, 43–44, R1.1-17/18, R1.2 8/10/11/12, R1.3 14/24, R1.4 28/29/35, R1.5 38/41/48, R1.6 55/59/60, R1.7 67/68/72 | model registry, replay/rebuild, retention, DR, release/canary/load-shed | 06–10, 14, 16 |
| 18 integrated acceptance | 47–50, tests 1–513, scenarios A–AR, R1.8.5–6 | test matrix, browser evidence, operational final-gate checklist | 01–17 |

Every section file must contain (a) specific repo files/functions/contracts, (b) tests before implementation, (c) authorization/data-safety behaviors, (d) dependencies, (e) completion evidence and any external gate. UI sections include the complete UI/UX contract. Existing worktree is dirty: no broad staging, commits, resets or user-change overwrites.
