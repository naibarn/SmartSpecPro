# Section 03 Code Review

## Critical Issues

1. **SECURITY: Shell injection in cleanup_sandbox_files** (HIGH) - files.py uses f-string to build rm command with user-controlled paths
2. **SECURITY: Path traversal in MockSandboxBackend** (HIGH) - write_file/read_file don't validate paths stay within temp_dir
3. **SECURITY: subprocess.run with shell=True** (MEDIUM) - MockSandboxBackend executes commands with shell=True
4. **Circuit breaker / retry interaction** (HIGH) - retried 503s count against circuit breaker failure limit
5. **Missing await on pybreaker call_async** (MEDIUM-HIGH) - _do_request should be async
6. **Missing OpenSandboxBackendAdapter** (MEDIUM) - Plan specifies adapter, not implemented, get_sandbox_backend() broken for real backend
7. **Missing protocol compliance tests** (MEDIUM)

## Code Quality Issues

8. Missing 3 planned client tests (LOW-MEDIUM)
9. Elapsed time tracking via float accumulation (LOW) - doesn't account for API call duration
10. Unhandled HTTP status codes (LOW-MEDIUM) - 401, 405, etc. fall through silently
11. collect_outputs filename collision (LOW)
12. Module-level settings instantiation (LOW)
