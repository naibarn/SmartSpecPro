# Spec 256 R1.1 — 14-pass gap audit and immediately applied revisions

**Date:** 2026-09-28  
**Baseline:** exact user-supplied R1.0 Markdown (630 lines) and R1.0 ZIP containing two JSON Schemas, two examples and one sample Skill.  
**Cross-spec basis:** saved Spec 248 R1.4, Specs 253/254 R1.3 and Spec 255 R1.0; public stable `ext-skills` protocol reference.  
**Method:** fourteen distinct, sequential architectural/contract review passes. “Addressed” means an explicit design/contract/test requirement was added; it does not imply code was implemented or production tested.

| Pass | Review dimension | R1.0 gap / observed risk | Concrete R1.1 change | Evidence/remaining gate |
|---:|---|---|---|---|
| 01 | Numbering and canonical ownership | 256 unverified in live repository; multiple related specs own registry, actions and external execution | §17.1 owner-fit report and conflict decision; G0 gate | Still `PROVISIONAL`; live registry + owner sign-off required |
| 02 | Feature scope and rollout | §8 classified `film.scene.replace` and `film.video.edit` P0 while G4 described scene generation as optional | §8 P1 + P0 optional-qualified; §17.2 honest release classes | Runtime minimum Film slice still requires implementation |
| 03 | Contract completeness | R1.0 ZIP had only Card and Intent Candidate Schemas although document defined offer/search and needed mode/receipt | 5 new JSON Schemas, 5 new fixtures; §22 contract mapping | Current deployed schema fit remains G0 |
| 04 | Plan structure | Schema could accept one selected capability but a different step ID, duplicate step IDs or a cyclic bounded plan | Optional step dependency/effect fields; §19.2 semantic validator; C49–50 | Unit fixtures included; production resolver must enforce |
| 05 | Intent and scope discipline | “preview” ambiguous: free read vs paid derivative; negated user constraints need persistent authority | §18.2 paid-preview preflight, §19.1 ModeDecision and no-escalation rules; C52–55 | LLM Thai/English live evaluation at G3 |
| 06 | Atomic function effects | A one-function adapter could hide expensive preprocessing, external egress or unrelated generation | §18.1 EffectBudget and prerequisite classification; C51/53 | Actual function adapters must expose full effect profile |
| 07 | Offer qualification & substitution | READY status expired between catalog and dispatch; cancellation boolean overstates guarantees | Offer revision, scoped TTL and cancellation enum, §18.2/18.3; C56–57/75 | Live provider receipts and Runner checks needed |
| 08 | Skill integrity and injection | Need mandatory frontmatter/manifest/load consistency at selection; prevent implicit tool activation | §20.2 origin-bound lazy load, digest/frontmatter and content-bound grant checks; C61–65/78 | Spec 248 owns transport and actual implementation |
| 09 | MCP Skills interoperability | Risk of presenting local convenience APIs as standard wire or conflating Agent Card with Agent Skill | §20.2/20.3 distinct MCP Tool, Skill release and A2A Agent Card; C62/66 | Pinned actual client/server protocol tests at G5 |
| 10 | Catalog isolation | ACL revocation/index lag/cursor replay could leak hidden catalog counts or aliases | §20.1 scope-bound opaque cursor, per-read recheck, public evidence sanitization; C58–60 | Two-tenant timing & privacy tests remain G7 |
| 11 | Agent / Mini App least privilege | User's global entitlement might improperly be reused by embedded chat or delegated Agent | §20.3 intersection of app grants/user/project/asset; fresh universal handoff; C67–68 | Real authenticated harness integration remains G5 |
| 12 | Film timebase, pass and color accuracy | Existing guardrails lack full VFR PTS, relative depth, alpha convention and protected pixel validation contract | §21.1–21.2 typed clock/pass provenance and QC; C69–73 | Real fixture media and actual output QC remains G4 |
| 13 | Jobs, approval and billing recovery | Resumed plan could reuse stale approvals/changed mask; cancel UI might promise nonexistent refunds | §18.2/18.3 and §19.2 exact artifact approval, unknown-paid outcome; C54–55/75–76/78 | Actual job/credit/approval contract proof required G6 |
| 14 | Compatibility, tests and rollback | No packaged cross-contract test runner; breaking assumptions might affect frozen and active specs | Contract test script, §22–24 G0–G7 and C79–80; flags remain OFF | Live code/regression/canary not certified |

## Scope controls maintained throughout all passes

- Specs 1–214 and active Spec 224 remain unchanged; all changes are in this **new Spec 256 proposal and illustrative implementation pack**.
- Spec 221 publishes and approves Skills; Spec 248 owns MCP Skills wire compliance; Feature 196 owns canonical intent and capability invocation; 253 owns product actions; 254 owns Film external execution; 255 owns semantic media; 215 owns Workflow; existing job/billing/approval owners remain authoritative.
- No account/backend entitlement or provider feature is assumed; the `NOT_IMPLEMENTED`/`CONDITIONAL` distinctions are retained.
- R1.1 adds acceptance scenarios C256-49..80 (32 new) on top of R1.0 C256-01..48 (48), totaling **80 defined acceptance scenarios**. These are specification requirements, **not** 80 completed production tests.

## Audit evidence and limits

The pack includes a self-contained local static test script exercising JSON Schema shape and sample validity, negative mutation fixtures, bounded-plan semantic validation, Skill YAML checks and requirements-to-document markers. Its successful execution is evidence about the proposed files alone. No repo-level typecheck, DB migration, policy-provider integration, live MCP interoperability, real GPU media output, customer charging or owner approval is claimed.

## Required open owner checks before implementation

1. Number 256 and adjacent proposed specs must be reconciled against current SmartSpecPro main, worktrees, PRs and owner registry.
2. Validate every proposed read projection/optional field against the actual Feature 196/Spec 253 schemas; never create duplicate writable state.
3. Pin currently deployed MCP server/client revision to stable `io.modelcontextprotocol/skills` schemas and run Spec 248's conformance suite.
4. Test G2–G7 with deployed approval/billing/worker_jobs, rights/consent, two tenants and qualified local/cloud media offers before enabling any feature flag.
