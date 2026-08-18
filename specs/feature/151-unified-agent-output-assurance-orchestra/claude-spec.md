# Synthesized implementation specification

Feature 151 introduces one reusable assurance runtime around the existing Node/Python Agent Runtime. A request is admitted as a versioned `AgentTaskContract`, normalized into an Orchestra plan, composed by OpenAI Agents SDK agents/tools, checked by deterministic and risk-based verifiers, repaired only within an explicit budget, and finally either returned as a verified result or blocked with actionable evidence. The platform, not an agent, owns tenant authorization, credits, provider submission, idempotency, and side-effect tokens.

The implementation must be additive to the current runtime contract. It adds assurance metadata (contract hash, task kind, rule-pack references, evidence policy, provider profile, budget, repair count, side-effect authorization) to the existing request/response envelopes and mirrors it in Python. Canonical JSON hashing is deterministic and cross-language. Node rejects stale or mismatched hashes; Python echoes the hash and fails closed on mismatch.

The first executable slice covers four reusable gates: evidence quality, provider capability/length, deterministic output contract, and side-effect authorization. It includes a generic `AssuranceRunResult`, findings/defect taxonomy, bounded repair and provider-unknown reconciliation states. It must support Kie/Grok's 4096-character prompt limit without silent truncation, custom character-description precedence, explicit speaker cues, and future scene-mode rule packs.

The Orchestra planner selects only signed, tenant-compatible manifests from the existing skill catalog. The Manager plans; Runner executes; specialist agents are tools or handoffs; verifiers are deterministic services and bounded reviewers. No agent may publish, reserve credits, submit to a provider, or mutate connectors directly.

Agency Swarm becomes migration-only immediately. A reconciliation worker exports historical state, checksums artifacts and credit outcomes, and is idempotent. Active runtime requests with an Agency origin are rejected. Package and active references are removed only after zero-usage, parity, credit-reconciliation, and read-only retention gates pass.

The implementation is complete only when contract parity, adversarial input, replay/idempotency, budget, provider boundary, evidence ambiguity, future scene-mode fixtures, Agency freeze/migration, and focused UI/API/runtime tests pass. Browser/provider/deployment checks are release-stage gates and must be reported separately.
