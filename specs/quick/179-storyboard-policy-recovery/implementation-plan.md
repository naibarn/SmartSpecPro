# Implementation Plan

## Objective

Make policy-repairable storyboard generation converge inside the same async run and retain enough evidence to resume or diagnose an exhausted run without repeating accepted upstream work.

## Approach

1. Add a deterministic projection containing only story-bearing per-shot fields for safety analysis.
2. Replace the single fresh rewrite with a bounded candidate-aware repair loop. Each prompt receives the previous candidate via existing `repairContext` and exact structured findings.
3. Attach the last candidate, findings, and attempt count to the exhausted safety error.
4. Teach the async pipeline failure branch to write that structured recovery state into the run artifact while leaving the episode storyboard unchanged.
5. Add focused unit tests for false positives, convergence, exhaustion, artifact persistence, and credit timing.

## Acceptance criteria

- Safe shots are not blocked by large duplicated handoff metadata.
- Repairs use the immediately preceding candidate and preserve unrelated content by contract.
- Up to three policy repair candidates are attempted in one run.
- One successful run produces one credit deduction; exhausted recovery produces none.
- Exhausted failure artifacts retain candidate and findings; unsafe output is not activated.
