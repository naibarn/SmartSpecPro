"""Unit tests for hybrid runtime metadata normalization helpers."""

import pytest

from app.services.agency_hybrid_runtime import (
    build_hybrid_run_summary,
    build_step_attempt_snapshots,
)

pytestmark = [pytest.mark.unit, pytest.mark.agency]


def test_build_hybrid_run_summary_returns_none_without_compile_preview():
    assert build_hybrid_run_summary(None) is None


def test_build_hybrid_run_summary_maps_plan_summary_fields():
    summary = build_hybrid_run_summary(
        {
            "planSummary": {
                "engineMix": ["agency_swarm", "adk2"],
                "subgraphCount": 3,
                "bridgeCount": 2,
                "usesHybrid": True,
                "errorCount": 0,
            }
        }
    )

    assert summary == {
        "usesHybrid": True,
        "engineMix": ["agency_swarm", "adk2"],
        "subgraphCount": 3,
        "bridgeCount": 2,
        "compileStatus": "success",
        "artifactPublicationMode": "agency_run_artifacts",
    }


def test_build_step_attempt_snapshots_emits_subgraph_bridge_and_usage_entries():
    class Usage:
        model = "gpt-4o-mini"
        prompt_tokens = 10
        completion_tokens = 5
        total_tokens = 15

    snapshots = build_step_attempt_snapshots(
        {
            "compiledSubgraphs": [
                {
                    "id": "sg_research",
                    "engine": "agency_swarm",
                    "loweringStrategy": "agency_swarm_orchestrator",
                    "emulatedNodeIds": ["router-1"],
                },
                {
                    "id": "sg_creative",
                    "engine": "adk2",
                    "loweringStrategy": "adk_dynamic",
                    "emulatedNodeIds": [],
                },
            ],
            "bridges": [
                {
                    "fromSubgraphId": "sg_research",
                    "toSubgraphId": "sg_creative",
                    "toEngine": "adk2",
                    "bridgeMode": "sync",
                    "implicit": False,
                }
            ],
        },
        usage_breakdown=[Usage()],
    )

    assert snapshots[0]["subgraph_id"] == "sg_research"
    assert snapshots[0]["phase"] == "subgraph"
    assert snapshots[1]["engine"] == "adk2"
    assert snapshots[2]["phase"] == "bridge"
    assert snapshots[3]["phase"] == "usage_breakdown"
    assert snapshots[3]["metadata"]["total_tokens"] == 15
