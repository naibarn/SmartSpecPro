# Section 03: Planning Skill and Context Pack

## Goal

Use app skills and LLM context to generate a complete plan that matches SmartSpecPro capabilities.

## Requirements

- Production has a planning skill selector.
- Skills are discoverable by planning tags.
- Default skill is `media-production-storyboard-planner`.
- Build a structured `ProductionPlanningContextPack` containing:
  - brief,
  - context assets,
  - product storyboard assets,
  - product evidence,
  - `ProductClaimEvidenceMap` with claim text, claim type, evidence IDs, user approval state, and risk,
  - selected product image roles and fidelity risks,
  - Feature 115 readiness and `allowedNextActions`,
  - available tool/provider capabilities,
  - budget policy,
  - downstream target requirements,
  - previous canvas for revision.
- Planner output includes nodes and edges.
- Verifier checks the full canvas.

## Acceptance

- Planner receives all selected assets and capability context.
- Planner output validates against schema before rendering.
- Verifier can block approval based on missing assets, invalid edges, product truth risk, or provider infeasibility.
- Verifier can block approval when product image fidelity risk, SKU/variant mismatch, Feature 115 `needs_user_review` or `insufficient_evidence`, unresolved `ready_with_warnings`, or unsupported/product-image-mismatch/policy-sensitive claims would make the storyboard unsafe to generate.
