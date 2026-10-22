# SPEC-310 G0/G1 Implementation Gap Review

**Earlier review source:** `origin/main` `5cb2d07f91fd5da7fd486c317760be199cf03336` plus the G0/G1 documentation/fixture delta; preserved as historical evidence from PR #1170/#1171.
**Continuation review source:** `origin/main` `a3d615c11b814db8d2d2529211a3b560e54d01a2` plus the SPEC-310 continuation proposal artifacts in registered worktree `spec310-reconcile-current-20261022`.
**Scope:** the first 10 passes below cover the earlier G0/G1 proposal only. A separate 10-pass review of the newly added crosswalk, owner packet, Pi trust research, neutral ports and offline fake follows. Neither review claims runtime, owner approval, live Gateway/credit, Runner acceptance, or production evidence.

| Pass | Evidence checked | Gap and immediate disposition | Result |
|---|---|---|---|
| 1 — Number ownership | `_config/spec-id-registry.json`, `_status/spec-id-registry.json`, `git ls-tree origin/main specs/feature/`, preserved primary checkout status | The original R1.3 observation and an old `claude-spec.md` sentence said 310 was free and 309 next-safe. Refreshed G0 and `claude-spec.md`: 310 is canonically occupied; local 309 remains unpublished and unreserved; left all local 309/310/311 material untouched. The source addendum and generated requirement digest remain preserved as historical inputs. | Resolved in refreshed supporting artifacts; no registry mutation. |
| 2 — Branch/PR/worktree ownership | `gh pr list`, `gh pr view 1161–1167`, `git ls-remote --heads origin`, `git worktree list --porcelain` | The old G0 omitted the two remote planning refs and treated the prior worktree set as current. Recorded the new implementation worktree, retained prior worktrees and current PR heads/status; refreshed section index; no WP branches reused. | Resolved in G0/section index; producer contract remains unavailable. |
| 3 — User/device/attempt identities | G1 intent/grant shapes and fixture `chat-scope-does-not-execute` / `runner-device-is-not-desktop-actor` | Checked that desktop actor, enrolled Runner device and per-attempt execution grant are separate references and cannot substitute for one another. | No remaining G1 artifact gap. |
| 4 — Chat scope and privilege | Explicit `llm:chat` denial in proposal and fixture `chat-scope-does-not-execute` | Verified that Chat LLM scope alone cannot create an execution or job side effect. The contract does not let SPEC-310 mint grants. | No remaining G1 artifact gap. |
| 5 — Runtime ownership | G1 boundary paragraph; repository `AGENTS.md`; `claude-plan.md` owner map | Reconciled managed Pi wording with the repository rule: Python OpenAI Agents API remains the agent-runtime authority; Pi stays subordinate; Orca is unnecessary. | Resolved in G1 proposal. |
| 6 — Gateway and economics | G1 Gateway grant/error rules; fixture `gateway-outage-has-no-direct-provider-fallback`; SPEC-207/280 owner row | Added a direct-provider-call negative fixture and the artifact-integrity rejection category after the fixture review exposed that missing error name. Real Gateway and settlement evidence remain external. | Artifact gap fixed; live proof remains pending. |
| 7 — Git-optional workload and ACL | Optional `workspaceRef` shape; fixtures for no-workspace report and filesystem denial | Verified Chat-first read-only/report work can request admission without Git, while workspace-less filesystem/repository access is denied. | No remaining G1 artifact gap. |
| 8 — Admission, replay and recovery | Idempotency fixtures, attempt/fence bindings, cancellation result states | The first result shape used an ambiguous `terminal` value. Replaced it with `cancel_observed` and `indeterminate`; cancellation intent alone remains nonterminal. | Artifact gap fixed in G1 proposal. |
| 9 — Compatibility and dispatch gate | Version/replay fixtures; PR #1161 state/head/checks; section 05 prerequisites | Verified unknown major versions fail closed. #1161 is still open, read-only and currently has failed `local-contract` checks, so it cannot satisfy the stable approved ingress gate. | G1 proposal is reviewable; section 05 stays `WAITING_STABLE_APPROVED_RUNNER_CHAT_CONTRACT`. |
| 10 — Acceptance, original source and production | R1.0 source search result recorded in G0; sections 03–06 prerequisites; SPEC-224/271 and production gate | No canonical R1.0 A01–A20 source or real Native Gateway/credit/execution/acceptance receipts are present. Recorded these as unresolved evidence gates; production stays disabled and SPEC-224 E2E retains priority. | Not a G0/G1 artifact defect; later implementation/acceptance remains incomplete. |

## Disposition

The ten scoped review passes found and immediately repaired stale G0 ownership evidence, stale plan/section status, a missing fixture error category, and ambiguous cancellation result semantics. The resulting G0/G1 documentation artifacts are internally consistent at the reviewed base. G1 is still `PROPOSED_NOT_APPROVED`: owner review, original R1.0 source reconciliation, Pi provenance/ABI, isolated Gateway authority and all live acceptance evidence are outstanding. Therefore sections 03–06 are not represented as implemented or passed; execute only when their recorded prerequisites are available, and continue to preserve the section 05 dispatch gate.

## Continuation review — 10 evidence-backed passes

These are separate review passes over the new source crosswalk, owner decision
packet, Pi trust report, version-neutral ports and offline-only fake. After a
finding, the artifact was repaired or the remaining external evidence gap was
made explicit before the final focused test run.

| Pass | Evidence inspected | Finding | Immediate repair / disposition |
|---|---|---|---|
| 1 — R1.0 source fidelity | Scanned canonical SPEC-310 tree, four prior SPEC-310 worktrees, mounted attachment locations; `acceptance-crosswalk.json` A01–A20 rows | Original A01–A20 excerpt is unavailable in the scanned sources. The cumulative Spec only states that the original source is elsewhere. | Crosswalk gives A01–A20 `SOURCE_TEXT_UNAVAILABLE`, null text and no inferred ledger mapping. Kept the source as a required recovery item; no source content was fabricated. |
| 2 — Acceptance/ledger coverage | `contracts/build_acceptance_crosswalk.py`, generated JSON/Markdown, `test_acceptance_crosswalk.py`, canonical `requirement-ledger.json` | Initial review confirmed the output needs to preserve every canonical row and digest, not only the acceptance-table entries. | Generator now includes all 101 exact ledger texts, digests, authority refs, exact source lines when available, parsed A references and unchanged OPEN/UNVERIFIED state. Tests assert 68 criterion slots, 101 ledger entries, 48 exact A21–A68 row mappings and zero passes. |
| 3 — Owner decision separability | `owner-review-packet-g1.md`, refreshed G0/PR heads, G1 proposed shapes | A broad G1 ACK could be read as authority to execute, and #1161 could be mistaken for a Native-work producer. | Split the seven owner domains; named #1161's exact open head as observation-only/ineligible; recorded consumer implementation SHA `NONE`; added explicit no-execution/no-production effect for any ACK. |
| 4 — Identity, device and fence | Offline fixture JSON, `offline_contract_fake.py`, unit tests | The first added fixture set did not isolate device/fence/workspace mismatches from other rejection paths. | Added separate wrong-fence, wrong-device and wrong-workspace negative fixtures; fake returns DENY with no side effects. Re-ran all 18 fixture and boundary cases. |
| 5 — Canonical command/job authority | `native-harness-ports.proposal.md`, owner packet, G1 retry/idempotency cases | An adapter description could imply it creates its own task authority. | Ports delegate admission/status to existing SPEC-195/279 and `worker_jobs`/outbox. The fake has no create/dispatch method and unknown fixture shapes return `FIXTURE_ONLY_NO_ADMISSION`. |
| 6 — Workspace/artifact ACL and Git-optional flow | G1 no-workspace cases, ports proposal, workspace mismatch fixture | Optional Git must not accidentally mean implicit local filesystem authority. | Kept workspace refs opaque and optional only for allowed non-filesystem work; no-workspace filesystem case and mismatched workspace grant both reject. Read-only report result explicitly remains `REQUIRES_CANONICAL_POLICY_ADMISSION`. |
| 7 — Gateway and credit | `openai_agents_gateway_model.py`, Gateway routes, G1 direct-provider fixture, fake tests | `/v1/responses` family overlap alone does not prove Native Pi Gateway compatibility or settlement. | Report labels this API-family overlap only; direct provider fallback returns zero provider calls; live auth, usage and settlement remain pending. No credentials or model request were used. |
| 8 — Pi provenance and supply chain | Exact GitHub v1.0.3 release/tag/asset; npm package/tarball; npm provenance bundle; `npm audit signatures`; release workflow | npm package is attestable, but that provenance does not cover the standalone Windows binary; release tag is unsigned and no SBOM was present. | Research separates verified npm provenance from the unverified/unsigned binary; adds full closure SBOM/signing/provenance to the section 03 gate. Downloaded artifacts were statically inspected only; no runtime was executed. |
| 9 — Windows/runtime and Gateway adapter boundary | npm `engines`, Windows ZIP digest/PE header/entries, upstream Windows guide and binary CI run; Pi custom-provider docs; SmartAIHub Gateway adapter | Node package requires `>=22.19.0`; standalone Win x64 image is AMD64 and includes `.node`/WASM; upstream shell defaults do not meet the governed tool boundary. The Pi provider extension may inspect credentials and prompts. | Research now requires certified private Node/runtime, suppressing unrestricted Pi tools and never storing desktop/execution credentials in Pi auth storage. Upstream smoke and API-family compatibility are not treated as SmartAIHub acceptance. |
| 10 — Handoff, noninterference and acceptance honesty | Refreshed G0, PR #1161 check results, generated STATUS, deep-implement HANDOFF, `spec_handoff validate` | Historical SHA/next action and producer contract status were stale; documentation must not close acceptance. | Refreshed G0 at `a3d615c...`, updated canonical continuation/handoff projection and sections 03–06 blockers, preserved flag-off and SPEC-224 E2E priority. Handoff validates with `completion_eligible=false`; all 101 ledger rows stay OPEN. |

### Continuation pass result

Focused command:

```text
python3 -m unittest discover -s specs/feature/310-smartaihub-native-agent-harness-governed-pi-runtime-lifecycle/contracts -p 'test_*.py' -v
Ran 5 tests — OK (18 proposal fixtures and boundary decisions; crosswalk 68/101 assertions)
```

`git diff --check` passed. `python3 -m tools.spec_handoff --repo . validate
--spec-dir specs/feature/310-smartaihub-native-agent-harness-governed-pi-runtime-lifecycle`
returned `valid=true`, `completion_eligible=false`, with all 101 requirements
still OPEN. These passes verify only the offline artifacts and do not authorize
or pass any live section.
