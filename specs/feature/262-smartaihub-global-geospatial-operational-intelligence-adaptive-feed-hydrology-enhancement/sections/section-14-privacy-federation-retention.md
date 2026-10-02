# Section 14 — Privacy, federation, retention and exercise isolation

## Goal and dependencies

Apply Spec260 identity, audience projection, tenant auth, audit and federation authority to geospatial observations/feed/watches/map context. Prevent precise household/sensitive facility disclosure and differencing; use minimum-disclosure purpose/jurisdiction-bound expiring shares; honor deletion/legal holds; isolate synthetic exercises from operational truth. Reuse Spec260, never create another privacy/federation/audit authority. Depends on sections 02, 06–08, 11, 13 and 16–17; unfinished Spec260 contracts remain gated.

## Tests first

- Extend packages/shared/src/emergency/publicLocation.test.ts and alertGeometry tests: audience-based generalization before public projection; sensitive class may require coarser/no location; invalid geometry/CRS fails closed; source geometry immutable.
- Add packages/shared/src/geo/privacyProjection.test.ts only if existing emergency contracts do not own projection: distinct public/tenant/responder/command projections; client audience/requestedMapMode ignored; overlap/repeated-query differencing cannot reconstruct protected point; counts/time bins enforce privacy; protected refs never enter public Chat/feed/analytics/logs.
- Extend packages/shared/src/emergency/federation.test.ts: versioned allowlist only; no raw rows/geometry/secrets; require current tenant/jurisdiction, explicit scope/purpose, verified partner as policy requires, expiry and no revocation; revoke blocks retries.
- Extend apps/web/server/routes/spec260EmergencyEdge tests: operations authorization/reason/idempotency; ownership/partner jurisdiction; delayed delivery rechecks grant; transactionally coupled outbox/audit; no cross-tenant enumeration.
- Add deletion/retention/legal-hold tests: eligible data purge/deidentify; hold is scoped/reasoned/reviewed/expiring and retains minimum necessary only; release permits policy cleanup; account deletion preserves only required deidentified provenance and removes personal geometry.
- Add exercise-isolation tests across storage/projections/map/API/MCP/feed/model/analytics/notifications/watches: exercise data cannot appear operationally or trigger real actions; untrusted payload cannot set exercise mode.
- Telemetry tests assert no exact sensitive geometry, protected IDs, source bodies, Chat context or federation tokens in routine events/errors.
- Auth matrix tests cover public/tenant/responder/command/admin/MCP/service actors, tenant changes and delayed retries.

## Existing authorities and implementation

- Reuse packages/shared/src/emergency/{publicLocation.ts,disclosureGrant.ts,alertGeometry.ts,federation.ts} and colocated tests for generalization, disclosure and minimum-field projection. A simple fixed grid may not satisfy every sensitivity/jurisdiction.
- packages/shared/src/emergencyRouteManifest.ts registers canonical operations federation/privacy routes. apps/web/server/routes/spec260EmergencyEdge.ts owns current roles, schemas, idempotency, audit and share/hold behavior.
- apps/web/drizzle/schema.ts already has emergency federation partner/share and legal-hold entities. Inspect exact fields, journal and dirty diffs before modification. Do not create duplicate grants/holds or emergency/task authorities.
- Existing jobs/retention patterns and worker_jobs + transactional outbox are canonical for long-running deletion, reprojection or delivery; all jobs reauthorize at execution.
- New pure packages/shared/src/geo/privacyProjection.ts is allowed only if no current owner fits. Server work belongs in Spec260 services/routes. Any schema migration is additive and conductor-owned; do not persist transient viewport state.

Implementation steps:
1. Inventory live Spec260 schema/routes/tests for disclosure grants, share, legal hold, audit, account deletion and retention. Record owner/fields before proposing extension.
2. Define server-resolved principal/tenant/purpose/jurisdiction and sensitivity class as projection inputs. Produce allowlisted typed output. Unknown classification/policy denies or omits; browser locale, geometry precision and requestedMapMode cannot lower protection.
3. Apply one canonical geometry disclosure policy to public map/feed/search/share/Chat/API/MCP/export/federation/analytics. Protect household, vulnerable persons, critical infrastructure and restricted operations. Use stable generalized geometry, time/count aggregation, minimum cohorts and query/rate budgets against reconstruction. Never mutate stored evidence.
4. Extend current versioned federation projection/grant with explicit resource refs, allowlisted fields, recipient, purpose, jurisdiction, reason, expiry/revocation. Never serialize DB/provider rows. Restrict unsupported Spec262 resource classes. Audit approval/create/attempt/delivery/revoke/failure. Delayed delivery rechecks source and grant; revocation/expiry wins over retry.
5. Integrate retention/deletion with existing entities. Each class defines owner, lawful purpose, window, delete/anonymize method, hold exception, replay dependency and proof. Legal hold is scoped, reviewed, audited and time-bounded. Preserve immutable source evidence only when required; purge identity/exact geometry after expiry as policy allows.
6. Treat saved watch as intentional user data with owner/deletion/expiry; transient search/pan remains ephemeral. Device sync requires authenticated, currently authorized device; revoked device gets no protected state.
7. Use canonical exercise/test segregation. Isolate IDs/storage/projections and block real alerts, watches, tasks, public/federated output and ranking effects. Promotion requires existing human-reviewed evidence/claim path and audit.
8. Exclude exact geometry, private refs, source bodies, Chat context and recipient credentials from normal logs. Emit coarse purpose-limited aggregates.
9. If persistence changes are essential, conductor updates Drizzle/journal additively and documents tenant/RLS, retention, indexes, replay, rollback/forward recovery and preservation of Spec260 facts.

## Authorization and safety

Reauthorize every read/share/chat/API/MCP/action/notification/export/replay/delayed delivery. Fail closed on unknown sensitivity/jurisdiction/version, missing/revoked/expired grant or incomplete audit; never fall back to raw geometry. Partner trust is scoped, not blanket. Legal hold does not bypass access/residency/minimum disclosure; retention cannot destroy held evidence. Exercise records are never official by client flag. Telemetry is redacted by construction.

## UI/UX Contract

### Target User / JTBD
Public users see the safest truthful detail; authorized operators share only permitted context; privacy/federation administrators understand scope, recipient, expiry, hold and deletion consequences.

### Existing Pattern Reference
Reuse Spec260 operations federation/privacy routes and existing role-gated admin, confirmation and audit patterns in emergencyRouteManifest. No parallel route/menu/grant store.

### Surface Inventory
| Surface | Owner | Requirement |
|---|---|---|
| Public map/feed/share | EmergencyRoutePage/PublicMap + canonical projections | Generalized safe geometry and coverage explanation. |
| Operations federation | Existing Spec260 federation UI/routes | Recipient, jurisdiction, fields, purpose, expiry, status, revoke. |
| Privacy/legal holds | Existing Spec260 privacy UI/routes | Data class/scope/reason/reviewer/expiry and release impact. |
| Audit | Canonical Spec260 audit surface | Immutable provenance; no sensitive source payload. |
| Chat/API/MCP | Existing panel/tool policy | Recheck access; no alternate bypass. |

### Component Map
Safe projection is produced server-side; public renderer cannot refine it. Existing operations forms call canonical grant/hold APIs; policy owns eligibility; audit and canonical jobs own records/delivery; UI reports canonical status only.

### State Matrix
| State | Expected UI |
|---|---|
| loading | No raw geometry while projection/grant is pending. |
| empty | No grant/hold found; does not imply no sensitive data. |
| error | Sanitized recoverable error; preserve only safe form input. |
| success | Confirm scope/recipient/expiry/status. |
| partial success | Rejected refs/fields identified without disclosure; unsafe mixed scope rejects atomically. |
| disabled | Explain missing role/policy/jurisdiction/audit prerequisite without hidden data. |
| selected | Allowlisted fields and precision reviewable before confirmation. |
| hover | No material decision details hover-only. |
| focus | Keyboard focus for inspect/confirm/revoke/release/audit. |

### Responsive Matrix
| Viewport | Expected behavior |
|---|---|
| 390x844 | Public explanation readable; operation dialogs scroll safely. |
| 768x1024 | Grant/hold review fields wrap in logical order. |
| 1440x900 | Scope, recipient, jurisdiction and audit status visible. |
| 360x800 | No horizontal overflow; confirmation reachable. |
| 1024x768 | Destructive action remains explicit and understandable. |
| 1280x800 | Tables/actions retain labels and keyboard reachability. |

### Accessibility Acceptance
Sensitivity/freshness not color-only; semantic geometry alternative; labeled scope/recipient/purpose/expiry; announced errors and confirmation; explicit confirmation for revoke/release/delete; visible focus and reduced motion.

### Copy Contract
Thai/English. Explain public coordinates are approximate and details may be withheld. Before share show data classes/fields, recipient, purpose, jurisdiction and expiry; distinguish queued/delivered/revoked/failed. Hold copy names scope/reason/reviewer/expiry without exposing protected records.

### Browser Evidence Required
At 390x844, 768x1024, 1440x900 and risky 360x800, 1024x768, 1280x800: public generalized geometry/no precise leak; role-gated create/review/revoke; revoked/expired queued-delivery denial; hold/release status; sanitized errors; keyboard/AT and no overflow. Inspect network/UI/log capture for protected refs.

## Completion evidence and gates

Pass projection/differencing/federation, auth/tenant/audit/outbox, deletion/hold/exercise and browser tests; prove migration replay if schema changed. Jurisdiction legal basis, residency/transfer terms, partner identity/trust, production deletion policy and final Spec260 integration require named external-owner evidence, not local inference.

