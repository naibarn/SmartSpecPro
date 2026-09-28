# Synthesized Implementation Specification

This document is the deep-plan working synthesis of
`spec.md`, codebase research, and the approved decisions in
`claude-interview.md`. The authoritative product requirements remain in
`spec.md`; this file makes the implementation boundary explicit.

## Objective

Implement Feature 156 end-to-end: a single Series Profile authority, a
normalized Story Sources & Media hub, staged pre-series Source Packs, vision
description and evidence review, strict pre-draft gating, B-roll bindings, and
legacy-compatible profile/prompt integration.

## Required outcomes

- Twelve versioned profiles map to the existing format/look contracts without
  a second editable selector.
- Nine implementation layers are delivered: contracts, persistence, source
  APIs, ingestion, vision/evidence, UI/source hub, gate/prompt integration,
  B-roll production binding, and migration/quality rollout.
- A non-fiction/review/hybrid draft cannot bypass Source Pack readiness through
  direct tRPC calls or the pre-series composition job.
- The current Draft Quality QC/foundation receipt remains an additional create
  requirement.
- `verticalDramaSeries.create` atomically attaches a staged pack and is
  idempotent; no provider or media-upload side effect is performed in that
  transaction.
- Text drafting and production rendering use distinct readiness states and
  rights rules.
- All new reads/writes are tenant, owner, series/session, and media-owner
  scoped; retries are idempotent; audit data is redacted.

## Out of scope

Provider-specific Maps/Places adapters, automatic trusted-source retrieval,
team review assignment, custom profile builder, changes to global media
provider contracts, and deployment/production rollout execution.

## Implementation constraints

Use existing React/Tailwind/Radix conventions, tRPC router boundaries, Drizzle
schema/migration conventions, managed media authority, credit reservation and
reconciliation, and Vitest/jsdom/Playwright test conventions. Preserve
unrelated dirty work and do not rewrite the existing large wizard or router
outside the focused seams listed in the plan.
