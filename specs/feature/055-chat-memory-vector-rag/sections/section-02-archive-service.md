# Section 02: Archive Service

## Overview

Implements `memoryArchiveService.ts` -- writes raw chat messages to encrypted JSONL files on disk as a safety net. Each line independently encrypted with AES-256-GCM (per-record IV) using existing `crypto.ts`. Archive metadata tracked in `memory_archive_metadata` table.

**File to create:** `apps/web/server/services/memoryArchiveService.ts`
**Test file:** `apps/web/server/services/__tests__/memoryArchiveService.test.ts`

**Depends on:** section-01-schema-migration
**Blocks:** section-08-process-integration, section-10-trpc-endpoints

---

## Types

```typescript
export interface ArchiveRecord {
  messageId: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: string;    // ISO 8601
  metadata?: Record<string, unknown>;
}

export interface ReadArchiveOptions {
  tenantId: string;
  userId: number;
  conversationId: number;
  dateFrom: Date;
  dateTo: Date;
}

export interface SearchArchiveOptions {
  tenantId: string;
  userId: number;
  conversationId: number;
  query: string;
  limit: number; // 1-50
}
```

## Constants

```typescript
const ARCHIVE_BASE_DIR = path.resolve(process.cwd(), "data", "memory-archives");
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MIN_RETENTION_DAYS = 7; // hardcoded floor
```

---

## Functions

### `sanitizePathSegment(segment: string): string`
Strip non-alphanumeric/hyphen/underscore chars. Throw if result empty.

### `resolveArchivePath(tenantId, userId, conversationId, date): string`
Build `{ARCHIVE_BASE_DIR}/{sanitizedTenantId}/{userId}/conv-{conversationId}-{YYYY-MM-DD}.jsonl`. Verify via `path.resolve()` containment check.

### `archiveMessage(tenantId, userId, conversationId, record): Promise<void>`
Resolve path, check file size (rotate at 50MB), serialize to JSON, encrypt via `encrypt()`, append. Upsert `memory_archive_metadata`. Fire-and-forget (catch + log, never throw).

### `readArchive(options): Promise<ArchiveRecord[]>`
Query metadata, read files, decrypt each line, parse JSON, return sorted by `createdAt`.

### `searchArchive(options): Promise<ArchiveRecord[]>`
Read archive, filter by case-insensitive substring match, return up to `limit`.

### `cleanupExpiredArchives(tenantId, retentionDays): Promise<{ deletedFiles: number }>`
Enforce `Math.max(retentionDays, MIN_RETENTION_DAYS)`. Delete expired files + metadata rows.

### `deleteUserArchives(tenantId, userId): Promise<void>`
Remove user's archive directory recursively + delete all metadata rows. For GDPR compliance.

---

## Database Interaction

Upsert pattern for `memory_archive_metadata`:

```typescript
await db.insert(memoryArchiveMetadata)
  .values({ tenantId, userId, conversationId, archiveDate: dateStr, filePath, messageCount: 1, fileSizeBytes: actualSize, encryptionVersion: 1 })
  .onConflictDoUpdate({
    target: [memoryArchiveMetadata.conversationId, memoryArchiveMetadata.archiveDate],
    set: { messageCount: sql`${memoryArchiveMetadata.messageCount} + 1`, fileSizeBytes: sql`excluded."fileSizeBytes"` },
  });
```

---

## Tests

```
Test: archiveMessage encrypts record and appends to correct file path
Test: archiveMessage creates directory structure if not exists
Test: readArchive decrypts all records in date range
Test: readArchive returns empty array for non-existent file
Test: searchArchive finds records matching keyword query
Test: sanitizePathSegment rejects "../" and traversal patterns
Test: sanitizePathSegment rejects empty string
Test: resolveArchivePath throws on path traversal attempt
Test: resolveArchivePath produces correct path for valid inputs
Test: cleanupExpiredArchives only deletes files older than retention
Test: cleanupExpiredArchives enforces 7-day minimum retention
Test: deleteUserArchives removes entire user directory recursively
Test: per-record encryption uses unique IV per line
Test: metadata upsert increments messageCount on each append
```

---

## Security

1. **Path traversal prevention:** `sanitizePathSegment` + `path.resolve()` containment check
2. **Per-record encryption:** Each JSONL line independently encrypted via `crypto.ts` (fresh IV per call)
3. **No plaintext on disk:** Only encrypted strings written
4. **Archive location:** `data/memory-archives/` at monorepo root, NOT served by Nginx
5. **GDPR:** `deleteUserArchives` removes files synchronously during account deletion
