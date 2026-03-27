# Implementation Spec

## Goal

Add Upload-Post as a second social gateway so users can connect their own Upload-Post API key, create/link Upload-Post profiles, publish via Upload-Post, track status and history, and optionally route workflow/agency actions through the gateway.

## Requirements

### Connection Management

- Store one encrypted Upload-Post API key per user/tenant connection.
- Validate the key before saving by calling Upload-Post `/api/uploadposts/me`.
- Never return the raw key from any API response.
- Show plan tier and health state only.
- Provide a first-use disclosure that explains third-party data handling, and persist the user's acknowledgement on the Upload-Post connection before enabling the gateway.
- Require tenant-level opt-in in the tenant settings/feature-flag layer before any user can connect or publish through Upload-Post.

### Profile Management

- Create, list, and delete Upload-Post profiles per connected user.
- Enforce tenant and user ownership on every lookup.
- Support JWT-based account linking with CSRF-safe nonce validation and a fixed redirect target.

### Publishing

- Support publish now, schedule, and queue flows through Upload-Post.
- Support video, photo, text, and document publishing, subject to the spec's URL and content constraints.
- Store Upload-Post jobs separately from native `social_posts`.
- Poll status and run a background sweep for stale pending jobs.
- Never have the Node.js process fetch user-supplied media URLs directly; URLs are validated locally and forwarded to Upload-Post for server-side retrieval.

### Workflow and Agency

- Add a parallel dispatch path for Upload-Post.
- Keep it separate from `SocialProviderAdapter` because the existing interface is page-centric and incompatible.
- Resolve the connection from the workflow owner's `userId`.

### Frontend

- Extend the existing `/settings` experience with an Upload-Post connection area.
- Extend the social publishing UI with a gateway selector and profile selection.
- Provide a history view that can distinguish native vs Upload-Post posts.

### Security

- Fail closed behind `UPLOAD_POST_GATEWAY_ENABLED`.
- Encrypt API keys at rest with the existing AES-256-GCM helper.
- Enforce per-user rate limits on all proxy endpoints.
- Validate media URLs with SSRF protections before any upstream call.
- Sanitize all upstream errors before returning or storing them.
- Track retention cleanup for Upload-Post jobs, including metadata nullification before deletion.

## Explicit Non-Goals

- Webhook ingestion for Upload-Post social inbox.
- Replacing native Meta, TikTok, or YouTube adapters.
- Upload-Post admin/billing management.
- Upload-Post comment management.
