# SpecR10 canonical Spec sync — 2026-10-06

## Source and baseline

- Refreshed canonical source: `origin/main` at `32e70459f1b0e330b251f4d52b4771a4d7470509` before this candidate import.
- Source archive: `/home/dev/.codex/attachments/0ec04286-9c00-4a43-b386-493a0527b7cf/SpecR10.zip`.
- Archive SHA-256: `4594567f4b7561e2cc50e7f0519b93d95cf4a5b57f99ac625deabe94ef482045`.
- ZIP CRC validation passed. Every member path was checked for absolute paths, traversal, backslashes, and unsafe destinations before extraction. Source `spec.md`/DOCX payloads were copied byte-for-byte where promoted.
- Spec 288 R1.4 contains source trailing spaces used as Markdown hard breaks and diagram spacing. They were preserved byte-for-byte; `git diff --check` reports these source whitespace lines only, so the imported normative source was not reformatted.
- Work was performed in an isolated clean worktree. The dirty primary checkout and other worktrees were not changed.

## Candidate dispositions

| ID | Archive candidate | Baseline canonical | Decision | Final canonical path / revision | Validation and provenance |
|---|---|---|---|---|---|
| 287 | Unified UI Governance, Rendering Conformance, Mini App Design Contract | Same path, R1.3 | `SEMANTICALLY_IDENTICAL` | `specs/feature/287-Unified-UI-Governance-Rendering-Conformance-MiniApp-Design-Contract/spec.md` R1.3 | Archive and canonical SHA-256 both `d35836f364148c2174cb0c74b260c71cbc8e091408f5645a960f628b10bf6ba4`; no duplicate copy added. |
| 288 | Resource Fabric and Portable Application Backend Contract, R1.4 / 100-Pass Hardened | Same identity, R1.2 | `CANDIDATE_NEWER` | `specs/feature/288-SmartAIHub-Resource-Fabric-Portable-Application-Backend-Contract/spec.md` R1.4 | R1.4 Markdown SHA-256 `8062f7ea24fd504d2966e7f4e222ecae506826a1ff5725eba4c585f9f136d94b`; source DOCX SHA-256 `2d8fddf428d832aff7aeafea8e3b540efb680ca3cde04de49cb701d6a6ad98ba`. Previous R1.2 Markdown and DOCX were preserved under `history/R1.2/`; `provenance.json` records both revisions. Handoff was reconciled to R1.4 with 341 extracted requirements. |
| 289 | Adaptive Capability Routing, Backend Health, Agent-Reach Integration R1.3 | No canonical Spec 289 | `MISSING_CANONICAL` | `specs/feature/289-Adaptive-Capability-Routing-Backend-Health-Agent-Reach-Integration/spec.md` R1.3 | Imported byte-for-byte; SHA-256 `07459d7363d7186cf55eaa9dd30e373dd1a344ea615aa99880b0fc7507510434`; Handoff has 81 extracted requirements. |
| 290 | Longdo Map Migration, Google Maps Decommission R1.1 | Same path, R1.1 | `SEMANTICALLY_IDENTICAL` | `specs/feature/290-Longdo-Map-Migration-Google-Maps-Decommission/spec.md` R1.1 | Archive and canonical SHA-256 both `7af8a52767e65f767352ecfcd4007ccc537b78f3c4883442265d1204c928e6e4`; no duplicate copy added. |
| 291 | Local Agentic Model Runtime, Capability Resolution R1.0 | Same path, R1.0 | `SEMANTICALLY_IDENTICAL` | `specs/feature/291-Local-Agentic-Model-Runtime-Capability-Resolution/spec.md` R1.0 | Archive and canonical SHA-256 both `2644ef4760166af90d8f6efa8478c1ac8ae859427a690c32a0763d1303a026de`; no duplicate copy added. |
| 292 | Adaptive Work Context candidate, original Spec 282 draft | Canonical Spec 292 exists with `previous_draft_id=282` provenance | `HISTORICAL_COPY` | `specs/feature/292-adaptive-work-context-organizational-collaboration-federated-exchange-r1-0/spec.md` R1.0 remains canonical | Archive SHA-256 `5c82aa08ce1887544d7172b0f4be4f2d272f90152101d0dae7b8be06121492a6` matches the recorded original draft hash. Current canonical SHA-256 is `11b4baccbd9401f1d80a8a134041c455b8eb63dedd1767515fa261be7e8085a4`; kept the canonical identity/provenance rewrite and did not create a second Spec 292. |
| 293 | Unified Git Workspace and Repository Federation R1.4 | No canonical Spec 293 | `MISSING_CANONICAL` | `specs/feature/293-SmartAIHub-Unified-Git-Workspace-Repository-Federation/spec.md` R1.4 | Imported byte-for-byte; SHA-256 `3881a488aeafd4b3cc851aedc6e678dc5ea977fe11fb5e4153dba6e825320f5a`; Handoff has 228 extracted requirements. |
| 294 | Development Mission Control and Conversational Project Operations R1.7 | No canonical Spec 294 | `MISSING_CANONICAL` | `specs/feature/294-SmartAIHub-Development-Mission-Control-Conversational-Project-Ops-Multi-GitHub/spec.md` R1.7 | Imported byte-for-byte; SHA-256 `d09d97058d4c9134b2001509b910af67b16d87b9b2cdd4d0d1b31c33c241d298`; Handoff has 488 extracted requirements. |
| 295 | Production Release, Deployment, Runtime, Data Migration Operations R1.2 | No canonical Spec 295 | `MISSING_CANONICAL` | `specs/feature/295-SmartAIHub-Production-Release-Deployment-Runtime-Data-Migration-Operations/spec.md` R1.2 | Imported byte-for-byte; SHA-256 `bb1ca0046957653609a9af95230551ce546f1da2c775bae50f95d2bc79fc82a5`; Handoff has 161 extracted requirements. |

## Inventory, ID allocation, and checks

- Canonical inventory before: 303 Specs / 459 indexed records / 300 relationship candidate edges.
- Canonical inventory after extraction and handoff reconciliation: 307 Specs / 463 indexed records / 302 relationship candidate edges.
- Exactly one canonical feature Spec was discovered for each ID 287–295. None has duplicate-ID or duplicate-revision relationships in the refreshed inventory.
- IDs 293, 294, and 295 are now occupied by these imported canonical Specs. Any earlier tentative proposal to allocate those IDs to displaced duplicate-ID candidates is superseded; no displaced candidate was renumbered or assigned an ID in this task.
- No authoritative alias/renumber registry or global next-ID allocator is present in the current shared inventory tooling. The next-safe ID is therefore intentionally not asserted; refresh the full occupied, reserved, historical, and alias set immediately before any future renumber write.
- Candidate edges involving the new Specs are projections only. The two newly discovered edge candidates reference Spec 294 to Specs 228 and 238 at LOW confidence; they are not an authority or dependency decision.
- `python3 -m tools.spec_handoff index --check`: PASS; 463 indexed records, 307 canonical Specs, no drift.
- `python3 -m tools.spec_handoff validate --all`: PASS; complete inventory walk, no missing Handoffs, no invalid manifests, and generated status/index equality.
- No application build or runtime behavior was changed or claimed by this specification import.
- Repository-wide duplicate-ID authority review, allocator/alias design, and canonical Handoff migration remain open.

## Integration evidence

- PR [#76](https://github.com/naibarn/SmartSpecPro/pull/76) merged at `2026-10-06T09:36:21Z` into `refs/heads/main` as `5a389545896d9152f23749d3fc1710d6c80f3a43`.
- Source implementation commit `8e3a449d3172cadd34a2239741537a229f17c88c` is an ancestor of that merge commit. The clean local `main` checkout was fast-forwarded to the same SHA and matched `origin/main`.
- Canonical Handoff integration fields for Specs 288, 289, 293, 294, and 295 now reference the exact integration SHA and timestamp above. Their Handoff evidence remains distinct from implementation verification or production acceptance.
- Post-integration `python3 -m tools.spec_handoff index --check`: PASS; 463 indexed records, 307 canonical Specs, no drift. `python3 -m tools.spec_handoff validate --all`: PASS; complete walk, no missing Handoffs or invalid manifests.
