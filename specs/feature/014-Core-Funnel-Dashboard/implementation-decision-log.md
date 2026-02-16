# Implementation Decision Log

## 2026-02-16

### Section / Step
- Preflight branch/worktree handling

### Options Considered
- `proceed_here`
- `switch_branch`
- `stop`

### Decision Taken
- `proceed_here`

### Mode Used
- `asked` (`smart_auto`, high-impact)

### Rationale
- User explicitly approved implementation on current dirty `main`; changes are being isolated to funnel feature files.

---

### Section / Step
- Section 01 supporting index scope

### Options Considered
- Add broad index set across many source tables
- Add targeted index set on highest-impact aggregation sources

### Decision Taken
- Add targeted index set: `registration_events`, `messages`, `credit_transactions`

### Mode Used
- `auto` (`smart_auto`, low-impact)

### Rationale
- Keeps migration additive with lower lock/write overhead while covering core funnel milestone query paths.

---

### Section / Step
- Section 02 side-channel execution policy

### Options Considered
- Block primary insert on side-channel failures
- Keep primary insert authoritative; side channels best-effort only

### Decision Taken
- Keep side channels non-blocking and record failures via telemetry

### Mode Used
- `auto` (`smart_auto`, low-impact)

### Rationale
- Protects auth/usage flows from analytics provider outages while preserving first-event persistence guarantees.
