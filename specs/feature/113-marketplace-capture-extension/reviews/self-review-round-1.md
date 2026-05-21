# Self Review Round 1

## Verdict

Plan is implementable and aligned with the current SmartSpecPro codebase. It correctly avoids the existing `/marketplace` namespace, keeps auth changes feature-local, uses REST for multipart uploads, and makes extension pre-upload review a first-class requirement.

## Issues Found And Resolved

1. High-risk auth blast radius
   - Risk: modifying `authorizeRequest` directly could affect many existing server routes.
   - Resolution in plan: create feature-local extension auth wrapper that calls existing auth/token utilities and validates marketplace-specific origin/scope/token metadata.

2. Upload security needed stronger acceptance
   - Risk: extension-sent files can be spoofed or active content.
   - Resolution in plan: Section 04 and Section 11 explicitly require extension/type/magic byte/dimension/active-content tests.

3. LLM could become a write path
   - Risk: analyze endpoint accidentally mutates durable product rows.
   - Resolution in plan: Section 05 states analyze updates capture draft only; confirm in Section 06 is the only product write.

4. Existing route collision
   - Risk: using `marketplace` would collide with skill marketplace.
   - Resolution in plan: all naming is `marketplaceCapture` and `/marketplace-capture`.

5. User's latest requirement about extension-side review
   - Risk: old flow uploaded all evidence first and reviewed only in web UI.
   - Resolution in plan: Section 10 requires `PreUploadReviewPanel` and upload only selected/edited evidence.

## Residual Risks

- Chrome Web Store approval may require tightened user-facing disclosures and possibly fewer host permissions.
- Shopee DOM changes can break heuristics; fixture and manual QA coverage must be maintained.
- Remote image mirroring should remain disabled until CDN allowlist and SSRF tests are in place.

