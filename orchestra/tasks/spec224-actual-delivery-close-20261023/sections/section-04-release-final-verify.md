# Section 04 — Release and Final Verify

- **Requirement IDs:** R9, R10
- **Objective:** Publish the integrated Core change once through the existing authorized Linux release controller and verify the served result.
- **Owned paths:** No new deployment framework. Use canonical builder, release controller/status and existing browser/API checks.
- **Prerequisites:** Sections 01–03 pass; exact canonical SHA; sufficient build resources; existing release target and rollback artifact; sudo authentication available to the existing release command.
- **Deliverables:** Immutable canonical artifact; release receipt; matching frontend/backend/runtime SHA; HTTPS App Home and journey verification.
- **Verification:** `pnpm run build:canonical`; `pnpm run release:web:linux -- --required-integrated-revision <sha>`; `pnpm run release:status`; real browser and private-read denial on deployed app.
- **Completion predicate:** Runtime SHA and target match release artifact, deployed app works through the required journey, and unauthorized reads are denied.
- **Evidence:** Candidate SHA, artifact digest, pre/post release status, receipt ID, HTTP/TLS results and browser journey evidence.
- **Fallback:** Use existing release rollback/recovery path; do not bypass sudo, restart systemd manually, alter production DB or weaken branch protection.
- **Blocker challenge:** Check build lease/resource evidence and release status before retry. `sudo -n` prompting means the existing authorized operator session must authenticate; do not fabricate credentials.
- **Waiting/reactivation:** Build waits for fresh I/O/disk evidence. Release waits for the existing sudo gate. Continue independent code/runtime work and preserve artifact/evidence.
