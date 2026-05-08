# Section 05: Gateway Routing And Sync Flow

## Goal

Wire Magnific into the Python gateway so media requests route to Magnific by provider/model metadata and Remove Background can complete synchronously.

## Files In Scope

- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/llm_proxy/providers/__init__.py`
- `python-backend/tests/unit/llm_proxy/test_gateway_unified_magnific.py`
- existing gateway tests for non-regression

## Implementation Requirements

### 0. Persistence audit

Before adding Magnific submit paths, inspect the existing media task/result persistence model and document the outcome in the implementation notes.

The audit must verify whether existing JSON/result fields can persist:

- provider id and provider model id
- provider task id
- submit endpoint and status endpoint
- dispatch mode
- reserved credits and pricing snapshot
- normalized pricing inputs
- sanitized submission metadata needed after worker restart

If existing fields are sufficient, add tests proving this metadata survives DB reload/recovery paths. If they are insufficient, add a migration before this section proceeds, including rollback and data compatibility tests.

### 1. Provider resolution

Gateway provider resolution must recognize Magnific from:

- explicit provider hints in `api_config`
- DB model provider field
- static fallback metadata
- model ids beginning with `magnific/`

Do not route Magnific models through Kie fallback.

### 2. Image and edit routing

Route Magnific image generation/edit/enhancement categories to `MagnificProvider`.

Request payload should include normalized:

- prompt
- negative prompt if applicable
- source/reference images
- aspect ratio/resolution
- seed
- model-specific controls
- server-trusted webhook only if future platform callback exists

### 3. Video and upscaler routing

Route Magnific video and video-upscaler models to `MagnificProvider`.

Persist provider task id and submission metadata in the response/result record for async tasks.

Retry/replay behavior must be idempotent:

- after provider task id persistence, retries resume polling/status recovery
- retries must not submit a duplicate Magnific job
- request dedupe hashes must exclude API keys, signed URL query strings, transient upload URLs, and webhook URLs

### 4. Remove Background sync flow

When `dispatchMode == "sync"` for `magnific/remove-background`:

- reserve credits before call
- submit synchronously
- re-host temporary URLs immediately
- return completed normalized response
- refund if validation, provider call, or re-hosting fails

If existing gateway/task abstractions require a media task record, mark it completed in the same lifecycle rather than scheduling long polling.

### 5. Sanitized errors

Gateway exceptions must preserve useful status categories while hiding provider raw bodies, signed URLs, prompts when sensitive, and keys.

## TDD First

Write tests:

- persistence audit covers required metadata or migration tests cover new fields
- explicit provider `magnific` routes to Magnific
- `magnific/*` model ids route to Magnific
- missing provider key returns setup error and triggers existing refund behavior
- image model creates async response with provider task id
- video model creates async response with provider task id
- retry after provider task id exists resumes polling instead of duplicate submit
- Remove Background creates completed sync response
- existing Kie/WaveSpeed/BytePlus/ElevenLabs routing remains unchanged

## Acceptance

This section is complete when the gateway can submit each Magnific dispatch family and return normalized responses that downstream media task code can persist or complete.
