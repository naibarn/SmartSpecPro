# Feature 060: Social Video Platform Expansion

## 1. Overview

### 1.1 Problem Statement

ตอนนี้ social stack ของระบบรองรับ Meta Channels และมีโครง provider-neutral / background actions แล้ว แต่ยังไม่ครบสำหรับแพลตฟอร์มวิดีโอที่สำคัญอย่าง **TikTok** และ **YouTube** โดยเฉพาะ:

- การโพสต์แบบ background โดยไม่ต้องเปิดหน้า UI
- การรองรับ workflow / agency swarm ให้เรียก action เดียวแล้ว dispatch ไป provider ที่ถูกต้อง
- การรองรับวิดีโอสั้นแบบ **YouTube Shorts**
- การแยกความสามารถของแต่ละ provider ให้ชัดเจน เช่น publish now, upload draft, schedule, status polling
- การบังคับ compliance / audit / privacy rules ที่แต่ละ platform ต้องการ

### 1.2 Goal

สร้าง Social Video Platform layer ที่:

1. รองรับ **TikTok** เป็น provider ใหม่แบบ background-first
2. รองรับ **YouTube** upload / publish / schedule / status sync แบบ background-first
3. รองรับ **YouTube Shorts** โดยใช้ upload flow เดียวกับ YouTube แต่มี classification / validation rule เฉพาะ
4. ใช้ provider registry และ capability matrix เดียวกับ social background facade ที่มีอยู่
5. เปิดทางให้เพิ่ม provider อื่นในอนาคตโดยไม่ต้องรื้อ contract หลัก

### 1.3 Scope

**In Scope**

- provider registry สำหรับ TikTok และ YouTube
- internal background APIs สำหรับ publish / draft / status / cancel / sync
- workflow / agency-swarm integration ผ่าน `builtin-social-actions` และ provider-aware dispatch
- capability matrix สำหรับ:
  - TikTok direct post
  - TikTok draft upload
  - YouTube long-form upload
  - YouTube publish / schedule
  - YouTube Shorts classification
- background job orchestration for:
  - upload
  - publish
  - status polling
  - webhook ingestion
  - retry / cancellation
- security / consent / audit / rate-limit requirements

**Out of Scope**

- creator-facing social composer redesign
- social analytics dashboard for TikTok/YouTube
- comment moderation UI for TikTok/YouTube unless later spec extends it
- any provider-specific ad buying / paid media features
- TikTok/YouTube live streaming

### 1.4 Placement in Current Architecture

This feature extends the provider-neutral layer already introduced for Meta social actions:

- [`apps/web/server/services/socialBackgroundFacade.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/socialBackgroundFacade.ts)
- [`apps/web/server/routes/internalSocialActions.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/routes/internalSocialActions.ts)
- [`apps/web/server/services/social/providerCatalog.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/social/providerCatalog.ts)

The new provider implementations must plug into the same background execution surface instead of introducing a parallel route tree.

---

## 2. Research Summary

### 2.1 TikTok: What the official docs allow

TikTok Content Posting API supports:

1. **Direct Post**
   - creator posts content directly from the app to their TikTok profile
   - requires the user to authorize `video.publish`
   - requires querying creator info first
   - unaudited apps are restricted to private viewing mode

2. **Upload to TikTok**
   - upload draft content to TikTok inbox / editing flow
   - creator completes editing and posting inside TikTok
   - uses `video.upload`

3. **Media transfer**
   - `FILE_UPLOAD`
   - `PULL_FROM_URL`
   - verified domain / URL prefix is required for URL transfer

4. **Status tracking**
   - polling endpoint
   - webhooks for final outcome
   - cancel endpoint exists for ongoing publish/download tasks on a best-effort basis

Important documented constraints:

- video restrictions: supported formats, frame rate, size, duration, resolution
- default creator limits and rate limits
- watermark / promotional branding should not be added to shared content
- unaudited clients are private-only and have creator / posting caps

### 2.2 YouTube: What the official docs allow

YouTube Data API supports:

1. **Upload videos**
   - `videos.insert` uploads media and sets metadata
   - supports title, description, tags, category, language, localization, privacy state, publishAt scheduling, made-for-kids flags, synthetic media flags, recording date

2. **Scheduling**
   - `status.publishAt` is supported on upload metadata

3. **Privacy / audit constraints**
   - unverified API projects created after 28 July 2020 are restricted to private viewing mode until audit / verification requirements are met

### 2.3 YouTube Shorts: What the official docs imply

YouTube Shorts does **not** have a separate upload API in the docs we reviewed.
The supported pattern is:

- upload via `videos.insert`
- classify as Shorts based on:
  - square or vertical aspect ratio
  - up to 3 minutes
  - for standard channels, videos uploaded on or after 15 Oct 2024 are categorized as Shorts

Operationally, this means the product should treat Shorts as a **classification rule** on top of the YouTube upload flow, not as a distinct API family.

### 2.4 Sources

- TikTok Content Posting API overview: [developers.tiktok.com/products/content-posting-api](https://developers.tiktok.com/products/content-posting-api)
- TikTok get started: [content-posting-api-get-started](https://developers.tiktok.com/doc/content-posting-api-get-started)
- TikTok direct post reference: [content-posting-api-reference-direct-post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- TikTok upload reference: [content-posting-api-reference-upload-video](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video)
- TikTok creator info: [content-posting-api-reference-query-creator-info](https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info)
- TikTok status / webhook: [content-posting-api-reference-get-video-status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status)
- TikTok sharing guidelines: [content-sharing-guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/)
- YouTube videos.insert: [developers.google.com/youtube/v3/docs/videos/insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- YouTube Shorts help: [support.google.com/youtube/answer/15424877](https://support.google.com/youtube/answer/15424877)
- YouTube Shorts upload help: [support.google.com/youtube/answer/12779649](https://support.google.com/youtube/answer/12779649)

---

## 3. Capability Matrix

### 3.1 Canonical Actions

The platform should expose the following canonical social video actions:

| Canonical Action | Meaning |
|---|---|
| `publish_now` | Publish immediately to the destination platform |
| `upload_draft` | Upload as draft / inbox item for later completion |
| `schedule_publish` | Schedule a future publish time when the provider supports it |
| `sync_status` | Poll or reconcile provider status |
| `cancel_pending` | Cancel pending upload / publish when the provider supports it |
| `read_comments` | Read comments for moderation workflows |
| `reply_comment` | Reply to comments when supported |
| `read_creator_info` | Load provider profile / capability metadata before publishing |

### 3.2 Provider Support Matrix

| Capability | TikTok | YouTube Long-form | YouTube Shorts |
|---|---|---|---|
| Publish now | Yes, via Direct Post | Yes, via `videos.insert` | Yes, via `videos.insert` |
| Draft upload | Yes, via Upload API | Not native; use scheduled/private draft pattern | Same as YouTube long-form |
| Schedule publish | Optional / only if provider flow explicitly supports it | Yes, via `status.publishAt` | Yes, same as YouTube long-form |
| Media upload from local file | Yes (`FILE_UPLOAD`) | Yes | Yes |
| Media upload from URL | Yes (`PULL_FROM_URL`) with verified domain / prefix | No provider-specific upload-from-URL requirement in current docs; can be handled by our own fetch pipeline if needed | Same as YouTube long-form |
| Creator info preflight | Required | Optional / channel metadata lookup | Optional / channel metadata lookup |
| Status polling | Yes | Yes, via API / internal job status | Yes, same as long-form |
| Webhook callback | Yes | Not a canonical upload webhook in current docs; if added, treat as optional | Same as long-form |
| Comment moderation | Future extension | Future extension | Future extension |

### 3.3 Recommendation for v1

For the first implementation of this feature:

1. TikTok should support:
   - direct post
   - draft upload
   - status polling
   - cancellation
2. YouTube should support:
   - upload
   - publish now
   - schedule
   - status tracking
3. YouTube Shorts should be implemented as:
   - a classification rule on top of the YouTube upload path
   - not a separate API surface

---

## 4. Functional Requirements

## 4.1 Provider Registry and Dispatch

1. Social background actions must continue to use a provider registry.
2. `meta`, `tiktok`, and `youtube` must be represented as distinct providers.
3. The registry must expose:
   - provider id
   - label
   - summary
   - supported actions
   - lifecycle status (`available`, `planned`)
4. Workflow / agency callers must invoke one canonical social action surface and let the registry dispatch to the provider implementation.
5. Unknown provider ids must fail gracefully with a clear, structured error.

## 4.2 TikTok Requirements

1. Connect TikTok account by OAuth and persist creator identity + token state.
2. Before publishing, always load creator info and supported options.
3. Support direct post for creators with approved access.
4. Support draft upload for users who should finish the post in TikTok.
5. Support both local file transfer and verified URL transfer where permitted.
6. Support polling and webhook status reconciliation.
7. Support cancellation of pending uploads / publishes where TikTok allows it.
8. Enforce TikTok media restrictions before job enqueue:
   - valid codec / format
   - frame rate range
   - dimension range
   - duration limit
   - size limit
9. Enforce content sharing rules:
   - do not add promotional watermarks or branding overlays in exported media
   - require explicit creator consent for posting
10. If the API client is unaudited, only private viewing mode can be used and that must be reflected in UI / backend constraints.

## 4.3 YouTube Requirements

1. Connect a YouTube channel with OAuth and persist channel identity + token state.
2. Support video upload via `videos.insert`.
3. Support metadata control:
   - title
   - description
   - tags
   - category
   - privacy
   - publish schedule
4. Support scheduled publishing using `status.publishAt`.
5. Support private/unlisted/public privacy options only when allowed by the account / API project state.
6. Provide status sync for uploaded items until they become published or fail.
7. Treat Shorts as a rule on top of the same upload path, not as a different upload endpoint.

## 4.4 YouTube Shorts Requirements

1. Mark a YouTube asset as Shorts candidate when:
   - aspect ratio is vertical or square
   - duration is 3 minutes or less
2. Do not require a separate Shorts API endpoint.
3. Preserve a `shortsCandidate` or equivalent classification flag in the job metadata so downstream jobs and UI can render the correct label.
4. If an asset is longer than 3 minutes, do not auto-classify as Shorts.
5. If a Short uses licensed music or claimed audio, surface the relevant policy risk and do not auto-publish without guardrails.

## 4.5 Background Execution Requirements

1. Publishing must be runnable via background workers without the UI being open.
2. Status tracking must be retryable and idempotent.
3. Failed uploads/publishes must move into a diagnosable error state with provider error detail.
4. Pending jobs must survive worker restart.
5. Cancellation must not corrupt stored job records or break later retries.

---

## 5. Data Model Requirements

### 5.1 Provider Connection Record

Each connected social provider account should store:

- `providerId` (`meta`, `tiktok`, `youtube`)
- account / channel / creator identifier
- encrypted access token
- optional refresh token
- granted scopes
- token expiry timestamp
- connection status
- last sync timestamp
- audit state / verification state

### 5.2 Content Job Record

Each outbound job should store:

- provider id
- canonical action (`publish_now`, `upload_draft`, `schedule_publish`)
- destination id
- media asset ids
- canonical caption / description
- privacy / visibility
- scheduled publish time
- provider publish id / post id / video id
- status (`queued`, `processing`, `published`, `draft`, `scheduled`, `failed`, `cancelled`)
- error payload / failure code
- shorts classification flag

### 5.3 Capability Record

The system should persist provider capability discovery so the UI and workflow engine can disable unsupported actions before enqueue:

- whether direct publish is available
- whether draft upload is available
- whether scheduling is available
- whether Shorts classification applies
- whether public posting is allowed under current audit state

---

## 6. API and Integration Requirements

### 6.1 Internal Background API

Extend the internal background social API to accept provider-aware requests:

1. `provider`
2. `action`
3. `tenantId`
4. destination identifier
5. media / caption / schedule payload
6. optional query fallback for agent tool compatibility

### 6.2 TikTok Internal Surface

The backend should be able to support endpoints or service calls equivalent to:

- creator info query
- direct post initialize / send
- draft upload initialize / send
- status polling
- cancel pending publish

### 6.3 YouTube Internal Surface

The backend should be able to support endpoints or service calls equivalent to:

- channel metadata lookup
- upload / insert video
- schedule publish
- status sync

### 6.4 Workflow and Agency Integration

1. Virtual Workflow nodes should be able to call social video actions in background.
2. Agencies Swarm builtin tools should be able to dispatch to TikTok / YouTube by provider id.
3. Tool configuration should explicitly capture provider, destination id, and default action mode.
4. `tenantId` must always be injected server-side, never trusted from client-only inputs.

---

## 7. Security and Compliance Requirements

### 7.1 OAuth and Scope Rules

1. TikTok requests must be authorized with the proper user token and required scope.
2. YouTube uploads must use OAuth with upload scope.
3. Tokens must be encrypted at rest.
4. Refresh flow must be supported where the provider offers it.

### 7.2 Verification and Audit Rules

1. TikTok unaudited client behavior must be treated as private-only.
2. YouTube projects created after 28 July 2020 must be treated as private-only until audit / verification is confirmed.
3. Verified domain / URL prefix rules must be enforced for TikTok URL transfer.

### 7.3 Content Safety Rules

1. The system must not add prohibited branding/watermark overlays to TikTok exports.
2. The system must not auto-publish unsupported or disallowed content types.
3. The system must treat music / copyright risk on Shorts as a blocking or warning condition depending on the policy config.

### 7.4 Operational Safety

1. All background actions must be idempotent where possible.
2. Retries must be bounded.
3. Rate limits must be respected and surfaced as retryable errors.
4. Provider errors must be normalized into structured internal error codes.

---

## 8. Testing Requirements

1. unit tests for provider registry and capability discovery
2. unit tests for TikTok direct post / draft / status / cancellation flows
3. unit tests for YouTube upload / schedule / status flows
4. tests for Shorts classification by aspect ratio and duration
5. tests for private-only / audit-gated behavior
6. tests for URL ownership validation on TikTok transfer
7. tests for `tenantId` injection in agency bridge requests
8. tests for workflow / agency background dispatch without UI dependency
9. tests for provider-specific error normalization and retry behavior

---

## 9. Acceptance Criteria

1. A workflow or agency tool can post to TikTok without opening the UI.
2. A workflow or agency tool can upload and schedule YouTube videos without opening the UI.
3. Shorts candidates are classified correctly from the same YouTube upload flow.
4. TikTok draft upload and creator-info preflight work before publish.
5. Public publishing is blocked when provider audit / verification / privacy constraints are not met.
6. Unsupported provider actions fail with a clear, structured error.
7. Background jobs can retry, cancel, and reconcile status deterministically.

---

## 10. Rollout Strategy

1. Phase 1: provider scaffolds and capability discovery only
2. Phase 2: YouTube upload / schedule
3. Phase 3: TikTok draft upload + direct post
4. Phase 4: Shorts classification + policy tuning
5. Phase 5: status sync, cancellation, and webhook hardening

Rollout should start with internal / canary tenants only, with public enablement gated by provider audit state and tenant feature flags.

---

## 11. Open Questions

1. Should TikTok scheduling be exposed as a first-class action, or should all scheduled content be represented as drafts until the provider confirms schedule support for the selected account type?
2. Should YouTube Shorts be exposed as a separate UX action, or only as a classification badge on the normal upload action?
3. Do we want photo support in the first TikTok release, or should we keep the initial scope video-only and add photos after the workflow is stable?
4. Should YouTube comment moderation be included in a follow-up feature, or bundled into the first provider expansion if the team wants a single pass?

