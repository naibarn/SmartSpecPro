# Output Contract — Vertical Drama Quality Ledger Planner

Every output must validate against `schemas/output.schema.json` first, then the individual ledger rows inside `ledgers` are re-validated by `server/services/verticalDramaLedgerPlanner.ts` against `verticalDramaQualityLedgersSchema` (`shared/verticalDramaSeries/qualityLedgers.ts`). Any row that fails the stricter zod row schema is DROPPED (not the whole response) — the deterministic post-parse step never throws, mirroring `analyzeSeasonDramaturgy`'s "never throw" convention.

Required top-level fields: `contract_version`, `ledgers`, `causal_chain_map`.

`ledgers` MUST use the exact camelCase keys: `evidenceLedger`, `characterActivationLedger`, `threatLadder`, `consequenceLedger`, `threadLedger`, `worldRuleLedger` — these are the SAME field names the story pipeline's storage/reconciliation schema uses everywhere else.

`character_profiles` is a reserved, currently-unused array (Feature 132 §8, F132H) — always return it empty; a future section may extend this contract to populate it.

All outputs are structured JSON; free-form prose only inside named string fields (`label`, `rule`, `decision`, `description`, `detail`).
