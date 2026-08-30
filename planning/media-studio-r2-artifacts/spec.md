# Media Studio R2 Artifact Durability

Implement the approved Media Studio durability change described in:
`docs/portable-skill-pack/specs/2026-08-21-media-studio-r2-artifacts-design.md`.

Scope:

- Store generated image, video, and audio outputs in R2 for every Media Studio transport.
- Preserve the original provider URL and classify it as available, unavailable, or expired.
- Make R2 the canonical Media History playback/download URL.
- Add tenant/user-scoped artifact persistence and explicit storage/provider statuses.
- Backfill historical completed outputs with a resumable, safe command.
- Preserve browser cache revalidation and video range support through protected storage routes.
- Add focused server, migration, backfill, and Media History UI tests.

Constraints:

- Fail closed when tenant or user identity is missing or mismatched.
- Do not expose secrets, signed query strings, or provider URLs in logs.
- Preserve unrelated dirty-worktree changes.
- Do not claim live R2/provider, browser-authenticated, target-DB migration, or deployment proof unless actually run.
