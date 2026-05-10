[2026-05-08T02:59:57Z] DECISION: Start a fresh Orchestra session for SmartAIHub SEO/LLM-search audit.
  Context: Existing `orchestra/` directory had no `snapshot.json`, so it was treated as stale session state.
  Alternatives considered: Resume path was not applicable because no snapshot existed.

[2026-05-08T02:59:57Z] DECISION: Use installed-skill-flow with `seo-audit`.
  Context: The user explicitly requested SEO readiness for LLM search on the public tenant.
  Alternatives considered: Generic code review only would miss GEO/AEO and crawler-specific checks.

[2026-05-08T03:02:30Z] DECISION: Do not auto-fix production SEO/robots behavior in this pass.
  Context: The user asked to inspect whether support is good yet, and changing Cloudflare robots policy or sitemap behavior can affect production crawler access.
  Alternatives considered: Direct code fix for robots and sitemap was deferred to backlog.

[2026-05-08T03:09:45Z] DECISION: Apply repo-local SEO/LLM-search remediation after user requested improvements.
  Context: User asked to improve everything that can be fixed.
  Alternatives considered: Waiting for Cloudflare dashboard access; repo-local route/static fixes can be made safely now while external Cloudflare settings remain a deploy-time follow-up.

[2026-05-08T03:09:45Z] DECISION: Allow major AI/search crawler user agents in repo-controlled robots output.
  Context: The goal is LLM search discoverability. `Content-Signal: ai-train=no` remains as a licensing intent signal, but `robots.txt` now avoids repo-level blocking for retrieval/citation crawlers.
  Alternatives considered: Keep Google-Extended/CCBot blocked; rejected for maximum AI visibility per the user's latest instruction.

[2026-05-08T03:15:00Z] DECISION: Implement lightweight semantic prerender snapshots instead of full React SSR.
  Context: The user asked for crawler-readable first HTML. Full SSR would require broader app architecture changes, hydration strategy, and route data loading changes.
  Alternatives considered: Full React SSR/prerender; deferred in favor of a lower-risk server-side HTML snapshot that immediately provides `<main>`, H1, JSON-LD, FAQ schema, and internal links.

[2026-05-08T03:39:08Z] DECISION: Keep Media History UI improvements frontend-only for the first implementation wave.
  Context: The user requested immediate improvement. SocratiCode showed the route can gain pagination, search, and state polish without new backend contracts.
  Alternatives considered: Add backend task search to `media.listTasks`; deferred because it would touch tRPC/service/FastAPI contracts and raise risk beyond the immediate UI request.

[2026-05-08T06:39:35Z] DECISION: Improve Dashboard with existing data and no new charting dependency.
  Context: The user requested a suitable solution with luxury graphics that are useful to real users. The Dashboard already has credit balance, analytics time series, media task stats, active workflows, and approvals.
  Alternatives considered: Add a chart library or new analytics endpoint; rejected for this wave because inline SVG and existing data deliver the requested UX with lower risk and no backend contract change.

[2026-05-08T06:50:03Z] DECISION: Treat maximum-security review as read-only conditional-pass audit.
  Context: The user asked to check completeness, additions, and highest security. The current worktree contains expected uncommitted implementation changes, and remediation may affect auth/email/dependency behavior beyond the latest UI/SEO work.
  Alternatives considered: Apply fixes immediately; deferred so the audit can separate confirmed blockers from recommended hardening without changing unrelated pre-existing security-sensitive code.

[2026-05-08T07:31:23Z] DECISION: Remove XLSX parsing/preview dependency instead of retaining a vulnerable parser.
  Context: `xlsx` has audit advisories with no safe patch path and was used in both server file parsing and browser spreadsheet preview.
  Alternatives considered: Keep `xlsx` with extra validation; rejected because `npm audit` would remain vulnerable and untrusted workbook parsing would stay in runtime.

[2026-05-08T07:31:23Z] DECISION: Force-upgrade `nodemailer` and upgrade `@google-cloud/tasks` to clear audit.
  Context: The user requested maximum-security remediation. `npm audit --omit=dev` required a major nodemailer upgrade and a newer Google Tasks SDK chain to reach zero vulnerabilities.
  Alternatives considered: Leave moderate/low advisories documented; rejected because targeted tests and typecheck could verify the upgrade path.

[2026-05-08T08:40:00Z] DECISION: Fix the ISC maintenance failure through canonical path resolution and proposal contract hardening.
  Context: The failed apply run showed `intelligence-skill-creator` resolving paths inside nested `/runs/workspaces/`, which can create polluted roots and proposal paths that cannot be safely applied.
  Alternatives considered: Retry-only admin handling; rejected because retrying the same polluted root would reproduce the failure without correcting runtime/proposal contracts.

[2026-05-08T08:40:00Z] DECISION: Support JSON ISC proposals in addition to legacy diff proposals.
  Context: ISC-generated improvements may be persisted as JSON file maps, while the apply path previously assumed patch/diff format.
  Alternatives considered: Convert JSON proposals to diff before apply; rejected because direct JSON map application with strict path containment is simpler and easier to test.

[2026-05-08T08:40:00Z] DECISION: Treat no-change ISC completions as successful maintenance outcomes.
  Context: Several maintenance rows report "No patches generated" even after successful heuristic/test passes.
  Alternatives considered: Mark every no-patch run as failed; rejected because no-change is a valid terminal state when tests already pass or heuristics produce no proposal.

[2026-05-08T18:20:00+07:00] DECISION: Improve maintenance observability in the UI instead of deleting or hiding historical failed runs.
  Context: The user still sees an old workspace-root error and cannot tell which rows are old, new, pending, or done.
  Alternatives considered: Auto-normalize or hide workspace-root failures; rejected because these are real retryable historical diagnostics, not no-change successes.

[2026-05-08T18:20:00+07:00] DECISION: Use existing timestamps and counts rather than adding a new maintenance summary endpoint.
  Context: The router already returns recommendation timestamps and apply-run timestamps/counts.
  Alternatives considered: Add a backend dashboard summary procedure; deferred because the UI can compute the requested visibility with less API surface risk.

[2026-05-08T18:31:00+07:00] DECISION: Treat no-patch legacy upgrade queue rows as no-action history in the UI.
  Context: The screenshot showed an approved row whose latest run completed without code changes, but the primary button still said "Generate proposal", making the next step unclear.
  Alternatives considered: Keep the button enabled and rely on details text; rejected because the row already has terminal no-change evidence and should not invite duplicate proposal generation.

[2026-05-08T18:56:00+07:00] DECISION: Auto-remediate classified maintenance states instead of waiting for admin confirmation.
  Context: The user clarified that the system should intelligently find problems and fix as much as possible automatically.
  Alternatives considered: Keep a manual "Fix" or confirmation button; rejected for safe, classified states because no-change normalization and workspace-root retry already have bounded server-side admin mutations.

[2026-05-08T18:56:00+07:00] DECISION: Limit automatic retry to workspace-root/path-pollution failures only.
  Context: Retrying all failed apply runs could waste model calls or repeat compatibility failures.
  Alternatives considered: Bulk retry every failed/blocked row; rejected because unknown failures still need inspection or better classifiers.

[2026-05-08T19:16:00+07:00] DECISION: Auto-queue actionable legacy upgrade backlog and treat completed proposal runs as monitor-only.
  Context: The user clarified that the page should not leave admins needing to ask an LLM what to do next for each pending skill.
  Alternatives considered: Keep manual selection buttons; rejected because the server already has compatibility gates and proposal-first behavior, so actionable rows can be queued automatically.

[2026-05-08T19:16:00+07:00] DECISION: Resolve legacy skill slug aliases before failing local-folder checks.
  Context: `grok-imagine-creator` had no folder under that legacy slug, but the system already aliases it to `grok-imagine-prompt-planner`, which has a native skill folder.
  Alternatives considered: Mark the recommendation permanently failed; rejected because alias resolution gives the system enough information to continue automatically.

[2026-05-08T19:24:00+07:00] DECISION: Hide completed/proposal-ready maintenance history from the default monitor.
  Context: The user clarified completed rows should not remain visible unless a later sweep creates a fresh recommendation.
  Alternatives considered: Keep completed rows with "review proposal" guidance; rejected because the monitor should show active backlog by default, while history remains available through the include-history control.

[2026-05-08T19:29:00+07:00] DECISION: Treat default queued apply-run "All" as active/problem runs, not history.
  Context: The screenshot still showed completed apply runs in the queued apply-run monitor because that endpoint was separate from the recommendation queue.
  Alternatives considered: Hide completed rows only in React; rejected because the API should not send terminal history for the default monitor state.

[2026-05-09T14:52:47+07:00] DECISION: Implement full-slide image mode as a frontend media-generation path that outputs image-only slide JSON.
  Context: The user wants Article Builder to send each whole slide to the selected image provider, including text baked into the generated image, then import those results into Presentation Edit.
  Alternatives considered: Add a new backend slide skill; deferred because the selected media model already owns image generation and the importable output can be represented safely as one full-canvas image element per slide.

[2026-05-09T14:52:47+07:00] DECISION: Use a segmented button control for slide visual mode instead of a select.
  Context: Adding a select would introduce another `combobox` role and risk breaking existing PresentationEditor tests that target older combobox indices.
  Alternatives considered: Keep the select; rejected because segmented mode buttons match the UI pattern for mutually exclusive modes and avoid disturbing existing combobox ordering.
