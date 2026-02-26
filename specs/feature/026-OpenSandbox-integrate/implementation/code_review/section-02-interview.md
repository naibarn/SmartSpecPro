# Section 02 Code Review Interview

## Auto-fix: `datetime.utcnow` deprecated (#2)
Replaced all `default=datetime.utcnow` with `default=lambda: datetime.now(timezone.utc)` for Python 3.12+ compatibility and timezone-aware timestamps.

## Auto-fix: Missing `SandboxNetworkAction` Python enum (#4)
Added `SandboxNetworkAction(str, enum.Enum)` with DENY/ALLOW values. Exported from `__init__.py`. Added test case.

## Auto-fix: Malformed ISO 8601 in `to_dict()` (#6)
Removed `+ "Z"` from all `.isoformat()` calls in `to_dict()` methods. Timezone-aware datetimes already include offset in isoformat output.

## Let go: `sandbox_jobs.userId` FK ON DELETE strategy (#1)
Plan specifies `no action` for audit trail preservation. Design decision deferred to service layer (section-04) which can handle user deletion with job cleanup.

## Let go: Unrelated `scheduledMessages.dynamicParams` (#3)
Not staged in our commit. From existing dirty working tree, not section-02 changes.

## Let go: No `updatedAt` auto-update trigger (#5)
Service layer (section-04) will explicitly set `updatedAt` on status transitions. PostgreSQL trigger would be an alternative but isn't necessary given the service pattern.

## Let go: Incomplete `to_dict()` fields (#7, #8)
Will extend when API endpoints are built in later sections. Current fields cover the most common use cases.

## Let go: No idempotent seed test (#9)
Requires database access. Unit tests validate the static array. Integration test deferred.

## Let go: UUID generation for `sandbox_jobs.id` (#10)
Application layer generates UUIDs per plan. Not a database responsibility.

## Let go: `bigint` mode "number" (#11)
9 PB files won't exist in sandbox artifacts. Safe to use JavaScript Number.
