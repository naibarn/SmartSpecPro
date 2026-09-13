# Orchestra Backlog

- Existing legacy direct BullMQ/Celery call sites remain intentionally unmigrated until their queue-family manifests and cutover evidence are ready. This is an explicit Feature 186 rollout gate, not a hidden implementation defect.
- Cloudflare production deployment/account verification remains deferred because this task has no production provider authorization and the specification explicitly excludes deployment.
- Full repository typecheck and Drizzle snapshot check retain known baseline/environment failures; changed-path focused proof remains required.
