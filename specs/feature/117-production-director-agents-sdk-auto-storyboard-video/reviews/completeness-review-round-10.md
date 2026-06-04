# Completeness Review Round 10

Date: 2026-05-31
Scope: codebase-aware review for production-scale automation, campaign batches, brand/seller voice, spend anomaly control, and human review queues.

## Result

The plan remains feasible and is stronger for real production usage. Earlier rounds made a single storyboard/video run highly controlled. Round 10 closes the next scale risk: repeated generation from the same product or seller must not become duplicate ad spam, uncontrolled credit spend, brand-inconsistent output, or unreviewed high-risk publication.

## Findings Fixed

1. Campaign and batch automation needed explicit governance.
   - Added `CampaignGenerationGovernanceEnvelope`.
   - Added caps for active runs, daily variants, duplicate similarity, spend, rate-limit keys, anomaly signals, and scoped batch approval.
   - Added timeline/UI, QA, credit, rollout, and test gates for duplicate variation, same-product flood, abnormal repair spend, provider refusal spike, and policy-risk spike.

2. Brand/seller voice existed as general goal context but not as a first-class policy contract.
   - Added `BrandVoiceAndSellerPolicyEnvelope`.
   - Added tone/register, allowed/required/blocked phrases, competitor policy, claim/CTA style, pronunciation hints, evidence refs, and approval refs.
   - Clarified that brand guidance cannot override product truth, Thai/international ad policy, privacy, rights, disclosure, or evidence constraints.

3. Human review queue behavior was too implicit for high-risk or high-volume automation.
   - Added `HumanReviewQueuePolicy`.
   - Required review reason, approver role, scope, SLA, timeout action, decision refs, and exact artifact/policy snapshot scoping.
   - Added rules that expired, rejected, missing, or wrong-scope approvals cannot silently continue spending, rendering, or publication.

4. Spend anomaly and abuse controls needed to connect to credit, QA, UI, and rollout.
   - Added batch/campaign spend anomaly tests and credit behavior.
   - Added operator/rollout gates for queue age, approval/rejection rate, repair-request rate, timeout, and expired decision metrics.
   - Added finalization/library metadata refs so generated batch outputs remain auditable.

## Remaining Implementation Notes

- Start with conservative campaign caps and review-required mode until real completion/quality/cost data is available.
- Keep brand voice as style guidance only. It should make Thai copy more natural and consistent, not more legally aggressive.
- Human review approvals should be narrow by default: exact run, stage, artifact set, policy snapshot, output mode, export variant, and batch.
- Do not let campaign memory learn from blocked, rejected, misleading, visually wrong, privacy-risk, or policy-risk outputs as positive examples.

## Verdict

Ready for implementation planning. The spec now covers single-run completion, product fidelity, Thai/international ad safety, credit safety, privacy/rights/distribution governance, post-publish lifecycle, and production-scale batch/brand/review controls without reintroducing node canvas.
