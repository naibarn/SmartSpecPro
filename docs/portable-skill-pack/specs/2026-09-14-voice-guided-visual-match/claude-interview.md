# Interview Transcript

No additional interview was required after the user's explicit approval. The approved decisions are recorded here so implementation does not reinterpret them:

- Transcribe the selected voice track with the existing HyperFrames transcriber before matching visuals.
- Preserve sentence/word timing and map source-media time into project timeline time.
- Analyze each candidate image through the server's authorized vision/skill boundary.
- Match image meaning to the spoken segment content.
- Automatically propose/reorder only when confidence is high and the global improvement is material.
- Always show a preview before applying any automatic reorder or duration change.
- Keep original order as a safe fallback for low confidence, missing analysis, unsupported assets, or ambiguous timing.
- Applying the plan must not mutate the voice track or existing subtitle text/timing.
- The feature is allowed to proceed without another confirmation round.
