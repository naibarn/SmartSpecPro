"""Cross-host workspace facts, safe-action dispatch, and runtime evidence contracts.

This module is intentionally transport-neutral. The application API supplies
authenticated Runner identity and persistence; this layer applies authority,
freshness, idempotency, and convergence rules without treating a local path as
workspace identity.
"""
from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
import re
import sqlite3
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol
from urllib.parse import quote


_CONVERGENCE_SPEC = importlib.util.spec_from_file_location(
    "runtime_authority_convergence_contract", Path(__file__).with_name("convergence_contract.py")
)
if _CONVERGENCE_SPEC is None or _CONVERGENCE_SPEC.loader is None:
    raise ImportError("convergence contract module is unavailable")
_CONVERGENCE_CONTRACT = importlib.util.module_from_spec(_CONVERGENCE_SPEC)
_CONVERGENCE_SPEC.loader.exec_module(_CONVERGENCE_CONTRACT)


EVIDENCE_STATUSES = {
    "OBSERVED", "UNAVAILABLE", "NOT_CONFIGURED", "PERMISSION_DENIED", "STALE", "ERROR"
}
TRUST_LEVELS = {"UNTRUSTED": 0, "USER_REPORTED": 1, "MANAGED_RUNNER": 2, "PLATFORM": 3}
ACTION_NAMES = {
    "SYNC_WORKSPACE_SAFELY", "INSPECT_LOCAL_CHANGES", "OPEN_CANONICAL_WORKSPACE",
    "RECOVER_WORK", "INTEGRATE_COMPLETED_WORK", "RETIRE_SAFE_WORKTREE",
    "VERIFY_PROJECT_CONVERGENCE",
}


@dataclass(frozen=True)
class WorkspaceFact:
    authority_id: str
    tenant_id: str
    project_id: str
    repository_id: str
    host_id: str
    workspace_id: str
    observed_sha: str | None
    branch: str | None
    owner_id: str | None
    session_id: str | None
    dirty: bool | None
    convergence_state: str
    fact_source: str
    observed_at: float
    expires_at: float
    trust_level: str
    signature: str = ""
    local_path: str | None = None

    def identity(self) -> tuple[str, ...]:
        return (self.authority_id, self.tenant_id, self.project_id, self.repository_id, self.host_id, self.workspace_id)

    def payload(self) -> bytes:
        values = asdict(self)
        values.pop("signature", None)
        return json.dumps(values, sort_keys=True, separators=(",", ":")).encode()


def sign_workspace_fact(fact: WorkspaceFact, key: bytes) -> str:
    return hmac.new(key, fact.payload(), hashlib.sha256).hexdigest()


class WorkspaceFactAuthority:
    """Apply identity, signature, expiry, and authority-precedence rules."""

    def __init__(self, trusted_host_keys: Mapping[str, bytes], *, now: Callable[[], float] = time.time):
        self._keys = dict(trusted_host_keys)
        self._now = now
        self._facts: dict[tuple[str, ...], WorkspaceFact] = {}
        self._conflicts: dict[tuple[str, ...], list[WorkspaceFact]] = {}

    def ingest(self, fact: WorkspaceFact) -> dict[str, Any]:
        if not all((fact.authority_id, fact.tenant_id, fact.project_id, fact.repository_id, fact.host_id, fact.workspace_id)):
            return {"status": "REJECTED", "reason": "IDENTITY_INCOMPLETE"}
        if fact.trust_level not in TRUST_LEVELS or fact.trust_level == "UNTRUSTED":
            return {"status": "REJECTED", "reason": "TRUST_LEVEL_INVALID"}
        key = self._keys.get(fact.host_id)
        expected = sign_workspace_fact(fact, key) if key else ""
        if not expected or not hmac.compare_digest(expected, fact.signature):
            return {"status": "REJECTED", "reason": "SIGNATURE_INVALID"}
        if fact.expires_at <= self._now() or fact.observed_at > self._now() + 30:
            return {"status": "STALE", "fact": fact}
        identity = fact.identity()
        previous = self._facts.get(identity)
        if previous is None:
            self._facts[identity] = fact
            return {"status": "ACCEPTED", "fact": fact}
        if previous.payload() == fact.payload():
            return {"status": "DUPLICATE", "fact": previous}
        old_rank = TRUST_LEVELS[previous.trust_level]
        new_rank = TRUST_LEVELS[fact.trust_level]
        if old_rank > new_rank:
            return {"status": "LOWER_AUTHORITY_IGNORED", "fact": previous}
        if old_rank == new_rank and previous.observed_sha != fact.observed_sha:
            self._conflicts.setdefault(identity, [previous]).append(fact)
            return {"status": "CONFLICT", "facts": [previous, fact]}
        if new_rank > old_rank or fact.observed_at > previous.observed_at:
            self._facts[identity] = fact
            return {"status": "ACCEPTED", "fact": fact}
        return {"status": "OLDER_FACT_IGNORED", "fact": previous}

    def snapshot(self, *, tenant_id: str, project_id: str) -> dict[str, Any]:
        now = self._now()
        rows = [f for f in self._facts.values() if f.tenant_id == tenant_id and f.project_id == project_id]
        rows.extend(f for facts in self._conflicts.values() for f in facts
                    if f.tenant_id == tenant_id and f.project_id == project_id)
        by_workspace: dict[tuple[str, str], list[WorkspaceFact]] = {}
        for row in rows:
            by_workspace.setdefault((row.repository_id, row.workspace_id), []).append(row)
        result = []
        for (repository_id, workspace_id), facts in sorted(by_workspace.items()):
            fresh = [f for f in facts if f.expires_at > now]
            state = "STALE" if not fresh else "PARTIAL_STALE" if len(fresh) != len(facts) else "OBSERVED"
            if len({f.observed_sha for f in fresh}) > 1:
                state = "CONFLICT"
            result.append({"repository_id": repository_id, "workspace_id": workspace_id,
                           "state": state, "hosts": [{**{k: v for k, v in asdict(f).items()
                                                         if k not in {"signature", "local_path"}},
                                                        "fact_state": "STALE" if f.expires_at <= now else "OBSERVED"}
                                                       for f in facts]})
        return {"tenant_id": tenant_id, "project_id": project_id, "workspaces": result}


@dataclass(frozen=True)
class EvidenceResult:
    status: str
    provider: str
    observed_at: str | None = None
    data: Mapping[str, Any] | None = None
    reason: str | None = None

    def __post_init__(self) -> None:
        if self.status not in EVIDENCE_STATUSES:
            raise ValueError("EVIDENCE_STATUS_INVALID")


def mark_evidence_freshness(result: EvidenceResult, *, now: float | None = None,
                            max_age_seconds: int = 300) -> EvidenceResult:
    """Mark cached evidence stale using collection time, not resource creation time."""
    now = time.time() if now is None else now
    if result.status != "OBSERVED" or not result.observed_at:
        return result
    if _is_stale_timestamp(result.observed_at, now, max_age_seconds):
        return EvidenceResult("STALE", result.provider, result.observed_at, result.data, "evidence_expired")
    return result


class ArtifactEvidenceSource(Protocol):
    def observe(self, target: str) -> EvidenceResult: ...


class MigrationEvidenceSource(Protocol):
    def observe(self, target: str) -> EvidenceResult: ...


class DeploymentEvidenceSource(Protocol):
    def observe(self, target: str) -> EvidenceResult: ...


class RuntimeRevisionEvidenceSource(Protocol):
    def observe(self, target: str) -> EvidenceResult: ...


class RuntimeHealthEvidenceSource(Protocol):
    def observe(self, target: str) -> EvidenceResult: ...


class CallableEvidenceProvider:
    """Normalize an existing platform reader without owning its source of truth."""

    def __init__(self, provider: str, reader: Callable[[str], Mapping[str, Any] | None]):
        self.provider, self.reader = provider, reader

    def observe(self, target: str) -> EvidenceResult:
        try:
            value = self.reader(target)
        except PermissionError:
            return EvidenceResult("PERMISSION_DENIED", self.provider, reason="provider_permission_denied")
        except (ConnectionError, TimeoutError):
            return EvidenceResult("UNAVAILABLE", self.provider, reason="provider_unavailable")
        except Exception:
            return EvidenceResult("ERROR", self.provider, reason="provider_read_failed")
        if value is None:
            return EvidenceResult("NOT_CONFIGURED", self.provider, reason="source_not_configured")
        return EvidenceResult("OBSERVED", self.provider, data=dict(value))


class CanonicalBuildArtifactEvidenceProvider:
    """Read the canonical-build result ledger written by canonical_source.py."""

    def __init__(self, results_root: Path, *, now: Callable[[], float] = time.time, max_age_seconds: int = 86_400):
        self.results_root, self.now, self.max_age_seconds = results_root, now, max_age_seconds

    def observe(self, source_sha: str) -> EvidenceResult:
        if not self.results_root.is_dir():
            return EvidenceResult("NOT_CONFIGURED", "canonical-build-ledger", reason="build_result_store_missing")
        candidates: list[tuple[float, Mapping[str, Any], Path]] = []
        for path in self.results_root.glob("*/*.json"):
            try:
                item = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if item.get("source_revision") == source_sha and item.get("status") == "BUILD_PASSED":
                candidates.append((float(item.get("completed_at", 0)), item, path))
        if not candidates:
            return EvidenceResult("UNAVAILABLE", "canonical-build-ledger", reason="successful_build_for_source_not_found")
        completed, item, path = max(candidates, key=lambda row: row[0])
        artifact = item.get("artifact")
        if not isinstance(artifact, Mapping) or not re.fullmatch(r"sha256:[a-f0-9]{64}", str(artifact.get("artifact_digest", ""))):
            return EvidenceResult("UNAVAILABLE", "canonical-build-ledger", reason="artifact_digest_missing")
        timestamp = datetime.fromtimestamp(completed, timezone.utc).isoformat()
        data = {"build_id": path.stem, "artifact_id": artifact["artifact_digest"],
                "artifact_digest": artifact["artifact_digest"], "source_sha": source_sha,
                "build_timestamp": timestamp, "environment": item.get("build_target"),
                "target": item.get("build_target"), "provenance": "canonical-build-result-ledger",
                "artifact_file_count": artifact.get("artifact_file_count")}
        if self.now() - completed > self.max_age_seconds:
            return EvidenceResult("STALE", "canonical-build-ledger", timestamp, data, "build_evidence_expired")
        return EvidenceResult("OBSERVED", "canonical-build-ledger", timestamp, data)


class ArtifactEvidenceProvider(CanonicalBuildArtifactEvidenceProvider):
    pass


class MigrationEvidenceProviderAdapter(CallableEvidenceProvider):
    def __init__(self, reader: Callable[[str], Mapping[str, Any] | None]):
        super().__init__("application-migrations", reader)


class DeploymentEvidenceProviderAdapter(CallableEvidenceProvider):
    def __init__(self, reader: Callable[[str], Mapping[str, Any] | None]):
        super().__init__("deployment-registry", reader)


class RuntimeRevisionEvidenceProviderAdapter(CallableEvidenceProvider):
    def __init__(self, reader: Callable[[str], Mapping[str, Any] | None]):
        super().__init__("runtime-revisions", reader)


class RuntimeHealthEvidenceProviderAdapter(CallableEvidenceProvider):
    def __init__(self, reader: Callable[[str], Mapping[str, Any] | None]):
        super().__init__("runtime-health", reader)


class CloudflareEvidenceProvider:
    """Read-only Workers and Containers evidence via broker-resolved credentials."""

    def __init__(self, credential_resolver: Callable[[str], Mapping[str, Any]], *,
                 request: Callable[[str, str], tuple[int, Mapping[str, Any]]],
                 now: Callable[[], float] = time.time, max_age_seconds: int = 300):
        self.credential_resolver, self.request, self.now = credential_resolver, request, now
        self.max_age_seconds = max_age_seconds

    def _get(self, profile: str, path: str) -> tuple[EvidenceResult | None, Any, str | None]:
        try:
            credential = self.credential_resolver(profile)
        except PermissionError:
            return EvidenceResult("PERMISSION_DENIED", "cloudflare", reason="credential_broker_denied"), None, None
        except Exception:
            return EvidenceResult("ERROR", "cloudflare", reason="credential_broker_failed"), None, None
        status = credential.get("status", "OBSERVED")
        if status != "OBSERVED":
            return EvidenceResult(status if status in EVIDENCE_STATUSES else "ERROR", "cloudflare", reason="credential_unavailable"), None, None
        account_id, token = credential.get("account_id"), credential.get("token")
        if not isinstance(account_id, str) or not account_id.strip() or not isinstance(token, str) or not token:
            return EvidenceResult("NOT_CONFIGURED", "cloudflare", reason="credential_or_account_missing"), None, None
        url = "https://api.cloudflare.com/client/v4/accounts/" + quote(account_id, safe="") + path
        try:
            http_status, body = self.request(url, token)
        except PermissionError:
            return EvidenceResult("PERMISSION_DENIED", "cloudflare", reason="provider_permission_denied"), None, account_id
        except (ConnectionError, TimeoutError):
            return EvidenceResult("UNAVAILABLE", "cloudflare", reason="provider_unavailable"), None, account_id
        except Exception:
            return EvidenceResult("ERROR", "cloudflare", reason="provider_request_failed"), None, account_id
        if http_status in (401, 403):
            return EvidenceResult("PERMISSION_DENIED", "cloudflare", reason=f"http_{http_status}"), None, account_id
        if http_status == 404:
            return EvidenceResult("UNAVAILABLE", "cloudflare", reason="resource_not_found"), None, account_id
        if http_status < 200 or http_status >= 300 or body.get("success") is False:
            return EvidenceResult("ERROR", "cloudflare", reason=f"http_{http_status}"), None, account_id
        return None, body.get("result") if isinstance(body, Mapping) else None, account_id

    def observe_worker_deployments(self, script_name: str) -> EvidenceResult:
        error, raw, account_id = self._get("audit", f"/workers/scripts/{quote(script_name, safe='')}/deployments")
        if error:
            return error
        deployments = raw.get("deployments", []) if isinstance(raw, Mapping) else raw if isinstance(raw, list) else []
        if not deployments:
            return EvidenceResult("UNAVAILABLE", "cloudflare-workers", reason="deployment_not_found")
        latest = max((row for row in deployments if isinstance(row, Mapping)), key=lambda row: str(row.get("created_on", "")), default=None)
        if latest is None:
            return EvidenceResult("ERROR", "cloudflare-workers", reason="deployment_response_invalid")
        created = latest.get("created_on") or latest.get("created_at")
        timestamp = datetime.fromtimestamp(self.now(), timezone.utc).isoformat()
        versions = latest.get("versions") if isinstance(latest.get("versions"), list) else []
        version_ids = [row.get("version_id") for row in versions if isinstance(row, Mapping) and row.get("version_id")]
        data = {"account_id": account_id,
                "resource_id": script_name, "deployment_id": latest.get("id"),
                "version_id": version_ids[0] if len(version_ids) == 1 else version_ids,
                "observed_revision": latest.get("id"),
                "source": latest.get("source"), "deployment_created_at": created,
                "traffic": latest.get("versions"),
                "deployment_state": "OBSERVED"}
        return EvidenceResult("OBSERVED", "cloudflare-workers", timestamp, data)

    def observe_container_application(self, application_id: str) -> EvidenceResult:
        encoded_id = quote(application_id, safe="")
        app_error, app, account_id = self._get("audit", f"/containers/applications/{encoded_id}")
        if app_error:
            return app_error
        instance_error, instances, _ = self._get("audit", f"/containers/applications/{encoded_id}/instances-v2")
        if instance_error and instance_error.status not in {"UNAVAILABLE"}:
            return instance_error
        app = app if isinstance(app, Mapping) else {}
        config = app.get("configuration") if isinstance(app.get("configuration"), Mapping) else {}
        health = app.get("health") if isinstance(app.get("health"), Mapping) else {}
        instance_rows = instances if isinstance(instances, list) else []
        normalized_instances = [{"instance_id": row.get("id"), "image": row.get("image"),
            "state": (row.get("status") or {}).get("state") if isinstance(row.get("status"), Mapping) else None,
            "observed_at": (row.get("status") or {}).get("updated_at") if isinstance(row.get("status"), Mapping) else None}
            for row in instance_rows if isinstance(row, Mapping)]
        image = config.get("image")
        digest_match = re.search(r"@sha256:([a-f0-9]{64})$", image) if isinstance(image, str) else None
        updated = app.get("updated_at")
        timestamp = datetime.fromtimestamp(self.now(), timezone.utc).isoformat()
        data = {"account_id": app.get("account_id") or account_id, "resource_id": app.get("id") or application_id,
                "deployment_id": app.get("active_rollout_id"), "intended_image": image,
                "intended_digest": f"sha256:{digest_match.group(1)}" if digest_match else None,
                "observed_revision": app.get("version"), "instances": normalized_instances,
                "app_updated_at": updated, "health": health.get("summary") if health else None}
        return EvidenceResult("OBSERVED", "cloudflare-containers", timestamp, data)


def _is_stale_timestamp(value: str | None, now: float, max_age_seconds: int) -> bool:
    if not value:
        return True
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return True
    return now - parsed > max_age_seconds or parsed > now + 30


def cloudflare_http_get(url: str, token: str, *, timeout_seconds: int = 15) -> tuple[int, Mapping[str, Any]]:
    """Production HTTPS transport; callers resolve tokens through the credential broker."""
    from urllib.error import HTTPError, URLError
    from urllib.request import Request, urlopen

    request = Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            body = json.loads(error.read().decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            body = {}
        return error.code, body
    except (URLError, TimeoutError, OSError) as error:
        raise ConnectionError("CLOUDFLARE_PROVIDER_UNAVAILABLE") from error


class IdempotencyStore(Protocol):
    def reserve(self, scope: tuple[str, str, str], key: str, request_hash: str, receipt: Any) -> tuple[str, Any | None]: ...
    def complete(self, scope: tuple[str, str, str], key: str, request_hash: str, receipt: Any) -> None: ...


class SqliteActionLedger:
    """Durable same-host ledger for repositories using the shared authority DB."""

    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        new_database = not self.database_path.exists()
        with sqlite3.connect(database_path, timeout=10) as db:
            db.execute("""CREATE TABLE IF NOT EXISTS safe_action_receipts (
                tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, actor_id TEXT NOT NULL,
                idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
                receipt_json TEXT NOT NULL, status TEXT NOT NULL, created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                PRIMARY KEY (tenant_id, project_id, actor_id, idempotency_key))""")
        if new_database:
            self.database_path.chmod(0o600)

    def reserve(self, scope: tuple[str, str, str], key: str, request_hash: str, receipt: Any) -> tuple[str, Any | None]:
        tenant_id, project_id, actor_id = scope
        now = time.time()
        with sqlite3.connect(self.database_path, timeout=10, isolation_level=None) as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT request_hash, receipt_json, status FROM safe_action_receipts WHERE tenant_id=? AND project_id=? AND actor_id=? AND idempotency_key=?", (*scope, key)).fetchone()
            if row:
                db.execute("COMMIT")
                if row[0] != request_hash:
                    return "CONFLICT", None
                if row[2] == "STARTED":
                    return "IN_PROGRESS", None
                return "REPLAY", json.loads(row[1])
            db.execute("INSERT INTO safe_action_receipts VALUES(?,?,?,?,?,?,?,?,?)", (*scope, key, request_hash, json.dumps(receipt, sort_keys=True), "STARTED", now, now))
            db.execute("COMMIT")
        return "CREATED", None

    def complete(self, scope: tuple[str, str, str], key: str, request_hash: str, receipt: Any) -> None:
        with sqlite3.connect(self.database_path, timeout=10, isolation_level=None) as db:
            cursor = db.execute("UPDATE safe_action_receipts SET receipt_json=?, status=?, updated_at=? WHERE tenant_id=? AND project_id=? AND actor_id=? AND idempotency_key=? AND request_hash=?", (json.dumps(receipt, sort_keys=True), receipt["status"], time.time(), *scope, key, request_hash))
            if cursor.rowcount != 1:
                raise RuntimeError("ACTION_LEDGER_FENCE_MISMATCH")


class WorkspaceActionDispatcher:
    """Authenticated safe-action pipeline with authority rechecks and replay control."""

    def __init__(self, *, store: IdempotencyStore, resolve_project: Callable[..., Any],
                 resolve_workspace: Callable[..., Any], authorize: Callable[..., bool],
                 recheck_owner: Callable[..., bool], execute: Callable[..., Any],
                 audit: Callable[..., None], now: Callable[[], float] = time.time):
        self.store, self.resolve_project, self.resolve_workspace = store, resolve_project, resolve_workspace
        self.authorize, self.recheck_owner, self.execute, self.audit, self.now = authorize, recheck_owner, execute, audit, now

    def dispatch(self, *, actor_id: str, tenant_id: str, project_id: str, action: str,
                 workspace_id: str | None, idempotency_key: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        if not actor_id or not tenant_id:
            raise PermissionError("ACTOR_AUTHENTICATION_REQUIRED")
        if action not in ACTION_NAMES or not idempotency_key.strip():
            raise ValueError("ACTION_REQUEST_INVALID")
        scope = (tenant_id, project_id, actor_id)
        request_hash = hashlib.sha256(json.dumps({"action": action, "workspace_id": workspace_id,
            "payload": payload}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        project = self.resolve_project(tenant_id=tenant_id, project_id=project_id)
        if not project:
            raise LookupError("PROJECT_AUTHORITY_NOT_FOUND")
        workspace = self.resolve_workspace(project=project, workspace_id=workspace_id) if workspace_id else None
        if workspace_id and not workspace:
            raise LookupError("WORKSPACE_AUTHORITY_NOT_FOUND")
        if not self.authorize(actor_id=actor_id, tenant_id=tenant_id, project=project, action=action, workspace=workspace):
            self.audit(actor_id=actor_id, tenant_id=tenant_id, project_id=project_id, action=action, denied=True)
            raise PermissionError("ACTION_PERMISSION_DENIED")
        if workspace and not self.recheck_owner(actor_id=actor_id, workspace=workspace, action=action):
            raise PermissionError("WORKSPACE_OWNER_RECHECK_FAILED")
        receipt = {"receipt_id": hashlib.sha256(f"{tenant_id}:{project_id}:{idempotency_key}".encode()).hexdigest(),
                   "tenant_id": tenant_id, "project_id": project_id, "actor_id": actor_id,
                   "action": action, "workspace_id": workspace_id, "status": "STARTED", "created_at": self.now()}
        reservation, previous = self.store.reserve(scope, idempotency_key, request_hash, receipt)
        if reservation == "CONFLICT":
            raise ValueError("ACTION_IDEMPOTENCY_CONFLICT")
        if reservation == "REPLAY":
            self.audit(actor_id=actor_id, tenant_id=tenant_id, project_id=project_id, action=action, replay=True)
            return previous
        if reservation != "CREATED":
            raise RuntimeError("ACTION_ALREADY_IN_PROGRESS")
        try:
            result = self.execute(action=action, project=project, workspace=workspace, payload=dict(payload))
            receipt.update({"status": "COMPLETED", "result": result})
        except Exception as error:
            receipt.update({"status": "ERROR", "error": type(error).__name__})
            self.store.complete(scope, idempotency_key, request_hash, receipt)
            self.audit(actor_id=actor_id, tenant_id=tenant_id, project_id=project_id, action=action,
                       receipt_id=receipt["receipt_id"], status=receipt["status"])
            raise
        self.store.complete(scope, idempotency_key, request_hash, receipt)
        self.audit(actor_id=actor_id, tenant_id=tenant_id, project_id=project_id, action=action,
                   receipt_id=receipt["receipt_id"], status=receipt["status"])
        return receipt


def evaluate_multi_instance_convergence(evidence: Mapping[str, Any], *, now: float | None = None,
                                        max_age_seconds: int = 300) -> dict[str, Any]:
    """Deterministic release state; the first matching rule is the reported state."""
    return _CONVERGENCE_CONTRACT.evaluate_multi_instance_convergence(
        evidence, now=now, max_age_seconds=max_age_seconds
    )
