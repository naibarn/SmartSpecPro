import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from gpt_image_prompt_engineer import run_skill

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-json")
    parser.add_argument("--input-file")
    parser.add_argument("--output-file")
    args = parser.parse_args()
    if not args.input_json and not args.input_file:
        raise SystemExit("Provide --input-json or --input-file")
    if args.input_json:
        payload = json.loads(args.input_json)
    else:
        payload = json.loads(Path(args.input_file).read_text(encoding="utf-8"))
    result = run_skill(payload)
    text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    if args.output_file:
        Path(args.output_file).write_text(text, encoding="utf-8")
    else:
        print(text)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
