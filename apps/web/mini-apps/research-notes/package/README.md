# Research Notes Mini App package

This directory is the portable descriptor package for the Research Notes reference app. It is portable across compatible SmartAIHub hosts; it does not claim standalone execution on an arbitrary host. `ui.json` binds the host-owned page and `actions.json` lists the authenticated procedures the web UI and machine callers share. The server derives user and tenant authority from authenticated context and rechecks project membership and App binding for each operation.

Build and validate the offline package from the repository root:

```sh
pnpm --filter @smartspec/web exec tsx scripts/build-research-notes-package.ts
```

The build validates the offline manifest/package stages with the existing `@smartspec/spaas-standard` implementation, then writes a deterministic tar.gz package, digest, and validation report under `apps/web/.artifacts/research-notes/`. Runtime placement and migration rollback checks remain `needs_context` until trusted environment evidence exists. The package build does not apply migrations, execute actions, contact providers, or deploy the app.

Machine callers should use the platform tRPC client with an authenticated platform session or platform-issued user Bearer credential. They must send only action inputs from `actions.json`; tenant and user IDs are never caller-controlled inputs. Long-running summary requests return a canonical worker job ID for status polling.
