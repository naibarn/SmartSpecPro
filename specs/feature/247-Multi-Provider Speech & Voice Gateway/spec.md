# Spec 247 — Multi-Provider Speech & Voice Gateway

**Project:** SmartAIHub / SmartSpecPro  
**Status:** Proposed — design-reviewed; M0 repository-contract reconciliation, provider probes, Thai benchmarks and production evidence remain required  
**Version:** 1.8 — eighth 10-pass reconciliation revision (80 cumulative document-review passes) | **Date:** 2026-09-25 (Asia/Bangkok)  
**Scope:** Cloudflare Workers AI · OpenAI · Google Gemini · xAI Grok · optional CrispASR  
**Deployment:** Current Debian Linux → hybrid → Cloudflare Workers; external/local inference remains independent

> **Numbering guard:** Spec 247 is proposed based on the latest discussed Spec 246; confirm against the canonical SmartSpecPro spec registry before assigning permanently. If occupied, allocate the next available identifier without modifying existing specs.
>
> **Implementation boundary:** Original Specs 1–213, including 213, must not be retroactively edited; use additive compatibility extensions and backlog items. Spec 224 is in active implementation and must not be rewritten. Other cross-spec requirements are additive and gated by their owners.

## 0. Executive decision

Implement **one shared Speech Capability interface** in the existing SmartAIHub AI Gateway, not a new standalone orchestration system. Cloudflare Workers AI is the initial **cloud ASR provider** where capability, region and language checks pass; OpenAI, Gemini and xAI are independent alternatives, not a hard-coded failover chain. CrispASR is **optional** as an external inference runtime on a capable Windows Worker or dedicated Linux/GPU machine, not a dependency for Debian or Cloudflare migration.

Preserve current systems of record: `worker_jobs` for durable batch work; existing Orchestration Kernel / Feature 196 / Spec 237 for assistant and live session ownership; PostgreSQL for state, configuration and billing; R2 for media; Vectorize for permission-scoped retrieval; shared approval and audit services. This spec defines adapters, normalization, policy, UX and conformance tests only.

### 0.1 Goals

1. Expose stable, tenant-scoped speech operations to Chat, Mini Chat, Media Studio, Video Editor, Workflow Studio, Mini Apps, Meeting/Research tools and project knowledge ingestion.
2. Support `transcribe.batch`, `transcribe.stream`, `speech.synthesize`, `speech.converse`, `speech.turn_detect` and optionally `speech.align`, `speech.diarize`, `audio.understand` only where a verified provider supplies them or a documented composition exists.
3. Route on required capabilities, language/eval certification, privacy/consent, per-tenant allowlists, cost budget, provider health and latency SLOs; record the selected provider and model for every attempt.
4. Prioritize Thai and mixed Thai/English with reproducible evaluation and human-reviewed quality gates.
5. Operate on the current CPU-only Debian server through hosted APIs with **zero local speech models required**; migrate gradually to Cloudflare without downtime or changing public contracts.
6. Deliver auditable usage accounting, no duplicate customer charges on retries, and explicit handling of provider-side costs after ambiguous timeouts.

### 0.2 Non-goals

- Training or fine-tuning foundational speech models in v1.
- Reimplementing current AI Gateway, general LLM Router (Spec 231), `worker_jobs`, scheduling, memory, permissions, orchestration or browser/computer-use infrastructure.
- Guaranteeing that all providers expose Thai TTS, word timestamps, diarization or full-duplex speech under a common endpoint.
- Hosting CUDA inference inside Cloudflare Workers or assuming Cloudflare Containers offer GPU.
- Automatically crawling, cloning voices, or processing third-party recordings without authorization.

## 1. Verified external capability baseline and source-of-truth policy

**Documentation baseline: 2026-09-25; eighth-pass targeted verification: 2026-09-25; model IDs, availability, language support, rates and parameter compatibility are runtime-configured and must be refreshed at integration/release time.** A provider's documentation is evidence of a published feature, **not** evidence that a specific SmartAIHub account, region or Thai-language workflow has passed certification.

| Provider | Initial candidate models/endpoints | Published or verified scope | Critical design constraint |
|---|---|---|---|
| Cloudflare Workers AI | `@cf/openai/whisper-large-v3-turbo`, `@cf/openai/whisper`, `@cf/deepgram/nova-3`, available TTS/turn-detect models | Batch Whisper; Nova-3 Batch/WebSocket; TTS and Smart Turn models | Cloudflare model/transport determines functionality. Thai must be certified per model and endpoint. AI Binding when hosted on Workers; HTTPS from Debian. |
| OpenAI | transcription models, dedicated diarization model, Realtime transcription, speech/voice endpoints | File transcription, distinct diarization output; realtime input transcription | Model-specific response formats and timestamps: e.g. diarization output is `diarized_json`, realtime transcription does not imply word timestamps or speaker labels. |
| Google Gemini | `gemini-3.5-transcribe`, `gemini-3.5-transcribe-live`, Gemini TTS/Live endpoints | Dedicated file transcription with diarization/word offsets; live interim/final transcripts; Thai TTS available on selected model(s) | Custom vocabulary **cannot be combined** with word-level timestamps or diarization in the documented batch API. Live transcription has neither word timestamps nor diarization and documented session limits. |
| xAI Grok | `grok-voice-transcribe-2.0`, `/v1/stt`, `/v1/tts`, `/v1/realtime` | Batch and streaming STT, multilingual TTS and live speech-to-speech published | Thai `th` is **published for STT** (formatting-language list), but real Thai transcription quality and actual account/region support remain **UNCERTIFIED until probe and Thai eval**; Thai is **not in the published TTS or speech-to-speech language lists**. Custom voices are region-/plan-restricted. Do not advertise features inferred from sibling endpoints. |
| CrispASR (optional) | Approved local ASR/TTS/other model served through isolated adapter | On-device/private or custom model capability where independently validated | No mandatory binary/model install on Debian; model licenses, per-device RAM/VRAM and security scan before enablement. |

**Authoritative reference URLs:**
- Cloudflare Whisper Turbo: https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/
- Cloudflare Nova-3: https://developers.cloudflare.com/workers-ai/models/nova-3/
- Cloudflare AI Bindings: https://developers.cloudflare.com/workers-ai/configuration/bindings/
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- OpenAI file transcription: https://developers.openai.com/api/docs/guides/speech-to-text
- OpenAI realtime transcription: https://developers.openai.com/api/docs/guides/realtime-transcription
- Gemini transcription: https://ai.google.dev/gemini-api/docs/transcribe
- Gemini realtime transcription: https://ai.google.dev/gemini-api/docs/live-api/live-transcribe
- Gemini audio understanding: https://ai.google.dev/gemini-api/docs/audio
- Gemini TTS: https://ai.google.dev/gemini-api/docs/speech-generation
- xAI overview: https://docs.x.ai/developers/model-capabilities/audio/voice
- xAI STT: https://docs.x.ai/developers/model-capabilities/audio/speech-to-text
- xAI TTS: https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
- xAI realtime: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech
- CrispASR: https://github.com/CrispStrobe/CrispASR

### 1.1 Capability verification states

Each `(provider, model, endpoint, region, language, transport, feature)` tuple has `undocumented | documented | probe_passed | eval_passed | certified | suspended`. Only `certified` tuples may be auto-selected for production Thai workflows. `probe_passed` can run in administrator sandboxes; stale capabilities expire after a configurable TTL. Feature flags are **ANDed** with legal/region/account entitlements, not assumed from model family. Preserve provenance: doc URL, checked date, SDK/API version, account region, test artifact SHA and reviewer.

## 2. Existing-system interfaces and ownership

```text
Chat / Mini Chat / Media Studio / Video Editor / Workflow / Mini Apps
                    |
             Existing AI Gateway
                    |
        Speech Capability Facade (this spec)
        | AuthZ, Scope, Routing, QoS, Pricing |
        +----------+-----------+-------------+
        |          |           |             |
    Cloudflare   OpenAI      Gemini         xAI     [CrispASR optional]
        |          |           |             |             |
        +----------+-----------+-------------+-------------+
                    |
    Existing worker_jobs / Kernel / Live Session Owner
                    |
            R2 / PostgreSQL / Vectorize
```

- **Identity/AuthZ:** reuse existing tenant/project/user/service principal and approval policies. Per-project external-provider consent is separate from membership in that project.
- **Routing:** Spec 231 owns global model routing; this spec contributes speech capabilities and eval telemetry, not an independent router authority. Resolve provider choice through the shared routing policy interface.
- **Batch execution:** `worker_jobs` owns retries, leases, idempotency, cancellation, webhook/outbox, terminal states; adapter only returns attempt events and artifacts. Existing Job Control Plane and Spec 224 approval/recovery semantics are not changed.
- **Realtime execution:** Feature 196 / Spec 237 and existing session gateway own session IDs, presence, approval and interruption lifecycle. Provider adapters are replaceable media transports; no new voice-agent orchestrator.
- **Files:** existing Library/R2 owns upload and signed reads. No direct permanent public media URLs, no extra source of truth.
- **Retrieval:** Project RAG ingestion writes authorized, redacted transcript chunks and timestamps into existing PostgreSQL + Cloudflare Vectorize. Respect retention and deletion propagation.
- **Monetization:** shared wallet/credits/billing owns charge and creator/tenant/platform fee splits. Provider usage is an auditable input, not a second ledger.
- **Alert/Admin:** reuse existing alert and incident queue for failed jobs, provider outage, Thai quality regression, privacy policy violation and runaway costs.

### 2.1 Public operations (versioned)

`POST /v1/speech/transcriptions` → async job or sync for policy-approved short audio; `GET /v1/speech/jobs/:id`; `POST /v1/speech/jobs/:id/cancel`; `GET /v1/speech/artifacts/:id` authorized signed retrieval; `POST /v1/speech/synthesis`; `POST /v1/speech/sessions` to request a session through the existing realtime gateway; `GET /v1/speech/capabilities` returns visible certified tuples filtered to tenant entitlement and region. Existing route naming takes precedence if already implemented; maintain versioned aliases rather than duplicate handlers. No client may supply arbitrary upstream URLs or API keys through these endpoints.

### 2.2 Canonical request (illustrative TypeScript)

```ts
type SpeechTask =
  | 'transcribe.batch' | 'transcribe.stream' | 'speech.synthesize'
  | 'speech.converse' | 'speech.turn_detect'
  | 'speech.align' | 'speech.diarize' | 'audio.understand';

type SpeechRequest = {
  api_version: '2026-09-25';
  tenant_id: string; project_id?: string; requester_id: string;
  task: SpeechTask;
  input: { r2_asset_id?: string; authorized_text?: string; session_id?: string };
  language: { hints?: string[]; autodetect?: boolean; code_switch?: boolean };
  requirements: {
    diarization?: boolean; timestamps?: 'none' | 'segment' | 'word';
    vocabulary?: string[]; max_latency_ms?: number;
    verbatim?: boolean; output_formats?: ('json'|'srt'|'vtt'|'audio')[];
  };
  policy: {
    provider_allowlist?: string[]; region_allowlist?: string[];
    external_processing_approved: boolean;
    data_classification: 'public'|'internal'|'confidential'|'restricted';
    fallback: 'disabled'|'same_provider'|'approved_providers';
    max_billable_usd?: number;
  };
  idempotency_key: string;
  trace_id: string;
};
```

Never trust tenant/user/project IDs provided by the caller: derive and validate them against authenticated server context. `external_processing_approved` is evidence checked by the policy service, not an arbitrary client override. Strong canonical schema implementation follows the actual project's schema conventions.

### 2.3 Canonical result / provenance

Normalized `SpeechResult` contains immutable `asset_id`, `language_detected`, `text`, optional `segments[]`/`words[]` (start/end in ms, speaker label if actually provided), `timestamp_precision`, `speaker_source`, `normalization_version`, `provider`, `model`, `transport`, `attempt_id`, `source_asset_sha256`, `processing_profile_hash`, `quality_flags[]`, `redaction_status`, `usage` (audio_ms, text_chars, tokens when returned, upstream_billable_usd, estimated flag), artifact IDs and retention/deletion policy ID. Unavailable fields are `null` or absent; **never synthesize fabricated timestamps, diarization, confidence or language support**. Record exact provider raw response **only when policy permits**, encrypted with short retention.

Live sessions have distinct `interim` and `final` message types, monotonically increasing sequence numbers, provider item IDs, absolute audio time offsets and deduplication windows; partial hypotheses must never enter Project Memory or trigger irreversible tools.

## 3. Adapter architecture and provider-specific constraints

### 3.1 Adapter interface

```ts
interface SpeechProviderAdapter {
  getCapabilities(context: TenantRegionContext): Promise<CapabilityTuple[]>;
  probe(config: ProviderConfig): Promise<ProbeReport>;
  transcribe(input: NormalizedSpeechInput, attempt: AttemptContext): Promise<SpeechResult>;
  synthesize?(input: NormalizedSpeechInput, attempt: AttemptContext): Promise<SpeechArtifact>;
  openStream?(session: ApprovedSpeechSession): Promise<SpeechTransport>;
  cancel?(providerAttemptId: string): Promise<CancelOutcome>;
  getUsage?(providerAttemptId: string): Promise<ProviderUsage | null>;
}
```

Provider methods MUST report unsupported capabilities before sending files, not silently downgrade a user's required output. Separate request-feature validation (schema), capability eligibility (registry) and quality certification (eval) are mandatory.

### 3.2 Cloudflare

- The documented Turbo response contains segments and VTT but does **not** guarantee word-level timing or calibrated word-confidence. Conformance probes must parse concrete schema versions before exposing `timestamps: word`. Cloudflare documents ASR account/task rate limits (720 RPM as of the 2026-09-17 limits page); enforce live discovered limits and share capacity with *other* account workloads, not only speech tasks. See Annex K.

- Debian: call Cloudflare Workers AI HTTPS via server-side credentials; cloud Worker: use `env.AI` binding where supported. Place transport-specific code **inside** Cloudflare adapter only.
- Initial batch candidate: `@cf/openai/whisper-large-v3-turbo`; gate Thai language quality with eval. Nova-3 streaming and any TTS are separate capability tuples, never assumed to have Thai support from another endpoint.
- For bulk files, use R2 staging, policy-approved audio chunking, time-offset stitching and source hashing; check actual provider input limits and supported formats.
- Prices are fetched from signed/admin-reviewed rate snapshots, not hard-coded into business logic. Usage accounting includes rounding and minimum charges if applicable.

### 3.3 OpenAI

- For `gpt-4o-transcribe-diarize`, output requires `diarized_json`; audio over 30 s requires supported `chunking_strategy` (e.g. `auto`) per current API documentation. Do not claim timestamp precision that its actual response lacks. See Annex L.

- Support file transcription, dedicated diarization and realtime as independent routes; preserve `diarized_json` segments when available.
- Never imply ordinary transcription includes diarization or realtime includes word timestamps. Use exact accepted response formats per model.
- API key only server-side; model aliases configurable. Provider-specific prompt vocabulary hints mapped only when supported by the selected model.

### 3.4 Google Gemini

- Validate Gemini batch ceilings at dispatch: published standard request ≤1 h; diarization or word timestamps ≤30 min; diarization up to eight speakers with 3+ marked experimental. Live Transcribe published continuous session ceiling is 10 min. Limits are documentation snapshots and must be probed per model/account. See Annex M.

- Batch transcription adapter: `gemini-3.5-transcribe` with API-version pin and Files API lifecycle. `custom_vocabulary` conflicts with word timestamps and diarization; **word timestamps and speaker diarization MAY be combined in the documented verbatim API**, but this pairing still needs an account-level contract probe; `smart` mode likewise conflicts with timestamps and diarization; validation must reject an incompatible single call or offer an **explicit** two-pass plan with separate budget and provenance.
- Live transcription adapter: `gemini-3.5-transcribe-live` with interim/final reconciliation; no speaker diarization or word-level timestamps in documented live mode; implement rotation/reconnection around documented session limit, with gap flags rather than pretending an uninterrupted transcript.
- Audio understanding is distinct from verbatim ASR; do not use generated summaries as ground-truth transcripts. Selected Gemini TTS model(s) must be independently certified for Thai; language coverage differs by model.

### 3.5 xAI / Grok

- Implement `/v1/stt`, streaming STT, `/v1/tts` and `/v1/realtime` behind independent experimental feature flags. Distinguish raw speech transcription from conversational Grok Voice Agent with its own tool semantics.
- xAI publishes Thai (`th`) in STT language support, including language-specific formatting; treat this as `documented`, **not production-certified**. Independently probe Thai file and WebSocket STT, timestamps and diarization. Published xAI TTS and speech-to-speech language tables do **not** list Thai, so do not route Thai synthesis/conversation to them without an explicit future documentation update, account probe and Thai eval. If an endpoint rejects Thai, suspend only that locale/transport tuple.
- Custom-voice features require separate rights verification, age/consent policy, jurisdiction support and Enterprise entitlement when applicable; **exclude** from P0–P2.

- xAI STT documented multipart ingestion requires the `file` form field **after all other fields**; when using `url`, require provider-specific approved object-transfer policy and avoid publicly reusable R2 URLs. Streamed WS frames are binary (not automatically portable from another provider). Treat `language=th` as a formatting hint on this endpoint, not evidence of Thai quality certification.

### 3.6 CrispASR optional extension

Do not install by default. Define `local.crispasr` manifest and optional adapter for trusted Desktop Worker or isolated dedicated inference service. Register machine, signed binary/model hashes, allowed model licenses, memory/VRAM capacity and private network endpoint. Never expose model downloads, arbitrary inference URLs or unrestricted filesystem access to tenants. Cloudflare is never required to run this binary.

## 4. Routing, fallbacks and QoS

1. **Hard filters:** authenticated scope → provider-sharing consent → classification/region/retention → tenant/model allowlists → required modalities/features/parameter compatibility → certified language/transport → quota/budget → provider entitlement.
2. **Candidate scoring:** existing Spec 231 policy ranks remaining candidates by Thai eval CER and domain-specific terms, latency p50/p95, availability, estimated fully landed price (including transcoding/extra passes), regional location and user preference.
3. **Execution:** reserve wallet budget; create idempotent job/attempt; submit; collect structured provider usage; finalize only through existing `worker_jobs` lifecycle.
4. **Fallback:** only to explicitly approved provider in allowed data-processing region; update estimate before submission; avoid fallback after unknown upstream acceptance unless duplicate-charge risk has been resolved or policy explicitly authorizes retry.
5. **Degradation:** if word timestamps unavailable, offer segment timestamps only with user-visible limitation; if diarization required and unavailable, do not mark output complete; if realtime unavailable, present recorded batch mode only with user consent.

No fixed Cloudflare → OpenAI → Gemini → Grok ordering. Profile examples: `thai_budget_batch`, `thai_meeting_diarized`, `thai_code_switch_technical`, `thai_live_low_latency`, `thai_tts_natural`, `private_local_only`. Each is policy data, never hard-coded UI logic. Admin can change priorities under safety guardrails.

### 4.1 Fallback correctness

For HTTP errors `429/5xx`, backoff and health-aware route selection. For timeouts and disconnects, distinguish `not_sent`, `sent_unacknowledged`, `accepted`, `finalized` and `unknown`. Retain attempt records and reconcile with provider APIs where available. Billing captures provider charges separately from customer invoices and never bills user twice for the same successful logical output. If a requested realtime session drops, issue `gap_detected` and request reconnection; do not splice different speaker identities/latency semantics as if continuous.

## 5. Audio preprocessing, privacy and content integrity

- Ingest to private R2 with MIME sniffing, size/duration policy, malware screening, asset hash and tenant-scoped ownership. Process audio via safe extraction/transcoding using existing FFmpeg worker in sandboxed limits, not unrestricted shell arguments.
- Audio channel mixing, resampling, VAD and chunking are optional steps recorded in a versioned processing profile. Preserve original untouched file and per-chunk source offsets. Do not discard overlapping or silent spans without explicit metadata.
- Deidentify/redact where policy requires **before** external transfer when technically feasible; redact at transcript stage otherwise and label original-audio exposure explicitly. Capture recording/participant consent as required by use case and applicable law; deny if absent.
- Credentials use existing secret manager; tenant BYOK if already supported, encrypted and never rendered back in admin UI; apply least-privilege and rotation. All uploaded audio and external URLs are untrusted; reject internal/metadata IPs, enforce allowlist to prevent SSRF, avoid arbitrary redirects.
- Restrict providers and geographic transfers by tenant policy; track data retention and provider-side uploaded-file deletion receipts. R2 lifecycle and tombstone cascade to transcript, embeddings, search index, cache and backup policy. Strict Mini App data boundary: only authorized project/tenant content can be used in voice chat or RAG.
- Synthetic and cloned voices require provenance, explicit consent and abuse controls; voice cloning remains deferred. Do not use audio for biometric identification without separate authorization and reviewed purpose.

## 6. Data and configuration (additive migration only)

**Prefer reuse** of existing Provider Registry, Feature Flags, Job Events, Usage Ledger and Secret Store. Add schema or JSONB extensions only after inspecting the current repo. Logical entities (may map to existing tables):

| Logical record | Key fields | Owner |
|---|---|---|
| `speech_provider_capabilities` | provider/model/endpoint/region/locale/feature, supported combinations, certification status, evidence hash, expiry | shared Capability Registry |
| `speech_processing_profiles` | tenant/project, approved fallback/region, required timestamp granularity, preprocessing and retention policy | existing AI Gateway configuration |
| `speech_eval_runs` | benchmark corpus version, audio hash, model build, normalization rules, CER/WER, latency, reviewer, decision | shared evaluation service |
| `speech_transcript_artifacts` | R2 asset ID, immutable revision, speaker/timestamp provenance, source offset, redaction, deletion lineage | existing Library/project store |
| `speech_attempt_usage` | job/attempt/provider request IDs, upstream charge, charge confidence, customer invoice reference | billing/worker_jobs adapters |
| `speech_session_events` | existing session ID, event sequence, partial/final/gap/fallback/approval, provider version | existing Realtime Session Gateway |

All tables/indexes, if needed, carry `(tenant_id, project_id)` ACL enforcement where appropriate, stable migration IDs, retention windows and audit metadata. PostgreSQL is SoT; Vectorize holds derived embeddings only. Version contracts with backwards-compatible reading and additive migrations for dual-deploy period.

## 7. UX design

### 7.1 Chat / Mini Chat

Mic button with explicit consent, live/recorded mode, clear recording indicator, editable transcript before tool execution; show provider disclosure if required, language, latency and estimated cost. For Mini App, AI can answer or use tools only within Mini App's tenant/project authorization; attach only permitted Project Library/RAG collections. No background listening.

### 7.2 Media Studio / Video Editor

Upload → transcribe → subtitle editor: source waveform, segment highlights, SRT/VTT export, Thai/English correction, confidence/quality-warning markers where real metrics exist. Support manual re-run of selected clips and optional **separately billed** alignment/diarization. Edited transcript is versioned; do not silently overwrite source text or infer word timing from segment timing.

### 7.3 Realtime / Spec 237

Reusable live microphone component plus streaming transcript with visually differentiated interim/final text, explicit network gap, speaker labeling only where true diarization exists, push-to-talk fallback, interruption and tool approval. Existing Realtime Session Gateway handles authorization and connection; no second session authority.

### 7.4 Admin / Tenant Settings

Provider availability/config, per-feature certification badges (`documented`, `probed`, `Thai eval passed`, `production certified`), pricing snapshots, per-tenant data-sharing and residency matrix, model/policy order, cost caps, rate limit, live session status, p50/p95 latency, CER trend, provider errors, duplicate-attempt reconciliation and cancel/drain/rollback controls. Never show raw keys or sensitive audio in logs. Support tenant-visible list filtered by capabilities and entitlement.

### 7.5 Marketplace / Workflow

Define reusable `Speech.Transcribe`, `Speech.Stream`, `Speech.Synthesize`, `Speech.Diarize`, `Speech.Align`, `Audio.Understand` nodes or extensions only if current Spec 214 catalog lacks exact equivalents. Existing Spec 215 runtime owns execution semantics; the Spec 212 marketplace/use-case design baseline, if its runtime owner is verified, gets a **separate additive update**, not modification to the original spec. Mini App creator must declare what audio is captured, whether it leaves the region and the maximum billable cost.

## 8. Debian deployment (now)

**Required on Debian:** existing AI Gateway/HTTP client, encrypted provider secrets, access to existing R2/DB/`worker_jobs`, existing FFmpeg audio prep if available, outbound TLS, observability. Optional dependency-light audio metadata validation. **Not required:** GPU, CUDA, Whisper model weights, CrispASR, PyTorch, new Redis, new database or a second Celery/BullMQ queue.

Use provider HTTPS from backend, validate DNS/egress and timeouts, and minimize streamed binary buffering; jobs read private R2 assets through internal access or short-lived signed URL where provider supports it. Avoid public-facing raw provider endpoints. Restrict response/body size and timeout according to current Mini Server limits. Only start optional CrispASR CPU in isolated PoC if testing demonstrates a gap worth solving.

Suggested configuration (placeholders, not credentials):

```yaml
speech:
  enabled: true
  preferred_cloud: cloudflare
  batch_default_profile: thai_budget_batch
  providers:
    cloudflare: { enabled: true, endpoint_mode: rest, thai_status: eval_pending }
    openai:     { enabled: true, thai_status: eval_pending }
    gemini:     { enabled: true, thai_status: eval_pending }
    xai:        { enabled: false, thai_status: unverified }
    crispasr:   { enabled: false, deployment: optional_external }
  job_control: existing_worker_jobs
  media_store: existing_r2
  vector_index: existing_vectorize
  fallback_requires_approved_data_transfer: true
  raw_audio_log: false
```

**Do not presume** all provider features should be enabled at deployment: gate at `(provider, model, feature, locale, region)` resolution.

## 9. Cloudflare migration (zero planned outage)

| Stage | Control plane | Inference plane | Data/jobs | Gate |
|---|---|---|---|---|
| D0 current | Debian existing API | Cloudflare AI REST + approved external APIs | existing Redis/BullMQ/Celery and Postgres; R2/Vectorize | Baseline shadow tests and idempotency |
| D1 hybrid | Canary Worker Speech Gateway; old routes still live | unchanged hosted APIs | existing job control bridge; identical request IDs | Contract parity, audit and cost parity |
| D2 gradual | Worker primary for selected tenant cohorts, feature-flagged | Cloudflare AI Binding; other providers HTTPS/WebSockets | Postgres via Hyperdrive, R2, Vectorize; queue bridge preserving SoT | Dual-read and no double-execution; fallback tested |
| D3 cutover | Worker primary for all approved traffic; Debian rollback capable | hosted/cloud + optional Desktop Worker | existing unified `worker_jobs` SoT, safely migrating transport to Cloudflare Queues/Workflows where appropriate | 24–72h observation policy, error and billing gates |
| D4 retire | Worker native | managed external GPU for optional local speech workloads | drain/checkpoint, secret revocation, backups | Zero active leases, trace completion and owner sign-off |

**Cloudflare-specific design:** Workers are lightweight gateways, not GPU speech hosts. Use `env.AI` binding for Cloudflare models and HTTPS/WebSocket provider clients for others. Apply Cloudflare Queues *at-least-once* protections via existing durable idempotency/fencing. Do not create a second database or use D1 as replacement for canonical PostgreSQL. Current Cloudflare Vectorize is already the production vector index; never include an unnecessary pgvector re-migration. Cloudflare Container CPU use for CrispASR is optional only after measured cost/latency review; GPU tasks remain elsewhere.

### 9.1 Migration controls

- Deploy backward-compatible schema/API and replay-safe outbox; shadow routing must avoid submitting duplicate billable external jobs.
- Tenant-cohort canary at 1%→10%→50%→100% gated by measured success, p95 latency, audio quality and cost; percentages configurable rather than operational promises.
- Preserve original job IDs, tenant/project ACL, attempt provenance, retention, R2 keys and ledger during cutover; use split-brain fencing and leases to prevent two active dispatchers.
- Rollback = route new jobs to Debian while Cloudflare drains inflight accepted attempts; do not retry unknown accepted jobs blindly. Reconcile upstream charges before crediting.
- Disaster recovery: temporary Cloudflare outage routes to approved OpenAI/Gemini/xAI only where privacy, locale and budget allow; otherwise queue/defer and disclose delay.

## 10. Thai quality certification and acceptance

Prepare a **consented, license-cleared** corpus initially 150–300 clips across 6 groups: studio Thai; mobile noisy Thai; dialect/accent diversity; Thai/English code-switching; technical/domain jargon; 2–4 speaker meetings. Include varied recording devices, long-form chunks and no-speech/overlap. Stratify by speaker and recording origin to avoid leakage. Protect raw audio as restricted eval assets.

Metrics: CER normalized with versioned Thai text rules (Unicode normalization, spacing and numerals), WER with pinned tokenizer, domain term recall, hallucination rate on silence, speaker-attributed error where relevant, word/segment timestamp deviation against human gold labels, p50/p95 end-to-end latency, first partial latency, monthly landed cost per minute, crash/timeout/429 incidence and deletion compliance. Include native Thai human reviews for punctuation, code-switch and TTS intelligibility/naturalness.

**Proposed gate targets — to be validated on corpus, not claims about provider quality:**
- Basic Thai batch: CER ≤12% clean, ≤22% noisy; jargon recall ≥95% on designated critical terms **or** manual-review route.
- Production subtitle: ≥98% segment boundary tolerance within ±750 ms against human gold on eligible recordings; all export artifacts reopenable and editable; unsupported word offsets remain absent.
- Realtime Thai: final transcript end-of-utterance p95 ≤2.5s for nominated network/device profile; user-visible gap recovery 100% of deliberately interrupted test sessions; no irreversible tool action from interim text.
- Security/billing: zero cross-tenant retrieval in adversarial suite; zero duplicate *customer* charge in forced timeout/retry cases; all off-region/provider transfers prevented without authorization.

Targets are provisional and should become per-product SLA after baseline test data; if a model fails Thai certification, it may remain available for other certified languages, but MUST NOT silently serve Thai production traffic.

## 11. Security, operations, evaluation and incident runbooks

**Tests (required):** schema contract and provider mocks; real account smoke tests with redacted fixtures; request/response feature mismatch; Thai eval pipeline; conflicting Gemini parameters; voice agent/session reconnect; idempotency on `429`, timeout-before-accept, timeout-after-accept, callback duplication, cancellation race, queue re-delivery and dispatcher failover; signed media URL expiration; out-of-region routing denial; malicious audio/metadata; SSRF; R2 retention/deletion; provider key rotation; circuit breaker; job/session telemetry and billing reconciliation.

**Observability:** structured events with trace ID, tenant pseudonym, job/attempt/session IDs, chosen provider/model/region, parameter profile hash, HTTP/transport result class, audio duration, processing duration, model/retention version, cost estimation and reconciliation state. NEVER log raw audio, full transcript, private speaker reference or tokens in general telemetry. Alert when provider 5xx/429, p95 or CER breaches, audit gap, storage retention failure or unexplained charge divergence.

**Runbooks:** outage → disable tuple only (not whole product); region policy incident → freeze affected transfer and produce audit trail; Thai quality regression → pin model/version/processing profile and route to last certified tuple; provider deprecation → compatibility tests and planned migration; billing divergence → quarantine unfinalized charges, preserve provider receipts, human review; lost realtime session → mark gap and avoid tool execution until approval context restored.

## 12. Work breakdown and implementation sequence

| Milestone | Deliverables | Non-negotiable exit criteria |
|---|---|---|
| M0 discovery | inspect existing AI Gateway, Spec 231/237/242/245 and implemented Registry/worker_jobs/FFmpeg; reserve spec number; verify account entitlements and docs; redact source secrets | integration map, zero duplicate authorities, accepted model registry schema |
| M1 core | normalized Speech API; capability/probe registry; Cloudflare REST adapter (AI Binding as Cloudflare-target deployment profile); tenant permissions, budget and authorized audio ingestion | Cloudflare Thai holdout and account smoke tests; fail-closed routing; retry/charge correctness; Security P0 tests; an alternate provider is NOT a prerequisite for isolated M1 |
| M2 product | Chat/Mini Chat push-to-talk; Media Studio transcription; Video Editor subtitle revision and SRT/VTT; Project RAG authorized ingestion | cross-tenant checks, subtitle export, mobile and tablet UX |
| M3 extended | OpenAI file adapter plus Gemini batch / TTS and xAI STT/TTS independently flagged behind eval; diarization/timestamp composition planner; Thai eval dashboard | compatibility/error matrix, an independently qualified alternate cloud batch adapter for full product release, certified locales and provider cost receipts |
| M4 realtime | integrate with existing Spec 237 session gateway and Feature 196; OpenAI/Gemini/Cloudflare/xAI adapters as qualified; interim/final and gaps | reconnect/approval, voice safety and p95 Thai evaluation |
| M5 migration | Workers canary, Hyperdrive integration, existing job SoT bridge, Cloudflare AI Binding, telemetry and rollback | per-cohort gates; no lost/duplicate jobs; no downtime requirement met |
| M6 optional local | CrispASR Desktop Worker/dedicated instance only if measured workload demonstrates need | license, driver/VRAM, signed artifact and Thai CER pass |

Dependencies are *gates*, not obligations to implement each provider's every feature. M1 should not block on xAI or realtime certification; M5 may proceed with batch only if live is still experimental.

## 13. Cross-spec impact and backward compatibility

| Existing spec/system | Required additive action | Explicitly forbidden action |
|---|---|---|
| Specs 1–213 (including 212 and 213) | separate improvement register and compatibility adapter for UI/Marketplace/Runner | modify historical spec content in place |
| Spec 224 (active development) | consume existing kernel/job/approval contracts only, submit separate future proposal if needed | rewrite active implementation spec or bypass final verify |
| Spec 231 LLM routing | register speech capabilities and cost/eval hints through existing resolver | add competing Speech Router SoT |
| Spec 237 Realtime Multimodal | attach audio transports to existing session gateway and approval | introduce independent Voice Agent session authority |
| Spec 238 Alerts | add incident categories/monitoring outputs | fork alert platform |
| Spec 240 Dynamic UI | reusable speech input/transcript/voiceover component | UI-specific backend speech state |
| Spec 241 Memory | consented project transcript ingestion and deletion lineage | automatic cross-project memory from microphone |
| Spec 242 Cloudflare Native Runtime | Workers AI binding/Cloudflare transport, optional external sandbox contract | mandate CUDA within Workers |
| Spec 243 Cloud Agents | route speech tools as approved capabilities | parallel agent registry |
| Spec 245 Migration | phased cutover and rollback addendum | introduce D1 as SoT or re-migrate vectors from Vectorize |
| Spec 246 Scientific Discovery | permitted audio notes/transcript as workflow input only where useful | new research authority |

These links are design assumptions based on prior project planning; M0 must map actual canonical spec filenames, registry IDs and currently implemented API contracts before coding.

## 14. Definition of Done (production gate)

1. Four cloud provider adapters can be configured independently without changing product code; production features activated only by actual certified tuples (unavailable provider features are hidden/disabled).
2. At **full multi-provider product release**, Cloudflare batch Thai ASR and at least one independently verified alternative work end-to-end using the same authorization, artifact, routing and billing contract. M1 Cloudflare-only limited release may proceed under explicitly labeled availability and no-fallback policy if all M1 safety and Thai gates pass.
3. Debian production needs no speech model or GPU; existing FFmpeg/R2 integration reused; optional local runtime can be switched off safely.
4. Thai evaluation reports include source audio licensing, exact processing/model versions, CER and actionable human reviews; no unsupported claims of Thai model quality.
5. All data-sharing rules, tenant/project ACL, model entitlements, retention/deletion and consent tests pass, including adversarial Mini App isolation.
6. All retry/timeout/queue redelivery/cancellation cases pass idempotency and reconciliation; accepted unknown provider jobs are never blindly reissued.
7. Realtime transports work only through existing Session Gateway, with explicit partial/final/gap reconciliation and approval-gated tool calls.
8. Admin screens expose provider/locale/capability/price health and certification; incident alerts integrate existing alert center.
9. Cloudflare cutover completed through measured shadow/canary, rollback rehearsal, drain and zero unaccounted in-flight job checks.
10. All prior implemented specs remain untouched; additive integration report and test evidence are attached to new spec PR.
11. Rate/concurrency admission, provider-schema golden tests, transcript authenticity, live cost ceilings, speaker reference deletion, multi-region disaster recovery, client version compatibility and statistically defensible Thai quality gates (Annexes K–T) have reproducible evidence.
12. Immutable source/consent dispatch, authenticated provider events, full workflow cost caps, code-switch fidelity, realtime capture consent, revision invalidation, privacy/hold reconciliation, config promotion parity, economic-abuse controls and recovery drills (R21–R30 / Annexes U–AD) have reproducible evidence for every enabled feature.
13. R41–R50 gates: cross-version migrations, BYOK isolation, channel/sample integrity, Cloudflare request-resource constraints, uncertain provider acceptance, refund consistency, live-media credential containment, derived-artifact change propagation, backup/log residency and non-portable realtime cutover are proven or individually feature-gated with accountable owners and NOT_RUN evidence.

14. R51–R70 gates: grapheme-safe offsets, cohort SLO, provider brownout, protected Thai benchmark, capture clock, version negotiation, parser isolation, transitive data egress, accessible subtitles, executable traceability, realtime turn semantics, silence abstention, code-switch privacy, echo containment, offline capture, codec provenance, pre-RAG redaction, Thai TTS voice controls, speech-event versioning and canonical contradiction lint must carry evidence for every enabled feature.
15. R71–R80 gates: full requirements ledger, staged-release truth, provider account certification, ambiguity-safe charging, authoritative permission snapshots, revision-safe deletion, transport-specific streaming, Cloudflare canary integrity, Thai benchmark promotion hygiene and truthful UI claims must be signed off against their evidence pack.

## 15. Ten-pass design review / gap closure record (revision 1.1)

Ten distinct **specification-design reviews** were completed on the source document and the changes below were incorporated into its normative sections. They do not represent a code audit, real paid-provider calls, proof of account entitlements or production certification.

| Pass | Boundary inspected | Gap identified | Resolution applied | Acceptance evidence required |
|---|---|---|---|---|
| R01 | Published provider capabilities and Thai-language claims | xAI STT Thai was classified as wholly undocumented; risks missing a viable alternative. Its TTS/live language support could be incorrectly inferred from STT. | Distinguish xAI `th` STT **documented** from Thai TTS/live **not listed**; keep account probes and Thai quality certification mandatory. | Provider-doc snapshot, model+endpoint+locale probe and Thai corpus evaluation. |
| R02 | API request semantics and compatibility | Gemini `smart` vs diarization/timestamps conflict and long-audio constraints were under-specified. | Add request constraint planner, explicit `verbatim`/`smart` modes, max-duration checks and versioned two-pass alignment policy. | Negative tests for incompatible options and duration boundaries. |
| R03 | Pricing / provider failure / double billing | Budget reservations and unknown upstream acceptance lacked a formal settlement transition model. | Specify authorization/reservation/attempt/settlement ledger transitions, estimated vs confirmed charges, orphan receipt reconciliation and refund rules. | Timeout-after-acceptance, retry/replay and usage-reconciliation tests. |
| R04 | Long audio and cross-chunk output | Chunk joins risk overlapping duplicate words, timestamp drift, broken speaker IDs or false contiguous time. | Add chunk manifest, bounded overlap, absolute sample offsets, dedupe/conflict policies and human-review gaps. | >1h Thai audio with overlap/silence and sample-accurate timing gold. |
| R05 | Cloudflare runtime constraints / Debian migration | Workers request/response payload limits, long-running audio jobs and dual-dispatch handling needed explicit execution topology. | Add R2-first upload, existing async job control, dispatcher fencing, regional egress and environment-neutral adapter package, with no guarantee of GPU Containers. | Hybrid canary, large-file, lease-loss, drain and rollback rehearsals. |
| R06 | Consent, retention and data location | Provider uploaded artifacts, revocation, multipart recordings and audit transparency needed end-to-end lifecycle. | Add consent snapshot per attempt, revocation behavior, provider deletion tracking, transcript/embedding lineage and support-access controls. | Consent-revocation races, delete receipt, backup-window and tenant-isolation tests. |
| R07 | Realtime and irreversible tool execution | Partial/final ordering and live reconnect did not define complete replay and stable confirmation semantics. | Add bounded jitter/reorder buffers, final watermark, session epoch fencing, duplicate final elimination and reconfirmation after transcript edits/provider switches. | Fault-injected reorder, duplicate, partial rollback, reconnect and approval tests. |
| R08 | Security and supply-chain | BYOK outbound egress, remote URL fetches, content attacks and local model supply-chain controls needed concrete gates. | Add controlled media proxy, SSRF protections, prompt-injection boundary, egress policy, signed artifacts and secret rotation. | Adversarial audio transcript, credential rotation, URL redirect and artifact-tamper tests. |
| R09 | Integration, UI and accessibility | Provider details could leak into products; missing accessible capture and clear degradation behavior. | Keep products on the facade; add mobile low-bandwidth mode, WCAG-oriented capture/transcript states, recording indicators and transparent feature downgrade UI. | Keyboard/screen-reader/mobile tests and product contract snapshots. |
| R10 | Operability, SLO and cross-spec compatibility | No precise stop/go checklist for shipped API revisions, pricing drift and cloud cutover, and historical spec boundary must be protected. | Add feature-by-feature release manifests, rate-card expiry, rollback triggers, test matrix and additive cross-spec delta policy. | Owner-signed M0 integration map, provider doc verification, operational exercises and migration sign-off. |

**Review result:** Ten design passes completed; remediation incorporated into sections 1–14 and Annexes A–J. Remaining unknowns are explicitly recorded in Section 18 and must be verified against the live SmartSpecPro repository and actual provider accounts before implementation. No assertion is made that all possible gaps are eliminated.

## Annex A — Provider capability manifest and compatibility planner [R01–R02]

Treat the **versioned provider+model+endpoint+transport+locale+region+account** combination as the routable unit; feature flags are not independent when API parameters conflict. Manifest must include `input_formats`, `max_file_bytes`, `max_audio_seconds`, `max_live_session_seconds`, `max_speakers`, `timestamps_granularity`, `diarization_mode`, `mode_exclusions`, `vocabulary_limit`, `output_formats`, `stream_event_types`, `language_hint_semantics`, `data_retention`, `pricing_snapshot`, `version_eol`, and the evidence/expiry of each claim. Any missing required field fails closed; unsupported optional features must be disclosed before an audio upload. Provider capability probes **must not mutate production routing** without reviewer approval.

Gemini `verbatim` can combine diarization and word timestamps within supported length limits, but `custom_vocabulary` conflicts with either; `smart` conflicts with both. Define mutually exclusive modes and validate **before charging**. For multi-pass plans (e.g., one pass with vocabulary, another with diarization+timestamps), obtain permission for the extra transfer/cost, align by absolute audio span, preserve *both* outputs as separate evidence and label merged results `derived_multi_pass` rather than provider-native. Gemini unary audio requests: published limit up to 1h, or up to 30m when diarization/timestamps are enabled; published Live Transcribe session up to 10m—recheck on every release. For xAI, `th` is published on STT; do not infer Thai for its published TTS or realtime speech-to-speech language lists.

## Annex B — Contract-level schemas and standardized errors [R02, R09]

- Expose additive `/v1/speech/{transcriptions,streams,syntheses,capabilities,artifacts}` under existing auth and gateway conventions **only if** M0 confirms no conflicting routes; otherwise map to equivalent established routes. `Idempotency-Key`, `X-Project-Context`, correlation ID, `client_contract_version`, `privacy_policy_version` and a signed *effective user/tenant authorization snapshot* travel with each job or session.
- Standard errors: `UNSUPPORTED_CAPABILITY`, `UNSUPPORTED_LOCALE`, `INCOMPATIBLE_OPTIONS`, `INPUT_TOO_LONG`, `INPUT_UNREADABLE`, `CONSENT_REQUIRED`, `PROVIDER_NOT_ALLOWED`, `REGION_UNAVAILABLE`, `BUDGET_EXCEEDED`, `RATE_LIMITED`, `UPSTREAM_STATE_UNKNOWN`, `TRANSCRIPT_REVIEW_REQUIRED`, `SESSION_GAP`, `RETENTION_DELETE_PENDING`. Never leak provider credentials, full raw responses or audio in errors.
- `SpeechResult` `words[]` / `segments[]` carry independent `source`, `provider_native|derived`, `start_sample/end_sample`, `sample_rate`, `start_ms/end_ms`, `chunk_id` and `timing_confidence_type`. A model probability or alignment score is **not** automatically a calibrated correctness confidence. Preserve original output and human-edited version separately with ancestry and immutable hashes.
- No client may assume a transcript implies consent to tool execution, publication, training, translation or Project Memory ingestion. Authorize each operation independently.

## Annex C — Durable attempt and credit accounting state machine [R03]

`CREATED → POLICY_APPROVED → FUNDS_RESERVED → READY → SUBMITTED → {ACCEPTED, UNKNOWN_UPSTREAM} → {SUCCEEDED, FAILED, CANCELED, RECONCILIATION_REQUIRED} → {SETTLED, REFUNDED, DISPUTED}` is **logical metadata in existing `worker_jobs`/ledger**, not a second authoritative job state machine. Bind a stable logical job key to multiple immutable attempt IDs. A ledger reservation has one unique key `(tenant_id, logical_job_id, tariff_version)`; the final customer charge is idempotent against that key, not against the provider attempt count. Provider expenses are recorded per attempt separately, even where an ambiguous timeout leads to two vendor charges. Expired reservations are not automatically captured.

Before fallback, ensure no accepted attempt can still deliver a billable output or enter `RECONCILIATION_REQUIRED`. Unknown attempts are reconciled through provider request IDs, polling or billing exports when supported; if the provider has no status API, quarantine and require explicit cost-risk policy approval. Ensure a late callback after cancel/rollback cannot change the canonical outcome without fencing-token and attempt-epoch checks. Produce daily reserve/capture/refund/vendor-cost divergence reports and alert on orphan invoices.

## Annex D — Long audio and media correctness [R04]

Each source asset has immutable SHA-256, consent and retention ID, original sample rate/channel map, canonical duration and an ordered `chunk_manifest`. Segment boundaries use `start_sample`/`end_sample` against the source, overlap windows, encoder delay and conversion profile; display milliseconds are derived, not the source of truth. For chunk overlap, prefer stable word/segment duplicate detection using overlapping text **and** absolute-time IoU rather than blind text concatenation; retain ambiguous boundaries as flagged alternatives for manual review. Do not merge speaker IDs across chunks/providers without verified speaker continuity; provisional local labels remain scoped to `(provider, attempt, chunk)`.

Use R2-first ingestion and existing FFmpeg sandbox for codecs, duration and channel policy. Enforce provider byte/time ceilings and streaming backpressure *before* submission. For outputs larger than Workers response budgets, store artifacts in private R2 and return a scoped artifact reference. Large batch work belongs to existing durable job executors; Cloudflare Workers should not keep a long transcription transaction open in a request handler.

## Annex E — Speech data governance [R06]

Create a signed or immutable consent snapshot per job/session specifying capture purpose, allowed participants where applicable, tenant/project, acceptable providers/regions, external audio exposure, retention, permitted downstream RAG/assistant uses and revocation version. Reject if current permissions or consent conflict with the snapshot immediately before transfer. Mid-upload revocation cancels best-effort provider processing, suppresses delivery and marks externally retained data `DELETION_PENDING`; do not falsely promise upstream deletion. Track receipt status `requested|provider_confirmed|provider_unsupported|expired` per provider artifact. Deletion includes derived transcript revisions, embeddings, cached chunks, search pointers and backups per stated retention schedule. Provide user/admin export and deletion status without disclosing other participants' private content; log audited break-glass support access.

## Annex F — Realtime reconciliation and agent safety [R07]

A live stream is identified by `(tenant, session_id, session_epoch, provider_epoch)` under the existing Session Gateway. Sequence numbers, provider item IDs, audio clock samples, final-watermark, bounded reorder window and gap spans prevent duplicate final events and out-of-order commits. Interim revisions can be shown in the UI but not written to durable Project Memory or executed as tools. Only a stable final transcript, explicit user intent and existing action-specific approval permits irreversible tool execution. If provider switches mid-session, show the break, invalidate old speaker-label equivalence, reset provider-specific audio clocks and preserve contextual history only within approved project scope. Post-reconnect audio replay requires consent, replay watermark and at-most-once side effects, not an assertion of exactly-once transport.

## Annex G — Security and optional local-provider supply chain [R08]

All provider outbound traffic is from allowlisted gateway egress; remote audio URLs are accepted only by an authenticated media-fetch service that rejects private IPs, redirects to disallowed origins, DNS rebinding, unsafe protocols and oversized downloads. Prefer push-upload to private R2 with short-lived access tokens limited to exact object, duration and operation. Strip credentials from traces and propagate typed prompt-injection annotations from transcripts into downstream LLM/tool prompts: speech content is **untrusted data**, never a developer/system instruction. Escalate spoken commands only through existing approval and authorization. Store API keys server-side with rotation, BYOK tenant isolation, per-provider access controls and suspected-compromise shutdown.

Optional CrispASR/local runtimes require software/model license inventory, SBOM, checksums/signature verification when upstream provides it, container/user isolation, model allowlist, outbound network restrictions, resource quotas and a signed registration/capability heartbeat. Lack of upstream binary signatures must be recorded as a supply-chain risk rather than described as signed.

## Annex H — Deployment, canary, and rollback protocol [R05, R10]

Maintain a transport-neutral speech adapter package with Debian HTTPS client and Worker `env.AI` entrypoints. Separate secret names/env bindings from published model IDs. Put long-running or retryable processing behind existing `worker_jobs` with idempotent dispatch and R2 artifact handoff. Cloudflare Queue delivery is at least once; no second SoT. A migration controller changes a *single fenced routing generation*; shadow mode validates contract, metadata and synthetic fixture output **without duplicating real billable speech requests**. Progressive canary requires approved tenant cohorts, low-risk fixture traffic, latency/cost/quality telemetry and owner-approved thresholds.

Rollback switches only new dispatch to the previous verified generation. Accepted attempts complete or reconcile under their original owner; drain old consumers by lease and attempt epoch. Before retiring Debian, obtain evidence of zero unknown accepted attempts, zero unaccounted active jobs, complete custody of artifacts, verified secret rotation and a tested external API path if Workers or AI Binding is unavailable. Do not claim Cloudflare Containers offer GPU; optional CPU Container benchmarking may follow independently. Use Hyperdrive-connected managed PostgreSQL as authoritative data store and existing Vectorize only for authorized derived indexing.

## Annex I — Product UX, accessibility and deterministic degradation [R09]

Reuse the existing chat/media/transcript components. Show microphone permission, recording state, language hint, destination/retention notice and any switch of vendor that would move audio to another company/region. Mobile/web recording supports low-bandwidth mono input, offline pending uploads only by explicit user consent, keyboard and screen-reader control labels, cancel, timeout and upload recovery. For mini-chat, inherited project/tenant access filters apply to **both raw audio and transcript-derived search**. When word timing is unavailable, label segment-only subtitles; when diarization is unavailable, present unassigned speaker text rather than fabricated speaker labels; when Thai TTS is unavailable, offer text response or a separately approved alternative, never silently speak another language.

## Annex J — Release manifest and operational release gates [R10]

Every production-enabled tuple has an admin-approved release manifest containing: provider/model/API revision, transport, region, account entitlement, certified locales/features and *compatible feature combinations*, benchmark corpus+normalizer versions, latency/cost thresholds, current rate card with expiry, retention terms, fallback constraints, owner, evidence artifact hashes, feature flag and rollback target. On expiry, changed model alias, changed provider response schema, pricing drift or 3rd-party deprecation, move affected tuple to probation or suspend it according to policy; never auto-promote to production on successful HTTP probe alone. Stage gates: static contract + security tests → sandbox probe → Thai/domain evaluation → operational failure drills → tenant canary → owner sign-off. Require independent verification of billing and privacy fixtures before a broad rollout.


## 16. Second independent ten-pass design review / gap closure record (revision 1.2)

The following are **ten additional specification-level design reviews (R11–R20)** of v1.1, informed by targeted checks of current official Cloudflare, OpenAI and Gemini documentation and published xAI STT language support. Each review is mapped to normative requirements and executable acceptance tests in Annexes K–T; this is **not** a claim that code, paid API accounts, availability, production Thai accuracy, or a live repository has been tested.

| Pass | Risk surfaced in v1.1 | Remediation added | Test / owner evidence |
|---|---|---|---|
| R11 | Published provider limits vs account-wide contention and the absence of capacity reservation can cause bursts, retries, and surprise 429s. | Per-provider/model/account/region admission, burst budget, fair-queueing, quota telemetry and upstream rate-limit reconciliation (Annex K). | Simulate concurrent multi-tenant arrivals, shared-account exhaustion and quota changes; no retry storm. |
| R12 | Word-level timing and confidence could be over-advertised from segment/VTT output; diarization API variants need schema-level enforcement. | Response-schema fixtures and feature-granularity truth table; OpenAI diarize >30s chunking preflight (Annex L). | Golden response fixtures, missing-field/property tests, 30s boundary and format rejection tests. |
| R13 | Model-specific duration and multi-speaker ceilings could be hidden by a single `max_audio_seconds`. | Conditional constraints/limits planner with Gemini 1h/30m, 10m live, and experimental 3+ speakers (Annex M). | Boundary-value tests across feature combinations and session rotation with explicit gaps. |
| R14 | SRT/VTT exports, translation and post-edited text may erase alignment ancestry and misrepresent transcript confidence. | Artifact lineage DAG, semantic quality flags, language-aware subtitle conversion and deterministic export validation (Annex N). | Round-trip Thai/English subtitle fixtures, edited-text timing invalidation, multilingual drift tests. |
| R15 | Live streaming lacks explicit bounded queues, overload budgets and billable-seconds allocation on disconnect or client abuse. | Backpressure, per-session duration/idle/audio budgets, half-open connection cleanup, provider close semantics and partial billing (Annex O). | Slow-reader, packet-loss, browser-refresh and idle-mic chaos tests; bounded memory/cost. |
| R16 | Account-level privacy decisions were not pinned to provider-request-specific upload/file lifecycle and speaker reference assets. | Pretransfer exposure matrix, approved subprocessor/region version, encrypted temporary speaker samples and deletion attestations (Annex P). | Cross-region deny, BYOK scoping, ephemeral file failure, subject/participant deletion cascade. |
| R17 | Migration includes fencing but lacks a deterministic multi-writer cutover/rollback sequence and queue ledger reconciliation protocol. | Outbox CDC ordering, single dispatch lease generation, fenced consumers, explicit readiness and dual-environment disaster drills (Annex Q). | Partition/heal, lease expiry, duplicate queue deliveries, mid-cutover rollback, zero orphan outputs. |
| R18 | Thai benchmark point targets alone hide statistical uncertainty, dataset leakage and domain shift; live tool intent errors differ from CER. | Immutable corpus partitions, confidence intervals, critical-entity and speech-intent risk testing, shadow production drift monitoring (Annex R). | Holdout independent reviewer sign-off, confidence-interval release gate, slang/dialect/noise adversarial set. |
| R19 | Typed source content may still be treated as command; TTS/voice responses also need safeguards and provenance. | Threat model for spoken prompt injection, replay/voice spoofing, high-impact command confirmation, synthetic-voice disclosure and abuse telemetry (Annex S). | Spoofed/replayed audio and translated command tests; no irreversible action without authorization. |
| R20 | Backward-compatible request shapes do not guarantee mobile/browser SDK upgrade safety or provider-down disaster recovery. | Client capability negotiation, deprecation windows, encrypted exportability, no-provider mode and cost-bounded outage runbooks (Annex T). | Old/new-client matrix, Cloudflare/API outage exercises, backup restore and zero cross-tenant leakage. |

**Disposition:** Normative design changes incorporated into the original adapter, quality and DoD clauses where appropriate and fully specified in Annexes K–T. Items requiring the live repository, account permissions or paid testing remain explicit M0/M1 gates; do not silently call these production-certified.

## 17. Additional normative engineering annexes (revision 1.2)

### Annex K — Capacity management and rate limiting [R11]

Use shared capacity-management facilities rather than a separate speech queue. Provider capability tuples include `limits_observed_at`, per-model RPM, request/token/audio-minute caps, concurrent streams, max request payload, region and tenant/account quota class. Provision a bounded admission token/reservation before **each** billable attempt, including retries and two-pass transcription; release unspent reservations on terminal failure. Apply tenant-level weighted fair scheduling and separate interactive/live reservations from batch backlog to prevent starvation. Retry honoring `Retry-After`, jittered exponential backoff and circuit breakers, with global retry budgets and a bounded DLQ through the existing job system. Never use documented maximum as a guaranteed account entitlement: Cloudflare published ASR 720 requests/minute as of 2026-09-17, but per-model/account/plan limits can differ and other workloads share the quota. Alert on p95 queue wait and capacity divergence; fail closed when a required budget cannot be reserved.

### Annex L — Response-schema truthfulness and provider conformance [R12]

Maintain provider-specific **versioned** golden JSON/SSE/WebSocket event fixtures (with exact API version, headers/content type and nullable fields) and contract tests in CI. `timestamps=word` must resolve only to a provider-native word-offset field or explicitly consented alignment composition; VTT/segments must never be relabeled as word-level evidence. Confidence from decoder log-probability, diarization posterior, transcript self-assessment and human review must be stored under distinct types, never averaged into a fabricated universal score. For documented OpenAI `gpt-4o-transcribe-diarize`, use `diarized_json`; audio >30 seconds must supply supported `chunking_strategy` and format-valid references if known speakers are enabled. Unknown provider response changes quarantine the affected tuple, keep redacted samples, avoid silent best-effort parsing, and expose an actionable `PROVIDER_SCHEMA_CHANGED` error. Golden tests cover absence of words, unsupported locale, duplicate event IDs and type drift.

### Annex M — Conditional model limits and two-pass planning [R13]

Extend the manifest from flat ceilings to constraint clauses of the form `(model, API revision, task, mode, options, region, account tier) => {max_audio_duration, max_bytes, max_speakers, exclusive_options, max_stream_session}`. At the checked Gemini Transcribe documentation baseline, standard unary supports up to one hour; requests with word timestamps or diarization have a 30-minute ceiling; live transcription supports at most 10-minute continuous sessions; diarization accepts up to eight speakers but attribution for three or more is experimental. Reject impossible combinations **before upload**. For long audio, chunk at voice-aware boundaries within each chosen model's legal limits and preserve a full manifest. For Gemini vocabulary + diarization/word timestamps, only an authorized, two-pass derived workflow may join outputs; include additive vendor cost, source anchors and conflict-review flags. If model limits change, recertify only affected capability tuples.

### Annex N — Canonical transcript, subtitle and translation provenance [R14]

Maintain immutable layers `raw_provider_output → normalized_verbatim → edited_revision → translated_revision → subtitle_export` with hash-linked parent IDs, edit actor, source language and alignment version. Smart/filler-removed dictation and translation are **derived text**, not source ground truth. If an edit changes character span, invalidate affected word timing and request a separate alignment pass or label segment-only timing; never stretch words heuristically while claiming precision. Thai segmentation uses a pinned tokenizer only for optional readability/export decisions; preserve original text offsets in Unicode code points plus explicit normalization maps. Ensure SRT integer millisecond rounding, ordered cue numbering, non-negative intervals, WebVTT header validity, UTF-8 Thai handling and speaker caption privacy. Re-import exported captions in tests and prove source span/timestamp drift remains inside declared tolerance; retain human review for overlapping speech and jargon translation.

### Annex O — Streaming transport, backpressure and spend protection [R15]

The existing Session Gateway terminates browser credentials and owns authorization; provider connections originate from trusted backend/Worker, not browser-held vendor keys. Impose max frames/second, PCM byte-rate, jitter-buffer length, bounded server-to-browser event queue, silence/idle thresholds, max active session duration, reconnect attempts, and maximum accrued billable audio duration or character count. Stop upstream capture/close vendor connection when client is gone and reconnect grace expires; mark any remaining vendor bill as uncertain and reconcile. Do not endlessly buffer audio or retry billable streaming blindly. Distinguish provider `final`, `interim`, `turn_end`, `error` and `close` events; preserve final-watermark and absolute audio clocks. For cloud runtime, verify WebSocket upgrade behavior, cancellation/close and max session durations on the chosen Worker deployment; use an authorized reconnect with explicit audio gap, not silent seamless handoff. Meter customer liability by approved usage policy rather than raw provider connection uptime alone.

### Annex P — Provider-bound privacy and temporary-media disposal [R16]

Record an immutable **preflight transfer receipt** tied to `(logical_job, attempt, source_asset_version, provider, account, region, declared_subprocessors_version, consent_snapshot_version)` and reevaluate permission just before the network call. Distinguish server-side direct upload, provider-controlled temporary Files API, provider-fetch signed URL and live packet streaming; each needs a separate exposure/retention declaration. Prefer server-to-provider transfer for private audio and short-lived, one-object signed URLs only when technically required. If speaker reference audio is used, store it in a restricted distinct class with explicit named-person authorization and narrower TTL than ordinary transcription output; no biometric identity matching by default. Persist upstream file IDs encrypted, request deletion at the earliest allowable time even when normal processing fails, and retain provider deletion **status**, not an unverified guarantee. Cross-border policies must validate where provider inference and **retention/backups** actually occur; unknown geography means provider ineligible for location-constrained data.

### Annex Q — Deterministic dual-deployment handover [R17]

Only the canonical `worker_jobs` owner can issue `dispatch_generation`, monotonically increased in PostgreSQL transaction with a fenced owner lease and outbox event. For each logical job, a single designated dispatcher generation may create new upstream attempts; consumers reject stale generations before provider call and before final commit. During Debian→Cloudflare cutover: (1) deploy compatible schema/read paths; (2) dual-run **read-only** contract shadow; (3) drain/stop new old-owner dispatch; (4) atomically advance generation and enable Worker dispatcher; (5) verify outbox/queue lag, accepted-attempt reconcile, invoice state and R2 artifact access; (6) expand cohorts. No simultaneous production dual-write. Rollback creates a **new** generation to Debian rather than reviving old epochs; accepted Cloudflare attempts remain tied to their original attempt ID and can finalize only through canonical fenced reconciliation. Exercise simulated WAN partition, database reconnect, delayed callback, lease theft, Queue at-least-once redelivery, Worker redeploy and media deletion race before cutover.

### Annex R — Thai certification methodology and decision uncertainty [R18]

Freeze corpus, consent and reference-text provenance into immutable train/dev/test and external holdout splits stratified by **speaker, event, recording device and originating customer**; never tune routing or vocabulary on final holdout. Stratify domain (everyday, engineering, healthcare only when separately authorized), accent/dialect, code switching, noise, low-bitrate mobile, speech overlap, silence and long-form. Report CER/WER with normalization and 95% bootstrap confidence intervals by cohort, plus critical-entity omissions/substitutions and unsafe voice-command acceptance/rejection rates. Set explicit maximum tolerable worst-cohort and critical-entity error separately from population-average CER; small sample cohorts remain `insufficient_evidence` and cannot be automatically certified. Use paired-source A/B at the same input and preprocessor version, randomize human raters where practical, and track actual production opt-in quality feedback with drift detection and privacy-safe retention. The provisional Section 10 thresholds are **targets to validate**, not proof of model superiority or guaranteed service quality.

### Annex S — Voice and spoken-content abuse safety [R19]

Treat recordings, transcripts, translated text, diarization labels, caller-supplied vocabulary, attachment filenames and live partial events as untrusted. A recognized spoken command is not proof of the speaker's identity, role or authorization. Require an authenticated user action and action-specific approval for payments, deletion, outbound messaging, cloud deployment or tenant configuration; independently confirm high-impact commands from an authenticated channel, including in a noisy/replayed/deepfake-voice scenario. Apply content-safety and usage policies equally to text and synthesized audio; add explicit disclosure when output is AI-generated where product/policy requires it. Voice cloning and known-speaker enrollment remain opt-in future work behind verified rights, consent and anti-impersonation checks. Rejected command audio is never automatically fed to training, project memory or unrestricted support logs.

### Annex T — Client contracts, portable operations and no-provider mode [R20]

Advertise `api_contract_version`, `provider_capability_revision`, `session_protocol_revision` and feature-negotiation result in the same existing Gateway capability endpoint. Maintain N/N−1 client contract conformance for supported mobile/web/desktop releases; preserve old clients' ability to render plain transcript/text when diarization/word offsets/voice output are unavailable. Breaking contract changes require deprecation notice, adapter bridge and measured old-client traffic before removal. Store all durable source assets, normalized text, usage receipts and approved model/provenance metadata in portable R2/PostgreSQL formats independent of any provider SDK. On total speech-provider outage or exhausted budget: preserve authorized input in the existing private queue only when retention/consent allows, offer manual upload/edit/transcript or text Chat, show explicit deferred state and never claim success. Test simultaneous Cloudflare AI and one external provider failure, expired credentials, R2 unavailability, managed PostgreSQL failover, old-client reconnect and full restoring of a retained job without double customer billing.

## 18. Open questions for M0 verification (do not silently infer)

- Confirm next free spec ID after reading live SmartSpecPro registry.
- Inspect actual versioned AI Gateway routes/SDK conventions, provider registry, R2 media asset schema and latest approved Spec 231/237/242/245 revisions.
- Verify supported regions, Thai language and model entitlements for *actual* Cloudflare, OpenAI, Gemini and xAI accounts; xAI custom-voice region restriction is not a global capability.
- Confirm per-provider data processing, retention and contractual controls for user-selected tenant regions.
- Establish real Thai benchmark against current existing ASR and live latency baseline; replace all provisional targets with product-specific acceptance thresholds, independent holdout, subgroup uncertainty and critical-entity gates.
- Resolve live shared-account rate limits, subprocessor/retention geography, OpenAI diarization account features and streaming WebSocket quotas before enabling the corresponding tuple.
- Verify existing client SDK supported-version policy, provider file-deletion status APIs and actual dispatcher fencing/outbox interface before committing migrations.
- Confirm source code/package licenses of any optional CrispASR and separately licensed weights.

## 19. Third independent ten-pass design review / gap closure record (revision 1.3)

**Scope of review:** specification text only, based on the accessible Version 1.2 artifact plus targeted checks of the published Cloudflare Whisper Turbo, Gemini transcription and xAI STT documentation on 2026-09-25. These are ten distinct architectural/operational review passes, **not** ten live integration runs, a source-repository audit or production certification. Recheck dynamic provider contracts at M0 and each release. All R21–R30 requirements below are normative, additive to Sections 0–18 and Annexes A–T. In a conflict, stricter privacy, authorization and immutable-evidence rules prevail; explicit product signoff is needed before changing established system authority.

| Pass | Review focus | Additional gap closed | Acceptance evidence required |
|---|---|---|---|
| R21 | Immutable input and consent at dispatch | Source media or permissions may change after scheduling, causing the wrong asset or unauthorized copy to be sent. | Version-pinned input/consent preflight and mutation-race test. |
| R22 | Provider callbacks and receipt authenticity | A forged, duplicated, stale or delayed webhook can complete the wrong attempt or cause incorrect settlement. | Signature/replay/fencing test matrix including callbacks after rollback. |
| R23 | Composite task budgeting | Multi-pass audio workflows can exceed budget despite every individual provider call staying under its own cap. | Whole-plan reserve/cap/settle tests under partial failure. |
| R24 | Code-switching and language-segment truth | A single file-level `language_detected` hides Thai-English switches and causes incorrect word/timestamp/text normalization. | Segment-level language gold tests without inferred unsupported labels. |
| R25 | Realtime capture and participant consent | A session consent flag alone does not cover device permission, new participants, background/resume capture or mid-call withdrawal. | End-to-end consent-state and capture-termination exercises. |
| R26 | Human correction and downstream side effects | Transcript edits or model reruns can silently contaminate prior RAG, tasks, subtitles or tool commands. | Revision-specific invalidation/reindex and no-duplicate-action tests. |
| R27 | Data lifecycle and legal holds | Privacy deletion may collide with open billing disputes, audit obligations or external provider file retention. | Tombstone/deletion-versus-hold race and export-verification tests. |
| R28 | Configuration and model release drift | Secrets, routing manifests, model aliases and default parameters can diverge between Debian and Workers. | Signed promotion-manifest parity, rollback and alias-change probes. |
| R29 | Reliability and capacity under economic attacks | Upload/chunk/stream fan-out can overload shared queues or exhaust credits and provider quota before billable outputs exist. | Concurrent multi-tenant soak/load and anti-amplification tests. |
| R30 | Recovery and acceptance evidence | A passing happy-path smoke test cannot prove backup restoration, external-account outage tolerance or production readiness. | Reproducible drill matrix, ownership and evidence-completeness gate. |

### Annex U — Immutable media and authorized dispatch transaction [R21]

Every attempt **MUST** bind `(tenant_id, asset_id, immutable_asset_version, sha256, byte_size, media_duration, processing_profile_hash, consent_snapshot_id, entitlement_revision, retention_policy_revision)` at the authorization boundary. The dispatcher revalidates all fields just before any external transfer under an authenticated server identity, including tenant/project ACL, participants' consent where required and region/provider approval. The R2 object key must be immutable/versioned or content-addressed for the attempt; mutable aliases are resolved to the pinned object **before** quoting and reservation. If a file, permission, consent or destination-provider policy changes, fail closed or create a **new** authorized attempt; never silently reuse an old transfer receipt. Media preflight must check decode-bomb style duration/sample-rate expansion and actual decoded time as well as declared file metadata.

Acceptance: replace an upload after job creation; revoke external transfer approval one millisecond before dispatch; move media to a different project; race R2 version rollover and worker lease expiry. All cases either use the original authorized immutable asset or decline transfer; audit log links the exact input bytes to the upstream receipt and result.

### Annex V — Authenticated provider events and monotonic attempt transitions [R22]

Where a provider exposes callbacks/webhooks, verify provider-specific signature or authenticated fetch, permitted key/version, bounded event age, timestamp tolerance and replay cache **before** parsing a user- or provider-supplied job ID. Correlate to a recorded `(provider_account, upstream_request_id, attempt_id, dispatch_generation, event_id)`; reject cross-account mismatches and duplicated or regressive terminal events. If an upstream platform offers no verifiable callback contract, disallow its inbound webhook path and use approved authenticated polling or an explicit reconciliation workflow. Rotate signing secrets with overlap and revoked-key tests; prevent request body mutation prior to signature checking. Callbacks update attempt observations **only**; canonical `worker_jobs` finalization, artifact acceptance and credit capture remain fenced, transactional operations. The same rules apply to internal Queue messages/outbox consumers even if delivered multiple times.

Acceptance: forged payload, altered body, replayed event, two opposing terminal callbacks, webhook after customer cancellation, stale Debian callback after Cloudflare promotion and secret rotation. No false completion, unapproved R2 read or duplicate customer charge.

### Annex W — Whole-workflow quote, admission and charge caps [R23]

Define a `speech_execution_plan` as an **immutable costed DAG** of required operations (decode, optional chunk/transcode/VAD, each vendor pass, alignment/diarization, synthesis, storage, optional LLM analysis). The existing shared billing service produces a versioned upfront **maximum approved customer charge**, estimated vendor spend and per-provider reserve; cross-provider fallback, plan expansion, extra model pass and chunk explosion require re-quote before execution. Record currency, exchange-rate snapshot if applicable, vendor rounding/minima, output duration/character estimates, fixed preprocessing charges and refunds; prohibit confusing a vendor estimate with captured customer spend. A provider timeout or cancellation cannot authorize exceeding the approved cap. Reserve per logical job, release unused balance deterministically and reconcile vendor loss to the platform ledger separately; do **not** silently pass unexpected vendor costs to customers. Existing wallet and job ledger remain SoT; this annex is a planning contract, not a new accounting system.

Acceptance: 60-minute clip with overlap/chunk fan-out, Gemini authorized two-pass plan, TTS output truncated/expanded, exchange-rate drift, upstream timeout with billable vendor work and provider fallback. Every accepted plan stays within its approved customer ceiling or pauses for explicit reauthorization.

### Annex X — Thai/English mixed-language transcript structure [R24]

File-level `language_detected` is advisory. Normalize language hints using BCP-47 but retain exact provider-returned language and certainty semantics, plus optional per-span `{start_sample, end_sample, language_tag, source: provider_native|human_verified|derived, confidence_type}`. **Never fabricate segment-level language classifications** when a vendor only returns a single file-level label. Version Thai normalization separately from English tokenization; Unicode NFC, zero-width characters, numerals, punctuation and product/technical names must preserve original offset maps. Keep code-switching speaker/tag boundaries as annotations not destructive text rewrites; translation and smart dictation remain derived revisions rather than replacing verbatim transcript. Conditional language-specific routing or chunk reprocessing may use only an explicit, budgeted second pass and must not infer the language from untrusted user-supplied words alone.

Acceptance: Thai↔English switches within one utterance, English brand/medical terms inside Thai, numerals, accented Thai and overlapping bilingual speakers; assert normalized text is reversible to provider-source spans, and unsupported per-word language flags are absent.

### Annex Y — Realtime recording consent state machine [R25]

Existing session authority owns authenticated start/stop and participant identity. This spec adds scoped capture-policy metadata: `device_permission`, `recording_notice_delivered`, `participant_consent_revision`, `external_provider_transfer_consent`, `session_epoch`, `capture_state`, `last_final_watermark` and `consent_withdrawn_at`. Permission for local microphone capture is not sufficient consent for cloud transfer, storage, project memory, training or tool execution. On a new participant, meeting-room source change, resume from background, provider switch to a different data jurisdiction, or withdrawal of consent, stop/pause external forwarding until the current policy has been revalidated. Terminate or discard unauthorized buffered frames; do not backfill restricted audio after policy restoration. The UI must expose persistent recording/transmitting indicators, an accessible stop control, retention terms and who can access transcripts. Realtime transcripts remain draft until final and are excluded from autonomous irreversible actions regardless of consent state.

Acceptance: microphone granted but cloud transfer denied; guest joins during live session; user switches project; browser tab backgrounds then resumes; consent revoked mid-packet; mobile offline frame retransmission after revocation. Unauthorized frames never reach an upstream provider or reusable storage and users can see exact gap boundaries.

### Annex Z — Transcript revision graph and downstream invalidation [R26]

Each transcript, translation, summary, subtitle, embedding, alert proposal and tool-action proposal stores source revision and source span IDs, immutable parent hashes, task approval and processing version. Correcting, redacting or deleting a transcript **MUST** emit a canonical revision event via the existing outbox; dependent Vectorize entries, summary caches and linked project-memory references are invalidated/rebuilt subject to current authorization and retention rules. Previously issued external actions are **not undone or replayed** automatically when an audio result changes; mark them `source_superseded`, show a human-readable impact report, and require normal approval for any corrective action. Separate `recognized_intent` from `authorized_action`, keep preview-only proposals for volatile transcript stages and version source anchors through translations. A revised transcript that changes a speaker label invalidates speaker-attributed task ownership until re-reviewed.

Acceptance: human changes a number, name or speaker in a Thai meeting transcript after summary/RAG/task creation; old embeddings stop serving, subtitle references resolve to the correct revision and no notification/payment/delete action runs twice.

### Annex AA — Privacy deletion, audit minimization and legal-hold reconciliation [R27]

Deletion workflow uses existing data-governance authority, not a new retention registry: place an immediate tombstone and deny retrieval; asynchronously cascade to R2 original/derivatives, provider temporary assets (where deletion API exists), transcription layers, Vectorize references, caches and authorized exports under a `deletion_request_id`. Preserve **minimal non-content** accounting and audit records only for a documented lawful retention basis; never retain raw audio or rich transcript merely to simplify cost disputes. If legal hold legitimately applies, encrypt and isolate held objects with restricted access, separate purpose, expiration/review and a transparent `held_pending_release` status; do not report deletion complete while relevant held assets or provider copies remain. If a vendor offers no deletion guarantee or unverifiable retention, reject privacy-constrained tasks requiring it. Include backup age and bounded propagation windows as explicit policy facts, not promises of immediate physical erasure.

Acceptance: delete during pending provider upload, after success before RAG indexing, during billing dispute, after tenant downgrade and immediately before backup restoration. No tombstoned audio becomes reachable; report every outstanding downstream deletion obligation accurately.

### Annex AB — Reproducible configuration promotion and model-drift control [R28]

Ship environment-neutral adapter code with a **signed** or equivalently integrity-verified promotion manifest: package git SHA, adapter build hash, dependency/SBOM digest, API schema revision, exact model/endpoint/transport tuple, allowed language/region, effective provider parameters, rate-card snapshot, capability/eval certification revision, secret *reference* (never value), FFmpeg profile and feature-flag/tenant-cohort revision. Deploy the **same approved manifest** to Debian and Cloudflare stages; environment-specific bindings must be checked for semantic parity. On upstream model-alias drift, changed default parameters, retired model or rate-card expiry, automatically demote only affected capability tuples and notify Admin; require explicit recertification before production return. Pin where the vendor allows; where pinning is impossible, probe representative fixtures before expanding traffic. Revert config via a new revision and preserve old attempt provenance; never mutate historical receipts in place.

Acceptance: stale secret ref, Cloudflare binding name changed, Gemini API version change, model alias changes output shape, and rollback mid-accepted job; both deployments give compatible normalized outputs or gate the affected tuples off.

### Annex AC — Multi-tenant admission control and workload-amplification resistance [R29]

Enforce bounded **decoded** audio seconds, source bytes, channel count, sample rate, number of derived chunks, overlapping fraction, concurrent stream frames, active live session minutes, outbound provider requests and total anticipated vendor cost *per tenant and per logical job*. Fair scheduling through existing worker_jobs respects interactive versus batch capacity without allowing interactive traffic to starve all batch jobs. Protect shared provider quotas with weighted reservations and load shedding, not only endpoint-level request rate limits. Every async task has a deadline and cancellation propagation with late-arrival fencing. Use circuit breakers with bounded retry budgets, decorrelated jitter and no retries for unauthorized/unsupported/cap-exceeded failures. Detect uploaded silence, repeated corrupt media and high fan-out requests that consume resources without useful output; throttle abusive traffic without silently losing authorized jobs. Application-layer protections apply before R2 staged uploads as well as after upload.

Acceptance: 100 parallel short files and one 3-hour podcast from separate tenants, excessive overlapping chunks, reconnection storms, sustained 429/503 and a tenant with exhausted wallet; demonstrate bounded queue lag, memory, concurrency, vendor exposure and no cross-tenant starvation within defined SLO budgets.

### Annex AD — Recovery exercises and evidence manifest [R30]

A production change must include test and drill evidence anchored by `(spec_revision, artifact_sha256, test_suite_commit, provider_model_endpoint_revision, evaluation_corpus_revision, environment, UTC test_time, reviewer, linked incident/runbook IDs)`. Required drills: upstream accepted attempt lost locally; provider callback delayed through cutover; PostgreSQL failover during reserve/capture; R2 read or delete unavailable; Cloudflare outage during active stream; credential rotation; forced rollback; backup restore with privacy tombstones; whole approved provider pool unavailable; tenant export followed by deletion. Require measurable recovery objectives `RTO`, `RPO`, quote/cost divergence, terminal job reconciliation window and deletion-processing deadlines to be set by product/SRE owners, not guessed in this spec. No `PRODUCTION_CERTIFIED` status on documentation-only review: promotion needs successful tests, Thai cohort evaluation, security signoff, privacy/regional approval and owner-reviewed rollback evidence. Unsupported provider/account features remain disabled rather than blocking independently certified services.

**Release addendum / Version 1.3 Definition of Done:** All R21–R30 acceptance suites are implemented and evidenced; otherwise mark each incomplete item as explicitly blocked, feature-gated or non-P0 with its accountable owner, rather than silently claiming complete production readiness. M0 must verify canonical Spec 247 registration and current implemented SmartSpecPro schemas before any implementation PR. Baseline documentation checked in this review: Cloudflare Whisper Turbo model documentation; Google Gemini dedicated transcription documentation (including custom vocabulary incompatibilities and mode/duration limits); xAI Speech-to-Text documentation (published Thai `th` formatting support). Documentation snapshots do not certify tenant account availability or Thai model quality.

## 20. Fourth ten-pass design review / gap closure record (revision 1.4, R31–R40)

This is a **document-design review**, not a runtime pass or evidence of access to the latest private SmartSpecPro implementation. The ten passes below compare the v1.3 requirements against operational failure cases and official provider documentation. Normative requirements and independently testable acceptance evidence are supplied in Annex AE–AN. Where prior requirements already cover part of a finding, the annex tightens the contract rather than creating a duplicate subsystem.

| Pass | Gap found in v1.3 | Remediation | Verification / owner |
|---|---|---|---|
| R31 | Cross-provider capabilities modeled as feature flags without sufficiently explicit dependency/conflict and attestation freshness semantics | Annex AE: constraint graph, tri-state field support, probe/eval scope and demotion | Registry owner; combinatorial contract tests |
| R32 | Large-file transfers could become public links, violate residency, fail after signed-link expiration, or outlive revocation | Annex AF: bounded ingress/egress and upload lifecycle with transfer receipts | Storage/privacy; TTL/expiration/revocation drills |
| R33 | Audio/video editing timelines may mix container PTS, sample-clock and provider-relative timestamps, especially with VFR and chunk overlaps | Annex AG: explicit rational clock/timebase and deterministic stitching contract | Media Editor owner; fixture-level timing tests |
| R34 | Synchronous ASR results can contain adversarial spoken instructions; downstream derived tasks need a trust boundary stronger than 'final transcript' | Annex AH: content taint, provenance-bound citations and action authorization | Security/agent owner; malicious Thai audio tests |
| R35 | Third-party streaming speech and tool calls can have distinct billing meters and irreversible side effects during network partitions | Annex AI: session-level lease, bounded media buffers, independent tool authorization and cost settlement | Realtime/billing owners; partition and replay drills |
| R36 | Price/rate cards and usage can be denominated in incompatible units/currencies, including cached minimums and tax/FX effects | Annex AJ: typed metering and conservative spend reservations | Billing owner; rate-version and FX tests |
| R37 | Independent privacy controls for listening, storage, derived models, provider data use and export were not formalized as separate policy capabilities | Annex AK: purpose-scoped data-use matrix and enforcement before every transition | Privacy owner; withdrawal/export matrix |
| R38 | Thai evaluation lacked explicit uncertainty intervals, failure segmentation, accessibility reviews and change-control thresholds for model promotions | Annex AL: paired/stratified promotion gate and regression arbitration | Thai QA owner; reproducible holdout report |
| R39 | API/schema/capability changes at providers may be detected only after user-visible failures; multi-deployment releases need safe probing and rollback triggers | Annex AM: canary probe schedule, offline contract fixtures and kill switch ownership | Platform/SRE; synthetic drift and outage drills |
| R40 | Additive spec scope could still accidentally require edits to historical specs or a second billing/session owner | Annex AN: exact implementation boundary, handoff map, critical-path plan and evidence checklist | Spec owners; repo-level dependency review |

### Annex AE — Constraint graph and non-fabricating adapter normalization [R31]

- Define a **machine-validated** capability tuple: `(provider, account, region, model_id_or_alias, api_version, endpoint, transport, language, output_schema_revision)` plus `supported_features`, `feature_conflicts`, `feature_dependencies`, `limits`, `rights`, `verified_at`, `expires_at`, `documentation_sha`, `probe_id`, `evaluation_id` and `kill_switch`. Model aliases have separate provenance and cannot inherit certification from a prior fixed model version without a fresh representative probe.
- Supported result fields use `native | derived_via_approved_pipeline | unavailable | unverified`. `derived` must record its producing provider/model/job/usage; `unverified` is **not** equivalent to `native`. Satisfy compound requirements only after constraint solving; never submit a mutually incompatible API request just because each individual flag exists.
- **Documented Gemini example:** batch verbatim speaker diarization plus word-level timestamps can be requested together; each conflicts with custom vocabulary. Gemini live supports interim/final utterances but no live diarization or live word-level timestamps. Verify per-account endpoint before certification. **Cloudflare Whisper Turbo** publishes segment/VTT output; do not fabricate word timing. **xAI STT** requires multipart form option fields before `file`; the language formatting switch does not certify Thai quality.
- `GET /v1/speech/capabilities` returns only entitlement-filtered, unexpired, supported tuples; distinguish `not_certified` from `temporarily_unavailable` in error responses. Suspended capabilities must be removed from production route candidates atomically; never silently fall back to an uncertified locale.
- **Acceptance:** automatically generate pairwise tests for supported/unsupported/conflicting parameter combinations. Exercise Gemini `diarization+word_timestamps` success when account probe supports it, `custom_vocabulary+diarization` denial or explicit budgeted two-pass plan, Cloudflare word-offset rejection and expired xAI account entitlements. Store redacted request/response fixture hashes; failures quarantine the affected tuple, not an unrelated provider.

### Annex AF — Data path, provider upload and transfer containment [R32]

- All provider transfers begin with an immutable, tenant-authorized R2 asset version and dispatch-time consent snapshot. A transfer manifest records `asset_sha256`, source version, intended provider/project/region, permitted use, maximum bytes/duration, signed-link audience and TTL, upload ID, retry allowance, retention/deletion deadline and tombstone epoch. Revocation must block the next chunk or signed read; an already delivered byte stream must be disclosed as delivered, never described as recalled.
- Default to **server-to-provider streamed multipart** or vendor Files API on an approved trusted executor. Signed GET URLs are permitted only when the provider demonstrably requires URL ingestion, regional policy permits it, URL scope is single-object/short-lived and access can be revoked or object key rotated. Never turn private R2 objects public to satisfy an upstream URL-only input. Model the case where an asynchronous provider pulls the file *after* the initial job request, and ensure TTL covers that bound or use a different transfer strategy.
- Bound body bytes and decoded sample count at gateway and executor; inspect MIME by content and reject archives/hostile metadata, decompression bombs, redirects to private IPs and cross-tenant asset redirects. Avoid Workers request-body buffering of entire multi-hour recordings; stage to R2 and use allowed stream/chunk processing on a suitable executor. Respect outbound service limits and approved residency per operation.
- On upload timeout, distinguish `upload_not_started`, `upload_partial`, `upload_complete_unacknowledged` and `provider_object_id_known`. Persist deletion obligations for **every** provider upload object, including abandoned partials when deletion API permits. A privacy-constrained request with unverifiable provider retention should be rejected before transfer, not merely marked for cleanup later.
- **Acceptance:** signed URL expires before delayed provider pull; consent revoked between chunks; 307 redirect to metadata IP; provider upload accepted but local network drops; 2 GB source and 3-hour decoded audio; account restricted to one region. Confirm no public reusable URL, unauthorized egress or orphan object silently marked deleted.

### Annex AG — Canonical clock, channel and deterministic media alignment [R33]

- Persist input `sample_rate_num/den`, decoded sample count, channel mapping, source-container presentation timestamp (PTS) origin, and **rational timebase**, not only floating-point milliseconds. For video, preserve source VFR PTS and audio/video drift correction; for extracted media, record edit list, trim offset, resampling ratio and any silence/VAD omissions. Absolute timeline export is derived from these maps and only then rendered to milliseconds or subtitle frame rates.
- Chunk manifests store original decoded sample interval `[start,end)`, overlap intervals, channel source, per-pass offset, resampling profile hash and exact clock conversion. Merge duplicate words only where acoustic/span evidence supports it; do not delete both copies of overlapped speech. For multi-channel meetings preserve channel identity separately from provider `speaker_id`, and mark an unresolved cross-chunk speaker identity as unknown rather than merging by label string.
- Every transcript span links to immutable source media and `clock_map_version`; VTT/SRT exports undergo monotonicity/no-negative-time checks and re-import roundtrip against source timeline. Translation and summarized captions are **derived assets** and cannot overwrite source timing without an explicit alignment pass.
- **Acceptance:** 44.1 kHz audio resampled to 16 kHz, 23.976/29.97 VFR video, 500 ms chunk overlap, midstream codec change, negative/late PTS, silence removal and Thai/English speaker overlap. Enforce configured maximum offset drift over 2 h and prove every exported subtitle cue maps to the authorized source interval.

### Annex AH — Speech-to-tool trust boundary and retrieval-safe transcripts [R34]

- Treat microphone samples, transcripts, subtitles and provider metadata as **untrusted content** even when ASR marks them final. A final transcript confirms the recognized phrase, **not** the speaker's identity, intent, authorization or entitlement. Store distinct `source_transcript`, `interpreted_intent`, `proposed_action`, `approval_record` and `executed_action` references in existing job/session events; never promote transcript text into system/developer instructions.
- Spoken phrases in third-party recordings, retrieved podcasts, meeting transcripts or live commerce audio are document content unless the authenticated session owner explicitly selects them as an instruction. Minimize data retrieved for Mini Chat through current project/tenant ACL; recheck every tool call's scope, budget and approval. For actions affecting money, publication, deletion, external messaging, credentials or cross-tenant data, use existing approval and idempotency before dispatch. Speaker diarization labels are not biometric identity proof.
- Intent extraction must cite transcript revision and source interval; redaction/revision triggers downstream invalidation under Annex Z. Detect and quarantine outputs that attempt to request secrets, disable safety controls or impersonate a higher-priority instruction. Do not pretend prompt-injection classification alone makes tool use safe: enforce permissions at tool execution.
- **Acceptance:** adversarial Thai audio saying “ignore all prior instructions,” a podcast quoting a bank-transfer command, a forged speaker label, a revised number in a financial meeting, and a low-confidence interim voice command. No unauthorized tool invocation, privilege change, secret disclosure or cross-project retrieval is permitted.

### Annex AI — Realtime bounded sessions, handover and settlement [R35]

- Reuse Spec 237/Feature 196 session authority. Attach `session_epoch`, provider transport generation, stream sequence, accepted/final input watermark, response/output audio watermark, `user_stop_at`, and `budget_exhausted_at`. On reconnect or provider switch, retire the old generation; late events may update audit/charge reconciliation but must never be replayed to active conversation or invoke tools. Support a declared session idle timeout, hard duration and spend cap independent of provider defaults.
- Client-side mobile buffering is bounded by encrypted ephemeral size/time limits, current consent and project identity. Resume only chunks after the server's acknowledged watermark if retention and local policy permit. Otherwise drop buffers with visible transcription gaps. When interim transcript differs from final transcript, invalidate proposed intents and require final-to-tool reauthorization. Distinguish acoustic turn end from human approval.
- Measure and cap **each** chargeable meter (`upstream_input_audio`, `upstream_output_audio`, `inference_tokens`, `connection_minutes`, extra TTS and retries); reserve maximum envelope at session admission and renew in bounded increments. On network partition, close admission for new downstream tool runs and stop billable upstream audio best-effort; reconcile accepted upstream charges separately from customer spend caps.
- **Acceptance:** disconnect during TTS output; stale `final` from old provider arrives after migration; user taps stop while input frame is queued; 10-minute provider session rotation; offline reconnect with revoked consent; upstream reports delayed cost. Show no duplicate assistant action, no hidden indefinite stream and accurate gaps and settlement.

### Annex AJ — Typed metering, price provenance and budget governance [R36]

- Extend the *existing* financial ledger adapter, not create a second wallet: record native meter unit, quantity, billable rounding quantum, provider currency, `rate_card_id/effective_at`, discount/commitment scope, tax policy, `fx_quote_id/expiry`, estimated versus settled status, upload/transcoding/translation sub-cost and idempotent logical-request identity. Prices from documentation are **examples**, never authoritative user charges. Do not assume all providers charge per audio minute or that one ASR call equals one billable unit.
- Admission calculates a worst-reasonable-case estimate across all mandatory passes and authorized fallback attempts, including chunk overlap and maximum stream duration. Reservations must be atomically associated with `worker_jobs` or the existing session authority; reject/ask for consent when a cost change exceeds the user cap. On uncertain upstream acceptance, hold the reservation in `pending_reconciliation`, do not double-debit customers and do not erase genuine provider liabilities.
- Currency conversion has explicit rounding and approved quote lifetime; financial reconciliation uses immutable provider receipt IDs when returned or a documented substitute correlation key. Track provider-side spend exposure and customer ledger independently without deriving one from the other as unquestionable truth.
- **Acceptance:** time-based ASR, character-based TTS, tokenized audio and WebSocket minimum-billing fixtures; provider changes rates during job; two-pass Gemini request; 20% chunk overlap; currency quote expiry; delayed invoice contradicts estimate; multi-tenant simultaneous exhaustion. Verify per-logical-job cap and no duplicate customer charge under replay.

### Annex AK — Purpose-specific audio data permissions [R37]

- Replace the single broad processing Boolean in the **effective server-side policy** with a purpose-specific grant matrix (the v1.3 request field remains deprecated input, never conclusive authorization): `record_microphone`, `transmit_to_named_provider`, `store_raw_audio`, `store_transcript`, `ingest_project_memory`, `derive_embedding`, `translate`, `share_project`, `export_media`, `retain_for_quality_eval`, `permit_vendor_training` and `clone_voice`. Each grant binds tenant, project, requester/participant role, exact purpose, locale/jurisdiction where relevant, time window, policy revision and revocation epoch. Vendor training and voice cloning default denied and are not enabled by general transcription consent.
- Surface purpose changes before capture/dispatch; ensure data processing can proceed ephemerally when raw storage is denied but cloud transfer is approved and technically possible. Existing governance authority resolves legal basis, participant notice/consent requirements and any retention hold; this spec does not interpret law or introduce another policy store. Privacy-sensitive options must not be silently disabled simply to force a provider match.
- Downstream sharing, export, RAG indexing and QA-corpus inclusion require independent server-side checks at point of use, not only at upload. Backend jobs and connected applications must observe revocation/tombstones even when holding previously issued object references. Provider-side deletion status is reported honestly according to vendor capability and available receipts.
- **Acceptance:** recording allowed but RAG disallowed; ephemeral live conversation with no stored raw audio; user revokes export after transcript creation; a participant declines provider transfer; an admin changes tenant residency policy mid-queue; a user explicitly denies vendor training. No capability expands by inference from another grant.

### Annex AL — Thai model promotion, confidence and accessibility [R38]

- Maintain a blinded, consented, stratified Thai evaluation set independent from vendor-published demos and internal prompt/model tuning examples. Include Thai regional accents, age/voice diversity with consent, mixed Thai/English proper nouns, phone audio, noise, overlapping speech, silence and accessible-use speech conditions. Only collect demographic strata when lawful, voluntarily provided and strictly necessary; avoid storing identifying speaker embeddings in the generic benchmark store.
- Compare candidate and incumbent on the **same clips**, compute paired CER differences with confidence intervals or a documented bootstrap method and minimum sample-count/power assumptions. Report group-level dispersion and critical-word failures, not just one overall average. Evaluate technical terms, Thai numerals, negation, quantities, speaker attribution, code switches and timing for each product profile. No provider's natural-language confidence claim substitutes for measured calibration.
- Treat major ASR drift, change in FFmpeg preprocessing, new model alias and shifted vendor output schema as promotion-triggering changes. Promotion policy must declare non-inferiority tolerance, must-not-regress high-risk terms and a human adjudication process for borderline CI results; failed candidate remains off production Thai cohorts while independently certified locales can continue. Subtitle and voice UX receive native-speaker review and keyboard/screen-reader accessibility checks.
- **Acceptance:** introduce a 3% aggregate CER improvement paired with an unacceptable critical-word regression; compare high-noise subgroup drift; run deterministic corpus replay on Debian REST and Cloudflare AI Binding. Promotion refuses unsafe regressions even when a mean metric improves; preserve evaluator provenance and decision evidence.

### Annex AM — Upstream contract drift, synthetic probes and operational kills [R39]

- Operate a small, approved **non-sensitive** probe set for every active `(provider, model, endpoint, transport, language, region)` tuple. Validate auth, response schema, parameter matrix, documented output precision, rate-limit behavior and representative Thai smoke output, with probing cadence adapted to vendor instability and cost. Do not run production-restricted customer audio as a probe. Maintain offline fixtures as a separate deterministic suite so provider outage does not make CI flaky.
- If a provider changes response field names, defaults, alias targets, language availability, endpoint behavior, pricing, region or account entitlements, quarantine only affected tuples. Introduce signed review of changed manifests and explicit release promotion by an authorized owner. Admin console shows last successful probe, next due, failure class, affected tenant/cohort and safe alternate profiles.
- Separate kill switches for whole provider, particular model/endpoint/locale, provider file upload, external transfer, realtime media and transcript-driven tools. Kill switches must work without waiting for an application redeploy and must propagate to Debian and Cloudflare deployments through the **existing** configuration authority. Failed control-plane connectivity defaults to no new external transfers when consent/residency/entitlement cannot be proved, while permitting safe completion/reconciliation of accepted attempts.
- **Acceptance:** schema type changes mid-day; undocumented model alias rotates; vendor rate doubles; leaked key revoked; one endpoint denies `th` while another still passes; Cloudflare/Hyperdrive unavailable during kill-switch rollout. Assert deterministic conservative behavior, incident alert and reversible cohort rollback.

### Annex AN — Integration ownership, no duplicate authority and release proof [R40]

- **M0 implementation discovery is mandatory:** locate actual AI Gateway/provider Registry/LLM router, `worker_jobs` schema, R2 Library APIs, current FFmpeg executor, billing wallet, Spec 237 session gateway and existing tenant/project scope enforcement. Build a contract/owner inventory referencing repo file paths, API schema revisions and approved owner signoff. This review does **not** claim those details have been verified against the private implementation.
- Delivery boundaries: Spec 247 supplies provider adapters, speech normalization, evaluation manifests and UI extensions. Spec 231/shared router selects candidates; unified `worker_jobs` owns batch dispatch; Feature 196/Spec 237 own realtime state; existing wallet owns charge; Spec 245 owns cutover; Spec 242 supplies Cloudflare runtime hosting. Do not modify original Specs 1–213, nor active Spec 224. File impact in earlier specs is recorded in a separate improvement register and implemented only through an approved compatibility layer.
- Critical path: `(a)` verify registry/schema/ownership and provider account access, `(b)` land immutable audio ingress + Thai eval baseline + provider manifest, `(c)` integrate Cloudflare batch and OpenAI batch behind feature flags, `(d)` run billing/security and subtitle tests, `(e)` add Gemini/xAI independently as optional certified tuples, `(f)` activate realtime **only after** Spec 237 compatibility testing, `(g)` hybrid canary and Cloudflare cutover, `(h)` optional CrispASR only if a benchmarked business need remains. Every stage can be disabled without disabling unaffected providers.
- Release evidence bundle includes changed files and commit SHA, schema migration/backfill/rollback proof, linked owner approvals, CI provider mock fixtures, masked real-account probes, Thai holdout statistics, documented provider pricing, threat-model checklist, privacy and licensing acceptance, canary telemetry, rollback exercise and independently verified billing idempotency. No claim of `PRODUCTION_CERTIFIED` or zero-downtime success without observed evidence.
- **Acceptance:** simulate absence of the existing session gateway, incompatible `worker_jobs` schema, unsynced kill switch, disabled xAI account and failed Thai holdout. The plan blocks only the dependent feature, records owners/gaps and does not introduce temporary shadow authority as a convenience workaround.

**Version 1.4 review closure:** R31–R40 have explicit normative mitigations and test cases at design level; each operational acceptance remains `NOT_RUN` pending repository integration, real-account probes, corpus evaluation and deployment evidence. Before merge, the M0 owner must confirm the canonical Spec 247 number and reconcile all sample endpoint/schema names with the checked-out repository. Reference checks performed 2026-09-25: Cloudflare Turbo schema/pricing and limits (https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/ ; https://developers.cloudflare.com/workers-ai/platform/limits/); Gemini transcription compatibility and live limits (https://ai.google.dev/gemini-api/docs/transcribe ; https://ai.google.dev/gemini-api/docs/live-api/live-transcribe); xAI STT multipart and supported Thai language formatting (https://docs.x.ai/developers/model-capabilities/audio/speech-to-text). These references establish published claims only, not SmartAIHub account availability or Thai performance.

## 21. Fifth ten-pass independent design review / gap closure record (revision 1.5, R41–R50)

**Review method:** Re-read the full v1.4 contract and Annexes A–AN, compare each feature boundary with production failure scenarios, and check publicly documented provider behavior as of 2026-09-25. This is a *design-document review*, not evidence of a live deployment, checked-out private SmartSpecPro source, or provider-account entitlement. The additions below strengthen existing owners; no new job, identity, billing, consent, or live-session authority is introduced. The 10 passes represent 10 distinct risk reviews, not an automated claim of 10 full-system test runs.

| Pass | Gap / concrete failure mode | Remediation | Required independent verification |
|---|---|---|---|
| R41 | Additive DB changes may be safe on Debian but break older Cloudflare Worker versions or delayed queued messages during gradual rollouts. | Annex AO: expand/contract migration, versioned envelope and reversible readers with explicit cutover fence. | Old/new gateway × dispatcher × queued-message matrix; rollback with pre-upgrade in-flight work. |
| R42 | Tenant-supplied provider keys can be confused with platform keys during retries, rotation, fallback or audit export. | Annex AP: credential ownership, key-version pinning and non-leaking fallback. | Cross-tenant/BYOK rotation, revoked-key pending attempt and redacted log/export tests. |
| R43 | Stereo/multichannel, lossy transcoding and wrong sample-rate claims silently corrupt timestamps, speaker labels and attribution. | Annex AQ: immutable decoded-audio manifest and per-channel/source clock reconciliation. | 44.1/48 kHz, variable-rate video, stereo overlap and silent-channel golden fixtures. |
| R44 | A design that is safe on Debian may buffer a whole audio file or hold CPU-bound transforms inside a Cloudflare Worker and fail platform limits. | Annex AR: edge-only envelope and streaming hand-off to suitable executor. | Oversized media, 128 MB worker memory budget, remote timeouts and R2-first integration tests. |
| R45 | A timeout after provider acceptance plus a cancel/retry race may create simultaneous paid attempts despite logical-job idempotency. | Annex AS: strict unknown-acceptance barrier and provider cancellation semantics. | Inject response loss, late webhook, operator replay and provider-cancel unsupported paths. |
| R46 | Provider invoices, reserved credits, taxes and partial refunds may disagree long after customer-visible completion. | Annex AT: delayed settlement, immutable customer charge IDs and adjustment ledger rules. | Invoice after timeout, late refund, disputed usage and cross-period reconciliation tests. |
| R47 | Browser/mobile realtime can leak vendor credentials or place raw audio on an unapproved network path when transport changes. | Annex AU: ephemeral client grants, explicit media path and renegotiation policy. | Token expiry/replay, origin swap, ICE/reconnect and provider switch with revoked consent. |
| R48 | Transcript correction and speaker reassignment can leave stale summaries, captions, alerts or Vectorize chunks apparently current. | Annex AV: revision-scoped derived artifact contract with atomic current-pointer promotion. | Concurrent edits, failed embedding update and stale signed URL / stale UI checks. |
| R49 | Regional routing checks alone do not cover logs, object replicas, exports, backup restoration and provider diagnostic retention. | Annex AW: full data-location and retention graph under existing governance. | Cross-region log export, restored backup tombstone, account-region drift and deletion deadline tests. |
| R50 | During hybrid migration, an active live voice session cannot safely be assumed portable across provider transports or Cloudflare deployments. | Annex AX: new-session cutover with bounded old-session drain, gap disclosure and tool re-approval. | WebSocket partition during deployment, mobile refresh, forced region failover and active approval replay tests. |

### Annex AO — Backward-compatible schema and queued-work evolution [R41]

- Define separate version fields for public API envelope, normalized `SpeechRequest` and `SpeechResult`, provider adapter payload, event/outbox schema, and persisted attempt/usage rows. A change to one **does not implicitly bump or reinterpret** the others. Use explicit parsers and version-keyed fixtures; do not deserialize an unknown future event as the current shape.
- All relational changes follow **expand → mixed-version compatibility → data backfill with checkpoint → read cutover → contract**. Preserve readers for the longest possible accepted job, approved retention/replay window and documented rollback interval; deletion of old columns cannot precede drain evidence. For a conflict with the existing canonical migration system, block implementation until its owner approves the compatibility plan.
- Include a canonical migration manifest with `migration_id`, old/new schema fingerprints, backfill cursor, writer-version fence, rollback conditions and last-compatible deployed Worker/Debian build. Workers and Debian share the same PostgreSQL SoT; never use dual-write to two authoritative job stores as a compatibility shortcut.
- **Acceptance:** old Debian submits while new Workers read; new Workers submit while old dispatcher reads or rejects with a durable typed error; delayed event arrives after schema upgrade; rollback happens while an old job is still accepted upstream. Assert no dropped attempt, false `COMPLETED`, billing duplicate or automatic privilege expansion.

### Annex AP — Credential binding, tenant isolation and safe rotation [R42]

- Every attempt binds immutable `credential_principal` (`platform` or exact tenant BYOK grant), provider account/organization/project, allowed region, key-version reference and entitlement snapshot. Fetch secrets just-in-time through **existing** secret management; never serialize them into queues, R2 manifests, request provenance or user-visible traces. Provider account ID must not be guessed from a model name.
- Fallback may reuse only an explicitly authorized credential principal for the target provider. A platform-paid attempt must not silently switch to a tenant key or vice versa, even after a 429. Rotated/revoked keys mark queued attempts `REAUTHORIZE_REQUIRED` unless the existing credential authority explicitly permits a replacement under the original approved scope.
- Mask provider headers, temporary session tokens, URLs containing credentials, speaker references and customer transcript text in admin errors, observability, test fixtures and incident exports. Runtime outbound request signing and provider callbacks remain distinct trust directions.
- **Acceptance:** two tenants have BYOK for the same provider; one rotates during a pending request; platform key reaches quota; retry switches provider; an operator exports an incident bundle. Assert no cross-account bill, unapproved routing, secret-bearing artifact or hidden billing principal change.

### Annex AQ — Decoded audio/channel identity and timebase integrity [R43]

- At controlled ingest, record source hash, container/codec, source PTS range, sample-rate *as measured*, channel layout, sample count after validated decode, silence gaps, per-channel mapping and the exact version/hash of preprocessing commands. A client-provided sample rate is a hint, not a fact. Keep the original R2 asset immutable and distinct from normalized derived audio.
- Provider payload manifests pin downmix/resample decisions and loss of channel separation. Diarization across a mixed mono signal must not be labeled as reliable channel identity. If channel-isolated transcription is requested, retain separate channel source/timebase and merge in canonical absolute time with declared ties/overlap; channel tags and speaker IDs are distinct fields.
- Validate decoded duration, size, channel count and resource expansion *before* costly dispatch using bounded preflight; isolate untrusted FFmpeg inputs with existing executor restrictions. Report impossible or uncertain timing as `timing_unverified`, never as millisecond-accurate word offsets.
- **Acceptance:** 44.1 kHz media falsely tagged 48 kHz; mono interview; stereo interview with simultaneous speech; 29.97 fps variable-frame-rate video; 6-hour recording with drift; codec discontinuity after corrupted packet. Expected output includes gap/precision declarations and deterministically aligned subtitles where certifiable.

### Annex AR — Cloudflare execution and large-media placement [R44]

- Workers implement auth, provider selection, small request validation, signed R2 coordination and **bounded** lightweight media streaming. Never depend on buffering arbitrarily large multipart recordings, running multi-hour FFmpeg, converting videos in Worker memory, or keeping long jobs alive through request lifetime. Current Workers documentation lists 128 MB memory and plan-dependent body limits; treat the current published limits as a versioned configuration snapshot, not a universal constant.
- For large media, use an authorized direct-to-R2 upload and enqueue durable work via **existing worker_jobs/outbox**; preprocessing executes only on an existing bounded external runner or a specifically approved Cloudflare container after resource benchmarking. A Cloudflare Queue message contains metadata/pointers, not raw media. No second queue state machine or Cloudflare-only job authority.
- Separate Cloudflare Workers AI model-level audio payload constraints from general Worker ingress limits: meeting a 100 MB Worker body ceiling does not prove the model accepts the file or decoded duration. Chunking policies must check vendor-specific ceilings, encoding, overlap costs and regional execution availability.
- **Acceptance:** 2 GB original media is chunked through signed R2 multipart; repeated retries deliver duplicate Queue messages; one conversion exceeds memory limit; existing runner disconnects; canary Worker is rolled back during conversion. Observe bounded memory and single logical job ownership.

### Annex AS — Provider acceptance uncertainty and cancellation proof [R45]

- Persist a pre-send intent before *any* billable upstream request. Normalize provider state as `NOT_SENT`, `SENT_UNCONFIRMED`, `ACCEPTED`, `RUNNING`, `FINISHED`, `CANCEL_REQUESTED`, `CANCEL_CONFIRMED`, `CANCEL_UNSUPPORTED`, or `UNKNOWN_AFTER_TIMEOUT`, mapped onto—but never replacing—the canonical `worker_jobs` lifecycle. Transitions are per immutable attempt; `SENT_UNCONFIRMED` and `UNKNOWN_AFTER_TIMEOUT` block **automatic same-input re-submission** unless an upstream idempotency token, authoritative status lookup or owner-approved dedupe protocol proves it safe.
- Cancellation means no *new* work is dispatched locally and upstream cancellation is attempted only if the provider exposes it; it never promises that already processed audio is unprocessed or unbilled. A late webhook can reconcile cost without making a cancelled user request `COMPLETED`. Record when the provider offers no status or cancel endpoint and apply a bounded manual/operator reconciliation policy.
- All fallback paths respect the unknown-acceptance barrier, tenant budget reservation and data-transfer permission. For latency-sensitive live streams, treat a new stream as a **new billable session**, not a transparent replay of buffered content.
- **Acceptance:** upstream charges an attempt but drops its HTTP response; webhook arrives after cancel and after migration; no provider status endpoint exists; user taps retry three times. Assert no unapproved duplicate paid attempt, correct customer status and explicit unresolved-charge alert.

### Annex AT — Delayed settlement and customer wallet adjustments [R46]

- Keep separate fields for reserved customer credit, provisional supplier estimate, provider-reported usage, invoice-adjusted supplier cost, customer capture, credit release and any refund/adjustment. The shared billing service owns actual entries: this annex defines an integration contract only. A late provider invoice must not mutate a previously issued customer ledger row or silently debit more credit without a new authorized pricing policy.
- Define stable logical-job `customer_charge_id`, immutable upstream `attempt_charge_id` and linkage for successful alternatives/partial outputs. If an unknown acceptance later resolves as billable, owner policy determines whether SmartAIHub absorbs cost or presents an approved adjustment; never double-charge for a single authorized result merely because two providers returned it.
- Make subscription/free allocation, creator/tenant revenue split, round-up/minimum unit rules, FX quote timestamp and tax treatment **configurable through the existing wallet**. Show estimated vs settled costs separately in Admin UI and preserve signed correction receipts.
- **Acceptance:** provider invoice 30 days late, preliminary cost higher than final, partial provider refund, two successful fallback attempts, account FX rate change and subscription free-tier exhaustion. Verify ledger sums and deterministic dispute export without secret/audio leakage.

### Annex AU — Realtime client and media-route trust [R47]

- The existing session gateway issues short-lived, session/tenant/origin-scoped ephemeral credentials only where a provider supports browser-direct media. Long-lived OpenAI/Gemini/xAI/Cloudflare account keys never reach a browser, Mini App or untrusted Desktop plugin. For unsupported browser-direct auth, proxy through an authorized gateway with explicit bandwidth, concurrency and regional-egress budgets.
- Record a live transport manifest: client origin, actual media recipient(s), relay path, capture grant, provider/model, audio format and current session epoch. Distinguish `control-plane connected` from `provider media flowing`; connection establishment does not imply microphone consent or retained transcript. Any transport renegotiation or provider switch revalidates consent and revokes prior ephemeral credentials where supported.
- Use bounded replay/jitter buffers only after authorized capture. Never persist buffer segments to R2 when `store_raw_audio=false`; on interrupted connectivity, show missing-audio spans rather than fabricating reconstructed speech. Existing session authority must explicitly reapprove high-impact tools after reconnect.
- **Acceptance:** malicious Mini App steals a session token; browser origin changes; mobile network roams; provider disconnects while microphone remains on; consent revoked while a relay buffers audio. Verify token binding, immediate new-transfer stop and user-visible recording state.

### Annex AV — Revision-scoped transcript propagation [R48]

- Every downstream derivative (SRT/VTT export, translation, summary, meeting action, search index, embedding, shared link, draft social post) records `source_transcript_revision`, segment/speaker reference, producing workflow/job and ACL/retention snapshot. Editing text, timestamps or speaker labels creates a **new immutable revision** and emits a single logical invalidation event through the existing outbox.
- Prefer **build → verify → promote** for derived artifacts: keep the last explicitly labeled valid revision readable while new derivations rebuild, but mark affected outputs `STALE` immediately in UI and block stale artifacts from auto-executing tools or silently entering Project Memory. Atomic current pointers belong to existing Library/PostgreSQL authorities; Vectorize upsert/delete lag must be surfaced and reconciled before promoting retrieval visibility.
- If an external downstream action has already occurred (email posted, notification sent, public clip exported), do not claim edits unsend it. Record correction obligations and require user review for consequential resends. Existing privacy tombstones override all build/promotion operations.
- **Acceptance:** user corrects Thai negation and speaker name during a pending embedding refresh; shared captions are already published; second edit happens before first rebuild finishes. Verify latest approved revision wins and Project RAG never serves deleted or wrongly scoped text.

### Annex AW — End-to-end location, diagnostics and restore governance [R49]

- Extend the existing purpose/retention grant into a **data-flow graph** including source R2 region, signed transfer, intermediate conversion cache, vendor file store, provider diagnostic logs, transcript, speaker reference, embeddings, telemetry, support exports, backups and restore copies. Each edge declares location or `location_unknown`, handling vendor residency guarantees as documented limits, not assumptions based on endpoint hostname.
- Fail closed on `restricted` data where mandated location and vendor processing terms cannot be verified. The existing privacy/governance owner chooses lawful retention/hold and notification policies; an active hold must be visible and must not be misreported as completed deletion. Apply deletion tombstones on restored databases and replay queues before making restored material readable.
- Minimize log metadata and ensure metrics dimension cardinality cannot accidentally encode utterance text, phone numbers, file names or signed URLs. Diagnostic vendor upload is a **separate** provider permission where technically configurable; where not configurable and unacceptable, that provider is ineligible.
- **Acceptance:** incident log export to another region; backup taken before consent revocation then restored; provider account changes region; retention deadline intersects legal hold; support bundle generated during a live customer session. Verify no forbidden flow and accurate deletion/hold status.

### Annex AX — Active live-session migration and discontinuity handling [R50]

- Hybrid deployment shifts **new** speech sessions by tenant cohort while existing sessions stay pinned to their original authorized gateway/provider, session epoch and credential context until normal end or bounded drain. Do not attempt to transplant opaque provider conversation/media state across WebRTC/WebSocket protocols or assume provider billing/turn state survives handoff.
- On forced release, outage or regional failover: pause tool execution, stop/close old media flow if possible, emit a gap-boundary event, check capture consent and session entitlement again, then open a new provider session with a minimal **approved, redacted text-only** context summary when policy allows. Any uncertain last utterance or pending high-impact action requires fresh user confirmation. This is a deliberate discontinuity, not 'seamless recovery'.
- Drain deadline, concurrent session ceilings, transport cost exposure and end-user disclosure are set by the existing Spec 237 session owner and operations policy. Cutover readiness measures both batch job completion and **live-session drain counts**; zero active batch leases does not prove live traffic is safe to retire.
- **Acceptance:** Cloudflare Worker deployed mid-call; old Debian origin disappears; provider closes WebSocket during final utterance; phone switches networks while approval is pending; user turns off recording mid-migration. Confirm no duplicate tool action, unauthorized captured audio or false continuity claim.

**Version 1.5 design closure:** R41–R50 are addressed with normative requirements and test cases; all new operational suites remain `NOT_RUN` until actual source-contract reconciliation, provider-account probes, Thai evaluation and canary deployment. The v1.4 evidence requirements remain in force. Reference check as of 2026-09-25: [Cloudflare Turbo model schema](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/) publishes segment/VTT rather than guaranteed word timestamps; [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) publishes 128 MB memory and plan-dependent request bodies; [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text) separates diarization/file transcription from realtime; [OpenAI realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription) documents item-ID event matching and separate live models; [Gemini batch transcription](https://ai.google.dev/gemini-api/docs/transcribe) prohibits combining custom vocabulary with diarization or word timestamps; [Gemini live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe) documents 10-minute sessions without live word timestamps/diarization; [xAI voice reference](https://docs.x.ai/developers/rest-api-reference/inference/voice) differentiates REST and streaming transports. Provider documentation does not establish per-account access or certified Thai performance.


## 22. Sixth independent ten-pass design review / gap closure record (revision 1.6, R51–R60)

This review audits **remaining implementation ambiguities**, rather than repeating the safeguards in Annex A–AX. All changes below are normative, additive compatibility requirements. `DESIGN_CLOSED` denotes a specified mitigation and executable acceptance scenario; **none** of these tests has run against SmartSpecPro or real provider accounts. Precedence: this revision clarifies earlier sections; no text here supersedes ownership, consent, financial-ledger or deployment fencing requirements.

| Pass | Unresolved gap in v1.5 | Normative remediation | Design status / operational status |
|---|---|---|---|
| R51 | Thai Unicode offsets and subtitle cursor drift were not specified at grapheme-boundary precision. | Annex AY: reversible multi-coordinate text mapping, pinned normalization, no surrogate/grapheme splits. | DESIGN_CLOSED / NOT_RUN |
| R52 | Aggregate latency/error targets could obscure failures in Thai, mobile or individual-tenant cohorts. | Annex AZ: cohort SLO/error budgets and low-sample reporting rules. | DESIGN_CLOSED / NOT_RUN |
| R53 | Circuit-breaker behavior under intermittent recovery could oscillate or concentrate failover costs. | Annex BA: bounded breaker transitions, hysteresis, brownout and admission-safe recovery. | DESIGN_CLOSED / NOT_RUN |
| R54 | Test corpora and ad-hoc human review could leak sensitive recordings or contaminate hidden holdouts. | Annex BB: evaluation-governance and reviewer/annotation provenance. | DESIGN_CLOSED / NOT_RUN |
| R55 | Multi-device audio capture with different sample clocks could create overlaps and timestamp gaps. | Annex BC: capture-clock provenance, drift reconciliation and duplicate-span evidence. | DESIGN_CLOSED / NOT_RUN |
| R56 | Cross-product API evolution lacked a formally tested feature-negotiation and unknown-field contract. | Annex BD: client/server compatibility envelope and downgrade semantics. | DESIGN_CLOSED / NOT_RUN |
| R57 | Audio container/metadata attacks and codec-level decompression bombs needed enforceable ingress budgets. | Annex BE: safe media parsing and pre-inference decoded-resource checks. | DESIGN_CLOSED / NOT_RUN |
| R58 | Provider/region cost optimization could accidentally move an entire project between processors without a scope-aware policy decision. | Annex BF: purpose-scoped egress plan and transitive workflow policy enforcement. | DESIGN_CLOSED / NOT_RUN |
| R59 | Caption accessibility and Thai editorial quality lacked deterministic publication checks apart from ASR CER/timing. | Annex BG: subtitle readability, speaker cues and human-review triggers. | DESIGN_CLOSED / NOT_RUN |
| R60 | There was no single executable certification matrix mapping every gate to a fixture, accountable owner and reproducible deployment evidence. | Annex BH: machine-readable release matrix and negative-path execution gates. | DESIGN_CLOSED / NOT_RUN |

### Annex AY — Thai grapheme-safe text/time identity [R51]

- Canonical transcript storage SHALL retain immutable `raw_provider_text` where policy permits and a **distinct** approved display-text revision. Store `unicode_normalization_profile_id`, tokenizer build/hash, locale and per-segment transformation provenance; normalized text is NEVER treated as byte-for-byte identical to the audio transcript for forensic or correction purposes.
- A reversible alignment map SHALL relate original UTF-8 byte offsets, Unicode scalar offsets and user-visible extended grapheme-cluster positions for each revision; browser UTF-16 indices are an explicit derived coordinate, not the canonical API coordinate. Word/segment time spans attach to stable segment/word IDs, not raw string slice offsets. Thai combining marks, zero-width joiners, emoji, punctuation, digit substitutions and mixed Thai–English words must not split at an invalid grapheme boundary.
- Downstream SRT/VTT, search highlights, correction ranges and code-switch annotations MUST declare coordinate system + text revision; if exact mapping is impossible after editing, return `ALIGNMENT_STALE` and require re-alignment/review instead of guessing offsets. Existing R48 revision invalidation remains authoritative.
- **Acceptance:** golden strings for Thai vowel/tone marks, decomposed/composed equivalents, surrogate pairs, emoji sequences and right-to-left embedded names; edit a Thai negation mid-segment and round-trip text spans through JS UTF-16, backend UTF-8 and subtitle export. Assert no split clusters, no silent off-by-one offsets and no fabricated word timing.

### Annex AZ — Speech SLOs, cohort visibility and error budgets [R52]

- Define product-specific indicators: batch completion within a published window, end-to-end successful transcript delivery, live final-turn delay, first partial latency, dropped-audio duration, per-language certified quality, and billing/consent hard invariants. Report by provider/model revision, locale/codeswitch, network class and product workflow **only above a privacy-preserving minimum cohort size**. Low-sample cohorts show `INSUFFICIENT_SAMPLE`, not a misleading 100% success result.
- SLO/error-budget configuration SHALL be owned by existing operations governance; unknown provider failures, degraded-provider fallback and human review count as distinct outcomes. No averaged global uptime figure may override a failing certified Thai cohort or a privacy/billing hard gate. Measurement excludes no error solely because the upstream provider is responsible.
- Require an operational stop rule: freeze cohort expansion on exhausted budget, repeated Thai regression or unexplained partial-audio gaps; allow existing healthy cohorts to continue subject to incident severity. Dashboard links each SLO breach to trace-safe sample evidence and owner.
- **Acceptance:** inject a 2% failure confined to Thai mobile streams while English remains healthy; force a tiny dialect cohort and a provider outage during scheduled canary. Assert degraded Thai cohort cannot pass via global average and no disclosive low-count metrics appear.

### Annex BA — Provider brownout and recovery stability [R53]

- Integrate with the **existing** router/capacity service, not a second speech-specific authority: implement per `(provider, endpoint, region, task)` `CLOSED → OPEN → HALF_OPEN` transitions with bounded probe permits, distinct authentication/quota/outage/quality failures, exponential cooldown with jitter and recovery hysteresis. Model de-certification (quality/security) stays suspended until human/approved automated recertification; a transient 200 response cannot restore eligibility.
- Budget reservations and approved data egress MUST be reevaluated **before** each half-open probe or fallback. On systemic incident, degrade to eligible batch queue, manual review or explicit unavailable status rather than fan-out requests to every provider. Never probe with unrestricted customer audio; use authorized synthetic/sandbox samples where feasible.
- Mark supplier-cost exposure, 429 backoff and retry storms in a shared dashboard. Breaker state is an optimization; security, tenancy and consent checks run at dispatch even when cached eligibility says healthy.
- **Acceptance:** alternate provider 429/success responses, rotate credentials during half-open, exhaust fallback budget and force a multi-region outage. Verify no oscillatory traffic spike, unauthorized provider movement or lost job ownership.

### Annex BB — Protected Thai evaluation and annotation provenance [R54]

- An independent evaluation-owner-approved registry SHALL version corpus source license, participant permissions, capture purpose, allowed processor/region, speaker demographics **only where lawfully collected and necessary**, retention, deletion requests, partition hash, annotation policy and named-reviewer access. **Do not** forward actual sensitive speech from production to a vendor or annotation tool for evaluation merely because customer inference consent exists.
- Keep calibration/development, frozen blind holdout and post-deployment drift streams physically or cryptographically separated by dataset partition; partition by speaker/source/recording session before slicing chunks. Detect duplicate/near-duplicate audio across splits; remove revoked samples and invalidate affected prior benchmarks instead of continuing to advertise withdrawn evidence.
- Annotators SHALL use a pinned Thai transcription convention, inter-annotator adjudication for contested negation/names/code-switch, redacted review UI and scoped audit. Store gold-label revision and an uncertainty state for inaudible spans. LLM-assisted draft labels must be disclosed as such and independently human-checked for release-critical samples.
- **Acceptance:** insert duplicate long audio cut into train and holdout, revoke one consent, mark a critical Thai negation disputed and upload an unlicensed podcast. Assert blocked use, benchmark invalidation and repeatable independent scoring without public disclosure of recordings.

### Annex BC — Multi-device capture-clock and overlap integrity [R55]

- For live sessions spanning mobile handoff, browser tabs, microphone changes or relays, attach `capture_device_epoch`, source monotonic frame counter, capture sample rate, server receipt clock and optional confidence-bounded clock offset to each audio frame. **Wall-clock timestamps are display metadata, never the sole sequencing or alignment authority.** Existing Spec 237 remains session owner; it approves whether handoff creates a new capture epoch.
- Reconcile clock drift with bounded interpolation based on observed frame counts; no auto-stitch across an unmeasured gap or overlapping devices without a deterministic owner or explicit multi-channel mode. Mark `AUDIO_GAP`, `AUDIO_OVERLAP_UNRESOLVED` and `CLOCK_DRIFT_EXCEEDED` in the transcript provenance and show them to editors. Do not invent transcript words to hide continuity loss.
- Tool execution consumes only final, epoch-fenced utterances from authorized devices. Replays/late frames from an old epoch may aid audit where retention allows but cannot re-trigger speech-to-tool actions or duplicate billable user output.
- **Acceptance:** mobile-to-desktop switch, 250 ppm synthetic clock drift, browser duplicated microphone stream, reordered 2-second packet block and old-epoch late final transcript. Verify timebase diagnostics, visible gap flags and at-most-once logical action.

### Annex BD — Capability negotiation and SDK backward compatibility [R56]

- Version `GET /v1/speech/capabilities` and every operation with separate `api_major`, `api_minor`, feature identifiers and schema-hash provenance. During contract evolution, add optional fields first; existing clients must ignore **known-safe unknown response fields** but reject unknown security, billing or consent semantics. Do not assume unrecognized enum values can be silently mapped to a default provider or task.
- An SDK advertises supported timestamp units, text-index coordinates, event schema, audio frame formats and interruption semantics; the gateway returns a compatible negotiated manifest. If a required feature cannot be met, respond with typed `FEATURE_VERSION_UNSUPPORTED` or offer an explicit user-approved downgrade. An old app must never unknowingly display segment timestamps as word precision or publish captions missing review flags.
- Maintain concurrent CI matrices for current, previous supported and migration-era client versions, including older Desktop Worker and a reconnecting mobile Mini Chat. Sunset requires feature-use telemetry, a published compatibility window and a tested server-side rollback.
- **Acceptance:** old mobile SDK encounters a new speaker-label enum, new timestamp unit and server capability cache newer than client; downgrade denial and major-version mismatch must fail safely while ordinary optional metadata remains backward-compatible.

### Annex BE — Audio parser sandbox and decoded-resource ceilings [R57]

- Inspect **declared and probed actual media format** before decode. Route untrusted FFmpeg/demux/decode tasks to the existing isolated media executor with non-root execution, read-only base image, bounded CPU/memory/temp disk/runtime and no ambient provider credentials or outbound network. Strip or quarantine executable attachments, URL-like metadata and dangerous container side streams; allowlist protocols/codecs and avoid dereferencing untrusted external playlist URLs.
- Admission limits MUST account for **decoded** audio duration, sample count, channel count and peak temporary bytes, not just compressed file size or MIME type. Enforce an approved downmix/resample profile with clipping/loudness checks and manifest the transformation; avoid forwarding unsupported or corrupted audio to provider to discover limits at customer expense.
- Preserve a quarantined hash-only reference for rejected malware/zip-bomb-like samples when lawful and useful, not the entire payload by default. Record attack-specific reason codes without leaking raw metadata into logs.
- **Acceptance:** tiny compressed file claiming hundreds of hours decoded PCM, crafted playlist SSRF, hostile metadata, malformed WebM, extreme channel count and codec crash. Verify no gateway OOM, SSRF, secret exposure, unbounded spend or cross-job temp file reuse.

### Annex BF — Transitive processor and purpose-bound egress policy [R58]

- Before admitting any **multi-step** speech workflow, construct an explicit processor graph covering cloud ASR, fallback, optional translation/LLM summarization, TTS, provider-side intermediate uploads, R2 staging and downstream RAG. Each node/edge includes exact processor, purpose, region assurance, allowed retention and credential ownership. User approval of transcription with Cloudflare does **not** automatically authorize sending resulting transcript or audio to a different summarization or voice-generation provider.
- Revalidate the graph at each stage against current consent, classification, project/tenant policy and current provider capability; material changes to processor, region, purpose or raw-audio retention require a new authorized decision. If an alternative provider is ineligible, pause/defer the dependent stage with a typed reason; preserve already approved intermediate results according to retention policy.
- Derive the graph from existing workflow/routing/consent systems, not a parallel policy store. Surface per-stage processors and estimated cumulative cost to user/admin where applicable.
- **Acceptance:** approved Cloudflare ASR is followed by Gemini summarization then OpenAI TTS; user revokes external text processing between steps and provider fallback moves to an unapproved region. Assert deterministic stage-level stop, no forbidden transfer and no orphaned cost reservation.

### Annex BG — Thai caption publication and accessibility quality [R59]

- Subtitle publication has quality gates **separate** from transcription CER: configurable Thai grapheme/reading-speed and minimum/maximum display-duration constraints, caption overlap, multi-speaker attribution, punctuation and number/unit formatting, sound cues for accessibility and device-safe line wrapping. Thai may not be segmented at an invalid cluster or split a named entity in a misleading way just to meet line length.
- Separate auto-generated draft captions from human-approved publication; mark low-confidence/missing-audio or undiarized overlapping speech rather than inventing speaker IDs. Support manual adjustments that preserve alignment provenance and create a new immutable transcript/caption revision per Annex AV; publish only latest approved version in Mini Apps/Video Editor exports.
- Provide caption preview across representative phone portrait, browser and widescreen video settings, including font scaling and screen-reader labels for playback controls. Configurable editorial thresholds are **initial acceptance targets**, not universal claims about preferred Thai reading speed; require Thai reviewer calibration.
- **Acceptance:** long Thai compound phrase, mixed Thai/English product code, rapid speaker overlap, a 400 ms caption, missing noise cue and font enlargement. Verify accessible preview, explainable review block and synchronized SRT/VTT output.

### Annex BH — Executable certification evidence and dependency release gate [R60]

- The M0 owner SHALL convert R01–R60 requirements into a version-controlled **machine-readable traceability matrix** with unique requirement ID, owning existing subsystem, adapter/endpoint, data classification, mock fixture, real-account probe (where needed), Thai benchmark cohort, security/integration test, expected evidence location and `NOT_RUN | PASS | FAIL | BLOCKED | NOT_APPLICABLE_WITH_REASON`. Narrative `DESIGN_CLOSED` must never automatically become `PASS`.
- CI must run deterministic golden-contract tests and adversarial fixtures, including immutable request/response snapshots scrubbed of credentials and customer audio. Protected real-provider tests run in a restricted account with consented synthetic or licensed samples, explicit daily cost ceiling and provider/version pin; flaky probes cannot be waived by rerunning until green without an incident record.
- The release controller owned by **existing** orchestration/operations checks the matrix, cross-spec owner acknowledgements, Thai and mixed-language held-out eval, invoice/ledger invariants, R2/Vectorize deletion replay, Debian↔Cloudflare batch/live cutover rehearsal and kill-switch rollback evidence. `NOT_APPLICABLE` requires documented reason and independent approval for security/billing/privacy gates; hard gates can never be marked N/A for convenience.
- **Acceptance:** simulate missing Spec 237 live-session owner, upstream model-version drift after CI, expired consent, broken audio parser sandbox and a failed Thai holdout. No production promotion is permitted even if 59 other passes are design-closed; unaffected certified capabilities remain available when safe.

**Version 1.6 design closure:** R51–R60 are specified with independent negative-path acceptance criteria; all remain operationally `NOT_RUN`. This file and its backup can be checked for structural integrity, **not** for real account availability, runnable SmartAIHub code or Thai ASR accuracy. Documentation rechecked 2026-09-25: [Cloudflare Whisper Turbo schema](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/) lists segment/VTT output; [Gemini Transcribe reference](https://ai.google.dev/gemini-api/docs/transcribe) documents diarization/word timing, 30-minute enhanced-mode limits and vocabulary incompatibility; [OpenAI realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription) separates browser/WebRTC and server/WebSocket flows; [xAI TTS supported languages](https://docs.x.ai/developers/model-capabilities/audio/text-to-speech) does not currently list Thai in its published 20-language roster. These are published documentation facts only, not deployed account certification.

---

<!-- Retained in final architecture principle after revision 1.7. -->

---

## 23. Seventh independent ten-pass design review / gap closure record (revision 1.7, R61–R70)

This revision is **additive**. For overlapping requirements the existing core design and R01–R60 remain authoritative except where a newer, explicitly named provider-model/endpoint contract corrects an older assumption. A repeated topic is expanded only where it adds a separately testable invariant. `DESIGN_CLOSED` means this document specifies a mitigation; it does **not** certify deployed behavior.

| Round | New or residual gap found | Normative remediation | Acceptance status |
|---|---|---|---|
| R61 | The existing generic realtime/VAD interface may advertise server-side turn detection for a model that requires client-side commits, or infer event order from arrival order. | Annex BI: per-model turn-control and event-correlation contract for OpenAI `gpt-live-transcribe`, without changing Spec 237 ownership. | DESIGN_CLOSED / NOT_RUN |
| R62 | Silent/noisy audio and hallucinated text could pass basic schema validation and create false facts or unsafe voice commands. | Annex BJ: evidence-based speech/no-speech abstention and hallucination quarantine. | DESIGN_CLOSED / NOT_RUN |
| R63 | Thai/English code switching, domain hints and user vocabulary can leak project data or be applied as hard constraints despite provider-specific semantics. | Annex BK: language-hint and vocabulary governance with per-model compatibility tests. | DESIGN_CLOSED / NOT_RUN |
| R64 | Full-duplex assistant output can be recaptured by the microphone, causing feedback loops, barge-in errors or self-triggered tool actions. | Annex BL: echo-aware duplex media ownership and spoken-action safeguards. | DESIGN_CLOSED / NOT_RUN |
| R65 | Offline/mobile recordings may be retried after consent, project permissions, credentials or retention policy have changed. | Annex BM: encrypted offline audio staging and reauthorization on upload/replay. | DESIGN_CLOSED / NOT_RUN |
| R66 | Realtime browser codecs and backend/provider format requirements can diverge mid-session; implicit transcoding obscures resampling costs and timing. | Annex BN: negotiated media-format contract, conversion provenance and resource accounting. | DESIGN_CLOSED / NOT_RUN |
| R67 | Raw transcripts can contain personal data that becomes searchable or is passed to an unauthorized tool before the approved redacted revision is ready. | Annex BO: purpose-specific redaction gate and non-indexable draft state. | DESIGN_CLOSED / NOT_RUN |
| R68 | TTS/provider output can mispronounce critical Thai terms or accept unsafe markup/voice configuration; a generic language badge is inadequate. | Annex BP: tested Thai pronunciation profiles, sanitized text/markup and approved voice identity. | DESIGN_CLOSED / NOT_RUN |
| R69 | Consumers of partial/final/revised transcript events may apply stale events to UI, RAG or alerts or confuse UI acknowledgement with durable commit. | Annex BQ: revision-aware speech event envelope and consumer contract under existing event/outbox authority. | DESIGN_CLOSED / NOT_RUN |
| R70 | Sixty annexes create implementation ambiguity, contradictory defaults and an incentive to mark review-count completion as production readiness. | Annex BR: canonical requirement index, contradiction lint, release slices and evidence-based stop rule. | DESIGN_CLOSED / NOT_RUN |

### Annex BI — Exact realtime transcription turn semantics [R61]

- Capability entries MUST be pinned to `(provider, model, endpoint, api_version, deployment_region, transport)`; `transcribe.stream` is not sufficient to assert `server_vad`, `semantic_vad`, client VAD, speaker labels, partial results or resumability. Explicitly enumerate `turn_control: server | client | provider_specific`, supported commit signal, audio format and event correlation identifiers. A model-specific capability probe overrides inherited family defaults; unknown turn-control behavior is not eligible for production routing.
- The published OpenAI `gpt-live-transcribe` workflow uses `type: transcription` with browser WebRTC or server WebSocket, `turn_detection: null`, client-managed `input_audio_buffer.commit`, and `item_id` to correlate final/completion events that may arrive out of order. The adapter MUST NOT send unsupported `server_vad`/`semantic_vad` with that model or order committed turns solely by final-event arrival. OpenAI's other transcription models MAY have different semantics and must have separate manifests. Reference (checked 2026-09-25): https://developers.openai.com/api/docs/guides/realtime-transcription
- Link `capture_epoch`, client audio-turn ID, provider item ID, final watermark, transcript revision and Spec 237 authoritative session ID. An uncommitted partial has no permission to trigger tools or billing finalization; a duplicate or late provider completion cannot change an already-authorized later turn without explicit reconciliation. Client-side VAD thresholds must remain configurable and certified by language/network cohort, not shared as a universal vendor default.
- **Acceptance:** reject an attempted `server_vad` setup for pinned `gpt-live-transcribe`; commit two turns, deliver second completion before first, duplicate a final event, reconnect between append and commit and rotate session epoch. Assert correlated order, no auto action from partials, no duplicate finalized transcript and no double charge.

### Annex BJ — Speech absence and hallucination controls [R62]

- The preprocessing contract SHALL retain VAD intervals, signal-level silence/noise diagnostics, duration/sample evidence and the reason a segment was rejected, transcribed or marked `UNCERTAIN`. A model's text output without sufficient audio evidence is **not** proof that speech occurred; preserve genuinely non-speech audio captions only via an explicitly certified `audio.understand` operation, never masquerading as verbatim speech.
- Cloudflare `@cf/openai/whisper-large-v3-turbo` documents `vad_filter`, `no_speech_threshold`, `compression_ratio_threshold`, `log_prob_threshold`, `hallucination_silence_threshold` and `condition_on_previous_text`. Treat their exact availability and calibration as model-versioned options, not guaranteed across Whisper variants or other providers. Reference (checked 2026-09-25): https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/
- Define distinct `NO_SPEECH`, `LOW_EVIDENCE`, `HALLUCINATION_SUSPECTED`, `AUDIO_CORRUPT` and `TRANSCRIPTION_UNCERTAIN` normalized results. Uncertain audio cannot become a verified project fact or a tool instruction automatically. Do not silently delete meaningful low-volume Thai speech; expose manual review and a consent/budget-safe alternate provider path. Measure both false text on silence **and** missed real speech across quiet/dialect/noisy cohorts.
- **Acceptance:** inject digital silence, room tone, background music, reversed speech, severe packet loss, faint Thai negation and concatenated silence/speech. Verify calibrated abstention, provenance, review routing and no invented transcript entering RAG or initiating a payment/tool action.

### Annex BK — Mixed-language hints and private vocabulary [R63]

- The canonical request MAY carry `expected_languages[]` (BCP-47), `code_switching_expected`, optional approved `vocabulary_reference` and `language_detection_policy`. A language hint is a **bias**, not a postcondition that forces every segment into that language; segment-level detected-language annotations retain uncertainty and revision identity. Keep distinct manifest properties for `auto_language`, `language_hint_single`, `language_hint_multi`, `keywords`, `prompt_context` and provider vocabulary restrictions.
- Inspect project vocabulary for sensitive terms, credential-like strings, personal names and tenant classification before transfer. A private glossary must not be recycled as a global few-shot prompt, logged in plaintext, sent to another provider during fallback or included in generic probe traffic. Time-bound project glossary versions and require purpose/provider authorization at dispatch. The adapter shall reject invalid length/characters and incompatible simultaneous options **before** a paid upstream call. Gemini's published transcribe documentation states automatic code switching when language codes are omitted, and that custom vocabulary cannot be combined with diarization or word-level timestamps; model version pins apply (https://ai.google.dev/gemini-api/docs/transcribe, checked 2026-09-25).
- **Acceptance:** Thai speech alternates with English technical terms and regional proper nouns; test zero hints, two expected languages, a revoked project glossary, a malicious pseudo-instruction in glossary, incompatible Gemini options and a provider switch. Assert correct privacy boundary, typed rejection where incompatible and no false translation of verbatim content.

### Annex BL — Full-duplex echo, barge-in and assistant-output containment [R64]

- Spec 237 remains sole owner of microphone permissions, output playback identity and interruption state. For every live session, assign microphone capture and assistant playback separate media stream IDs and epochs; record whether browser/OS echo cancellation, acoustic echo suppression or hardware duplex is available and tested. Audio generated by the assistant is untrusted **input** if re-captured, not a new authenticated human command.
- Maintain an output-playback timeline and short-lived echo-correlation window. A barge-in may cancel or duck pending TTS, but an interrupted unconfirmed transcript is not authorized for irreversible tools; only a fresh, final, user-authorized turn can resume the action. When echo-cancellation quality degrades, degrade visibly to push-to-talk or half-duplex rather than increasing VAD sensitivity until the assistant responds to itself. Do not mistake speaker diarization or voice similarity for user authentication.
- **Acceptance:** play the agent's own Thai instruction through speakers during open-mic capture, introduce 200–600 ms audio delay, inject a real Thai user interruption over TTS and disconnect during a partial spoken approval. Assert no self-triggered tool action, no lost authorized barge-in and safe half-duplex fallback.

### Annex BM — Offline and intermittent mobile capture [R65]

- Offline recording is a separate **client-side staging** feature flag, not authorization to perform offline inference or indefinite background recording. Use OS-keystore-backed local encryption where available, per-recording immutable content hashes, quota/expiry, visible recording/upload controls and explicit user deletion. Never store provider API keys with queued audio, and never assume a browser service worker can execute reliable long-running audio processing.
- Each queued upload carries a non-secret capture ID, tenant/project target, capture-time consent receipt reference, local policy version and current desired operation. **At reconnection** require current account authentication, authorization, project existence, consent and retention re-check; expired/revoked items remain local for authorized user decision or are deleted under policy rather than uploaded. Server admission deduplicates by authorized capture ID **and** content digest without exposing cross-tenant existence. The original capture timestamp is provenance, not license to bypass a changed policy.
- **Acceptance:** record offline, revoke project membership, rotate key, exceed mobile quota, delete locally, reconnect twice with same upload, lose network after the server accepted half the bytes and change destination tenant before replay. Verify zero unauthorized transfer, recoverable resumable upload and one authorized logical job only.

### Annex BN — End-to-end codec, format and transformation negotiation [R66]

- Use a typed media capability manifest by **client capture → ingress → decode executor → provider endpoint**, including actual codec/container, channels, sample format/bit depth, sample rate, frame duration, maximum packet bytes, accepted streaming transport and supported transformations. Distinguish the format accepted by the browser from the format accepted by the **specific** provider/model; a bare `audio/*` compatibility claim is invalid. Track negotiation and mid-session renegotiation in the Spec 237 session epoch.
- For every resample/downmix/encode change, version the transformation profile and record input/output frame counts, channel mapping, codec delay/padding, quality flags, bounded CPU/temp costs and absolute media timebase. Place CPU-intensive FFmpeg in the existing isolated media executor, not in a long-running Cloudflare request. If the accepted format changes after reconnect and round-trip latency exceeds budget, pause/ask or fall back to certified half-duplex rather than silently dropping frames.
- **Acceptance:** Chrome/WebM-Opus vs alternate browser capture, 44.1/48 kHz stereo to 24 kHz mono, vendor rejecting a container with valid codec, a mid-call input-device switch and packet-size overshoot. Assert exact manifest, bounded executor work, no timestamp drift beyond the calibrated threshold and clear unsupported-format errors before billing.

### Annex BO — Redaction-before-distribution and searchable-text control [R67]

- Differentiate `raw_provider_text` (restricted evidence), `review_draft`, `redacted_approved` and `publishable_revision`. Tenant/project policy determines whether raw text may be persisted at all and who may view it. **No** default RAG ingestion, shared alert, searchable global log or third-party summarization from a restricted draft. Existing R48/Annex AV revision and R58/Annex BF transitive purpose policy remain owners; this annex adds a hard distribution gate, not a second DLP authority.
- Run approved PII/secret/entity detection before indexing/export; permit scoped human review for ambiguous Thai names, addresses and voice-identifying context. Preserve restricted audit linkage and a non-reversible public-redaction representation where necessary. If a later redaction rule or deletion request changes the approved text, invalidate downstream Vectorize chunks, cached summaries, caption exports and signed distribution links through existing lineage/outbox mechanisms; prevent stale search results during reindex. Security tooling may not write original secrets into metric tags, trace baggage or exception payloads.
- **Acceptance:** raw transcript includes Thai phone number, patient-like personal detail, password spoken aloud and an instruction to add private data to project RAG; simulate late redaction, Vectorize outage and a stale cached Mini App result. Verify unauthorized consumers never see the raw draft and revised/deleted content is not retrieved after the invalidation fence.

### Annex BP — Thai TTS correctness, markup and voice identity [R68]

- TTS capability certification SHALL be `(provider, model, voice_id, locale, output_format, style)` specific. Do not infer Thai TTS from Thai ASR; maintain a Thai pronunciation evaluation set containing personal names (licensed synthetic examples), numerals, currencies, measurement units, English brand/code names, abbreviations, dialect-sensitive wording and negative/affirmative pairs. Store a versioned, purpose-scoped pronunciation glossary only when provider options support it; require a speaker-review workflow for high-impact narration.
- Sanitize or reject SSML/markup, URLs, phoneme hints and user-provided pronunciation overrides according to each provider's documented accepted grammar; unsupported markup MUST NOT be rendered as spoken raw directives or forwarded as privileged system instructions. Enforce consent/usage license for any personalized or cloned voice, provider voice-ID allowlist, synthetic voice attribution when applicable and revocation/asset deletion through existing data-governance ownership.
- For streaming TTS, record output chunk ID, text revision, codec/voice revision and playback acknowledgement separately from upstream synthesis completion; interruption or refund policy follows actual provider usage receipts, not the amount of speech the listener heard.
- **Acceptance:** Thai amounts and negations, mixed English product IDs, malicious SSML/phoneme prompt, a revoked voice license, wrong-language output, barge-in after first chunk and a provider that does not expose word timing. Verify unsafe configurations are blocked, critical mispronunciations route to review and no unsupported precision is advertised.

### Annex BQ — Consumer-safe canonical speech events [R69]

- Publish normalized speech events via the **existing** outbox/event delivery system with `(tenant_id, job_or_session_id, capture_epoch, transcript_revision, event_id, causation_id, provider_attempt_id, schema_version)` and typed variants `partial_observed`, `turn_committed`, `finalized`, `correction_approved`, `redaction_applied`, `derived_invalidated`, `playback_started/ended` where relevant. Partial events are explicitly ephemeral and may be dropped/coalesced; durable consumer offsets and replay apply only to eligible persisted event types. Realtime ordering uses per-turn sequence/watermark, not global wall-clock sort.
- Every subscriber (caption renderer, RAG ingester, alert extractor, tool controller, billing adapter) advertises accepted event versions and idempotently applies only events eligible for its purpose. UI acknowledgement is not durable outbox commit. Stale or pre-redaction events cannot re-promote an old revision after the current-pointer changes; use a version/fence compare in the existing source-of-truth transaction. Sensitive payloads appear as authorized scoped references, not copied to every bus topic.
- **Acceptance:** reorder two finals, duplicate a correction, drop all partials, replay a pre-redaction final after deletion, deploy an old Mini App subscriber and crash after UI acknowledgement but before outbox delivery. Verify eventual consistency where permitted, no resurrected text, no duplicate tool actions or billing and accurate client state.

### Annex BR — Normative consolidation, implementation slices and review stop rule [R70]

- Before implementation M0 sign-off, derive one **canonical normative requirement index** for R01–R70: unique immutable ID, latest authoritative clause, older cross-reference/supersession edge, parent contract, accountable owner, product/use-case impact, priority, feature flag, negative tests and evidence status. Resolve contradictory values or semantics through an explicit decision record; two inconsistent annex statements may never both be marked accepted. Existing schemas, Spec 231 router, Spec 237 session gateway, `worker_jobs` and Spec 245 cutover ownership override illustrative names in this file until verified against the repo. This annex does not establish an additional control plane.
- Deliver independently releasable slices: **M0** repo contract inventory and contradiction lint; **M1** Debian-hosted gateway with Cloudflare batch ASR + real-account Thai holdout, consent/billing/R2 integration; **M2** OpenAI/Gemini/xAI optional certified batch adapters and subtitle/RAG consumer contracts; **M3** certified realtime/session integration and Thai TTS where demonstrated; **M4** hybrid Cloudflare deployment canary, rollback and security/billing reconciliation; **M5** optional CrispASR only upon demonstrated value. Gate each slice on the minimal relevant requirements, with common security/privacy/billing invariants always mandatory. Feature failures block their slice, not unrelated certified product capabilities.
- A review **count** is never a release metric. After R70, prioritize implementation evidence, unresolved owner decisions, cross-spec integration tests and quality measurements over serial speculative annex additions. Additional review is warranted for a newly verified API change, discovered implementation incompatibility, incident or uncovered hard invariant; record its trigger and outcome in the requirement index. All R01–R70 operational checks remain `NOT_RUN` unless independently linked to actual runtime evidence.
- **Acceptance:** generate the requirement index from current text; reject duplicated IDs, missing owner, conflicting capability declaration, uncited hard provider limit, unsupported old-client behavior or an untested hard gate. Block promotion with an expired Thai holdout or a failed security invariant, even when all 70 document review entries are marked `DESIGN_CLOSED`.

**Version 1.7 design closure:** R61–R70 specify ten new independently testable gap mitigations, pending repository-owner validation and runtime evidence. Published API details checked 2026-09-25: Cloudflare Whisper Turbo model schema, OpenAI realtime transcription guide and Gemini transcription documentation (linked in Annexes BI–BK). No claim is made that the provider accounts, present SmartSpecPro contracts or Thai production accuracy have been validated.



## 24. Eighth ten-pass consolidation and implementation audit (revision 1.8, R71–R80)

This pass compares the **v1.7 actual clauses** against the operational release path rather than introducing another autonomous subsystem. Every row records an independently testable change; all execution tests remain `NOT_RUN` until linked to real artifacts. A design pass is not a runtime certification.

| Pass | Examined gap / observed contradiction | Resolution and testable gate | Evidence status |
|---|---|---|---|
| R71 | Annex BR requires a canonical R01–R70 index but the document did not ship a machine-readable index. | Ship the companion `Spec_247_Requirement_Traceability_v1.8.csv` covering R01–R80; deduplicate requirement meaning at M0 and link actual file paths, tests and owner approvals before code merge. | DESIGN_CLOSED / RUNTIME_NOT_RUN |
| R72 | Core M1 required an OpenAI adapter while Annex BR deferred OpenAI until M2. Core DoD also ambiguously blocked isolated Cloudflare launch. | Align M1 on certified Cloudflare batch only and M3 on independently gated OpenAI/Gemini/xAI; separate M1 limited release from full multi-provider release. CI tests shall reject an M1 gate that secretly requires xAI/realtime. | DESIGN_CLOSED / RUNTIME_NOT_RUN |
| R73 | `documented/probe_passed/eval_passed/certified` lacked explicit **account-entitlement and verified model-version** activation edges. | Gate admission on the conjunction of `documented + account_probe_current + locale_holdout_pass + privacy/region_policy + pinned_endpoint_schema + operator_approval`. Expiry, revocation or model alias drift immediately demotes the affected tuple; production dry run tests stale accounts. | DESIGN_CLOSED / RUNTIME_NOT_RUN |
| R74 | `max_billable_usd` alone cannot prove a bounded charge when providers return late/partial receipts. | Existing wallet reserves per logical job; individual attempts receive a monotonic bounded budget and immutable price-snapshot ID. Maintain `upstream_cost_observed`, `upstream_cost_estimated`, `customer_charge_settled` separately; ambiguous acceptance cannot debit twice or trigger unapproved alternate-provider charges. Simulate all timeout/receipt orderings. | DESIGN_CLOSED / RUNTIME_NOT_RUN |
| R75 | Project membership and a saved consent flag can become stale between intake, queueing, dispatch and retries. | At every egress attempt require fresh server-side tenant/project ACL, purpose-specific consent version, regional processor allowlist, object revision and revocation epoch; do not cache authorization as a transferable bearer token. Revocation blocks **future** sends while already accepted provider attempts enter documented deletion/reconciliation, not an imaginary recall. | DESIGN_CLOSED / RUNTIME_NOT_RUN |
| R76 | Existing transcript revision, deletion and Vectorize controls were distributed across Annexes AV, BO and BQ without an explicit terminal-state race gate. | Source-of-truth transaction writes an irreversible deletion/restriction tombstone with highest revision fence before outbox reindex/deletion. Late provider callbacks, old replay events and delayed cache writes cannot resurrect restricted text. Test retries during Vectorize outage and tenant deletion. | DESIGN_CLOSED / RUNTIME_NOT_RUN |
| R77 | Realtime normalization could treat vendor interim/final messages as interchangeable and falsely imply resumable provider sessions. | Maintain a transport-specific event adapter with `provider_event_id`, `capture_epoch`, `turn_id`, finality semantics, ordered offset and explicit `lost_audio_span`. A live provider switch creates a new session/epoch and visible gap, never claims lossless recovery without observed replay; Spec 237 owns all session actions. | DESIGN_CLOSED / RUNTIME_NOT_RUN |
| R78 | Cloudflare migration canary described percentages but lacked a hard **no double billable shadow** invariant and independent rollback proof. | Shadow mode may compare policy, schema, estimated cost and mock/sanitized offline results; it MUST NOT send the same customer audio to another paid provider without separate budget+purpose approval. Cohort ownership is pinned per logical job; rollback routes only new jobs, drains accepted attempts, and reconciles unknown charges before closure. | DESIGN_CLOSED / RUNTIME_NOT_RUN |
| R79 | Quality gates stated aggregate Thai CER and segment timing but did not specify how model changes or holdout peeking invalidate certification. | Pin provider+model+endpoint+audio preprocessing+language hint+corpus version+annotation rubric; split development and sequestered holdout by speaker/source, re-certify after changes, publish confidence intervals and cohort regressions. Do not auto-promote a lower price if a critical jargon/dialect cohort fails. | DESIGN_CLOSED / RUNTIME_NOT_RUN |
| R80 | UI and marketing could say “Thai supported”, “word-accurate”, or “seamless failover” even when only documentation or segment timestamps exist. | Expose language+feature certification **per endpoint and deployment region**, measured evidence window and `UNVERIFIED`/`DEGRADED` states. No word accuracy, speaker identity, Thai TTS or zero-loss live handover claims without matching tests; client contracts must degrade unsupported controls predictably. | DESIGN_CLOSED / RUNTIME_NOT_RUN |

### 24.1 Canonical implementation precedence and acceptance

1. **Authoritative order:** verified repository contracts and approved owner decisions govern integration; this spec's main clauses govern v1.8 scope and release stages; Annexes supply extra constraints. Any contradiction enters an ADR and blocks only the dependent slice until resolved. Annex BR's review-stop rule remains effective: additional passes without a new trigger must prioritize evidence over new features.
2. **M0 deliverables:** checked-out repository inventory for Spec 231 router, Spec 237 session gateway, `worker_jobs`, credentials, R2 and wallet; current versioned OpenAPI or equivalent; owner-signed requirement/impact ledger; a policy-safe, redacted provider account probe report; fresh official API/schema snapshots. The attached CSV is a **review ledger** only, not evidence that these tasks occurred.
3. **M1 limited cloud batch launch:** requires Cloudflare production account/region entitlement, approved Thai benchmark, authorized private asset ingress, billed and unbilled retry proof, cancellation semantics, tenant-isolation tests, cost ceiling, observability, and a documented no-fallback degraded mode. It explicitly does not require all four providers.
4. **Full multi-provider launch:** requires at least one independently certified alternative cloud batch ASR adapter and cross-provider egress/budget rules. Gemini, xAI, TTS, diarization and realtime are released independently by feature/locale tuple only when certified; unknown features remain disabled.
5. **Migration evidence:** preserve PostgreSQL/`worker_jobs` as the SoT and Vectorize as the current vector index; attach shadow-no-billable-proof, measured canary, lease fencing, provider-attempt reconciliation, rollback rehearsal, R2 authorization and cutover owner signoff before retiring Debian.
6. **External documentation snapshot (2026-09-25):** Cloudflare Whisper Turbo publishes segment/VTT outputs and no native word-level guarantee; Gemini batch documentation allows diarization with word timestamp but prohibits combining either with custom vocabulary, with a shorter maximum duration when timestamps/diarization are enabled. These are published API rules, NOT measured SmartAIHub account availability, Thai quality, or pricing guarantees. Refresh manifests before coding and each promotion. References: https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/ and https://ai.google.dev/gemini-api/docs/transcribe .

### 24.2 Review exit status

- R71–R80: `DESIGN_CLOSED`; implementation and all actual provider/Thai/security/billing/migration conformance tests: `NOT_RUN` unless linked to separate measured evidence.
- The canonical R01–R80 companion ledger is a navigation aid and must be reconciled with actual repository owners and tests at M0. Do not treat the existence of 80 review rows as proof of production readiness.
- Open blockers: live repository contract/number verification, provider account and model entitlement, real Thai holdout, budget/consent transaction implementation, measured canary and rollback exercise.

---

**Final architecture principle (unchanged):** SmartAIHub owns *who may process which audio, under which budget and retention policy, and where the result belongs*. Providers own inference only. Debian and Cloudflare are deployment locations of the same contract, not separate products.
