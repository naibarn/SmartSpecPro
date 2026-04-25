import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOC_DIR = ROOT / "profiles" / "localization"

def load_locale(lang: str) -> dict:
    code = "th" if lang == "th" else "en"
    with open(LOC_DIR / f"{code}.json", "r", encoding="utf-8") as f:
        return json.load(f)

def label(value: str, lang: str) -> str:
    loc = load_locale(lang)
    return loc.get("values", {}).get(value, value.replace("_", " "))

def field_label(field: str, lang: str) -> str:
    loc = load_locale(lang)
    return loc.get(field, field.replace("_", " "))
