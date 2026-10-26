# Production Hyperdrive CF2015 diagnostic packet

Prepared 2026-10-26, from read-only checks at 04:44–04:46 UTC. No ticket has been submitted. No provider mutation was performed while preparing this packet.

## Request to Cloudflare Support if the authorized recovery also fails

Please investigate the Hyperdrive-to-Workers-VPC connection failure for the account and service below. The original Hyperdrive create returned HTTP 400 / error 2015 on 2026-10-26 at 00:50:47 UTC. Its original CF-Ray and detailed provider message were not retained; do not infer a more specific cause from that code. The next authorized attempt will retain bounded sanitized provider message, CF-Ray, API method/path, HTTP status and UTC timestamp in the canonical job failure.

- Account: `f3fb0b6858e186fcc36be105bfa00243`
- Canonical job: `b9ca8316-1604-4764-a769-d92f46e4c823`
- Original result: failed, attempt 3/3. Attempt 4 has not been authorized or executed at preparation time.
- VPC service: `01a175b0-3c44-7131-8805-2cd56db223ac`
- Tunnel: `191d047e-674a-48f4-b105-b37269c2dad6`, provider status `healthy`
- Service name: `smartspec-production-postgres-6af231b25673`
- Service type/application protocol: TCP / PostgreSQL
- Destination: `db.smartaihub.app:5433`
- VPC TLS verification: `verify_full`
- Plan digest: `6af231b256730b40c92753406585f7d510c21eb86815bbc64ea7ca1d5c66c1c8`
- Retained encrypted checkpoint: original job and password digest match, VPC ID retained, pending `hyperdrive`.
- Production Hyperdrive inventory: absent, including configurations referencing this VPC. Existing Staging Hyperdrive remains separate and unchanged.

## Sanitized intended API request

`POST /client/v4/accounts/f3fb0b6858e186fcc36be105bfa00243/hyperdrive/configs`

```json
{
  "name": "smartspec-production-database-6af231b25673",
  "origin": {
    "service_id": "01a175b0-3c44-7131-8805-2cd56db223ac",
    "database": "smartspec",
    "user": "sah_cf_prod_15fa73448c56",
    "password": "[REDACTED — original encrypted credential reused]",
    "scheme": "postgres"
  },
  "caching": {"disabled": true},
  "origin_connection_limit": 5
}
```

No public origin host/port, Access credentials, custom CA upload or Hyperdrive mTLS fields are combined with `service_id`. TLS is configured on the VPC Service. This payload matches the current [Hyperdrive create API](https://developers.cloudflare.com/api/resources/hyperdrive/subresources/configs/methods/create/) and [private VPC connection documentation](https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database-vpc/).

## Verified origin evidence

The actual cloudflared process (PID 3442) mount namespace was entered for the DNS/TLS checks. Both UDP and TCP DNS queries through its configured resolver `127.0.0.1` resolved the expected database hostname to `127.0.0.1`. The global host resolver was not substituted as proof.

From that namespace, the destination accepted the PostgreSQL SSLRequest on port 5433; TLS 1.3 completed with CA-chain and `db.smartaihub.app` hostname validation enabled. Certificate SHA-256: `a3c9d03edc8356f8643c8d3298f1f21e732071347a99980c47c7e2b54d086901`.

Separately, the unchanged original restricted credential connected over verified TLS and executed a SQL query as `sah_cf_prod_15fa73448c56` against database `smartspec`. Access to canonical `worker_jobs` was denied with PostgreSQL 42501; transaction rollback passed; a foreign/terminal intake fence returned false.

These are namespace/host-side tests, NOT proof of a Cloudflare-originated SQL connection. The VPC readback, encrypted checkpoint/password compatibility, serving Linux g124/source `3510bf39186550c9bd0de00f1fa7f67a64c539f9`, and current Node execution readiness also passed.

## Recovery and escalation boundary

The existing authenticated Admin recovery action reuses this job/VPC/password and grants one bounded attempt only after read-only reconciliation. Integration tests exercise real disposable PostgreSQL admission, grant renewal, outbox, claim, execution, same-password/VPC preservation, and lost-response idempotency. They are not provider acceptance.

If the recovery again returns CF2015, append its new canonical correlation evidence to this packet and escalate. Do not repeatedly create resources or request further approvals without new technical evidence. Cloudflare documents [2015 as a generic connection error requiring investigation](https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/).

Keep accepted M2 route `fc7ac6d3e32d464792a7161cd247a19b` and deployment `0f8559ed-d850-4e1a-9fbb-b19a67bfd309` unchanged. No API token, password, session, private key or certificate private material belongs in the support attachment.
