# Interview Synthesis

No new blocking questions were asked because the user explicitly requested: "ทำ deep-plan ให้เลย".

This file records the requirements already clarified in the conversation.

## Stakeholder Decisions Captured

1. Feature 117 should be a new development spec and deep-plan package.
2. It must improve/replace the existing behavior, not create a parallel or shadow path.
3. All LLM calls must go through the existing SmartSpecPro LLM gateway.
4. No new direct OpenAI, direct provider, browser-local, extension-local, or side-channel LLM path may be added.
5. Platform credit deduction must be correct, secure, idempotent, and auditable.
6. Marketplace Capture product detail must be covered, including auto storyboard and auto video creation from a selected product.
7. The system should use LLM intelligence to imagine new creative review-video concepts repeatedly from the same product.
8. Automation should run mostly without the user, make decisions automatically, and finish long workflows reliably.
9. Each stage must be carefully checked before advancing.
10. Product truth must stay strict. The system must not invent product specs, claims, properties, or unsupported details.
11. Product images must not be visually altered away from the source references.
12. Generated people must not have identity/face drift across shots.
13. Back-facing people should not later turn around with a different face.
14. Story continuity must hold across shots.
15. Audio must be continuous and natural, with no awkward gaps or silent tails.
16. Speech should sound natural, with strong hook and clear structure.
17. Advertising content must avoid broad international ad-policy violations.
18. Thai advertising law/policy must be included.
19. Visual warning/disclosure text in advertisements must be supported and checked.
20. Node canvas is not part of this feature and should move to a future independent topic.
21. Current codebase has evolved beyond the older node-canvas assumption, so the plan must be checked against current code.
22. Feature 118 is implemented and should be treated as baseline behavior that Feature 117 can improve.
23. Status should be timeline-visible so users and operators can see what is complete, current, blocked, in recovery, or remaining.
24. Generated ads must not leak marketplace/customer/reviewer/account/order/cart/chat/private seller data.
25. Music, sound effects, voices, and uploaded audio references need rights/provenance before final video.
26. The final output should be checked against the intended platform/export destination, not treated as one-size-fits-all media.
27. Creative memory should improve future concept variety without leaking tenant data or learning from failed/non-compliant outputs.
28. Synthetic/AI-generated media disclosure decisions should be preserved for final assets and future publishing.
29. CTA and affiliate/source links must not be broken, unsafe, wrong-product, wrong-variant, or based on expired offers.
30. QA quality must be calibrated so low-confidence or drifted automation is spot-checked before broad use.
31. Finished Library assets need reuse/takedown/recheck governance when rights, evidence, offers, or policy change.
32. Repeated or batch generation from the same product must avoid duplicate/spam-like concepts and uncontrolled credit spend.
33. Brand/seller voice should improve tone and consistency, but must never override product truth, ad policy, rights, privacy, disclosure, evidence, or the evidence instruction firewall.
34. High-risk or high-volume automation needs a clear human review queue with roles, SLA, approval scope, timeout behavior, and repair/rejection outcomes.
35. Final outputs should include platform-ready thumbnail/cover, caption/description, hashtags, transcript/subtitles, manifest, and checksums when the selected destination requires them.
36. If product evidence, selected variant, images, price/offer, rights, policy, destination profile, CTA, warning text, or user-edited script changes while a run is active, the system should preserve safe work and redo only affected work.
37. If a start frame, stop frame, storyboard cell, thumbnail, or clip keyframe fails product/character/quality vision QA, the system should immediately repair only that exact shot/frame/clip through gateway-routed vision QA and targeted regeneration.
38. Product image references should be vetted into an approved reference pack before paid visual generation or repair, so low-quality/wrong-variant/unhosted/rights-blocked images do not cause product mutation or wasted credits.
39. Advertising policy, especially Thailand/platform policy, should be encoded as versioned approved rule packs instead of living only in prompts, so compliance outcomes can be audited and replayed.
40. Stage completion should require durable evidence, not only a status update, provider callback success, or agent text response.
41. SDK tool, handoff, hosted capability, session, trace, and output-schema permissions should be locked by Node per stage attempt so Python cannot widen automation authority during a run.
42. One-click automation still needs a durable creative brief snapshot so the system does not infer audience, CTA, style, quality/speed tradeoff, or claim intent silently from the product alone.
43. Recurring presenters, hand models, synthetic characters, and voices need approved identity asset packs with consent, allowed shot/voice scope, and fallback rules before provider spend.

## Inferred Product Priorities

Priority order:

1. end-to-end completion reliability,
2. product fidelity and product-truth safety,
3. credit and gateway safety,
4. creative freshness,
5. natural Thai script/audio,
6. ad compliance including Thailand,
7. low user burden,
8. speed.
9. production hardening for callbacks, storage, retry/DLQ, and rollout visibility.
10. privacy, evidence-instruction safety, rights, and distribution-fit for publishable ads.
11. post-render governance for disclosure, CTA, QA calibration, and safe reuse.
12. safe high-volume generation with campaign governance, brand policy, spend anomaly detection, and review queues.
13. platform-ready packaging so the finished video is usable without manual metadata/thumbnail/subtitle cleanup.
14. input-change handling that avoids both stale approvals and unnecessary regeneration.
15. exact-unit repair for failed frames/clips so visual QA does not force full-run regeneration.
16. product reference pack readiness before visual generation, thumbnailing, and repair.
17. advertising policy rule-pack versioning for Thai/global/platform compliance.
18. stage completion evidence that prevents false-success advancement.
19. SDK capability manifests that prevent unapproved tool/handoff/session/trace/hosted-capability expansion.
20. production creative brief snapshots that make user intent, safe defaults, and changed-brief invalidation explicit.
21. character identity asset packs that prevent unsafe face reveal, person swap, lip-sync drift, native-audio identity drift, or unapproved real-person imitation.

Speed matters, but should not bypass QA. The preferred model is fast automation with targeted repair loops, not blind generation.

## Open Assumptions For Implementation

- Tenant/user policy can define auto-spend limits.
- Some regulated categories may require user/legal approval before generation.
- Product evidence can include Marketplace Capture data, product images, user-approved product facts, and prior Feature 115 handoff insights when already present.
- Current Storyboard Review, Video Editor, render, and Media Library surfaces should remain downstream outputs.
- The first deliverable should be storyboard-only because it tests Agents concepting, product truth, and visual QA before expensive full-video work.
