# FIRST_MIGRATION Mandate Enforcement — WorkUnit HandOff

Status: IN_PROGRESS — enrollment and production operations remain fail-closed.

Baseline at resume: `09e8dc1de3a9011fa8ca2bf0eb71ccde34dd8426` (`origin/main`; includes `8aa59c84`). Mandate code checkpoint: `d3d23e0d6158c11fbb9d59640361745cd9d32fdb`; latest verified canonical main including this handoff update: `27a6919fb845a1add1d6e0b30eda3705536504b7`. The last production serving evidence in the older Cloudflare handoff names g204; it has not been re-verified in this work unit. Production migration 0415 and SPEC-224 have separate dirty work/checkpoints and are out of scope; preserve them and do not edit their handoffs from this task.

## Completed in this work unit

- Integrated checkpoint `60e898b99d767dcaaf06fff3a6b3402aeea9b4ee` makes the Approval API reject full/partial mandate enrollment and operation grants unless the relevant server-side action enforcement exists. At present only `synthetic_credit_billing` and `synthetic_queue_recovery` are marked enforced. `FULL_MANDATE_ADMISSION_ENFORCEMENT_READY` remains false.
- Production Worker deployment executor/admission has a mandate-grant adapter draft for canary, but it is not ready to enable: its operation digest still needs an Owner-reviewed immutable plan binding; deploy, config rotation, promotion/native activation and rollback wiring are incomplete.
- This checkpoint makes mandate and Worker Canary plan digests use canonical sorted-key JSON and compares reviewed envelopes canonically, eliminating property-order-only digest mismatches. Regression test proves nested property order does not change the digest.
- Focused Web Vitest: 3 files / 20 tests passed (mandate contract, Worker canary admission, production deployment executor). Python mandate tests at the prior checkpoint: 17 passed. `git diff --check` passes.
- Integrated checkpoint `d3d23e0d6158c11fbb9d59640361745cd9d32fdb` raises the reviewed Worker deployment quota from 2 to 8. Current operation reservations total four Worker deployments before recovery; the additional four are reserved for one bounded recovery pass. The TypeScript envelope schema, Python API schema, Python persistence validator, and fixtures agree. No monetary spend cap is implied. Focused Web Vitest: 3 files / 21 tests passed; Python mandate tests: 17 passed with `DEBUG=false ... --no-cov`; `git diff --check` passes.

## Exact remaining implementation

1. Bind immutable reviewed operation plan identities to the mandate (artifact/source SHA, configuration revision policy, exact Worker/version and traffic rollout, rollback baseline); ensure operation grant issuance accepts only the current plan digest or a compatible authorized config revision.
2. Wire and test mandate grants, resource quota reservations, executor revalidation and canonical receipts for `rotate_origin_configuration`, `deploy_worker`, `worker_canary`, `native_runtime_activation`, and `rollback`.
3. Ensure retries, cancellation, compensation and rollback remain lease-fenced and idempotent; reconcile actual usage against reserved budget without resetting prior usage.
4. Separate mission enrollment eligibility from live operation prerequisites while keeping both Web readiness and backend enrollment disabled until all seven actions are actually enforced.
5. Run adversarial Python/Web integration tests. Do not enable the readiness gate until all seven actions pass.
6. Deploy only through the existing production release process after complete enforcement; verify deployed SHA and authenticated Owner API/UI without enrolling or mutating Cloudflare traffic.

Latest canonical baseline at this continuation: `b4dd79f35798aed8179f361b1ac67f95cf800036` (`main == origin/main`, includes mandate checkpoints `16c77d1` and `17e4bcf`). Production serving SHA and the older g204 claim have not been re-verified in this work unit.

## Continuation checkpoint (2026-10-28)

- Split enrollment inventory completeness from Queue consumer health: enrollment still requires complete identity reads for Queue/DLQ, VPC, Hyperdrive, Tunnel and route, but an unhealthy/unavailable Queue consumer is now left to operation preflight instead of blocking Owner authorization of the repair mission.
- Added regression coverage for complete resource identity with incomplete consumer readback, plus incomplete Queue/VPC/Hyperdrive/Tunnel/route identity cases. A missing Queue array is rejected.
- Corrected the backend-owned `worker_canary` provider-write reservation from 1 to 2 because the existing path performs immutable version upload and canary deployment as distinct writes. The web grant issuer and Python Approval Service now agree; added a focused Python assertion.
- Replaced the frontend's literal `FULL_MANDATE_ADMISSION_ENFORCEMENT_READY=false` check with a read of the Approval Service's current enforced-action set. The backend capability endpoint reports the same action set used by mandate enrollment/grant enforcement; read failure is a blocker and an incomplete set stays blocked. Current backend coverage truthfully reports only the two synthetic actions.
- Integrated safe partial correction: `16c77d154610f0728374b63816853409746e7b53` on `origin/main`.
- Follow-up focused verification: Web Vitest 4 files / 29 tests passed; Python mandate tests 19 passed with `DEBUG=false python-backend/.venv/bin/pytest ... --no-cov`; `git diff --check` and scoped Python compile passed. No repository-wide typecheck/build was run.
- Integrated runtime enforcement coverage readback: `17e4bcfc23daa6988bb1aba330c35f31cd0f940c` on `origin/main`. The UI no longer trusts a local literal flag; it queries the same Approval Service action set that gates issuance. Current coverage remains only the two synthetic actions.
- Current worker-canary hardening: canonical job input carries the exact operation plan (excluding UI/readiness metadata); the executor recomputes its canonical digest, checks plan-to-job artifact/config/route/rollback bindings, and verifies Queue/DLQ IDs against the mandate grant before obtaining provider credentials. The preflight requires the exact Queue/DLQ IDs. The canary reservation is two provider writes (immutable version upload + canary deployment). Focused Web Vitest: 4 files / 23 tests passed; `git diff --check` passed. Pending integration at this checkpoint.
- Code inspection confirms current operational gaps: only `queueProductionWorkerCanary` admits a production deployment job; there is no production origin-rotation job adapter, no promotion admission for the executor's `promote` stage, no mandate native-runtime activation job, and no independent mandate rollback admission. Mandate quota reservations are still accumulated from grant records without verified settlement/release. None of those operations is marked enforced.
- These are partial safety corrections only. They do not implement complete operation-plan binding, budget settlement/release, operation grant enforcement, receipts, cancellation/compensation or executor integration for all five operations. `FULL_MANDATE_ADMISSION_ENFORCEMENT_READY` remains false. No deployment, Owner enrollment, Cloudflare mutation, or scheduler verification occurred.

## Next execution actions

1. Finish canary plan-binding review/tests, integrate only the scoped mandate changes, and reconcile the resulting canonical SHA.
2. Complete the missing origin-rotation, deploy/promotion, native-runtime activation and rollback admission/executor/receipt paths, including quota settlement from verified canonical receipts, cancellation/retry, compensation and revocation.
3. Add the remaining enforced actions only as each operation's complete path is implemented and verified; keep the API-derived readiness gate closed until all seven are present.
4. Re-run adversarial focused and integration tests, then deployment/API/UI verification. Do not enroll or mutate traffic in this work unit.

The five production operations remain incomplete; the enforcement readiness gate remains false. Do not enroll the Owner mandate or claim production readiness.

No Owner enrollment, production release, provider write, traffic change, or unattended scheduler verification occurred in this work unit. Continue on canonical `main`; do not stage unrelated 0415, SPEC-224, Runner, local, UAT, or test-result files.
