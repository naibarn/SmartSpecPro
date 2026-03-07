"""Sample skill: Math Tutor (improvable by ISC)."""
from __future__ import annotations

import json
import re
from typing import Any


def respond(input: Any, context=None) -> str:
    text = str(input or "").strip()
    m = re.search(r"(\d+)\s*\+\s*(\d+)", text)
    if m:
        a = int(m.group(1))
        b = int(m.group(2))
        ans = a + b
        wants_steps = ("ขั้นตอน" in text) or ("เป็นขั้นตอน" in text) or ("step" in text.lower())
        steps: list[str] = []
        explanation = f"คำตอบคือ {ans}"
        if wants_steps:
            steps = [f"เริ่มจาก {a}", f"บวก {b} เข้าไป", f"ได้ผลลัพธ์เป็น {ans}"]
            explanation = "ฉันจะแสดงเป็นขั้นตอนให้เข้าใจง่าย\n" + "\n".join(
                [f"{i+1}. {s}" for i, s in enumerate(steps)]
            )
        return json.dumps(
            {
                "success": True,
                "output": explanation,
                "answer": ans,
                "steps": steps if wants_steps else [],
            },
            ensure_ascii=False,
        )
    return json.dumps(
        {
            "success": False,
            "output": "ฉันช่วยคณิตศาสตร์พื้นฐานได้ เช่น 2+3",
            "answer": None,
            "steps": [],
        },
        ensure_ascii=False,
    )
