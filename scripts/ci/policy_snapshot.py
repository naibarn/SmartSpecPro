#!/usr/bin/env python3
"""Generate a policy snapshot JSON from the OpenAI-compatible proxy.

This runs the FastAPI router in-process (no external services required) and calls:
  GET /v1/policy

It sets safe env defaults so the endpoint works in CI:
- LLM_PROXY_LOCALHOST_ONLY=0 (TestClient host isn't localhost)
- SMARTSPEC_WEB_GATEWAY_URL empty (mcp policy may be null; proxy policy still emitted)

Output: policy_snapshot.json (default: _cov/policy_snapshot.json)
"""

from __future__ import annotations

import argparse
import json
import os
from fastapi import FastAPI
from fastapi.testclient import TestClient


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_cov/policy_snapshot.json")
    args = ap.parse_args()

    # Ensure /v1/policy is accessible in CI
    os.environ.setdefault("LLM_PROXY_LOCALHOST_ONLY", "0")
    os.environ.setdefault("SMARTSPEC_WEB_GATEWAY_URL", "")

    # Import after env is set (module reads env at import time)
    from app.api import llm_openai_compat as mod

    app = FastAPI()
    app.include_router(mod.router)

    c = TestClient(app)
    r = c.get("/v1/policy", headers={"x-trace-id": "ci-policy"})
    if r.status_code != 200:
        raise SystemExit(f"policy_snapshot_failed: status={r.status_code} body={r.text}")

    data = r.json()

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
