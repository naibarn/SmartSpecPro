# Owner Start and Revision 24 runtime verification

Source: `ae9d64ad1111cce5fd9f75b5a3d85d08b8e801ec`. Linux generation 119.
Structured receipts and evidence hashes: [verification record](spec224-start-and-public-runtime-20261026.json).

## Delivered

- Commits `017d6202` and `24614c3f` integrate session-bound Codex readiness,
  reserved authorization attempts, policy-based approval/budget binding and
  idempotent owner Start. Pending capability policy is not treated as denial.
  Only the required Codex adapter is evaluated. No policy, grant or credit is
  manufactured when configuration is missing.
- Commit `ae9d64ad` repairs a directly observed Revision 24 defect: published
  artifacts were available through the resolver but canonical document delivery
  still depended on private runtime preparation. Public documents now use an
  opaque CSP sandbox, no network access, no owner storage token and no caching.
  Visibility is checked on each new document request.
- Focused quick profile: 7 files / 176 tests passed; additional Final Verify
  and pre-promotion regression checks: 2 files / 30 tests passed. This includes
  V1 preservation after an injected pre-promotion failure and refusal of Final
  Verify without required evidence. These are unit contracts, not live Runner
  Final Verify. Available host memory was approximately 25 GiB; no OOM occurred.
- The existing release controller deployed frontend and backend from the same
  immutable build. Web and Node worker both report the exact source SHA;
  health returned 200, anonymous administration diagnostics returned 403.
- Chromium against `https://smartaihub.app` passed 2/2: disposable owner
  publish, anonymous mobile top-level rendering, owner unpublish, immediate
  anonymous denial, same-tenant non-owner and cross-tenant private denial;
  and a separate real Gateway request with provider usage. The synthetic app
  and app-scoped fixture artifacts were removed after testing. The existing
  Expense Tracker was not recreated, republished or modified.
- Existing authenticated navigation checks also passed 5/5 using broker test
  identities. Test sessions were revoked; screenshots and scrubbed traces are
  retained at the hashed paths in the structured record. The local Playwright
  cache's dangling symlink was repaired; no Orca sidecar was required.

## Precise live Windows state and continuation

Read-only development control-plane observation: existing `local-runner`,
owner user 1, tenant `tenant-ZCSKEM9s`, session
`6ddda9fe-0845-44af-9b9f-1e1cb11e1e62` has fresh heartbeats. Codex 0.161.0
is authenticated but task probe remains `not_run`; capability policies are
pending. The running process still reports 0.2.38 although the owner reports
0.2.39 installed. This does not establish an installer defect. No Runner
rebuild or reinstall was performed.

The registered workspace is `ws-smartspecpro-12883242a753`, source
`fbd7fd1bd8324973540664d7f7de2bd9e5844757`, with no content fingerprint.
The tenant currently has zero active SPEC-224 development policies and zero
active economic budgets. These are additional configuration prerequisites;
a successful probe alone is not a claim of dispatch authority. Existing
Python owner-authenticated development-policy provisioning and the existing
admin economic provisioning APIs remain the authority boundaries. No real
owner browser session was synthesized to call them.

Immediate owner action: in the already-installed Windows Runner, open
**Tools → Codex → ทดสอบสั่งงานจริง**. Expected evidence is a passed real task
probe published and acknowledged for the current enrolled session. Do not
reinstall merely because the server still observes the old process version.
Then use the existing scoped Start flow with the actual owner identity once
workspace/source and configured policy/budget prerequisites are satisfied.
Retain the same Start idempotency key for a pending run.

## Acceptance boundaries

- Revision 24 public document lifecycle and synthetic access matrix: PASS.
- Live Gateway browser request and scoped provider usage: PASS.
- Complete Mini-App Skill Execution/run/job-bound budget, credit, trace and
  settlement chain: still PARTIAL; the Gateway request is not that evidence.
- Real protected Windows DevelopmentRun, interruption/reconnect, usage and
  settlement, independent Final Verify: NOT TESTED; no live run/job IDs exist.
- The three previously closed narrow requirements remain supported by the
  current focused negative Final Verify / pre-promotion tests and the explicit
  separation of these acceptance records. Historical pilot receipts remain
  historical; no new owner browser trial or PostgreSQL acceptance is claimed.
- Closed Expense Tracker V1/V2 and generic Mini-App milestones remain closed.
  Overall normative SPEC-224 is not marked COMPLETED.
