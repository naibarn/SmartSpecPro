# Section 08 — Evaluation data and learning

## Goal

Improve routing using evidence without leaking content, poisoning labels or claiming unknown counterfactual outcomes.

## Implementation

1. Create versioned synthetic/consented golden datasets stratified by task, language, modality, risk and tenant policy.
2. Record data lineage, consent/purpose, sensitivity, ACL/source revision, recipient, redaction, retention, deletion and derivative tombstone for replay/shadow/evaluation/training artifacts.
3. Label selected-model observations separately from paired replay, evaluator estimate and unobserved counterfactual.
4. Add minimum effective sample sizes, outlier/poisoning controls, held-out slices and confidence intervals before any learned score can affect route ranking.
5. Keep classifier/semantic/learned route features advisory, bounded and off until pre-production gates pass.

## Tests first

- Consent missing/revoked, tenant deletion, purpose mismatch and derivative tombstone.
- Raw protected evidence excluded from second-provider evaluation.
- Unknown counterfactual remains unknown; no leakage between train/validation/test.
- Feedback poisoning and low-sample gate cannot activate learned selection.

## Acceptance

- No evaluation or learned route is active without data-lineage and consent proof.
- Deterministic baseline remains available if evaluation components fail.
