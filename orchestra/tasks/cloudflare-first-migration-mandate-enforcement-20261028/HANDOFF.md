# FIRST_MIGRATION Mandate Enforcement — WorkUnit HandOff

Status: IN_PROGRESS — enrollment and production operations remain fail-closed.

Baseline at resume: `09e8dc1de3a9011fa8ca2bf0eb71ccde34dd8426` (`origin/main`; includes `8aa59c84`). Latest mandate checkpoint: `d3d23e0d6158c11fbb9d59640361745cd9d32fdb`. The last production serving evidence in the older Cloudflare handoff names g204; it has not been re-verified in this work unit. Production migration 0415 and SPEC-224 have separate dirty work/checkpoints and are out of scope; preserve them and do not edit their handoffs from this task.

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

Latest canonical checkpoint: `d3d23e0d6158c11fbb9d59640361745cd9d32fdb` (`main == origin/main`). The five production operations remain incomplete; the enforcement readiness gate remains false. Do not enroll the Owner mandate or claim production readiness from this quota correction.

No Owner enrollment, production release, provider write, traffic change, or unattended scheduler verification occurred in this work unit. Continue on canonical `main`; do not stage unrelated 0415, SPEC-224, Runner, local, UAT, or test-result files.
