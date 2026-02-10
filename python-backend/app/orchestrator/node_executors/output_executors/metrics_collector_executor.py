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

    # ------------------------------------------------------------------ #
    # Lua scripts (one per metric type for atomic operations)
    # ------------------------------------------------------------------ #

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

    # ------------------------------------------------------------------ #
    # Constructor and Redis connection
    # ------------------------------------------------------------------ #

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

    # ------------------------------------------------------------------ #
    # Label hashing
    # ------------------------------------------------------------------ #

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

    # ------------------------------------------------------------------ #
    # Input validation
    # ------------------------------------------------------------------ #

    def _validate_metric_name(self, name: str) -> None:
        """Validate metric name follows Prometheus conventions.

        Raises:
            ValueError: If name is invalid.
        """
        if not name:
            raise ValueError("metricName is required")
        if len(name) > self.METRIC_NAME_MAX_LENGTH:
            raise ValueError(f"metricName exceeds max length ({self.METRIC_NAME_MAX_LENGTH})")
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
                raise ValueError(f"Label key '{key_str}' uses reserved prefix '__'")
            value_str = str(value)
            if len(value_str) > self.LABEL_VALUE_MAX_LENGTH:
                raise ValueError(
                    f"Label value for '{key_str}' exceeds max length "
                    f"({self.LABEL_VALUE_MAX_LENGTH})"
                )
            sanitized[key_str] = value_str

        return sanitized

    # ------------------------------------------------------------------ #
    # Main execute
    # ------------------------------------------------------------------ #

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
            raise ValueError(f"Counter metric value must be >= 0, got: {value}")

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
            await self._store_metric_metadata(redis, metric_name, metric_type, unit, ttl)
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

    # ------------------------------------------------------------------ #
    # Metric type handlers
    # ------------------------------------------------------------------ #

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

    # ------------------------------------------------------------------ #
    # Label cardinality and metadata storage
    # ------------------------------------------------------------------ #

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
