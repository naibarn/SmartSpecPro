# Deep-plan interview — Feature 163

## Interview status

No blocking stakeholder question was required. The user explicitly selected
Sidebar + separate screens + Quick Actions, asked for both guided and automated
AI editing, and required local Worker folders, Series binding, safe R2 derived
publication, and a scalable Worker App shell.

## Auto-decisions

- Keep legacy tab aliases during one migration release.
- Use a neutral server-side Series access service; never invoke browser tRPC
  from the Worker and never trust client identity fields.
- Use REST Control Plane endpoints with existing Worker token/device-proof
  middleware and typed error/idempotency contracts.
- Store native absolute paths only in protected local state; expose opaque
  root IDs and safe projections to the webview/server.
- Implement Feature 163 as the shell/control-plane owner and mount Feature 162
  media-specific screens under Media Workspace without duplicating algorithms.
