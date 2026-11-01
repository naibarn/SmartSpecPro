# Minimal Worker & Build Performance Budget — R0.5

These are **soft engineering objectives**, not arbitrary development/real-user beta gates. All values are provisional until real baseline measurements. Cloudflare enforced resource limits still apply.

| Surface | Initial optimization objective | Measurement method |
|---|---|---|
| Core Worker JS | <= 2 MiB uncompressed, stretch <= 1 MiB | `wrangler deploy --dry-run --outdir ...`; record Total Upload + gzip |
| Simple Module Worker JS | <= 1 MiB uncompressed, stretch <= 512 KiB | Module's own Wrangler dry-run and import graph |
| SaaS Shell first-route JS | <= 200 KiB gzip | Real browser network/cold cache + static route assets |
| Extra Module initial JS | <= 150 KiB gzip beyond Shell where practical | Dynamic import/chunk histogram |
| Initial route CSS | <= 50 KiB gzip | Browser network transfer |
| Startup | stretch <= 100 ms measured startup | Wrangler startup reporting and Cloudflare real environment |
| Isolate memory | within platform hard 128 MB; minimal caching | runtime observability, allocation sampling |
| Database queries | aim <= 2 network round trips for simple Core reads | per-request SQL tracing, EXPLAIN for heavy paths |
| API latency | p50/p95/p99 by route; aim <= 0.8x measured legacy p95 for equivalent requests | paired workload samples on Debian and Cloudflare |
| CPU | low single-digit ms for simple handler code; hash/MFA separately | Cloudflare Worker CPU metrics per route class |
| Core build peak RSS | aim <= 1.5 GiB; module builds independently | `/usr/bin/time -v` or equivalent and cached/clean builds |
| Cloudflare bill | avoid always-on Containers; capture requests/CPU/subrequests and service charges | provider usage and release receipts |

Cloudflare platform limits at review: 64 MiB **uncompressed** Worker bundle, 128 MB isolate memory, 1-second Worker startup. gzip is a transfer/bundle analysis metric but **not** a deployment size limit. Static asset requests should be handled as Static Assets rather than invoking a Worker when possible. Do not bundle image/video/transcode tools, docs, binary weights or source maps into Worker JavaScript. Every performance miss gets a scoped profile + next optimization task; no generic `BLOCKED_ALL` for a missed soft target.

## R0.5 job/executor cost profile (advisory measurement, not permission gate)

Track per job class: queue operations, Worker CPU, ack/retry/DLQ, average/p95 queue wait, Rust binary size and peak RSS, Rust idle CPU, available host capacity and cost, stage/checkpoint timing, DB round-trips, R2 I/O, provider costs, and total job execution latency. Establish baseline for short TS consumer vs Rust HTTP pull and plain PostgreSQL claiming. Small enqueue envelopes (<2 KiB desired), no standing Cloudflare Containers, no long-wait Worker invocation are target designs. Validate actual Cloudflare consumer 15-minute wall clock limit and up to 5-minute CPU limit; no blanket requirement to deploy a Queue per Module.
