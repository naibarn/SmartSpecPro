# Token Estimates Reference

Use this file when the skill needs to estimate the rough cost and effort of building a custom solution instead of buying or integrating an existing one.

These numbers are intentionally approximate. They are planning heuristics, not billing guarantees.

## Estimation Principles

Use a range, not a single number:
- optimistic case: straightforward implementation with few revisions
- expected case: normal implementation with debugging and light refactoring
- pessimistic case: integration friction, retries, and edge-case cleanup

Always adjust upward when any of these are true:
- unclear requirements
- unfamiliar domain
- auth, billing, or compliance work
- multi-service integration
- data migration or schema design
- cross-platform UI work

Always adjust downward when:
- it is mostly glue code
- a stable library already solves 70%+ of the work
- the user explicitly wants a prototype only

## Rule-of-Thumb Bands

| Task shape | Typical token burn | Notes |
|------------|--------------------|-------|
| Tiny script or one-off helper | 5K-15K | Small utility, light testing |
| Focused utility module | 15K-40K | One domain, few files |
| Medium feature integration | 40K-100K | New package, config, tests, follow-up fixes |
| Multi-surface feature | 100K-250K | Frontend + backend + schema + tests |
| New subsystem or workflow | 250K-500K+ | Planning, integration drift, retries |

## Complexity Multipliers

Add a multiplier when the request includes higher-risk work:

| Risk factor | Multiplier |
|-------------|------------|
| Existing library fits well | x0.6 |
| Clear internal patterns to copy | x0.8 |
| Auth / RBAC / permissions | x1.5 |
| Payments / billing / compliance | x2.0 |
| Data migration / backfill | x1.4 |
| External API with unclear docs | x1.3 |
| Real-time sync / concurrency | x1.5 |
| Cross-language stack | x1.4 |

## Estimation Workflow

1. Classify the task size from the rule-of-thumb bands.
2. Count the main surfaces involved:
   - UI only
   - backend only
   - data/schema
   - background jobs
   - external integrations
3. Apply relevant multipliers.
4. Report the result as a range:
   - low = optimistic
   - expected = most realistic
   - high = pessimistic

## Example Phrasing

```markdown
Estimated custom-build token burn: 60K-120K tokens

Why:
- Medium feature integration
- New external API and auth flow
- Likely 2-4 revision cycles after initial implementation
```

## What to Mention Alongside Token Estimates

Token burn alone is not enough. Pair it with:
- likely implementation time
- maintenance burden
- security/compliance risk
- whether an existing library removes the riskiest work
