# Section 01 — Launcher Tests and External Policy

## Ownership

- `ops/socraticode-runtime/socraticode-mcp.sh`
- `ops/socraticode-runtime/tests/test-cleanup.sh`
- `ops/socraticode-runtime/tests/test-external-launcher.sh`
- `ops/socraticode-runtime/README.md`

Do not modify installed runtime or Docker/systemd state in this section.

## TDD expectations

Write the external-launcher fixture first and confirm it exposes the current
unsafe behavior. Cover:

- successful exact endpoint/model preflight;
- Qdrant failure;
- Ollama failure;
- missing embedding model;
- both concurrency slots unavailable;
- two running managed containers;
- exact resource arguments;
- exact external environment;
- absence of Docker socket mount/group access;
- firewall/ESET error direction;
- no Docker run on any fail-closed path.

Update the cleanup lifecycle fixture to provide fake endpoint probes.

## Implementation

Modify the launcher to implement the fixed sequence from the reviewed design:
slot, probes, fail-closed exit, orphan cleanup, managed-container count,
resource-limited MCP start, cleanup.

Keep existing labels, PID identity metadata, signal handling, and owned
container removal.

## Acceptance checks

- focused launcher fixture passes;
- cleanup lifecycle fixture passes;
- Bash syntax passes;
- launcher command capture contains no `/var/run/docker.sock`;
- production constants contain only the approved `.119` endpoints.

## Risks

- Tests that accidentally contact live endpoints.
- Slot locks not held for the full MCP lifetime.
- Docker `ps` count format diverging from cleanup conventions.

Use injected fake binaries and temporary lock directories to keep fixtures
fully local.

## Implementation result

Status: implemented and reviewed.

Files changed:

- `ops/socraticode-runtime/socraticode-mcp.sh`
- `ops/socraticode-runtime/tests/test-cleanup.sh`
- `ops/socraticode-runtime/tests/test-external-launcher.sh`
- `ops/socraticode-runtime/README.md`

The implementation added a global admission lock beyond the original two-slot
plan. The admission lock closes an orphan-plus-two-launcher race by remaining
held until Docker reports the new MCP container as running.

Focused coverage includes exact endpoints/environment, Qdrant failure, Ollama
failure, missing model, slot exhaustion, managed-container exhaustion,
resource arguments, Docker-socket absence, mutation ordering, and lifecycle
cleanup. The retained watcher suite has four passing tests.
