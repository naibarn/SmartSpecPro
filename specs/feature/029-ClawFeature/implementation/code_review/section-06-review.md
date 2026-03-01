## Summary

The implementation delivers the core voice gateway plumbing (WebSocket server, STT/TTS service abstraction, consent endpoints, Python stt.py) but has critical gaps: the `voiceChat` feature-flag gate is entirely absent from every entry point, credit deduction is never actually called in the WebSocket session handler, the `onTranscript`/`onResponse` props are declared but never wired (making the voice component non-functional for its stated purpose), and the stt.py ImportError fallback silently returns fake transcripts instead of 503s.

Additionally, the agency.ts staged diff includes a large volume of pre-existing unrelated changes (marketplace, sharing, versioning, auto-create, publish flow) and apparently removes `detectFlowCycle` calls from `createFromTemplate` and `saveBuilder`.

## Findings

### HIGH severity

- H1: Feature flag not checked anywhere — `POST /api/voice/session`, `handleVoiceUpgrade`, `useVoiceChat.ts`, and `VoiceChat.tsx` contain no `getTenantFeatureFlag(tenantId, 'voiceChat')` check. Any user on any tenant can reach the voice gateway regardless of flag setting. Required test case ('rejects when voiceChat feature flag is disabled') is absent.

- H2: Credit deduction never executed in live session — `dispatchSTT` calls `transcribe()` but never calls `creditService.deductCredits`. `_userId` is passed but prefixed with underscore and unused. The plan's credit integration (section 6.3) requires STT cost logging and credit deduction after each dispatch; none of this exists.

- H3: Cycle-detection removal in agency.ts — The diff removes `detectFlowCycle` calls from both `createFromTemplate` and `saveBuilder` with no explanation. This is a regression that allows infinite-loop agent graphs. (NOTE: These appear to be pre-existing working-tree changes that were accidentally staged alongside the `builtin-voice` addition.)

- H4: Tenant token race at WebSocket upgrade — Consent is only checked at token creation time. During the 30s token TTL, consent can be withdrawn without blocking the upgrade. Plan acknowledges this tradeoff but implementation makes no attempt to re-verify at upgrade time.

### MEDIUM severity

- M1: `ScriptProcessorNode` deprecated — `useVoiceChat.ts` uses `ScriptProcessorNode` (runs on main thread, deprecated). Plan mentions AudioWorkletNode as preferred. No fallback/detection attempted.

- M2: Audio context lifecycle — `useVoiceChat.ts` creates `AudioContext` twice (recording + playback path) with only one closed on cleanup. Multiple rapid TTS chunks can play simultaneously without coordination.

- M3: Rate limiter window logic — Warning counter only increments at most once per 10s window (`now - rateLimiter.windowStart > RATE_WARNING_WINDOW`). A sustained burst never accumulates 3 warnings and the connection is never closed — only frames are dropped indefinitely.

- M4: SSRF bypass via prefix match — `agency_tools.py` line: `if url.startswith(_INTERNAL_SERVICE_URL): return`. A URL like `http://127.0.0.1:3000.evil.com/...` passes this check. Should validate parsed hostname+port, not string prefix.

- M5: Consent endpoints bypass tRPC stack — Consent grant/withdraw are raw Express routes instead of tRPC procedures, bypassing the rate limiting, input validation, and audit logging that all other mutations use.

- M6: Missing WebSocket test cases — Tests for frame size rejection, 300s timeout, 60s buffer auto-dispatch, concurrent session limit, and feature flag rejection are absent.

- M7: stt.py mock fallback returns success on ImportError — If `UnifiedLLMClient` is not importable, endpoint silently returns `[Transcription not available...]` with confidence 0.0 instead of 503. Same for TTS: returns silent bytes instead of failing.

- M8: Dynamic import anti-pattern — `voiceGateway.ts` uses `await import('../services/sttService')` on every STT dispatch. Should be a static import at top of file.

### LOW severity / Nitpicks

- L1: `onTranscript`/`onResponse` props declared but never wired — `VoiceChat.tsx` declares these props but the component destructure ignores them, and `useVoiceChat` never calls them. Voice transcriptions/responses never surface to the parent chat component.

- L2: `console.log` in production hook — `useVoiceChat.ts` line 485 has `console.log('[Voice] System:', msg.message)`. Should use structured logger.

- L3: SVG XSS insufficient — `agency.ts` regex `/<script/i` misses many SVG XSS vectors (`onload`, `xlink:href=javascript:`, event handlers). Pre-existing/unrelated to Voice.

- L4: `voiceCreditIntegration.test.ts` thin — Only duplicates a subset of sttService/ttsService tests. Intended tests (costTracker.logRequest, creditService.deductCredits, mid-session depletion) are absent.

- L5: Python TTSRequest allows empty text — No `min_length=1` validator; zero-length strings pass the max-chars check.

- L6: `restoreVersion` no schema validation — Snapshot JSON loaded directly from DB with no validation; corrupted/old-schema snapshots bypass all validators. Pre-existing/unrelated.

- L7: Diff scope creep — 1118 insertions in agency.ts are mostly pre-existing unrelated changes (marketplace, sharing, versioning, publish flow). Only `builtin-voice` addition is relevant to Voice Chat.

### POSITIVE observations

- Lua script for atomic token consumption (GET + DEL) correctly addresses race condition.
- Per-connection in-memory rate limiter avoids Redis round-trips on hot audio path.
- `calculateSTTCredits` / `calculateTTSCredits` match plan formulas exactly (Groq free tier, ceiling rounding).
- Consent revocation pub/sub uses `redis.duplicate()` correctly.
- Python `stt.py` uses `secrets.compare_digest` for constant-time comparison.
- Redis cleanup on WebSocket close is properly implemented.
- `shutdownVoiceGateway` registered in both SIGTERM and SIGINT handlers.
- Test mocks use `vi.hoisted()` pattern consistent with project conventions.

## Verdict

REQUIRES CHANGES — Feature-flag gate missing (H1), credits never charged (H2), `onTranscript`/`onResponse` never called (L1), stt.py fake-success on ImportError (M7). These must be fixed before merge.
