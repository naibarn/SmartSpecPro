## Review: section-02-database-schema

### HIGH SEVERITY

**1. Scope creep: `sandbox-python` execution mode added without corresponding enum/model updates**
The diff adds `"sandbox-python"` to the Zod enum in sandbox.ts but this value does NOT exist in the Drizzle sandboxExecutionModeEnum or Python SandboxExecutionMode enum. This is a data integrity bug that will crash at runtime.

**2. `agency_communication_flows` FK cascade will cause DELETE failures**
`fromAgentId` and `toAgentId` FKs use `ON DELETE no action`. But `agency_agents` cascade-delete when parent agency is deleted. Deleting an agency will fail with FK violation. Need `ON DELETE CASCADE` on both.

**3. `agency_conversations.agencyId` FK uses `ON DELETE no action` -- orphaned conversations on agency delete**
Deleting an agency will fail because conversations reference it. Need `ON DELETE CASCADE`.

**4. `agency_tools.tenantId` FK uses `ON DELETE no action` -- orphaned tools on tenant delete**
Every other tenant-scoped table uses `ON DELETE CASCADE`. Inconsistency means deleting a tenant will fail. Need `{ onDelete: "cascade" }`.

### MEDIUM SEVERITY

**5. `listJobs` featureType Zod enum NOT updated with `"agency"`**
The `createJob` enum was updated but `listJobs` was missed.

**6. `agencies.createdBy` FK uses `ON DELETE no action` -- user deletion blocked**
Should be `{ onDelete: "set null" }` since the column is nullable.

**7. Missing Python migration script (plan item 11)**
Plan calls for `python-backend/migrations/009_agency_tables.py`. Not created.

**8. `AgencyRun.to_dict()` omits `run_metadata` field**
The `run_metadata` column data will be silently dropped from API responses.

**9. `sandbox.py` column type changes from `String` to `SAEnum` are risky scope creep**
These changes are NOT part of the section-02 plan. Changing column types may break existing code.

**10. Sandbox access control refactor (`canAccessSandboxJob`) is undocumented scope creep**
Security-relevant behavioral change with no tests.

### LOW SEVERITY

**11. Schema tests are shallow**
Missing planned tests for unique constraints and cascade deletes.

**12. `AgencyMessage` has duplicate index on `conversation_id`**
`index=True` on Column + explicit Index in `__table_args__` creates duplicate index.

**13. `test_total_credits_calculation` is a tautology**
Test just verifies stored values match inputs, no actual calculation logic.

**14. No Drizzle `relations()` definitions**
Downstream sections will need these for relational queries.
