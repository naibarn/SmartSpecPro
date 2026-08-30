# Section 01 — Artifact Ledger and Durability Service

## Ownership

Own `apps/web/drizzle/schema.ts`, the new Drizzle migration, `apps/web/server/services/mediaTaskArtifactService.ts`, and their focused tests. Do not rewrite concurrent Vertical Drama asset-service changes.

## Work

Add a tenant/user-scoped `media_task_artifacts` table with source kind/task ID/output index uniqueness, provider provenance/status, R2 media asset linkage/status, retry metadata, and indexes for owner/task/status. Implement the shared service that extracts image/video/audio results, validates provider downloads, uploads to R2, registers `media_assets`, classifies provider status, and returns the normalized artifact projection.

## TDD

Write tests first for all output shapes, tenant/user fail-closed behavior, redirect/MIME/size checks, idempotency, conflict races, provider expiry, and no-secret logging.

## Acceptance

An artifact can be created or reconciled exactly once for an owner-scoped task output; R2 URL and provider provenance are separately persisted; missing identity never creates a row.
