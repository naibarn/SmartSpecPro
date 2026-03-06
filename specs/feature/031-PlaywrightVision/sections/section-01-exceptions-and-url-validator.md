# Section 01: Exceptions Module and SSRF URL Validator

## Overview

This section implements two foundational Python modules for the Automation Copilot feature:

1. **`automation_exceptions.py`** -- A hierarchy of 11 custom exception classes that signal distinct failure modes across the automation pipeline.
2. **`url_validator.py`** -- An SSRF-safe URL validator with DNS rebinding protection and tenant domain whitelisting.

These modules have no dependencies on other sections and are required by sections 02 through 05.

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/services/automation_exceptions.py` | 11 exception classes extending `AutomationError` |
| `python-backend/app/services/url_validator.py` | SSRF URL validation with DNS rebinding check |
| `python-backend/tests/unit/automation/__init__.py` | Package init for test directory |
| `python-backend/tests/unit/automation/test_automation_exceptions.py` | Tests for exception hierarchy |
| `python-backend/tests/unit/automation/test_url_validator.py` | Tests for URL validator |

## Tests (Write First)

### Test File: `python-backend/tests/unit/automation/test_automation_exceptions.py`

This test file validates the exception hierarchy and basic behavior. Coverage target: comprehensive (small module).

**Test cases to implement:**

1. **`test_all_exceptions_extend_automation_error`** -- Import all 11 exception classes. Assert each is a subclass of `AutomationError`, and `AutomationError` is a subclass of `Exception`.

2. **`test_exception_stores_message_and_details`** -- Construct `AutomationError("msg", details={"key": "val"})`. Assert `.message == "msg"` and `.details == {"key": "val"}`.

3. **`test_exception_details_defaults_to_none`** -- Construct `AutomationError("msg")` without details. Assert `.details is None`.

4. **`test_str_includes_message`** -- Assert `str(SSRFBlockedError("blocked"))` contains `"blocked"`.

5. **`test_specific_exceptions_have_correct_default_messages`** -- Parametrize over the five exceptions that should have default messages:
   - `SSRFBlockedError()` -- message should mention "SSRF" or "blocked"
   - `DomainNotAllowedError()` -- message should mention "domain" or "allowed"
   - `BrowserCapacityError()` -- message should mention "capacity" or "limit"
   - `InsufficientCreditsError()` -- message should mention "credits"
   - `FeatureDisabledError()` -- message should mention "disabled" or "feature"

6. **`test_all_eleven_classes_exist`** -- Import and verify all 11 names exist in the module: `SSRFBlockedError`, `DomainNotAllowedError`, `BrowserCapacityError`, `BrowserLaunchError`, `PageLoadError`, `SelectorNotFoundError`, `ScriptGenerationError`, `HealingExhaustedError`, `InsufficientCreditsError`, `FeatureDisabledError`, `CancellationRequestedError`.

### Test File: `python-backend/tests/unit/automation/test_url_validator.py`

This is the security-critical test file. Coverage target: 90% or higher. Use `pytest.mark.asyncio` for all tests since `validate_url_with_dns` is an async function.

**Test cases to implement:**

1. **`test_rejects_non_http_schemes`** -- Parametrize with `ftp://example.com`, `file:///etc/passwd`, `javascript:alert(1)`. Each must raise `SSRFBlockedError`.

2. **`test_rejects_blocked_cidr_ranges`** -- Parametrize with representative IPs from each blocked range:
   - `http://10.0.0.1` (10.0.0.0/8)
   - `http://172.16.0.1` (172.16.0.0/12)
   - `http://192.168.1.1` (192.168.0.0/16)
   - `http://127.0.0.1` (127.0.0.0/8)
   - `http://169.254.169.254` (169.254.0.0/16)
   - `http://0.0.0.1` (0.0.0.0/8)
   
   Mock `socket.getaddrinfo` to return the IP directly. The domain must be in `allowed_domains` so the test isolates the CIDR check. Assert `SSRFBlockedError`.

3. **`test_rejects_ipv6_blocked_ranges`** -- Parametrize with `http://[::1]` and `http://[fc00::1]`. Mock `getaddrinfo` accordingly. Assert `SSRFBlockedError`.

4. **`test_rejects_blocked_hostnames`** -- Parametrize with: `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `169.254.169.254`, `metadata.google.internal`. Each used as `http://{hostname}/path`. Assert `SSRFBlockedError`.

5. **`test_dns_rebinding_blocked`** -- Mock `socket.getaddrinfo` to return a private IP (e.g., `192.168.1.100`) for a public-looking hostname like `evil.example.com`. Provide `allowed_domains=["evil.example.com"]`. Assert `SSRFBlockedError` because the resolved IP falls in a blocked CIDR.

6. **`test_domain_whitelist_checked_before_dns_resolution`** -- Provide `allowed_domains=["safe.example.com"]` and URL `http://other.example.com/page`. Mock `socket.getaddrinfo`. Assert `DomainNotAllowedError` is raised. Assert `getaddrinfo` was NOT called (the domain check short-circuits before DNS).

7. **`test_domain_not_in_allowed_list_raises`** -- URL `http://notallowed.com`, `allowed_domains=["allowed.com"]`. Assert `DomainNotAllowedError`.

8. **`test_domain_matching_case_insensitive`** -- URL `http://Example.COM/path`, `allowed_domains=["example.com"]`. Mock `getaddrinfo` to return a public IP. Assert no exception (passes validation).

9. **`test_wildcard_domain_matching`** -- `allowed_domains=["*.example.com"]`. URL `http://sub.example.com` should pass (with public IP). URL `http://example.com` (no subdomain) should raise `DomainNotAllowedError`.

10. **`test_valid_public_url_passes`** -- URL `http://public-site.com/page`, `allowed_domains=["public-site.com"]`. Mock `getaddrinfo` to return `93.184.216.34` (a public IP). Assert no exception raised.

11. **`test_empty_allowed_domains_rejects_all`** -- URL `http://anything.com`, `allowed_domains=[]`. Assert `DomainNotAllowedError`. `getaddrinfo` should NOT be called.

## Implementation Details

### `python-backend/app/services/automation_exceptions.py`

Define a base `AutomationError(Exception)` class with:
- `__init__(self, message: str = "", details: dict | None = None)` -- stores both as instance attributes
- `__str__` returns the message

Then define 11 subclasses. Five of them should have sensible default messages (so they can be raised with no arguments in common cases):

- `SSRFBlockedError` -- default: `"URL blocked by SSRF protection"`
- `DomainNotAllowedError` -- default: `"Domain not in tenant allowed list"`
- `BrowserCapacityError` -- default: `"Browser capacity limit reached"`
- `InsufficientCreditsError` -- default: `"Insufficient credits for this operation"`
- `FeatureDisabledError` -- default: `"Automation Copilot feature is disabled"`

The remaining six (`BrowserLaunchError`, `PageLoadError`, `SelectorNotFoundError`, `ScriptGenerationError`, `HealingExhaustedError`, `CancellationRequestedError`) require a caller-supplied message since their context varies.

All classes are simple and contain no logic beyond storing `message` and `details`.

### `python-backend/app/services/url_validator.py`

Single public function:

```python
async def validate_url_with_dns(url: str, allowed_domains: list[str]) -> None:
    """Validate URL is safe for browser navigation.

    Raises SSRFBlockedError or DomainNotAllowedError on violation.
    Returns None on success (URL is safe).
    """
```

**Internal constants and helpers:**

- `BLOCKED_CIDRS` -- list of `ipaddress.ip_network` objects for: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `0.0.0.0/8`, `::1/128`, `fc00::/7`.

- `BLOCKED_HOSTNAMES` -- frozenset of lowercase strings: `{"localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254", "metadata.google.internal"}`.

- `_is_ip_blocked(ip_str: str) -> bool` -- parse with `ipaddress.ip_address()`, check against each network in `BLOCKED_CIDRS`.

- `_is_domain_allowed(hostname: str, allowed_domains: list[str]) -> bool` -- case-insensitive match. For wildcard entries like `*.example.com`, match any subdomain but NOT the bare domain itself. An empty `allowed_domains` list returns `False` for all hostnames.

**Validation sequence (order matters):**

1. Parse URL with `urllib.parse.urlparse`. Reject if scheme not in `{"http", "https"}`.
2. Extract hostname. Reject if hostname is in `BLOCKED_HOSTNAMES` (case-insensitive).
3. Check if hostname is a literal IP address. If so, check `_is_ip_blocked` directly.
4. Check if hostname is in `allowed_domains` via `_is_domain_allowed`. If not, raise `DomainNotAllowedError`. This runs BEFORE DNS resolution to avoid unnecessary network calls for disallowed domains.
5. Resolve hostname via `socket.getaddrinfo(hostname, None)` (run in executor to avoid blocking the event loop). For each resolved IP address, check `_is_ip_blocked`. If any resolved IP is blocked, raise `SSRFBlockedError` with a message including the hostname and resolved IP.

**DNS resolution note:** Use `asyncio.get_event_loop().run_in_executor(None, socket.getaddrinfo, hostname, None)` to make the blocking `getaddrinfo` call async-safe. This is the standard pattern for async DNS in Python when `aiodns` is not available.

**SSRF Defense-in-Depth (context for downstream sections):** This validator provides pre-navigation protection. A secondary defense (Playwright `page.route()` handler) is implemented in section 04 (`PlaywrightScriptGenerator`) as a TOCTOU mitigation. The URL validator itself does not install route handlers -- that is the responsibility of the caller.

## Dependencies

- **No upstream dependencies.** This is the first section to implement.
- **Downstream consumers:** Sections 02, 03, 04, and 05 all import from these modules. Specifically:
  - `url_validator.validate_url_with_dns` is called by `PlaywrightScriptGenerator` (section 04)
  - All exception classes are used throughout sections 02-07

## Key Design Decisions

1. **Domain check before DNS** -- prevents the system from performing DNS lookups for domains the tenant has not whitelisted, reducing attack surface and unnecessary network traffic.

2. **Async function signature** -- even though scheme/hostname checks are synchronous, the function is `async` because DNS resolution uses `run_in_executor`. Callers should always `await` it.

3. **Empty `allowed_domains` blocks everything** -- this is intentional. A tenant with no configured domains cannot use the Automation Copilot. The admin UI (section 11) shows a warning when this list is empty.

4. **`ipaddress` stdlib** -- used for CIDR range checking rather than manual bit manipulation. Handles both IPv4 and IPv6 correctly.

5. **Exception `details` dict** -- allows attaching structured context (e.g., the blocked IP, the hostname, the CIDR range that matched) for logging and debugging without exposing it to end users.