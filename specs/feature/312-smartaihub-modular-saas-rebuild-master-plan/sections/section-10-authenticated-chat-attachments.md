# Section 10 — Authenticated Chat attachments

## Objective

Replace the current filename-only picker and intentional attachment send failure with an image/document flow that previews immediately, uploads privately, and delivers content only through the existing `worker_jobs` + outbox + Cloudflare Queue pipeline.

## Scope and ownership

- Source checkout: canonical `smartaihub-platform/main`.
- Development target: `modular-debian-dev` at `aimarkethubs.com`; do not route `smartaihub.app` or activate `smartsihub.com`.
- Likely source paths: Core Hono bindings/routes/chat service/repository/Queue consumer/provider model cache; Chat Hono proxy/session API, composer, message timeline, localized strings and module styles; Core Wrangler local R2 binding.
- SPEC paths: R1.16, section index, this section, and the canonical SPEC-312 handoff writer only.
- Data boundary: reuse the canonical account/workspace identities in `smartspec`. Keep uploaded object bytes in private R2 (local Workerd R2 for the development target); never create public object URLs.

## Behavior and limits

- Select JPEG, PNG or WebP images (up to 4 MiB each) and text, Markdown, CSV or JSON documents (up to 1 MiB each); support at least 10 total attachments and 10 MiB aggregate per turn. Both image and document pickers support multi-select, and later selections append until the limit is reached.
- Render compact image thumbnails immediately with browser object URLs, never at intrinsic/full-screen size; show each filename and size, allow removal, and open an accessible full-screen Lightbox with previous/next navigation when a thumbnail is selected. Text documents render as compact file chips. Revoke object URLs after removal, successful submission, and unmount. Validate early in the UI and repeat all validation server-side, including image file signatures and safe normalized filenames.
- Upload each file via authenticated same-origin Hono routes. Resolve workspace from the authenticated membership, bind each opaque attachment ID/object key to environment + user + workspace, and deny mismatched read/send requests. Use bounded bodies and private R2 metadata. Read images/documents only when servicing authorized history or a claimed Queue job.
- Persist only bounded attachment references alongside the user message/job. Prefer a versioned marker/metadata in existing `worker_jobs.inputJson` and message content to avoid a schema migration; marker parsing must preserve plain text, titles and old messages. Keep reference writes atomic and replay-safe; do not split them across non-atomic calls. The attachment-byte reservation bound is an additive change to the existing credit reservation function (`0436_modular_chat_attachment_credit_bounds.sql`), with dev DB application evidence; it does not add or mutate ledger rows outside the normal queued settlement path.
- Queue consumers fetch referenced objects after claim. Build an OpenRouter-compatible multimodal user message; include bounded text-document contents with their filenames. Credit reservation SHALL include a conservative bound derived from total uploaded attachment bytes, capped to the accepted aggregate limit; final reservation settlement remains based on actual provider usage. The existing provider admission, idempotency/lease/fencing path remains in force.
- Extend the live OpenRouter model cache to retain `architecture.input_modalities`. Image-turn Auto candidates require `image`; explicit non-image models fail with a localized actionable error and preserve draft/attachments. Plain text turns retain existing model selection.
- Authenticated history reads include persisted attachment descriptors and images are loaded through same-origin, cookie-authenticated, workspace-scoped routes with restrictive content-type and cache headers.

## Acceptance

1. Compact image thumbnails appear before upload and never render full-size in the composer; clicking opens the full-screen Lightbox/gallery. Selection removal revokes preview and updates the composer. Text document selections show truthful names/types and sizes.
2. Supported files upload and enqueue; user message and answer render, with attachment preview/label in history after reload. Failed upload/provider/queue states preserve text and selections for retry.
3. Unsupported type, forged MIME, bad image signature, more than 10 files, per-file and aggregate size limits fail clearly; normal text-only Chat remains available.
4. A user/workspace/environment cannot read, send, or inspect another scope's object. Object store is private and no object key or public URL is accepted from the client.
5. Duplicate/retried Queue deliveries use the same persisted references and cannot append or charge twice. Provider calls, rate admission and credit settlement remain exclusively in the canonical Queue worker.
6. Image turns use only live-catalog image-input models: Auto filters candidates and explicit text-only choices return an actionable error without losing the draft.
7. Chat and Core build independently for local Workerd and Cloudflare-compatible Worker targets; only the authorized development target is deployed. Authenticated rendered review covers desktop, tablet and mobile composer/preview/history.

## Implementation and verification order

1. Implement Core private storage/routes and module proxy routes, then worker/model capability support, then composer/history integration.
2. Run the scoped TypeScript checks and independent module builds. Do not run or add automated tests unless the owner explicitly asks; record this verification limit in the handoff.
3. Record exact source SHA and development release evidence; keep authenticated visual UAT pending until actually observed.

## Failure, retention and rollback

- An upload is not a successful Chat response. If upload, enqueue, provider admission, provider call, or polling fails, display the localized cause and preserve the draft and any still-valid selected attachment references.
- Never send selected attachments as text-only without telling the user. Never bypass the worker queue, provider admission or credit ledger.
- Keep stored objects private. Use the account/workspace attachment association in message history as the retention authority; do not add blanket expiry that breaks existing conversations. Orphan cleanup is a separate bounded maintenance concern and must not delete referenced objects.
- Roll back source bindings/routes/UI without deleting private objects or changing shared user/auth/credit records. Do not provision production R2 or alter production release authority as part of this development slice.
