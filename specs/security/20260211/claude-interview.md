# Claude Interview Transcript

Interview mode: asynchronous planning interview from spec + repo context.

## Q1. What behavior is non-negotiable after hardening?
**Answer:** External `https://` image URLs must keep working in Document Management preview, markdown image rendering, and media/library thumbnail usage.

## Q2. Should security changes prioritize blocking active-content uploads even if file upload capability remains broad?
**Answer:** Yes. Active content (for example HTML/SVG execution paths) should be neutralized for inline execution while keeping practical upload workflows.

## Q3. How strict should URL handling be for library fields (`sourceUrl`, `thumbnailUrl`)?
**Answer:** Introduce server-side URL policy enforcement. Allow relative `/uploads/...` and external `https://...`, block dangerous schemes and malformed URLs.

## Q4. How should missing tenant context be treated in allowlist mode?
**Answer:** Deny-by-default when tenant context is missing and allowlist mode is enabled.

## Q5. Should ops endpoints (summary/retry/reprocess) be tenant-aware?
**Answer:** Yes. Tenant-admin flows must be tenant-scoped. Global operation should require explicit elevated role/path.

## Q6. What is acceptable for office-file preview behavior?
**Answer:** Keep preview when safe, but prevent forwarding private/internal/local URLs to external viewers.

## Q7. What testing outcome is expected?
**Answer:** Security suite must include both:
- Positive regressions (external `https` image still works)
- Negative security checks (unsafe schemes, active-content vectors, missing-tenant allowlist, tenant-scoped ops)

## Q8. Are there rollout constraints?
**Answer:** Prefer incremental hardening that avoids UI regressions and preserves existing user-facing flows.

## Assumptions Logged
- No additional stakeholder input beyond `spec.md` was provided during this interview round.
- This transcript captures implementation assumptions inferred from the spec and current code behavior.
