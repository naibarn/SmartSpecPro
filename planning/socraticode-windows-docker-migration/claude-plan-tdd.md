# Verification-First Plan

This operations migration uses test-before-mutation checkpoints. For every
phase, collect baseline evidence first, define the expected result, perform only
the authorized mutation, and immediately re-run the checks.

## 1. Outcome and safety boundary

Pre-migration checks:

- launcher permission test expects `000`;
- unit-state tests expect disabled/inactive;
- managed MCP container test expects zero;
- server Qdrant test expects stopped with restart policy `no`;
- SmartSpecPro and PostgreSQL health tests expect green.

Failure of any baseline test blocks migration work.

## 2. Architecture decision

Architecture tests before configuration:

- selected Codex agent reports WSL 2;
- repository target resolves under WSL `/home`;
- Docker reports Linux containers;
- local `npx` resolves in WSL;
- Qdrant/Ollama endpoints resolve locally without SSH;
- local design contains no Docker socket mount, `--network host`,
  server cgroup parent, or server path.

## 3. Canonical artifacts

Artifact tests:

- remote and Windows SHA-256 for each handoff file match;
- remote and WSL SHA-256 for each handoff file match;
- template remains unchanged;
- working manifest has mode `600` in WSL;
- the plan status still states planning-only until execution approval exists.

## 4. Roles and authority

Approval tests:

- migration approval recorded before any local mutation;
- dirty tracked/untracked approvals recorded before transfer;
- Qdrant snapshot-window approval recorded before any server Qdrant action;
- destructive cleanup remains false throughout this runbook.

## 5. Data flow

End-to-end trace tests:

- source commit captured on server, Git origin, and WSL target;
- every transferred artifact has source/destination/size/hash;
- every created local resource has a target-only name;
- no server mutation appears on the default route;
- server safety checks run after local functional checks.

## 6. Variables and evidence contract

Manifest validation tests:

- no placeholder remains in a command about to run;
- required host/path/version/resource variables are non-empty;
- no secret-key/token/password fields exist;
- every gate has one of `not_run`, `pass`, `fail`, or `skipped_with_reason`;
- command log contains sanitized summaries rather than secret-bearing commands.

## 7. Phase plan

### Phase 0: Bootstrap over SSH

Tests before copy:

- known-host entry fingerprint equals the independently verified fingerprint;
- BatchMode connection succeeds;
- server hostname/user match expectations;
- remote plan exists and hashes successfully.

### Phase 1: Windows, WSL, and Docker preflight

Tests before installation/configuration:

- WSL distribution is version 2;
- Docker OSType is Linux;
- Docker works inside WSL;
- Node is 18 or newer;
- source path is not under `/mnt/c`;
- WSL memory/CPU/swap caps are visible after restart;
- calculated disk headroom passes.

### Phase 2: Read-only server inventory

Tests before any transfer:

- source commit and dirty state captured;
- launcher hashes match but permission remains `000`;
- all units remain disabled/inactive;
- no MCP process/container is running;
- Qdrant remains stopped;
- application health and memory pressure pass.

### Phase 3: Select migration lane

Tests before route selection:

- default route is clean clone plus fresh reindex;
- optional decisions are explicitly present;
- exclusion rules reject a synthetic secret path and parent/absolute path;
- dirty allowlists contain files only and resolve inside the repository.

### Phase 4: Acquire source safely

Tests before applying dirty work:

- target clone is at the recorded commit and clean;
- `git apply --check` passes;
- archive listing exactly equals the approved untracked allowlist;
- archive contains no symlink escaping the repository;
- post-apply Git status equals the approved manifest.

### Phase 5: Build the controlled local target

Tests before starting MCP:

- Compose/config validation succeeds;
- host port bindings resolve to `127.0.0.1`;
- Qdrant version/image/platform match the manifest;
- volume/network names are target-only;
- memory/CPU/PID limits are visible in container inspect;
- Qdrant and Ollama health pass;
- restart counts and OOM flags are zero.

### Phase 6: Index restore or fresh indexing

Tests before fresh index:

- selected target Qdrant volume is empty;
- embedding model/dimension and project ID match the manifest;
- only one local MCP process is present.

Tests during index:

- status progresses or checkpoints;
- memory/swap samples remain bounded;
- container restart/OOM counts remain zero;
- no duplicate indexing/watcher process appears.

Snapshot-specific tests before acceptance:

- source and target Qdrant minor versions match;
- target patch is equal/newer;
- hashes match;
- target restore volume was empty;
- collection counts, project identity, embedding config, and sample paths match.

### Phase 7: Functional and resource validation

Tests:

- MCP initialize;
- `codebase_status`;
- `codebase_search`;
- symbol lookup;
- impact lookup;
- graph stats;
- isolated watcher incremental update;
- three open/close client cycles without resource baseline growth.

### Phase 8: Server and application safety validation

Repeat all server baseline tests and compare before/after:

- launcher mode;
- unit state;
- managed container count;
- Qdrant status/restart policy;
- public/local/backend/PostgreSQL health;
- memory PSI, OOM, and restart indicators.

### Phase 9: Cutover and observation

Tests at immediate, one-hour, 24-hour, and 72-hour checkpoints:

- function smoke;
- idle/peak WSL memory and swap;
- Qdrant/Ollama/MCP memory;
- process/container counts;
- restart/OOM counts;
- MCP error count and indexing latency.

### Phase 10: Closeout

Tests:

- all required gates pass;
- no secret exists in the manifest/log bundle;
- retained artifacts and expiration dates are recorded;
- destructive cleanup remains unapproved;
- user acceptance is recorded.

## 8. Failure handling

For every injected or observed failure:

- verify the run stops at the documented gate;
- verify only incomplete local artifacts are removed;
- verify evidence/logs remain;
- verify no server SocratiCode component is enabled;
- verify fresh reindex remains the fallback for snapshot incompatibility.

## 9. Rollback model

Rollback test:

- local MCP entry can be disabled from backup;
- local services stop gracefully;
- failed target volumes can be quarantined without deletion;
- server disabled state remains unchanged;
- SmartSpecPro health remains green.

## 10. Completion criteria

Completion test passes only when G0-G11 pass, the 72-hour observation is stable,
the source and hash ledger reconciles, the server remains disabled, and the user
accepts the final manifest.
