# SPEC-224 live Start and Runner access recheck

Captured at `2026-10-26T07:42:50Z` (UTC), against the deployed release source `08b508284eabe621292ab95a5b1cc6a63bca5fd1`; repository `origin/main` was `a7cf1e7f6d57ba256c5aa5fd8d7b3d046c81fb4e`. Public endpoint checks completed at `07:39Z`.

## Live checks

- Public runtime remained available: `GET /` = HTTP 200, `/healthz` = `ok`, `/api/health` = `{"status":"ok","service":"smartaihub-web"}`, and `/api/v1/health/ready` = `{"status":"ready"}`.
- The served JavaScript bundle `index-BoMhkk_b.js` contains the SPEC-224 Workspace UI and calls `startWorkspaceRun` / `workspaceRunnerReadiness`; the implementation exposes the USD 1.00 default and the owner Start action. This confirms the deployed bundle contains the feature, not that an authenticated owner rendered or submitted it.
- Authenticated data could not be read in this execution context. `GET /trpc/runnerNodes.list` returned HTTP 401, tRPC `UNAUTHORIZED`, `Please login (10001)`, trace `mLUgktxWmh-WwdjzwT989`. `GET /trpc/spec226DevelopmentControl.availableWorkspaces` returned HTTP 401, `Please login (10001)`, trace `zLYxkjnaySxF_leP2w5wi`.
- These 401 responses do not establish that the runner, workspace, device consent, owner policy or budget are absent. They establish that no authenticated owner session was available to this check. No Start mutation was sent.
- Existing Runner 0.2.41 evidence remains the observation at `2026-10-26T02:09:34Z`: Codex task probe passed, but its evidence expired at `02:13:44Z`; workspace was reported clean at SHA `fbd7fd1bd8324973540664d7f7de2bd9e5844757` with content fingerprint `0f2eeb70d5767268e5170defcaaf8e4f7182ce6de91a4d21019b0d0ade0cbce1`; capability policy was `pending`. This is stale and is not a current heartbeat, consent, or dispatch grant.
- The current execution did not synchronize the Windows workspace: its current dirty state and ownership cannot be read from this unauthenticated context, so no Git operation was attempted. Preserve all existing workspace changes; only fast-forward from the owner UI after verifying the registered workspace is clean and its current SHA is an ancestor of the accepted canonical source.
- Orca Computer Sidecar returned `accessibility_error` for both `list-apps` and its one prescribed capability check. Classified as `TOOL_FAILURE`; it is not SmartAIHub application evidence and was not retried.

## Acceptance state

| Requirement | Result | Evidence |
|---|---|---|
| Public production runtime health | PASS | Live HTTP checks above; production release receipt remains the source of exact deployed revision/generation. |
| Deployed Chat bundle contains SPEC-224 Workspace and Start wiring | PASS (bundle presence only) | Served bundle markers above; no authenticated UI interaction claimed. |
| Current Runner heartbeat/version/capability snapshot/device consent | NOT VERIFIED | Authenticated `runnerNodes.list` returned 401. Last 0.2.41 snapshot and Codex probe have expired. |
| Workspace SHA/fingerprint and safe synchronization | NOT VERIFIED | Authenticated workspace list returned 401; no synchronization attempted. |
| Owner policy and USD 1.00 budget | NOT VERIFIED | No authenticated owner session. Start code provisions bounded run-scoped policy/budget during the owner Start; no budget/credit was created here. |
| Authenticated Start and DevelopmentRun | NOT RUN | No owner mutation submitted; no Run ID exists in this execution's evidence. |
| Protected dispatch, Codex execution, receipts, usage/settlement | NOT RUN | No DevelopmentRun was started. |
| Authenticated AuditLogger events | NOT RUN | Runtime audit storage was repaired during deployment, but no authenticated owner event was generated or verified. |
| Interruption/reconnect recovery | NOT RUN | Requires a real run and runner session. |
| Independent Final Verify | NOT RUN | No run-bound evidence exists to verify. |

## Single continuation action

Sign in as the existing owner at `https://smartaihub.app/chat`, open a conversation and its **Spec 224 workspace** panel, select the already registered Windows Runner and existing `SmartSpecPro` workspace, and start a small reversible task with the cap left at **USD 1.00**. The task should first report the registered SHA, `git status`, branch ancestry to current `origin/main`, and the accepted source policy; it may fast-forward only if the workspace is clean and a fast-forward is provably safe. It must stop without changing files if dirty or divergent. The Start response provides the real DevelopmentRun ID; use that same run to collect the dispatch, execution, audit, settlement, recovery and Final Verify receipts. Do not repeat the Codex probe unless fresh readiness explicitly reports it expired or required.

Overall SPEC-224 remains `PARTIAL`; deployment health and bundle presence do not satisfy protected live DevelopmentRun acceptance.
