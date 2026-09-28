# Single-candidate portrait rendering

## Problem

The character casting preview already stores several portrait candidates, but
the UI can submit only the complete batch. A creator who wants to test one face
must spend render credits on every candidate.

## Decision

Extend the existing `generatePortraitCandidateBatch` contract with an optional
`candidateId`. Without it, the current atomic all-candidates behavior remains.
With it, the server reads and claims only the selected previewed row, reserves
one image-render charge, and sends one media task. Prompt generation is never
repeated because candidate prompts were authored during preview.

The UI adds `สร้างภาพนี้` / `Generate this image` to each active previewed card.
The existing `สร้างทั้ง N ภาพ` / `Generate all N images` action remains visible
only while the complete batch is still previewed; after a single candidate is
submitted, the remaining cards use their individual buttons. Existing polling,
retry, cancel, selection, ownership, transport, and refund paths are reused.

## Failure and safety behavior

- The single-candidate claim is transactional and accepts only an unexpired
  `previewed` row belonging to the active tenant/user/character/batch.
- A failed provider submission marks only that candidate failed and refunds only
  its reserved image charge.
- A client submit error rolls that candidate back to `previewed`; other cards
  remain unchanged.
- The prompt LLM credit is already settled by preview and is not charged again.

## Verification

Run focused TypeScript and Vertical Drama tests, then `git diff --check`.
No image provider call, database mutation, build, or service restart is used in
the design review itself.
