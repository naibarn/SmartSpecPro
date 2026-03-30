# Interview Notes

No live stakeholder interview was required to resolve blocking product questions. The plan below uses the spec's explicit decisions and the repo's existing patterns.

## Assumptions Used for Planning

1. Upload-Post remains tenant opt-in and fail-closed behind `UPLOAD_POST_GATEWAY_ENABLED`.
2. Phase 1 and Phase 2 rely on polling plus background sweeps instead of webhook ingestion.
3. Upload-Post usage is treated as covered by the user's Upload-Post subscription for this plan; SmartSpecPro credit charging is deferred.
4. Profile management is explicit in the UI, with connection validation before storage, rather than auto-creating hidden profiles.
5. Workflow and agency execution should resolve the Upload-Post connection from the workflow owner's `userId`, not the triggering session user.
6. The Node.js layer validates media URLs but never fetches user-supplied media URLs itself; Upload-Post performs the upstream retrieval.
7. First-use disclosure acknowledgement and tenant opt-in state are persisted before any Upload-Post connection or publish action is allowed.

## Open Questions Deferred

- Whether webhook ingestion should replace polling in a later phase.
- Whether SmartSpecPro should add its own quota/billing layer on top of Upload-Post.
- Whether tenant-admin shared API keys should ever be allowed.
