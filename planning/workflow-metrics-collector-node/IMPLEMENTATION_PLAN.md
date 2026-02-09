# Metrics Collector Workflow Node Executor - Implementation Plan

## Problem Statement

Workflow executions currently have no built-in way to record custom observability metrics during execution. Workflow authors need the ability to instrument their workflows with counters (e.g., total executions), gauges (e.g., queue depth), histograms (e.g., response time distributions), and summaries (e.g., duration tracking) -- stored durably in Redis with Prometheus-compatible exposition format. This node enables monitoring dashboards, alerting, and performance analysis of workflow behavior in production.

## Architecture Overview

```
Workflow Execution
    |
    v
[Metrics Collector Node]
    |
    +-- validate metricType (counter | gauge | histogram | summary)
    |
    +-- validate metricName (Prometheus naming: [a-zA-Z_:][a-zA-Z0-9_:]*)
    |
    +-- sanitize labels (key-value pairs, max 10 labels, safe characters)
    |
    +-- connect to Redis (REDIS_URL from config)
    |
    +-- execute recording (Lua script, atomic)
    |       |
    |       +-- counter:   HINCRBYFLOAT on metric hash
    |       +-- gauge:     HSET on metric hash
    |       +-- histogram: ZADD value to sorted set + update count/sum
    |       +-- summary:   LPUSH value to capped list + update count/sum
    |       |
    |       v
    |   {recorded: true, metricName, timestamp}
    |
    +-- set TTL on all metric keys (default 24h, configurable)
    |
    +-- return outputs to downstream nodes
```

### Redis Key Schema

All metric keys are namespaced under `wf_metrics:` to avoid collision with other Redis usage.

```
# Counter
wf_metrics:counter:{metricName}:{label_hash}         -> float value (HINCRBYFLOAT)

# Gauge
wf_metrics:gauge:{metricName}:{label_hash}            -> float value (HSET)

# Histogram
wf_metrics:histogram:{metricName}:{label_hash}:values -> sorted set (score=value, member=timestamp:uuid)
wf_metrics:histogram:{metricName}:{label_hash}:meta   -> hash {count, sum}

# Summary
wf_metrics:summary:{metricName}:{label_hash}:values   -> list (capped at 1000 observations)
wf_metrics:summary:{metricName}:{label_hash}:meta     -> hash {count, sum}

# Label index (for Prometheus exposition)
wf_metrics:labels:{metricName}:{label_hash}            -> hash of label key-value pairs
wf_metrics:label_index:{metricName}                    -> set of label_hash values

# Metadata
wf_metrics:meta:{metricName}                           -> hash {type, help, unit, created_at}
```

### Label Hash Computation

Labels are sorted by key, concatenated as `key=value`, then SHA-256 hashed (first 16 hex chars) to create a deterministic, collision-resistant identifier:

```python
label_hash = hashlib.sha256(
    "&".join(f"{k}={v}" for k, v in sorted(labels.items()))
    .encode()
).hexdigest()[:16]
```

Empty labels produce a fixed hash: `__no_labels__`.

### Prometheus Exposition Format

The `/api/v1/workflows/metrics` endpoint (Phase 2 stub) will iterate over `wf_metrics:meta:*` keys and produce standard Prometheus text format:

```
# HELP workflow_executions Total workflow executions
# TYPE workflow_executions counter
workflow_executions{workflow_id="123",status="success"} 42
workflow_executions{workflow_id="123",status="failed"} 3

# HELP workflow_duration_seconds Workflow execution duration
# TYPE workflow_duration_seconds histogram
workflow_duration_seconds_bucket{le="0.1"} 10
workflow_duration_seconds_bucket{le="0.5"} 25
workflow_duration_seconds_bucket{le="1.0"} 30
workflow_duration_seconds_bucket{le="+Inf"} 35
workflow_duration_seconds_sum 42.5
workflow_duration_seconds_count 35
```

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/orchestrator/node_executors/output_executors/metrics_collector_executor.py` | **CREATE** | Main executor with 4 metric types + Redis storage |
| `python-backend/app/orchestrator/node_executors/output_executors/__init__.py` | **MODIFY** | Export `MetricsCollectorExecutor` |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `metrics_collector` node type spec |
| `apps/web/client/src/lib/workflow/useNodeRegistry.ts` | **MODIFY** | Add `monitoring` to category union type |
| `python-backend/tests/test_metrics_collector_executor.py` | **CREATE** | Unit + integration tests |

No database schema changes. No migration needed. All state lives in Redis with TTL.

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Redis connection failure | Medium | Fail-closed with clear error; metric recording should not silently drop |
| Redis memory growth | Medium | All keys get TTL (default 24h); histogram/summary capped at 1000 observations |
| Label cardinality explosion | Medium | Max 10 labels per metric; max 50 unique label combinations per metric name |
| Metric name collision | Low | Namespace prefix `wf_metrics:`; validate Prometheus naming convention |
| Lua script errors | Low | Scripts are static, tested; no dynamic code injection |
| Clock skew across workers | Low | Timestamps from `time.time()` on the Python worker; Redis TIME for TTL only |
| Large sorted sets | Medium | Histogram observations capped at 10,000 entries via ZREMRANGEBYRANK in Lua |

## Verification Steps

1. Run `pytest python-backend/tests/test_metrics_collector_executor.py -v` -- all tests pass
2. Run `pytest python-backend/ -v` -- no regressions
3. Run `ruff check python-backend/app/orchestrator/node_executors/output_executors/metrics_collector_executor.py` -- no lint errors
4. Run `black --check python-backend/app/orchestrator/node_executors/output_executors/metrics_collector_executor.py` -- formatted
5. Verify node appears in GET `/api/v1/workflows/node-types` response with category `monitoring`
6. Verify Redis keys created with correct TTL after executor runs

---

## Step 1: Metrics Collector Executor Module

**File**: `python-backend/app/orchestrator/node_executors/output_executors/metrics_collector_executor.py`

### 1.1 Class Structure

```python
"""Metrics Collector Executor - Record workflow metrics to Redis with Prometheus-compatible format.

Supports four metric types:
- counter: Increment-only counter (monotonically increasing)
- gauge: Current value that can increase or decrease
- histogram: Distribution of values with configurable buckets
- summary: Duration/value tracking with observation list

All metrics are stored in Redis with configurable TTL (default 24h).
Fail-closed: Redis errors raise exceptions rather than silently dropping metrics.
"""
import hashlib
import re
import time
import uuid
from typing import Any

import structlog
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.core.config import settings
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)
```

### 1.2 Constants and Validation

```python
class MetricsCollectorExecutor:
    """Executor for metrics_collector nodes using Redis-backed metric storage.

    Supports counter, gauge, histogram, summary metric types.
    All use Lua scripts for atomic Redis operations.
    Fail-closed: any Redis error raises an exception.
    """

    # Metric type validation
    VALID_METRIC_TYPES = {"counter", "gauge", "histogram", "summary"}

    # Prometheus metric naming convention: [a-zA-Z_:][a-zA-Z0-9_:]*
    METRIC_NAME_PATTERN = re.compile(r"^[a-zA-Z_:][a-zA-Z0-9_:]*$")
    METRIC_NAME_MAX_LENGTH = 128

    # Label safety
    LABEL_KEY_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
    LABEL_VALUE_MAX_LENGTH = 256
    MAX_LABELS_PER_METRIC = 10
    MAX_LABEL_COMBOS_PER_METRIC = 50

    # Storage limits
    MAX_HISTOGRAM_OBSERVATIONS = 10_000
    MAX_SUMMARY_OBSERVATIONS = 1_000
    DEFAULT_TTL_SECONDS = 86_400  # 24 hours
    MAX_TTL_SECONDS = 604_800  # 7 days

    # Default histogram buckets (seconds)
    DEFAULT_HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]

    # Redis key prefix
    KEY_PREFIX = "wf_metrics"
```

### 1.3 Redis Connection (same pattern as RateLimiterExecutor)

```python
    def __init__(self) -> None:
        self._redis: Redis | None = None

    async def _get_redis(self) -> Redis:
        """Get or create async Redis connection.

        Raises:
            ConnectionError: If Redis is unreachable (fail-closed).
        """
        if self._redis is None:
            redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
            self._redis = Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
            )
            try:
                await self._redis.ping()
            except (RedisConnectionError, RedisTimeoutError, OSError) as e:
                self._redis = None
                raise ConnectionError(
                    f"Cannot connect to Redis at {redis_url} for metrics: {e}"
                ) from e
        return self._redis
```

### 1.4 Label Hashing

```python
    @staticmethod
    def _compute_label_hash(labels: dict[str, str]) -> str:
        """Compute deterministic hash for a set of labels.

        Args:
            labels: Key-value label pairs (already validated).

        Returns:
            16-char hex hash string, or '__no_labels__' for empty labels.
        """
        if not labels:
            return "__no_labels__"
        sorted_pairs = "&".join(f"{k}={v}" for k, v in sorted(labels.items()))
        return hashlib.sha256(sorted_pairs.encode()).hexdigest()[:16]
```

### 1.5 Input Validation

```python
    def _validate_metric_name(self, name: str) -> None:
        """Validate metric name follows Prometheus conventions.

        Raises:
            ValueError: If name is invalid.
        """
        if not name:
            raise ValueError("metricName is required")
        if len(name) > self.METRIC_NAME_MAX_LENGTH:
            raise ValueError(
                f"metricName exceeds max length ({self.METRIC_NAME_MAX_LENGTH})"
            )
        if not self.METRIC_NAME_PATTERN.match(name):
            raise ValueError(
                f"metricName '{name}' does not match Prometheus naming convention "
                f"[a-zA-Z_:][a-zA-Z0-9_:]*"
            )

    def _validate_labels(self, labels: dict[str, Any]) -> dict[str, str]:
        """Validate and sanitize label key-value pairs.

        Args:
            labels: Raw label dict from node config.

        Returns:
            Sanitized labels with string values.

        Raises:
            ValueError: If labels are invalid.
        """
        if not isinstance(labels, dict):
            raise ValueError("labels must be a JSON object (key-value pairs)")
        if len(labels) > self.MAX_LABELS_PER_METRIC:
            raise ValueError(
                f"Too many labels ({len(labels)}). Maximum is {self.MAX_LABELS_PER_METRIC}"
            )

        sanitized: dict[str, str] = {}
        for key, value in labels.items():
            key_str = str(key)
            if not self.LABEL_KEY_PATTERN.match(key_str):
                raise ValueError(
                    f"Label key '{key_str}' is invalid. Must match [a-zA-Z_][a-zA-Z0-9_]*"
                )
            # Prometheus reserved labels start with __
            if key_str.startswith("__"):
                raise ValueError(
                    f"Label key '{key_str}' uses reserved prefix '__'"
                )
            value_str = str(value)
            if len(value_str) > self.LABEL_VALUE_MAX_LENGTH:
                raise ValueError(
                    f"Label value for '{key_str}' exceeds max length "
                    f"({self.LABEL_VALUE_MAX_LENGTH})"
                )
            sanitized[key_str] = value_str

        return sanitized
```

### 1.6 Main Execute Method

```python
    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute metrics recording.

        Extracts configuration, validates inputs, and records the metric
        to Redis using the appropriate metric type handler.

        Args:
            data: Node execution data with config and inputs.
            context: Execution context (user, workflow, execution IDs).

        Returns:
            dict with recorded, metricName, timestamp, value, labels.

        Raises:
            ValueError: On invalid configuration.
            ConnectionError: If Redis is unreachable.
        """
        config = data.config
        inputs = data.inputs

        # --- Extract and validate metric type ---
        metric_type = inputs.get("metricType", config.get("metricType"))
        if metric_type not in self.VALID_METRIC_TYPES:
            raise ValueError(
                f"Invalid metricType '{metric_type}'. "
                f"Must be one of: {', '.join(sorted(self.VALID_METRIC_TYPES))}"
            )

        # --- Extract and validate metric name ---
        metric_name = inputs.get("metricName", config.get("metricName", ""))
        self._validate_metric_name(metric_name)

        # --- Extract value ---
        raw_value = inputs.get("value", config.get("value", 0))
        try:
            value = float(raw_value)
        except (TypeError, ValueError) as e:
            raise ValueError(f"Metric value must be numeric, got: {raw_value}") from e

        # Counter values must be non-negative
        if metric_type == "counter" and value < 0:
            raise ValueError(
                f"Counter metric value must be >= 0, got: {value}"
            )

        # --- Extract and validate labels ---
        raw_labels = inputs.get("labels", config.get("labels", {}))
        if raw_labels is None:
            raw_labels = {}
        labels = self._validate_labels(raw_labels)

        # Auto-inject context labels
        labels.setdefault("workflow_id", context.workflow_id)
        labels.setdefault("execution_id", context.execution_id)

        # --- Optional unit ---
        unit = inputs.get("unit", config.get("unit", ""))

        # --- TTL ---
        ttl = int(config.get("ttl", self.DEFAULT_TTL_SECONDS))
        ttl = max(60, min(ttl, self.MAX_TTL_SECONDS))

        # --- Get Redis connection ---
        try:
            redis = await self._get_redis()
        except ConnectionError:
            raise
        except (RedisError, OSError) as e:
            raise ConnectionError(f"Redis error during metrics recording: {e}") from e

        # --- Compute label hash ---
        label_hash = self._compute_label_hash(labels)

        # --- Check label cardinality ---
        await self._check_label_cardinality(redis, metric_name, label_hash)

        # --- Record metric ---
        now = time.time()
        record_fn = {
            "counter": self._record_counter,
            "gauge": self._record_gauge,
            "histogram": self._record_histogram,
            "summary": self._record_summary,
        }[metric_type]

        try:
            await record_fn(redis, metric_name, label_hash, value, ttl)
        except (RedisError, OSError) as e:
            raise ConnectionError(f"Redis error recording metric: {e}") from e

        # --- Store label mapping and metadata ---
        try:
            await self._store_label_mapping(redis, metric_name, label_hash, labels, ttl)
            await self._store_metric_metadata(
                redis, metric_name, metric_type, unit, ttl
            )
        except (RedisError, OSError) as e:
            # Non-fatal: metric was recorded, metadata is supplementary
            logger.warning(
                "metrics_metadata_store_failed",
                metric_name=metric_name,
                error=str(e),
            )

        logger.info(
            "metric_recorded",
            node_id=data.node_id,
            metric_type=metric_type,
            metric_name=metric_name,
            value=value,
            label_count=len(labels),
            label_hash=label_hash,
        )

        return {
            "recorded": True,
            "metricName": metric_name,
            "timestamp": now,
            "value": value,
            "metricType": metric_type,
            "labels": labels,
            "unit": unit,
        }
```

### 1.7 Metric Type Handlers

#### Counter (Lua script for atomic increment)

```python
    COUNTER_SCRIPT = """\
-- Atomic counter increment
-- KEYS[1] = wf_metrics:counter:{name}:{label_hash}
-- ARGV[1] = increment value
-- ARGV[2] = TTL in seconds

local key = KEYS[1]
local increment = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local new_value = redis.call('HINCRBYFLOAT', key, 'value', increment)
redis.call('EXPIRE', key, ttl)

return tostring(new_value)
"""

    async def _record_counter(
        self,
        redis: Redis,
        metric_name: str,
        label_hash: str,
        value: float,
        ttl: int,
    ) -> None:
        """Record counter metric (increment-only)."""
        key = f"{self.KEY_PREFIX}:counter:{metric_name}:{label_hash}"
        await redis.eval(self.COUNTER_SCRIPT, 1, key, str(value), str(ttl))
```

#### Gauge (Lua script for atomic set)

```python
    GAUGE_SCRIPT = """\
-- Atomic gauge set
-- KEYS[1] = wf_metrics:gauge:{name}:{label_hash}
-- ARGV[1] = value
-- ARGV[2] = TTL in seconds
-- ARGV[3] = timestamp

local key = KEYS[1]
local value = ARGV[1]
local ttl = tonumber(ARGV[2])
local timestamp = ARGV[3]

redis.call('HSET', key, 'value', value, 'updated_at', timestamp)
redis.call('EXPIRE', key, ttl)

return 1
"""

    async def _record_gauge(
        self,
        redis: Redis,
        metric_name: str,
        label_hash: str,
        value: float,
        ttl: int,
    ) -> None:
        """Record gauge metric (set to current value)."""
        key = f"{self.KEY_PREFIX}:gauge:{metric_name}:{label_hash}"
        now = str(time.time())
        await redis.eval(self.GAUGE_SCRIPT, 1, key, str(value), str(ttl), now)
```

#### Histogram (Lua script for atomic observation + bucket update)

```python
    HISTOGRAM_SCRIPT = """\
-- Atomic histogram observation
-- KEYS[1] = wf_metrics:histogram:{name}:{label_hash}:values  (sorted set)
-- KEYS[2] = wf_metrics:histogram:{name}:{label_hash}:meta    (hash)
-- ARGV[1] = observed value
-- ARGV[2] = member ID (timestamp:uuid for uniqueness)
-- ARGV[3] = TTL in seconds
-- ARGV[4] = max observations (cap)

local values_key = KEYS[1]
local meta_key = KEYS[2]
local value = tonumber(ARGV[1])
local member_id = ARGV[2]
local ttl = tonumber(ARGV[3])
local max_obs = tonumber(ARGV[4])

-- Add observation to sorted set (score = value for range queries)
redis.call('ZADD', values_key, value, member_id)

-- Update count and sum
redis.call('HINCRBY', meta_key, 'count', 1)
redis.call('HINCRBYFLOAT', meta_key, 'sum', value)

-- Cap observations by removing oldest entries (lowest member IDs)
local current_count = redis.call('ZCARD', values_key)
if current_count > max_obs then
    local excess = current_count - max_obs
    redis.call('ZREMRANGEBYRANK', values_key, 0, excess - 1)
end

-- Set TTL
redis.call('EXPIRE', values_key, ttl)
redis.call('EXPIRE', meta_key, ttl)

return redis.call('HGET', meta_key, 'count')
"""

    async def _record_histogram(
        self,
        redis: Redis,
        metric_name: str,
        label_hash: str,
        value: float,
        ttl: int,
    ) -> None:
        """Record histogram observation."""
        values_key = f"{self.KEY_PREFIX}:histogram:{metric_name}:{label_hash}:values"
        meta_key = f"{self.KEY_PREFIX}:histogram:{metric_name}:{label_hash}:meta"
        member_id = f"{time.time()}:{uuid.uuid4().hex[:8]}"

        await redis.eval(
            self.HISTOGRAM_SCRIPT,
            2,
            values_key,
            meta_key,
            str(value),
            member_id,
            str(ttl),
            str(self.MAX_HISTOGRAM_OBSERVATIONS),
        )
```

#### Summary (Lua script for capped observation list)

```python
    SUMMARY_SCRIPT = """\
-- Atomic summary observation
-- KEYS[1] = wf_metrics:summary:{name}:{label_hash}:values  (list)
-- KEYS[2] = wf_metrics:summary:{name}:{label_hash}:meta    (hash)
-- ARGV[1] = observed value
-- ARGV[2] = TTL in seconds
-- ARGV[3] = max observations (cap)

local values_key = KEYS[1]
local meta_key = KEYS[2]
local value = ARGV[1]
local ttl = tonumber(ARGV[2])
local max_obs = tonumber(ARGV[3])

-- Push observation to list
redis.call('LPUSH', values_key, value)

-- Update count and sum
redis.call('HINCRBY', meta_key, 'count', 1)
redis.call('HINCRBYFLOAT', meta_key, 'sum', tonumber(value))

-- Trim list to max observations
redis.call('LTRIM', values_key, 0, max_obs - 1)

-- Set TTL
redis.call('EXPIRE', values_key, ttl)
redis.call('EXPIRE', meta_key, ttl)

return redis.call('HGET', meta_key, 'count')
"""

    async def _record_summary(
        self,
        redis: Redis,
        metric_name: str,
        label_hash: str,
        value: float,
        ttl: int,
    ) -> None:
        """Record summary observation."""
        values_key = f"{self.KEY_PREFIX}:summary:{metric_name}:{label_hash}:values"
        meta_key = f"{self.KEY_PREFIX}:summary:{metric_name}:{label_hash}:meta"

        await redis.eval(
            self.SUMMARY_SCRIPT,
            2,
            values_key,
            meta_key,
            str(value),
            str(ttl),
            str(self.MAX_SUMMARY_OBSERVATIONS),
        )
```

### 1.8 Label and Metadata Storage

```python
    async def _check_label_cardinality(
        self,
        redis: Redis,
        metric_name: str,
        label_hash: str,
    ) -> None:
        """Check that the label cardinality for a metric is within limits.

        Raises:
            ValueError: If adding this label combination would exceed the limit.
        """
        index_key = f"{self.KEY_PREFIX}:label_index:{metric_name}"

        # Check if this label_hash already exists
        is_member = await redis.sismember(index_key, label_hash)
        if is_member:
            return  # Already tracked, no cardinality increase

        # Check current cardinality
        current_count = await redis.scard(index_key)
        if current_count >= self.MAX_LABEL_COMBOS_PER_METRIC:
            raise ValueError(
                f"Label cardinality limit reached for metric '{metric_name}'. "
                f"Maximum {self.MAX_LABEL_COMBOS_PER_METRIC} unique label "
                f"combinations allowed."
            )

    async def _store_label_mapping(
        self,
        redis: Redis,
        metric_name: str,
        label_hash: str,
        labels: dict[str, str],
        ttl: int,
    ) -> None:
        """Store label key-value mapping for Prometheus exposition."""
        label_key = f"{self.KEY_PREFIX}:labels:{metric_name}:{label_hash}"
        index_key = f"{self.KEY_PREFIX}:label_index:{metric_name}"

        pipe = redis.pipeline(transaction=True)
        pipe.hset(label_key, mapping=labels)
        pipe.expire(label_key, ttl)
        pipe.sadd(index_key, label_hash)
        pipe.expire(index_key, ttl)
        await pipe.execute()

    async def _store_metric_metadata(
        self,
        redis: Redis,
        metric_name: str,
        metric_type: str,
        unit: str,
        ttl: int,
    ) -> None:
        """Store metric metadata (type, unit) for Prometheus exposition."""
        meta_key = f"{self.KEY_PREFIX}:meta:{metric_name}"

        pipe = redis.pipeline(transaction=True)
        pipe.hset(
            meta_key,
            mapping={
                "type": metric_type,
                "unit": unit or "",
                "created_at": str(time.time()),
            },
        )
        pipe.expire(meta_key, ttl)
        await pipe.execute()
```

---

## Step 2: Node Registry Spec

**File**: `python-backend/app/orchestrator/node_registry.py`

Add the following registration block at the end of `_register_core_nodes()`, in a new section comment block:

```python
        # ===== Monitoring & Observability =====

        # Metrics Collector
        self.register_node_type(
            NodeTypeSpec(
                type="metrics_collector",
                display_name="Metrics Collector",
                description="Record workflow metrics (counters, gauges, histograms) to Redis with Prometheus-compatible format",
                icon="activity",
                color="emerald",
                category="monitoring",
                inputs=[
                    InputSpec(
                        name="metricType",
                        display_name="Metric Type",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="counter",
                        options=[
                            {"label": "Counter (increment only)", "value": "counter"},
                            {"label": "Gauge (current value)", "value": "gauge"},
                            {"label": "Histogram (value distribution)", "value": "histogram"},
                            {"label": "Summary (duration tracking)", "value": "summary"},
                        ],
                    ),
                    InputSpec(
                        name="metricName",
                        display_name="Metric Name",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=False,
                        placeholder="workflow_executions_total",
                        validation={
                            "pattern": r"^[a-zA-Z_:][a-zA-Z0-9_:]*$",
                            "max_length": 128,
                        },
                    ),
                    InputSpec(
                        name="value",
                        display_name="Value",
                        data_type="number",
                        ui_type="number",
                        required=True,
                        accepts_connection=True,
                        default=1,
                        placeholder="Metric value (e.g., 1 for counter increment)",
                    ),
                    InputSpec(
                        name="labels",
                        display_name="Labels",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        default={},
                        placeholder='{"status": "success", "environment": "production"}',
                    ),
                    InputSpec(
                        name="unit",
                        display_name="Unit",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        default="",
                        placeholder="ms, bytes, requests, etc.",
                    ),
                ],
                outputs=[
                    OutputSpec(
                        name="recorded",
                        display_name="Recorded",
                        data_type="boolean",
                    ),
                    OutputSpec(
                        name="metricName",
                        display_name="Metric Name",
                        data_type="text",
                    ),
                    OutputSpec(
                        name="timestamp",
                        display_name="Timestamp",
                        data_type="number",
                    ),
                ],
                executor="app.orchestrator.node_executors.output_executors.metrics_collector_executor.MetricsCollectorExecutor",
            )
        )
```

### Category Decision

The `metrics_collector` node is categorized as `monitoring` -- a new category. This is intentional because:

1. It is not an "output" in the sense of webhook_response or workflow_response (which produce external side effects for the caller).
2. It is not "data" (data nodes transform/shape data within the workflow).
3. Monitoring/observability is a distinct concern that will grow (future nodes: `log_entry`, `trace_span`, `alert_rule`).
4. The `monitoring` category gives it a dedicated section in the node palette with a clear semantic grouping.

The category union type in the frontend TypeScript must be updated to include `"monitoring"`.

---

## Step 3: Frontend Category Type Update

**File**: `apps/web/client/src/lib/workflow/useNodeRegistry.ts`

Update the `category` type in `NodeTypeSpec` interface (line 37):

```typescript
// Before:
category: "ai" | "flow_control" | "human" | "skills" | "media" | "triggers" | "inputs" | "outputs" | "data" | "integrations";

// After:
category: "ai" | "flow_control" | "human" | "skills" | "media" | "triggers" | "inputs" | "outputs" | "data" | "integrations" | "monitoring";
```

Also verify that `TemplateBrowser.tsx` or `WorkflowEditor.tsx` category mappings include the new `monitoring` category with appropriate display name, icon, and color. If these files use a static category map, add:

```typescript
monitoring: {
  label: "Monitoring",
  icon: "Activity",
  color: "emerald",
}
```

---

## Step 4: Update `__init__.py`

**File**: `python-backend/app/orchestrator/node_executors/output_executors/__init__.py`

```python
"""Output node executors."""
from app.orchestrator.node_executors.output_executors.metrics_collector_executor import (
    MetricsCollectorExecutor,
)

__all__ = ["MetricsCollectorExecutor"]
```

---

## Step 5: Tests

**File**: `python-backend/tests/test_metrics_collector_executor.py`

### 5.1 Test Cases

| # | Test Name | Category | Description |
|---|-----------|----------|-------------|
| 1 | `test_counter_increment` | Unit | Verify counter increments atomically in Redis |
| 2 | `test_counter_multiple_increments` | Unit | Verify multiple increments accumulate correctly |
| 3 | `test_counter_negative_value_rejected` | Unit | Verify ValueError for negative counter value |
| 4 | `test_gauge_set_value` | Unit | Verify gauge stores current value |
| 5 | `test_gauge_overwrite` | Unit | Verify gauge overwrites previous value |
| 6 | `test_histogram_observation` | Unit | Verify histogram adds observation to sorted set |
| 7 | `test_histogram_capped` | Unit | Verify histogram caps at MAX_HISTOGRAM_OBSERVATIONS |
| 8 | `test_summary_observation` | Unit | Verify summary adds to capped list |
| 9 | `test_summary_capped` | Unit | Verify summary list trimmed to MAX_SUMMARY_OBSERVATIONS |
| 10 | `test_invalid_metric_type` | Validation | Verify ValueError for unsupported metric type |
| 11 | `test_invalid_metric_name` | Validation | Verify ValueError for non-Prometheus name |
| 12 | `test_empty_metric_name` | Validation | Verify ValueError for empty name |
| 13 | `test_metric_name_too_long` | Validation | Verify ValueError for name > 128 chars |
| 14 | `test_invalid_label_key` | Validation | Verify ValueError for label key with special chars |
| 15 | `test_reserved_label_prefix` | Validation | Verify ValueError for `__` prefix labels |
| 16 | `test_too_many_labels` | Validation | Verify ValueError when > 10 labels |
| 17 | `test_label_cardinality_limit` | Integration | Verify error when > 50 unique label combos |
| 18 | `test_label_hash_deterministic` | Unit | Same labels produce same hash |
| 19 | `test_label_hash_empty` | Unit | Empty labels produce `__no_labels__` |
| 20 | `test_auto_inject_context_labels` | Unit | workflow_id and execution_id auto-added |
| 21 | `test_ttl_set_on_all_keys` | Integration | All Redis keys have correct TTL |
| 22 | `test_ttl_clamped` | Unit | TTL clamped between 60s and 7 days |
| 23 | `test_redis_connection_failure` | Error | Verify ConnectionError raised |
| 24 | `test_non_numeric_value_rejected` | Validation | Verify ValueError for string value |
| 25 | `test_output_structure` | Unit | Verify output dict has all required keys |

### 5.2 Test Structure

```python
"""Tests for MetricsCollectorExecutor."""
import pytest
import time
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.output_executors.metrics_collector_executor import (
    MetricsCollectorExecutor,
)


@pytest.fixture
def executor():
    return MetricsCollectorExecutor()


@pytest.fixture
def context():
    return ExecutionContext(
        user_id=1,
        tenant_id="tenant-abc",
        workflow_id="wf-123",
        execution_id="exec-456",
        credits_available=100,
    )


@pytest.fixture
def make_data():
    """Factory for creating NodeExecutionData."""
    def _make(
        metric_type="counter",
        metric_name="test_metric",
        value=1,
        labels=None,
        unit="",
    ):
        config = {
            "metricType": metric_type,
            "metricName": metric_name,
            "value": value,
            "labels": labels or {},
            "unit": unit,
        }
        return NodeExecutionData(
            node_id="node-1",
            node_type="metrics_collector",
            config=config,
            inputs=config,
            state={},
        )
    return _make


@pytest.fixture
def mock_redis():
    """Create a mock Redis client."""
    redis = AsyncMock()
    redis.ping = AsyncMock(return_value=True)
    redis.eval = AsyncMock(return_value="1")
    redis.sismember = AsyncMock(return_value=False)
    redis.scard = AsyncMock(return_value=0)
    redis.pipeline = MagicMock()
    pipe = AsyncMock()
    pipe.hset = MagicMock(return_value=pipe)
    pipe.expire = MagicMock(return_value=pipe)
    pipe.sadd = MagicMock(return_value=pipe)
    pipe.execute = AsyncMock(return_value=[True, True, True, True])
    redis.pipeline.return_value = pipe
    return redis


# ---- Counter Tests ----

@pytest.mark.asyncio
async def test_counter_increment(executor, context, make_data, mock_redis):
    executor._redis = mock_redis
    data = make_data(metric_type="counter", metric_name="test_counter", value=1)
    result = await executor.execute(data, context)
    assert result["recorded"] is True
    assert result["metricName"] == "test_counter"
    assert result["metricType"] == "counter"
    assert isinstance(result["timestamp"], float)
    mock_redis.eval.assert_called_once()


@pytest.mark.asyncio
async def test_counter_negative_value_rejected(executor, context, make_data, mock_redis):
    executor._redis = mock_redis
    data = make_data(metric_type="counter", value=-5)
    with pytest.raises(ValueError, match="must be >= 0"):
        await executor.execute(data, context)


# ---- Validation Tests ----

@pytest.mark.asyncio
async def test_invalid_metric_type(executor, context, make_data, mock_redis):
    executor._redis = mock_redis
    data = make_data(metric_type="invalid_type")
    with pytest.raises(ValueError, match="Invalid metricType"):
        await executor.execute(data, context)


@pytest.mark.asyncio
async def test_invalid_metric_name(executor, context, mock_redis):
    executor._redis = mock_redis
    data = NodeExecutionData(
        node_id="node-1",
        node_type="metrics_collector",
        config={"metricType": "counter", "metricName": "123-invalid!", "value": 1},
        inputs={"metricType": "counter", "metricName": "123-invalid!", "value": 1},
        state={},
    )
    with pytest.raises(ValueError, match="does not match Prometheus"):
        await executor.execute(data, context)


# ... additional tests following the same pattern
```

---

## Step 6: Prometheus Exposition Endpoint (Phase 2 Stub)

**File**: `python-backend/app/api/workflows.py`

Add a stub endpoint for future Prometheus scraping. This is NOT production-ready in Phase 1 but provides the skeleton:

```python
@router.get("/metrics")
async def get_workflow_metrics(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Get workflow metrics in JSON format.

    Phase 1: Returns metrics from Redis in JSON format.
    Phase 2: Will return Prometheus text exposition format.
    Phase 3: Will support StatsD exporter.
    """
    # Phase 1 stub - return available metric names
    return {
        "status": "stub",
        "phase": 1,
        "note": "Metrics are stored in Redis. Prometheus exporter coming in Phase 2.",
        "redis_key_prefix": "wf_metrics:",
    }
```

---

## Implementation Order

| Step | File | Description | Est. LOC |
|------|------|-------------|----------|
| 1 | `metrics_collector_executor.py` | Create executor with all 4 metric types + Lua scripts | ~350 |
| 2 | `node_registry.py` | Register `metrics_collector` node type spec | ~50 |
| 3 | `useNodeRegistry.ts` | Add `monitoring` to category union type | ~1 |
| 4 | `output_executors/__init__.py` | Export `MetricsCollectorExecutor` | ~5 |
| 5 | `test_metrics_collector_executor.py` | Write 25 tests | ~300 |
| 6 | `workflows.py` | Add `/metrics` stub endpoint | ~15 |
| **Total** | | | **~720** |

## Phase Roadmap

### Phase 1 (This Implementation) -- Production-Ready Redis Backend
- [x] Counter, gauge, histogram, summary metric types
- [x] Atomic Lua scripts for all operations
- [x] Label validation and cardinality limits
- [x] Prometheus-compatible metric naming
- [x] TTL on all keys (default 24h)
- [x] Observation capping (histogram: 10k, summary: 1k)
- [x] Auto-injected context labels (workflow_id, execution_id)
- [x] Fail-closed on Redis errors
- [x] Comprehensive test suite

### Phase 2 (Future) -- Prometheus Exporter
- [ ] `/metrics` endpoint returning Prometheus text exposition format
- [ ] Histogram bucket computation from sorted set
- [ ] Summary quantile computation (p50, p90, p99)
- [ ] HELP and TYPE metadata from `wf_metrics:meta:*`
- [ ] Optional Prometheus pushgateway integration

### Phase 3 (Future) -- StatsD Exporter
- [ ] StatsD client integration (aiodogstatsd)
- [ ] Metric type mapping (counter -> increment, gauge -> gauge, histogram -> timing)
- [ ] DataDog tag support
- [ ] Configurable StatsD host/port

### Phase 4 (Future) -- Advanced Features
- [ ] Metric aggregation across executions
- [ ] Dashboard API for metric visualization
- [ ] Alert rules based on metric thresholds
- [ ] Metric retention policies (beyond TTL)
- [ ] Multi-tenant metric isolation
