# Tenant Media and Screen-Caller Gate Design

## Goal

Fix two related Vertical Drama generation failures without weakening tenant
isolation or physical-scene identity protection:

1. Managed reference images submitted through `media.generateImageAsync` must
   carry the canonical user and tenant context into the provider-boundary
   broker resolution.
2. Video-prompt face observability checks must distinguish a caller rendered
   inside a phone/video screen from a character physically present in the shot.

## Design

### Tenant media boundary

`media.generateImageAsync` resolves the canonical tenant with
`resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId)` and passes it in
`auditContext` alongside the authenticated user. The existing managed-media
resolver then creates a tenant-scoped provider broker URL. A missing tenant
context remains fail-closed; the router reports it as a precondition failure
after refund handling rather than masking it as an opaque HTTP 500.

### Screen-caller face assurance

The shared assurance contract receives the names/keys of explicitly assigned
screen callers. Per-person face observability findings for those callers are
non-blocking because a small, soft, or partially overlapped phone display is
normal for the requested composition. A global `facesSeparated=false` signal is
also non-blocking when the shot has a screen caller; physical-scene findings
remain blocking when reported per person. Shots without screen callers retain
the existing fail-closed behavior.

All video-prompt assurance call sites pass the resolved screen-caller identity
set, including initial prompt authoring, split-shot authoring, persisted-shot
validation, and final provider submission.

## Verification

- Focused media route/service tests prove tenant propagation and the typed
  precondition behavior.
- Shared assurance tests prove physical faces still block, screen callers do
  not block on screen-specific observability, and non-screen shots preserve the
  old blocker behavior.
- Run `git diff --check` and the touched Vitest files. Full repository checks,
  authenticated browser verification, provider submission, and deployment are
  outside this patch.
