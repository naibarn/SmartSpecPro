# Implementation Loop

Per-section implementation workflow for /deep-implement.

## Loop Overview

For each section in the manifest:

```
1. Mark section in progress (task-list mode only)
2. Read section file
3. Create skeleton files
4. Write tests (TDD red phase)
5. Run tests (expect failures)
6. Write implementation code
7. Run tests (expect pass)
8. Handle failures with log-driven debugging
```

## Step Details

### 1. Mark In Progress

If task-list mode is active and the host supports task updates, mark the section task `in_progress`. Otherwise continue without task updates and rely on file-based state.

### 2. Read Section File

```
Read sections/section-NN-<name>.md
```

Extract:
- Test code (look for code blocks in "Tests First" section)
- Implementation requirements
- File paths to create/modify
- Success criteria

### 3. Create Skeleton Files

**CRITICAL:** Before writing tests, create empty skeleton files for modules that will be imported.

This prevents `ImportError` during the TDD red phase.

Example:
```python
# For a test that does: from scripts.lib.config import load_session_config
# Create: scripts/lib/config.py with:
def load_session_config(*args, **kwargs):
    raise NotImplementedError("Skeleton - implement me")
```

### 4. Write Tests (Red Phase)

Create test files from the section's test specifications.

Place tests in appropriate locations (typically `tests/test_*.py`).

### 5. Run Tests (Expect Failures)

```bash
{test_command} tests/test_<module>.py -v
```

Expected result: **Assertion failures** (NOT import errors).

If you see `ImportError` or `ModuleNotFoundError`:
- Check that skeleton files exist
- Check import paths are correct

### 6. Write Implementation

Replace skeleton code with real implementation.

Follow the section's implementation specifications exactly.

### 7. Run Tests (Expect Pass)

```bash
{test_command} tests/test_<module>.py -v
```

All tests should pass.

### 8. Handle Failures — Log-Driven Debugging Protocol

**NEVER guess at the root cause.** When tests fail after implementation, follow this protocol strictly.

#### Attempt 1: Read and Fix (Simple Cases)

1. Read the FULL error message and stack trace
2. If the cause is obvious (typo, wrong variable, missing import) → fix it
3. Re-run tests

#### Attempt 2: Targeted Fix (If Attempt 1 Failed)

1. Re-read the NEW error (it may have changed)
2. Trace the data flow from test input → failure point
3. Make ONE focused change
4. Re-run tests

#### Attempt 3: Log-Driven Debugging (MANDATORY if Attempt 2 Failed)

**STOP guessing. Start logging.** This is mandatory after 2 failed attempts.

**Step 1: Create debug log file**
```python
# Create: {target_dir}/debug_section_NN.log  (or appropriate location)
import logging

debug_logger = logging.getLogger("debug_section_NN")
debug_logger.setLevel(logging.DEBUG)
fh = logging.FileHandler("debug_section_NN.log")
fh.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(message)s"))
debug_logger.addHandler(fh)
```

**Step 2: Add logging at ALL decision points in the failing code path**
```python
# At function entry:
debug_logger.debug(f"ENTER function_name(arg1={arg1}, arg2={arg2})")

# At every branch/condition:
debug_logger.debug(f"BRANCH: condition={condition}, taking {'true' if condition else 'false'} path")

# At data transformations:
debug_logger.debug(f"TRANSFORM: input={input_val} → output={output_val}")

# At function exit:
debug_logger.debug(f"EXIT function_name → return={result}")
```

**Step 3: Create or modify a test that triggers the failing path**
```python
def test_debug_failing_case():
    """Temporary debug test to capture log output."""
    # Set up the exact conditions that cause the failure
    result = function_under_test(failing_input)
    # Don't assert yet — just run to generate logs
```

**Step 4: Run the debug test and read the log**
```bash
{test_command} tests/test_<module>.py::test_debug_failing_case -v
cat debug_section_NN.log
```

**Step 5: Analyze the log to find the ACTUAL root cause**
- Where does actual behavior diverge from expected?
- What value is wrong? What variable has unexpected content?
- State the root cause in one sentence: "The bug is caused by X because Y"

**Step 6: Fix the root cause (not a symptom)**
- Make the minimal change that fixes the actual root cause
- Re-run ALL tests (not just the debug test)

**Step 7: Clean up**
- Remove debug logging code
- Remove or convert debug test to a proper regression test
- Delete the log file

#### After 3 Logged Attempts: Auto-Skip

If the bug persists even after log-driven debugging with 3 attempts:
- Log the section as skipped with full diagnostic details
- Auto-continue to next section
- Include in finalization report for manual review

**This protocol exists because guessing wastes time.** A single log session typically reveals the root cause in minutes, while guessing can waste hours.

---

## Common Debugging Patterns

| Symptom | What to Log | Likely Cause |
|---------|------------|--------------|
| Wrong return value | Function entry args + exit return | Input transformation logic |
| KeyError / AttributeError | Object state at access point | Missing initialization or wrong type |
| Silent failure (no error, wrong result) | Every branch in the code path | Condition logic error |
| Intermittent failure | Timing, shared state, random seeds | Race condition or test isolation |
| Works in isolation, fails in suite | Global state before/after test | Test pollution |

---

## Next Steps

After the implementation loop completes for a section:
1. Stage changes (see git-operations.md)
2. Implementation completeness review (Step 5.5)
3. Code review (see code-review-protocol.md)
4. Commit (see git-operations.md)
5. Auto-continue to next section
