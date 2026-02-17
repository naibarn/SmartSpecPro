"""CSV Parser Executor - Parse CSV files with intelligent defaults."""

import csv
import io
import logging
from typing import Any, List

import aiofiles

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class CSVParserExecutor:
    """
    Parse CSV files with intelligent defaults.

    Features:
    - Auto-detect delimiter
    - Header row detection
    - Type inference
    - Skip rows
    - Row limits
    """

    MAX_ROWS = 100000
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Parse CSV with auto-detection and validation."""
        csv_input = data.inputs.get("csv_input")
        delimiter = data.inputs.get("delimiter")
        has_header = data.inputs.get("has_header", True)
        skip_rows = data.inputs.get("skip_rows", 0)
        max_rows = min(data.inputs.get("max_rows", self.MAX_ROWS), self.MAX_ROWS)
        encoding = data.inputs.get("encoding", "utf-8")

        # Load CSV content
        if csv_input.startswith("/") or csv_input.startswith("./"):
            # It's a file path
            async with aiofiles.open(csv_input, "r", encoding=encoding) as f:
                content = await f.read()
                if len(content.encode()) > self.MAX_FILE_SIZE:
                    raise ValueError(f"File too large: exceeds {self.MAX_FILE_SIZE} bytes")
        else:
            # It's CSV content directly
            content = csv_input
            if len(content.encode()) > self.MAX_FILE_SIZE:
                raise ValueError(f"Content too large: exceeds {self.MAX_FILE_SIZE} bytes")

        # Auto-detect delimiter if not specified
        if not delimiter:
            delimiter = self._detect_delimiter(content)

        # Parse CSV
        rows = []
        reader = csv.DictReader(
            io.StringIO(content),
            delimiter=delimiter,
            fieldnames=None if has_header else self._generate_fieldnames(content, delimiter),
        )

        # Skip initial rows
        for _ in range(skip_rows):
            try:
                next(reader)
            except StopIteration:
                break

        # Read up to max_rows
        for i, row in enumerate(reader):
            if i >= max_rows:
                break

            # Type inference
            typed_row = {k: self._infer_type(v) for k, v in row.items()}
            rows.append(typed_row)

        return {
            "rows": rows,
            "row_count": len(rows),
            "columns": list(rows[0].keys()) if rows else [],
            "delimiter": delimiter,
        }

    def _detect_delimiter(self, content: str) -> str:
        """Auto-detect CSV delimiter."""
        delimiters = [",", ";", "\t", "|"]
        first_line = content.split("\n")[0] if content else ""

        counts = {d: first_line.count(d) for d in delimiters}
        best = max(counts, key=counts.get)
        return best if counts[best] > 0 else ","

    def _generate_fieldnames(self, content: str, delimiter: str) -> List[str]:
        """Generate column names for headerless CSV."""
        first_line = content.split("\n")[0] if content else ""
        col_count = len(first_line.split(delimiter))
        return [f"column_{i+1}" for i in range(col_count)]

    def _infer_type(self, value: str) -> Any:
        """Infer data type from string value."""
        if value == "":
            return None

        # Try int
        try:
            return int(value)
        except ValueError:
            pass

        # Try float
        try:
            return float(value)
        except ValueError:
            pass

        # Try bool
        if value.lower() in ("true", "yes", "1"):
            return True
        if value.lower() in ("false", "no", "0"):
            return False

        # Return as string
        return value
