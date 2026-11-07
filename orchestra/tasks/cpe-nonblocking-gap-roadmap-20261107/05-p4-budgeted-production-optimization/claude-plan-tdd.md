# P4 Focused Test Plan

## Estimate and reservation

Verify estimate snapshots include the operation, quantity, configured model/provider and price/version inputs. Test price changes between estimate and dispatch, concurrent reservations at the cap, insufficient budget, duplicate request keys and provider incompatibility. A rejected budget operation remains a normal existing budget outcome; CPE quality must not be reported as its cause.

## Settlement and ambiguous outcomes

Exercise provider accepted/client timeout, missing task ID, duplicate webhook, webhook/worker race, worker restart, repeated settlement, cancellation while unknown, confirmed failure/refund and confirmed success. Assert one dispatch per authorized operation, one debit/settlement, no refund before outcome resolution, and reconciliation evidence tied to the same provider task and tenant.

## Recommendations and learning

Test optimizer disabled, missing, timeout, malformed result, stale QC, replaced asset revision, disallowed model, incompatible capability, higher estimated cost and user rejection. Assert current configured routing remains available, no implicit paid retry/substitution occurs, and learning records cannot mutate prompt/model/asset or production eligibility without existing explicit authorization.

## Non-blocking acceptance matrix

For each advisory or unavailable CPE condition (low aesthetic score, identity/continuity warning, stale or missing QC, analytics failure, optimizer failure, optional audio failure), compare baseline and CPE-enabled eligibility and assert the same image/video operation remains dispatchable when existing hard controls pass. Separately prove that invalid authorization, tenant ownership, content safety, cancellation, provider capability and budget still prevent dispatch.

## Commands and evidence

Use the repository's focused Vitest command for the owned credit/provider/CPE files: `pnpm --filter @smartspec/web exec vitest run <focused files>`. Capture exact source revision, command/scope, time, resource evidence and outcome per Spec 224. Do not run local `npm run typecheck` or broad tests as a prerequisite for a safe checkpoint.
