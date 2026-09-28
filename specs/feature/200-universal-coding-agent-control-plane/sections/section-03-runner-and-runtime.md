# Section 03 — Shared Runner and Runtime Discovery

## Source coverage

Feature 200 sections 9–10, 19–20, 26–27, 31, 34, 41, 43–45 and 49–50.

## Deliverable

Resolve eligible local/cloud runtime from Feature 197 snapshots and policy, send control through shared Runner channel, isolate workspaces and reconcile processes after restart/disconnect.

The runtime resolver consumes Feature 205's single redacted tool/capability
snapshot. It must distinguish a recognized installation from an executable
ready for selection and must not create a second provider scanner, Runner
registry or control channel. The six initial agent families are Codex, Claude
Code, Google Antigravity, DeepSeek Harness, Hermes Agents and OpenClaw-
compatible runtimes; adapter readiness remains an explicit per-provider gate.

## TDD steps

Test eligibility, stale snapshot, ACK/replay, process hang/restart, workspace confinement, cancellation and no second Runner channel; implement; rerun focused Rust/Web/Python tests.

## Completion gate

Cloudflare Containers are reached only through approved Feature 195 execution; local Docker/OpenSandbox dispatch is absent.
