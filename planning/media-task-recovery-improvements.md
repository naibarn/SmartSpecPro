# Media Task Recovery System - Implementation Summary

## Problem Statement

Video generation tasks were getting stuck in "processing" status after:
1. Celery worker restarts interrupted polling
2. Longer generation times for certain models
3. High Kie.ai API usage periods

## Implemented Solutions

### 1. Automatic Stuck Task Recovery (`recover_stuck_tasks`)

**Location:** `python-backend/app/tasks/media_tasks.py`

**What it does:**
- Runs every 10 minutes via Celery Beat
- Finds tasks stuck in "processing" status for more than 20 minutes
- Polls Kie.ai API for actual status
- Takes appropriate action:
  - ✅ **Success:** Updates task to completed with results
  - ❌ **Failed:** Marks task as failed with error message
  - ⏳ **Still Processing:** Resets timer and re-submits to Celery for continued polling
  - ❓ **Unknown:** Marks as failed with unknown state error

**Key Features:**
- Resilient to worker restarts - tasks will be recovered within 10-20 minutes
- Processes up to 20 stuck tasks per cycle
- Detailed logging for debugging
- Graceful error handling - skips problematic tasks without stopping recovery

**Schedule:** Every 10 minutes (configured in `celery_app.py`)

### 2. Increased Polling Timeout

**Location:** `python-backend/app/llm_proxy/providers/kie_ai_provider.py`

**Changes:**
- HTTP client timeout: `300s → 600s` (5 min → 10 min)
- Video generation max_wait: `600s → 1200s` (10 min → 20 min)

**Reason:**
- Some models (especially higher quality/resolution) take longer to generate
- High Kie.ai usage periods may cause slower processing
- Prevents premature timeout errors

### 3. Task Routing Configuration

**Location:** `python-backend/app/core/celery_app.py`

**Added:**
- Task route for `recover_stuck_tasks` → media queue
- Beat schedule entry for periodic execution every 10 minutes

## How It Works Together

```
Timeline for a stuck task:

T+0:   Task starts processing (status=processing, started_at=now)
T+10:  Video generation hits timeout (10 min → 20 min now)
       Task remains in "processing" status
       Worker may have restarted - polling interrupted

T+20:  Recovery task runs (every 10 min)
       Finds task (started_at > 20 min ago)
       Polls Kie.ai for status

       Case A - Video ready:
         → Updates to "completed" with result URL

       Case B - Still processing:
         → Resets started_at
         → Re-submits to Celery
         → Task continues polling

       Case C - Failed on Kie.ai:
         → Updates to "failed" with error
```

## Rate Limit Handling

The system respects Kie.ai's rate limits:
- **Generation rate:** 20 requests / 10 seconds
- **Query rate:** 10 requests / second
- **Hourly point limit:** Based on user's credit balance

Recovery task:
- Only polls for status (query rate applies)
- Processes max 20 tasks per cycle
- Runs every 10 minutes (low frequency)
- No risk of hitting rate limits during recovery

## Monitoring

### Check Recovery Task Status
```bash
# View beat schedule
docker logs smartspec-celery-beat --tail 50

# View recovery task execution
docker logs smartspec-celery-media | grep recover_stuck
```

### Check for Stuck Tasks
```sql
SELECT id, media_type, status, task_id,
       created_at, started_at, completed_at,
       EXTRACT(EPOCH FROM (NOW() - started_at))/60 as stuck_minutes
FROM media_tasks
WHERE status = 'processing'
  AND started_at < NOW() - INTERVAL '20 minutes'
ORDER BY started_at DESC;
```

### View Recovery Logs
```bash
docker logs smartspec-celery-media 2>&1 | grep -A5 "recover_stuck_tasks"
```

## Testing

### Manual Test - Trigger Recovery
```python
# In Python shell or script
from app.tasks.media_tasks import recover_stuck_tasks
result = recover_stuck_tasks.delay()
print(result.get())
```

### Verify Worker Registration
```bash
docker logs smartspec-celery-media 2>&1 | grep "recover_stuck_tasks"
# Should show: . app.tasks.media_tasks.recover_stuck_tasks
```

## Files Changed

1. **python-backend/app/tasks/media_tasks.py**
   - Added `_recover_stuck_tasks_async()` function
   - Added `recover_stuck_tasks()` Celery task wrapper

2. **python-backend/app/core/celery_app.py**
   - Added task routing for `recover_stuck_tasks`
   - Added beat schedule entry (every 10 minutes)

3. **python-backend/app/llm_proxy/providers/kie_ai_provider.py**
   - Increased HTTP client timeout: 300s → 600s
   - Increased video polling max_wait: 600s → 1200s

## Benefits

✅ **Automatic Recovery:** Tasks stuck due to worker restarts auto-recover within 10-20 minutes
✅ **Longer Generation Support:** 20-minute timeout handles slower models
✅ **High Usage Resilience:** System adapts to Kie.ai load periods
✅ **No Manual Intervention:** User doesn't need to click "Fetch Result" button
✅ **Detailed Logging:** Full visibility into recovery process
✅ **Graceful Degradation:** Recovery failures don't block other tasks

## Future Enhancements

Consider if needed:
- [ ] Exponential backoff for polling during high usage periods
- [ ] User notification when task recovers after long delay
- [ ] Metrics/dashboard for stuck task statistics
- [ ] Configurable recovery intervals based on time of day

## Deployment

Changes deployed on: 2026-02-09 12:40 UTC

Services restarted:
```bash
docker compose -f docker-compose.media.yml restart celery-media celery-beat
```

Status: ✅ **ACTIVE** - Recovery task running every 10 minutes
