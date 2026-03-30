# TDD Plan: Upload-Post Universal Gateway

## 1. Data Model and Shared Types

- Add schema tests for the new tables and their indexes or unique constraints.
- Add migration verification that `upload_post_jobs` is separate from `social_posts`.
- Add type-level tests or schema tests for valid platform, job status, and connection status values.
- Add tests for persisted disclosure acknowledgement and tenant opt-in state.

## 2. Upload-Post Client and Router Surface

- Add service tests for key validation, encryption at save time, and secret-free reads.
- Add client tests for request timeout handling and sanitized error mapping.
- Add router tests for auth gating, tenant scoping, and response shape.
- Add router tests that confirm the raw API key is never returned.
- Add feature-flag tests that confirm the router is blocked when the flag is off.
- Add tests that confirm first-use disclosure acceptance is required before connect or publish actions.
- Add tests that confirm tenant opt-in is checked alongside the global fail-closed gateway helper.

## 3. Publish Dispatch and Status Sync

- Add dispatcher tests for ownership resolution and job creation.
- Add status sync tests for foreground polling and background stale-job sweeps.
- Add history tests for pagination and status filtering.
- Add schedule/cancel/edit tests that ensure only scheduled jobs can be modified.
- Add tests that verify the Node.js layer never fetches user-supplied media URLs directly.

## 4. Frontend Integration

- Add settings-panel tests for disclosure banner, validation, and connection state.
- Add publishing-UI tests for the gateway selector and profile-driven platform filtering.
- Add history-view tests for native vs Upload-Post separation.
- Add tests for persisted disclosure acknowledgement and the hidden-by-default Upload-Post UI when disabled.

## 5. Security, Rollout, and Observability

- Add SSRF validator tests for blocked hosts, private IPs, and HTTPS-only enforcement.
- Add nonce-flow tests for JWT generation and callback validation.
- Add rate-limit tests for publish, status, and management endpoints.
- Add audit tests for redaction and event coverage.
- Add cleanup tests for job retention, metadata nullification, and cascade delete behavior.
- Add tests for the shared-key warning when multiple users in a tenant reuse one Upload-Post API key.
