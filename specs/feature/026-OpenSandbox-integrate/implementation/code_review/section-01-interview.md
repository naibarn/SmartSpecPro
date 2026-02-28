# Section 01 Code Review Interview

## Decision: opensandbox-server on opensandbox-exec network (#1)
**User decision**: Keep server on exec network. Server needs it to manage sandboxes. API key auth is the security boundary.
**Action**: No change needed.

## Auto-fix: wait_for_sandbox elapsed time (#3)
Changed `${attempt}s` to `$((attempt * 2))s` to reflect actual elapsed time with 2s sleep interval.

## Auto-fix: start_sandbox error handling (#4)
- Changed to `if ! docker compose ... 2>/tmp/sandbox-start.log` to capture stderr
- Display error log on failure for diagnostic visibility

## Auto-fix: docker compose project name (#6)
Added `-p smartspecpro` to both `start_sandbox()` and `stop_sandbox()` compose commands for consistency with media workers.

## Let go: curl in healthcheck image (#5)
Unknown whether the OpenSandbox image has curl. Will verify when testing with the actual image. Can fallback to wget if needed.

## Let go: celery-import changes (#2, #9)
These are from the existing dirty working tree, not introduced by this section.

## Let go: default API key (#10)
Addressed in section 11 (config and feature flags).
