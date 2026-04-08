# Claude Interview - 070 Local / Client LLM Mode

Date: 2026-04-04
Mode: self_review
Spec: `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/spec.md`

## Interview note

The stakeholder response for the clarification step was: "ให้ llm ช่วยตัดสินใจแทน".

For this planning run, the planner therefore owns the remaining product-scope decisions and records them here as the authoritative interview output.

## Q1. Should browser v1 expose only summarization/preprocessing, or also a local general-chat path?

Decision:

- Browser v1 should include a local text path for:
  - summarization
  - context compaction
  - structured extraction
  - short general chat on supported devices
- Local general chat must remain explicit opt-in through Local AI settings.
- The default rollout must still behave like cloud-first because:
  - tenant default is off
  - user default is off
  - devices without capability must degrade safely

Rationale:

- Limiting browser v1 to preprocessing only would under-validate the main routing and badge architecture.
- Allowing only supported, opt-in, short-form general chat gives a meaningful end-to-end product path without making local execution the default behavior.

## Q2. Should desktop v1 ship only scaffolding, or real model download/install UX?

Decision:

- Desktop v1 should include a real on-demand download/install and removal flow for one curated local profile using the existing `apps/tauri-shell` surface.
- Desktop v1 should not prebundle large model assets by default.
- Desktop v1 should reuse the same routing and metadata rules as web wherever possible.

Rationale:

- A desktop phase that ships only routing scaffolding would not validate the device-local storage, consent, and cleanup contracts that are central to this feature.
- On-demand download preserves the compatibility-first principle and avoids silently inflating install size.

## Q3. Are truthful `Hybrid` and `Cloud` runtime badges enough for the first rollout?

Decision:

- Yes. Durable `Hybrid` and `Cloud` badges are sufficient for v1.
- Durable `Local` chat badges are deferred until SmartSpecPro has a true device-only request path where raw input does not traverse the backend first.

Rationale:

- The current chat architecture persists user messages server-side before assistant completion.
- Claiming `Local` under that architecture would be misleading for privacy and compliance.
- Shipping truthful labels first is better than shipping a stronger label that the system cannot prove.

## Q4. Which tenant/admin controls are required in v1?

Decision:

- V1 must include:
  - tenant kill switch: `localClientLlmMode`
  - force-cloud-only policy
  - curated allowlist of local model profiles
  - separate ability to disable local vision/OCR or document OCR provider usage
- V1 does not need a brand-new telemetry opt-out surface beyond existing analytics/privacy policy, but telemetry for this feature must remain minimal and policy-aligned.

Rationale:

- These controls are the minimum needed to roll out safely across heterogeneous tenant environments.
- Adding a new analytics-control product surface in the same phase would expand scope without reducing the core runtime risk as much as the controls above.
