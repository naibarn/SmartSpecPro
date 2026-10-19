# Decisions

Depth: standard quick-plan, five sections. Scope is the existing HTTP origin/auth connection and its deployment boundary. Existing authorities, proxy and host services already exist; no new product architecture or agent framework is needed. Full remaining service migration is an acceptance dependency, not silently folded into this bounded implementation.

| Approach | Fit | Decision |
| --- | --- | --- |
| Dedicated Tunnel ingress + Access Service Auth + app attestation | Matches the current HTTPS fetch proxy and Linux backend; explicit ingress protection, existing provider products | Recommended first implementation. Confirm actual IAM, resources and bounded cost before provisioning. |
| Workers VPC service binding through Tunnel | Strong private-service boundary, avoids a publicly addressable origin hostname | Future evaluation. Currently documented beta; would change bindings, runtime transport, IAM and operational assumptions. Not a prerequisite for repairing existing staging. |
| Fetch existing public application URL with only an added token | Fast to configure | Rejected as completion: it provides no dedicated ingress protection, risks route recursion and leaves public-host/tenant/cookie behavior unqualified. |

The recommended origin hostname is publicly resolvable but Access-protected. Call it a protected origin, not an inherently private network endpoint. The transport's existing AUTH_ORIGIN_PRIVATE_HOST field is a hostname pin, not evidence of private routing. If a truly network-private origin becomes a requirement, qualify the VPC option explicitly.

Keep the current workers.dev hostname for the first browser-auth proof to avoid sharing production parent-domain cookies. A custom staging hostname may follow with explicit host-only cookie names/scopes and an approved tenant mapping. Existing production `.smartaihub.app` cookies remain unchanged; production OAuth configuration must not be repointed at staging.

Do not launch a second copy of the full application against the shared DB merely to obtain an origin: its startup graph may activate duplicate schedules/jobs. Reuse the existing origin with a narrowly scoped protected ingress and a controlled compatible release; any isolated API process needs a separately verified scheduler-free lifecycle.

Origin configuration belongs to the existing scoped target/settings authority. Store only references and version identifiers in grants, receipts and runtimePolicy. Store sensitive values in encrypted settings or the existing runtime secret manager; resolve only server-side inside the executor's callback. Do not overload the deployment API-token column with a JSON credential bundle.

Existing artifact-only grant behavior stays disabled-activation and origin-free. Introduce an explicitly versioned origin-capable typed scope in the existing ApprovalDBService policy/grant path. Bind configuration digest, origin identity, target, public origins and immutable secret-version references, then recheck them before every provider write. Do not reinterpret a v1 grant, register a new authority or bypass worker_jobs/outbox.

Small cookie repair is independently useful and safe to integrate now. Remaining sections can integrate with origin capability disabled. Provider IAM and production-origin release controls apply to those external actions only; they do not require a second generic human checkpoint for ordinary code.

Review round 1 corrections: use actual tRPC auth routes; account for global OAuth settings; qualify public-host versus true private networking; scope missing-token rejection to the dedicated ingress; bind configuration/secret versions to grants and rollback.

Review round 2 corrections: do not require full /readyz to turn green for HTTP staging; preserve POST idempotency and stream lifetimes; account for parent-domain cookie collisions on custom staging; separate WebSocket/full-feature acceptance from successful login. Cross-section review after these corrections found no unresolved interface choice; actual external resource IDs and permissions remain explicit execution inputs.
