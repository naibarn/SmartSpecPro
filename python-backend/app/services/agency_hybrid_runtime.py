"""Hybrid runtime helpers for agency compile preview metadata.

Phase 1 keeps Agency Swarm as the execution backbone while normalizing
hybrid compile preview metadata into additive run-result surfaces that
Node.js already understands.
"""

from __future__ import annotations

from typing import Any


def _normalize_engine_mix(values: list[Any] | None) -> list[str]:
    normalized: list[str] = []
    for value in values or []:
        if value in ("agency_swarm", "adk2") and value not in normalized:
            normalized.append(value)
    return normalized


def build_hybrid_run_summary(compile_preview: dict[str, Any] | None) -> dict[str, Any] | None:
    """Return an additive runtime summary derived from compile preview metadata."""
    if not isinstance(compile_preview, dict):
        return None

    plan_summary = compile_preview.get("planSummary")
    if not isinstance(plan_summary, dict):
        return None

    engine_mix = _normalize_engine_mix(plan_summary.get("engineMix"))
    uses_hybrid = bool(plan_summary.get("usesHybrid")) or len(engine_mix) > 1 or "adk2" in engine_mix

    return {
        "usesHybrid": uses_hybrid,
        "engineMix": engine_mix,
        "subgraphCount": int(plan_summary.get("subgraphCount") or 0),
        "bridgeCount": int(plan_summary.get("bridgeCount") or 0),
        "compileStatus": "failed" if int(plan_summary.get("errorCount") or 0) > 0 else "success",
        "artifactPublicationMode": "agency_run_artifacts",
    }


def build_step_attempt_snapshots(
    compile_preview: dict[str, Any] | None,
    usage_breakdown: list[Any] | None = None,
) -> list[dict[str, Any]]:
    """Normalize hybrid compile metadata into additive billing snapshots."""
    snapshots: list[dict[str, Any]] = []

    if isinstance(compile_preview, dict):
        # compiledSubgraphs is Node-owned preview metadata; tolerate missing keys.
        for subgraph in compile_preview.get("compiledSubgraphs") or []:
            if not isinstance(subgraph, dict):
                continue
            engine = subgraph.get("engine")
            snapshots.append({
                "model_id": engine or "agency_swarm",
                "provider": "google_adk" if engine == "adk2" else "agency_swarm",
                "input_tokens": 0,
                "output_tokens": 0,
                "credits_used": 0,
                "engine": engine if engine in ("agency_swarm", "adk2") else None,
                "subgraph_id": subgraph.get("id"),
                "phase": "subgraph",
                "metadata": {
                    "lowering_strategy": subgraph.get("loweringStrategy"),
                    "emulated_node_ids": subgraph.get("emulatedNodeIds") or [],
                },
            })

        for bridge in compile_preview.get("bridges") or []:
            if not isinstance(bridge, dict):
                continue
            snapshots.append({
                "model_id": "hybrid-bridge",
                "provider": "smartspec_bridge",
                "input_tokens": 0,
                "output_tokens": 0,
                "credits_used": 0,
                "engine": bridge.get("toEngine") if bridge.get("toEngine") in ("agency_swarm", "adk2") else None,
                "subgraph_id": bridge.get("toSubgraphId"),
                "phase": "bridge",
                "metadata": {
                    "from_subgraph_id": bridge.get("fromSubgraphId"),
                    "to_subgraph_id": bridge.get("toSubgraphId"),
                    "bridge_mode": bridge.get("bridgeMode"),
                    "implicit": bool(bridge.get("implicit")),
                },
            })

    for usage in usage_breakdown or []:
        model = getattr(usage, "model", "") or ""
        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        total_tokens = int(getattr(usage, "total_tokens", prompt_tokens + completion_tokens) or 0)
        snapshots.append({
            "model_id": model or "gateway_usage",
            "provider": "llm_gateway",
            "input_tokens": prompt_tokens,
            "output_tokens": completion_tokens,
            "credits_used": 0,
            "engine": None,
            "subgraph_id": None,
            "phase": "usage_breakdown",
            "metadata": {
                "total_tokens": total_tokens,
            },
        })

    return snapshots
