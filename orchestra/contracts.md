# Orchestra Contracts

## Production Director Extension Detail API

Endpoint: `GET /api/marketplace-captures/production-director/project?productionRunId=...`

Existing auth and tenancy behavior is unchanged:
- Requires marketplace extension bearer auth with `marketplace:read`.
- Reads only the authenticated user's active production space for the resolved tenant.
- Does not add writes or provider-secret exposure.

Per-shot response extends the existing shot object:
- `storyboardGridPrompt?: string`
- `videoPrompt?: string`
- `storyboardGridImageUrl?: string`
- `referenceImageUrl?: string`
- `startFrameUrl?: string`
- `stopFrameUrl?: string`

The extension may render these as read-only prompts and draggable media URLs. Legacy `storyboardPrompt` remains available as a fallback.
