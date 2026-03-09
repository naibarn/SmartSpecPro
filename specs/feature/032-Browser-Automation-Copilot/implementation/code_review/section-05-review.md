# Section 05 Code Review

## CRITICAL: Missing `validate_url_dns()` call in `navigate()`
The plan specifies two SSRF validation calls but only `validate_url()` is called. DNS rebinding protection (Layer 2) is absent.

## HIGH: `_wait_job` polls DB in tight loop without connection management
- `elapsed` tracking only counts sleep time, not query time
- No session refresh between polls (SQLAlchemy caching risk)
- Imports inside loop body

## HIGH: `ssrf_route_filter` is dead code - not passed to sandbox dispatch inputs
The filter function exists but nothing calls it or passes it to the sandbox environment.

## MEDIUM: `sandbox_profiles.py` not modified - no seed SQL for browser-default profile
Plan requires verifying/creating the browser-default SandboxProfile DB record.

## MEDIUM: `ssrf_route_filter` missing `session_id` in log entries

## MEDIUM: `_wait_job` returns `job.output_manifest_json` without validation

## CODE QUALITY: `dispatcher` typed as `Any` instead of `SandboxDispatcher | None`

## CODE QUALITY: Duplicated stub/dispatch branching pattern in every action method

## CODE QUALITY: Imports inside loop in `_wait_job`

## BUG: `_pages_loaded` increment timing differs between real/stub paths

## BUG: `screenshot()` increments counter before dispatch, no rollback on failure

## TEST GAPS: Missing tests for `_wait_job` failure paths, DNS validation, audit logging
