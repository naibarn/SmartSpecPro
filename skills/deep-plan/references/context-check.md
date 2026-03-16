# Context Check Protocol

Before critical operations, optionally prompt the user about context management.

## Key Insight

**File-based recovery is the real resilience mechanism, not compaction.**

- `scan_planning_files()` detects what's been created
- `infer_resume_step()` determines where to resume
- SKILL.md is freshly loaded on re-run
- Tasks get reconciled from file state

Compaction keeps the session alive but may cause instruction loss. `/clear` + re-run gives a clean slate with full instructions.

## Quick Check

Check session config for `context_check_enabled`. If `false`, skip context checks entirely.

## Running the Script

If context checks are enabled (or you're unsure), run:

```bash
uv run {plugin_root}/scripts/checks/check-context-decision.py \
  --planning-dir "<planning_dir>" \
  --upcoming-operation "<operation_name>"
```

## Handling Script Output

| action | What to do |
|--------|------------|
| `skip` | Prompts disabled - proceed immediately |
| `prompt` | **Auto-decide based on context usage** (see below) |

### Auto-Decision Rules (DO NOT ask user)

**If context usage < 80%:** Auto-continue. No need to interrupt the workflow.

**If context usage 80-95%:** Log a warning and auto-continue:
```
Context usage: {N}% — approaching limit. Will auto-compact at 95% if needed.
```

**If context usage > 95%:** Print recommendation and auto-continue:
```
Context usage: {N}% — high. Consider /clear + re-run after current step completes.
Continuing automatically...
```

**Never ask the user to choose between "Continue" and "/clear".** The system handles this automatically. If context becomes critical, auto-compact will trigger. The user can always `/clear` manually if they notice issues.

## Trade-offs Explained

| Option | Benefit | Trade-off |
|--------|---------|-----------|
| Continue | No interruption | May hit auto-compact later |
| /clear + re-run | Fresh context, full instructions | Loses conversation history |

**Why we don't recommend manual /compact:**
- Same instruction-loss risk as auto-compact
- No additional benefit over letting auto-compact happen naturally
- If you're going to interrupt, `/clear` + re-run is cleaner

## When to Run Context Checks

- Before Plan Review (upcoming operation: "Plan Review")
- Before Section Split (upcoming operation: "Section splitting")

## Configuration

In `config.json`:
```json
{
  "context": {
    "check_enabled": true
  }
}
```

Set `check_enabled` to `false` to skip all context prompts.
