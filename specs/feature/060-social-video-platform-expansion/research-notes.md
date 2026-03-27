# Research Notes: TikTok + YouTube Social Video Publishing

Date: 2026-03-24

## TikTok

Official docs reviewed:

- [Content Posting API overview](https://developers.tiktok.com/products/content-posting-api)
- [Get started](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [Upload Video reference](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video)
- [Creator info query](https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info)
- [Get post status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status)
- [Media transfer guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)
- [Content sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/)

Key findings:

1. TikTok supports both direct post and draft upload flows.
2. `video.publish` is required for direct post; `video.upload` is required for draft upload.
3. Creator info must be queried before direct post UI / request initialization.
4. Unaudited clients are restricted to private viewing mode.
5. TikTok supports `FILE_UPLOAD` and `PULL_FROM_URL`.
6. URL transfer requires verified domain / URL prefix ownership.
7. Polling and webhook status tracking both exist.
8. Media restrictions include codec, frame rate, resolution, size, and duration limits.
9. Sharing guidelines prohibit branding / watermark overlays in exported content.

## YouTube

Official docs reviewed:

- [videos.insert reference](https://developers.google.com/youtube/v3/docs/videos/insert)
- [YouTube Shorts 3-minute help](https://support.google.com/youtube/answer/15424877)
- [Upload YouTube Shorts help](https://support.google.com/youtube/answer/12779649)

Key findings:

1. YouTube uploads use `videos.insert`.
2. Metadata can be set at upload time, including `privacyStatus` and `publishAt`.
3. Unverified API projects created after 28 July 2020 are private-only until the audit requirement is met.
4. There is no separate Shorts upload endpoint in the docs reviewed.
5. Shorts are categorized from normal uploads based on square/vertical aspect ratio and duration.
6. For standard channels, uploads on or after 15 Oct 2024 with square or vertical aspect ratio and up to 3 minutes are categorized as Shorts.

## Product Implications

1. We should treat Shorts as a rule layered on YouTube upload, not as a separate provider family.
2. We should treat TikTok as a provider with two distinct publishing experiences:
   - publish directly
   - upload to draft / inbox for later completion
3. The background façade must remain provider-neutral so future providers can be added without changing call sites.

