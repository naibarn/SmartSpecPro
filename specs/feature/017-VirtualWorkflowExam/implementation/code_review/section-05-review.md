# Section 05 Code Review: tRPC Endpoints

## Summary

Router implementation is structurally correct. Four procedures properly placed, imports clean, error handling follows existing pattern, FTS uses correct `plainto_tsquery`, column exclusion done via explicit select, downloadCount increment uses SQL expression.

## HIGH

### 1. Tests are hollow — only check procedure existence, no behavioral tests
The spec defines ~20 test cases. Implementation has 7 tests that only assert `toBeDefined()`. No procedure calls, no behavior verification.

### 2. useTemplate not transactional — partial failure risk
Three sequential DB operations (fetch, insert, update) not wrapped in a transaction.

## MEDIUM

### 3. useTemplate doesn't filter isPublic on template fetch
User could clone a non-public/draft template if they know the numeric ID.

### 4. Search input has no max length
Could allow extremely long search strings to PostgreSQL.

## LOW

### 5. tags input accepted but never used (spec says "pass-through for now")
### 6. count() result may be string, not number
### 7. No ordering option (hardcoded by downloadCount desc)
