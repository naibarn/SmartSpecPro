# Code Review: Section 04 - Funnel Analytics Router

## CRITICAL
1. CSV injection vulnerability in export - no escaping for eventName/bucket
2. redis.keys() blocks Redis server - should use SCAN
3. Missing dedicated stage procedures (acquisition, activation, etc.)

## IMPORTANT
4. Silent fallback to "default" tenantId - data isolation risk
5. Role defaulting to "admin" - grants max privileges on missing role
6. Raw events expose full properties JSONB without filtering
7. No structured logging for domain fallback paths
8. timeSeries not cached (plan requires it)
9. Cache key missing bucket parameter

## MINOR
10. Weak bucketToSql tests
11. No router procedure tests (complex setup needed)
12. Redis import pattern inconsistency
13. Unused imports in test file

## POSITIVE
- Scope filter design is structurally sound
- Date range clamping is defensive
- Zod input validation is thorough
- Drizzle ORM prevents SQL injection in parameterized paths
- Router registration follows project patterns
