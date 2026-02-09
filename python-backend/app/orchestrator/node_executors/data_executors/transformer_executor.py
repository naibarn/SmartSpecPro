"""Transformer Executor - Convert data between formats.

Supported transformations:
  - json_to_csv: Convert JSON array to CSV string
  - csv_to_json: Parse CSV string to JSON array
  - json_to_xml: Convert JSON to XML string
  - xml_to_json: Parse XML string to JSON dict (XXE-safe via defusedxml)
  - flatten: Flatten nested JSON to dot-notation keys
  - unflatten: Rebuild nested JSON from dot-notation keys
"""

import csv
import io
import json
import logging
from typing import Any

import defusedxml.minidom
import xmltodict

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class TransformerExecutor:
    """Executor for data format transformation nodes."""

    MAX_INPUT_SIZE = 10 * 1024 * 1024  # 10 MB
    MAX_FLATTEN_DEPTH = 100  # Hard cap regardless of config

    VALID_TYPES = frozenset(
        {
            "json_to_csv",
            "csv_to_json",
            "json_to_xml",
            "xml_to_json",
            "flatten",
            "unflatten",
        }
    )

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute data transformation.

        Returns:
            dict with keys: output, outputType, recordCount
        """
        transformation_type = data.inputs.get("transformationType", "json_to_csv")
        raw_input = data.inputs.get("input")
        csv_delimiter = data.inputs.get("csvDelimiter", ",")
        csv_headers = data.inputs.get("csvHeaders", True)
        xml_root = data.inputs.get("xmlRootElement", "root")
        xml_attr_prefix = data.inputs.get("xmlAttrPrefix", "@")
        flatten_sep = data.inputs.get("flattenSeparator", ".")
        flatten_max_depth = min(
            int(data.inputs.get("flattenMaxDepth", 20)),
            self.MAX_FLATTEN_DEPTH,
        )

        if transformation_type not in self.VALID_TYPES:
            raise ValueError(
                f"Invalid transformation type: {transformation_type}. "
                f"Valid: {', '.join(sorted(self.VALID_TYPES))}"
            )

        if raw_input is None:
            raise ValueError("Input data is required")

        # Parse string input that looks like JSON
        input_data = self._resolve_input(raw_input)

        self._validate_input_size(input_data)

        # Dispatch to the appropriate transformation method
        dispatch = {
            "json_to_csv": lambda: self._json_to_csv(input_data, csv_delimiter, csv_headers),
            "csv_to_json": lambda: self._csv_to_json(input_data, csv_delimiter, csv_headers),
            "json_to_xml": lambda: self._json_to_xml(input_data, xml_root, xml_attr_prefix),
            "xml_to_json": lambda: self._xml_to_json(input_data, xml_attr_prefix),
            "flatten": lambda: self._flatten(input_data, flatten_sep, flatten_max_depth),
            "unflatten": lambda: self._unflatten(input_data, flatten_sep),
        }

        output, output_type, record_count = dispatch[transformation_type]()

        logger.info(
            "Transformer executed: type=%s, output_type=%s, record_count=%d",
            transformation_type,
            output_type,
            record_count,
        )

        return {
            "output": output,
            "outputType": output_type,
            "recordCount": record_count,
        }

    # ------------------------------------------------------------------
    # Input helpers
    # ------------------------------------------------------------------

    def _validate_input_size(self, input_data: Any) -> None:
        """Validate input data size does not exceed MAX_INPUT_SIZE."""
        if isinstance(input_data, str):
            size = len(input_data.encode("utf-8"))
        elif isinstance(input_data, (dict, list)):
            size = len(json.dumps(input_data, default=str).encode("utf-8"))
        else:
            size = 0

        if size > self.MAX_INPUT_SIZE:
            raise ValueError(
                f"Input data exceeds maximum size "
                f"({size / 1024 / 1024:.1f} MB, max {self.MAX_INPUT_SIZE / 1024 / 1024:.0f} MB)"
            )

    def _resolve_input(self, raw_input: Any) -> Any:
        """Attempt to parse string input as JSON if applicable.

        Returns the parsed structure or the original value.
        """
        if isinstance(raw_input, str):
            stripped = raw_input.strip()
            if stripped and stripped[0] in ("{", "["):
                try:
                    return json.loads(stripped)
                except (json.JSONDecodeError, ValueError):
                    pass
        return raw_input

    # ------------------------------------------------------------------
    # 1. json_to_csv
    # ------------------------------------------------------------------

    def _json_to_csv(
        self,
        data: Any,
        delimiter: str,
        include_headers: bool,
    ) -> tuple[str, str, int]:
        """Convert JSON array of objects to CSV string.

        Returns:
            (csv_string, "csv", record_count)
        """
        if isinstance(data, dict):
            data = [data]

        if not isinstance(data, list):
            raise ValueError(
                f"json_to_csv requires a JSON array (list) or object (dict), got {type(data).__name__}"
            )

        if len(data) == 0:
            if include_headers:
                return "", "csv", 0
            return "", "csv", 0

        # Validate all items are dicts
        for i, item in enumerate(data):
            if not isinstance(item, dict):
                raise ValueError(
                    f"json_to_csv requires all array items to be objects (dicts), "
                    f"but item at index {i} is {type(item).__name__}"
                )

        # Extract headers from union of all keys (preserves first-occurrence order)
        headers: list[str] = []
        seen: set[str] = set()
        for row in data:
            for key in row:
                if key not in seen:
                    headers.append(key)
                    seen.add(key)

        # Serialize nested values to JSON strings
        serialized_rows: list[dict[str, Any]] = []
        for row in data:
            serialized: dict[str, Any] = {}
            for key in headers:
                val = row.get(key)
                if isinstance(val, (dict, list)):
                    serialized[key] = json.dumps(val, default=str)
                elif val is None:
                    serialized[key] = ""
                else:
                    serialized[key] = val
            serialized_rows.append(serialized)

        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=headers,
            delimiter=delimiter,
            extrasaction="ignore",
            restval="",
        )
        if include_headers:
            writer.writeheader()
        writer.writerows(serialized_rows)

        return output.getvalue(), "csv", len(serialized_rows)

    # ------------------------------------------------------------------
    # 2. csv_to_json
    # ------------------------------------------------------------------

    def _csv_to_json(
        self,
        data: Any,
        delimiter: str,
        has_headers: bool,
    ) -> tuple[list[dict[str, Any]], str, int]:
        """Parse CSV string to JSON array of dicts.

        Returns:
            (list_of_dicts, "json", record_count)
        """
        if not isinstance(data, str):
            raise ValueError(f"csv_to_json requires a CSV string, got {type(data).__name__}")

        if not data.strip():
            return [], "json", 0

        reader_input = io.StringIO(data)

        if has_headers:
            reader = csv.DictReader(reader_input, delimiter=delimiter, restval=None)
            rows: list[dict[str, Any]] = []
            for row in reader:
                converted: dict[str, Any] = {}
                for key, val in row.items():
                    converted[key] = self._auto_convert_value(val)
                rows.append(converted)
            return rows, "json", len(rows)
        else:
            reader_plain = csv.reader(reader_input, delimiter=delimiter)
            rows_no_header: list[dict[str, Any]] = []
            for row_values in reader_plain:
                converted_row: dict[str, Any] = {}
                for idx, val in enumerate(row_values):
                    converted_row[str(idx)] = self._auto_convert_value(val)
                rows_no_header.append(converted_row)
            return rows_no_header, "json", len(rows_no_header)

    @staticmethod
    def _auto_convert_value(val: str | None) -> Any:
        """Auto-detect numeric values; empty cells become None."""
        if val is None or val == "":
            return None
        # Try int first
        try:
            return int(val)
        except (ValueError, TypeError):
            pass
        # Try float
        try:
            return float(val)
        except (ValueError, TypeError):
            pass
        return val

    # ------------------------------------------------------------------
    # 3. json_to_xml
    # ------------------------------------------------------------------

    def _json_to_xml(
        self,
        data: Any,
        root_element: str,
        attr_prefix: str,
    ) -> tuple[str, str, int]:
        """Convert JSON dict/list to XML string.

        Returns:
            (xml_string, "xml", record_count)
        """
        if not isinstance(data, (dict, list)):
            raise ValueError(
                f"json_to_xml requires a JSON object or array, got {type(data).__name__}"
            )

        if isinstance(data, list):
            wrapped = {root_element: {"item": data}}
            record_count = len(data)
        else:
            wrapped = {root_element: data}
            record_count = len(data) if data else 0

        xml_string = xmltodict.unparse(wrapped, pretty=True, attr_prefix=attr_prefix)
        return xml_string, "xml", record_count

    # ------------------------------------------------------------------
    # 4. xml_to_json (XXE-safe)
    # ------------------------------------------------------------------

    def _xml_to_json(
        self,
        data: Any,
        attr_prefix: str,
    ) -> tuple[dict[str, Any], str, int]:
        """Parse XML string to JSON dict. Uses defusedxml for XXE protection.

        Returns:
            (parsed_dict, "json", record_count)
        """
        if not isinstance(data, str):
            raise ValueError(f"xml_to_json requires an XML string, got {type(data).__name__}")

        xml_string = data.strip()
        if not xml_string:
            raise ValueError("xml_to_json received an empty XML string")

        # Step 1: Validate XML safety with defusedxml (rejects XXE, entity expansion, etc.)
        try:
            defusedxml.minidom.parseString(xml_string)
        except Exception as exc:
            raise ValueError(f"Failed to parse XML: {exc}") from exc

        # Step 2: Parse with xmltodict (safe because defusedxml already validated)
        try:
            parsed = xmltodict.parse(xml_string, attr_prefix=attr_prefix)
        except Exception as exc:
            raise ValueError(f"Failed to parse XML: {exc}") from exc

        if not isinstance(parsed, dict):
            parsed = {"root": parsed}

        # Count top-level children for record_count
        first_key = next(iter(parsed), None)
        if first_key and isinstance(parsed[first_key], dict):
            record_count = len(parsed[first_key])
        elif first_key and isinstance(parsed[first_key], list):
            record_count = len(parsed[first_key])
        else:
            record_count = 1

        return parsed, "json", record_count

    # ------------------------------------------------------------------
    # 5. flatten
    # ------------------------------------------------------------------

    def _flatten(
        self,
        data: Any,
        separator: str,
        max_depth: int,
    ) -> tuple[dict[str, Any], str, int]:
        """Flatten nested dict to dot-notation keys.

        Returns:
            (flat_dict, "json", key_count)
        """
        if not isinstance(data, dict):
            raise ValueError(f"flatten requires a JSON object (dict), got {type(data).__name__}")

        result: dict[str, Any] = {}
        self._flatten_recursive(data, "", separator, max_depth, 0, result)
        return result, "json", len(result)

    def _flatten_recursive(
        self,
        obj: Any,
        prefix: str,
        separator: str,
        max_depth: int,
        current_depth: int,
        result: dict[str, Any],
    ) -> None:
        """Recursively flatten a nested structure."""
        if current_depth >= max_depth:
            # Beyond max depth, store remaining structure as-is
            result[prefix] = obj
            return

        if isinstance(obj, dict):
            if not obj:
                # Empty dict: preserve key with empty dict value if it has a prefix
                if prefix:
                    result[prefix] = obj
                return
            for key, value in obj.items():
                new_key = f"{prefix}{separator}{key}" if prefix else key
                if isinstance(value, (dict, list)):
                    self._flatten_recursive(
                        value, new_key, separator, max_depth, current_depth + 1, result
                    )
                else:
                    result[new_key] = value
        elif isinstance(obj, list):
            if not obj:
                if prefix:
                    result[prefix] = obj
                return
            for idx, value in enumerate(obj):
                new_key = f"{prefix}{separator}{idx}" if prefix else str(idx)
                if isinstance(value, (dict, list)):
                    self._flatten_recursive(
                        value, new_key, separator, max_depth, current_depth + 1, result
                    )
                else:
                    result[new_key] = value
        else:
            result[prefix] = obj

    # ------------------------------------------------------------------
    # 6. unflatten
    # ------------------------------------------------------------------

    def _unflatten(
        self,
        data: Any,
        separator: str,
    ) -> tuple[dict[str, Any], str, int]:
        """Rebuild nested dict from dot-notation keys.

        Returns:
            (nested_dict, "json", top_level_key_count)
        """
        if not isinstance(data, dict):
            raise ValueError(
                f"unflatten requires a flat JSON object (dict), got {type(data).__name__}"
            )

        if not data:
            return {}, "json", 0

        result: dict[str, Any] = {}

        for compound_key, value in data.items():
            parts = compound_key.split(separator)

            # Validate no empty segments
            for part in parts:
                if part == "":
                    raise ValueError(
                        f"Invalid key path: contains empty segment in '{compound_key}'"
                    )

            self._set_nested(result, parts, value)

        # Post-process: convert dict-with-sequential-int-keys to lists
        result = self._dicts_to_lists(result)

        return result, "json", len(result)

    @staticmethod
    def _set_nested(obj: dict[str, Any], parts: list[str], value: Any) -> None:
        """Set a value in a nested dict using a list of key parts.

        Intermediate levels are created as dicts. Numeric keys are kept as
        string keys at this stage; the later ``_dicts_to_lists`` pass converts
        qualifying dicts to lists.
        """
        for i, part in enumerate(parts[:-1]):
            if part not in obj or not isinstance(obj[part], dict):
                obj[part] = {}
            obj = obj[part]
        obj[parts[-1]] = value

    def _dicts_to_lists(self, obj: Any) -> Any:
        """Recursively convert dicts whose keys are sequential 0-based ints to lists."""
        if isinstance(obj, dict):
            # First, recurse into children
            converted: dict[str, Any] = {}
            for k, v in obj.items():
                converted[k] = self._dicts_to_lists(v)

            # Check if all keys are sequential integers starting from 0
            if converted and all(self._is_non_negative_int(k) for k in converted):
                int_keys = sorted(int(k) for k in converted)
                expected = list(range(len(int_keys)))
                if int_keys == expected:
                    return [converted[str(i)] for i in expected]

            return converted

        if isinstance(obj, list):
            return [self._dicts_to_lists(item) for item in obj]

        return obj

    @staticmethod
    def _is_non_negative_int(s: str) -> bool:
        """Check if a string represents a non-negative integer."""
        try:
            return int(s) >= 0
        except (ValueError, TypeError):
            return False
