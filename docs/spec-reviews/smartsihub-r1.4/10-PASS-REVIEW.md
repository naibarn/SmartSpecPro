# 10-Pass Architectural and Implementation-Freedom Review — SmartAIHub SPEC-312…317

**Review basis:** all six R0.1 spec files, README, Codex M0 mission, work packages, target YAML and inventory template, plus the inspected SPEC-311 R1.1/2026-11-01 decommission record, selected SPEC-207/280/293/295/304/261 contracts and code files on `naibarn/SmartSpecPro` main. **Review outcome:** R0.2 edited; no implementation/deployment claim.

| Round | Focus / R0.1 gap | R0.2 correction | Files touched |
|---:|---|---|---|
| **01** | Production hostname could be interpreted as provisional / old legacy host still called production in references | Set `smartsihub.com` CONFIRMED PRODUCTION; named Debian target mapping; preserve legacy access | 312, 315, README, target YAML, Codex |
| **02** | Serial G0 inventory before first code and G0→G6 gates delay implementation | Inventory continuous and parallel; remove global pre-code gate; separate roadmap from permission decisions | 312, 313, Work Packages, Codex |
| **03** | `C1–C10` Core tests interpreted as a universal beta blocker | Converted to evidence rows, first login/Shell Core beta slice, explicit known issue list | 313, 312, Codex |
| **04** | Actual end-user/browser tests considered last acceptance step | User-accessible Debian URL and restricted Cloudflare beta early, human feedback/fix/redeploy loop | 312, 313, 314, 315, 317, Work Packages |
| **05** | Development parity risk: sandboxed fake permissions/credits and extra approval hierarchy | Explicit same real user/tenant/RBAC and canonical wallet policy for authorized dev; scoped side-effect authority | 313, 315, README, target YAML |
| **06** | Shared Postgres write races, finance duplicate settlement and wrong-domain deployments are real hazards | Narrow affected-operation stops only; exact target, no second ledger, one writer, rollback and audit | 312, 313, 315, 317 |
| **07** | Cloudflare beta held hostage to staging resource decommission and full 24h/full-legacy soak | Minimal freshly scoped Worker, staging optional/transient, local workerd caveats; no reusing deleted resource IDs | 312, 314, 315, 316, applicability note |
| **08** | GitHub PR approvals, path-filtered checks and large CI could re-create approval/build bottlenecks | Targeted checks, required always-run summary, direct Wrangler, no blanket review for autonomous dev | 316, Codex, Work Packages |
| **09** | New Module deployment may still require Shell rebuild and hidden apps/web imports | Explicit route/asset prefix/version independence, stable Shell nav, no importing legacy runtime; per-module beta | 314, 317, 316 |
| **10** | SPEC-311 full-legacy migration conflicts with independent new-domain launch; no clear status taxonomy | Draft additive 311/295 applicability note; mark beta vs stable vs legacy-retired; no false 'complete' claims | 312, 317, 316, README, applicability note |

## Resulting decision matrix

| Event | Action in new design |
|---|---|
| UI incomplete but account route works | Deploy affected Core/UI slice to developer UAT; label beta, file issue |
| Unrelated Module fails a test | Continue Core/other modules; fix failing Module separately |
| Inventory not exhaustive yet | Keep discovering and publishing unknowns; never claim full legacy retirement |
| Core/Module ready for first real user | Targeted Debian workerd smoke, source-pinned Cloudflare Worker, restricted `smartsihub.com` beta and actual user observation |
| Full SPEC-311 legacy cutover unready | Old Debian routes continue; new-domain release unaffected |
| Finance writer or session authority unverified | Withhold **that mutation/auth path**, not unrelated account UI/read-only modules |
| Cross-tenant access/secrets or wrong deploy target | Stop affected operation, contain/revert and record exact evidence |
| Missing Cloudflare credentials | Report precise non-delegable credential/zone problem; keep local implementation moving |
| Cloudflare bundle/CPU budget soft warning | Profile/optimize in next iteration, subject to actual hard platform limits |
| User finds a bug | Record reproduction, implement/fix targeted module, redeploy, ask same tester to verify |

## Cross-source factual observations

1. In canonical GitHub, `scripts/release-dev-web.sh` and `verifyDevWebConfig.mjs` encode the prior `aimarkethubs.com` legacy-dev routing, while `devWebDatabase.mjs` currently requires a `_dev` DB/role in development mode. No blind global domain replace is appropriate.
2. Canonical `.github/workflows/cloudflare-deploy.yml` includes an `apps/web` Vite build with high Node heap, so the new platform must have independent targeted CI.
3. SPEC-311 R1.1 on 2026-11-01 records application migration compute and Queue/Hyperdrive teardown; a new platform beta cannot reuse old deleted IDs as if live.
4. Cloudflare local workerd does not reproduce full Cloudflare network and Hyperdrive behavior; a *brief, specific* remote binding probe is still needed for enabled live features. This is **not** a full-system permission gate.
5. GitHub documents that path-filtered required workflows can leave PR checks Pending; the new workflow must not require checks that are skipped.

## Safety/interlock interpretation — narrow, not bureaucratic

A targeted safety stop is for observed or credibly demonstrated risk of data loss, tenant leak, secrets exposure, fraudulent/duplicate financial mutations or deploying to a wrong account/host. The agent may continue independent work; no new second approvals/queues/workflows should be created. The owner's request to deploy for user testing is recorded in R0.2, but **does not magically grant Cloudflare API privileges not present in the connected runtime**. No persistent services should be provisioned merely to satisfy historical readiness UI.

## Audit scope and limitations

This is ten separate **document/architecture analysis passes**, reflected in concrete edits; it does not imply ten runs of browser E2E tests, security scans or successful deployments. R0.2 is still a draft until integrated into the canonical GitHub SPEC registry. No live DNS, databases, Cloudflare accounts or repository branches were changed by this review.
