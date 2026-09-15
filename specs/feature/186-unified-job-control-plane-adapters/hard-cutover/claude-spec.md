# Hard Cutover Consolidated Specification

The implementation makes `worker_jobs` the only side-effecting asynchronous job
ingress. A server-context gateway validates a registered job definition and
creates the canonical row, lifecycle events, and outbox intent in one database
transaction. The outbox publisher is a bounded runtime loop. It chooses a
transport adapter from server-side registration and publishes a deterministic
envelope containing only canonical identity, contract version, attempt, and
bounded routing metadata.

BullMQ and Celery consumers become thin generic wrappers. They reject unknown
contract versions before claim, load context from PostgreSQL, claim a fenced
lease, execute a registry handler, and report completion/failure through the
control plane. Existing domain code is reused behind handlers; its direct queue
submission calls are removed or moved behind the gateway. Every migrated
producer/consumer pair is recorded in the rollout manifest.

The implementation is staged in low-risk to high-risk waves. Notification,
webhook, automation, maintenance, media, CPU, and external jobs are not
enabled together. Paid/provider work is blocked until durable operation keys and
settlement evidence exist. No Cloudflare production cutover is included.
