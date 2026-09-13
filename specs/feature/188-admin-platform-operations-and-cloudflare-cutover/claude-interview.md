# Feature 188 — Interview Transcript

## Q1 — Production database topology

ปัจจุบัน PostgreSQL ของ Dev Server อยู่บน provider/instance ใด และ Production target จะใช้ PostgreSQL instance เดิมที่ย้ายขึ้นไป หรือสร้าง instance ใหม่แล้วให้ Cloudflare เชื่อมผ่าน Hyperdrive?

### User answer

สร้าง instance ใหม่แล้วให้ Cloudflare เชื่อมผ่าน Hyperdrive

### Captured decision

Production uses a new PostgreSQL instance. The current Dev Server database remains the promotion source during preparation. The migration plan must perform a full source-to-new-target snapshot, continuous change synchronization, final write fence, final delta, and complete validation before Cloudflare activation. Cloudflare production accesses the new target through Hyperdrive; it must never connect directly to the Dev database.

## Auto-decisions

- Use the existing repository and package/test stack.
- Use Feature 186 worker_jobs and worker_job_events as the canonical job ledger.
- Treat native PostgreSQL logical replication as the preferred synchronization mechanism only if source/target provider capabilities, versions, extensions, permissions, and schema ownership pass a preflight gate.
- Use a durable transaction-watermark delta exporter as the required fallback when native logical replication is unavailable; periodic best-effort copying is not accepted.
- Keep Dev and Production databases, storage, queues, workflows, indexes, secrets, network identities, and admin scopes separate after cutover.
- Use Hyperdrive as the Cloudflare-to-Production-PostgreSQL connection boundary and validate its connection, transaction, latency, pool, and prepared-statement behavior before activation.
- Use Vitest, Playwright, Drizzle migration tests, adapter contract tests, failure-injection tests, static call-site scans, and runtime/network audit evidence.
