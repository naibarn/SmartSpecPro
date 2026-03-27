# Research Notes: Upload-Post API

## API Base URL
`https://api.upload-post.com/api`

## Authentication
- Header: `Authorization: Apikey YOUR_API_KEY`
- Also supports Bearer JWT tokens for delegated access

## Full Endpoint Reference

### Content Upload

#### POST /upload_videos
- Platforms: TikTok, Instagram, LinkedIn, YouTube, Facebook, X, Threads, Pinterest, Bluesky
- Modes: sync, async, scheduled (up to 365 days), queued
- Platform-specific params:
  - **TikTok**: privacy_level, disable_duet/comment/stitch, post_mode, cover_timestamp, brand toggles, is_aigc
  - **Instagram**: media_type, share_mode, share_to_feed, collaborators, cover_url, user_tags, location_id
  - **YouTube**: category (default 22), privacy status, embeddable, license, thumbnail, language, country restrictions, product placement disclosure
  - **X**: reply_settings, nullcast, super_followers_only, community_id
  - **Facebook**: page_id (required), media_type (VIDEO/STORIES), video_state (DRAFT/PUBLISHED)
  - **LinkedIn**: visibility (PUBLIC/PRIVATE/CONNECTIONS), org page targeting
  - **Reddit**: subreddit (required), flair_id
- FFmpeg media processing support
- Response: 200 (sync/async) or 202 (scheduled/queued)

#### POST /upload_photos
- Platforms: TikTok, Instagram, LinkedIn, Facebook, X, Threads, Pinterest, Bluesky, Reddit, Google Business
- Supports image carousels
- Instagram/Threads support mixed video-photo carousels

#### POST /upload_text
- Platforms: X, LinkedIn, Facebook, Threads, Reddit, Bluesky, Google Business
- Auto-threads for long content (>280 X, >500 Threads, >300 Bluesky)
- Supports polls, quote tweets, link cards on X

#### POST /upload_document
- Platform: LinkedIn only
- Formats: PDF, PPT, PPTX, DOC, DOCX (max 100MB, 300 pages)

### Upload Management

#### GET /uploadposts/status
- Params: `request_id` (async) or `job_id` (scheduled)
- States: pending, in_progress, completed

#### GET /uploadposts/history
- Paginated: `page`, `limit`

#### GET /uploadposts/schedule
- List pending scheduled posts

#### DELETE /uploadposts/schedule/{job_id}
- Cancel scheduled post

#### PATCH /uploadposts/schedule/{job_id}
- Edit scheduled date/title/caption

### Queue Management

#### GET /uploadposts/queue/settings
- Returns timezone and time slots

#### POST /uploadposts/queue/settings
- Max 24 slots per profile
- Days of week selection (0-6: Mon-Sun)

#### GET /uploadposts/queue/preview
- Preview next available slots

#### GET /uploadposts/queue/next-slot
- Get immediate next slot

### User Management

#### POST /uploadposts/users
- Create new user profile

#### GET /uploadposts/users
- List all profiles (with plan limits)

#### GET /uploadposts/users/{username}
- Get specific profile details

#### DELETE /uploadposts/users
- Delete profile and associated data

#### POST /uploadposts/users/generate-jwt
- Create single-use JWT URL
- Valid: 48 hours
- Options: redirect URL, logo, button text, platform filtering

#### POST /uploadposts/users/validate-jwt
- Validate JWT token (Bearer auth)

### Platform Resources

#### GET /uploadposts/facebook/pages
- List connected Facebook pages

#### GET /uploadposts/linkedin/pages
- List LinkedIn org pages

#### GET /uploadposts/pinterest/boards
- List Pinterest boards (public/secret)

#### GET /uploadposts/google-business/locations
- List business locations

### Analytics

#### GET /analytics/{profile_username}
- Params: `platforms` (required), `page_id` (Facebook), `page_urn` (LinkedIn)
- Metrics: followers, views, impressions, reach, likes, comments, shares

#### GET /uploadposts/total-impressions/{profile_username}
- Total impressions across platforms

#### GET /uploadposts/post-analytics/{request_id}
- Analytics for specific post

### Media & Engagement

#### GET /uploadposts/media
- Recent posts from all connected accounts
- Returns: IDs, captions, types, permalinks, timestamps, thumbnails

#### GET /uploadposts/comments
- Post comments retrieval

#### POST /uploadposts/comments/reply
- Reply to comments

#### POST /uploadposts/dms/send
- Send DMs

#### GET /uploadposts/dms/conversations
- DM history

### Account Validation

#### GET /uploadposts/me
- Validates API key
- Returns: email, subscription plan

### Notifications

#### POST /uploadposts/users/notifications
- Configure webhook URL and/or Telegram chat ID
- Events: uploadCompleted, uploadFailed, uploadScheduled

### FFmpeg Processing

#### POST /uploadposts/ffmpeg/jobs/upload
- Submit media processing job
- Placeholders: `{input}`, `{input0}`, `{input1}`, `{output}`

#### GET /uploadposts/ffmpeg/jobs/{job_id}
- Poll status: PENDING, PROCESSING, FINISHED, ERROR

#### GET /uploadposts/ffmpeg/jobs/{job_id}/download
- Download processed file

#### GET /uploadposts/ffmpeg/consumption
- Monthly quota usage

## Response Patterns

### Success (200)
```json
{
  "success": true,
  "request_id": "abc123",
  "results": {
    "instagram": { "success": true, "url": "https://..." },
    "tiktok": { "success": true, "url": "https://..." }
  }
}
```

### Async (202)
```json
{
  "success": true,
  "request_id": "abc123",
  "message": "Upload initiated successfully in background.",
  "total_platforms": 3
}
```

### Scheduled (202)
```json
{
  "success": true,
  "job_id": "xyz789",
  "scheduled_date": "2026-04-01T09:00:00Z"
}
```

### Error Codes
- 400: Invalid parameters
- 401: Missing/invalid API key
- 403: Insufficient permissions
- 404: Resource not found
- 429: Rate limit exceeded
- 500: Server error

## Pricing
- Free tier: 10 uploads/month
- Paid plans: higher quotas (specific tiers not documented)

## Key Design Decisions

1. **User-level API keys** — Each user manages their own Upload-Post subscription. This avoids a single shared key that would hit rate limits and makes billing transparent.

2. **JWT for social linking** — Upload-Post handles all OAuth flows. We generate a JWT URL, user opens it in a popup, connects their social accounts there, and we poll for connected platforms.

3. **Dual gateway** — Keep native providers for users who need direct control / high volume. Upload-Post for users who want breadth and simplicity.

4. **Async-first** — Upload-Post uploads complete in the background, so status polling and background sweeps are part of the primary path rather than an edge-case fallback.

## Testing

- Backend tests use Vitest.
- Router tests typically mock `../_core/trpc` or mock service dependencies directly, then call `router.createCaller(...)`.
- Service tests live alongside the service under `apps/web/server/services/__tests__/`.
- Router tests live under `apps/web/server/routers/__tests__/`.
- Existing security-sensitive helpers already have dedicated tests for SSRF, feature flags, and encrypted key handling.
- The web package test command is `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 vitest run` via `npm --prefix apps/web test`.
