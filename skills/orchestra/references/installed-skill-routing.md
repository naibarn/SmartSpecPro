# Installed Skill Routing

This registry tells Orchestra how to use every installed skill in `/home/dev/.codex/skills`.
Read it when a user names a skill, uses slash-style tool wording, asks for an audit,
launch/deploy/release readiness, SEO/content/analytics work, security work, UI work,
or any task that is better handled by a specialized installed skill.

## Routing Rules

- If the user explicitly names a skill, use that skill unless it conflicts with safety rules.
- If a task maps to multiple skills, prefer the smallest operational skill that answers the request.
- For end-to-end work, let Orchestra own the workflow and use the specialized skill as one stage.
- For generator skills, write outputs only inside the user's target project or a temp directory and report paths.
- For deploy/release/publish/external side effects, require explicit user confirmation immediately before the side effect.
- For security/pentest/cybersecurity tasks, stay defensive and authorization-bound.
- For OpenAI/API usage questions, use `openai-docs` from system skills when available and prefer official docs.
- For image generation, use the image skill/tool path rather than editing binary images by shell.

## Complete Installed Skill Map

| Skill | Trigger Examples | Orchestra Handling | Safety/Gates |
|---|---|---|---|
| `api-smoke-test` | `api-smoke-test`, `/api-smoke`, API route smoke test | Run API route checks for status, JSON shape, CORS, and rate-limit headers. | Network target must be authorized; private IP protections remain active. |
| `architecture` | architecture map, Mermaid diagram, code structure | Use after SocratiCode/graph narrowing; generate architecture docs/diagrams. | Verify diagrams match discovered files. |
| `brainstorming` | brainstorm, creative feature/design ideation | Use before creative work or behavior changes when requirements need exploration. | Keep brainstorming separate from unapproved implementation. |
| `bundle-tracker` | `/bundle`, bundle size, heavy frontend deps | Run bundle tracker or include in `/ship`. | Warn on missing build artifacts. |
| `code-profiler` | `/profile`, `/code`, backend performance profile | Run static performance review or include in `/ship`. | Findings need file evidence. |
| `content-scorer` | `/content`, content quality, readability, GEO content | Score HTML/content quality and AI-answer structure. | Do not fabricate analytics. |
| `create-image-prompt` | image prompt, PromptDepth, Thai/English prompt creation | Use for prompt generation, not repo code changes unless requested. | Avoid generating disallowed image requests. |
| `cybersecurity` | defensive cyber guidance, secure implementation reference | Use as deeper reference library; prefer `security-audit`, `pentest`, or `secret-scanner` for operational scans. | Authorized defensive use only. |
| `deep-project` | decompose project, vague large project | Use for project-scale decomposition before deep plans. | Verify generated split specs. |
| `deep-plan` | detailed implementation plan, sectionized TDD plan | Use for large spec-first planning. | Verify `claude-plan.md`, TDD plan, and section index. |
| `deep-plan-quick` | lightweight plan, small/medium planning | Use for compact plans before implementation. | Promote to `deep-plan` if hidden complexity appears. |
| `deep-implement` | implement deep-plan sections | Use after valid deep-plan/deep-plan-quick artifacts. | TDD, code review, and repo gates required. |
| `dep-doctor` | `/dep`, dependency health, unused/outdated deps | Run dependency doctor or include in security/ship. | Do not remove packages without evidence and user-requested edits. |
| `deploy` | `/deploy`, deploy, production rollout | Run preflight including ship/security/migrations before deploy. | Explicit confirmation before push/deploy/external side effect. |
| `ga4-client` | `/ga4`, GA4 analytics query | Query GA4 only when env/config is available. | Do not invent metrics; mark missing credentials as skipped. |
| `health-check` | `/health`, SSL, uptime, headers | Run URL health, SSL, redirects, and header checks. | Target must be user-owned/authorized. |
| `llms-txt-generator` | `/llms-txt`, `llms.txt`, AI crawler file | Generate `llms.txt` and `llms-full.txt`. | Confirm output target when overwriting existing files. |
| `migration-checker` | `/migration`, ORM migration state | Run before deploy/release or DB changes. | Destructive migrations require backup-first discipline. |
| `og-validator` | `/og-validator`, Open Graph, social preview | Validate OG tags and image accessibility. | Network target must be authorized. |
| `orchestra` | conductor, multi-step work, end-to-end | Own routing, dispatch, integration, gates, and state. | Maintain `orchestra/` artifacts. |
| `pentest` | `/pentest`, authorized hack test, API/web security verification | Run scanner and authorized verification matrix. | No unauthorized or destructive testing; proof required. |
| `programming-advisor` | build vs buy, should we code this, app/tool idea | Use before building new tools/apps when discovery of existing solutions matters. | Browse current options when recommendations affect spend/time. |
| `redirect-checker` | `/redirect`, redirect chains, HTTPS loops | Check redirect chains and mixed HTTP/HTTPS. | Target must be authorized. |
| `release` | `/release`, changelog, version bump, publish | Generate release notes and prepare release workflow. | Explicit confirmation before tags, GitHub release, npm publish. |
| `rescue` | production incident, site down, errors spiking | Use as incident commander; gather facts, stabilize, recover. | Avoid destructive recovery without backups/approval. |
| `revise-claude-md` | CLAUDE.md audit/update | Scan and improve CLAUDE.md files. | Preserve project-specific instructions. |
| `robots-generator` | `/robots`, robots.txt | Generate robots.txt with sitemap and AI bot directives. | Confirm overwrite when existing robots policy exists. |
| `secret-scanner` | `/secret`, secret scan | Run scanner and remediation playbook. | Never print full secrets; rotate real credentials. |
| `security-audit` | security hardening, OWASP, headers, secrets, deps | Run defensive audit with OAuth/JWT/API key/CI/Docker checklists. | Critical findings block until fixed or accepted by user. |
| `seo-audit` | SEO audit, AI visibility, GEO/AEO | Run complete SEO/GEO/AEO audit and safe fixes. | Mark credential-backed checks as skipped when env missing. |
| `seo-scanner` | `/seo`, direct SEO scanner | Run direct scanner when user wants raw/fast SEO scan. | Prefer `seo-audit` for full consulting workflow. |
| `ship` | `/ship`, launch readiness, pre-deploy scorecard | Combine SEO, security, dependency, bundle, migration, API, and browser checks. | Block on build/test/security/secret/migration blockers. |
| `sitemap-generator` | `/sitemap`, sitemap.xml | Generate sitemap from project routes/metadata. | Confirm overwrite if needed. |
| `structured-data-generator` | `/structured-data`, JSON-LD schema | Generate JSON-LD snippets for common schema types. | Validate JSON output. |
| `visual-diff` | visual regression, screenshots before/after | Run screenshot comparison/browser verification where available. | Mark browser tooling absence as skipped, not passed. |
| `visual-ui-enhancement` | premium UI, responsive, accessibility, shadcn/Tailwind | Use visual UI workflow and its optional agents. | Run visual/accessibility/responsive gates. |

## System Skills Awareness

These system skills are installed under `.system` and should be used when their trigger is explicit:

| Skill | Use |
|---|---|
| `imagegen` | Generate or edit raster images. |
| `openai-docs` | Current OpenAI product/API guidance with official docs. |
| `plugin-creator` | Create local plugins. |
| `skill-creator` | Create or update skills. |
| `skill-installer` | Install skills from curated sources or GitHub repos. |

## Skill Group Shortcuts

- **SEO/content/AI visibility:** `seo-audit`, `seo-scanner`, `content-scorer`, `og-validator`, `sitemap-generator`, `robots-generator`, `llms-txt-generator`, `structured-data-generator`.
- **Security:** `security-audit`, `secret-scanner`, `pentest`, `cybersecurity`, `dep-doctor`, `api-smoke-test`, `health-check`.
- **Launch/deploy/release:** `ship`, `deploy`, `release`, `migration-checker`, `bundle-tracker`, `health-check`, `redirect-checker`.
- **Performance:** `code-profiler`, `bundle-tracker`, `health-check`, `ship`.
- **UI:** `visual-ui-enhancement`, `visual-diff`, `architecture` when diagrams help.
- **Planning/build:** `brainstorming`, `programming-advisor`, `deep-plan-quick`, `deep-plan`, `deep-project`, `deep-implement`.
