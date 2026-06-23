## Task Classification
- Scope: large
- Risk: high
- Affected domains: Worker App Rust/Tauri, Worker App React UI, worker runtime/control-plane contracts, runtime packaging/readiness
- Estimated file count: 10+
- Chosen route: direct-inline-waves (standard light mode)
- Bug route: false
- Classification notes: User approved completing the previously identified worker-app readiness gaps. Work touches token handling, background execution, runtime readiness, Windows behavior, and tests.
- Activation: orchestra auto-activated from Thai end-to-end implementation request; brainstorming approval is satisfied by the user's "ทำต่อตามที่แนะนำ" after the prior design/assessment.

## Addendum: Marketplace Auto Storyboard Review Plan Spinner
- Scope: small
- Risk: low
- Affected domains: Marketplace Capture Product Detail UI and Auto Storyboard Review plan summary component
- Estimated file count: 3
- Chosen route: direct-edit (standard light mode)
- Bug route: true
- Classification notes: Thai bug report for a stuck Marketplace Capture Auto Storyboard Review loading state. SocratiCode was green and used first to locate the Marketplace Auto Review plan surface and related component files.
- Activation: orchestra auto-activated from a repository debugging request per AGENTS.md.

## Evidence Ledger
- source: code inspection + focused component test
- identifier: `autoStoryboardPlanRefreshingForOverrides` and `AutoStoryboardReviewPlanSummary`
- observed failure: UI showed "กำลังอัปเดตแผน Auto" while `getAutoStoryboardReviewPlan` was merely background-fetching with overrides active, which disabled the primary action and gave no visible explanation.
- data state: no runtime run id was provided; local code path confirmed the false updating condition and component test covered the visible updating copy.
- confidence: medium-high
- next evidence needed: a live browser reproduction would raise confidence to high, but the direct state condition was isolated in code.
