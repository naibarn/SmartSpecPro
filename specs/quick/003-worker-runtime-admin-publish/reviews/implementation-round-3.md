# Implementation review round 3 — storage and lifecycle

Status: PASS after fixes.

- Direct S3/R2 uploads use presigned PUT; local storage uses a disk-backed multipart fallback.
- Finalization streams the object to a temporary file, recomputes size and SHA-256, then validates the ZIP from the server side.
- Invalid archives, client hash mismatches, duplicate releases, and database failures remove the uploaded object; stream failures remove the temporary file.
- Published/download resolution excludes invalid and withdrawn rows and retains older rows for rollback.
- No runtime ZIP bytes are loaded into browser memory for hashing; upload progress is reported through XHR.
- Production client build and focused server tests passed after the lifecycle fixes.
