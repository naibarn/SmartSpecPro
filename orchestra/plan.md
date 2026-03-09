# Orchestra Plan

## Task
Investigate in detail why Presentation Edit shows divergent text across slide content, slide notes, and presentation note for AI-generated presentations.

## Classification
- scope: medium
- risk: medium
- affected_domains: backend AI generation, backend presentation persistence, frontend presentation editor, shared presentation contracts
- estimated_file_count: 8
- chosen_route: multi-agent-waves
- task_summary: trace the AI draft and editor data flow to explain exactly where slide text, slide note, and presentation note diverge
- bug_route: true

## Intent Signals
- Explicit orchestra invocation by skill name
- Bug/error investigation request
- Cross-domain request covering AI draft generation, persistence, and editor rendering
- Requires analysis before any safe code change

## Task Classification
- Scope: medium
- Risk: medium
- Affected domains: CMD-2 Backend, CMD-1 Frontend, shared presentation contracts
- Estimated file count: 8
- Chosen route: multi-agent-waves
- Bug route: true
- Classification notes: The problem is a known feature-area bug with unclear root cause across multiple flows. It spans AI generation, persistence, and editor state, but does not currently indicate auth or destructive data risk.

## Wave Plan
- Wave 1: Trace backend AI draft flow for article -> presentation note -> slide plan -> slide note -> slide content transformations
- Wave 2: Trace frontend/editor load-save-display flow for deck note and slide note, then compare against backend expectations
- Wave 3: Integrate findings into a root-cause report with concrete file/line references and recommended remediation options
