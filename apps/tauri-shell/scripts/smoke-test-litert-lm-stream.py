#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path


def read_chunks(command: list[str], chunk_size: int) -> int:
    start = time.time()
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=False,
    )
    stdout_chunks = 0

    try:
        while True:
            if process.stdout is None:
                break
            chunk = process.stdout.read(chunk_size)
            if chunk:
                stdout_chunks += 1
                elapsed = time.time() - start
                preview = chunk[:80]
                print(
                    f"STDOUT_CHUNK {stdout_chunks} {elapsed:.3f}s {len(chunk)}B {preview!r}",
                    flush=True,
                )
            if process.poll() is not None:
                rest = process.stdout.read() if process.stdout else b""
                if rest:
                    stdout_chunks += 1
                    elapsed = time.time() - start
                    preview = rest[:80]
                    print(
                        f"STDOUT_CHUNK {stdout_chunks} {elapsed:.3f}s {len(rest)}B {preview!r}",
                        flush=True,
                    )
                break
        stderr = process.stderr.read() if process.stderr else b""
    finally:
        return_code = process.wait()

    print(f"RETURN {return_code}")
    if stderr:
        print(f"STDERR {stderr[:400]!r}")
    if stdout_chunks <= 1:
        print("ASSESSMENT stdout appears buffered for short replies; pseudo-streaming fallback remains recommended.")
    else:
        print("ASSESSMENT stdout arrived incrementally for this prompt.")

    return return_code


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Smoke-test LiteRT-LM stdout chunking with a real Gemma 4 model.",
    )
    parser.add_argument("--binary", required=True, help="Path to litert-lm executable")
    parser.add_argument("--model", required=True, help="Path to .litertlm model")
    parser.add_argument(
        "--prompt",
        default="Write 12 short bullet points about why local AI can reduce cloud token usage.",
        help="Prompt to run during the smoke test",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=128,
        help="Chunk size used to read stdout incrementally",
    )
    args = parser.parse_args()

    binary = Path(args.binary).expanduser().resolve()
    model = Path(args.model).expanduser().resolve()
    if not binary.is_file():
        print(f"Binary not found: {binary}", file=sys.stderr)
        return 2
    if not model.is_file():
        print(f"Model not found: {model}", file=sys.stderr)
        return 2

    command = [str(binary), "run", str(model), f"--prompt={args.prompt}"]
    print(f"COMMAND {' '.join(command)}")
    return read_chunks(command, max(1, args.chunk_size))


if __name__ == "__main__":
    raise SystemExit(main())
