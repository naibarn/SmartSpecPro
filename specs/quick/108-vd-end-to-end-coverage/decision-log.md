# Decision log

## Planning depth

- Chosen depth: `standard` quick-plan.
- Reason: the requested fix crosses UI, tRPC routers, media-asset ownership, episode pipeline, provider routing, QC, and tests, but the audit already narrowed the architecture and no new provider or schema redesign is required.
- Promotion trigger: promote to full deep-plan if implementation discovers that final assembly requires a new durable QC state/schema, a paid-provider callback contract, or a cross-service migration beyond the existing JSON contracts.

## Decisions

1. **Resolve references at render time, not by duplicating URLs in series JSON.** Keep `referenceAssetIds` authoritative and resolve to owned durable URLs at the image/video boundary.
2. **Fail closed on requested special-edition uploads.** If an uploaded reference cannot be registered or later resolved, do not silently create/use a special edition that claims the image lock. Return an actionable repair message and emit an audit event.
3. **Use one shared episode production-QC gate.** Start-frame render, video render, and final assembly must call the same policy resolver. Tie-in QC remains an additional constraint, not a second unrelated implementation.
4. **Do not make dry-run/plan-only pretend to have visual QC.** Structural/provider-routing QC may be recorded, but unavailable artifact QC must remain `unavailable` and cannot be reported as passed.
5. **Preserve legacy data but require explicit compatibility semantics.** Existing episodes/series can be grandfathered; new Wizard-created series and new paid generation must use the authoritative gate. Direct API callers either submit the same QC receipt or receive a precondition error.
6. **Keep feature-flag rollout.** Add or reuse a dedicated episode production-QC gate flag so deployment can observe failures before enabling the hard gate tenant-wide.
7. **Bind every QC result to a content revision.** The revision must cover the artifact inputs that the next irreversible step consumes, not only the script/storyboard text.
8. **Do not silently distinguish modern and legacy callers.** Use an explicit server-recognized workflow/contract marker for new Wizard/direct production requests; legacy bypasses must be named, audited, and time-bounded.
9. **Treat asset registration as a lifecycle.** Stage requested uploads, validate/resolve all of them, then commit the series reference set; clean up staged assets on abort or record an auditable orphan-recovery task.
10. **Make asynchronous story generation observable.** Shell creation, story generation admission, generation completion, QC readiness, and failure/retry are separate durable states.

## Security boundaries

- Every media-asset lookup must include both `tenantId` and `userId` and exclude expired assets.
- Client-supplied `referenceAssetIds` must never be persisted verbatim without ownership validation.
- QC receipts, candidate fingerprints, and gate decisions remain owner-scoped and idempotent.
- Provider-bound URLs must be fetchable by the provider and must not expose private storage keys; use the existing signed/public URL boundary.
