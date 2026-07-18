# Implementation Plan

## Objective

Cut SocratiCode on `192.168.1.124` over to external Qdrant and Ollama on
`192.168.1.119`, remove all configured local fallback paths, and bound local
MCP memory/concurrency so SocratiCode cannot recreate the prior unbounded
memory-growth incident.

## Current-codebase fit

The repository already owns the launcher, cleanup helper, systemd units, and
focused runtime tests under `ops/socraticode-runtime/`. The implementation
extends this existing control plane instead of introducing a new runtime or
dependency.

The installed runtime remains under `/home/dev/tools/socraticode-docker/`.
Codex will execute the installed launcher through `/home/dev/.codex/config.toml`.

## Affected files and state

Repository:

- modify `ops/socraticode-runtime/socraticode-mcp.sh`
- modify `ops/socraticode-runtime/tests/test-cleanup.sh`
- add `ops/socraticode-runtime/tests/test-external-launcher.sh`
- add `ops/socraticode-runtime/systemd/socraticode.slice`
- modify `ops/socraticode-runtime/README.md`
- retain the approved design and this quick-plan package

Installed/runtime:

- replace `/home/dev/tools/socraticode-docker/socraticode-mcp.sh`
- add `/etc/systemd/system/socraticode.slice`
- modify `/home/dev/.codex/config.toml`
- change restart policy only for stopped `socraticode-qdrant` and
  `socraticode-ollama`
- preserve all volumes and disabled unit states

## Implementation approach

### Launcher behavior

Add exact external endpoint constants, a bounded curl helper, model
verification, two non-blocking slot locks, and a running-managed-container
count. Remote probes occur before cleanup or Docker mutation.

After successful probes, retain the existing fail-closed orphan cleanup. Reject
launch when two managed containers are already running. Start one MCP container
with:

- exact external Qdrant/Ollama/model environment;
- no Docker socket or Docker socket group;
- `--memory=3g`;
- `--memory-swap=3g`;
- `--pids-limit=256`;
- `--cgroup-parent=socraticode.slice`;
- existing managed-container ownership labels and signal cleanup.

The launcher holds its slot lock until its owned container exits.

### Resource guard

Add and install `socraticode.slice` with a 5 GiB throttle threshold, 6 GiB hard
maximum, zero swap, and 512-task maximum. Verify the unit before daemon reload
and verify effective properties after installation.

### Cutover

Create a timestamped backup manifest before mutation. Install only validated
files. Set both stopped local data containers to restart policy `no` without
starting them. Keep watcher/index/cleanup timer disabled and inactive.

Change the Codex MCP entry from direct `npx` to the installed launcher and
remove redundant external environment from the Codex config so the launcher is
the single endpoint/resource authority. Preserve tool approval settings.

### Live verification

Run endpoint and model probes, syntax/tests, systemd verification, manual MCP
JSON-RPC smoke, installed-container inspection, concurrency rejection, local
container stopped-state checks, cgroup/PSI checks, and SmartSpecPro health
probes.

Compare local Qdrant/Ollama state and start timestamps against the backup
baseline. Any unexpected local start is a blocking rollback condition.

## Risks and mitigations

- MCP image unexpectedly requires Docker socket:
  fail the smoke test and disable the MCP config; never restore local fallback.
- Three GiB is insufficient for one operation:
  allow the individual MCP container to fail; do not raise limits during this
  cutover without fresh evidence and a new decision.
- Stale managed orphan occupies a slot:
  existing proof-of-orphan cleanup handles it after the grace period; otherwise
  fail closed.
- External service becomes unavailable:
  exit before cleanup/start and direct operators to firewall/ESET on
  `192.168.1.119`.
- Systemd cgroup-parent syntax differs on the live Docker driver:
  validate with a bounded smoke container before treating the rollout as
  complete; disable MCP if the dedicated slice is not effective.
- Dirty repository:
  stage/edit only allowlisted paths; do not run broad formatting or git-add.

## Security and data boundary

- No Docker socket is exposed to the MCP container.
- No secrets or API keys are added.
- Source remains local to the LAN environment.
- External endpoints are exact LAN HTTP endpoints approved by the user.
- No data container, volume, collection, or model is deleted.
- Safe rollback leaves local data services stopped.

## Acceptance criteria

All acceptance criteria from the reviewed design must pass, including:

- successful MCP status through external services;
- no configured local fallback;
- at most two MCP containers;
- 3 GiB per-container and 6 GiB aggregate no-swap limits;
- unchanged local data-container start timestamps;
- both local data containers stopped with restart policy `no`;
- persistent units disabled/inactive;
- healthy SmartSpecPro probes.

## Rollout and testing notes

The current task cannot dynamically acquire a newly configured MCP tool catalog.
Manual JSON-RPC smoke is the authoritative rollout proof. A new Codex task will
load the updated MCP entry.

Deep-implement may create scoped repository commits for owned paths. No push,
persistent service enablement, or broad restart is part of this task.
