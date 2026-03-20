## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Summary

The schema changes are well-structured and additive. All new columns are either nullable or carry safe defaults, meaning zero risk of data loss to existing rows. The `notificationOccurrences` table, FK, and indexes match the plan spec exactly. Three issues require fixes before this can unblock section-02: a critical migration file sequence number collision that will corrupt the drizzle-kit journal, a partial index WHERE clause that is correct in Drizzle/TypeScript but uses a fragile boolean literal form in the raw SQL file, and missing test coverage for the partial index WHERE predicate content. A fourth issue — the generated migration file name — diverges from the plan and needs a journal entry.

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `drizzle/0102_slim_red_wolf.sql` (filename) | **Sequence number collision.** Both the hand-written enum extension (`0102_notification_type_enum_extension.sql`) and the drizzle-kit generated migration (`0102_slim_red_wolf.sql`) share the prefix `0102`. drizzle-kit resolves migrations by filename prefix order. When both files exist with the same `0102` prefix, the journal can only contain one entry for that index, and whichever file is processed second will either be skipped or collide. The plan explicitly requires the generated file to be `0103_notification_dedup_grouping.sql` (plan §3) so the enum migration can run first. The diff has the generated file at `0102_slim_red_wolf.sql`, overriding the intended ordering. | Rename `0102_slim_red_wolf.sql` to `0103_slim_red_wolf.sql` (or the intended `0103_notification_dedup_grouping.sql`). Seed a journal entry for `0102_notification_type_enum_extension` (manually, per plan §4 step 4) and let drizzle-kit own entry `0103`. |
| HIGH | `drizzle/0102_slim_red_wolf.sql`:31, `schema.ts`:3143 | **Partial index WHERE clause: boolean literal form.** The raw SQL file uses `"isDismissed" = false` and `"groupKey" IS NOT NULL`. PostgreSQL accepts `= false` but the canonical idiomatic form for boolean columns is `IS FALSE` (or `NOT "isDismissed"`). More critically: if the column ever gains a `NOT NULL` constraint in a future migration the semantics are identical, but right now `isDismissed` has `DEFAULT false NOT NULL` so `= false` and `IS FALSE` produce the same result. This is LOW risk at runtime but `= false` is non-standard and will fail a strict SQL linter. The Drizzle `.where(sql\`...\`)` expression in `schema.ts` uses the same string, so both files need the same fix. | Change both occurrences to `"isDismissed" IS FALSE AND "groupKey" IS NOT NULL`. The Drizzle `sql\`...\`` template must match the raw SQL exactly for drizzle-kit to recognize the index as already applied. |
| MEDIUM | `notificationSchema.test.ts`:180–188 | **Partial index WHERE predicate is not asserted.** The test at line 180 checks that `idx_notif_dedup_active` exists and that `unique` is `true`, but it does not assert the WHERE clause predicate. The correctness guarantee for the dedup constraint (security constraint S6 in the plan) depends on the filter being `isDismissed = false AND groupKey IS NOT NULL`. A future schema refactor that accidentally drops the WHERE clause would silently pass this test, allowing duplicate active notifications for the same `(userId, groupKey)` to be inserted. | Add a predicate assertion: `expect(dedupIndex!.config.where).toContain("isDismissed")` and `expect(dedupIndex!.config.where).toContain("groupKey")`. The `config.where` field on the Drizzle index config object stores the raw SQL string from the `.where(sql\`...\`)` call and is available at the TypeScript level without a running database. |
| MEDIUM | `drizzle/meta/_journal.json` (not in diff) | **Journal not updated for `0102_notification_type_enum_extension.sql`.** The plan (§4 step 4) requires the enum migration hash to be seeded manually into `drizzle.__drizzle_migrations`. The diff contains the SQL file but no corresponding `_journal.json` entry and no evidence of the manual seeding step being performed. If `drizzle-kit migrate` runs before the manual seed, it will attempt to run the enum migration inside a transaction and fail with `ERROR: ALTER TYPE ... ADD VALUE cannot run inside a transaction block`. | Before merging, document the manual seeding command in the PR description and confirm the journal entry exists. Alternatively, add a migration script to the `scripts/` directory that performs the manual apply + hash-seed atomically. |
| LOW | `drizzle/0102_slim_red_wolf.sql`:31 | **Missing newline at end of file.** The diff annotation `\ No newline at end of file` on the final line of `0102_slim_red_wolf.sql` means the file is technically malformed (POSIX text files must end with a newline). Some SQL clients and `psql` handle this gracefully, but it can cause issues with certain automated migration runners and diff tools. | Add a trailing newline to the file. |
| LOW | `notificationSchema.test.ts`:169–176 | **Type-existence test provides no structural guarantee.** The `"exports NotificationOccurrence and InsertNotificationOccurrence types"` test at line 169 casts empty objects to the types and checks `toBeDefined()` on those variables. This test will pass whether the types are rich structs or `type Foo = {}`. It provides compilation-time confidence (the import line would fail if the types do not exist) but nothing beyond that. | Remove the runtime assertions — they add noise without value. The test's real guarantee is the `import type { ... }` statement at the top of the file, which is sufficient. Alternatively, replace the body with `// compiles iff types are exported` to make the intent explicit. |
| LOW | `notificationSchema.test.ts` (file-level) | **No test for FK cascade behavior.** The plan (§5.1) explicitly calls for an integration test: "INSERT 3 occurrences, DELETE parent, verify all 3 occurrences are deleted." The delivered test file contains only schema-shape (unit) tests. The plan acknowledges these may require a real DB but requests the test be present. Without it, the CASCADE constraint is only trusted implicitly from the SQL DDL, not verified in the test suite. | Add the FK/CASCADE integration test under a `@integration` Vitest marker, or add a comment block explaining that cascade behavior is covered by migration verification (step 7 in §4) rather than the test suite, with a link to the relevant CI job. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| All new columns are additive (nullable or have defaults) | PASS | `groupKey` is nullable; `occurrenceCount`, `firstOccurredAt`, `lastOccurredAt` all carry `defaultNow()` / `default(1)`. No risk to existing rows. |
| `notificationOccurrences.notificationId` FK with `onDelete: "cascade"` | PASS | Both `schema.ts` and the raw SQL file agree: `ON DELETE cascade`. |
| Enum extension runs outside a transaction | PASS (conditional) | The SQL file is correctly hand-written and carries the comment. The journal seeding step must be confirmed before merge (see MEDIUM finding above). |
| Migration sequence: enum (0102) before schema changes (0103) | FAIL | Both files currently carry prefix `0102`. The schema migration file must be renamed to `0103`. |
| `UserNotification` type picks up new columns automatically | PASS | `$inferSelect` on `pgTable` is structural; no manual type update needed. |
| `NotificationOccurrence` / `InsertNotificationOccurrence` exported | PASS | Both types exported at `schema.ts` lines 3162–3163. |
| Unique partial index on `(userId, groupKey) WHERE NOT dismissed AND groupKey NOT NULL` | PASS | Drizzle definition and SQL DDL agree on columns and condition. The WHERE form (`= false` vs `IS FALSE`) is a LOW-severity style issue, not a semantic one. |
| Composite index on `(notificationId, occurredAt)` for occurrence queries | PASS | Present in both `schema.ts` and the raw SQL. |
| Test file covers all schema aspects specified in plan §5.2 | PARTIAL | All column-shape tests present. Index test present but WHERE predicate unaaserted (MEDIUM). FK/CASCADE integration test absent (LOW). |
| `direct_message` and `urgent_message` enum values added with `IF NOT EXISTS` guard | PASS | Idempotent DDL — safe to re-run. |

---

### Recommendations

1. **Rename `0102_slim_red_wolf.sql` to `0103_slim_red_wolf.sql` before merge.** This is the only blocking change. The collision with the enum migration file at the same `0102` prefix will cause drizzle-kit to mis-sequence the migrations.

2. **Assert the partial index WHERE predicate in the test.** Add `expect(dedupIndex!.config.where).toContain("isDismissed")` to the dedup index test. This is the security constraint that prevents race-condition duplicate notifications; it deserves an explicit test assertion, not just an existence check.

3. **Confirm the journal seeding step.** The enum migration approach is correct and well-understood from prior work on this codebase (same pattern as Spec 043 `creditSourceTypeEnum` migration). Add a short checklist item in the PR description confirming `drizzle.__drizzle_migrations` was seeded for `0102_notification_type_enum_extension`.

4. **Change `"isDismissed" = false` to `"isDismissed" IS FALSE`** in both `0103_slim_red_wolf.sql` and the `schema.ts` `.where(sql\`...\`)` expression. The strings must remain identical so drizzle-kit recognizes them as the same index.
