# Decision Log

- Depth: standard quick plan. The service, route, schema, and UI boundaries
  already exist; this is an integration and contract repair rather than a new
  Gallery architecture.
- Use a Library mutation with only `itemId`; never send a browser source URL.
- Store `fileKey`/`thumbnailKey` and return a stable public Gallery route.
- Enforce `role === "admin"` on the server as well as in UI rendering.
- No schema migration is needed because `library_links` already provides the
  idempotent Library-to-Gallery relation.
