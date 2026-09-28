# Adversarial Plan Review — Round 1

## Findings

1. **A green local verifier could be confused with target deployment.** Fixed by maintaining separate `LOCAL_PASS`, `TARGET_PASS`, and `CUTOVER` states and recording the current `target_evidence_file` blocker.
2. **KV is eventually consistent and can retain stale cache values.** Acceptable only because this cache is disposable/read-mostly; plan explicitly excludes revocation, exact counters, locks and business authority.
3. **An Admin switch could appear to provision Cloudflare or leak a bearer secret.** Plan requires backend-only secret storage, authenticated probe, sanitized status, and explicit copy that the switch does not provision Worker resources.
4. **Cache configuration could accidentally activate the queue Worker.** Plan separates cache-specific activation from `CLOUDFLARE_ACTIVATION` used by job/runtime paths.
5. **A maintenance pause could discard a provider call whose outcome is unknown and later duplicate a paid effect.** Plan requires canonical job inspection and provider reconciliation before resume/replay.
6. **DO could be introduced as a reflexive Redis replacement or global singleton.** Plan requires a concrete per-entity coordination/realtime need, tenant auth, sharding and lifecycle recovery; KV cache does not require DO.
7. **The four-day target can be mistaken for guaranteed completion.** The deadline is an execution target; each item remains conditional on actual target access and acceptance evidence. The plan forbids claiming full migration if critical dependencies remain.

## Result

No unresolved design issue prevents beginning repo-local implementation. Target deployment remains blocked until authentic target evidence/deploy identity exists. Continue independent work rather than pausing the whole migration.
