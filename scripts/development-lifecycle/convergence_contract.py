"""Pure, persistence-free convergence predicates shared by lifecycle adapters.

These evaluators do not own source, release, migration, or runtime state. They
classify supplied authoritative facts so callers cannot infer convergence from
a merged source commit or a partial rollout alone.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any


def evaluate_repository_sources(
    project_id: str, repositories: Iterable[Mapping[str, Any]]
) -> dict[str, Any]:
    rows = list(repositories)
    seen: set[str] = set()
    results: list[dict[str, str]] = []
    for row in rows:
        repository_id = str(row.get("repository_id") or "")
        if not repository_id or repository_id in seen:
            raise ValueError("REPOSITORY_ID_MISSING_OR_DUPLICATE")
        seen.add(repository_id)
        canonical_sha = row.get("canonical_sha")
        workspace_sha = row.get("workspace_sha")
        if not canonical_sha or not workspace_sha:
            state = "UNKNOWN"
        elif row.get("dirty"):
            state = "DIRTY"
        elif canonical_sha == workspace_sha:
            state = "SYNCED"
        else:
            state = "BEHIND_OR_DIVERGED"
        results.append(
            {
                "project_id": project_id,
                "repository_id": repository_id,
                "state": state,
            }
        )
    return {
        "project_id": project_id,
        "repository_count": len(results),
        "repositories": results,
        "status": "SOURCE_CONVERGED"
        if results and all(row["state"] == "SYNCED" for row in results)
        else "SOURCE_CONVERGENCE_PENDING",
    }


def evaluate_production_convergence(release: Mapping[str, Any]) -> dict[str, Any]:
    reasons: list[str] = []
    source_sha = release.get("source_sha")
    artifact_digest = release.get("artifact_digest")
    if not source_sha or not artifact_digest or release.get("artifact_source_sha") != source_sha:
        reasons.append("SOURCE_ARTIFACT_PROVENANCE_MISMATCH")
    if (
        not release.get("deployment_id")
        or release.get("deployment_status") != "DEPLOYED_VERIFIED"
        or release.get("deployment_source_sha") != source_sha
        or release.get("deployment_artifact_digest") != artifact_digest
    ):
        reasons.append("DEPLOYMENT_ARTIFACT_MISMATCH")

    required_migrations = set(release.get("required_migrations") or [])
    applied_migrations = {
        str(row.get("migration_id"))
        for row in release.get("migration_evidence") or []
        if row.get("state") == "APPLIED_VERIFIED"
    }
    if not required_migrations.issubset(applied_migrations):
        reasons.append("REQUIRED_MIGRATIONS_NOT_VERIFIED")

    required_targets = set(release.get("required_targets") or [])
    target_rows: dict[str, Mapping[str, Any]] = {}
    for row in release.get("runtime_targets") or []:
        target_id = str(row.get("target_id") or "")
        if not target_id:
            continue
        if target_id in target_rows:
            reasons.append(f"RUNTIME_TARGET_DUPLICATE:{target_id}")
        target_rows[target_id] = row
    if not required_targets.issubset(target_rows):
        reasons.append("REQUIRED_RUNTIME_TARGETS_MISSING")
    for target_id in required_targets & target_rows.keys():
        target = target_rows[target_id]
        if target.get("source_sha") != source_sha or target.get("artifact_digest") != artifact_digest:
            reasons.append(f"RUNTIME_TARGET_STALE:{target_id}")
        expected_revision = (release.get("expected_runtime_revisions") or {}).get(target_id)
        if not expected_revision:
            reasons.append(f"EXPECTED_RUNTIME_REVISION_MISSING:{target_id}")
        elif target.get("runtime_revision") != expected_revision:
            reasons.append(f"RUNTIME_REVISION_STALE:{target_id}")
        if target.get("health") != "HEALTHY":
            reasons.append(f"RUNTIME_TARGET_UNHEALTHY:{target_id}")

    rollback = release.get("rollback") or {}
    if release.get("release_kind") == "ROLLBACK" and not (
        rollback.get("previous_release_id") and rollback.get("rollback_of_release_id")
    ):
        reasons.append("ROLLBACK_LINEAGE_MISSING")

    return {
        "status": "PRODUCTION_CONVERGED" if not reasons else "PRODUCTION_CONVERGENCE_PENDING",
        "source_sha": source_sha,
        "artifact_digest": artifact_digest,
        "reasons": reasons,
    }


def evaluate_development_completion(evidence: Mapping[str, Any]) -> dict[str, Any]:
    required = (
        "integrated",
        "canonical_verified",
        "user_workspace_converged",
        "worktree_lifecycle_settled",
        "required_tests_passed",
    )
    missing = [key for key in required if evidence.get(key) is not True]
    return {
        "status": "DEVELOPMENT_COMPLETE" if not missing else "DEVELOPMENT_PENDING",
        "missing_predicates": missing,
    }
