I now have all the information needed to write the section. Let me compile the complete section for voice chat mode.

# Section 06: F05 -- Voice Chat Mode

## Overview

This section implements real-time voice chat capabilities for SmartSpecPro. Users can speak to the AI and receive spoken responses, with speech-to-text (STT) and text-to-speech (TTS) processing routed through the existing LLM gateway infrastructure. The feature includes WebSocket-based audio streaming, provider abstraction for multiple STT/TTS backends, credit integration with mid-session depletion handling, PDPA/GDPR consent management, a React frontend with voice activity detection (VAD), and agency/workflow tool registration.

**Feature flag:** `voiceChat` (default: `false`) -- must be enabled per tenant before any voice functionality is accessible.

## Dependencies

- **section-01-database**: Requires completion of:
  - `creditSourceType` enum: `tts` value added (note: `stt` already exists)
  - `llmProviders` seed data: Groq Whisper STT, OpenAI Whisper STT, ElevenLabs TTS, OpenAI TTS entries with real integer IDs
  - `users.voiceConsentGrantedAt` column: TIMESTAMPTZ, nullable
- **section-14-feature-flags**: `voiceChat` feature flag enforcement at tRPC/Express/UI levels
- **section-15-security-infra**: Nginx WebSocket proxy configuration for `/api/voice/stream`

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/routes/voiceGateway.ts` | WebSocket server for voice streaming + session token endpoint |
| `apps/web/server/services/sttService.ts` | STT provider abstraction (Groq Whisper, OpenAI Whisper) |
| `apps/web/server/services/ttsService.ts` | TTS provider abstraction (ElevenLabs, OpenAI TTS) |
| `apps/web/client/src/components/chat/VoiceChat.tsx` | Voice chat UI component |
| `apps/web/client/src/hooks/useVoiceChat.ts` | Voice session lifecycle hook |
| `python-backend/app/api/stt.py` | Python STT endpoint via unified_client |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/_core/index.ts` | Register voice gateway routes and WebSocket upgrade handler |
| `apps/web/server/services/costTracker.ts` | Add STT/TTS cost calculation logic |
| `apps/web/server/routers/agency.ts` | Add `builtin-voice` to BUILTIN_TOOLS array |
| `python-backend/app/services/agency_tools.py` | Register `builtin-voice` in `_BUILTIN_ENDPOINTS` and `_BUILTIN_RISK_LEVELS` |
| `python-backend/app/main.py` | Mount STT router |
| `apps/web/client/src/pages/Chat.tsx` (or equivalent) | Integrate VoiceChat component |
| `nginx/conf.d/dev-host.conf` | WebSocket upgrade for `/api/voice/stream` (covered in section-15) |

---

## Tests (Write First)

All TypeScript tests use Vitest with `vi.hoisted()` mocks. Python tests use pytest. Write these test stubs before any implementation.

### 6.1 Voice Gateway Tests

**File:** `apps/web/server/routes/__tests__/voiceGateway.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Voice Gateway — Session Token & WebSocket Tests
 *
 * Mock dependencies: Redis (getRedisClient), JWT/auth utilities,
 * creditService, sttService, ttsService
 */

describe("voiceGateway", () => {
  describe("POST /api/voice/session", () => {
    it("returns a one-time token with 30s TTL for authenticated user", async () => {
      // Token stored in Redis: SET voice:token:{token} {userId}:{tenantId} EX 30
    });

    it("rejects unauthenticated requests with 401", async () => {
      // No session cookie / invalid JWT
    });

    it("rejects when voiceConsentGrantedAt is null (no consent)", async () => {
      // Should return 403 with message about consent required
    });

    it("rejects when user already has active voice session", async () => {
      // Redis key voice:active:{userId} already exists
      // Should return 409 Conflict
    });

    it("rejects when voiceChat feature flag is disabled for tenant", async () => {
      // Feature flag check returns false -> 403
    });
  });

  describe("WebSocket /api/voice/stream", () => {
    it("accepts connection with valid unconsumed token", async () => {
      // SET voice:token:{token} consumed NX -> returns OK (first use)
      // Connection upgraded successfully
    });

    it("rejects connection with already-consumed token", async () => {
      // SET NX returns nil -> token was already used -> close with 4001
    });

    it("rejects connection with expired token", async () => {
      // GET voice:token:{token} returns null -> 4001
    });

    it("enforces 1 concurrent session per user limit", async () => {
      // voice:active:{userId} already exists -> close with 4004
    });

    it("enforces audio chunk rate limit of 50 chunks/sec", async () => {
      // Send >50 chunks in 1 second window -> warning frame
      // Exceed 3x within 10s -> close with 4003
    });

    it("auto-closes session after 300s timeout", async () => {
      // Session timer fires -> graceful close with code 4005
    });

    it("forces STT dispatch after 60s audio buffer", async () => {
      // Buffer accumulates 60s of audio -> automatic transcription
    });

    it("rejects binary frames larger than 64KB", async () => {
      // Frame >64KB -> close with 4006
    });

    it("cleans up Redis keys on disconnect", async () => {
      // voice:active:{userId} deleted on close
    });
  });
});
```

### 6.2 STT/TTS Provider Tests

**File:** `apps/web/server/services/__tests__/sttService.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

/**
 * STT Service Tests
 * Mock: Python backend HTTP calls, Redis for provider config
 */

describe("sttService", () => {
  it("routes to correct provider based on tenant/system config", async () => {
    // Default: Groq Whisper. Config override: OpenAI Whisper.
  });

  it("returns transcript with language, confidence, and duration", async () => {
    // Response shape: { text: string, language: string, confidence: number, duration: number }
  });

  it("falls back to secondary provider on primary failure", async () => {
    // Groq fails -> tries OpenAI Whisper
  });

  it("rejects audio buffers exceeding 60s / ~1.9MB", async () => {
    // Throws validation error before sending to provider
  });
});
```

**File:** `apps/web/server/services/__tests__/ttsService.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

/**
 * TTS Service Tests
 * Mock: Python backend / direct API calls, Redis for config
 */

describe("ttsService", () => {
  it("returns audio buffer in expected format (MP3 or PCM)", async () => {
    // Synthesize text -> Buffer with correct content type
  });

  it("routes to ElevenLabs or OpenAI TTS based on config", async () => {
    // Provider selection based on tenant config or system default
  });

  it("rejects text exceeding maximum length", async () => {
    // Configurable max, default ~5000 chars
  });
});
```

**File:** `python-backend/tests/unit/test_stt_endpoint.py`

```python
"""
STT Endpoint Tests (Python)
Mock: unified_client, auth dependencies
"""
import pytest

class TestSTTEndpoint:
    """Tests for POST /api/internal/stt"""

    async def test_stt_routes_to_groq_whisper_by_default(self):
        """Default STT provider is Groq Whisper."""
        pass

    async def test_stt_routes_to_openai_whisper_when_configured(self):
        """Provider override via request parameter or system config."""
        pass

    async def test_stt_returns_transcript_with_metadata(self):
        """Response includes text, language, confidence, duration."""
        pass

    async def test_stt_rejects_oversized_audio(self):
        """Audio files >25MB rejected with 413."""
        pass

    async def test_stt_requires_internal_auth(self):
        """Endpoint requires SMARTSPEC_WEB_GATEWAY_TOKEN header."""
        pass
```

### 6.3 Credit Integration Tests

**File:** `apps/web/server/services/__tests__/voiceCreditIntegration.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

/**
 * Voice Credit Integration Tests
 * Mock: creditService, costTracker, providerUsageLog schema
 */

describe("voice credit integration", () => {
  it("logs STT usage with sourceType 'stt' and seeded providerId", async () => {
    // costTracker.logRequest called with correct providerId (integer from llmProviders seed)
    // creditService.deductCredits called with sourceType: 'stt'
  });

  it("logs TTS usage with sourceType 'tts' and correct providerId", async () => {
    // Similar pattern for TTS, 5 credits per 1K chars
  });

  it("calculates STT cost as 3 credits per minute of audio", async () => {
    // 30s audio -> 1.5 credits (rounded up to 2)
  });

  it("calculates TTS cost as 5 credits per 1K characters", async () => {
    // 500 chars -> 2.5 credits (rounded up to 3)
  });

  it("handles mid-session credit depletion with graceful degradation", async () => {
    // 1. Complete current in-flight STT
    // 2. Generate LLM text response but skip TTS
    // 3. Send text-only response with system message
    // 4. Close WebSocket with code 4002
  });

  it("closes WebSocket with code 4002 on credit exhaustion", async () => {
    // Verify the specific close code and message
  });
});
```

### 6.4 Consent Tests

**File:** `apps/web/server/routes/__tests__/voiceConsent.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

/**
 * Voice Consent Tests
 * Mock: database (users table), Redis pub/sub
 */

describe("voice consent", () => {
  it("blocks voice mode when voiceConsentGrantedAt is null", async () => {
    // POST /api/voice/session returns 403 when user has no consent
  });

  it("grants consent by setting voiceConsentGrantedAt timestamp", async () => {
    // tRPC mutation updates users.voiceConsentGrantedAt = NOW()
  });

  it("withdraws consent by setting voiceConsentGrantedAt to null", async () => {
    // tRPC mutation sets voiceConsentGrantedAt = NULL
  });

  it("publishes Redis event on consent withdrawal", async () => {
    // Redis PUBLISH voice:consent:revoked:{userId}
  });

  it("terminates active voice session on consent withdrawal", async () => {
    // voiceGateway subscribes to voice:consent:revoked:{userId}
    // Active WebSocket closed with appropriate code
  });
});
```

---

## Implementation Details

### 6.1 Voice Gateway

**File:** `apps/web/server/routes/voiceGateway.ts`

This is the core of the voice feature -- an Express route for session token creation and a WebSocket server for audio streaming.

**Session Token Flow:**

1. **Token creation** (`POST /api/voice/session`):
   - Authenticate user from session cookie/JWT (reuse existing auth middleware)
   - Verify `voiceChat` feature flag is enabled for the user's tenant
   - Verify `users.voiceConsentGrantedAt` is not null (consent check)
   - Check no active session exists: `GET voice:active:{userId}` in Redis. If exists, return 409.
   - Generate a cryptographically random token (32 bytes hex = 64 chars)
   - Store in Redis: `SET voice:token:{token} {userId}:{tenantId} EX 30` (30-second TTL)
   - Return `{ token, wsUrl: "/api/voice/stream" }` to client

2. **WebSocket upgrade** (`/api/voice/stream?token=<token>`):
   - Extract token from query string
   - Atomic consume: `SET voice:token:{token} consumed NX EX 30` -- if the key already has value "consumed", SET NX returns null and connection is rejected (token already used). If the key does not exist (expired), also reject.
   - Actually, the correct pattern: first GET the token value (contains `{userId}:{tenantId}`), then DEL to consume atomically. Use a Lua script for atomicity:
     ```
     local val = redis.call('GET', KEYS[1])
     if val then redis.call('DEL', KEYS[1]) end
     return val
     ```
   - Parse userId and tenantId from the token value
   - Set active session key: `SET voice:active:{userId} 1 EX 300` (300s TTL)
   - Upgrade to WebSocket

**WebSocket Message Protocol:**

- **Client to Server (binary):** Raw PCM 16-bit, 16kHz mono audio chunks. Max frame size: 64KB.
- **Client to Server (text):** JSON control messages: `{ type: "end_turn" }`, `{ type: "set_mode", mode: "push-to-talk" | "vad" | "hybrid" }`
- **Server to Client (binary):** TTS audio response chunks (MP3 or PCM based on negotiation)
- **Server to Client (text):** JSON messages: `{ type: "transcript", text, isFinal }`, `{ type: "response_text", text }`, `{ type: "error", code, message }`, `{ type: "credit_warning" }`, `{ type: "system", message }`

**Rate Limiting:**

Track chunks per second using a sliding window counter in memory (per-connection, not Redis -- this is fast-path):

```typescript
// Pseudocode for per-connection rate limiter
interface ChunkRateLimiter {
  /** Track timestamps of recent chunks. If >50 in last second, warn. If warned 3x in 10s, close. */
  recordChunk(): "ok" | "warning" | "close";
}
```

**Audio Buffer Management:**

- Buffer incoming audio chunks in memory (per-connection)
- When client sends `end_turn` or buffer reaches 60 seconds (~1.9MB at 16kHz 16-bit mono), dispatch to STT
- Hard limit: reject frames >64KB individually

**Session Lifecycle:**

- Max duration: 300 seconds. Set a timer on connection open.
- On timeout: send `{ type: "system", message: "Session expired" }` then close with code 4005.
- On disconnect (any reason): DEL `voice:active:{userId}` from Redis.

**Close Codes:**

| Code | Meaning |
|------|---------|
| 4001 | Invalid or expired token |
| 4002 | Credit exhausted |
| 4003 | Rate limit exceeded (too many audio chunks) |
| 4004 | Concurrent session limit reached |
| 4005 | Session timeout (300s) |
| 4006 | Frame too large (>64KB) |

**WebSocket Library:** Use the `ws` npm package (already in the Node.js ecosystem). Create a `WebSocketServer` with `noServer: true` and handle the `upgrade` event from the HTTP server in `server/_core/index.ts`.

**Registration in `apps/web/server/_core/index.ts`:**

Add the WebSocket upgrade handler to the existing HTTP server. The Express app's underlying HTTP server must be captured and used to listen for `upgrade` events:

```typescript
// Pseudocode for index.ts integration
import { createVoiceGateway } from "../routes/voiceGateway";

// After creating the HTTP server:
const voiceGateway = createVoiceGateway();
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url!, `http://${request.headers.host}`);
  if (url.pathname === "/api/voice/stream") {
    voiceGateway.handleUpgrade(request, socket, head);
  }
  // Other WebSocket routes (widget, etc.) can be added here
});
```

### 6.2 STT/TTS Provider Abstraction

**File:** `apps/web/server/services/sttService.ts`

Define a provider interface and implementations that route through the Python backend:

```typescript
/** STT provider interface */
interface STTProvider {
  readonly name: string;
  transcribe(
    audioBuffer: Buffer,
    options: { language?: string; format?: "pcm16" | "wav" | "mp3" }
  ): Promise<STTResult>;
}

interface STTResult {
  text: string;
  language: string;
  confidence: number;
  duration: number; // seconds
}
```

Two implementations:
- `GroqWhisperProvider` -- default, routes to `POST http://localhost:8000/api/internal/stt` with `provider=groq`
- `OpenAIWhisperProvider` -- fallback, routes to same endpoint with `provider=openai`

Both call the Python backend internally. The Python backend then uses `unified_client.py` to call the actual provider API. The Node.js service sends the audio as multipart form data with fields: `audio` (binary), `provider` (string), `language` (optional string), `format` (string).

**File:** `apps/web/server/services/ttsService.ts`

```typescript
/** TTS provider interface */
interface TTSProvider {
  readonly name: string;
  synthesize(
    text: string,
    options: { voice?: string; speed?: number; format?: "mp3" | "pcm16" }
  ): Promise<TTSResult>;
}

interface TTSResult {
  audioBuffer: Buffer;
  contentType: string; // "audio/mpeg" or "audio/pcm"
  duration: number; // estimated seconds
}
```

Two implementations:
- `ElevenLabsProvider` -- primary TTS, can use WebSocket streaming for low latency. Routes through Python backend or direct API call.
- `OpenAITTSProvider` -- fallback, routes through Python backend `POST http://localhost:8000/api/internal/tts`

Provider selection logic: Check tenant-level config in `tenants.settings` for preferred STT/TTS providers, fall back to system-level defaults.

**File:** `python-backend/app/api/stt.py`

New FastAPI router for internal STT endpoint:

```python
"""
Internal STT endpoint.
Called by Node.js voice gateway, routed through unified_client.
Requires SMARTSPEC_WEB_GATEWAY_TOKEN for internal auth.
"""

# POST /api/internal/stt
# - Accept multipart: audio file + provider param + language param
# - Route to Groq Whisper or OpenAI Whisper via unified_client
# - Return JSON: { text, language, confidence, duration }
# - Max file size: 25MB
# - Internal auth: X-Gateway-Token header

# POST /api/internal/tts
# - Accept JSON: { text, provider, voice, speed, format }
# - Route to ElevenLabs or OpenAI TTS via unified_client
# - Return binary audio response with appropriate content-type header
# - Max text length: 5000 chars
# - Internal auth: X-Gateway-Token header
```

Mount this router in `python-backend/app/main.py` under the internal API prefix. The existing `SMARTSPEC_WEB_GATEWAY_TOKEN` auth pattern (used by other internal endpoints) should be reused.

### 6.3 Credit Integration

**Modifications to `apps/web/server/services/costTracker.ts`:**

Add STT/TTS cost calculation functions alongside existing `calculateCost`:

```typescript
/** Calculate STT credits: 3 credits per minute of audio (0 for Groq free tier) */
export function calculateSTTCredits(durationSeconds: number, provider: string): number {
  // Groq free tier: 0 credits (check provider name)
  // Others: Math.ceil((durationSeconds / 60) * 3)
}

/** Calculate TTS credits: 5 credits per 1000 characters */
export function calculateTTSCredits(characterCount: number): number {
  // Math.ceil((characterCount / 1000) * 5)
}
```

**Provider IDs:** The `providerUsageLog.providerId` column is `integer NOT NULL` with a real FK to `llmProviders.id`. When logging STT/TTS usage, you must use the actual integer IDs seeded into `llmProviders` by section-01-database. Query these IDs at service startup and cache them:

```typescript
// In sttService.ts / ttsService.ts initialization
const sttProviders = await db.select()
  .from(llmProviders)
  .where(like(llmProviders.name, '%Whisper%'));
// Cache: { "groq": 42, "openai": 43 } (actual IDs from seed)
```

**Logging pattern (in voiceGateway.ts after each STT/TTS call):**

```typescript
// After STT completes:
await costTracker.logRequest({
  userId,
  providerId: sttProviderId, // integer from llmProviders seed
  modelUsed: "whisper-large-v3",
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0, // or actual cost
  creditsCharged: calculateSTTCredits(duration, providerName),
  responseTimeMs,
  statusCode: 200,
  wasFallback: false,
});

await creditService.deductCredits({
  userId,
  amount: creditsCharged,
  description: `Voice STT: ${duration}s audio`,
  sourceType: "stt",
  tenantId,
  metadata: { traceId, provider: providerName, duration },
});
```

**Mid-Session Credit Depletion Handling:**

Before each STT dispatch, check remaining credit balance. If balance is below a threshold (e.g., 5 credits):

1. Complete the current in-flight STT transcription (already submitted, cannot cancel)
2. Generate the LLM response as text, but skip TTS synthesis
3. Send a text-only response via WebSocket: `{ type: "response_text", text: "..." }` followed by `{ type: "system", message: "Credits exhausted. Switching to text-only mode." }`
4. Close the WebSocket connection with code 4002 ("credit_exhausted")

This ensures no credits are charged for TTS when the user cannot afford it, while still delivering the final response.

### 6.4 PDPA/GDPR Consent

**Consent Grant/Withdrawal via tRPC:**

Add two mutations to an appropriate router (e.g., a new voice router or the existing user settings router):

- `voice.grantConsent` -- sets `users.voiceConsentGrantedAt = new Date()` for the authenticated user
- `voice.withdrawConsent` -- sets `users.voiceConsentGrantedAt = null`, then publishes `PUBLISH voice:consent:revoked:{userId}` via Redis

**Voice Gateway Subscription:**

On startup, the voice gateway subscribes to Redis pub/sub channel pattern `voice:consent:revoked:*`. When a revocation message arrives, find the matching active WebSocket connection by userId and close it with an appropriate code.

Implementation note: Use a dedicated Redis subscriber connection (separate from the main Redis client, as IORedis requires separate connections for pub/sub):

```typescript
// In voiceGateway.ts
const subscriber = getRedisClient().duplicate();
await subscriber.psubscribe("voice:consent:revoked:*");
subscriber.on("pmessage", (_pattern, channel, _message) => {
  const userId = channel.split(":").pop();
  // Find active session for userId, close WebSocket
});
```

**Audio Data Policy:**
- Audio is NOT persisted to disk or database
- Only the transcribed text is stored as a regular conversation message
- Audio buffers are held in memory only during the active session and discarded after STT processing

### 6.5 Frontend

**File:** `apps/web/client/src/components/chat/VoiceChat.tsx`

A floating voice interface component that integrates with the existing chat UI:

- **Microphone button:** Floating action button positioned near the chat input. Click to toggle voice mode.
- **Consent modal:** On first activation (when `voiceConsentGrantedAt` is null), display a modal explaining that audio will be processed by third-party STT/TTS services, audio is not stored, and only transcribed text is saved. User must explicitly grant consent.
- **Recording state:** Visual waveform animation during recording using `AnalyserNode` from Web Audio API.
- **Playback state:** Visual indicator during TTS audio playback.
- **Modes:**
  - `push-to-talk` (default): Hold button to record, release to send
  - `vad` (auto-detect): Uses `@ricky0123/vad-web` for voice activity detection, automatically segments speech
  - `hybrid`: Text input available alongside voice

**npm dependency:** `@ricky0123/vad-web` -- a lightweight browser-based voice activity detector. Install in `apps/web/`.

**Audio capture:** Use `navigator.mediaDevices.getUserMedia({ audio: true })` with `MediaRecorder` API or raw `AudioContext` + `ScriptProcessorNode`/`AudioWorkletNode` for PCM output. The gateway expects PCM 16-bit 16kHz mono. If the browser captures at a different sample rate, resample in an AudioWorklet.

**WebSocket connection:** Connect to `wss://smartaihub.app/api/voice/stream?token={token}` after obtaining the session token via `POST /api/voice/session`. Handle binary frames (TTS audio) and text frames (transcript/control messages).

**File:** `apps/web/client/src/hooks/useVoiceChat.ts`

Custom hook managing the voice session lifecycle:

```typescript
interface UseVoiceChatReturn {
  /** Current state: idle, requesting_consent, connecting, active, error */
  state: VoiceChatState;
  /** Current recording mode */
  mode: "push-to-talk" | "vad" | "hybrid";
  /** Whether currently recording audio */
  isRecording: boolean;
  /** Whether TTS audio is playing back */
  isPlaying: boolean;
  /** Start voice session (triggers consent check + token fetch + WS connect) */
  startSession: () => Promise<void>;
  /** End voice session */
  endSession: () => void;
  /** Toggle recording (push-to-talk mode) */
  toggleRecording: () => void;
  /** Switch mode */
  setMode: (mode: "push-to-talk" | "vad" | "hybrid") => void;
  /** Current transcript (partial, from STT) */
  partialTranscript: string;
  /** Error message if any */
  error: string | null;
}
```

The hook:
1. Checks consent status before activation (query `users.voiceConsentGrantedAt`)
2. If no consent, triggers consent modal (state: `requesting_consent`)
3. After consent, calls `POST /api/voice/session` to get token
4. Opens WebSocket connection
5. Manages recording state and audio buffer streaming
6. Handles incoming transcripts and TTS audio playback via `AudioContext`
7. Monitors credit warnings from server
8. Cleans up on unmount (close WebSocket, stop recording, release mic)

### 6.6 Agency/Workflow Tools

**Modification to `apps/web/server/routers/agency.ts`:**

Add to the existing `builtinTools` array:

```typescript
{
  id: "builtin-voice",
  name: "Voice",
  description: "Speech-to-text and text-to-speech capabilities",
  toolType: "builtin",
  riskLevel: "medium",
  requiresApproval: false,
  configSchema: {
    type: "object",
    properties: {
      allowedModes: {
        type: "array",
        items: { type: "string", enum: ["stt", "tts"] },
        default: ["stt", "tts"],
      },
      defaultVoice: { type: "string", default: "alloy" },
      maxAudioDurationSec: { type: "number", default: 60, maximum: 300 },
      maxTextLength: { type: "number", default: 5000, maximum: 10000 },
    },
  },
},
```

**Modification to `python-backend/app/services/agency_tools.py`:**

Add to the existing dictionaries:

```python
_BUILTIN_ENDPOINTS["builtin-voice"] = "/api/internal/tools/voice"
_BUILTIN_RISK_LEVELS["builtin-voice"] = "medium"
```

Since risk level is "medium", it routes through `_execute_http()` (not `_execute_sandbox()`).

**Node.js internal endpoint:** Create `POST /api/internal/tools/voice` as an Express route that:
- Accepts JSON body: `{ mode: "stt" | "tts", audio_url?: string, text?: string, voice?: string }`
- For STT mode: downloads audio from `audio_url`, sends to sttService, returns `{ text, language, confidence, duration }`
- For TTS mode: sends `text` to ttsService, uploads resulting audio to S3/R2, returns `{ audio_url, duration }`
- Authenticates via `SMARTSPEC_WEB_GATEWAY_TOKEN` header (same as other internal tool endpoints)
- Deducts credits via creditService

**VoiceExecutor Workflow Node:**

Create `python-backend/app/orchestrator/node_executors/integration_executors/voice_executor.py` (if workflow orchestrator directory exists):

```python
"""
VoiceExecutor — workflow node for voice processing.

Node type: 'voice'
Inputs: mode (stt|tts), audio_url (for stt), text (for tts)
Outputs: text (from stt), audio_url (from tts), duration, confidence
"""
```

This executor calls the Node.js `/api/internal/tools/voice` endpoint with the appropriate parameters, following the same pattern as other integration executors.

---

## Nginx Configuration (Reference)

The following Nginx location block is needed for WebSocket proxying. This is covered in detail in section-15 but included here for completeness:

```nginx
location /api/voice/stream {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 300s;  # 5-minute voice session max
}
```

Without this configuration, WebSocket connections will fail through the Nginx reverse proxy.

---

## Resource Constraints

Per the project's target scale (single server, limited RAM/CPU):

- **Max 1 active voice session per user** -- enforced via Redis key with 300s TTL
- **Session hard limit: 300 seconds** -- prevents resource hoarding
- **Audio buffer limit: 60 seconds** before forced dispatch to STT -- prevents memory bloat
- **Frame size limit: 64KB** -- prevents memory spikes from malformed clients
- **Lazy initialization:** STT/TTS provider clients should be created on first use, not at server startup
- **Shared workers:** Voice processing uses the shared BullMQ worker, not a dedicated process

---

## Implementation Checklist

1. Write all test stubs listed above (voiceGateway, sttService, ttsService, credit integration, consent)
2. Implement `voiceGateway.ts` -- session token endpoint + WebSocket server
3. Implement `sttService.ts` -- provider interface + Groq/OpenAI implementations
4. Implement `ttsService.ts` -- provider interface + ElevenLabs/OpenAI implementations
5. Add STT/TTS cost calculation to `costTracker.ts`
6. Implement Python `stt.py` endpoint and mount in `main.py`
7. Add consent grant/withdraw tRPC mutations
8. Implement consent pub/sub in voiceGateway
9. Register WebSocket upgrade handler in `server/_core/index.ts`
10. Add `builtin-voice` to agency BUILTIN_TOOLS (both Node.js and Python)
11. Create internal tools endpoint `POST /api/internal/tools/voice`
12. Build `VoiceChat.tsx` component with consent modal
13. Build `useVoiceChat.ts` hook
14. Create VoiceExecutor workflow node (Python)
15. Run all tests and verify passing
16. Verify feature flag gating at all entry points (tRPC, Express route, UI)

---

## As Built (Implementation Notes)

### Deviations from Plan

- **`costTracker.ts` not modified**: Credit integration was implemented directly in `dispatchSTT` via `creditService.deductCredits()` instead of through `costTracker.ts`, which has a different interface optimized for LLM/token costs.
- **VoiceExecutor workflow node**: Not implemented in this section — deferred (Python orchestrator changes are complex and out of scope for Voice Chat section).
- **`Chat.tsx` integration**: `VoiceChat.tsx` component was created but not integrated into an existing chat page — that integration point depends on section-07 (Browser) or the specific chat UI which was not part of this section's scope.
- **Consent endpoints via Express (not tRPC)**: Placed in `voiceGateway.ts` Express router rather than tRPC procedures. Existing auth middleware applies to all routes.
- **`sttService.ts` `provider` field**: `STTResult` extended with optional `provider` field to track which provider was actually used (for correct credit calculation in `dispatchSTT`).

### Code Review Fixes Applied

- **H1**: Added `getTenantFeatureFlag("voiceChat", tenantId)` check at `POST /session` (returns 403 if disabled)
- **H2**: `dispatchSTT` now accepts `tenantId`, calls `deductCredits({ sourceType: "stt" })` after successful transcription (non-blocking)
- **H3**: Restored `detectFlowCycle` call in `saveBuilder` before `db.transaction()` (was accidentally removed)
- **M3**: Rate limiter now increments warnings on every over-rate event (not just once per 10s window)
- **M7**: `stt.py` `ImportError` handlers now raise `HTTPException(503)` instead of returning fake transcripts/silence
- **M8**: Moved `transcribe`/`calculateSTTCredits` to static imports in `voiceGateway.ts`
- **L1**: `useVoiceChat` accepts `UseVoiceChatOptions` with `onTranscript`/`onResponse`; `VoiceChat.tsx` passes props through
- **L2**: Removed `console.log('[Voice] System:', ...)` from `handleTextMessage`
- **L5**: `TTSRequest.text` now has `Field(min_length=1)` validator

### Actual Files Created

- `apps/web/server/services/sttService.ts` — STT abstraction (Groq free/OpenAI paid, auto-fallback)
- `apps/web/server/services/ttsService.ts` — TTS abstraction (OpenAI/ElevenLabs)
- `apps/web/server/routes/voiceGateway.ts` — Session token API + WebSocket server
- `apps/web/client/src/hooks/useVoiceChat.ts` — Voice session lifecycle hook
- `apps/web/client/src/components/chat/VoiceChat.tsx` — Floating mic + consent modal
- `python-backend/app/api/stt.py` — FastAPI STT/TTS endpoints
- 4 TypeScript test files (30 tests total)
- `python-backend/tests/unit/test_stt_endpoint.py` (9 tests)

### Test Results

- TypeScript: **30 passed** (sttService: 9, ttsService: 8, voiceCreditIntegration: 6, voiceGateway: 7)
- Python: **9 passed**