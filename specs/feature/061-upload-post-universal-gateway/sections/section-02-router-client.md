# Section 02: Router and Client

## Scope

Add the Upload-Post HTTP client and the tRPC router surface for account and profile management.

## Work

- Implement `UploadPostClient` with timeout handling and sanitized error mapping.
- Add the new `uploadPost` router with connect/disconnect/getConnection/listProfiles/createProfile/deleteProfile/generateJwt/listPlatformPages/getAnalytics/queue settings endpoints.
- Add the fixed redirect and nonce-based JWT flow.
- Require first-use disclosure acknowledgement and tenant opt-in before connect or publish actions proceed.
- Add per-user rate-limited procedures around connection and profile management.

## Constraints

- Never return the raw API key in any response.
- Keep secrets encrypted at rest using the shared crypto helper.
- Enforce tenant and user ownership on every read and write path.
