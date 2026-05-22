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
- For image generation, route through `gpt-image-2` first. In Codex, `gpt-image-2` should render the final prompt and then use the host-native image tool/auth path rather than local API scripts.

## Planning Skill Order

Use this order when the user asks for ideation, planning, decomposition, or
implementation:

1. `brainstorming` first only when product direction is not yet chosen.
   - Use it for open-ended ideation, concept exploration, option selection,
     audience/workflow discovery, or creative feature direction.
   - Examples: "ช่วยคิดระบบใหม่", "brainstorm feature ideas", "ออกแบบ concept",
     "ยังไม่แน่ใจว่าควรทำแบบไหนดี".
2. `deep-project` first when the project/module/system goal is already concrete
   enough to split into multiple work units.
   - Use it for project-scale decomposition, vague large systems that still have
     a chosen target, or "แตกงาน/แบ่ง module/วาง roadmap".
3. Chain them only when both are needed:
   - `brainstorming` -> `deep-project` -> per-split `deep-plan` -> `deep-implement`
   - This is appropriate when the user starts from an idea space, then chooses a
     direction that becomes a project-scale build.
4. Skip `brainstorming` when the user explicitly provides a direction and asks
   to decompose or execute.
5. Skip `deep-project` when the result is a small/medium feature; use
   `deep-plan-quick` or `deep-plan` instead.

## Code-Aware Help And Tutorial Workflow

Use this workflow when the user asks to create product help, onboarding,
walkthroughs, feature explainers, internal docs, demo scripts, release tutorials,
or professional learning material from an existing page, feature, or flow.

1. Discover the real feature behavior from code first.
   - Use SocratiCode when active to locate routes, pages, components, API calls,
     state machines, permissions, and edge states.
   - Verify with targeted file reads and `rg`; do not invent product behavior.
2. Create the help content backbone.
   - For written help, produce concise help docs with user goals, steps, states,
     caveats, and troubleshooting.
   - For video-capable help, use `web-video-presentation` Phase 1 to create
     `script.md` and `outline.md` from the discovered code behavior.
3. Add premium visual support.
   - Use `gpt-image-2` by default for illustrative hero images, concept frames,
     feature diagrams, empty-state visuals, and polished help-center artwork.
   - In Codex, use the host-native image tool/auth path after `gpt-image-2`
     renders the prompt.
4. Create a video companion when useful.
   - Use `web-video-presentation` for a screen-recordable 16:9 walkthrough or
     cinematic explainer.
   - Confirm before scaffolding, npm installs, TTS, or external audio generation.
5. Integrate professionally.
   - If help is added inside the product UI, route UI implementation through
     `visual-ui-enhancement` and run visual/accessibility/responsive gates.
   - Keep source-derived claims traceable to files or observed behavior.

## Complete Installed Skill Map

| Skill | Trigger Examples | Orchestra Handling | Safety/Gates |
|---|---|---|---|
| `api-smoke-test` | `api-smoke-test`, `/api-smoke`, API route smoke test | Run API route checks for status, JSON shape, CORS, and rate-limit headers. | Network target must be authorized; private IP protections remain active. |
| `architecture` | architecture map, Mermaid diagram, code structure | Use after SocratiCode/graph narrowing; generate architecture docs/diagrams. | Verify diagrams match discovered files. |
| `brainstorming` | brainstorm, creative feature/design ideation, คิดไอเดีย, ออกแบบ concept | Use only as the ideation prelude when direction/options/audience/workflow are not yet settled; after direction is chosen, route to quick plan, deep plan, or deep-project by scope. | Keep brainstorming separate from unapproved implementation; capture chosen direction and open blockers before planning. |
| `bundle-tracker` | `/bundle`, bundle size, heavy frontend deps | Run bundle tracker or include in `/ship`. | Warn on missing build artifacts. |
| `code-profiler` | `/profile`, `/code`, backend performance profile | Run static performance review or include in `/ship`. | Findings need file evidence. |
| `content-scorer` | `/content`, content quality, readability, GEO content | Score HTML/content quality and AI-answer structure. | Do not fabricate analytics. |
| `create-image-prompt` | image prompt, PromptDepth, Thai/English prompt creation | Use for prompt generation, not repo code changes unless requested. | Avoid generating disallowed image requests. |
| `cybersecurity` | defensive cyber guidance, secure implementation reference | Use as deeper reference library; prefer `security-audit`, `pentest`, or `secret-scanner` for operational scans. | Authorized defensive use only. |
| `deep-project` | decompose project, vague large project, แตกงานระบบ, แบ่ง module | Use when a concrete project/module/system goal is ready to split into multiple specs; do not use it for open-ended ideation unless `brainstorming` has first settled the direction. | Verify generated split specs and continue to per-split deep-plan. |
| `deep-plan` | detailed implementation plan, sectionized TDD plan | Use for large spec-first planning. | Verify `claude-plan.md`, TDD plan, and section index. |
| `deep-plan-quick` | lightweight plan, small/medium planning | Use for compact plans before implementation. | Promote to `deep-plan` if hidden complexity appears. |
| `deep-implement` | implement deep-plan sections | Use after valid deep-plan/deep-plan-quick artifacts. | TDD, code review, and repo gates required. |
| `dep-doctor` | `/dep`, dependency health, unused/outdated deps | Run dependency doctor or include in security/ship. | Do not remove packages without evidence and user-requested edits. |
| `deploy` | `/deploy`, deploy, production rollout | Run preflight including ship/security/migrations before deploy. | Explicit confirmation before push/deploy/external side effect. |
| `ga4-client` | `/ga4`, GA4 analytics query | Query GA4 only when env/config is available. | Do not invent metrics; mark missing credentials as skipped. |
| `gpt-image-2` | image generation, image editing, GPT Image 2, poster/product/UI/diagram prompt | Default image workflow. In Codex, use GPT Image 2 prompt templates and route execution through the host-native Codex image tool/auth; use local OpenAI API scripts only on explicit request or non-Codex hosts. | Never ask for API keys when Codex image tooling is available; confirm before custom `OPENAI_BASE_URL` or local API calls. |
| `health-check` | `/health`, SSL, uptime, headers | Run URL health, SSL, redirects, and header checks. | Target must be user-owned/authorized. |
| `kb-retriever` | local knowledge base, `knowledge/`, search local docs, answer from docs/PDF/Excel | Navigate `data_structure.md`, progressively search local corpus, and cite files. | Stay inside authorized knowledge root; no web search unless explicitly requested. |
| `llms-txt-generator` | `/llms-txt`, `llms.txt`, AI crawler file | Generate `llms.txt` and `llms-full.txt`. | Confirm output target when overwriting existing files. |
| `migration-checker` | `/migration`, ORM migration state | Run before deploy/release or DB changes. | Destructive migrations require backup-first discipline. |
| `og-validator` | `/og-validator`, Open Graph, social preview | Validate OG tags and image accessibility. | Network target must be authorized. |
| `orchestra` | conductor, multi-step work, end-to-end | Own routing, dispatch, integration, gates, and state. | Maintain `orchestra/` artifacts. |
| `sub-agents` | sub-agent registry, agent prompts, generated `ssp-*` agents, dispatch roles | Treat as a support/reference pack used by Orchestra; update it when adding or changing agent roles. | Run `bash skills/generate-claude-agents.sh`, `bash skills/audit-skills.sh`, and installed sync verification after changes. |
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
| `web-design-engineer` | standalone visual web artifact, prototype, HTML deck, animation, data visualization | Use for standalone visual artifacts; prefer `visual-ui-enhancement` for existing product UI changes. | Global Codex frontend rules override this skill on conflicts; record browser evidence with `ui-browser-verification.md` when routed through orchestra. |
| `web-video-presentation` | web video presentation, dynamic deck, screen-recordable explainer, narrated web talk | Build click-driven 16:9 React/Vite presentations with chapter/step narration and optional audio. | Confirm before scaffolding, npm installs, TTS, mmx, or external side effects; no sub-agent requirement. |
| `visual-ui-enhancement` | premium UI, responsive, accessibility, shadcn/Tailwind | Use visual UI workflow and its optional agents. | Run visual/accessibility/responsive gates and `ui-browser-verification.md` for browser-visible workflows. |

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
- **Image generation:** `gpt-image-2` by default; use host-native Codex image execution when available.
- **UI:** `visual-ui-enhancement`, `web-design-engineer`, `visual-diff`, `architecture` when diagrams help.
- **Help/tutorials:** `web-video-presentation` for `script.md`/`outline.md` and video companions, `gpt-image-2` for premium imagery, `visual-ui-enhancement` for in-product help UI.
- **Knowledge retrieval:** `kb-retriever` for local knowledge folders and multi-format corpora.
- **Video/decks:** `web-video-presentation` for narrated, screen-recordable web presentations.
- **Planning/build:** `brainstorming` for unsettled direction, then `deep-project` for project-scale decomposition, then `deep-plan`/`deep-plan-quick`, then `deep-implement`.
