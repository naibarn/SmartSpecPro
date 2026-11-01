# ADR-002 — Rust-first Native Job Supervisor with TypeScript Edge Queues (R0.5, 2026-11-01)

## Decision

Use **Rust (native, outside Cloudflare Workers)** for the new optional/extendable long-running job supervisor and capacity-controlled executor. Keep **Hono/TypeScript** for core job HTTP intake, compact Queue producer, short push consumer and service-bound API. **Go stays supported as an alternative native executor** but is not the chosen new default. Keep Python OpenAI Agents SDK, Codex/Runner and FFmpeg/GPU/provider executors. Share only small versioned job contracts where feasible; do not force native OS execution crates into a `workers-rs` Wasm bundle.

**Existing canonical PostgreSQL `smartspec.worker_jobs` + transactional outbox/lease/fencing/attempt** is the source of truth. Cloudflare Queue transports work; it does not own the logical job state. SPEC-207 is the single settlement authority. No second job ledger, no new orchestration plane and no broad approval gating for unrelated UAT.

## Reasoning

Rust offers no-GC runtime and fine-grained memory/concurrency control for a long-lived native multi-tenant supervisor. It aligns more directly with Cloudflare Rust API bindings than Go/Wasm, **but Rust/Wasm must not be assumed to outperform a small TS Worker**. Go may be faster to implement and equally reliable architecturally. We choose Rust for the new long-term supervisor, subject to measured build/runtime/resource evidence. Language cannot ensure `exactly once` and cannot prevent an OS kill or host outage.

## Reliability invariants

- Accept 202 only after canonical job+outbox DB transaction; idempotency key handles uncertain commits.
- At-least-once Queue delivery means duplicates; claim with attempt fencing, exact tenant authority, idempotent external effects and single settlement owner.
- Queue ACK after proven durable DB handoff or terminal result and a real recovery scanner. Never ACK only because a subprocess was launched.
- Crash/kill/host reboot: lease expiry, reclaim, checkpoint and deterministic recovery; externally uncertain outcome is reconciled before retry.
- No job disappears from the canonical DB due to Queue retention expiry, DLQ cleanup or ACK. Alert on stuck jobs, expire safely and provide operator reconciliation.
- Monitor backup/PITR restore ability; cannot promise no loss if canonical DB and all backups fail.
- Bound Rust concurrency, DB pool, provider quotas and tenant fairness; support multiple supervisor replicas when workload demands.

## Cloudflare-specific placement

- Small TS push consumer is cheap when idle; use it for bounded dispatch and provider callbacks.
- Cloudflare Push queue invocation: 15 minute wall-clock, up to configurable 5 minute CPU. Never use it for multi-hour jobs.
- Rust `workers-rs` supports Queues event handlers and bindings but compiles to Wasm with JS interop and possible larger bundles. A focused small Rust/Wasm Queue adapter is an **optional comparison**, not the default.
- Native Rust can use a separately configured HTTP Pull Queue, or direct DB claiming, but one Queue cannot have push and pull consumers simultaneously. HTTP Pull uses short polling; idle calls cost operations. Only use with load justification.
- Queue retention max 14 days. DLQ and provider retry limits cannot replace the canonical job sweep. Production native supervisor on Debian remains dependent on Debian unless alternative compute is added.

## Cost and measured evidence

Compare Rust and Go native on a representative job where possible: throughput, peak RSS, per-job CPU, p95 queue start, recovery after process kill, developer complexity, build RAM and binary size. Compare TS versus optional Rust/Wasm on actual upload bytes, startup CPU and failure scenarios. Require neither artificial performance thresholds nor all-platform soak for an otherwise safe limited beta; do require targeted correctness for any money-moving or data-mutating job class before enabling that action.

## References

- https://developers.cloudflare.com/workers/languages/rust/
- https://developers.cloudflare.com/workers/runtime-apis/webassembly/
- https://developers.cloudflare.com/queues/platform/limits/
- https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- https://developers.cloudflare.com/queues/configuration/pull-consumers/
- https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
