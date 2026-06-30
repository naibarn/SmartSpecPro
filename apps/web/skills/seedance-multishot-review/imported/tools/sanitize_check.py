#!/usr/bin/env python3
"""Simple output sanitizer check for generated prompt text.
Usage: python tools/sanitize_check.py path/to/output.txt
"""
from __future__ import annotations
import re, sys
from pathlib import Path

STRICT_TERMS = [
    "brand", "trademark", "logo", "claim", "claims", "guarantee", "guaranteed", "warranty",
    "certified", "official", "authentic", "original", "proven", "best", "number one", "superior",
    "unbeatable", "safe", "safest", "baby-safe", "medical", "clinical", "doctor recommended",
    "solves", "fixes", "prevents", "protects", "performance", "powerful", "durable", "durability",
    "long-lasting", "waterproof", "water resistant", "fireproof", "fire resistant", "scratch resistant",
    "stain resistant", "anti-slip", "anti-bacterial", "strong", "sturdy", "stable", "non-wobbling",
    "heavy-duty", "load-bearing", "risk-free", "perfect", "flawless", "muji", "ikea", "tiktok",
    "shopee", "lazada", "amazon"
]

def find_terms(text: str) -> list[str]:
    text_l = text.lower()
    found = []
    for term in STRICT_TERMS:
        pattern = r"\b" + re.escape(term.lower()).replace(r"\ ", r"\s+") + r"\b"
        if re.search(pattern, text_l):
            found.append(term)
    return found

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tools/sanitize_check.py path/to/output.txt")
        sys.exit(2)
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    found = find_terms(text)
    if found:
        print("FAILED. Restricted terms found:")
        for item in found:
            print(f"- {item}")
        sys.exit(1)
    print("PASSED. No restricted terms found.")
