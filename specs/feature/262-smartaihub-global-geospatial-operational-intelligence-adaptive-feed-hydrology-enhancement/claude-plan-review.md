# Spec 262 deep-plan review ledger

Self-review protocol: deep-plan Phase A checklist + adversarial review, max five rounds. Findings are fixed in the plan/artifacts before advancing.

## Round 1 — completeness and adversarial review

### Structural integrity

- **Initial gap:** The plan claimed all 513 acceptance tests would be mapped, but no per-ID traceability artifact existed.
- **Fix:** Added `claude-acceptance-traceability.md` with all 513 unique IDs and source text, verified range 1–513 with no missing IDs. Added `claude-requirement-traceability.md` with 496 Markdown headings and 44 scenarios mapped to section files.
- **Result:** PASS for traceability existence; section owners must validate semantic mapping during implementation.

### Completeness vs active spec

- Confirmed R1.0 base headings, R1.1–R1.8 revisions, acceptance 1–513 and scenarios A–AR have plan allocations. Latest R1.8 takes precedence on shared route/chat/job/migration ownership.
- **Remaining planned evidence:** all 18 self-contained section files and final section/UI-contract check are pending; planning stage remains open.

### Implementability

- Plan identifies existing route manifest, EmergencyPublicMap, EmergencyRoutePage, FeedbackButton/ChatView, source/capture/claim, worker_jobs/outbox, schema/journal and Cloudflare proxy boundaries.
- DB migrations and shared contract changes are explicitly conductor-serial. External provider licensing/credentials, production database, Cloudflare account/tunnel and model calibration are typed final gates.
- No `TODO`/`TBD` remains in plan. Some sections will refine exact current files after the baseline regression and schema audit.

### Internal consistency

- Linux and Cloudflare are both supported through shared contracts; Cloudflare remains transport proxy in current architecture; mode detection is trusted server-side.
- Existing Chat is reused; no new chat page/thread/task authority.
- Existing Spec260 remains canonical and in progress; Spec262 slices wait only for specific dependent contracts.
- New async work uses canonical worker_jobs/outbox; no retired system or duplicate queue.

### Edge cases / failure modes

- Plan includes provider outage/schema drift, stale/missing data, SSRF/oversized input, race/lease/idempotency, public disclosure, source rights, model validity, offline conflict, migration rollback, Cloudflare proxy and map worker failure evidence.
- **Result:** PASS for plan-level failure classes; detailed tests remain in `claude-plan-tdd.md` and section artifacts.

**Round 1 verdict:** NEEDS SECTION ARTIFACT COMPLETION before planning can close. No unresolved product decision found. No implementation starts until section index is complete and the artifacts pass checkers.

## Round 2 — semantic acceptance ownership

- **Finding:** The initial keyword-derived acceptance map assigned 117/513 IDs to Section 18, despite that section being release evidence rather than the owner of most domain behavior.
- **Independent audit:** A read-only section audit confirmed only IDs 60 (integrated scenario) and 436 (release conformance corpus) are primarily owned by Section 18. It identified map/provider, feed, source, hydro, exposure, localization, watch/chat, privacy, offline, admin and governance remaps.
- **Fix:** Remapped the domain assertions to Sections 01–17, retained Section 18 as cross-cutting evidence in the evidence expectation, corrected Scenario I/K/M/N/O/S/T/W/X/AF/AG/AK/AO/AQ and heading lines 143/661/757/10118/10126.
- **Verification:** All 513 IDs remain unique/continuous; only IDs 60 and 436 map primarily to 18. Section 18 remains integrated evidence owner, not a catch-all implementation owner.
- **Result:** PASS.

## Round 3 — UI and accessibility contract

- **Finding:** Exact-contract checker initially found incomplete or mis-capitalized contracts for map, feed, source, hydro, graph and evidence sections; graph/provider writer docs also omitted the required JTBD heading.
- **Fix:** Completed the UI contracts for public map, adaptive feed and feed semantics; added explicit “not a UI owner” contracts to backend/evidence sections and added JTBD headings to Sections 08–11.
- **Verification:** `python3 /home/dev/.codex/skills/deep-plan/scripts/checks/check-ui-contracts.py --planning-dir <Spec262-dir> --json` returned `ok: true`, 18/18 checked, no failures.
- **Result:** PASS.

## Round 4 — architecture, security and data safety

- Confirmed shared Spec260 route manifest, public projection/auth boundary and existing Chat authority remain canonical; Chat actions reauthorize and never auto-send.
- Confirmed all long work routes through `worker_jobs` + transactional outbox; no duplicate event, queue or authority is planned. Schema/journal/shared-contract changes are conductor-serial.
- Confirmed provider rights, provenance, tenant/federation isolation, geometry generalization, retention/legal holds and simulation separation have owning sections and failure tests.
- Confirmed Linux and Cloudflare are supported as shared-contract ingress modes; Cloudflare remains transport to the platform service, not a second data/job authority.
- **Result:** PASS; production credentials, Cloudflare deployment, applied migrations and model calibration remain explicit final external gates.

## Round 5 — section dependencies and release evidence

- Verified all 18 manifest names resolve to a section file; dependencies are ordered shared-contract → feed/source → hydro/compound → regional/actions/privacy → offline/operations/governance → integrated evidence.
- Verified each section contains tests-first coverage, ownership paths, safety boundary, dependencies and completion evidence; UI checker confirms required contract headings.
- Verified TDD plan distinguishes focused local suites, browser/build evidence and external real-environment evidence; `npm run typecheck` is excluded by repo policy.
- **Result:** PASS. Planning artifacts are ready for deep-implement; this does not claim any implementation is complete.
