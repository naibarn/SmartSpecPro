# SPEC-224 owner Goal observation

- Observed: 2026-10-30 08:18 UTC (15:18 Asia/Bangkok).
- Status remains `FEATURE_DEPLOYED / LIVE_GOAL_PENDING`.
- Current development release observed: `smartspec-web-4f0b3d77e1be3eec45e2625c9f6c12134709065d-f5030c772c66`, generation 250, source `4f0b3d77e1be3eec45e2625c9f6c12134709065d`. This release appeared after the prior generation-249 checkpoint; no deployment action was performed during this observation. Current canonical main is `8f1e9b30dec7d48db279a118fc48454fb41e811c`, whose checkpoint delta is handoff evidence only.

## Runtime probe

- Read-only release status: runtime target available and matches generation 250. `smartspec-web.service` is active on port 3000; `smartspec-dev-tunnel.service` is active with ingress to port 3000.
- `GET https://aimarkethubs.com/chat` returned HTTP 200 and serves the generation-250 hashed build (`/assets/index-B0eONbqh.js`), not a Vite entry. The current `UnifiedWorkspace-lgwF3cyi.js` contains **ทดสอบการทำงานจริง** and `Spec224WorkspacePanel-BmTXVR1Q.js` contains First Run Pilot UI strings.
- The web process DB endpoint resolves to the development PostgreSQL database `smartspec`; read-only queries were run in a `BEGIN READ ONLY` transaction and rolled back. No database mutation or runner operation occurred.

## Owner-action and run discovery

- `approval_requests` contains zero rows whose payload kind is `spec224_goal_delegation_grant`.
- No current canonical DevelopmentRun job exists in `worker_jobs` with the SPEC-224 run projection in `inputJson.spec224Run` or `progressJson.spec224`.
- The only five matching historical job rows are expired: four `mini_app_factory.run_anchor` records from Oct 25–28, and one `external_agent_task` from Oct 27. They are not an approved live Goal or an active DevelopmentRun and must not be continued as the requested pilot.
- With no persisted owner Goal/DevelopmentRun/Job/Attempt, there is no approved scope/budget binding, Writer Lease/Fencing, Runner Dispatch ACK, Codex execution, run-scoped receipt/settlement, Child 2 continuation, or Independent Final Verify to inspect. No first execution boundary has failed; execution has not been authorized or started.

## Resume condition

Wait for the authenticated owner to use **ทดสอบการทำงานจริง**, review and start the bounded Goal, and approve the real Goal Grant through the existing Approval Authority. On the next observation, locate those persisted identities first and continue that exact DevelopmentRun through both children and final verification. Do not promote historical expired anchors into this pilot, create a duplicate Goal, execute work without the owner action, or fabricate evidence.
