# Shared Contract — Spec 224 Workspace/Chat

## Backend-owned tRPC API
- `spec226DevelopmentControl.availableWorkspaces.query({})` -> `{ workspaces: [{ runnerId, displayName, status, snapshotRevision, workspaceId, gitHead, gitBranch, dirty }] }`; only trusted, current, authorized registered Runner snapshots; no local path or remote URL.
- `spec226DevelopmentControl.bindConversationWorkspace.mutate({ conversationId, runnerId, workspaceId })` -> `{ conversationId, runnerId, workspaceId, revision }`; validates conversation ownership/tenant and live workspace membership before binding.
- `spec226DevelopmentControl.getConversationWorkspace.query({ conversationId })` -> bound workspace and latest immutable Spec Set summary or null.
- `spec226DevelopmentControl.ingestSpecSet.mutate({ conversationId, artifacts: [{ path, contentBase64 }], idempotencyKey })` -> `{ revision, digest, files, requirementCount, runnableWorkPackageCount, blockedWorkPackageCount }`; new immutable revision, bounded raw payload.
- `spec226DevelopmentControl.prepareWorkspaceRun.mutate({ conversationId, mode: 'prompt'|'spec_set', prompt?, specSetRevision? })` -> `{ workspace, planId, planRevision, contextPackHash, requirements, workPackages, runnableWorkPackageIds, findings, impact, blockers }`; prompt stays out of the URL/query log path and preparation has no execution side effects.
- A SpecSet work package is READY only with resolved explicit requirement refs, explicit dependency list, acceptance criteria, verification obligations and a safe write set. Missing/ambiguous/cyclic metadata remains blocked; independent packages can still be ready.
- `startWorkspaceRun.mutate` is a separate user action. It derives workspace/repository/base revision and pinned SpecSet input from server-owned trusted state; client must not supply those facts. It uses the existing canonical authorization and `createPersistedDevelopmentRun` admission path and returns `PENDING_AUTHORIZATION` without dispatching.
- Input staging contract: immutable server-owned `inputSourceRef` and digest in durable run manifest; bind exact staged bytes to actual job/attempt/lease/fence/runner/session/grant at dispatch; deliver one-time fetch capability only through authenticated Runner WSS; verify/materialize bytes before provider spawn. Raw prompt/spec and fetch grant must not enter durable job events/commands/logs.
- Build, test and application-run remain independent, explicit user-owned actions. Prompt/Spec intake and DevelopmentRun creation do not trigger them.
- `snapshotRevision` and `gitHead` identify the trusted Runner view at preparation/start. Execution-time validation of workspace content freshness, especially dirty or newly changed files, remains a certification gap; a Git HEAD alone does not fingerprint uncommitted content.

## Ownership
| Owner | Files |
|---|---|
| Backend/schema writer | `apps/web/drizzle/schema.ts`, new `apps/web/drizzle/0383_spec224_workspace_spec_sets.sql`, `apps/web/drizzle/meta/*` generated migration state, `apps/web/server/services/spec224WorkspaceSpecSet.ts`, `apps/web/server/services/spec224WorkspaceSpecSet.test.ts`, `apps/web/server/routers/spec226DevelopmentControl.ts`, its router tests, `apps/web/server/routers.ts` |
| Conductor/UI | `apps/web/client/src/components/chat/Spec224WorkspacePanel.tsx`, its focused test, `apps/web/client/src/components/chat/UniversalControlPlanePanel.tsx`, `apps/web/client/src/components/chat/__tests__/UniversalControlPlanePanel.test.tsx` |
| Conductor/Runner integration (after audit) | exact Runner protocol/dispatcher paths only; no overlap with backend schema ownership |

## Security/ownership rules
- Workspace path is never accepted from the client; only runnerId/workspaceId present in the current trusted runner snapshot.
- All DB reads/writes scope tenant + actor/conversation owner.
- ZIP entries are bounded and allowlisted (`.md`, `.json`); reject traversal, absolute paths, symlinks, duplicate/case-fold collisions, encryption, unsupported compression, invalid UTF-8/JSON, and expansion limits.
- Spec text is untrusted data; it cannot grant capabilities or alter policy.
- Immutable Spec Set revisions are keyed to the registered workspace identity; old DevelopmentRuns retain the exact pinned revision/digest.
- No second queue or runtime authority; worker_jobs/outbox and existing Spec 224 authorization remain canonical.

## Local development candidate runtime
- The existing local Runner on the development server is the first execution target. Cloudflare will later implement the same candidate contract; it is not a prerequisite.
- Before candidate creation, the Runner compares the current workspace source fingerprint to the fingerprint pinned by prepare/start. A mismatch rejects stale work before provider spawn.
- Each run gets a source candidate below the Runner data root and outside the registered workspace. It includes tracked plus non-ignored untracked files; `.git`, ignored/generated files and Runner control state are excluded. Provider process is sandboxed to that candidate and startup fails closed if the provider sandbox is unavailable.
- Work-package `allowedWriteSet` entries authorize an exact repository-relative path or all descendant paths below that directory prefix. Candidate delta is checked after execution; any forbidden changed path rejects the entire delta. Prompt-only explicit Start authorizes any eligible source path in the selected workspace.
- Apply uses path-level compare-and-swap against the candidate baseline so unrelated user edits during execution are preserved. Conflicting touched paths are left unchanged and the candidate is retained. Successful multi-file apply uses a durable journal, per-file atomic replacements, and rollback/recovery on failure.
- Candidate data is an execution artifact owned by the local Runner, not a second queue or finality authority. `worker_jobs`, leases, event journals, and existing Spec 224 authorization remain canonical. Build/test/application-run stay user-operated.
