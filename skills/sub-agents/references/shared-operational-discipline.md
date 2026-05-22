# Shared Operational Discipline for Orchestra Sub-Agents

These rules apply to every sub-agent role dispatched by Orchestra. The conductor includes
them in Task Packets and Standard/Open-Code template injection so all agents share the same
scope, impact, and decision behavior.

## SocratiCode-First Discovery

If SocratiCode tools are available in the agent context and the Task Packet says the index
is active:
- Use `codebase_search` before opening many files or running broad `rg`.
- Use `codebase_symbols` or `codebase_symbol` before changing named functions, classes,
  route handlers, exported constants, or shared types.
- Use `codebase_graph_query` or `codebase_flow` when import direction, call flow, or
  integration order matters.
- Use `codebase_impact` before changing shared modules, routers, schemas, services,
  exported symbols/types, public APIs, auth/RBAC code, DB models/migrations, or config
  consumed by other systems.

If SocratiCode tools are not available to the sub-agent, rely on the conductor's Impact
preflight block and use targeted shell search only inside the packet's FILES or narrowed
directories. Do not perform broad repository exploration unless the packet explicitly asks
for a wide audit.

## Scope and Impact Closure

- Modify only files listed under the packet's Write scope.
- Read only the listed Read files plus narrowly justified adjacent files.
- Do not change shared/exported contracts, routes, schema shapes, auth behavior, public API
  response shapes, or migration semantics unless the packet explicitly authorizes it.
- If the correct fix requires touching an unlisted file or changing an unapproved shared
  contract, stop and return a blocker/options report. Include the file/symbol, why it is
  needed, least-impact option, and risk.
- When adding or fixing code, update directly affected tests or return the exact missing
  test path/command as a blocker if tests are outside the packet's scope.

## Context and Token Discipline

- Treat the Task Packet as the active context budget. If it does not name a budget, assume
  the packet plus injected role prompt should stay under about 6,000 tokens and the Result
  Report should stay under about 1,500 words.
- Prefer evidence capsules over raw dumps: path, line number, command, status, and the
  smallest excerpt needed to prove the claim.
- Do not paste full files, full diffs, full logs, full stack traces, full test output, full
  prior Result Reports, or raw conversation transcripts into findings or next-wave context.
- For long command output, include the failing/error lines plus short first/last excerpts
  and point to the artifact, log path, trace ID, or command that can reproduce the full
  output.
- For large file reads, use line windows around the relevant symbol or evidence. If broader
  context is required, explain why and summarize the additional evidence instead of copying
  it verbatim.
- If the assigned scope cannot fit the context budget, return `status: partial` with a
  blocker asking the conductor to split the packet. Do not silently expand context to keep
  working.
- Preserve capability by retaining durable references: absolute file paths, symbol names,
  trace IDs, test names, migration IDs, and commands. These references let the conductor or
  later agents retrieve details just in time without carrying them in every prompt.

## Cross-Project Portability

- Treat paths, frameworks, commands, and examples inside role files as project-profile
  defaults, not universal facts. Before acting in a new repository, discover the actual
  stack, package manager, source roots, test commands, routing framework, ORM, migration
  tool, and security conventions from the active project.
- If a role mentions a path that does not exist in the target repository, map the intent
  to the closest discovered equivalent and state that mapping in the Result Report.
- If no equivalent exists, return a blocker/options report instead of creating a new stack
  convention just to satisfy the role prompt.
- Prefer repository-local instructions (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules`,
  package scripts, Makefiles, CI workflows) over examples embedded in the portable agent
  source.
- Verification commands must come from the target repository when available. Only use
  embedded example commands when the target project has the same layout and scripts.

## Decision Policy

- Choose the smallest contract-compliant change that satisfies the task.
- Preserve existing public behavior unless the Task Packet explicitly requires a behavior
  change.
- If multiple approaches are valid and the tradeoff affects product behavior, security,
  data safety, performance, public API shape, migration strategy, or user-visible UX,
  return options with a recommendation instead of silently choosing.
- If options are technically equivalent, choose the lower blast-radius approach and record
  the rationale in the Result Report findings.

## Result Report Expectations

Every Result Report must state:
- whether SocratiCode was used directly, unavailable, or only available via conductor
  preflight
- what impact assumptions were verified
- any affected files/tests intentionally deferred
- any scope expansion that was needed but not performed
- whether any evidence was summarized or truncated for context budget reasons, with the
  path/command/trace ID needed to retrieve the full detail
