<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-language-and-presentation-contract
section-02-navigation-and-origin-return-contract
section-03-chat-browser-session-integration
section-04-agency-browser-session-primitive
section-05-agency-chat-browser-session-surface
section-06-workflow-browser-session-node-semantics
section-07-rollout-regression-and-copy-consistency
section-08-agency-runtime-browser-session-execution
section-09-browser-session-stream-renderer
section-10-chat-and-agency-natural-browser-invocation
section-11-research-and-comparison-contracts
section-12-login-captcha-and-commitment-gates
section-13-advanced-rollout-scenario-validation
END_MANIFEST -->

# Section Index - Feature 042

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-shared-language-and-presentation-contract | - | 02, 03, 05, 07 | Yes |
| section-02-navigation-and-origin-return-contract | 01 | 03, 05, 07 | No |
| section-03-chat-browser-session-integration | 01, 02 | 07 | No |
| section-04-agency-browser-session-primitive | 01 | 05, 07 | Yes |
| section-05-agency-chat-browser-session-surface | 01, 02, 04 | 07 | No |
| section-06-workflow-browser-session-node-semantics | 01 | 07 | No |
| section-07-rollout-regression-and-copy-consistency | 01, 02, 03, 04, 05, 06 | 08, 09, 10, 11, 12, 13 | No |
| section-08-agency-runtime-browser-session-execution | 04, 05, 07 | 10, 13 | No |
| section-09-browser-session-stream-renderer | 01, 02, 07 | 10, 12, 13 | No |
| section-10-chat-and-agency-natural-browser-invocation | 03, 05, 08, 09 | 11, 13 | No |
| section-11-research-and-comparison-contracts | 06, 10 | 12, 13 | No |
| section-12-login-captcha-and-commitment-gates | 01, 09, 11 | 13 | No |
| section-13-advanced-rollout-scenario-validation | 08, 09, 10, 11, 12 | - | No |

## Execution Order

1. `section-01-shared-language-and-presentation-contract`
2. `section-02-navigation-and-origin-return-contract`
3. `section-03-chat-browser-session-integration` and `section-04-agency-browser-session-primitive`
4. `section-05-agency-chat-browser-session-surface` and `section-06-workflow-browser-session-node-semantics`
5. `section-07-rollout-regression-and-copy-consistency`
6. `section-08-agency-runtime-browser-session-execution` and `section-09-browser-session-stream-renderer`
7. `section-10-chat-and-agency-natural-browser-invocation`
8. `section-11-research-and-comparison-contracts` and `section-12-login-captcha-and-commitment-gates`
9. `section-13-advanced-rollout-scenario-validation`

## Section Summaries

### section-01-shared-language-and-presentation-contract

Create the shared Browser Session presentation and data contract: product-facing labels, state mapping, CTA wording, `browserSessionSummary`, launch and return metadata, and adapter helpers used by Automation, Chat, Agency, and Workflow surfaces.

### section-02-navigation-and-origin-return-contract

Replace hardcoded dashboard return logic with origin-aware Browser Session navigation. Ensure direct resume still works without parent state.

### section-03-chat-browser-session-integration

Add Browser Session entrypoints and resumable session summaries to Chat using the existing full-page Browser Session route with origin-aware return.

### section-04-agency-browser-session-primitive

Add a dedicated `browser_session` collaboration primitive to Agency Builder with user-facing naming and configuration semantics clearer than generic tool execution.

### section-05-agency-chat-browser-session-surface

Render structured browser-session state in Agency Chat and bind review or user-input states to the shared Browser Session presentation model.

### section-06-workflow-browser-session-node-semantics

Extend workflow node semantics with an additive browser-session node family while preserving backward compatibility for existing one-shot `web_automation`.

### section-07-rollout-regression-and-copy-consistency

Finalize cross-surface regression coverage, compatibility checks, feature-flag rollout notes, observability hooks, compact-layout rules, and copy consistency validation across all affected surfaces.

### section-08-agency-runtime-browser-session-execution

Make the Agency `browser_session` primitive executable at runtime so agency graphs can autonomously create, resume, and hand off Browser Sessions instead of depending on manual UI launch.

### section-09-browser-session-stream-renderer

Render the live remote browser viewport inside the Browser Session workspace using the existing stream token contracts, with reconnect and takeover-aware behavior.

### section-10-chat-and-agency-natural-browser-invocation

Add structured launch-card or action-chip flows so Chat and Agency can propose and confirm Browser Session launches directly from conversation intent.

### section-11-research-and-comparison-contracts

Normalize browse-heavy comparison results into reusable structured contracts that can support research, ticket comparison, hotel comparison, and shortlist review flows.

### section-12-login-captcha-and-commitment-gates

Expand human-handoff semantics to distinguish login, captcha, payment review, and booking confirmation barriers with explicit UI and branching contracts.

### section-13-advanced-rollout-scenario-validation

Add scenario-driven verification and rollout gates for the advanced automation uplift so the new runtime behaviors can be canaried separately from the existing cross-surface foundation.
