# Orchestra Plan

## Task
Fix HyperFrames Final Composite render that completes but omits storyboard MP4 footage.

## Classification
- scope: medium
- risk: medium
- affected_domains: backend HyperFrames composition builder, runtime replay evidence, focused tests
- estimated_file_count: 2-4
- chosen_route: direct-inline standard light bug route
- task_summary: Reproduce and fix completed HyperFrames output that renders only text/black background instead of composing the selected MP4 shots.
- bug_route: real job/runtime output investigation
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## Activation
- Orchestra auto-activated by repo AGENTS.md for code-aware bug fix.
- SocratiCode active: green index.

## Dirty Work
- Existing modified files are present in HyperFrames composition service/tests from the active fix; preserve unrelated user changes.
