# Sub-Agents Skill Pack

This registry documents all 35 agents available in sub-agents skill pack. Orchestra (the SKILL.md conductor) dispatches these agents across Claude Code, Standard, and open-code workflows to parallelize development work across domains. For Claude Code, generate native `.claude/agents/` definitions with `bash skills/generate-claude-agents.sh` or as part of `bash skills/install-portable-skills.sh`.

---

## Agent Registry

All 35 agents in this pack. Every row in this table has a corresponding `.md` file in `agents/`.

| Agent File | Role | CMD | Claude Code native agent | Output Format | When to Use |
|---|---|---|---|---|---|
| `product-ux.md` | Product/UX discovery specialist | CMD-0 | `ssp-product-ux` | Product UX Brief + acceptance criteria | Before planning/architecture when user journey, UX states, or product decisions need clarity |
| `research.md` | Research analyst | CMD-1 support | `ssp-research` | Research Brief | Before implementation — explore existing code/APIs |
| `architect.md` | Architecture designer | CMD-DESIGN | `ssp-architect` | Architecture document with module diagram | After research, before implementation begins |
| `api-contract-reviewer.md` | API contract reviewer (read-only) | CMD-DESIGN/CMD-8 | `ssp-api-contract-reviewer` | Result Report with contract drift findings | Validate tRPC/FastAPI/shared schema and client/server contract consistency |
| `frontend.md` | React/UI implementer | CMD-1 | `ssp-frontend` | Result Report + changed `.tsx`/`.ts` files | Adding/modifying React components, pages, hooks |
| `backend.md` | tRPC/Drizzle implementer | CMD-2 | `ssp-backend` | Result Report + changed server `.ts` files | Adding/modifying tRPC routers, Express routes, DB queries |
| `python.md` | FastAPI/Celery implementer | CMD-3 | `ssp-python` | Result Report + changed `.py` files | Adding/modifying FastAPI endpoints, Celery tasks |
| `database.md` | Schema/migration specialist | CMD-4 | `ssp-database` | Result Report with backup audit trail | Schema changes, migrations, data seeding |
| `test-qa.md` | Test writer and QA reporter | CMD-8 | `ssp-test-qa` | Result Report + test plan + pass/fail report | Writing tests, checking coverage |
| `e2e-playwright.md` | Browser workflow tester | CMD-8E | `ssp-e2e-playwright` | E2E plan + Playwright results | Browser workflow, responsive viewport, auth flow, screenshot/trace, or flaky E2E work |
| `reviewer.md` | Code reviewer (read-only) | CMD-8 | `ssp-reviewer` | Review Report with APPROVE/APPROVE_WITH_FIXES/REQUEST_CHANGES verdict | Post-implementation wave review |
| `security.md` | General security auditor/fixer | CMD-6 | `ssp-security` | Result Report + risk register | Security audit + remediation for HIGH/CRITICAL risk tasks |
| `tenant-data-isolation-reviewer.md` | Tenant/data isolation reviewer (read-only) | CMD-6 | `ssp-tenant-data-isolation-reviewer` | Result Report with isolation findings | Review tenantId, user ownership, RBAC, vault, billing, and credit boundaries |
| `browser-automation-sandbox-reviewer.md` | Browser automation sandbox reviewer (read-only) | CMD-6 | `ssp-browser-automation-sandbox-reviewer` | Result Report with sandbox/SSRF findings | Review browser/RPA/webhook sandbox, SSRF, file, and network boundaries |
| `debugger.md` | Bug investigator and fixer | CMD-7 | `ssp-debugger` | Result Report with root cause + attempt log | Multi-file bugs with unclear root cause |
| `error-detective.md` | Audit log investigator (read-only) | CMD-7 | `ssp-error-detective` | Result Report with event timeline | LLM/media failures, cost discrepancies, trace investigation |
| `infrastructure.md` | Infra/ops specialist | CMD-5 | `ssp-infrastructure` | Result Report + validate-all-configs result | Nginx, Docker, systemd, deployment changes |
| `performance.md` | Performance specialist | CMD-9 | `ssp-performance` | Baseline + bottleneck + verification report | Slow endpoints, N+1 queries, cache strategy, bundle/load-test regressions |
| `llm-runtime-cost-auditor.md` | LLM runtime cost auditor (read-only) | CMD-9/CMD-6 | `ssp-llm-runtime-cost-auditor` | Result Report with runtime/cost findings | Review provider routing, cost reservation/refund, retries, budget, audit logs, and fallback |
| `ci-release.md` | CI/release specialist | CMD-10 | `ssp-ci-release` | Workflow patch + release readiness report | GitHub Actions, failing checks, deploy gates, release readiness, rollback |
| `dependency-supply-chain.md` | Dependency/supply-chain specialist | CMD-11 | `ssp-dependency-supply-chain` | Dependency findings + lockfile/scanner report | Dependency audit, lockfile drift, vulnerable packages, licenses, package integrity |
| `docs-release.md` | Docs and changelog writer | CMD-10 | `ssp-docs-release` | Result Report + changelog + migration guide | End of feature cycle — release documentation |
| `i18n-content-reviewer.md` | i18n/content reviewer (read-only) | CMD-8/CMD-10 | `ssp-i18n-content-reviewer` | Result Report with copy/i18n findings | Review Thai/English copy, localization keys, fallback text, errors, help, and docs consistency |
| `observability-audit-agent.md` | Observability audit reviewer (read-only) | CMD-5/CMD-9 | `ssp-observability-audit-agent` | Result Report with observability findings | Review logs, traces, metrics, audit events, alert signals, and incident evidence |
| `security-review.md` | Pre-merge verdict aggregator | CMD-6 | `ssp-security-review` | Result Report + `security_verdict` + `risk_register.md` | After all 3 security specialists complete (dispatched by orchestra) |
| `security-trpc.md` | tRPC security auditor (read-only) | CMD-6 | `ssp-security-trpc` | Security findings table | Pre-merge gate — changed tRPC routers |
| `security-fastapi.md` | FastAPI security auditor (read-only) | CMD-6 | `ssp-security-fastapi` | Security findings table | Pre-merge gate — changed FastAPI endpoints/Celery tasks |
| `security-frontend.md` | Frontend security auditor (read-only) | CMD-6 | `ssp-security-frontend` | Security findings table | Pre-merge gate — changed React components/pages |
| `visual-ui-requirement-analyzer.md` | Visual UI requirement analyzer (read-only) | CMD-12 | `ssp-visual-ui-requirement-analyzer` | UI Enhancement Brief | Before visual redesign, responsive, accessibility, or premium UI work |
| `visual-ui-direction.md` | Visual direction strategist (read-only) | CMD-12 | `ssp-visual-ui-direction` | Visual Direction Brief | Choose visual hierarchy, token, typography, surface, and motion strategy |
| `ui-builder.md` | Tailwind/shadcn UI builder | CMD-12 | `ssp-ui-builder` | Result Report + changed UI files | Implement visual UI polish, component states, responsive styling, and dark-mode-friendly UI |
| `visual-ux-reviewer.md` | Visual UX reviewer (read-only) | CMD-12 | `ssp-visual-ux-reviewer` | UX Review Report | Review hierarchy, primary action clarity, copy, states, and recovery paths |
| `accessibility-reviewer.md` | Accessibility reviewer (read-only) | CMD-12 | `ssp-accessibility-reviewer` | Accessibility Review Report | Review keyboard, focus, labels, contrast, ARIA, and reduced motion |
| `responsive-reviewer.md` | Responsive reviewer (read-only) | CMD-12 | `ssp-responsive-reviewer` | Responsive Review Report | Review mobile/tablet/desktop behavior, overflow, tables, forms, navigation, and touch targets |
| `visual-final-refactor.md` | Final visual refactor implementer | CMD-12 | `ssp-visual-final-refactor` | Result Report + final UI patch | Consolidate visual/UX/a11y/responsive findings into a safe final UI patch |

---

## How Orchestra Dispatches Agents

Orchestra (the conductor, `SKILL.md`) builds **Task Packets** and dispatches agents as Claude Code subprocesses. The full Task Packet schema is in `contracts/task-packet.schema.md`. The Result Report schema (what agents return) is in `contracts/result-report.schema.md`.

### Task Packet Structure

Every dispatch includes these fields:

```
TASK: [Specific action — what to do, not what to "look at"]
DOMAIN: [Which commander area: CMD-0, CMD-DESIGN, CMD-1 through CMD-12]
FILES: [Exact file paths to read/modify]
CONTEXT: [Prior findings, user-reported errors, relevant state]
CONSTRAINTS: [What NOT to touch, max scope, coding conventions]
CONTRACT: [Parallel interface contract, or N/A for solo dispatch]
OUTPUT: [Exact deliverable format — "modify file X to add Y" or "return analysis of Z"]
QUALITY GATE: [Exact commands/checklists that must pass or be reported]
```

Before dispatching any agent, Orchestra also injects
`references/shared-operational-discipline.md` into the packet context/constraints. This
keeps all 35 roles aligned on SocratiCode-first discovery, impact boundaries,
least-impact implementation choices, and when to return blocker/options instead of
expanding scope.

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
   when Task tooling exists; otherwise it executes the same specialist roles sequentially
   inline and preserves the same Result Report contract
4. Orchestra collects all 3 Result Reports and converts them into compact capsules
   (source/status/counts/top findings/report path/finding IDs)
5. Orchestra dispatches `ssp-security-review` as aggregator with those capsules in the
   Task Packet CONTEXT, not the raw full reports

`security-review.md` never dispatches specialists — it receives pre-collected compact
findings. Sub-agents cannot spawn sub-agents in Claude Code; orchestra always handles
orchestration.

---

## Platform Compatibility Matrix

| Agent | claude-code native agent | standard (template injected) | open-code (sequential) |
|---|---|---|---|
| `research` | `ssp-research` | `explorer` + `research.md` template | Conductor adopts role |
| `product-ux` | `ssp-product-ux` | `default`/`explorer` + `product-ux.md` template | Conductor adopts role |
| `architect` | `ssp-architect` | `default`/`explorer` + `architect.md` template | Conductor adopts role |
| `api-contract-reviewer` | `ssp-api-contract-reviewer` | `explorer` + `api-contract-reviewer.md` template | Conductor adopts role |
| `frontend` | `ssp-frontend` | `worker` + `frontend.md` template | Conductor adopts role |
| `backend` | `ssp-backend` | `worker` + `backend.md` template | Conductor adopts role |
| `python` | `ssp-python` | `worker` + `python.md` template | Conductor adopts role |
| `database` | `ssp-database` | `worker` + `database.md` template | Conductor adopts role (sequential only) |
| `test-qa` | `ssp-test-qa` | `worker`/`explorer` + `test-qa.md` template | Conductor adopts role |
| `e2e-playwright` | `ssp-e2e-playwright` | `worker` + `e2e-playwright.md` template | Conductor adopts role |
| `reviewer` | `ssp-reviewer` | `explorer` + `reviewer.md` template | Conductor adopts role |
| `security` | `ssp-security` | `worker`/`explorer` + `security.md` template | Conductor adopts role |
| `tenant-data-isolation-reviewer` | `ssp-tenant-data-isolation-reviewer` | `explorer` + `tenant-data-isolation-reviewer.md` template | Conductor adopts role |
| `browser-automation-sandbox-reviewer` | `ssp-browser-automation-sandbox-reviewer` | `explorer` + `browser-automation-sandbox-reviewer.md` template | Conductor adopts role |
| `debugger` | `ssp-debugger` | `worker` + `debugger.md` template | Conductor adopts role (sequential only) |
| `error-detective` | `ssp-error-detective` | `explorer` + `error-detective.md` template | Conductor adopts role |
| `infrastructure` | `ssp-infrastructure` | `worker`/`explorer` + `infrastructure.md` template | Conductor adopts role (sequential only) |
| `performance` | `ssp-performance` | `worker`/`explorer` + `performance.md` template | Conductor adopts role |
| `llm-runtime-cost-auditor` | `ssp-llm-runtime-cost-auditor` | `explorer` + `llm-runtime-cost-auditor.md` template | Conductor adopts role |
| `ci-release` | `ssp-ci-release` | `worker` + `ci-release.md` template | Conductor adopts role (sequential only) |
| `dependency-supply-chain` | `ssp-dependency-supply-chain` | `explorer` + `dependency-supply-chain.md` template | Conductor adopts role |
| `docs-release` | `ssp-docs-release` | `worker` + `docs-release.md` template | Conductor adopts role |
| `i18n-content-reviewer` | `ssp-i18n-content-reviewer` | `explorer` + `i18n-content-reviewer.md` template | Conductor adopts role |
| `observability-audit-agent` | `ssp-observability-audit-agent` | `explorer` + `observability-audit-agent.md` template | Conductor adopts role |
| `security-review` | `ssp-security-review` | `explorer` + `security-review.md` template | Conductor adopts role |
| `security-trpc` | `ssp-security-trpc` | `explorer` + `security-trpc.md` template | Conductor adopts role |
| `security-fastapi` | `ssp-security-fastapi` | `explorer` + `security-fastapi.md` template | Conductor adopts role |
| `security-frontend` | `ssp-security-frontend` | `explorer` + `security-frontend.md` template | Conductor adopts role |
| `visual-ui-requirement-analyzer` | `ssp-visual-ui-requirement-analyzer` | `explorer` + `visual-ui-requirement-analyzer.md` template | Conductor adopts role |
| `visual-ui-direction` | `ssp-visual-ui-direction` | `explorer` + `visual-ui-direction.md` template | Conductor adopts role |
| `ui-builder` | `ssp-ui-builder` | `worker` + `ui-builder.md` template | Conductor adopts role |
| `visual-ux-reviewer` | `ssp-visual-ux-reviewer` | `explorer` + `visual-ux-reviewer.md` template | Conductor adopts role |
| `accessibility-reviewer` | `ssp-accessibility-reviewer` | `explorer` + `accessibility-reviewer.md` template | Conductor adopts role |
| `responsive-reviewer` | `ssp-responsive-reviewer` | `explorer` + `responsive-reviewer.md` template | Conductor adopts role |
| `visual-final-refactor` | `ssp-visual-final-refactor` | `worker` + `visual-final-refactor.md` template | Conductor adopts role |

---

## How to Add a New Agent

1. Create `agents/YOUR-AGENT.md` using the **8-section template**:
   - **Section 1: Identity** — Role, registered agent name, and scope description
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

5. Update the **Platform Compatibility Matrix** above with the new agent's native `ssp-*`
   name and fallback behavior for each platform

---

## Native .claude/agents/ Definitions

The 35 agents in this registry can each have a generated native definition in `.claude/agents/` that enables Claude Code's agent mechanism. These files use YAML frontmatter to configure model and tool access. The source of truth remains `skills/sub-agents/agents/*.md`; regenerate native files after editing the portable source.

**Model tiering (Opus plans, Sonnet codes):** the generator assigns `model:` per agent via `OPUS_AGENTS` in `skills/portable_install.py`. Planning/design agents (`architect`, `product-ux`) get `model: opus`; all other implementation and reviewer agents get `model: sonnet`. To promote another agent to Opus, add its slug to `OPUS_AGENTS` and regenerate — do not hand-edit the generated files. See `skills/orchestra/references/model-routing.md` ("Planning vs Coding Split") for the full policy and the context-isolation delegation rule.

Generate them with:

```bash
bash skills/generate-claude-agents.sh
```

| Agent File | Native Definition |
|---|---|
| `product-ux.md` | `.claude/agents/ssp-product-ux.md` |
| `research.md` | `.claude/agents/ssp-research.md` |
| `architect.md` | `.claude/agents/ssp-architect.md` |
| `api-contract-reviewer.md` | `.claude/agents/ssp-api-contract-reviewer.md` |
| `frontend.md` | `.claude/agents/ssp-frontend.md` |
| `backend.md` | `.claude/agents/ssp-backend.md` |
| `python.md` | `.claude/agents/ssp-python.md` |
| `database.md` | `.claude/agents/ssp-database.md` |
| `test-qa.md` | `.claude/agents/ssp-test-qa.md` |
| `e2e-playwright.md` | `.claude/agents/ssp-e2e-playwright.md` |
| `reviewer.md` | `.claude/agents/ssp-reviewer.md` |
| `security.md` | `.claude/agents/ssp-security.md` |
| `tenant-data-isolation-reviewer.md` | `.claude/agents/ssp-tenant-data-isolation-reviewer.md` |
| `browser-automation-sandbox-reviewer.md` | `.claude/agents/ssp-browser-automation-sandbox-reviewer.md` |
| `debugger.md` | `.claude/agents/ssp-debugger.md` |
| `error-detective.md` | `.claude/agents/ssp-error-detective.md` |
| `infrastructure.md` | `.claude/agents/ssp-infrastructure.md` |
| `performance.md` | `.claude/agents/ssp-performance.md` |
| `llm-runtime-cost-auditor.md` | `.claude/agents/ssp-llm-runtime-cost-auditor.md` |
| `ci-release.md` | `.claude/agents/ssp-ci-release.md` |
| `dependency-supply-chain.md` | `.claude/agents/ssp-dependency-supply-chain.md` |
| `docs-release.md` | `.claude/agents/ssp-docs-release.md` |
| `i18n-content-reviewer.md` | `.claude/agents/ssp-i18n-content-reviewer.md` |
| `observability-audit-agent.md` | `.claude/agents/ssp-observability-audit-agent.md` |
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
- **Claude native agent names are load-bearing:** the `ssp-*` value in the registry table
  is used by orchestration tooling where native agents exist. Typos cause silent failures
  where orchestration dispatches to the wrong role or falls back to a generic worker.
- **Security specialists are read-only by design:** `security-review.md`, `security-trpc.md`, `security-fastapi.md`, and `security-frontend.md` must never be changed to write files (except `security-review.md` writing to `orchestra/risk_register.md` and `orchestra/decisions.md` in `auto_by_default` mode). Their read-only status is a security invariant.
