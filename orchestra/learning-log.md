# Learning Log

- Existing fail-closed boundaries need caller-propagation tests; resolver-only
  tests do not prove router/background identity transport.
- Tenant-bearing JWT fallback can mask missing explicit contracts until a flow
  uses a session or background token with different claims.

- Credit routing is safest at the auto-report boundary when direct router errors
  lose typed causes; structured context is accepted where available and the
  3000-credit unknown fallback prevents silent suppression of anomalies.
