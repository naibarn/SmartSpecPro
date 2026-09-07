# Section 12 — Voice Training, Evaluation and Promotion

Dependencies: 01, 04, 08, 09, 11. Read ../contracts-v2.md and ../voice-lifecycle-v2.md.

Implement voice-lifecycle-v2.md sections 5–7. Ownership: proposed training services/recipes and Worker training adapter, dataset/evaluation UI; section 01 owns shared schema/migration edits. Reuse durable jobs, GPU lease and existing credit ledger. Local/cloud training targets are explicit; unavailable official API returns TRAINING_UNAVAILABLE.

Implement dataset draft/freeze, training consent, recipe allowlist/limits, preflight, durable checkpoint/resume, actual held-out evaluation, approval and versioned trained_voice binding. Initial candidate is a pinned verified VoxCPM LoRA recipe. Do not promise SFT/all-provider training. No arbitrary code/checkpoint loading.

TDD first: dataset split leakage, missing training rights, wrong base revision, budget cap, revoked dataset, interrupted checkpoint, remote unknown outcome, failed evaluation, rollback and transitive revocation. UI distinguishes training completion from approved model and shows actual usage/blocked reasons. Default tests never run training.

Exit: Release D proof includes genuine checkpoint, baseline comparison, approved binding, inference, rollback and cancellation under exact hardware/recipe. Missing runtime access is blocked D proof, not a successful simulated training release.

## Convergence audit requirements

Apply lifecycle sections 8–10 and contracts recovery clarifications; they refine earlier general wording. Use VoiceOwnerScope for profiles/datasets, AudioScope for executions. Include applicable C5-01 through C5-07 regression cases in ../claude-plan-tdd.md. Release reporting distinguishes core A+B, optional providers C and training D.
