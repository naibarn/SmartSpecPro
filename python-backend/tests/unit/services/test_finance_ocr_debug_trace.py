from __future__ import annotations

import json
from pathlib import Path

from app.services.finance_ocr_debug_trace import write_finance_ocr_debug_event


def test_write_finance_ocr_debug_event_writes_jsonl_file(tmp_path, monkeypatch):
    monkeypatch.setenv("FINANCE_OCR_DEBUG_TRACE", "true")
    monkeypatch.setenv("FINANCE_OCR_DEBUG_TRACE_DIR", str(tmp_path))

    file_path = write_finance_ocr_debug_event(
        "finance_ocr.extract_text.start",
        {
            "trace_id": "trace-123",
            "mime_type": "image/jpeg",
            "content_bytes": 12345,
            "nested": {"count": 1},
        },
    )

    assert file_path is not None
    path = Path(file_path)
    assert path.exists()

    lines = path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["event"] == "finance_ocr.extract_text.start"
    assert record["payload"]["trace_id"] == "trace-123"
    assert record["payload"]["mime_type"] == "image/jpeg"
    assert record["payload"]["content_bytes"] == 12345
