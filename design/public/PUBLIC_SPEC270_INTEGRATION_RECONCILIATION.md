# Spec 270 integration reconciliation for Spec 263 public UI

**Checked against:** Spec 270 R1.4, its G0 record, workspace lockfile and candidate source.
**Candidate base:** `a7108aeb9fc05a7baa2d6b14e7bfa40f675a0514`.
**State:** Repository-local public implementation guidance exists; Spec 270 native design-runtime authority is not closed by it.

| Integration artifact | Reference | State |
|---|---|---|
| `PUBLIC_SPEC270_INTEGRATION_RECONCILIATION` | This file | Candidate source reconciliation; not an approved Spec 270 record |
| `PUBLIC_WEBSITE_DESIGN_CONTEXT` | `SMARTAIHUB_PUBLIC_DESIGN.md` | Present; candidate |
| `PUBLIC_DESIGN_BRIEF_REF` | `SMARTAIHUB_PUBLIC_DESIGN.md` + `PUBLIC_DESIGN_DECISION_LOG.md` | Present; no external approver recorded |
| `PUBLIC_CANONICAL_DESIGN_ARTIFACT_REF` | `PUBLIC_DESIGN_PACKAGE.json` | Source package digest only; **not** a native Spec 270 artifact/version |
| `PUBLIC_DESIGN_SYSTEM_SNAPSHOT_REF` | `PUBLIC_COMPONENT_REGISTRY.json`, workspace `pnpm-lock.yaml` | Installed Astryx 0.6.3 mapping; no approved SmartAIHub catalog snapshot ID/owner |
| `PUBLIC_COMPONENT_RESOLUTION_EVIDENCE` | `PUBLIC_COMPONENT_REGISTRY.json`, `apps/web/client/src/components/publicUi/publicPrimitives.tsx` | Source component mapping; no Spec 270 resolver record |
| `PUBLIC_DESIGN_DECISION_LOG` | `PUBLIC_DESIGN_DECISION_LOG.md` | Present; source-owned decisions |
| `PUBLIC_SEMANTIC_DESIGN_DIFF` | `PUBLIC_SEMANTIC_DESIGN_DIFF.md` | Present; candidate-only comparison |
| `PUBLIC_VISUAL_VERIFICATION_EVIDENCE` | Task `evidence/browser-local-candidate.json` and `verified-candidate-home-*` captures | Local Vite, mocked API; not production / not Spec 270 visual-verification record |
| `PUBLIC_EXTERNAL_PROVIDER_CLEANUP_EVIDENCE` | This row + Spec 270 G0 record | No provider used in public UI; external design provider remains uncertified and disabled, so no provider cleanup operation was run |

The public UI relies on the installed Astryx package and does not import or enable the Spec 270 native authoring/provider runtime. The candidate `defineTheme` uses Astryx runtime style injection. The installed Astryx CLI `theme build` command failed to load `defineTheme` in this worktree/host setup on both documented import forms; this is recorded as a performance/tooling limitation, not a successful prebuilt-theme output.

Spec 270 remains gated by its documented durable artifact owner and recovery/retention contract, callable Spec 224/256 authority, SmartAIHub catalog publication/digest owner, and provider certification/credential/egress decisions. No schema, provider, credential, or feature-flag behavior was changed here.
