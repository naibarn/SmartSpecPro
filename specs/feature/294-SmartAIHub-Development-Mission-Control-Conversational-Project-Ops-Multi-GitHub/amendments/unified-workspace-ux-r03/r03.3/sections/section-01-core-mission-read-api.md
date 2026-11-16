# Section 01 — Core Mission read API

Deliverable: authenticated workspace-level list of existing tenant Missions using the established repository and owner-scoped SQL function.

Scope: `smartaihub-platform/apps/saas-core/src/identity/authRoutes.ts`, route tests. Work in `/mnt/SmartSpecDev/projects/smartaihub-platform`.

Prerequisite: none. Preserve per-conversation APIs. Each request must reauthenticate and resolve selected workspace membership. Do not add database schema, a new read store, or lifecycle mutation.

Known gap: this endpoint lists Chat Missions and does not establish a Harness catalog or arbitrary Job relationship.
