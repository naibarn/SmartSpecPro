# Decision log

## Planning depth

**Promote-equivalent cross-domain plan.** Worker App, runtime packaging, storage publication, media contracts and final render are a separate execution boundary from Feature 168 Web. This spec is independently implementable but consumes the shared versioned payloads defined by Feature 168 §5.

## Decisions

1. Transcribe original footage before cuts; map transcript into prepared time afterward.
2. Use bundled/pinned HyperFrames CLI or equivalent direct whisper invocation; never npm auto-install during a job.
3. Middle silence becomes an approved multi-segment plan, not an automatic destructive deletion.
4. Worker publishes only QC-approved derived artifacts; source stays immutable.
5. Worker reports usage/results; Server owns credit ledger and authorization.
6. Final B-roll render must use an explicitly supported executor, never an unclassified `video_assembly` job.
