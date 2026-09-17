# Deep Project Interview — Features 195–200

## User request

The user confirmed that Features 195–200 should be planned and implemented completely, in dependency order, without further confirmation checkpoints. The user requires every section to be covered, at least ten final consistency rounds, immediate repair of discovered gaps, and no whole-repository typecheck because of RAM constraints.

## Approved design decision

The user approved this order:

1. Feature 195 — durable Job Control Plane.
2. Feature 196 — Goal/Plan/Capability/Command orchestration.
3. Feature 197 — Runner/device/local execution.
4. Feature 198 — Chat/Universal Assistant and capability evolution.
5. Feature 199 — External MCP upstream gateway.
6. Feature 200 — External Agent Control Plane.

The user approved the shared flow: Chat/Assistant → Goal/Plan → Capability/Approval/Retrieval/Asset → MCP or External Agent → `worker_jobs` → Runner → Chat result.

## Constraints captured

- Preserve unrelated dirty-worktree changes.
- Reuse current SmartSpecPro foundations and avoid duplicate Job, Runner, RAG, approval, asset, billing, permission or audit truth.
- Keep tenant authority server-derived and use bounded idempotent retries, lease/fencing and rollback-safe migrations.
- Do not add retired Agency, work request/workpack, `/workflows`, OpenSandbox, `sandbox_jobs` or Docker/OpenSandbox dispatch paths.
- Do not run whole-repository TypeScript typecheck.

## Auto-decisions

- Split into six units because each Feature 195–200 has a distinct ownership boundary and independently testable deliverables.
- Use strict sequential implementation because 196 consumes 195, 197 consumes 195/196, 198 composes 195–197, 199 composes the shared control plane, and 200 depends on 195–199.
- Use file-based planning because no deep-session/task-list ID is available.
- Use targeted shell discovery because SocratiCode MCP is unavailable in this environment.
- Keep implementation in the current checkout because it already contains the user’s ongoing changes and creating a new worktree would duplicate/obscure those changes; no destructive cleanup or reset will be performed.

