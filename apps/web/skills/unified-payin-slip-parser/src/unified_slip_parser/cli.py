from __future__ import annotations

import argparse
import json
from pathlib import Path

from .router import parse_slip

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="Path to input JSON")
    parser.add_argument("--ocr", default="", help="Inline OCR text")
    parser.add_argument("--caption", default="", help="Inline short caption")
    parser.add_argument("--image-path", default="", help="Image path")
    args = parser.parse_args()

    if args.input:
        payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    else:
        payload = {
            "source": {
                "raw_ocr_text": args.ocr,
                "short_caption": args.caption,
                "image_path": args.image_path,
            },
            "parse_options": {"mode": "auto", "auto_detect_issuer": True, "auto_detect_transaction_type": True}
        }

    out = parse_slip(payload)
    print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()