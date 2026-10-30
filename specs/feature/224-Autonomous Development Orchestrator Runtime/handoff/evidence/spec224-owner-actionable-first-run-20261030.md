# SPEC-224 Owner-Actionable First Run — Implementation and Dev Release Evidence

- Canonical source: `e01fb1395ae3b53c7b9a030d9375b550ea6f43c4`
- Focused verification: 3 Vitest files, 93/93 tests passed (First Run workspace UI, SPEC-226 Development Control projection, Goal Grant payload).
- Development release: `DEV_RELEASE_VERIFIED`, `smartspec-dev-web.service` via `smartspec-dev-tunnel.service`, `aimarkethubs.com:3100`.
- Immutable artifact digest: `sha256:716174b80c72bf99e7a5893ccf3d31ef3e2c3e41eaa371248f00ac59e394eb00`.
- Public asset proof: `https://aimarkethubs.com/assets/index-G_TSQ5e5.js` returned 200 and SHA-256 `a97dcefd15082f5a783a8d1e940f94c3e4da0d9b457d953cba56762503481fe6`, matching the artifact.
- Runtime: source revision `e01fb1395ae3b53c7b9a030d9375b550ea6f43c4-dirty`; the serving checkout's two changed backend files owned by this task byte-match canonical source. The dirty suffix reflects unrelated pre-existing working-tree changes.
- Production preservation: release pointer remains generation 251; production web/worker fingerprint before and after deployment is identical (`f1aed6fad0627b16ccfd2552a65eb5a65083424aa0515687a2b575116822e75b`).

## Implemented activation path

The Admin First Run review shows the selected Project, Runner, Workspace, live-discovered Harness and Model, exact `apps/runner-app/tests/spec224-live-pilot/**` write scope, budget cap, both child phases, and expected independent verification. Start uses the existing durable DevelopmentRun and Approval Authority request path. After Start, the durable Run ID and Approval Request ID remain visible.

Recovery now identifies First Run records from their persisted exact write scope rather than treating every DevelopmentRun in a Workspace as a pilot. The panel queries up to 100 recent workspace runs, suppresses duplicate Goal creation when the same Pilot is already persisted, and uses the original conversation/thread and Job identity in Chat, Task Control, and Mission Control links. Resume targets the original conversation and existing Run.

A pending Goal can be approved in the panel only when the authenticated account's existing Approval Authority pending queue returns that exact request. Approval and rejection go through the existing decision endpoint. The Approval Authority forbids requester self-approval; the initiating account therefore sees that a different authorized Admin must decide and receives a link to the Dashboard approval queue. The Dashboard card now exposes the real project, runner, harness, workspace, model, write scope and budget before that decision.

## Owner access and remaining live evidence

Open `https://aimarkethubs.com/chat` using an authenticated Admin account and choose **ทดสอบการทำงานจริง**. Review the bounded Goal, run readiness/plan review, then choose **ส่ง Goal เพื่ออนุมัติและเริ่ม Pilot**. This creates the real durable Goal/DevelopmentRun and Approval Authority request. An authorized Admin other than the requester must approve it. The same Pilot entry can then recover the persisted Run; it does not create a duplicate.

No authenticated owner browser session was available in this implementation session. No Goal or Approval was created on the owner's behalf. Therefore actual authenticated visibility, owner Start, independent approval, Runner dispatch, Child 1/2 receipts, settlement, and Independent Final Verify remain unverified. SPEC-224 live acceptance remains `LIVE_GOAL_PENDING`.
