# Progress

## Loop ledger

- Iteration 1: inspected route, worker queue, client mutation, retry helper, local DB, and production health. Root cause confirmed.
- Iteration 2: moved Marketplace idea generation to the existing interactive job queue and added client polling.
- Iteration 3: focused queue wiring tests passed; final checks are limited to formatting/diff and targeted static proof because the user prohibited `npm run typecheck` for RAM reasons.
- Iteration 4: added explicit Marketplace/upload source handling, uploaded-product brief validation and guidance, normalized user brief forwarding, and reused the same background job for both sources.

## Stop condition

Stop after targeted tests and bounded static checks pass. Do not deploy or retry the live paid generation without explicit deployment/production authorization.
