# Section 03 Code Review Interview

## Auto-fixes Applied

1. **Shell injection in cleanup_sandbox_files** → Use shlex.quote() for path escaping
2. **Path traversal in MockSandboxBackend** → Add os.path.realpath() validation
3. **Missing await in _do_request** → Make _do_request async def
4. **Missing OpenSandboxBackendAdapter** → Add adapter class in client.py
5. **Missing protocol compliance tests** → Add tests to test_mock_backend.py
6. **Float accumulation timing** → Use asyncio.get_event_loop().time()
7. **Unhandled status codes** → Add catch-all for status >= 400
8. **Filename collision** → Add index suffix to object keys

## Let Go

- subprocess.run shell=True in mock (by design)
- Circuit breaker / retry interaction (acceptable for initial version)
- 3 extra client tests (low priority)
- Module-level settings instantiation (follows existing project pattern)

## User Decision

User approved: "Apply all auto-fixes"
