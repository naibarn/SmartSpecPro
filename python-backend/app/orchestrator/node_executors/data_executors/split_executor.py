"""Split Executor - Split strings by delimiter/regex or arrays into chunks.

Supports three split modes:
  - string_split: Split a string by a delimiter character/substring
  - array_chunk: Split an array into fixed-size chunks
  - regex_split: Split a string by a regular expression pattern

Performance characteristics:
  - Hard cap at MAX_OUTPUT_SIZE items to prevent resource exhaustion
  - SIGALRM timeout for regex mode to prevent ReDoS
  - All modes are O(n) where n is input length
"""

import re
import signal
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class _RegexTimeoutException(Exception):
    """Raised when regex execution exceeds timeout."""

    pass


def _regex_timeout_handler(signum, frame):
    """Signal handler for regex execution timeout."""
    raise _RegexTimeoutException("Regex execution timed out")


class SplitExecutor:
    """Executor for split (string/array splitting) nodes.

    Splits data using one of three modes:
      - string_split: Split string by delimiter with optional whitespace trimming
      - array_chunk: Split array into fixed-size sub-arrays (chunks)
      - regex_split: Split string by regex pattern with timeout protection

    Performance characteristics:
      - Hard cap at MAX_OUTPUT_SIZE items to prevent resource exhaustion
      - SIGALRM timeout for regex mode to prevent ReDoS
      - All modes are O(n) where n is input length
    """

    # Maximum number of items in output array
    MAX_OUTPUT_SIZE = 10_000

    # Maximum input string length (bytes)
    MAX_INPUT_LENGTH = 1_000_000  # 1 MB

    # Maximum input array length for array_chunk mode
    MAX_ARRAY_SIZE = 10_000

    # Regex execution timeout (seconds)
    REGEX_TIMEOUT = 5

    # Maximum regex pattern length
    MAX_PATTERN_LENGTH = 500

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute split operation on input data.

        Args:
            data: Node execution data containing inputs with input value,
                  splitMode, and mode-specific configuration.
            context: Execution context with user/workflow metadata.

        Returns:
            Dictionary with split results:
              - parts: List of split parts
              - partCount: Number of parts produced

        Raises:
            ValueError: If input type is wrong for the selected mode,
                       configuration is invalid, or output exceeds limits.
        """
        split_mode = str(data.inputs.get("splitMode", "string_split"))
        input_value = data.inputs.get("input")
        max_splits = data.inputs.get("maxSplits", 0)
        parts: list[Any]

        # Validate maxSplits
        if max_splits is not None and not isinstance(max_splits, (int, float)):
            try:
                max_splits = int(max_splits)
            except (TypeError, ValueError):
                max_splits = 0

        if isinstance(max_splits, float):
            max_splits = int(max_splits)

        # 0 or negative means unlimited
        if max_splits is None or max_splits <= 0:
            max_splits = 0

        # Handle empty/None input
        if input_value is None or input_value == "":
            logger.info(
                "split_empty_input",
                node_id=data.node_id,
                split_mode=split_mode,
            )
            return {
                "parts": [],
                "partCount": 0,
            }

        # Dispatch to split mode
        if split_mode == "string_split":
            parts = self._split_string(input_value, data.inputs, max_splits)
        elif split_mode == "array_chunk":
            parts = self._split_array_chunk(input_value, data.inputs)
        elif split_mode == "regex_split":
            parts = self._split_regex(input_value, data.inputs, max_splits)
        else:
            raise ValueError(f"Invalid splitMode: {split_mode}")

        # Enforce output size limit
        if len(parts) > self.MAX_OUTPUT_SIZE:
            raise ValueError(
                f"Split produced too many parts ({len(parts)}, max {self.MAX_OUTPUT_SIZE}). "
                f"Use maxSplits to limit the number of splits."
            )

        logger.info(
            "split_executed",
            node_id=data.node_id,
            split_mode=split_mode,
            part_count=len(parts),
            max_splits=max_splits if max_splits > 0 else "unlimited",
        )

        return {
            "parts": parts,
            "partCount": len(parts),
        }

    def _split_string(
        self,
        input_value: Any,
        inputs: dict[str, Any],
        max_splits: int,
    ) -> list[str]:
        """Split a string by a delimiter.

        Args:
            input_value: The string to split (coerced to str if not already).
            inputs: Node inputs containing delimiter and trimWhitespace settings.
            max_splits: Maximum number of splits (0 = unlimited).

        Returns:
            List of string parts.

        Raises:
            ValueError: If input exceeds MAX_INPUT_LENGTH or delimiter is empty.
        """
        # Coerce to string
        if not isinstance(input_value, str):
            input_value = str(input_value)

        # Validate input length
        if len(input_value) > self.MAX_INPUT_LENGTH:
            raise ValueError(
                f"Input string too long ({len(input_value)} chars, "
                f"max {self.MAX_INPUT_LENGTH})"
            )

        delimiter = inputs.get("delimiter", ",")
        trim_whitespace = inputs.get("trimWhitespace", True)

        # Empty delimiter: reject with clear guidance
        if delimiter == "":
            raise ValueError(
                "Delimiter cannot be empty. Use regex_split for character-level splitting."
            )

        # Perform the split
        if max_splits > 0:
            parts = input_value.split(delimiter, max_splits)
        else:
            parts = input_value.split(delimiter)

        # Optional whitespace trimming
        if trim_whitespace:
            parts = [part.strip() for part in parts]

        # Remove empty strings that result from leading/trailing/consecutive delimiters
        # Only when trimming is enabled, to avoid data loss
        if trim_whitespace:
            parts = [part for part in parts if part != ""]

        return parts

    def _split_array_chunk(
        self,
        input_value: Any,
        inputs: dict[str, Any],
    ) -> list[list[Any]]:
        """Split an array into fixed-size chunks.

        Args:
            input_value: The array to chunk.
            inputs: Node inputs containing chunkSize.

        Returns:
            List of sub-arrays (chunks).

        Raises:
            ValueError: If input is not a list, exceeds MAX_ARRAY_SIZE,
                       or chunkSize is invalid.
        """
        if not isinstance(input_value, list):
            raise ValueError(
                f"array_chunk mode requires an array input, got {type(input_value).__name__}"
            )

        if len(input_value) > self.MAX_ARRAY_SIZE:
            raise ValueError(
                f"Input array too large ({len(input_value)} items, max {self.MAX_ARRAY_SIZE})"
            )

        chunk_size = inputs.get("chunkSize", 1)

        # Validate chunkSize
        if not isinstance(chunk_size, (int, float)):
            try:
                chunk_size = int(chunk_size)
            except (TypeError, ValueError):
                raise ValueError(f"chunkSize must be a positive integer, got {chunk_size!r}")

        if isinstance(chunk_size, float):
            chunk_size = int(chunk_size)

        if chunk_size < 1:
            raise ValueError(f"chunkSize must be >= 1, got {chunk_size}")

        # Handle empty array
        if len(input_value) == 0:
            return []

        # Chunk size >= array length -> return single chunk containing entire array
        if chunk_size >= len(input_value):
            return [input_value[:]]  # Shallow copy of the entire array

        # Build chunks
        chunks: list[list[Any]] = []
        for i in range(0, len(input_value), chunk_size):
            chunks.append(input_value[i : i + chunk_size])

        return chunks

    def _split_regex(
        self,
        input_value: Any,
        inputs: dict[str, Any],
        max_splits: int,
    ) -> list[str]:
        """Split a string by a regular expression pattern.

        Args:
            input_value: The string to split (coerced to str if not already).
            inputs: Node inputs containing pattern and trimWhitespace settings.
            max_splits: Maximum number of splits (0 = unlimited).

        Returns:
            List of string parts.

        Raises:
            ValueError: If input exceeds MAX_INPUT_LENGTH, pattern is empty,
                       pattern is too long, pattern is invalid regex, or
                       regex execution times out.
        """
        # Coerce to string
        if not isinstance(input_value, str):
            input_value = str(input_value)

        # Validate input length
        if len(input_value) > self.MAX_INPUT_LENGTH:
            raise ValueError(
                f"Input string too long ({len(input_value)} chars, "
                f"max {self.MAX_INPUT_LENGTH})"
            )

        pattern = inputs.get("pattern", "")
        trim_whitespace = inputs.get("trimWhitespace", True)

        if not pattern:
            raise ValueError("Regex pattern is required for regex_split mode")

        if len(pattern) > self.MAX_PATTERN_LENGTH:
            raise ValueError(
                f"Regex pattern too long ({len(pattern)} chars, max {self.MAX_PATTERN_LENGTH})"
            )

        # Compile the regex (validates syntax)
        try:
            compiled = re.compile(pattern)
        except re.error as e:
            raise ValueError(f"Invalid regex pattern '{pattern}': {e}") from None

        # Execute with timeout protection against ReDoS
        old_handler = signal.getsignal(signal.SIGALRM)
        signal.signal(signal.SIGALRM, _regex_timeout_handler)
        signal.alarm(self.REGEX_TIMEOUT)

        try:
            if max_splits > 0:
                parts = compiled.split(input_value, maxsplit=max_splits)
            else:
                parts = compiled.split(input_value)
        except _RegexTimeoutException:
            raise ValueError(
                f"Regex split timed out after {self.REGEX_TIMEOUT}s. "
                f"The pattern '{pattern}' may be vulnerable to catastrophic backtracking. "
                f"Simplify the pattern or use string_split mode instead."
            ) from None
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)

        # Optional whitespace trimming
        if trim_whitespace:
            parts = [part.strip() for part in parts]
            parts = [part for part in parts if part != ""]

        return parts
