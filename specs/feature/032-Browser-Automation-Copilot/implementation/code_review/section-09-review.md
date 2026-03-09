# Section 09 Code Review

## Critical Issues

### 1. `redact_action_for_audit` is defined and tested but NEVER CALLED in production code (HIGH)
The function exists but `execute_actions` method doesn't call it. The Node-side audit logging also logs `actionCount` but does not redact individual action payloads.

### 2. `sanitize_tool_output` only applied to `extract_text`, not other action results (MEDIUM-HIGH)
Only `extract_text` sanitizes output. Other paths like `extract_links`, `navigate` results are not sanitized.

### 3. Missing audit event tests for web_search_call and responses_api_call (MEDIUM-HIGH)
The TS test file only tests store enforcement and HTML stripping, not the three planned audit events.

## Medium Issues

### 4. Dangerous tag regex is fragile (MEDIUM)
Regex may fail on malformed/nested HTML. bleach.clean runs as second pass, so risk is low.

### 5. Node sanitizeToolOutputForLLM doesn't strip style/object content (MEDIUM)
sanitize-html strips tags but preserves text content of style tags. Python side has pre-pass regex but Node side does not.

### 6. Duplicate test in responsesAudit.test.ts (LOW)
Two tests have identical assertions.

### 7. Hardcoded zeros in failure audit path (LOW-MEDIUM)
Failure audit hardcodes screenshotsTaken:0, actualCost:0 when Python may have partially executed.

### 8. sanitizeResponsesBody signature change (MEDIUM)
Removed tenantStoreAllowed parameter - breaking change for any other callers.

### 9. `key` pattern over-matches (LOW)
The regex matches any selector containing 'key' which may redact non-sensitive fields.

## Missing from Plan

### 10. Tool name allowlisting not implemented
Section 9.1 mentions rejecting unknown tool names but no validation was added.

### 11. bleach version pin too open
Should pin bleach>=6.0.0,<7.0.0.
