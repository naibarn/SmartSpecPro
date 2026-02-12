Now I'll generate the content for section-06-trash-job based on the context from the plan files.

# Section 06: Trash Auto-Purge Background Job

**Feature:** SSP-SHAREFILE-009 Custom Groups & Permission-based File Sharing
**Section:** section-06-trash-job
**Dependencies:** section-01-database-schema
**Blocks:** section-12-deployment-verification

---

## Overview

This section implements a background job that automatically purges files from trash after 90 days. The job runs daily at 2 AM, deleting file storage (S3/R2), vector embeddings, and database records for items that have been in trash for more than 90 days.

**Key Requirements:**
- 90-day retention period from `deletedAt` timestamp
- Complete cleanup: S3/R2 storage, vector DB, database records
- Graceful error handling (vector deletion failures should not block DB cleanup)
- Retry logic for database failures
- Audit logging of purge operations

---

## Tests First

**Test File:** `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/purgeOldTrashItems.test.ts` (NEW)

### Test Stubs

```typescript
describe('purgeOldTrashItems', () => {
  describe('cutoff date calculation', () => {
    it('should identify items with deletedAt < (NOW() - 90 days)', async () => {
      // Stub: Create items with various deletedAt timestamps
      // Stub: Verify only items older than 90 days are selected
    });

    it('should exclude items deleted less than 90 days ago', async () => {
      // Stub: Create item deleted 89 days ago
      // Stub: Verify item is not purged
    });
  });

  describe('storage cleanup', () => {
    it('should delete S3/R2 files for sourceUrl', async () => {
      // Stub: Mock storageService.deleteFile
      // Stub: Create item with sourceUrl
      // Stub: Verify deleteFile called with sourceUrl
    });

    it('should delete S3/R2 files for thumbnailUrl', async () => {
      // Stub: Mock storageService.deleteFile
      // Stub: Create item with thumbnailUrl
      // Stub: Verify deleteFile called with thumbnailUrl
    });

    it('should handle items with no sourceUrl or thumbnailUrl', async () => {
      // Stub: Create item without URLs
      // Stub: Verify no storage deletion attempts
    });
  });

  describe('vector DB cleanup', () => {
    it('should delete from vector DB', async () => {
      // Stub: Mock vector DB client
      // Stub: Verify deletion called
    });

    it('should handle vector deletion failures gracefully', async () => {
      // Stub: Mock vector DB to throw error
      // Stub: Verify job continues (logs warning, doesn't crash)
    });
  });

  describe('database deletion cascade', () => {
    it('should delete library_chunks rows', async () => {
      // Stub: Create item with chunks
      // Stub: Verify chunks deleted
    });

    it('should delete library_permissions rows', async () => {
      // Stub: Create item with permissions
      // Stub: Verify permissions deleted
    });

    it('should hard delete library_items row', async () => {
      // Stub: Create item in trash
      // Stub: Verify item hard deleted (not soft delete)
    });

    it('should perform cascade in correct order (chunks → permissions → items)', async () => {
      // Stub: Create item with chunks and permissions
      // Stub: Verify deletion order (foreign key dependencies)
    });
  });

  describe('error handling and retry', () => {
    it('should retry DB deletion failures via BullMQ (max 3 retries)', async () => {
      // Stub: Mock DB to fail twice, succeed third time
      // Stub: Verify job retries and eventually succeeds
    });

    it('should log errors without stopping batch processing', async () => {
      // Stub: Create 5 items, fail deletion on 2nd item
      // Stub: Verify remaining items are still processed
    });
  });

  describe('audit logging', () => {
    it('should log count of purged items', async () => {
      // Stub: Mock audit logger
      // Stub: Purge 3 items
      // Stub: Verify log entry with count = 3
    });

    it('should log zero purges when no items meet criteria', async () => {
      // Stub: No items in trash
      // Stub: Verify log entry with count = 0
    });
  });

  describe('job scheduling', () => {
    it('should be scheduled for daily execution at 2 AM', () => {
      // Stub: Verify job has cron schedule '0 2 * * *'
    });

    it('should be registered in server startup', () => {
      // Stub: Import server startup module
      // Stub: Verify job is added to BullMQ queue
    });

    it('should gracefully close worker on SIGTERM', async () => {
      // Stub: Mock SIGTERM signal
      // Stub: Verify worker.close() called
    });
  });
});
```

---

## Implementation Details

### Background Technology

This project already uses **BullMQ** for background jobs (see Python backend's Celery tasks and Node.js media processing queues). We'll extend the BullMQ infrastructure for this trash purge job.

**Existing BullMQ Setup:**
- Redis connection configured in `apps/web/server/_core/env.ts`
- Queue initialization pattern in `apps/web/server/routers/mediaJobs.ts`

---

### File Creation

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/purgeOldTrashItems.ts` (NEW)

**Signature Stub:**
```typescript
import { Queue, Worker } from 'bullmq';
import { db } from '../db';
import { libraryItems, libraryChunks, libraryPermissions } from '../../drizzle/schema';
import { lt, and, isNotNull } from 'drizzle-orm';
import { storageService } from '../services/storageService';
import { vectorDbClient } from '../services/vectorDbClient'; // Assume exists
import { logger } from '../_core/logger';

// Job configuration
const TRASH_AUTO_PURGE_QUEUE = 'trash-auto-purge';
const TRASH_RETENTION_DAYS = 90;

// Create queue
export const trashPurgeQueue = new Queue(TRASH_AUTO_PURGE_QUEUE, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

// Schedule job: Daily at 2 AM
export async function scheduleTrashPurgeJob() {
  await trashPurgeQueue.add(
    'purge-old-trash',
    {},
    {
      repeat: {
        pattern: '0 2 * * *', // Cron: 2 AM daily
      },
    }
  );
  logger.info('Trash auto-purge job scheduled for daily execution at 2 AM');
}

// Worker implementation
export const trashPurgeWorker = new Worker(
  TRASH_AUTO_PURGE_QUEUE,
  async (job) => {
    logger.info('Starting trash auto-purge job', { jobId: job.id });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - TRASH_RETENTION_DAYS);

    // Find items to purge: deletedAt < cutoffDate
    const itemsToPurge = await db
      .select({
        id: libraryItems.id,
        sourceUrl: libraryItems.sourceUrl,
        thumbnailUrl: libraryItems.thumbnailUrl,
      })
      .from(libraryItems)
      .where(
        and(
          isNotNull(libraryItems.deletedAt),
          lt(libraryItems.deletedAt, cutoffDate)
        )
      );

    logger.info(`Found ${itemsToPurge.length} items to purge`, {
      cutoffDate: cutoffDate.toISOString(),
    });

    let purgedCount = 0;

    for (const item of itemsToPurge) {
      try {
        await purgeItem(item);
        purgedCount++;
      } catch (error) {
        logger.error('Failed to purge item, will retry', {
          itemId: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error; // Trigger BullMQ retry
      }
    }

    logger.info('Trash auto-purge job completed', {
      purgedCount,
      totalFound: itemsToPurge.length,
    });

    return { purgedCount };
  },
  {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    limiter: {
      max: 1,
      duration: 60000, // Max 1 job per minute (prevent concurrent purges)
    },
    attempts: 3, // Retry failed items up to 3 times
  }
);

// Purge single item
async function purgeItem(item: {
  id: number;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
}) {
  // Step 1: Delete from S3/R2 storage
  if (item.sourceUrl) {
    try {
      await storageService.deleteFile(item.sourceUrl);
      logger.debug('Deleted sourceUrl from storage', { itemId: item.id, url: item.sourceUrl });
    } catch (error) {
      logger.warn('Failed to delete sourceUrl from storage (continuing)', {
        itemId: item.id,
        url: item.sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (item.thumbnailUrl) {
    try {
      await storageService.deleteFile(item.thumbnailUrl);
      logger.debug('Deleted thumbnailUrl from storage', { itemId: item.id, url: item.thumbnailUrl });
    } catch (error) {
      logger.warn('Failed to delete thumbnailUrl from storage (continuing)', {
        itemId: item.id,
        url: item.thumbnailUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Step 2: Delete from vector DB (graceful failure)
  try {
    await vectorDbClient.deleteByItemId(item.id);
    logger.debug('Deleted vector embeddings', { itemId: item.id });
  } catch (error) {
    logger.warn('Failed to delete from vector DB (orphaned vectors acceptable)', {
      itemId: item.id,
      error: error instanceof Error ? error.message : String(error),
    });
    // Do NOT throw - orphaned vectors are acceptable per plan
  }

  // Step 3: Delete from database (cascade order: chunks → permissions → item)
  await db.transaction(async (tx) => {
    // Delete chunks first (foreign key to library_items)
    const deletedChunks = await tx
      .delete(libraryChunks)
      .where(eq(libraryChunks.libraryItemId, item.id));

    logger.debug('Deleted library_chunks', { itemId: item.id });

    // Delete permissions second
    const deletedPermissions = await tx
      .delete(libraryPermissions)
      .where(eq(libraryPermissions.libraryItemId, item.id));

    logger.debug('Deleted library_permissions', { itemId: item.id });

    // Hard delete item last
    const deletedItem = await tx
      .delete(libraryItems)
      .where(eq(libraryItems.id, item.id));

    logger.debug('Hard deleted library_items row', { itemId: item.id });
  });

  logger.info('Successfully purged item', { itemId: item.id });
}

// Graceful shutdown handler
export async function closeTrashPurgeWorker() {
  await trashPurgeWorker.close();
  logger.info('Trash purge worker closed');
}
```

---

### Server Registration

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/index.ts` (EXTEND)

Add job initialization in server startup:

```typescript
import { scheduleTrashPurgeJob, closeTrashPurgeWorker } from './jobs/purgeOldTrashItems';

// In server startup (after database connection)
async function startServer() {
  // ... existing startup code ...

  // Schedule trash auto-purge job
  await scheduleTrashPurgeJob();

  // ... existing code ...

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing workers...');
    await closeTrashPurgeWorker();
    process.exit(0);
  });
}
```

---

## Dependencies

### External Services

**Storage Service:**
- Assumes `storageService.deleteFile(url)` exists in `/home/dev/projects/SmartSpecPro/apps/web/server/services/storageService.ts`
- If not exists, stub implementation:
  ```typescript
  export const storageService = {
    async deleteFile(url: string): Promise<void> {
      // Parse URL to extract bucket and key
      // Call S3/R2 deleteObject API
    }
  };
  ```

**Vector DB Client:**
- Assumes `vectorDbClient.deleteByItemId(itemId)` exists
- If not exists, stub implementation:
  ```typescript
  export const vectorDbClient = {
    async deleteByItemId(itemId: number): Promise<void> {
      // Call vector DB (e.g., Pinecone, Weaviate) to delete embeddings where metadata.itemId = itemId
    }
  };
  ```

**Logger:**
- Use existing logger from `/home/dev/projects/SmartSpecPro/apps/web/server/_core/logger.ts`

---

## Database Schema Requirements

This section **depends on** section-01-database-schema being completed first:
- `library_items.deletedAt` column must exist
- `library_items.deletedBy` column must exist (not used in this job, but part of schema)
- Foreign key relationships must be set up correctly for cascade deletion

---

## Error Handling Strategy

**Storage Deletion Failures:**
- Log warning and continue (orphaned S3/R2 files are acceptable)
- Reason: Rare, and S3 lifecycle policies can clean up later

**Vector DB Deletion Failures:**
- Log warning and continue (orphaned vectors are acceptable)
- Reason: Vector DB is eventually consistent; orphaned vectors don't break functionality

**Database Deletion Failures:**
- Throw error to trigger BullMQ retry (up to 3 attempts)
- Reason: Database consistency is critical; must not leave partial deletions

**Job-Level Failures:**
- BullMQ automatically retries failed jobs
- Max 3 attempts before moving to failed queue
- Admin can manually retry failed jobs via BullMQ dashboard

---

## Performance Considerations

**Batch Size:**
- Current implementation processes all items in one job execution
- For large-scale tenants (1000+ items in trash), this could take minutes
- **Post-MVP optimization:** Batch processing with LIMIT/OFFSET pagination

**Rate Limiting:**
- Worker limiter: Max 1 job per minute (prevents concurrent purge jobs)
- Reason: Avoid race conditions and database contention

**Database Transaction Size:**
- Each item purge is a separate transaction
- Reason: Failure on one item doesn't roll back others

---

## Monitoring and Observability

**Metrics to Track:**
- Daily purge count (via audit log)
- Job execution time
- Failure rate (items that failed after 3 retries)
- Storage deletion success rate
- Vector DB deletion success rate

**Audit Log Entry Format:**
```json
{
  "eventType": "trash_auto_purge",
  "timestamp": "2026-02-12T02:00:00.000Z",
  "purgedCount": 15,
  "totalFound": 15,
  "cutoffDate": "2025-11-14T02:00:00.000Z",
  "executionTimeMs": 1234
}
```

---

## Testing Strategy

**Unit Tests:**
- Test cutoff date calculation
- Test storage deletion logic (mock S3/R2 client)
- Test vector DB deletion logic (mock vector client)
- Test database cascade order
- Test error handling and retry logic

**Integration Tests:**
- Create test items in trash with various deletedAt timestamps
- Run job manually (bypass cron schedule)
- Verify only items older than 90 days are purged
- Verify S3/R2 files are deleted
- Verify database records are hard deleted

**Manual Testing (Staging):**
- Create test item, soft delete it
- Manually update `deletedAt` to 91 days ago
- Wait for next job execution (or trigger manually)
- Verify item is purged

---

## Security Considerations

**Tenant Isolation:**
- No explicit tenant filtering needed (deletion is based on `deletedAt` timestamp only)
- All items in trash already have tenant isolation enforced at creation time

**Audit Trail:**
- Purged items are permanently deleted (no audit trail in database)
- Recommendation: Archive purge logs to external system for compliance

**Permission Checks:**
- No permission checks needed (job runs as system user)
- Only acts on items already in trash (user permission was checked at soft delete time)

---

## Rollback and Recovery

**If Job Purges Wrong Items:**
- No rollback possible (hard delete is permanent)
- **Prevention:** Extensive testing in staging before production deployment
- **Mitigation:** Backup database daily before job execution (via cron)

**Backup Strategy:**
```bash
# Daily backup before trash purge (1:50 AM, before 2 AM job)
0 1 * * * pg_dump "$DATABASE_URL" --table=library_items --table=library_chunks --table=library_permissions --file=/backups/pre-purge-$(date +\%Y\%m\%d).sql
```

---

## Known Limitations

**No Tenant-Specific Retention Policies:**
- All tenants have same 90-day retention period
- **Post-MVP:** Allow admins to configure retention period per tenant

**No User Notification Before Purge:**
- Users are not notified before their trash items are purged
- **Post-MVP:** Send notification 7 days before auto-purge

**No Manual Override:**
- Users cannot "lock" items to prevent auto-purge
- **Post-MVP:** Add "Keep Forever" flag on trash items

---

## Deployment Checklist

- [ ] BullMQ Redis connection configured in production
- [ ] Storage service `deleteFile` method exists and tested
- [ ] Vector DB client `deleteByItemId` method exists and tested
- [ ] Job scheduled in server startup
- [ ] SIGTERM handler registered for graceful shutdown
- [ ] Daily database backup cron job configured (1:50 AM)
- [ ] Monitoring dashboard configured for job metrics
- [ ] Alert configured for job failures (> 3 consecutive failures)

---

## Related Sections

**Dependencies:**
- section-01-database-schema (must complete first)

**Blocks:**
- section-12-deployment-verification (waits for this section)

**Related:**
- section-05-library-router (implements `permanentDelete` mutation for manual user deletion)
- section-09-trash-ui (displays trash items with daysUntilPurge countdown)

---

**End of Section 06**