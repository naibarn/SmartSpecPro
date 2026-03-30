# Social Video Platform Expansion Implementation Plan

## 1. Delivery Goal

Ship TikTok and YouTube support as background-first providers that integrate into the existing social provider registry and agency/workflow bridge.

The implementation should preserve the current Meta behavior and extend it with provider-specific capability rules for TikTok and YouTube.

## 2. High-Level Workstreams

### 2.1 Provider Registry Expansion

Add provider descriptors and runtime adapters for:

1. TikTok
2. YouTube

These must register into the existing social background facade so callers can discover capabilities and execute actions through one surface.

### 2.2 TikTok Adapter

Implement TikTok background support for:

1. creator info preflight
2. direct post
3. draft upload
4. status polling
5. cancellation of pending operations where supported

The adapter must enforce:

- allowed media formats
- size / duration / dimension restrictions
- verified-domain or URL-prefix rules for URL transfer
- private-only fallback when audit state requires it

### 2.3 YouTube Adapter

Implement YouTube background support for:

1. video upload
2. publish now
3. schedule via `publishAt`
4. status sync

This path should use the existing YouTube upload semantics rather than inventing a separate content model.

### 2.4 Shorts Classification

Shorts must be derived from the normal YouTube upload flow using:

- square or vertical aspect ratio
- duration <= 3 minutes

The plan should persist a Shorts classification flag so jobs, logs, and UI can render the asset correctly.

### 2.5 Workflow / Agency Integration

Extend the background tool dispatch so:

1. `builtin-social-actions` can target `meta`, `tiktok`, or `youtube`
2. tenantId is injected server-side
3. unsupported actions are blocked before execution
4. background workers can process publish and status jobs without the UI

## 3. Suggested Implementation Phases

### Phase 1: Contracts and Catalogs

1. expand provider catalog and capability metadata
2. define canonical actions for social video work
3. add provider-specific capability checks
4. add tests for discovery and unsupported action handling

### Phase 2: TikTok Implementation

1. add TikTok OAuth / connection metadata handling
2. implement creator-info preflight
3. implement direct post and draft upload
4. implement polling and cancellation hooks
5. add media validation and URL-ownership checks

### Phase 3: YouTube Implementation

1. add YouTube OAuth / connection metadata handling
2. implement `videos.insert`
3. implement scheduling with `publishAt`
4. implement status reconciliation
5. expose Shorts classification in job metadata

### Phase 4: Background Orchestration

1. add queued job models / status transitions
2. wire worker retries and failure states
3. wire cancellation and reconciliation
4. keep provider errors normalized

### Phase 5: Verification

1. add unit tests for provider contracts
2. add tests for TikTok restrictions
3. add tests for YouTube scheduling / Shorts classification
4. add tests for agency/swarm dispatch

