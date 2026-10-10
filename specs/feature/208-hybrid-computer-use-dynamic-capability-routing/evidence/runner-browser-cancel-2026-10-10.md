# SPEC-208 Runner cancellation checkpoint — 2026-10-10

## Integrated source and scope

- Canonical ref: `refs/heads/main`
- Integrated implementation SHA: `434d49424a4dd03fd617615c26bd125b3f0bcc0a`
- PR #531 merge `23e2601ecc8b0662c343c4b3f6204a4424a50899`: asynchronous Runner-owned Chromium browser execution, cancellation, process-group cleanup, and receipts.
- PR #534 merge `12a20dc1752e2f90d7d8ac0e45ddbd1ef979b993`: one active browser process per Runner, with a terminal failure when capacity is full.
- PR #538 merge `434d49424a4dd03fd617615c26bd125b3f0bcc0a`: compare cancellation commands with the original contract, user/project/workspace, lease/fence, tenant, Runner/session/capability/origin, adapter/version, browser engine, and authorization grant. `inputRef` is intentionally different on cancel commands and is not compared.
- Chromium remains the production default. The Runner still rejects `browser_engine_constraint=moli` with `RUNNER_BROWSER_ENGINE_UNSUPPORTED`.
- This is a Chromium cancellation/resource-boundary increment. It does not claim Moli execution or close W2/W3/W5.

## Runner ownership map

| Boundary | Current owner and path | Verified state |
|---|---|---|
| `worker_jobs` attempt dispatch and lease assertion | `apps/web/server/services/computerUseRunnerJobExecutor.ts` | Existing path checks the lease before dispatch. |
| Runner command receive/authorization/receipt loop | `apps/runner-app/src/diagnostics.rs` | Existing Runner control loop; browser execution now runs in a background owner so the loop can receive cancel commands. |
| Command protocol and Chromium pin | `apps/runner-app/src/protocol.rs` | Moli remains rejected; Chromium-only behavior is tested. |
| Tenant/session/capability/grant/deadline/fencing checks | `apps/runner-app/src/control_channel.rs` | Validates Runner binding, command deadline and monotonic fencing. It does not query the live `worker_jobs` lease itself. |
| Chromium process and profile | `apps/runner-app/src/adapters.rs` | Runner owns process group, CDP connection and temporary profile; cancellation terminates/reaps the group and retries profile removal. |
| Receipt journal and delivery | `apps/runner-app/src/diagnostics.rs`, `apps/runner-app/src/journal.rs` | Uses existing receipt contracts. Accepted browser cancellation is acknowledged after cleanup; cleanup failure is `UNKNOWN_OUTCOME`. |
| Moli isolation helpers | `apps/runner-app/src/moli_isolation.rs` | Profile/data-root and network policy primitives exist. The process launcher is `cfg(test)` only; no production Moli caller exists. |
| Generic container lifecycle | `apps/cloudflare/src/runnerContainer.ts` | Assignment-scoped generic lifecycle exists, but no verified binding/configuration ties it to Moli isolation or Runner CDP execution. |

## Verification on exact integrated SHA

Prepared and verified an isolated canonical source workspace at `434d49424a4dd03fd617615c26bd125b3f0bcc0a`. Commands ran through the canonical source lease.

- `cargo fmt --manifest-path apps/runner-app/Cargo.toml -- --check` — exit 0.
- `cargo check --manifest-path apps/runner-app/Cargo.toml --lib` — exit 0.
- Eight focused Rust tests — each 1 passed, 0 failed, exit 0:
  - `browser_profile_cleanup_retries_transient_remove_failures`
  - `browser_process_group_cleanup_reaps_child_and_removes_profile_idempotently`
  - `browser_cleanup_reports_profile_failure_after_reaping_process_and_can_retry`
  - `browser_execution_cancellation_signal_is_idempotent_and_observable`
  - `browser_cancellation_requires_the_full_original_runner_binding`
  - `browser_execution_capacity_is_bounded_to_one_active_process_per_runner`
  - `job_commands_reject_browser_engines_without_a_runner_security_gate`
  - `cancellation_rejects_targets_from_another_binding`
- `git diff --check` — exit 0.
- These are scoped Rust tests. They do not execute an end-to-end Moli job.

## Ten distinct QA code-review passes

These are static, source-based review passes. They are separate from the eight runtime unit tests above and are not counted as runtime verification suites.

1. **Execution ownership:** traced web executor → Runner command loop → adapters → receipt journal. Finding: the Chromium path is owned by Runner; no Moli process-launch caller is wired.
2. **Protocol and production default:** checked `protocol.rs` and `control_channel.rs`. Pass: unsupported/non-Chromium engines still fail closed; Chromium remains default.
3. **Authorization and tenant binding:** checked `accept_job_command`. Pass for command-bound tenant, Runner/session, capability snapshot, grant, and deadlines; no Moli dispatch exists.
4. **Lease and fencing:** checked web executor lease assertion and Runner monotonic fencing/idempotency. Partial: pre-dispatch lease assertion and stale-fence rejection exist; Runner does not re-query live lease expiry/revocation while a process is running.
5. **Cancel target identity:** checked `cancellation_target_matches` and its mismatch tests. Pass after PR #538 for the persisted binding fields; the distinct cancel `inputRef` remains intentionally excluded.
6. **Receipt and settlement:** checked cancellation receipt handling and `jobControlPlane.ts`. Partial: accepted cancel acknowledgement is terminal settlement only after cleanup; there is no actual Runner-to-`worker_jobs` E2E test for this new browser path.
7. **Process and profile cleanup:** checked process-group termination/reaping and profile retry/failure handling. Partial: synthetic child-process tests pass; no Moli process is spawned through Runner.
8. **Resource bounds:** checked the browser worker map and timeout. Partial: one active browser process per Runner and a 30-second execution maximum are enforced; there is no explicit production memory/CPU limit for Moli.
9. **Storage, protocol exposure and egress:** checked Moli isolation helpers and runtime wiring. Blocked: user/network namespace launch is test-only, filesystem isolation and private CDP/WebDriver/BiDi boundary are not wired, and destination/redirect policy is not enforced in a Moli runtime.
10. **Supply chain and deployment target:** reviewed `evidence/moli-w4-recheck-2026-10-10.md`. Blocked: 11 advisory records remain applicable to the pinned graph; fixed upstream crate versions do not have a verified Moli rebuild; publisher provenance, authoritative deployed-artifact inventory and complete notices review remain open.

## Remaining blockers and next action

- **W2 open:** implement a Runner-owned per-attempt Moli process/profile boundary with filesystem and credential separation, private listener access that prevents WebDriver/BiDi bypass, resource limits, and destination/redirect enforcement. Keep the protocol guard and production flag unchanged until executable security tests pass.
- **W3 open:** after W2 passes, connect the existing authorized `worker_jobs` attempt to Moli navigation/DOM extraction, result/receipt/settlement, cancel/lease revocation and cleanup. The existing Chromium cancellation code is groundwork only.
- **W4 open:** no advisory suppression; obtain or produce verifiable provenance/rebuild evidence, complete notices review and bind findings to an authoritative deployed target.
- **W5/W6/W7 not run:** no Moli Runner E2E, no 80-case benchmark, and no canary/release decision.
- Production state: Moli dispatch remains disabled; no tenant traffic or Production job was run.

## Separate Moli process smoke (not Runner E2E)

A prior local smoke in this authorized session spawned the pinned Moli 1.1.15 binary (`sha256:f927b72192905c092ec95c8f528e35087224f3fe8750f72fb2147efa676eab8d`) inside Linux user+network namespaces. `/json/version` was reachable only inside the namespace; Moli fetched a synthetic loopback fixture and returned its marker; the namespace had no external route; the process was terminated and waited; exit code 0. This smoke used a one-off harness that is not committed here. It did not traverse Runner command authorization, CDP adapter, receipt journal, `worker_jobs` settlement, or Runner-owned profile cleanup, so real Moli Runner execution remains **NOT RUN**.
