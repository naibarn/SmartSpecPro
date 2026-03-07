# Section 01 Code Review Interview

## Auto-fixes Applied

1. **Literal IP bypass (HIGH)**: Literal IP URLs now also checked against `allowed_domains`. Previously `http://8.8.8.8/path` bypassed the allow-list entirely.
2. **`get_event_loop()` → `get_running_loop()`**: Fixed deprecated API usage for Python 3.10+.
3. **`_is_ip_blocked` fail-closed**: Changed `return False` to `return True` on parse failure. Security functions should fail-closed.

## Let Go (Not Fixed)

- Cloud metadata hostnames (AWS/Azure): Out of plan scope, `169.254.0.0/16` CIDR covers the IP.
- Mock path precision: Tests work correctly, pattern is acceptable.
- Redundant `@pytest.mark.asyncio`: Harmless with `asyncio_mode = auto`.
- `pass` body for no-default exceptions: Plan allows caller-supplied messages, current behavior is fine.
