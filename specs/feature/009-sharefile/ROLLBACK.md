# Rollback Procedures for SSP-SHAREFILE-009

## Scenario 1: Migration Failure

If migrations fail to apply:

1. Stop the application:
   ```bash
   ./run-services.sh stop
   ```

2. Restore database from backup:
   ```bash
   psql "$DATABASE_URL" < .db-backups/full_backup_TIMESTAMP.sql
   ```

3. Revert code changes:
   ```bash
   git checkout main  # or previous stable tag
   ```

4. Restart application:
   ```bash
   ./run-services.sh start
   ```

## Scenario 2: Critical Bug in Production

1. Disable feature flag (if implemented):
   ```sql
   UPDATE system_settings SET value = 'false' WHERE key = 'feature_groups_enabled';
   ```

2. Monitor for error cessation

3. If errors persist, proceed with full rollback (Scenario 1)

## Scenario 3: Performance Degradation

1. Check database connection pool utilization
2. Check Redis cache hit rates
3. Increase connection pool size if needed
4. Add aggressive caching if immediate mitigation needed
5. If unresolvable, proceed with rollback

## Scenario 4: Security Vulnerability

1. Immediately disable affected endpoints
2. Revoke all group permissions temporarily:
   ```sql
   DELETE FROM library_permissions WHERE "subjectType" = 'group';
   ```
3. Fix vulnerability
4. Re-test security tests
5. Re-enable endpoints
