# Implementation Plan: SocratiCode on Windows Docker Desktop

## 1. Outcome and safety boundary

Move SocratiCode codebase intelligence off the Linux SmartSpecPro server and
establish it in the user's current Windows development environment using WSL 2
and Docker Desktop. SSH is used only to read inventory and transfer approved
artifacts. The SocratiCode MCP stdio process runs locally for the Windows Codex
client.

This plan does not authorize migration execution. During later execution the
default path must not start any SocratiCode component on the server. The server
launcher, watcher, indexer, cleanup timer, and Qdrant remain disabled/stopped.
SmartSpecPro application services, PostgreSQL, uploads, and production Docker
volumes are outside the migration boundary.

## 2. Architecture decision

### Target

- Windows 11 with Docker Desktop using the WSL 2 Linux-container backend.
- One selected WSL distribution for the repository and local MCP process.
- SmartSpecPro clone in the WSL Linux filesystem:
  `/home/<wsl-user>/projects/SmartSpecPro`.
- A persistent Docker Desktop Qdrant container on a named network and named
  volume, pinned initially to `qdrant/qdrant:v1.17.0`.
- Ollama either:
  - native/WSL on a GPU-capable Windows host; or
  - a resource-limited Docker container when CPU operation is acceptable.
- The Codex MCP entry starts local `npx -y socraticode@<validated-version>` and
  points it to the controlled external Qdrant service.

### Rejected target

Do not copy the Linux launcher or recreate its per-client full MCP container.
The launcher contains server-specific paths, host networking, Docker socket
mounting, GID handling, and a Linux systemd cgroup parent. Do not wrap the stdio
command in SSH because that would run compute, indexing, and file watching on
the server again.

## 3. Canonical artifacts

The planning package lives in:

`/home/dev/projects/SmartSpecPro/planning/socraticode-windows-docker-migration/`

The Windows executor uses:

- `MIGRATION_PLAN.md` as the canonical runbook;
- `WINDOWS_CODEX_HANDOFF.md` as the initial execution contract;
- `evidence-manifest.template.yaml` as the append-only execution record.

The remaining `claude-*.md` and `sections/*.md` files preserve planning,
research, review, and checkpoint rationale.

## 4. Roles and authority

### User/approver

- Provides the SSH alias or host and verifies the host-key fingerprint.
- Chooses whether current uncommitted server work is required.
- Separately authorizes an optional Qdrant snapshot window.
- Separately authorizes any destructive cleanup after the retention window.

### Windows Codex executor

- May perform read-only server inventory over SSH.
- May create and modify local Windows/WSL/Docker resources.
- May clone from Git and transfer approved, checksummed artifacts.
- Must stop at every marked approval gate.
- Must not infer permission to start server services, copy secrets, delete
  volumes, reset Git, or change production services.

### Server

- Remains read-only for the default route.
- Supplies plan files, inventory evidence, and only approved transfer artifacts.

## 5. Data flow

```text
User verifies server host key
  -> Windows Codex copies plan package through SSH
  -> Windows/WSL/Docker preflight
  -> read-only server inventory
  -> select exact Git commit and data lane
  -> clone clean source into WSL filesystem
  -> optionally apply reviewed dirty-work patch
  -> create controlled local Qdrant/Ollama target
  -> fresh local SocratiCode index
  -> smoke, completeness, fan-out, and memory validation
  -> confirm server remains disabled and SmartSpecPro remains healthy
  -> observe 24 hours, then 72 hours
  -> retain rollback artifacts 7-14 days
```

The optional Qdrant snapshot lane branches after inventory and rejoins before
functional validation. Snapshot restore is accepted only if Qdrant version,
embedding provider/model/dimensions, project identity, and indexed paths match.
Otherwise the target volume is quarantined and the fresh-reindex path is used.

## 6. Variables and evidence contract

The executor populates these values in the manifest:

- run ID and timestamps;
- `SERVER_SSH_ALIAS`, `SERVER_USER`, `SERVER_REPO`;
- verified server host-key fingerprint;
- `WINDOWS_HOST`, `WINDOWS_USER`;
- `WSL_DISTRO`, `WSL_USER`, `WSL_REPO`;
- Windows staging directory;
- WSL, Docker Desktop, Docker Engine, Compose, Git, Node, npm, OpenSSH, Codex,
  Qdrant, SocratiCode, and Ollama versions;
- host RAM/CPU, `.wslconfig` limits, free disk, Docker disk use;
- server and target commit IDs and dirty-state manifests;
- transfer allowlist, file sizes, SHA-256 hashes;
- image tags, IDs/digests, platforms;
- Qdrant collection names/counts and embedding configuration;
- approvals, deviations, commands, results, rollback actions, and gate status.

The manifest must never contain private-key material, passphrases, access
tokens, cookies, `.env` contents, Docker auth, or full Codex configuration.

## 7. Phase plan

### Phase 0: Bootstrap over SSH

Entry criteria:

- User has supplied the intended server identity.
- User has independently verified the SSH host-key fingerprint.
- Windows OpenSSH is installed.

Actions:

- Connect with strict host-key checking.
- Read the plan in place.
- Copy only the planning directory to a new local staging directory.
- Record hashes of the copied plan files.

Stop when:

- the fingerprint is unknown or changed;
- authentication asks for an unexpected password;
- the remote path differs from the canonical path;
- copied file hashes differ.

Rollback:

- delete only the incomplete local staging copy;
- do not modify the server.

### Phase 1: Windows, WSL, and Docker preflight

Entry criteria:

- Planning package is local and verified.

Actions:

- Record Windows, WSL, and tool versions.
- Confirm Docker runs Linux containers and is integrated with the selected WSL
  distribution.
- Confirm the target repository will live under `/home`, not `/mnt/c`.
- Measure host/WSL RAM, CPU, swap, and disk.
- Set explicit WSL memory/CPU/swap limits based on measured capacity and leave
  headroom for Windows.
- Confirm Docker can pull/run `linux/amd64` images or document emulation risk.
- Reserve disk headroom for clone, images, Qdrant indexing, snapshots, and one
  rollback copy.

Stop when:

- Docker is in Windows-container mode;
- WSL integration is missing;
- the target is under `/mnt/c`;
- free disk is below the calculated requirement;
- configured memory leaves insufficient Windows headroom;
- required tools are missing.

Rollback:

- undo only local preflight configuration changes;
- apply `.wslconfig` changes with `wsl --shutdown` only after saving the
  previous content.

### Phase 2: Read-only server inventory

Entry criteria:

- SSH and local preflight gates pass.

Actions:

- Re-record server commit and working-tree status.
- Record launcher mode/hash, unit enable/active state, containers, restart
  policies, images, volumes, collection names, relevant sizes, and free disk.
- Record server application health without restarting anything.
- Compare the live inventory with the planning baseline.
- Generate a candidate untracked-file manifest only; do not archive it yet.

Expected baseline:

- commit `f6a6c62dc7ec630a90f60e59b79798e3795c1dc2`;
- launcher mode `000`;
- watcher/index/timer disabled and inactive; cleanup service static or disabled
  and inactive;
- no managed MCP container;
- Qdrant stopped with restart policy `no`;
- Qdrant volume approximately 1.2 GiB;
- Qdrant image `v1.17.0`.

Stop when:

- any server SocratiCode component is unexpectedly active;
- the server has memory/health pressure;
- production health is not green;
- source state changed and has not been reconciled;
- inventory needs a mutating command.

Rollback:

- none; this phase is read-only.

### Phase 3: Select migration lane

Lane A, required/default:

- clean Git clone pinned to the recorded commit;
- no Qdrant transfer;
- fresh local index.

Lane B, optional dirty work:

- export a binary patch for explicitly approved tracked paths;
- create an archive only from an explicitly approved untracked allowlist;
- exclude all local settings, secrets, generated files, large data, logs,
  backups, caches, and application data.

Lane C, optional Qdrant snapshots:

- requires separate explicit approval;
- first preserves a stopped-volume backup manifest;
- starts only Qdrant, on loopback, using the pinned image and existing volume;
- creates per-collection snapshots, stops Qdrant immediately, and hashes them;
- transfers snapshots as confidential source-derived data;
- restores to a new empty target volume.

Lane D, emergency raw-volume archive:

- not part of normal execution;
- requires separate explicit approval;
- requires the container to remain stopped, exact-version restore, a new target
  volume, checksums, and a documented reason snapshots were unavailable.

### Phase 4: Acquire source safely

Entry criteria:

- lane selection is recorded.

Actions:

- Clone `git@github.com:naibarn/SmartSpecPro.git` into the WSL Linux filesystem.
- Check out the manifest commit.
- Confirm the clone is clean.
- If Lane B is approved, inspect and apply the patch in check mode first, then
  apply it and extract only allowlisted untracked files.
- Compare resulting Git status with the approved manifest.

Forbidden:

- `scp -r` or `rsync` of the server worktree;
- transfer of `.git`, `.env*`, `.claude/**`, `~/.codex`, Docker auth,
  `node_modules`, `dist`, `target`, caches, uploads, logs, backups, database
  files, core dumps, or `orchestra/backups/**`;
- `git reset --hard`, `git clean`, or checkout commands that discard work.

### Phase 5: Build the controlled local target

Entry criteria:

- source and local resource gates pass.

Actions:

- Create target-only Compose/config artifacts outside production paths.
- Use a named Docker network.
- Create a new named Qdrant volume.
- Pin Qdrant initially to `v1.17.0`.
- Publish Qdrant only to `127.0.0.1:16333/16334`.
- Apply container memory, CPU, PID, health-check, and restart limits.
- Choose Ollama deployment and pin the tested image/digest or native version.
- Re-pull `nomic-embed-text`; never restore the server Ollama volume.
- Start data services only, verify health, and record actual memory use.
- Configure local SocratiCode to use external Qdrant and the selected embedding
  endpoint/model/dimension.
- Add a local Codex stdio MCP entry pinned to the validated SocratiCode version.

Do not copy:

- the server launcher;
- the server Codex configuration;
- server absolute paths;
- `--network host`;
- Docker socket mounts;
- the Linux systemd cgroup parent.

### Phase 6: Index restore or fresh indexing

Default:

- ensure target Qdrant is empty;
- run one local SocratiCode index operation against the WSL clone;
- observe memory, CPU, processes, container count, restarts, logs, and progress;
- stop if memory grows without a bounded plateau, Docker/WSL becomes unstable,
  or duplicate MCP/index processes appear.

Optional snapshot:

- keep target Qdrant on compatible 1.17.x;
- upload each snapshot into a new/empty collection with snapshot priority;
- verify collection counts and payload paths;
- verify project ID and embedding provider/model/dimensions;
- if any mismatch exists, quarantine the restored target volume and fresh
  reindex into another new volume.

### Phase 7: Functional and resource validation

Functional checks:

- MCP initialize succeeds.
- `codebase_status` reports the target repository.
- Search finds a known symbol or path.
- Symbol lookup returns its definition.
- Impact lookup returns plausible dependents.
- Incremental change detection updates a small known file change and returns to
  idle.

Resource checks:

- one Codex client does not create multiple full MCP containers.
- opening/closing the client repeatedly does not leak processes or containers.
- Qdrant and Ollama restart counts stay at zero.
- memory reaches a stable plateau during idle and incremental indexing.
- WSL swap does not grow continuously.

Integrity checks:

- commit and approved dirty state match the manifest.
- all transferred hashes match.
- collection/file counts are recorded.
- no secret or excluded path appears in the transfer ledger.

### Phase 8: Server and application safety validation

After target smoke tests:

- re-check launcher mode `000`;
- re-check watcher/index/timer disabled and inactive, with the cleanup service
  static-or-disabled and inactive;
- re-check zero managed MCP containers;
- re-check Qdrant stopped and restart policy `no`;
- re-check SmartSpecPro public endpoint, local web/backend health, PostgreSQL,
  PSI, and recent OOM/restart indicators.

Any regression fails cutover even when Windows SocratiCode works.

### Phase 9: Cutover and observation

- Make the Windows local MCP entry the only active SocratiCode entry used by
  the Windows Codex client.
- Do not enable SocratiCode in the repository `.mcp.json` unless the user later
  requests a shared configuration design.
- Observe for at least 24 hours and again at 72 hours.
- Record peak/idle memory, swap, restart count, process/container count,
  indexing latency, and MCP failures.
- Keep server source/volume and transfer artifacts unchanged for 7-14 days.

### Phase 10: Closeout

- Mark each manifest gate pass/fail.
- Record the selected final architecture and versions.
- Store sanitized logs and checksums.
- Record remaining retention items and deletion dates.
- Destructive cleanup is a new task requiring explicit authorization.

## 8. Failure handling

| Failure | Required response |
|---|---|
| SSH fingerprint mismatch | Stop; user verifies identity out of band |
| Server SocratiCode unexpectedly active | Stop; diagnose server state separately |
| Production health not green | Stop migration; treat as incident |
| Insufficient Windows disk/RAM | Stop before transfer/start; resize or change limits |
| Dirty-work allowlist includes secret/generated path | Reject and regenerate allowlist |
| Hash mismatch | Delete only the corrupted local copy and re-transfer |
| Docker architecture mismatch | Rebuild/pull correct platform; do not force untested emulation |
| Qdrant snapshot incompatibility | Quarantine target volume; use fresh reindex |
| Embedding config mismatch | Use fresh reindex |
| Project/path identity mismatch | Set a reviewed stable project ID or fresh reindex |
| Memory growth/restart loop | Stop local MCP/indexing and data services; preserve logs |
| Duplicate MCP processes/containers | Stop cutover; correct local configuration |
| Windows target fails after cutover | Disable local MCP entry; do not re-enable server runtime |

## 9. Rollback model

Rollback affects only newly created Windows/WSL/Docker resources:

- disable the local Codex MCP entry;
- stop target SocratiCode/Qdrant/Ollama;
- preserve target logs, manifest, and hashes;
- keep failed target volumes under quarantine names until diagnosis;
- restore the prior local `.wslconfig` or Codex config from its local backup if
  needed.

Rollback never starts server SocratiCode. The server remains disabled, and the
user may use codebase discovery without SocratiCode until a corrected local
attempt is approved.

## 10. Completion criteria

The migration is complete only when:

- all mandatory manifest gates pass;
- local functional tests pass;
- resource usage is bounded through the observation window;
- there is no per-client container/process fan-out;
- server SocratiCode remains disabled;
- SmartSpecPro remains healthy;
- all artifacts and hashes reconcile;
- the user accepts the final evidence manifest.
