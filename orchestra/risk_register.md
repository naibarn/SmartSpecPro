# Risk Register

- CRITICAL surface: tenant isolation and provider-visible managed references.
- HIGH risk: background tokens/retries can lose tenant identity.
- HIGH risk: tenant-bearing mutations may update multiple tenant rows for one user.
- Mitigation: explicit actor contract, red tests, static guard, scoped mutations,
  inline security review, and no schema/data mutation in this phase.
