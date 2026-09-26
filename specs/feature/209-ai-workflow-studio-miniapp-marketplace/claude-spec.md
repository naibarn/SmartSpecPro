# Spec 209 Synthesized Specification

## Goal

Deliver a real Workflow Studio product layer over the canonical Job/runtime/
economic boundaries: AI-first creation, inspectable top-down graph, nested
subflows and typed data binding, durable run/debug projection, schema-driven
Mini App inputs/results, versioning and safe publication.

## Critical first slice

1. Workflow definition/version/schema contracts and authenticated persistence.
2. AI Builder plan preview with execution-option readiness and diff/accept.
3. Mockup-aligned Builder canvas, right inspector and bottom run/debug drawer.
4. Subflow drill-down and typed source binding.
5. Separate Run/Mini App surface with real Job state/artifacts/cost states.
6. Publication/Marketplace ACL and immutable version references.

## Boundaries

Feature 195 owns execution truth; Feature 196 owns goal/plan semantics; 197,
199, 200, 206, 207, 208 and 210 own their respective capabilities. Spec 209
must not create another queue, workflow engine, direct provider path, wallet or
retired `/workflows` caller.

