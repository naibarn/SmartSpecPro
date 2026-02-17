"""Sample skill: Math Tutor (improvable by ISC)."""
import re

def respond(input_text: str, context=None) -> str:
    text = (input_text or "").strip()
    m = re.search(r"(\d+)\s*\+\s*(\d+)", text)
    if m:
        a = int(m.group(1)); b = int(m.group(2))
        ans = a + b
        wants_steps = ("ขั้นตอน" in text) or ("เป็นขั้นตอน" in text) or ("step" in text.lower())
        if wants_steps:
            steps = [f"เริ่มจาก {a}", f"บวก {b} เข้าไป", f"ได้ผลลัพธ์เป็น {ans}"]
            return "ฉันจะแสดงเป็นขั้นตอนให้เข้าใจง่าย\n" + "\n".join([f"{i+1}. {s}" for i, s in enumerate(steps)])
        return f"คำตอบคือ {ans}"
    return "ฉันช่วยคณิตศาสตร์พื้นฐานได้ เช่น 2+3"
