# Deep-plan Interview Transcript

No new product interview was required. The user explicitly authorized
autonomous deep-plan followed by deep-implement and requested that no further
confirmation be required. The approved decisions are therefore taken from the
current `spec.md` and the preceding clarification history:

1. Use one canonical Series Profile picker covering fiction, documentary,
   location review, restaurant review, product review, software review, and
   hybrid docu-drama. Do not leave separate creator-facing format/look/evidence
   selectors that can contradict one another.
2. Keep the existing six wizard step IDs and position of the source step, but
   redirect non-fiction drafting through the Story Sources & Media readiness
   flow before composition.
3. Support unlimited custom slots at the UX level with server quotas,
   pagination, idempotency, and bounded AI payloads.
4. Support known-place metadata, marketplace product snapshots, user image or
   video uploads, generated references, per-slot descriptions, and B-roll
   usage without trusting provider URLs as media authority.
5. Preserve the existing Draft Quality QC/foundation gate and long-form story
   memory/relationship/closure/visual-grounding contracts. The Source Pack gate
   is additive.
6. Use a staged owner/tenant-bound Source Pack before the series exists, then
   atomically attach it through the existing `verticalDramaSeries.create`
   mutation. A retry must be idempotent.
7. Separate `draft_ready` from `production_ready`: permission-pending media can
   remain text-only with visible disclosure, but cannot render.
8. Treat current client-generated legacy draft IDs as recoverable job
   identifiers only. New Source Pack access requires a server-issued or
   cryptographically random server-claimed session.
9. Keep provider-specific Maps/Places adapters, trusted web fact retrieval,
   team review assignment, and custom profile builder out of this implementation
   wave; record them as deferred follow-ups.
