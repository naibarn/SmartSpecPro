# Sub-Agents Skill Pack

This registry documents all 29 agents available in sub-agents skill pack. Orchestra (the SKILL.md conductor) dispatches these agents across Claude Code, Standard, and open-code workflows to parallelize development work across domains. For Claude Code, agents may also have native `.claude/agents/` definitions (see Section 09) that enable direct invocation via Claude Code's agents feature.

---

## Agent Registry

All 29 agents in this pack. Every row in this table has a corresponding `.md` file in `agents/`.

| Agent File | Role | CMD | subagent_type (Claude Code) | Output Format | When to Use |
|---|---|---|---|---|---|
| `product-ux.md` | Product/UX discovery specialist | CMD-0 | `Plan` | Product UX Brief + acceptance criteria | Before planning/architecture when user journey, UX states, or product decisions need clarity |
| `research.md` | Research analyst | CMD-1 | `Explore` | Research Brief | Before implementation — explore existing code/APIs |
| `architect.md` | Architecture designer | CMD design | `Plan` | Architecture document with module diagram | After research, before implementation begins |
| `frontend.md` | React/UI implementer | CMD-1 | `general-purpose` | Result Report + changed `.tsx`/`.ts` files | Adding/modifying React components, pages, hooks |
| `backend.md` | tRPC/Drizzle implementer | CMD-2 | `backend-api-security:backend-architect` | Result Report + changed server `.ts` files | Adding/modifying tRPC routers, Express routes, DB queries |
| `python.md` | FastAPI/Celery implementer | CMD-3 | `python-development:fastapi-pro` | Result Report + changed `.py` files | Adding/modifying FastAPI endpoints, Celery tasks |
| `database.md` | Schema/migration specialist | CMD-4 | `general-purpose` | Result Report with backup audit trail | Schema changes, migrations, data seeding |
| `test-qa.md` | Test writer and QA reporter | CMD-8 | `general-purpose` | Result Report + test plan + pass/fail report | Writing tests, checking coverage |
| `e2e-playwright.md` | Browser workflow tester | CMD-8E | `general-purpose` | E2E plan + Playwright results | Browser workflow, responsive viewport, auth flow, screenshot/trace, or flaky E2E work |
| `reviewer.md` | Code reviewer (read-only) | CMD-8 | `Explore` | Review Report with APPROVE/APPROVE_WITH_FIXES/REQUEST_CHANGES verdict | Post-implementation wave review |
| `security.md` | General security auditor/fixer | CMD-6 | `backend-api-security:backend-security-coder` | Result Report + risk register | Security audit + remediation for HIGH/CRITICAL risk tasks |
| `debugger.md` | Bug investigator and fixer | CMD-7 | `error-debugging:debugger` | Result Report with root cause + attempt log | Multi-file bugs with unclear root cause |
| `error-detective.md` | Audit log investigator (read-only) | CMD-7 | `error-debugging:error-detective` | Result Report with event timeline | LLM/media failures, cost discrepancies, trace investigation |
| `infrastructure.md` | Infra/ops specialist | CMD-5 | `Explore` / `general-purpose` | Result Report + validate-all-configs result | Nginx, Docker, systemd, deployment changes |
| `performance.md` | Performance specialist | CMD-9 | `general-purpose` | Baseline + bottleneck + verification report | Slow endpoints, N+1 queries, cache strategy, bundle/load-test regressions |
| `ci-release.md` | CI/release specialist | CMD-10 | `general-purpose` | Workflow patch + release readiness report | GitHub Actions, failing checks, deploy gates, release readiness, rollback |
| `dependency-supply-chain.md` | Dependency/supply-chain specialist | CMD-11 | `general-purpose` | Dependency findings + lockfile/scanner report | Dependency audit, lockfile drift, vulnerable packages, licenses, package integrity |
| `docs-release.md` | Docs and changelog writer | release | `general-purpose` | Result Report + changelog + migration guide | End of feature cycle — release documentation |
| `security-review.md` | Pre-merge verdict aggregator | CMD-6 | `Explore` | PASS/CONDITIONAL PASS/FAIL verdict + `risk_register.md` | After all 3 security specialists complete (dispatched by orchestra) |
| `security-trpc.md` | tRPC security auditor (read-only) | CMD-6 | `backend-api-security:backend-security-coder` | Security findings table | Pre-merge gate — changed tRPC routers |
| `security-fastapi.md` | FastAPI security auditor (read-only) | CMD-6 | `backend-api-security:backend-security-coder` | Security findings table | Pre-merge gate — changed FastAPI endpoints/Celery tasks |
| `security-frontend.md` | Frontend security auditor (read-only) | CMD-6 | `backend-api-security:backend-security-coder` | Security findings table | Pre-merge gate — changed React components/pages |
| `visual-ui-requirement-analyzer.md` | Visual UI requirement analyzer (read-only) | CMD-12 | `Plan` | UI Enhancement Brief | Before visual redesign, responsive, accessibility, or premium UI work |
| `visual-ui-direction.md` | Visual direction strategist (read-only) | CMD-12 | `Plan` | Visual Direction Brief | Choose visual hierarchy, token, typography, surface, and motion strategy |
| `ui-builder.md` | Tailwind/shadcn UI builder | CMD-12 | `general-purpose` | Result Report + changed UI files | Implement visual UI polish, component states, responsive styling, and dark-mode-friendly UI |
| `visual-ux-reviewer.md` | Visual UX reviewer (read-only) | CMD-12 | `Explore` | UX Review Report | Review hierarchy, primary action clarity, copy, states, and recovery paths |
| `accessibility-reviewer.md` | Accessibility reviewer (read-only) | CMD-12 | `Explore` | Accessibility Review Report | Review keyboard, focus, labels, contrast, ARIA, and reduced motion |
| `responsive-reviewer.md` | Responsive reviewer (read-only) | CMD-12 | `Explore` | Responsive Review Report | Review mobile/tablet/desktop behavior, overflow, tables, forms, navigation, and touch targets |
| `visual-final-refactor.md` | Final visual refactor implementer | CMD-12 | `general-purpose` | Result Report + final UI patch | Consolidate visual/UX/a11y/responsive findings into a safe final UI patch |

---

## How Orchestra Dispatches Agents

Orchestra (the conductor, `SKILL.md`) builds **Task Packets** and dispatches agents as Claude Code subprocesses. The full Task Packet schema is in `contracts/task-packet.schema.md`. The Result Report schema (what agents return) is in `contracts/result-report.schema.md`.

### Task Packet Structure

Every dispatch includes these fields:

```
TASK: [Specific action — what to do, not what to "look at"]
DOMAIN: [Which commander area: CMD-0 through CMD-11]
FILES: [Exact file paths to read/modify]
CONTEXT: [Prior findings, user-reported errors, relevant state]
CONSTRAINTS: [What NOT to touch, max scope, coding conventions]
OUTPUT: [Exact deliverable format — "modify file X to add Y" or "return analysis of Z"]
```

### Parallel Dispatch Rule

On platforms with a Task/sub-agent tool, all agents in the same wave are dispatched in a single batch. On platforms without that tool, keep the same wave boundaries but execute agents sequentially. Serialization is only required for:
- Database migration operations (sequential by design)
- Agents that depend on a prior agent's output files
- Git operations (stage → commit → push)

### Security Gate Flow

The pre-merge security check uses a 5-step flow:

1. Orchestra identifies changed files by domain (tRPC routers, FastAPI endpoints, React components)
2. Orchestra builds Task Packets for each of the 3 specialists
3. Orchestra dispatches all 3 specialists in a **single parallel message** (3 Task calls)
4. Orchestra collects all 3 Result Reports
5. Orchestra dispatches `security-review.md` as aggregator with all 3 reports in the Task Packet CONTEXT

`security-review.md` never dispatches specialists — it receives pre-collected findings. Sub-agents cannot spawn sub-agents in Claude Code; orchestra always handles orchestration.

---

## Platform Compatibility Matrix

| Agent | claude-code (`subagent_type`) | standard (template injected) | open-code (sequential) |
|---|---|---|---|
| `research` | `Explore` | `general-purpose` + `research.md` template | Conductor adopts role |
| `product-ux` | `Plan` | `general-purpose` + `product-ux.md` template | Conductor adopts role |
| `architect` | `Plan` | `general-purpose` + `architect.md` template | Conductor adopts role |
| `frontend` | `general-purpose` | `general-purpose` + `frontend.md` template | Conductor adopts role |
| `backend` | `backend-api-security:backend-architect` | `general-purpose` + `backend.md` template | Conductor adopts role |
| `python` | `python-development:fastapi-pro` | `general-purpose` + `python.md` template | Conductor adopts role |
| `database` | `general-purpose` | `general-purpose` + `database.md` template | Conductor adopts role (sequential only) |
| `test-qa` | `general-purpose` | `general-purpose` + `test-qa.md` template | Conductor adopts role |
| `e2e-playwright` | `general-purpose` | `general-purpose` + `e2e-playwright.md` template | Conductor adopts role |
| `reviewer` | `Explore` | `general-purpose` + `reviewer.md` template | Conductor adopts role |
| `security` | `backend-api-security:backend-security-coder` | `general-purpose` + `security.md` template | Conductor adopts role |
| `debugger` | `error-debugging:debugger` | `general-purpose` + `debugger.md` template | Conductor adopts role (sequential only) |
| `error-detective` | `error-debugging:error-detective` | `general-purpose` + `error-detective.md` template | Conductor adopts role |
| `infrastructure` | `Explore` / `general-purpose` | `general-purpose` + `infrastructure.md` template | Conductor adopts role (sequential only) |
| `performance` | `general-purpose` | `general-purpose` + `performance.md` template | Conductor adopts role |
| `ci-release` | `general-purpose` | `general-purpose` + `ci-release.md` template | Conductor adopts role (sequential only) |
| `dependency-supply-chain` | `general-purpose` | `general-purpose` + `dependency-supply-chain.md` template | Conductor adopts role |
| `docs-release` | `general-purpose` | `general-purpose` + `docs-release.md` template | Conductor adopts role |
| `security-review` | `Explore` | `general-purpose` + `security-review.md` template | Conductor adopts role |
| `security-trpc` | `backend-api-security:backend-security-coder` | `general-purpose` + `security-trpc.md` template | Conductor adopts role |
| `security-fastapi` | `backend-api-security:backend-security-coder` | `general-purpose` + `security-fastapi.md` template | Conductor adopts role |
| `security-frontend` | `backend-api-security:backend-security-coder` | `general-purpose` + `security-frontend.md` template | Conductor adopts role |
| `visual-ui-requirement-analyzer` | `Plan` | `general-purpose` + `visual-ui-requirement-analyzer.md` template | Conductor adopts role |
| `visual-ui-direction` | `Plan` | `general-purpose` + `visual-ui-direction.md` template | Conductor adopts role |
| `ui-builder` | `general-purpose` | `general-purpose` + `ui-builder.md` template | Conductor adopts role |
| `visual-ux-reviewer` | `Explore` | `general-purpose` + `visual-ux-reviewer.md` template | Conductor adopts role |
| `accessibility-reviewer` | `Explore` | `general-purpose` + `accessibility-reviewer.md` template | Conductor adopts role |
| `responsive-reviewer` | `Explore` | `general-purpose` + `responsive-reviewer.md` template | Conductor adopts role |
| `visual-final-refactor` | `general-purpose` | `general-purpose` + `visual-final-refactor.md` template | Conductor adopts role |

---

## How to Add a New Agent

1. Create `agents/YOUR-AGENT.md` using the **8-section template**:
   - **Section 1: Identity** — Role, Claude Code `subagent_type`, and scope description
   - **Section 2: Capabilities** — Bullet list of what the agent can do
   - **Section 3: Constraints** — Hard rules (read-only vs read-write, path restrictions, error handling limits)
   - **Section 4: Input Contract** — Task Packet field mapping (reference `contracts/task-packet.schema.md`)
   - **Section 5: Output Contract** — Result Report format with example (reference `contracts/result-report.schema.md`)
   - **Section 6: Workflow** — Numbered steps for agent execution
   - **Section 7: Quality Checklist** — Checkbox list for self-verification before returning results
   - **Section 8: Error Handling** — Specific failure scenarios and recovery actions

2. Add a row to the **Agent Registry table** in this README

3. Add the agent to `sub-agent-dispatch.md` agent type mapping (the Section 03 reference file for wave planning)

4. For Claude Code support, create the native `.claude/agents/ssp-YOUR-AGENT.md` definition with YAML frontmatter (see Section 09 for the full format and naming convention). This step is optional for standard/open-code-only environments.

5. Update the **Platform Compatibility Matrix** above with the new agent's `subagent_type` values for each platform

---

## Native .claude/agents/ Definitions

The 29 agents in this registry each have a corresponding native definition in `.claude/agents/` that enables Claude Code's auto-dispatch mechanism. These files use YAML frontmatter to configure model, tools, permissions, and isolation.

| Agent File | Native Definition |
|---|---|
| `product-ux.md` | `.claude/agents/ssp-product-ux.md` |
| `research.md` | `.claude/agents/ssp-research.md` |
| `architect.md` | `.claude/agents/ssp-architect.md` |
| `frontend.md` | `.claude/agents/ssp-frontend.md` |
| `backend.md` | `.claude/agents/ssp-backend.md` |
| `python.md` | `.claude/agents/ssp-python.md` |
| `database.md` | `.claude/agents/ssp-database.md` |
| `test-qa.md` | `.claude/agents/ssp-test-qa.md` |
| `e2e-playwright.md` | `.claude/agents/ssp-e2e-playwright.md` |
| `reviewer.md` | `.claude/agents/ssp-reviewer.md` |
| `security.md` | `.claude/agents/ssp-security.md` |
| `debugger.md` | `.claude/agents/ssp-debugger.md` |
| `error-detective.md` | `.claude/agents/ssp-error-detective.md` |
| `infrastructure.md` | `.claude/agents/ssp-infrastructure.md` |
| `performance.md` | `.claude/agents/ssp-performance.md` |
| `ci-release.md` | `.claude/agents/ssp-ci-release.md` |
| `dependency-supply-chain.md` | `.claude/agents/ssp-dependency-supply-chain.md` |
| `docs-release.md` | `.claude/agents/ssp-docs-release.md` |
| `security-review.md` | `.claude/agents/ssp-security-review.md` |
| `security-trpc.md` | `.claude/agents/ssp-security-trpc.md` |
| `security-fastapi.md` | `.claude/agents/ssp-security-fastapi.md` |
| `security-frontend.md` | `.claude/agents/ssp-security-frontend.md` |
| `visual-ui-requirement-analyzer.md` | `.claude/agents/ssp-visual-ui-requirement-analyzer.md` |
| `visual-ui-direction.md` | `.claude/agents/ssp-visual-ui-direction.md` |
| `ui-builder.md` | `.claude/agents/ssp-ui-builder.md` |
| `visual-ux-reviewer.md` | `.claude/agents/ssp-visual-ux-reviewer.md` |
| `accessibility-reviewer.md` | `.claude/agents/ssp-accessibility-reviewer.md` |
| `responsive-reviewer.md` | `.claude/agents/ssp-responsive-reviewer.md` |
| `visual-final-refactor.md` | `.claude/agents/ssp-visual-final-refactor.md` |

---

## Maintenance Notes

- **Keep registry in sync:** the table above must always match the actual `.md` files in `agents/`. An agent file without a registry row, or a registry row without a file, will cause silent dispatch failures.
- **`subagent_type` values are load-bearing:** the value in the registry table is used by orchestration tooling. Typos cause silent failures where orchestration dispatches to the wrong agent type.
- **Security specialists are read-only by design:** `security-review.md`, `security-trpc.md`, `security-fastapi.md`, and `security-frontend.md` must never be changed to write files (except `security-review.md` writing to `orchestra/risk_register.md` and `orchestra/decisions.md` in `auto_by_default` mode). Their read-only status is a security invariant.
