# Section-07 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: **REQUEST_CHANGES** (3 BLOCKER + 2 MAJOR + 2 MEDIUM + 2 minor) →
all fixed (see interview file). No foreign hunks in the two edited shared
files (_core/index.ts, systemSettings.ts) — both hunks fully hermes-scoped.

## Findings
1. **BLOCKER — env leak:** `{...process.env}` at jobHandlers.ts:346/:455
   and main.ts:70 handed DATABASE_URL/JWT_SECRET/LLM_ENCRYPTION_KEY/
   HERMES_WORKER_TOKEN to the Hermes CLI child. FIXED (allow-list builder
   + leak tests).
2. **BLOCKER — signal-4 unreachable:** assertConfined checked
   forbiddenRoots before allowedRoots; job's own cache dirs nest under
   profileRoot → cache scan always rejected. FIXED (allowed-first).
3. **BLOCKER — PUT result discarded:** no ok-check/retry; failed upload →
   completeArtifact → "completed" with no bytes. FIXED.
4. **MAJOR — capability never reached the server:** main.ts never
   registered; pairing hardcoded doctorOk:false. FIXED at the pairing
   script (real probe); heartbeat metadata = observability only
   (verified it lands in capabilitiesJson.runtimeMetadata, not .hermesMedia).
5. **MAJOR — logging:** console.* in main.ts + no logger passed to
   createJobHandlers (NOOP swallow). FIXED.
6. **MEDIUM — no claim backpressure** (out-claimed own cap → lease
   expiry/duplicate work). FIXED via activeCount() gate.
7. **MEDIUM — wrong retryability** for format-invalid references. FIXED
   (HERMES_OUTPUT_INVALID, documented reuse).
8. **MINOR — unbounded connectionLocks map.** FIXED (idle prune).
9. **NIT — leftover-output guard trusted unvalidated files.** FIXED.
10. **Clean — lock order** (connection lock before global semaphore) is
    correct and deadlock-free.

## Clean
Argv arrays/no shell/adversarial-prompt safety; file toolset default-off;
no db import under hermesWorker/; timeouts + SIGTERM→grace→SIGKILL;
workspace retention/eviction/freeDiskBytes; systemd unit matches the
template and is NOT installed; pairing prints token once + writes only
hermes_shared_worker_id; dev drainer default-OFF + hooks mirror the
render-worker precedent; control jobs delegate to section-04 (masked).
