# SocratiCode External Services Cutover Design

Date: 2026-07-18
Status: Reviewed and approved; pending implementation

## Problem

SocratiCode previously accumulated multiple MCP processes and persistent
watcher work on `192.168.1.124`. The resulting Node memory growth, repeated
container OOMs, and shared-slice pressure contributed to web-build stalls and
host instability.

The current Codex configuration already points at external Qdrant and Ollama,
but the installed Docker launcher is still unsafe:

- it does not force `QDRANT_MODE=external` or pass `QDRANT_URL`;
- its default Ollama URL uses port `11434` instead of the approved `11435`;
- it exposes the host Docker socket to the MCP container, leaving a path for
  SocratiCode to create local Qdrant or Ollama containers;
- direct `npx` execution is not constrained by a SocratiCode-specific memory
  budget or global concurrency limit.

The local `socraticode-qdrant` and `socraticode-ollama` containers are stopped,
but the Ollama container still has a non-`no` restart policy.

## Goals

- Run the SocratiCode MCP process on `192.168.1.124`.
- Use only:
  - Qdrant: `http://192.168.1.119:16333`
  - Ollama: `http://192.168.1.119:11435`
- Prevent automatic or fallback startup of Qdrant or Ollama on
  `192.168.1.124`.
- Bound all SocratiCode MCP memory on `192.168.1.124` to an aggregate 6 GiB
  maximum with no swap.
- Allow no more than two concurrent MCP processes.
- Fail closed when either external endpoint is unavailable.
- Preserve the stopped local containers and their named volumes.
- Keep the persistent watcher, indexer, and cleanup timer disabled.

## Non-Goals

- Run the MCP server itself on `192.168.1.119`.
- Upgrade SocratiCode beyond the currently pinned `1.8.11`.
- Delete or migrate the stopped local Qdrant/Ollama volumes.
- Re-enable persistent indexing or watcher services.
- Guarantee that unrelated application services can never cause host memory
  pressure.

## Considered Approaches

### 1. Codex configuration only

Keep direct `npx` execution and explicit external environment variables.

This is the smallest change, but it leaves direct MCP processes outside a
dedicated memory envelope and leaves the legacy launcher as an unsafe fallback.
Rejected as insufficient for recurrence prevention.

### 2. External-only, resource-bounded launcher

Route Codex through one hardened launcher. The launcher validates both remote
services, limits concurrency, starts only the MCP container, removes its Docker
socket access, and applies per-process and aggregate cgroup limits.

Selected because it makes endpoint selection and resource limits enforceable
at one control plane while retaining local source-code access.

### 3. Remote MCP server

Move the MCP process, source checkout, and transport to `192.168.1.119`.

Rejected for this cutover because only Qdrant and Ollama endpoints are
available there, and the approved architecture keeps source inspection and MCP
stdio on `192.168.1.124`.

## Architecture

### Authoritative control plane

Repository-managed runtime source remains under:

```text
ops/socraticode-runtime/
```

Validated runtime copies are installed under:

```text
/home/dev/tools/socraticode-docker/
```

The Codex MCP entry in `/home/dev/.codex/config.toml` will execute the hardened
launcher instead of unconstrained direct `npx`. Project `.mcp.json` remains
empty so it cannot override the host policy.

### External-only endpoint enforcement

Before starting an MCP process, the launcher performs bounded probes:

1. Qdrant root and collections endpoints must return successfully from
   `192.168.1.119:16333`.
2. Ollama `/api/tags` must return successfully from
   `192.168.1.119:11435`.
3. The Ollama response must include `nomic-embed-text`.

The launcher then passes these exact values:

```text
QDRANT_MODE=external
QDRANT_URL=http://192.168.1.119:16333
OLLAMA_MODE=external
OLLAMA_URL=http://192.168.1.119:11435
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
```

The MCP container will not receive `/var/run/docker.sock` or the Docker socket
group. Even if SocratiCode ignores an external-mode variable, it has no Docker
control path from which to create a local Qdrant or Ollama container.

If either endpoint fails, the launcher exits before starting MCP. The error
must explicitly say to inspect the firewall and ESET configuration on
`192.168.1.119`. It must not start, restart, or fall back to any local data
service.

### Resource envelope

Create a dedicated `socraticode.slice` with:

```text
MemoryHigh=5G
MemoryMax=6G
MemorySwapMax=0
TasksMax=512
```

Each MCP container is limited to:

```text
memory=3g
memory-swap=3g
pids-limit=256
cgroup-parent=socraticode.slice
```

The launcher maintains two non-blocking slot locks. It also counts running
managed MCP containers before launch so an orphan whose shell lock was released
still consumes a slot. When both slots are occupied, a new MCP launch fails
clearly instead of increasing host memory pressure.

This deliberately prefers temporary SocratiCode unavailability over host-wide
memory exhaustion.

### Lifecycle and orphan handling

The launcher retains managed-container labels, signal traps, and cleanup of its
owned MCP container. Before a new launch, the existing fail-closed cleanup
helper may remove only containers proven orphaned by its current
label/PID/grace-period checks.

The launcher sequence is fixed:

1. acquire one non-blocking concurrency slot;
2. probe Qdrant, Ollama, and the required embedding model;
3. if a probe fails, release the slot and exit without cleanup or any other
   runtime mutation;
4. run fail-closed orphan cleanup;
5. count all running managed MCP containers;
6. reject the launch when two managed containers are already running;
7. start one resource-limited MCP container and hold the slot until it exits.

This ordering ensures an endpoint failure leads first to firewall/ESET
diagnosis on `192.168.1.119`, not to local cleanup or fallback activity.

The persistent watcher, indexer, and cleanup timer remain disabled and
inactive. No background MCP process is started by this cutover.

### Local data-container containment

Without starting either container:

- set `socraticode-qdrant` restart policy to `no`;
- set `socraticode-ollama` restart policy to `no`;
- verify both remain stopped;
- preserve both containers and all named volumes.

The hardened launcher, explicit external environment, and absent Docker socket
close configured fallback paths. This does not attempt to prevent an authorized
administrator from manually running an explicit `docker start` command.

## Failure Handling

- Qdrant unavailable: exit before MCP launch; report the exact endpoint and
  firewall/ESET diagnostic direction.
- Ollama unavailable or model missing: exit before MCP launch; report the
  endpoint/model and firewall/ESET diagnostic direction.
- Two MCP slots already active: reject the new session without starting a
  container.
- Per-process memory exhaustion: Docker terminates only that MCP container.
- Aggregate memory pressure: `socraticode.slice` throttles at 5 GiB and enforces
  a hard 6 GiB maximum with no swap growth.
- Client disconnect or termination: launcher stops and removes only its owned
  MCP container.
- Launcher `SIGKILL`: the remaining managed container continues to count
  against concurrency; a later pre-launch cleanup may remove it only after the
  existing proof-of-orphan rules pass.
- Docker unavailable: fail clearly without touching external or local data
  services.

## Safety and Rollback

Before mutation, capture a timestamped backup containing:

- repository and installed launcher files;
- `/home/dev/.codex/config.toml`;
- relevant systemd units and slice configuration;
- local Qdrant/Ollama container inspection output;
- enabled/active states for SocratiCode units;
- endpoint probe output and checksums.

No data container or volume is deleted.

Safe rollback does not restore a local-data fallback. If the hardened launcher
cannot be made healthy, disable the SocratiCode MCP entry and leave local
Qdrant/Ollama stopped with restart policy `no`. Restore earlier files only for
inspection or after separately proving they retain external-only behavior.

## Implementation Order

1. Capture backup and current disabled/stopped baseline.
2. Reconfirm both external endpoints and the embedding model.
3. Add focused launcher tests for endpoint failure, concurrency exhaustion,
   exact external variables, Docker-socket absence, and resource arguments.
4. Update repository-managed launcher and systemd slice source.
5. Validate Bash, tests, and systemd unit syntax.
6. Install validated copies atomically.
7. Set both stopped local data containers to restart policy `no`.
8. Keep watcher, indexer, and cleanup timer disabled/inactive.
9. Update Codex MCP config to use the hardened launcher.
10. Run a manual MCP JSON-RPC initialize, tool-list, and `codebase_status`
    smoke test.
11. Confirm local Qdrant/Ollama never started and their start timestamps did
    not change.
12. Capture bounded-memory, PSI, cgroup-event, container-count, and SmartSpecPro
    health snapshots.

Existing Codex tasks must be restarted before their MCP tool catalog reflects
the new configuration. The implementation session can still validate the
launcher directly before that restart.

## Verification

- `bash -n` for launcher and cleanup scripts.
- Focused shell fixtures with fake Docker, curl, and lock state.
- `systemd-analyze verify` for `socraticode.slice` and retained SocratiCode
  units.
- External Qdrant root/collections checks pass.
- External Ollama tags check passes and contains `nomic-embed-text`.
- Manual MCP initialize and tool-list succeed through the launcher.
- `codebase_status` succeeds against the SmartSpecPro workspace.
- MCP container inspection shows:
  - exact external endpoint environment;
  - no Docker socket mount;
  - 3 GiB/no-swap per-process limit;
  - `socraticode.slice` cgroup parent.
- A third concurrent launcher attempt fails without creating a container.
- Both local data containers remain stopped with restart policy `no`.
- Watcher, indexer, and cleanup timer remain disabled/inactive.
- Memory PSI and cgroup OOM counters do not regress during the smoke window.
- SmartSpecPro public, local web, and backend health probes remain successful.

## Acceptance Criteria

- SocratiCode MCP on `192.168.1.124` successfully uses Qdrant and Ollama on
  `192.168.1.119`.
- No configured runtime path can automatically start local Qdrant or Ollama.
- External-service failure never triggers local fallback.
- At most two managed MCP containers run concurrently.
- Every MCP container is capped at 3 GiB with no swap.
- Aggregate SocratiCode memory is hard-capped at 6 GiB with no swap.
- No persistent watcher, indexer, or cleanup timer is enabled.
- Stopped local containers and named volumes are preserved.
- Failure messages direct operators to firewall/ESET checks on
  `192.168.1.119`.
- SmartSpecPro application health is unchanged after cutover.

## Focused Spec Review

Round 1 found one implementation-significant ambiguity: the launcher did not
state whether remote endpoint checks occur before orphan cleanup. The sequence
now requires endpoint and model probes before any cleanup or runtime mutation,
so a connection failure leads first to firewall/ESET diagnosis on
`192.168.1.119`.

Round 2 status: approved. The spec has no unresolved placeholders,
contradictory requirements, scope gaps, or implementation-blocking ambiguity.
