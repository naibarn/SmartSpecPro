# Hard Cutover Decisions

## Decision 1: What does replacement mean?

The control plane replaces business job authority and producer ingress first.
Redis/BullMQ/Celery remain replaceable transport/execution adapters during the
first cutover. Removing them immediately is deferred until Cloudflare account
and recovery evidence exists.

## Decision 2: How are legacy handlers migrated?

Use an explicit registry and compatibility handler per job type. The transport
message contains the canonical ID and version; the handler loads authoritative
input from PostgreSQL or a verified domain binding. No generic `unknown` handler
may guess a domain operation from an arbitrary payload.

## Decision 3: How is rollout controlled?

One active side-effecting producer per job type. A server-side feature flag and
manifest select the gateway path. Legacy paths are retained only for in-flight
drain and have an owner/expiry. Rollback routes new work to the previous path,
while committed canonical history remains unchanged.

## Decision 4: What can be completed locally?

The local implementation can prove ingress, outbox, adapter, generic consumer,
fencing, and duplicate convergence. Cloudflare production activation,
Hyperdrive connectivity, real provider behavior, and deployment restart proof
remain explicit external gates.
