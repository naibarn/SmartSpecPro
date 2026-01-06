#!/usr/bin/env python3
"""Generate Control Plane related badges from a runtime snapshot JSON.

Consumes control-plane `coverage/control_plane_policy_snapshot.json`.

Badges written to --outdir:
- control-plane.json
- presign.json
- artifacts.json
- max-size.json
- authz.json

The snapshot contains route probes. If probes indicate enforcement regression,
badges will degrade color and show `enf:off` where applicable.
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, List, Optional, Set, Tuple


def _as_list(v: Any) -> List[str]:
    if isinstance(v, list):
        return [x.lower() for x in v if isinstance(x, str)]
    return []


def _as_int(v: Any) -> Optional[int]:
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    return None


def _probe_ok(snap: Dict[str, Any], path: List[str]) -> Optional[bool]:
    cur: Any = snap
    for p in path:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return None
    return cur if isinstance(cur, bool) else None


def enforcement_ok(snap: Dict[str, Any]) -> Optional[bool]:
    # Base probes
    a = _probe_ok(snap, ["probes", "contentTypeAllowed", "result", "ok"])
    d = _probe_ok(snap, ["probes", "contentTypeDenied", "result", "ok"])
    sa = _probe_ok(snap, ["probes", "sizeAllowed", "result", "ok"])
    sd = _probe_ok(snap, ["probes", "sizeDenied", "result", "ok"])
    kp = _probe_ok(snap, ["probes", "keyPrefixOk", "result", "ok"])
    if a is None or d is None or sa is None or sd is None:
        return None
    ok = (a is True) and (d is False) and (sa is True) and (sd is False)
    if kp is not None:
        ok = ok and (kp is True)

    # Auth probes (optional)
    miss = _probe_ok(snap, ["probes", "authMissingDenied", "result", "ok"])
    if miss is not None:
        ok = ok and (miss is False)
    scope = _probe_ok(snap, ["probes", "authScopeMismatchDenied", "result", "ok"])
    if scope is not None:
        ok = ok and (scope is False)

    # Optional probes
    inv = _probe_ok(snap, ["probes", "invalidNameDenied", "result", "ok"])
    if inv is not None:
        ok = ok and (inv is False)

    get_allowed = _probe_ok(snap, ["probes", "presignGetAllowed", "result", "ok"])
    if get_allowed is not None:
        ok = ok and (get_allowed is True)

    bad_sha = _probe_ok(snap, ["probes", "completeInvalidShaDenied", "result", "ok"])
    if bad_sha is not None:
        ok = ok and (bad_sha is False)

    bad_size = _probe_ok(snap, ["probes", "completeInvalidSizeDenied", "result", "ok"])
    if bad_size is not None:
        ok = ok and (bad_size is False)

    return ok


def authz_ok(snap: Dict[str, Any]) -> Optional[bool]:
    miss = _probe_ok(snap, ["probes", "authMissingDenied", "result", "ok"])
    scope = _probe_ok(snap, ["probes", "authScopeMismatchDenied", "result", "ok"])
    if miss is None or scope is None:
        return None
    # both should be denied => ok flags should be False
    return (miss is False) and (scope is False)


def fmt_bytes(n: Optional[int]) -> str:
    if n is None:
        return "n/a"
    mb = n / (1024 * 1024)
    if mb >= 1:
        return f"{mb:.0f}MB"
    kb = n / 1024
    if kb >= 1:
        return f"{kb:.0f}KB"
    return f"{n}B"


def write_badge(out_path: str, label: str, message: str, color: str, detail: str) -> None:
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"schemaVersion": 1, "label": label, "message": message, "color": color}, f, ensure_ascii=False)
    with open(os.path.splitext(out_path)[0] + ".txt", "w", encoding="utf-8") as f:
        f.write(detail + "\n")


def artifacts_counts(allowed: List[str]) -> Tuple[int, int, int, List[str], List[str], List[str]]:
    types: Set[str] = set(allowed)
    images = sorted([t for t in types if t.startswith("image/")])
    videos = sorted([t for t in types if t.startswith("video/")])
    docs = sorted([t for t in types if t in ("application/pdf", "text/markdown", "text/plain", "application/json")])
    return len(images), len(videos), len(docs), images, videos, docs


def artifacts_color(img_n: int, vid_n: int, doc_n: int) -> str:
    if img_n >= 1 and vid_n >= 1 and doc_n >= 1:
        return "brightgreen"
    if img_n >= 1 and doc_n >= 1:
        return "green"
    if (img_n + vid_n + doc_n) >= 1:
        return "yellow"
    return "red"


def control_plane_badge(allowed: List[str], max_bytes: Optional[int], enf: Optional[bool]) -> Tuple[str, str, str]:
    img = any(t.startswith("image/") for t in allowed)
    vid = any(t.startswith("video/") for t in allowed)
    pdf = "application/pdf" in allowed
    text = any(t in allowed for t in ["text/plain", "text/markdown", "application/json"])

    parts = []
    if img:
        parts.append("img")
    if vid:
        parts.append("vid")
    if pdf:
        parts.append("pdf")
    if text:
        parts.append("text")
    ct = "+".join(parts) if parts else "unknown"

    has_allowlist = len(allowed) > 0
    size_guard = max_bytes is not None

    if has_allowlist and size_guard:
        mode, color = "strict", "brightgreen"
    elif has_allowlist:
        mode, color = "allowlist", "green"
    elif size_guard:
        mode, color = "size-only", "yellow"
    else:
        mode, color = "unknown", "lightgrey"

    enf_msg = "enf:on" if enf is True else ("enf:off" if enf is False else "enf:n/a")
    msg = f"{mode} {enf_msg} ct:{ct}"
    detail = f"has_allowlist={has_allowlist} ct={ct} maxUploadBytes={max_bytes} enforcement_ok={enf}"
    if enf is False and color in ("brightgreen", "green"):
        color = "orange"
    return msg, color, detail


def presign_color(ttl: Optional[int], ct: bool, max_bytes: Optional[int], enf: Optional[bool]) -> str:
    base = "red"
    if ttl is not None and ttl <= 300 and ct:
        base = "brightgreen"
    elif ttl is not None and ttl <= 600 and ct:
        base = "green"
    elif ct:
        base = "yellow"
    if enf is False and base in ("brightgreen", "green", "yellow"):
        return "orange"
    return base


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--outdir", default="_cov/badges")
    args = ap.parse_args()

    with open(args.inp, "r", encoding="utf-8") as f:
        snap: Dict[str, Any] = json.load(f)

    allowed = _as_list(snap.get("allowedContentTypes"))
    max_bytes = _as_int(snap.get("maxUploadBytes"))
    ttl = _as_int(snap.get("presignTtlSeconds"))
    enf = enforcement_ok(snap)

    img_n, vid_n, doc_n, images, videos, docs = artifacts_counts(allowed)
    artifacts_msg = f"img{img_n} vid{vid_n} doc{doc_n}"
    artifacts_detail = f"images={','.join(images)}\nvideos={','.join(videos)}\ndocs={','.join(docs)}"
    write_badge(os.path.join(args.outdir, "artifacts.json"), "artifacts", artifacts_msg, artifacts_color(img_n, vid_n, doc_n), artifacts_detail)

    max_msg = f"max:{fmt_bytes(max_bytes)}"
    max_color = "red" if max_bytes is None else ("brightgreen" if max_bytes <= 50 * 1024 * 1024 else ("green" if max_bytes <= 200 * 1024 * 1024 else ("yellow" if max_bytes <= 500 * 1024 * 1024 else "orange")))
    write_badge(os.path.join(args.outdir, "max-size.json"), "max-size", max_msg, max_color, f"max_bytes={max_bytes}")

    cp_msg, cp_color, cp_detail = control_plane_badge(allowed, max_bytes, enf)
    write_badge(os.path.join(args.outdir, "control-plane.json"), "control-plane", cp_msg, cp_color, cp_detail)

    ttl_msg = "ttl:n/a" if ttl is None else f"ttl:{ttl}s"
    ct_msg = "ct:on" if len(allowed) > 0 else "ct:off"
    size_msg = f"max:{fmt_bytes(max_bytes)}"
    enf_msg = "enf:on" if enf is True else ("enf:off" if enf is False else "enf:n/a")
    pre_msg = f"{ttl_msg} {ct_msg} {enf_msg} {size_msg}"
    pre_detail = f"ttl={ttl}\nct_enforced={len(allowed) > 0}\nmax_bytes={max_bytes}\nenforcement_ok={enf}\nprobes={json.dumps(snap.get('probes', {}), ensure_ascii=False)}"
    write_badge(os.path.join(args.outdir, "presign.json"), "presign", pre_msg, presign_color(ttl, len(allowed) > 0, max_bytes, enf), pre_detail)

    # authz badge
    az = authz_ok(snap)
    az_msg = "scope:n/a" if az is None else ("scope:on" if az is True else "scope:off")
    az_color = "lightgrey" if az is None else ("brightgreen" if az is True else "orange")
    az_detail = f"authz_ok={az}\nprobes={json.dumps({k:v for k,v in (snap.get('probes') or {}).items() if k.startswith('auth')}, ensure_ascii=False)}"
    write_badge(os.path.join(args.outdir, "authz.json"), "authz", az_msg, az_color, az_detail)

    print(f"Wrote runtime badges to {args.outdir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
