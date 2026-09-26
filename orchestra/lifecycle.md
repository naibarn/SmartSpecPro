# Orchestra Lifecycle — Spec 214

Goal: complete Spec 214 deep-plan and all implementation sections, close local gaps, and compare implementation directly with the spec through at least 10 evidence-backed audit rounds.

Scope/risk: large/high. Current stage: COMPLETE_LOCAL. Resume from: EXTERNAL_VERIFY only when the required provider/production environment is available.
Overall state: COMPLETE_LOCAL; EXTERNAL_AND_CROSS_SPEC_EVIDENCE_PENDING.

| Stage | Status | Evidence | Next action |
|---|---|---|---|
| PLANNING | COMPLETE | `claude-spec.md`, research, interview, plan, TDD plan, 8 sections; plan validators pass | None |
| TDD_DESIGN | COMPLETE | `orchestra/test-design.md`; focused regression tests for all implementation sections | None |
| IMPLEMENT | COMPLETE | All sections 01–08 implemented and documented; deep-implement state records complete, uncommitted | None |
| VERIFY | COMPLETE | Focused Vitest: 10 files / 64 tests; section and UI validators pass 8/8; corpus hashes and Appendix A verified | None |
| DEBUG_FIX | COMPLETE | Three independent reviews integrated; no local code gaps remain | None |
| REVIEW | COMPLETE | 11 prior convergence rounds plus 11 direct spec-to-implementation audit rounds in `orchestra/review-findings.md` | None |
| FINAL_VERIFY | COMPLETE_LOCAL | Focused Spec 214 tests, including 16-type compiler conformance and direct spec gap repairs, pass; repo-wide typecheck skipped by AGENTS policy | External and cross-spec evidence only |

## Gap ledger
| Gap | Classification | Earliest stage | Status | Resume |
|---|---|---|---|---|
| Unsupported deep-plan section-index format | MUST_FIX | PLANNING | CLOSED | None |
| UI contract validator requires explicit N/A fields | MUST_FIX | PLANNING | CLOSED | None |
| Extension registration admission bypass | MUST_FIX | IMPLEMENT | CLOSED | None |
| Manifest declaration/enum/schema completeness | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Malformed derived port acceptance | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Runtime state in binding constraints / uncovered keys | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Instance preset, binding, and presentation validation | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Unbounded core node config schemas | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Missing resolver identity/stable derived IDs | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| AI Builder search omitted retrieval summary | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Extension provenance/evidence declaration | LOCAL_CODE | IMPLEMENT | CLOSED_WITH_SIGNATURE_BOUNDARY | None |
| Placeholder binding/client readiness/required inputs | LOCAL_CODE | IMPLEMENT | CLOSED_WITH_UNVERIFIED_DRAFT_BOUNDARY | None |
| Open binding source union and missing config source | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Compiler did not consume projected derived ports | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Scope/policy/instrumentation validation gaps | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Studio output/source topology and input field loss | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| R20 Appendix A equality / corpus identities / profile links / hashes | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Generic default port schemas did not meet Spec 214 strongly typed minimums | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Human input/approval manifests lacked device-neutral interaction capabilities | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Retrieval node lacked Revision 6 typed intent/evidence/degradation contract and local guard tests | LOCAL_CODE | IMPLEMENT | CLOSED | None |
| Appendix A names were not all individually tested against exact registry lookup | LOCAL_CODE | VERIFY | CLOSED | None |
| Authenticated 5,860 Builder generations, execution, gap attribution, and independent grading | EXTERNAL_GATE | VERIFY | OPEN | VERIFY |
| Spec 215 trusted descriptor/binding resolution, runtime policy/security revalidation, and execution adapters | CROSS_SPEC_GATE | VERIFY | OPEN | VERIFY |
| Spec 229 Retrieval Broker integration, exact-identifier lane, production ACL enforcement, provider-invariance and degraded-result E2E | CROSS_SPEC_GATE | VERIFY | OPEN | VERIFY |
| Spec 225/226 cross-client initiation and interaction-surface selection | CROSS_SPEC_GATE | VERIFY | OPEN | VERIFY |
| Production workflow inventory, clean-slate runtime cutover, CI scan, and migration rollback evidence | EXTERNAL_GATE | VERIFY | OPEN | VERIFY |

Extension package trust fields are validated as declarations; this implementation does not verify third-party package signatures. Builder output remains draft until a trusted runtime resolver verifies concrete bindings. Retrieval output shapes and ACL-denied rejection are contract tests, not proof of Spec 229 production ACL enforcement. No production inventory, destructive migration, live provider generation, cross-client runtime proof, or deployment was performed.
