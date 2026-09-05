# Progress

- Read repository instructions and Orchestra data-first debugging guidance.
- SocratiCode `codebase_*` tools were not exposed, so discovery used bounded `rg`, line reads, and read-only PostgreSQL queries.
- Queried episode 290, special data, storyboard, run/artifact ledgers, special debug events, and compared special episode 289.
- Root cause is confirmed: the persisted request explicitly disabled dialogue; the successful special flow therefore produced no speaking turns and does not populate the normal `episode.script` column.
- No application code or database data was changed.
