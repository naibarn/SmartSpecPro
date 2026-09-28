# TDD Plan

## Red phase

Add launcher-focused fixture coverage before changing the launcher.

Expected failures against the current launcher:

1. external Qdrant/Ollama probes are absent;
2. Qdrant external variables are absent;
3. Ollama uses port `11434`;
4. Docker socket is mounted;
5. per-container memory is 4 GiB;
6. no two-slot admission control exists;
7. no dedicated `socraticode.slice` cgroup parent is used;
8. endpoint failure does not emit the required firewall/ESET direction.

## Green phase

Implement the minimum launcher and slice changes required for the focused
fixtures to pass.

The fake-command test setup must support:

- fake `curl` with success, endpoint failure, and missing-model modes;
- fake `docker ps` running-managed count;
- fake `docker run` argument capture;
- fake `flock` failure for slot exhaustion;
- no real Docker/container mutation.

Update the existing cleanup lifecycle fixture so its launcher invocation uses
the fake external-service probes.

## Refactor phase

After focused tests pass:

- consolidate repeated launcher error handling;
- keep production endpoint values obvious and single-sourced;
- retain current signal/owned-container cleanup behavior;
- rerun all launcher and cleanup fixtures after any refactor.

## Runtime verification

1. `bash -n` all changed shell scripts.
2. Run focused external-launcher fixtures.
3. Run existing cleanup lifecycle fixtures.
4. Run watcher Node tests to prove retained runtime behavior.
5. Run `systemd-analyze verify` against staged and installed units.
6. Run manual live MCP smoke.
7. Inspect live MCP environment, mounts, memory, swap, PIDs, and cgroup parent.
8. Prove a third concurrent attempt is rejected without container creation.
9. Prove local Qdrant/Ollama state/start timestamps are unchanged.
10. Recheck PSI, cgroup events, and application health.

## Regression policy

Any implementation repair makes launcher fixtures, cleanup fixtures, systemd
verification, and live MCP inspection stale. Rerun the affected checks after
the final change.
