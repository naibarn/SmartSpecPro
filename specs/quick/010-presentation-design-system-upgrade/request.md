## Task Summary

Define a stronger solution for the Presentation editor and Draft with AI system so slide output quality is meaningfully higher than the current primitive/template model.

## User Requirements

1. Block/library items need visual previews before insert.
2. Built-in designs must be much more varied, including blocks that already contain replaceable image regions.
3. Users should be able to create their own reusable blocks and save them like templates.
4. Typography choices need far more variety and better control.
5. Media should support crop/mask shapes such as circle, ellipse, star, and other frames.
6. Draft with AI should generate more diverse layouts than the current left/right/top/center image template family.
7. The solution should support infographic, poster, promo, profile, and editorial-style slides like the provided examples.

## Constraints

- Keep editor/play/export parity.
- Avoid multiplying one-off element types without a stronger system underneath.
- Fit the current SmartSpecPro presentation architecture.

## Locked Architecture Decisions

1. `componentInstance` is a first-class schema inside the product.
   - Primitive flattening is reserved for export paths and compatibility fallback only.
2. User-authored block previews use a hybrid pipeline.
   - Client renders fast local previews during editing.
   - Server renders canonical previews for caching, sharing, and publish consistency.
3. Typography packs in v1 use an allowlisted font catalog.
   - The interface must still be designed with future `fontSource` / tenant font support in mind.
4. Canonical preview artifacts live in object storage, while preview metadata and indexes live in the database.
   - Cache/CDN is a fast-read layer only, not the source of truth.
   - Preview rendering should run through a stateless preview service.
5. Built-in component definitions use monotonic revision integers for runtime versioning and invalidation.
6. Preview hash and lifecycle rules must be explicit in v1.
   - Hash inputs include content, definition revision, renderer version, font catalog version, theme/token version, and output target.
   - Preview lifecycle defines sync vs async generation, staleness, retention, and when client preview may temporarily stand in for canonical preview.

## Non-Goals

- This artifact does not implement the full system yet.
- This artifact is not limited to the small `Blocks` slice already implemented in quick plan 009.
