# Gap Review v4 — 8 Additional Rounds

Date: 2026-09-01  
Scope: Re-audit of `SKILL.md`, agent architecture, schemas, runtime contracts, product-category coverage and tests after v3.

## Round 1 — Workflow dependency audit

### Gap found
v3 said Idea Expansion should use Start Frame evidence, but detailed Start Frame analysis occurred later in the flow.

### Fix
Added `Early Start-Frame Semantic Analysis` before Idea Expansion.
Kept the later detailed `VisualAnalyzerAgent` pass for exact t=0 physical locks.

### Result
Creative expansion now has cast/scene/product context early without conflating semantic planning with exact motion-state extraction.

---

## Round 2 — Product-function and correct-use coverage audit

### Gap found
`Product Affordance` described what could be done to a product, but not:
- target surface/system,
- product functional chain,
- internal motion,
- correct-use order,
- hidden/invisible mechanisms,
- proof moments.

This was insufficient for floor cleaners, washing machines, vacuums, HVAC and machinery.

### Fix
Added:
- `schemas/stages/product-mechanism.schema.json`
- ProductSemanticsAgent
- ProductMechanismAgent
- DemonstrationPlannerAgent
- `config/product-function-taxonomy.json`
- correct-use / proof / mechanism fields.

### Result
The Skill can represent usage-based and mechanism-based products rather than only handling/display products.

---

## Round 3 — Invisible mechanism / VFX / virtual-screen audit

### Gap found
v3 had no first-class plan for:
- airflow,
- temperature visualization,
- suction/particle paths,
- dirt-lift explanation,
- washing-machine cutaway,
- exact phone UI,
- virtual screens,
- VFX vs generative base plate separation.

### Fix
Added:
- `schemas/stages/visualization-plan.schema.json`
- VisualExplanationAgent
- `config/visualization-patterns.json`
- truth modes: literal / supported explanatory / stylized illustrative
- render-stage decision: video, keyframe, post composite, hybrid
- exact UI/text post-compositing guidance.

### Result
The Skill can explain mechanisms visually without forcing the video generator to hallucinate exact UI/text or invisible processes.

---

## Round 4 — Truthfulness / product-claim audit

### Gap found
A visually attractive explanatory effect could accidentally imply:
- unsupported performance,
- an internal mechanism the product does not use,
- measured airflow/temperature,
- nonexistent phone UI/feature,
- exaggerated cleaning efficacy.

### Fix
Added:
- evidence binding and confidence,
- `truthStatus` in functional chain,
- `truthMode` in visualization plan,
- feature-visualization evidence policy,
- unsupported-feature QC failure,
- explicit rule that category conventions are provisional, not product-specific claims.

### Result
Visual explanation is now constrained by product truth and not treated as free-form creative VFX.

---

## Round 5 — Agent architecture / generation split audit

### Gap found
GenerationStrategist previously focused on provider/model routing, but production reliability also requires deciding:
- what belongs in the generated base plate,
- what belongs in keyframes,
- what belongs in VFX/UI post composite.

### Fix
Added:
- DemonstrationPlannerAgent
- VisualExplanationAgent
- base-plate vs overlay strategy fields
- post graphics plan
- exact screen/text fidelity flag
- compositor-aware generation strategy.

### Result
The workflow is closer to a real advertising pipeline rather than a single generative-video call.

---

## Round 6 — QC, repair and regression coverage audit

### Gap found
QC did not explicitly score:
- correct product usage,
- mechanism truthfulness,
- effect alignment,
- screen/UI fidelity.

Tests also lacked major non-cosmetic product categories.

### Fix
Added QC dimensions:
- usageCorrectness
- mechanismTruthfulness
- visualizationAlignment
- screenUiFidelity

Added repair classes:
- PRODUCT_USAGE_ERROR
- SURFACE_INTERACTION_FAILURE
- DEMONSTRATION_SEQUENCE_FAILURE
- MECHANISM_VISUALIZATION_FAILURE
- VFX_COMPOSITE_FAILURE
- SCREEN_UI_FAILURE
- UNSUPPORTED_FEATURE_VISUALIZATION

Added fixtures:
- floor cleaner
- washing machine
- air conditioner
- smartphone virtual screen
- vacuum cleaner

Added stage fixtures for product mechanisms and visualization plans.

### Result
The package now tests a broader family of physical, mechanical, invisible-effect and digital-display product behaviors.

---

# Remaining deliberate boundaries

The Skill is substantially broader, but it intentionally does not promise universal factual knowledge.

For an unknown or named product:
- exact mechanism/usage must come from user facts, source-of-truth assets or verified research;
- category convention may bootstrap planning but cannot become an unsupported product-specific claim;
- regulated/safety-critical categories may require human/business approval.

This is a design boundary, not a gap.


---

## Round 7 — Start-state / comparison integrity audit

### Gaps found
- A generic demonstration arc could repeat setup steps already completed in the Start Frame.
- Before/after effects could become misleading if camera/lighting conditions changed.
- Exact cutaways could falsely imply knowledge of internal construction.

### Fixes
- Added `preCompletedSteps` and state-aware demonstration continuation.
- Added comparison-integrity metadata and matched-camera/lighting/framing rules.
- Required verified geometry for exact cutaways; otherwise use clearly schematic explanation.

### Result
Demonstration logic now continues from actual state and proof visuals have stronger advertising truth controls.

---

## Round 8 — Agent cost/latency architecture audit

### Gap found
The logical architecture listed many specialists and could be misimplemented as 20+ sequential model calls, increasing cost and latency without improving every project.

### Fix
Added `agentExecutionProfile` (`fast`, `balanced`, `production`) and explicitly separated logical responsibility boundaries from runtime call count. All profiles must emit the same stage contracts and preserve deterministic gates.

### Result
The architecture is now scalable from ordinary social ads to high-risk production campaigns without changing the public Skill contract.
