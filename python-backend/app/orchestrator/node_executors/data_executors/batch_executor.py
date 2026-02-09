"""Batch Executor - Split arrays into batches by size, time window, or field value.

Supports three batch modes:
  - size_based: Fixed-size chunking with optional remainder exclusion
  - time_based: Group items into time windows based on timestamp field
  - field_based: Group items by the value of a specified field
"""
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

# Hard limits
MAX_ARRAY_SIZE = 10_000
MIN_BATCH_SIZE = 1
MAX_BATCH_SIZE = 5_000
MIN_TIME_WINDOW = 0.001
MAX_TIME_WINDOW = 86_400  # 24 hours
MAX_GROUP_KEYS = 1_000

VALID_BATCH_MODES = {"size_based", "time_based", "field_based"}


class BatchExecutor:
    """Executor for batch processor nodes.

    Splits an input array into batches (array of arrays) using one of three
    strategies: fixed-size chunking, time-window grouping, or field-value
    grouping. Downstream nodes can iterate over the batches uniformly
    regardless of the mode used.

    Performance characteristics:
      - size_based: O(n) time, O(n) space
      - time_based: O(n log n) time due to sorting, O(n) space
      - field_based: O(n) time, O(n) space
      - Hard cap at MAX_ARRAY_SIZE (10,000) items
      - MAX_GROUP_KEYS (1,000) distinct groups for field_based mode
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute batch operation on an input array.

        Args:
            data: Node execution data containing inputs with inputArray,
                  batchMode, and mode-specific configuration.
            context: Execution context with user/workflow metadata.

        Returns:
            Dictionary with batched output:
              - batches: list[list] of item batches
              - batchCount: number of batches produced
              - itemCount: total items across all batches

        Raises:
            ValueError: If inputArray is not a list, exceeds MAX_ARRAY_SIZE,
                       batchMode is invalid, or mode-specific validation fails.
        """
        input_array = data.inputs.get("inputArray")
        batch_mode = data.inputs.get("batchMode", "size_based")
        batch_size = data.inputs.get("batchSize", 10)
        time_window = data.inputs.get("timeWindow", 60)
        group_by_field = data.inputs.get("groupByField", "")
        include_remainder = data.inputs.get("includeRemainder", True)

        # --- Validation ---

        if not isinstance(input_array, list):
            type_name = type(input_array).__name__ if input_array is not None else "NoneType"
            raise ValueError(f"inputArray must be an array, got {type_name}")

        if len(input_array) > MAX_ARRAY_SIZE:
            raise ValueError(
                f"Array too large ({len(input_array)} items, max {MAX_ARRAY_SIZE})"
            )

        if batch_mode not in VALID_BATCH_MODES:
            raise ValueError(
                f"Invalid batchMode: '{batch_mode}'. Must be one of: {', '.join(sorted(VALID_BATCH_MODES))}"
            )

        # Mode-specific validation
        if batch_mode == "size_based":
            if not isinstance(batch_size, int):
                try:
                    batch_size = int(batch_size)
                except (TypeError, ValueError):
                    raise ValueError(f"batchSize must be an integer, got {type(batch_size).__name__}")
            if batch_size < MIN_BATCH_SIZE or batch_size > MAX_BATCH_SIZE:
                raise ValueError(
                    f"batchSize must be between {MIN_BATCH_SIZE} and {MAX_BATCH_SIZE}, got {batch_size}"
                )

        elif batch_mode == "time_based":
            if not isinstance(time_window, (int, float)):
                try:
                    time_window = float(time_window)
                except (TypeError, ValueError):
                    raise ValueError(
                        f"timeWindow must be a number, got {type(time_window).__name__}"
                    )
            if time_window < MIN_TIME_WINDOW or time_window > MAX_TIME_WINDOW:
                raise ValueError(
                    f"timeWindow must be between {MIN_TIME_WINDOW} and {MAX_TIME_WINDOW}, got {time_window}"
                )

        elif batch_mode == "field_based":
            if not group_by_field or not isinstance(group_by_field, str) or not group_by_field.strip():
                raise ValueError("groupByField is required and must be a non-empty string for field_based mode")
            group_by_field = group_by_field.strip()

        # --- Empty array fast path ---

        if len(input_array) == 0:
            return {
                "batches": [],
                "batchCount": 0,
                "itemCount": 0,
            }

        # --- Mode dispatch ---

        if batch_mode == "size_based":
            batches = self._batch_by_size(input_array, batch_size, include_remainder)
        elif batch_mode == "time_based":
            batches = self._batch_by_time(input_array, time_window, include_remainder)
        elif batch_mode == "field_based":
            batches = self._batch_by_field(input_array, group_by_field)

        # --- Return ---

        item_count = sum(len(b) for b in batches)

        return {
            "batches": batches,
            "batchCount": len(batches),
            "itemCount": item_count,
        }

    # -------------------------------------------------------------------------
    # Mode 1: Size-Based Batching
    # -------------------------------------------------------------------------

    def _batch_by_size(
        self,
        items: list[Any],
        batch_size: int,
        include_remainder: bool,
    ) -> list[list[Any]]:
        """Split items into fixed-size chunks.

        Args:
            items: Array of items to batch.
            batch_size: Number of items per batch.
            include_remainder: Whether to include a partial last batch.

        Returns:
            List of lists, each containing up to batch_size items.
        """
        batches = [items[i : i + batch_size] for i in range(0, len(items), batch_size)]

        # If remainder exclusion requested and last batch is partial
        if not include_remainder and batches and len(batches[-1]) < batch_size:
            batches.pop()

        return batches

    # -------------------------------------------------------------------------
    # Mode 2: Time-Based Batching
    # -------------------------------------------------------------------------

    def _batch_by_time(
        self,
        items: list[Any],
        time_window: float,
        include_remainder: bool,
    ) -> list[list[Any]]:
        """Group items into time windows based on their timestamp field.

        Items are sorted by timestamp, then grouped into consecutive windows
        of the specified duration. This is a simulated batching for historical
        timestamped data, not real-time streaming.

        Args:
            items: Array of items with a 'timestamp' field.
            time_window: Window duration in seconds.
            include_remainder: Whether to include a partial last window.

        Returns:
            List of lists, each containing items within a time window.

        Raises:
            ValueError: If any item is missing a 'timestamp' field or
                       the timestamp cannot be parsed.
        """
        # Extract and pair timestamps with items
        timed_pairs: list[tuple[float, Any]] = []
        for idx, item in enumerate(items):
            ts = self._extract_timestamp(item, idx)
            timed_pairs.append((ts, item))

        # Sort by timestamp (stable sort preserves insertion order for equal timestamps)
        timed_pairs.sort(key=lambda pair: pair[0])

        # Group into windows
        batches: list[list[Any]] = []
        current_batch: list[Any] = []
        window_start: float | None = None

        for ts, item in timed_pairs:
            if window_start is None:
                window_start = ts
                current_batch = [item]
            elif ts - window_start >= time_window:
                # Current item starts a new window
                batches.append(current_batch)
                window_start = ts
                current_batch = [item]
            else:
                current_batch.append(item)

        # Handle the last batch
        if current_batch:
            if not include_remainder and len(batches) > 0:
                # Check if the last batch's time span is less than time_window
                # A partial window is one where the span from its start to the
                # end of the overall data is less than time_window
                last_ts = timed_pairs[-1][0]
                if window_start is not None and (last_ts - window_start) < time_window:
                    # Drop the partial last batch
                    pass
                else:
                    batches.append(current_batch)
            else:
                batches.append(current_batch)

        return batches

    def _extract_timestamp(self, item: Any, index: int) -> float:
        """Extract a Unix timestamp (float) from an item.

        Supports:
          - Dict items with a 'timestamp' key containing:
            - int/float: treated as Unix epoch seconds
            - str: parsed as ISO 8601 datetime

        Args:
            item: The item to extract a timestamp from.
            index: The item's position in the array (for error messages).

        Returns:
            Unix timestamp as float.

        Raises:
            ValueError: If item is not a dict, lacks 'timestamp', or
                       the timestamp value cannot be parsed.
        """
        if not isinstance(item, dict):
            raise ValueError(
                f"Item at index {index} must be a dict with a 'timestamp' field, "
                f"got {type(item).__name__}"
            )

        if "timestamp" not in item:
            raise ValueError(f"Item at index {index} missing 'timestamp' field")

        ts_value = item["timestamp"]

        if isinstance(ts_value, (int, float)):
            return float(ts_value)

        if isinstance(ts_value, str):
            try:
                # Handle 'Z' suffix (replace with +00:00 for fromisoformat)
                ts_str = ts_value
                if ts_str.endswith("Z"):
                    ts_str = ts_str[:-1] + "+00:00"
                dt = datetime.fromisoformat(ts_str)
                # If naive datetime, assume UTC
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.timestamp()
            except (ValueError, TypeError) as e:
                raise ValueError(
                    f"Item at index {index} has unparseable timestamp: '{ts_value}' ({e})"
                ) from None

        raise ValueError(
            f"Item at index {index} has unsupported timestamp type: {type(ts_value).__name__}"
        )

    # -------------------------------------------------------------------------
    # Mode 3: Field-Based Batching
    # -------------------------------------------------------------------------

    def _batch_by_field(
        self,
        items: list[Any],
        group_by_field: str,
    ) -> list[list[Any]]:
        """Group items by the value of a specified field.

        Uses insertion-order-preserving dict (Python 3.7+) to maintain
        the order in which groups are first encountered.

        Args:
            items: Array of items to group.
            group_by_field: Dot-notation path to the grouping field.

        Returns:
            List of lists, each containing items sharing the same
            group key value.

        Raises:
            ValueError: If the number of distinct group keys exceeds
                       MAX_GROUP_KEYS.
        """
        groups: dict[str, list[Any]] = {}

        for item in items:
            field_value = self._get_nested_value(item, group_by_field)

            # Convert field value to string key; use sentinel for None
            if field_value is None:
                key = "__null__"
            else:
                key = str(field_value)

            if key not in groups:
                if len(groups) >= MAX_GROUP_KEYS:
                    raise ValueError(
                        f"Too many distinct group keys ({len(groups)}+). "
                        f"Maximum allowed is {MAX_GROUP_KEYS}. "
                        f"Consider using a less granular field."
                    )
                groups[key] = []

            groups[key].append(item)

        return list(groups.values())

    # -------------------------------------------------------------------------
    # Shared Helpers
    # -------------------------------------------------------------------------

    def _get_nested_value(self, obj: Any, path: str) -> Any:
        """Extract a value from a nested object using dot-separated path.

        Supports:
          - Dict key access: "user.name"
          - Nested dicts: "user.profile.age"
          - List indexing: "items.0.name"

        Args:
            obj: The object to extract a value from.
            path: Dot-separated field path.

        Returns:
            The extracted value, or None if path is invalid or value not found.
        """
        parts = path.split(".")
        current = obj

        for part in parts:
            if current is None:
                return None

            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, (list, tuple)):
                try:
                    index = int(part)
                    current = current[index]
                except (ValueError, IndexError):
                    return None
            else:
                try:
                    current = getattr(current, part, None)
                except Exception:
                    return None

        return current
