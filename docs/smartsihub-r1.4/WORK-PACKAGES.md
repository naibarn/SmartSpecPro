# R1.1 CANONICAL DELIVERY PRIORITY (overrides tentative old waves)

| Rank | Team/Run work | Deliverable / internet proof | Task creator |
|---|---|---|---|
| **P0** | Repair/prove existing autonomous implements and Mini App Creator | One real Goal→Run→code→build→deployed URL on `aimarkethubs.com`; old `smartaihub.app` usable, no approval loop | **existing `smartaihub.app` Autonomous UI** |
| **P1** | New Hono/TS Core + React Shell | Existing account/tenant login and job admission at new Debian URL | Existing autonomous UI |
| **P2** | Chat migration FIRST | Authenticated real model streaming/chat/action/credit job via new Chat module | Existing autonomous UI |
| **P3** | Mini App Creator migration SECOND | Create/edit/deploy new app with independent D1/DB and UAT URL | Existing autonomous UI + existing Mini App Creator |
| **P4** | New Autonomous Implements + Task/Mission view | New system independently completes real code change/test/build/deploy + continues child tasks | Existing autonomous UI |
| **P5** | Selected development Goal handover | New system becomes owner of selected Goals after no-duplicate-job and rollback proof; old remains fallback | Both, mutually exclusive per Goal |
| **P6** | Public Astro website/Creator portfolio/Mini App marketplace | Public creator + app listing + first supported commerce journey | New autonomous UI where proven |
| **P7** | Other modules, separately | Library/RAG, Task Control advanced, Media, Video, Documents, Social, etc. | New autonomous UI, legacy fallback if needed |

**This is priority not a blocking release gate.** Parallel work that does not delay Core→Chat→Creator→new Autonomous is allowed. Repairs to old control plane preempt the failing development action, not the entire project. Relevant canonical documents: [SPEC-324](../../specs/feature/324-smartsi-autonomous-bootstrap-self-hosting-and-handover/spec.md) and [ROADMAP](ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

---

# R1.0 — Parallel Work Packages, not global gates

| WP | Independent deliverable / useful UAT | Dependencies | Release focus |
|---|---|---|---|
| WP-UI1 | Design brief + versioned SmartSIHub token profile + accessible Storybook primitives | 287/270 source registry | Human visual review, no blanket blocker |
| WP-UI2 | Action Contract and one headless `/api/v1/actions/...` usable from CLI + UI | 256/199/313 | Same auth, tenant, billing, job id |
| WP-UI3 | Browser WebMCP adapter + feature detection + tests on supported Chromium | UI2 + 319 | Browser only, no fake server MCP |
| WP-WEB1 | Brand-new Astro public website + mobile pages | 320 | Static and SSR production-ready slices |
| WP-WEB2 | Creator profile, portfolio, ownership/visibility and linking owned Mini Apps | 303/304 | Human publishes and sees listing |
| WP-WEB3 | Mini App listings, categories, search, SEO/demos | 261/304/320 | Visitors discover, preview and use |
| WP-SRV1 | Service offers/packages/quote/order + reviews (minimal) | 320/207/303 | Creator posts service, customer contacts |
| WP-ECO1 | Audit ALL legacy credits/package/rounding/price unit code & DB schema read-only | 207/321 | Unit-aware impact report |
| WP-ECO2 | Credit V2 adapter with preserved value x10 + legacy/new coordinated compatibility | ECO1 | Existing user sees correct balance |
| WP-ECO3 | Four-role attribution policy and verified recipient-user wallet credit settlement | 280/303/207/321 | Correct sum, recipient user grants, duplicate safety and refunds |
| WP-ECO4 | Monthly Mini App subscription limited to newly authored exclusive App Skills; shared Skills charged each distinct invocation | ECO2/3 + Job contracts | App-exclusive included action no debit; shared/nested action quoted + debited once |
| WP-ECO5 | One-time affiliate/referral user credit award, Platform-budget funded and wholly outside four-role split | ECO2 + existing ledger + referral owner binding | One qualifying referral credits referrer once; repeats/fraud/refund safe |
| WP-ECO6 | Categorized credit provenance + balance/earnings/bonus reporting; future-withdrawal data fields only | ECO2/ECO3 | Existing single wallet, no cash withdrawal feature or implied cash guarantee |
| WP-JOB | Canonical job/skill integration; Rust supervisor remains independent | 318 | Async processing and recovery |
| WP-DEP | Independent Astro/React/Module deployment from tested Debian to Cloudflare | 315/316 | `smartsihub.com` scoped beta |

Start UI + public page + read-only wallet inventory NOW while finance compatibility and Rust supervisor proceed independently. Publishing safe demo pages must not wait for future withdrawals or historical conversion. Charge/money pathways must only activate once their own unit/ledger rules are compatible.

**R0.8 targeted UAT:** in one subscribed Mini App, verify (A) newly authored exclusive Skill at 0 additional credits, (B) shared Skill charges user credits once per distinct invocation, (C) nested shared calls charge independently, and (D) Queue retries do not double-charge. Surface shared quote before execution; do not stop unrelated UI deployment.


**R0.8 delivery note:** Keep exactly four allocated owner roles; use existing credit ledger to increment verified recipient user balances after successful charge/recognized subscription period. Referral is a separate once-only Platform-funded credit bonus. Payout-to-cash design is future scope and cannot block launch of credit earnings.


## R0.9 — Agentic payments independent work packages

| WP | Implement / narrow user UAT | Financial safety behavior |
|---|---|---|
| WP-PAY1 | Separate platform plans/verified monthly credit grants in existing user wallet | Once per verified paid period; failed renewal no credits |
| WP-PAY2 | AgentSpendAuthority, MCP/HTTPS quote/reserve/receipt; browser not needed | Payer/tenant/amount/time limits; revocation |
| WP-PAY3 | Prepaid top-up via existing Beam/PromptPay API; pending human flow as needed | PSP-confirmed amount/currency before one-time grant |
| WP-PAY4 | Auto top-up via scoped saved PSP token when available | Bounded mandate; no raw credentials to Agent |
| WP-PAY5 | Quote, active reserves, partial usage and class-based PAYG limit | Atomic with existing `worker_jobs`; debit actual, release rest |
| WP-PAY6 | PAYG invoicing, PSP collection, debt state and pending creator earnings | Don't grant unfunded spendable creator credits |
| WP-PAY7 | ACP/UCP/AP2/x402/network adapter exploration; opt-in provider qualification | No claim supported without real credentials and E2E acceptance |
| WP-PAY8 | Human platform-plan UI + Mini App plan distinction + account-first | Shared Skills still billed separately |

Run WP-PAY1/2/3 alongside UI/Public development; work toward WP-PAY5 with scoped tests, not a blanket release gate. Payment adapter integrations are independent.

## R1.0 — Mini App deployment and storage work packages (parallel slices)

| WP | Useful UAT result | No global dependency gate |
|---|---|---|
| WP-APP1 | Public Mini App in Marketplace with stable appId and independent `/apps/...` launcher | Core listing + owner binding |
| WP-APP2 | New App A receives dedicated platform D1, can write business row, App B cannot read it | App resource binding + minimal D1 pilot |
| WP-APP3 | Owner binds custom domain to isolated App runtime, same App ID and Core login/credits | Domain verification + small deployment |
| WP-APP4 | BYOC owner Cloudflare Worker + own D1 + signed Core API | Owner-scoped credentials + narrow interface |
| WP-APP5 | Promote App data from D1 to separate managed PostgreSQL or owner PG | Explicit schema translation/snapshot/cutover |
| WP-APP6 | Creator exports source and self-hosts on own server/DB | Owner-owned deployment artifact + Core API client |
| WP-APP7 | Register exact Legacy shared-DB exceptions and prove new App cannot create Core business table | Existing PostgreSQL catalog evidence |

These are **independent delivery slices**, not mandatory sequence/overall go-live blockers. Preserve `smartsihub.com` as confirmed new production domain.

## R1.3 — CU work package

CU0 reconcile SPEC-208 Rev9 (Moli disabled; Clef-first already planned). CU1 durable Chat headless task + artifact. CU2 Playwright Creator browser verification. CU3 authorized Runner GUI use. CU4 optional Kitesurf stateless beta and Browser Run human handoff. CU5 Clef-flash shadow routing; then limited safe routing. CU6 crash/retry/no-double-charge tests. Each slice can deploy independently without stopping unrelated Core/Chat work.
