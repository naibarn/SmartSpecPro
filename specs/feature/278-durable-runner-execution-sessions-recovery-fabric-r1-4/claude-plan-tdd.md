# TDD Plan — Spec 278

Follow the sections in `claude-plan.md` and add tests before implementation for each invariant. Do not write placeholder-only tests or treat mocks as OS/provider certification.

1. **Contracts/projection:** state transition table and invalid edge rejection; revision monotonicity; continuity honesty; append-only event sequence; tenant scoping; dark flag leaves current execution behavior unchanged; protocol v1 compatibility.
2. **Session Host/registry:** atomic persistence across injected crash points; checksums and quarantine; no secret serialization; path traversal/symlink rejection; concurrent lock exclusion; PID reuse defense; actual child + descendant termination and PTY reattach on platform CI; terminal receipt is durable before host exit.
3. **Recovery/fencing:** only canonical active job/fence resumes; simultaneous adoption has one winner; stale epoch/revision cannot mutate or resurrect; grant signature/scope/key rotation/expiry errors quiesce; wall-clock rollback/suspend uncertainty cannot extend grant; approval/cancel recovery is idempotent.
4. **Ordered lane:** duplicate command key returns original receipt without a second effect; out-of-order commands reject; sequence/watermark/outbox survive restart; input ownership epochs prevent races; output spool caps and truncates explicitly; critical receipts survive output pressure; old binary lacking required safety bits becomes incompatible without killing the workload.
5. **Resource admission:** stale inventory rejects; conflicting reservations cannot overcommit; release/expiry idempotent; reserved capacity is not misreported as enforced capacity; resource limits are reflected in capability policy.
6. **Drivers/checkpoints:** adapter cannot claim stronger continuity than certification; checkpoint digest/scope/lineage/commit mismatch prevents restore; external handle is tenant/session/generation scoped; untrusted driver cannot self-certify.
7. **Cloudflare:** snapshots restore filesystem state into a replacement instance but never assert live-process persistence; failure/retry preserves canonical job state and evidence.
8. **Stream:** viewer reconnect does not create execution; bounded backpressure, independent control channel, ordering, truncation marker, disconnect and authorization revocation.
9. **Task Control:** stale heartbeat cannot say still running/recovered; tenant isolation; loading/error/unsupported/recovery states; keyboard and responsive browser coverage.
10. **Commercial:** grant envelope bounds offline effects; expired/revoked/budget-exhausted grant blocks new effects; receipt dedupe; pinned release and tenant/ancestor binding persist through recovery; Runner cannot alter balance; non-commercial requests remain compatible; receipt survives output spool saturation.
11. **Integrated gates:** AC traceability check; migration journal/snapshot check; transition/fault injection matrix; release tier requires exact environment evidence and defaults to no beta claim.

For every failure test, assert durable and canonical outcomes, not only returned error strings. Use a real PostgreSQL transaction/concurrency test for CAS and constraints when available. Record unavailable platform/provider evidence as open certification gates, not passed tests.
