# Decision log

## Planning depth

Promoted to standard quick-plan with focused cross-domain sections. The feature touches API, storage, persistence, admin UI, and Worker App integration, but reuses existing release infrastructure and does not add a build service.

## Decisions

- Use a dedicated runtime release catalog rather than overloading desktop installer rows.
- Store release ZIPs in the existing durable storage abstraction; keep filesystem scanning as a legacy fallback.
- Keep signing outside the UI. The server validates the signed artifact; no private key endpoint exists.
- Resolve current runtime independently by runtime id/channel/version so partial releases work.
- Use admin-only authorization at both route and service boundaries.
- Reuse existing Admin Desktop Host rather than adding a new top-level navigation system.
