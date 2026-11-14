# SPEC-312 R1.16 — Chat image attachment implementation and dev release

- Date: 2026-11-14 (Asia/Bangkok)
- Canonical source: `smartaihub-platform/main@36134d0bd35eaa2997b76c7e301c7855150aa2b2`
- Development target: `modular-debian-dev` — `https://aimarkethubs.com`
- Immutable release artifact: `/home/dev/modular-development-releases/modular-debian-dev-36134d0bd35eaa2997b76c7e301c7855150aa2b2-image-attachments`
- Deployment result: `DEPLOYED_AND_VERIFIED`, controller timestamp `2026-11-14T01:38:01.657719+00:00` UTC. Previous port-3100 release remains the rollback service.

## Implemented

- Composer creates an immediate local thumbnail preview for selected JPEG, PNG and WebP images; previews can be removed and their object URLs are revoked. Selection is bounded to four images and 4 MiB per image.
- Authenticated same-origin Hono upload proxy stores validated image bytes in private, workspace/user/environment-scoped R2. No public object URL is exposed. Chat turns carry bounded opaque attachment references through the existing `worker_jobs`/outbox/Cloudflare Queue route.
- The queue consumer retrieves authorized image bytes after claiming the job and constructs the provider's multimodal request. Provider execution remains behind existing queue admission and credit reserve/settlement.
- The live OpenRouter catalog retains input modalities. Auto selection for image turns only admits image-capable enabled models; an explicitly selected text-only model gets an actionable localized error.
- Persisted image attachments can be rendered in authorized Chat history through the authenticated proxy.

## Verification evidence

- `pnpm --filter @smartaihub/chat typecheck` — passed.
- `pnpm --filter @smartaihub/saas-core typecheck` — passed.
- `pnpm --filter @smartaihub/chat build` — passed.
- `pnpm --filter @smartaihub/saas-core build` — passed, including Wrangler dry-run and the development R2 binding.
- `git diff --check` — passed before integration.
- Immutable canonical-source build at the exact SHA — `BUILD_PASSED`; Cloudflare staging publication was explicitly skipped.
- Modular Debian release controller — `DEPLOYED_AND_VERIFIED`; local and public health/module routes returned success, unauthenticated session endpoint returned 401 as expected, and served Chat asset contains the image attachment upload/preview/history and vision-filter code.
- No automated tests were run, per repository instructions. Authenticated browser image upload/send/history UAT was not performed by the implementation session and remains required.

## Remaining scope and gaps

- Text, Markdown, CSV and JSON attachment support from R1.16 is **not implemented**. Do not report the full R1.16 attachment requirement as complete. The current credit reservation path has not been proven to include document payload bytes; adding those payloads before an explicit bounded credit-reservation design risks under-reserving. Keep document selection/submission unavailable until this is resolved and verified.
- Authenticated rendered UAT is still required on `aimarkethubs.com`: select/remove an image, observe its preview, upload and send with an enabled image-capable model, inspect the response and restored history, and check desktop/tablet/mobile layouts. Confirm error retry preserves the draft and selected file.
- A successful health check and static asset inspection do not prove the signed-in provider accepts vision requests or that the account has a usable image-capable provider credential. Keep acceptance partial until the signed-in journey is observed.

## Scope boundary

This is development deployment evidence only. `smartaihub.app` and production `smartsihub.com` were not changed. Shared account/workspace identity remains in the existing `smartspec` control-plane database; private attachment bytes are in the development R2 binding.
