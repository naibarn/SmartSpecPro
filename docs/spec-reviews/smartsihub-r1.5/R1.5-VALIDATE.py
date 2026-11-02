#!/usr/bin/env python3
"""Reproducible static validation for the SmartAIHub R1.5 document package."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REVIEW = ROOT / "docs/spec-reviews/smartsihub-r1.5"
MANIFEST = REVIEW / "R1.5-FILE-MANIFEST.json"
RESULT_PATH = REVIEW / "R1.5-VALIDATION-RESULT.json"
SPEC_PATHS = [
    next((ROOT / "specs/feature").glob(f"{spec_id}-*/spec.md"))
    for spec_id in range(312, 326)
]
DOC_PATHS = [
    ROOT / "docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md",
    ROOT / "docs/architecture/WORKERS-FIRST-DURABLE-AGENTS-ADR.md",
    ROOT / "docs/architecture/ZERO-TRUST-CREDENTIAL-AND-ACTION-AUTHORITY-ADR.md",
    ROOT / "docs/architecture/SECURE-RUNNER-CONNECTION-AND-DEVICE-TRUST-ADR.md",
    ROOT / "docs/architecture/ALWAYS-ON-RUNNER-AND-UNIFIED-DESKTOP-COMPANION-ADR.md",
    ROOT / "docs/architecture/STACK-DECISION-ADR.md",
    ROOT / "docs/architecture/BACKGROUND-EXECUTION-ADR.md",
    ROOT / "docs/architecture/CHAT-NATIVE-INTERACTIVE-WORKSPACE-ADR.md",
    ROOT / "docs/architecture/COMPUTER-USE-CLEF-BROWSER-ROUTING-ADR.md",
    ROOT / "docs/smartsihub-r1.5/README.md",
    ROOT / "docs/smartsihub-r1.5/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md",
    ROOT / "docs/smartsihub-r1.5/WORK-PACKAGES.md",
    ROOT / "docs/smartsihub-r1.5/CODEX-MISSION-BOOTSTRAP.md",
    ROOT / "docs/smartsihub-r1.5/CODEX-MISSION-M0.md",
    REVIEW / "R1.5-CROSS-SPEC-TRACEABILITY.md",
    REVIEW / "R1.5-TEN-PASS-GAP-AUDIT.md",
]
CHECKED_MARKDOWN = [*SPEC_PATHS, *[p for p in DOC_PATHS if p.suffix == ".md"]]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def front_matter(text: str) -> tuple[str, dict[str, str]]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("missing opening YAML delimiter")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise ValueError("missing closing YAML delimiter") from exc
    fields: dict[str, str] = {}
    for line in lines[1:end]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"invalid YAML frontmatter line: {line}")
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip().strip("\"'")
    return "\n".join(lines[end + 1 :]), fields


def local_link_errors(path: Path, text: str) -> list[str]:
    errors: list[str] = []
    for match in re.finditer(r"(?<!!)\[[^\]]*\]\(([^)]+)\)", text):
        target = match.group(1).strip().strip("<>")
        if not target or target.startswith(("https://", "http://", "mailto:", "tel:")):
            continue
        target = target.split("#", 1)[0].split("?", 1)[0]
        if not target:
            continue
        candidate = ROOT / target.lstrip("/") if target.startswith("/") else path.parent / target
        if not candidate.exists():
            line = text.count("\n", 0, match.start()) + 1
            errors.append(f"{relative(path)}:{line}: unresolved local link {match.group(1)}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument("--output", type=Path, help="also write the JSON result to this path")
    args = parser.parse_args()

    checks: list[dict[str, object]] = []

    def check(name: str, passed: bool, evidence: object) -> None:
        checks.append({"id": name, "status": "PASS" if passed else "FAIL", "evidence": evidence})

    # Canonical SPEC numbering, revision metadata and current-revision controls.
    fm_errors: list[str] = []
    for spec_id, path in zip(range(312, 326), SPEC_PATHS, strict=True):
        try:
            body, fields = front_matter(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            fm_errors.append(f"{relative(path)}: {exc}")
            continue
        if fields.get("spec_id") != str(spec_id):
            fm_errors.append(f"{relative(path)}: spec_id={fields.get('spec_id')!r}")
        if fields.get("revision", "").replace(".", "") != "R15":
            fm_errors.append(f"{relative(path)}: revision={fields.get('revision')!r}")
        if fields.get("date") != "2026-11-02":
            fm_errors.append(f"{relative(path)}: date={fields.get('date')!r}")
        if fields.get("status") != "PROPOSED_NOT_IMPLEMENTED":
            fm_errors.append(f"{relative(path)}: status={fields.get('status')!r}")
        if "Current-revision note (R1.5, 2026-11-02)" not in body:
            fm_errors.append(f"{relative(path)}: current-revision precedence note missing")
        if spec_id < 325 and "## R1.5" not in body:
            fm_errors.append(f"{relative(path)}: R1.5 addendum missing")
    check("spec_frontmatter_and_revision", not fm_errors, fm_errors or [relative(p) for p in SPEC_PATHS])

    # Target map truth is read from the canonical registry, not copied labels.
    target_errors: list[str] = []
    target_path = ROOT / "apps/web/scripts/deployment-targets.json"
    targets = json.loads(target_path.read_text(encoding="utf-8"))["targets"]
    expected_targets = {
        "legacy-debian-dev": ("smartaihub.app", "smartspec-web.service", 3000),
        "modular-debian-dev": ("aimarkethubs.com", "smartsihub-core-dev.service", 3200),
        "modular-cloudflare-prod": ("smartsihub.com", None, None),
    }
    for target_id, (domain, service, port) in expected_targets.items():
        target = targets.get(target_id, {})
        if target.get("domain") != domain:
            target_errors.append(f"{target_id}: unexpected domain {target.get('domain')!r}")
        if service and (target.get("service") != service or target.get("port") != port):
            target_errors.append(f"{target_id}: service/port mismatch")
    modular = targets.get("modular-debian-dev", {})
    if modular.get("applicationAvailable") is not False or modular.get("deployable") is not False:
        target_errors.append("modular-debian-dev must remain unavailable and non-deployable")
    if modular.get("handover", {}).get("currentPort") != 3100 or not modular.get("handover", {}).get("preserveUntilCoreHealthy"):
        target_errors.append("current port-3100 service preservation is missing")
    production = targets.get("modular-cloudflare-prod", {})
    if production.get("status") != "registered-not-activated" or production.get("deployable") is not False:
        target_errors.append("modular-cloudflare-prod must remain registered-not-activated")
    check("deployment_target_alignment", not target_errors, target_errors or expected_targets)

    # Required SPEC-325 architecture and negative-test coverage.
    s325 = SPEC_PATHS[-1].read_text(encoding="utf-8")
    required_controls = [
        "STRIDE-style", "flowchart LR", "Cloudflare Secrets Store", "Tier A", "Tier B", "Tier C",
        "AES-256-GCM", "AWS KMS", "Credential placement matrix", "secrets.required",
        "proof-of-possession", "signed", "policyEpoch", "WAITING_FOR_EXECUTOR",
        "WAITING_FOR_INTERACTIVE_SESSION", "Runner Core Connector", "Task Executor",
        "Secure/HttpOnly", "cross-tenant", "prompt-injection", "SSRF", "anti-downgrade",
        "backup", "AI Gateway prompt/body logging", "APPROVAL", "COMPANION", "TLS 1.3",
        "Cloudflare Edge", "application-layer E2EE", "no public incoming", "HTTPS polling", "Cloudflare Tunnel",
        "linger", "After Login Only",
    ]
    missing_controls = [term for term in required_controls if term.casefold() not in s325.casefold()]
    test_ids = re.findall(r"\| (SEC-\d{2}) \|", s325)
    required_messages = [
        "device-boot-presence", "device-enrollment", "session-proof-and-renew", "device-status",
        "job-offer/ack/lease", "effect-authorization", "UI-action", "notification-event",
        "companion-ipc-allowlist", "client-version-compatibility", "offline-recovery", "device-pause/unpair/revoke",
    ]
    missing_messages = [name for name in required_messages if name not in s325]
    check("spec325_security_architecture", not missing_controls and not missing_messages and len(set(test_ids)) >= 32,
          {"missing_controls": missing_controls, "missing_messages": missing_messages, "acceptance_test_count": len(set(test_ids))})

    # Cross-SPEC Runner/Companion clauses and Rust-first supersession.
    cross_errors: list[str] = []
    required_by_spec = {
        312: ["Core Connector", "SPEC-325", "browser-closed"],
        313: ["proof-of-possession", "browser login", "policy-epoch"],
        314: ["Runner Gateway", "Service Binding", "caller"],
        315: ["sign and verify Runner endpoint", "production"],
        316: ["signed update", "Windows SCM", "anti-downgrade"],
        317: ["device keys", "Re-enrollment"],
        318: ["Core Connector", "bounded exponential backoff", "WAITING_FOR_INTERACTIVE_SESSION"],
        319: ["same frontend", "Companion", "Native IPC"],
        320: ["untrusted presentation", "prompt"],
        321: ["idempotency", "settle"],
        322: ["spend mandate", "Agent cannot"],
        323: ["BYOC Runners", "credential"],
        324: ["one explicit owner pairing", "without a recurring"],
    }
    for spec_id, terms in required_by_spec.items():
        path = SPEC_PATHS[spec_id - 312]
        body = path.read_text(encoding="utf-8").casefold()
        for term in terms:
            if term.casefold() not in body:
                cross_errors.append(f"SPEC-{spec_id}: missing {term!r}")
    background = (ROOT / "docs/architecture/BACKGROUND-EXECUTION-ADR.md").read_text(encoding="utf-8")
    stack = (ROOT / "docs/architecture/STACK-DECISION-ADR.md").read_text(encoding="utf-8")
    if "Historical R0.5" not in background or "historical" not in stack.casefold():
        cross_errors.append("Rust-first historical/supersession marker missing")
    check("cross_spec_and_adr_alignment", not cross_errors, cross_errors or {"specs_checked": sorted(required_by_spec), "adr_supersession": True})

    # The 10-pass report must enumerate every pass and limitations.
    report_path = REVIEW / "R1.5-TEN-PASS-GAP-AUDIT.md"
    report = report_path.read_text(encoding="utf-8")
    pass_ids = re.findall(r"^## Pass (\d+) —", report, flags=re.MULTILINE)
    report_errors = []
    if pass_ids != [str(i) for i in range(1, 11)]:
        report_errors.append(f"pass headings={pass_ids}")
    if report.count("**Evidence/status:**") != 10 or report.count("**Residual risk:**") != 10:
        report_errors.append("each pass must list evidence/status and residual risk")
    if "SPEC-ONLY — NO IMPLEMENTATION / NO DEPLOYMENT" not in report:
        report_errors.append("SPEC-only limitation missing")
    check("ten_pass_report_completeness", not report_errors, report_errors or {"passes": pass_ids, "risks": 10})

    # R1.4 evidence remains immutable; only verify the old validator's own hash.
    r14_manifest_path = ROOT / "docs/spec-reviews/smartsihub-r1.4/R1.4-FILE-MANIFEST.json"
    r14_validator_path = ROOT / "docs/spec-reviews/smartsihub-r1.4/R1.4-VALIDATE.py"
    r14_manifest = json.loads(r14_manifest_path.read_text(encoding="utf-8"))
    r14_validator_entry = next((row for row in r14_manifest["files"] if row["path"].endswith("R1.4-VALIDATE.py")), None)
    r14_ok = bool(r14_validator_entry and sha256(r14_validator_path) == r14_validator_entry["sha256"])
    check("r14_validator_preserved", r14_ok, {"validator": relative(r14_validator_path), "manifest_digest_match": r14_ok})

    # Existing handoff generator must have current digest/requirement ledger evidence.
    handoff_errors: list[str] = []
    for path in SPEC_PATHS:
        try:
            digest = sha256(path)
            handoff_dir = path.parent / "handoff"
            manifest = json.loads((handoff_dir / "manifest.json").read_text(encoding="utf-8"))
            ledger = json.loads((handoff_dir / "requirement-ledger.json").read_text(encoding="utf-8"))
            if manifest.get("identity", {}).get("digest") != digest:
                handoff_errors.append(f"{relative(path)}: stale handoff manifest digest")
            if ledger.get("spec_digest") != digest:
                handoff_errors.append(f"{relative(path)}: stale requirement ledger digest")
        except (OSError, json.JSONDecodeError) as exc:
            handoff_errors.append(f"{relative(path)}: missing/invalid handoff ({exc})")
    check("canonical_handoff_digest_alignment", not handoff_errors, handoff_errors or len(SPEC_PATHS))

    handoff_validation: list[dict[str, object]] = []
    for path in SPEC_PATHS:
        proc = subprocess.run(
            ["python3", "-m", "tools.spec_handoff", "validate", "--spec-dir", str(path.parent.relative_to(ROOT))],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        try:
            value = json.loads(proc.stdout)
        except json.JSONDecodeError:
            value = {"valid": False, "validation_errors": [proc.stderr.strip() or "invalid JSON result"]}
        handoff_validation.append({"spec_id": path.parent.name.split("-", 1)[0], "valid": value.get("valid") is True and proc.returncode == 0, "completion_eligible": value.get("completion_eligible")})
    invalid_handoffs = [item for item in handoff_validation if not item["valid"]]
    check("canonical_handoff_contract_validation", not invalid_handoffs, {"validated": len(handoff_validation), "invalid": invalid_handoffs})

    generated_registry_errors: list[str] = []
    status_root = ROOT / "specs/_status"
    status_index = json.loads((status_root / "spec-index.json").read_text(encoding="utf-8"))
    registry = json.loads((status_root / "spec-id-registry.json").read_text(encoding="utf-8"))
    if status_index.get("canonical_spec_count") != 331:
        generated_registry_errors.append(f"spec-index canonical_spec_count={status_index.get('canonical_spec_count')!r}")
    if not any(str(row.get("spec_id")) == "325" for row in status_index.get("records", [])):
        generated_registry_errors.append("SPEC-325 missing from generated spec-index")
    if "325" not in registry.get("occupied_spec_ids", []):
        generated_registry_errors.append("SPEC-325 missing from generated occupied ID registry")
    if not registry.get("next_safe_spec_ids") or registry["next_safe_spec_ids"][0] != "326":
        generated_registry_errors.append(f"next_safe_spec_ids={registry.get('next_safe_spec_ids')!r}")
    check("generated_spec_registry_alignment", not generated_registry_errors, generated_registry_errors or {"canonical_spec_count": 331, "occupied_325": True, "next_safe": "326"})

    # All local Markdown links in the current source set must resolve.
    link_errors: list[str] = []
    links_checked = 0
    for path in CHECKED_MARKDOWN:
        if not path.is_file():
            link_errors.append(f"missing source file: {relative(path)}")
            continue
        source = path.read_text(encoding="utf-8")
        found = re.findall(r"(?<!!)\[[^\]]*\]\(([^)]+)\)", source)
        links_checked += len(found)
        link_errors.extend(local_link_errors(path, source))
    check("local_markdown_links", not link_errors, {"links_scanned": links_checked, "errors": link_errors[:100]})

    # Per-file manifest covers current source docs and excludes self/result to avoid cycles.
    manifest_errors: list[str] = []
    if MANIFEST.is_file():
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        for row in manifest.get("files", []):
            path = ROOT / row["path"]
            if not path.is_file():
                manifest_errors.append(f"missing manifest file: {row['path']}")
            elif path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
                manifest_errors.append(f"digest mismatch: {row['path']}")
        exclusions = {row.get("path"): row.get("reason") for row in manifest.get("excluded", [])}
        if not exclusions.get(relative(MANIFEST)) or not exclusions.get(relative(RESULT_PATH)):
            manifest_errors.append("manifest self and validation-result exclusions must state anti-cycle reasons")
    else:
        manifest_errors.append("R1.5 file manifest missing")
    check("r15_file_manifest", not manifest_errors, manifest_errors or len(manifest.get("files", [])))

    failed = sum(1 for row in checks if row["status"] != "PASS")
    result = {
        "revision": "R1.5",
        "status": "PASS" if failed == 0 else "FAIL",
        "scope": "static documentation, registry, handoff, manifest and local-link checks only",
        "runtime_or_deployment_claim": False,
        "checked_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "checks_passed": len(checks) - failed,
        "checks_failed": failed,
        "markdown_links_scanned": links_checked,
        "checks": checks,
    }
    output = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        output_path = args.output if args.output.is_absolute() else ROOT / args.output
        output_path.write_text(output, encoding="utf-8")
    if args.json or not args.output:
        sys.stdout.write(output)
    else:
        print(f"R1.5 validation {result['status']}: {result['checks_passed']} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
