# Section 10 implementation record — authorization, placement, and governance

Status: partial / in progress; production execution remains fail-closed.

## Implemented locally

- Workflow mutations derive tenant identity from server context and enforce owner/admin edit access.
- Run control checks tenant, actor ownership/role, and expected run revision.
- Adapter preflight receives tenant and actor identity from the canonical Feature 195 job context, not workflow payload fields.
- Workflow run admission rejects execution when the node dispatcher is not configured; there is no insecure default placement or credential resolver.
- Secrets remain reference-based in workflow bindings; there is no adapter capable of resolving raw secrets into plans.

## Remaining acceptance gaps

- Current Spec 220 capability authorization/revocation, placement/locality/residency evaluation, secret reference resolution/rotation, Spec 207 economic authorization, Spec 229 retrieval ACL, and Spec 251 profile binding are not wired into preflight.
- A configured dispatcher must implement live revalidation before each effect and commit, then pass tenant/revocation/residency tests.
- No production provider/runtime authorization claim is made.
