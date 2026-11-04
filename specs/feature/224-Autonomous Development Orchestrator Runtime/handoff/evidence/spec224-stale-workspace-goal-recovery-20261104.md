# SPEC-224 Goal submission recovery for stale workspace snapshots

Observed: 2026-11-04. After the source-size repair was deployed, the user retried Goal submission in Task Control and received `WORKSPACE_BINDING_STALE`.

## Cause and repair

- `startWorkspaceRun` validates the conversation binding against the latest trusted Runner workspace snapshot before creating the DevelopmentRun. That freshness rejection is retained.
- The Task Control UI previously surfaced the rejection as a terminal error. It did not refresh the authorized workspace binding or the prepared plan, leaving the user unable to continue from that screen.
- At integrated SHA `2dd6eeefb985b9f59bc98907dd83c1bdda731163`, the UI now refreshes the authorized workspace list, rebinds only the same selected Runner/workspace if it remains authorized, checks that the binding matches the latest snapshot, and prepares the plan again. It never automatically resubmits or starts a Run; the user must review the current plan and press Goal again.
- If the selected workspace is no longer available, or the snapshot changes again during recovery, the UI clears the stale plan and presents a next action instead of exposing an internal error code.

## Verification and deployment

- `git diff --check`: passed.
- The repository's Prettier and ESLint executables were unavailable in this checkout; no test suite or local typecheck was run.
- Immutable Linux build completed for exact source SHA `2dd6eeefb985b9f59bc98907dd83c1bdda731163`; frontend and widget Vite builds passed. Vite emitted the existing large-chunk warning.
- Deployed via the authorized `legacy-debian-dev` controller to `https://smartaihub.app`, generation 358, release `smartspec-web-2dd6eeefb985b9f59bc98907dd83c1bdda731163-d1e3f4b02edb`, artifact digest `sha256:f50a9d22712878dd9a74f5bc6f57c361f3715d48df28bf13002bd42a5d38d7bb`.
- Web and Node Worker runtime report the exact integrated SHA. Controller result: `DEPLOYED_VERIFIED`, health HTTP 200, anonymous diagnostics HTTP 403. Public health check returned HTTP 200 in 153 ms with valid TLS and no missing security headers.
- Public `Spec224WorkspacePanel-PX7bpDLQ.js` returned HTTP 200 and contains the stale-binding recovery code and review-before-resubmit message.
- No authenticated browser retry, Goal grant, or Provider execution is claimed. Next: refresh Task Control, submit again, review the refreshed plan if the snapshot changed, and observe whether the owner-approved Goal is durably admitted.
