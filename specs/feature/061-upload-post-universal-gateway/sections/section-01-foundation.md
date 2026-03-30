# Section 01: Foundation

## Scope

Build the shared foundation for Upload-Post without wiring it into the UI or publish flow yet.

## Work

- Add the new Drizzle tables and enums needed for Upload-Post connections, profiles, and jobs.
- Add persisted consent state for first-use disclosure on the user's Upload-Post connection, plus tenant opt-in in the tenant settings/feature-flag layer.
- Add migration scaffolding that keeps the Upload-Post tables isolated from native social tables.
- Add shared TypeScript types for platforms, statuses, and job metadata.
- Add shared TypeScript types for consent state and policy version tracking.
- Add a fail-closed helper for `UPLOAD_POST_GATEWAY_ENABLED` rather than reusing the generic feature-flag helper.

## Constraints

- Follow the existing tenant/user ownership patterns used by social and channel connection tables.
- Keep the schema compatible with the existing audit and retention model.
- Do not add any Upload-Post publish logic yet.
