# Section 04 - Captures Assets Candidates

## Objective

Implement the REST API used by the extension to create capture drafts, upload selected evidence, and upload category candidate batches.

## Scope

- `POST /api/marketplace-capture/captures`
- `POST /api/marketplace-capture/captures/:captureId/assets`
- `POST /api/marketplace-capture/category-candidates`
- capture and asset services
- URL/file validation

## Implementation Notes

- Use JSON only for structured metadata under the existing 10MB limit.
- Use multipart for screenshots/images/html snapshots/raw payload assets.
- Upload only selected evidence from extension pre-upload review.
- Store files through `storagePut`.
- Validate:
  - user/tenant ownership
  - supported platform and page type
  - source URL host/page policy
  - idempotency key
  - max DOM and HTML chars
  - max candidates/images/screenshots
  - file count and file size
  - extension, content type, magic bytes, decoded dimensions
  - active content denial for HTML/SVG/scriptable payloads unless stored as inert download-only evidence
- Remote marketplace image fetch should be disabled until `marketplaceUrlSafety` has allowlisted CDN hosts and SSRF tests.
- Add status/read endpoint for upload/analyze progress recovery. The extension and web preview need this because MV3 service workers can be suspended during long flows.
- Idempotency keys must be scoped by user, endpoint, action, and payload hash where feasible.
- Validate extension-supplied minimization metadata and reject payloads that exceed selected-evidence limits.
- Add checksums for uploaded assets and exact duplicate suppression.
- Add orphan cleanup behavior for partial uploads, failed DB writes, and abandoned draft assets.
- Candidate/capture retrieval endpoints must paginate and enforce user/tenant filters.

## Tests First

- Draft create succeeds with valid Shopee payload.
- Draft create duplicate idempotency key returns same capture.
- Asset upload rejects cross-user/cross-tenant capture IDs.
- Asset upload rejects spoofed MIME, bad magic bytes, oversized and active-content files.
- Candidate batch validates filters and max count.
- Status endpoint returns owner-scoped upload/analyze status.
- Idempotency keys cannot be reused across users or actions.
- Failed DB insert after storage write creates cleanup work or deletes the orphan immediately.
- Candidate/capture list endpoints are paginated by default.

## Acceptance Criteria

- Selected screenshots/assets are stored and linked.
- Unselected local review data is not uploaded.
- All failures return normalized errors.
