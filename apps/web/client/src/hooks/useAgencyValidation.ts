import { useMemo } from "react";
import type { Node, Edge } from "reactflow";
import type { AgencyNodeData } from "@/components/agency/nodes/types";

type Route = { condition?: string; targetNodeId?: string };

/**
 * Computes per-node validation errors client-side.
 * Returns a Map<nodeId, string[]> of error messages.
 */
export function useAgencyValidation(
  nodes: Node<AgencyNodeData>[],
  edges: Edge[],
): Map<string, string[]> {
  return useMemo(() => {
    const errors = new Map<string, string[]>();
    const entryPoints = nodes.filter((n) => n.data.isEntryPoint);

    for (const node of nodes) {
      const nodeErrors: string[] = [];
      const { nodeType = "agent" } = node.data;
      const nc = node.data.nodeConfig ?? {};

      // ── Entry-point restriction: only agent/supervisor ────────────────────
      if (node.data.isEntryPoint && !["agent", "supervisor"].includes(nodeType)) {
        nodeErrors.push("Only agent or supervisor nodes can be the entry point");
      }

      // ── agent / supervisor ────────────────────────────────────────────────
      if (nodeType === "agent" || nodeType === "supervisor") {
        if (!node.data.model) nodeErrors.push("Model is required");
        if (!node.data.instructions) nodeErrors.push("Instructions are required");

        if (nodeType === "supervisor") {
          const maxRounds = (nc.maxRounds as number | undefined) ?? 5;
          if (maxRounds < 1 || maxRounds > 20) {
            nodeErrors.push("Max rounds must be between 1 and 20");
          }
        }
      }

      // ── router ────────────────────────────────────────────────────────────
      if (nodeType === "router") {
        const routes: Route[] = (nc.routes as Route[]) ?? [];
        if (routes.length === 0) {
          nodeErrors.push("At least 1 route is required");
        } else {
          routes.forEach((r, i) => {
            if (!r.condition?.trim()) {
              nodeErrors.push(`Route ${i + 1}: condition is required`);
            }
            if (!r.targetNodeId?.trim()) {
              nodeErrors.push(`Route ${i + 1}: target node ID is required`);
            }
          });
        }

        const defaultTarget = nc.defaultTarget as string | undefined;
        if (!defaultTarget?.trim()) {
          nodeErrors.push("Default target (fallback) is required");
        }

        const routingMode = (nc.routingMode as string | undefined) ?? "keyword";
        if (routingMode === "llm_classify" && !node.data.model) {
          nodeErrors.push("LLM classify mode requires a model");
        }
      }

      // ── aggregator ────────────────────────────────────────────────────────
      if (nodeType === "aggregator") {
        const aggregationMode = nc.aggregationMode as string | undefined;
        if (!aggregationMode) {
          nodeErrors.push("Aggregation mode is required");
        }
        if (aggregationMode === "llm_merge" && !node.data.model) {
          nodeErrors.push("LLM merge mode requires a model");
        }
      }

      // ── knowledge_base ────────────────────────────────────────────────────
      if (nodeType === "knowledge_base") {
        // "specific" scope requires a document selection; "all" scope is always valid
        if (nc.searchScope === "specific" && !nc.collectionId) {
          nodeErrors.push("Select a document to search");
        }
      }

      // ── skill_call ────────────────────────────────────────────────────────
      if (nodeType === "skill_call") {
        if (!nc.skillSlug) {
          nodeErrors.push("Skill slug is required");
        }
      }

      // ── browser_session ───────────────────────────────────────────────────
      if (nodeType === "browser_session") {
        if (!String(nc.goal ?? "").trim()) {
          nodeErrors.push("Browser goal is required");
        }

        const handoffMode = String(nc.handoffMode ?? "continue_running");
        if (
          (handoffMode === "review_required" || handoffMode === "needs_user_input")
          && !String(nc.handoffSummary ?? "").trim()
        ) {
          nodeErrors.push("Human handoff summary is required");
        }
      }

      // ── human_approval ────────────────────────────────────────────────────
      if (nodeType === "human_approval") {
        const timeoutHours = nc.timeoutHours as number | undefined;
        if (!timeoutHours || timeoutHours <= 0) {
          nodeErrors.push("Timeout hours is required");
        }
      }

      if (nodeErrors.length > 0) {
        errors.set(node.id, nodeErrors);
      }
    }

    // ── Global: exactly one entry point ───────────────────────────────────
    if (nodes.length > 0 && entryPoints.length === 0) {
      // Mark all agent/supervisor nodes to prompt the user
      for (const node of nodes) {
        if (["agent", "supervisor"].includes(node.data.nodeType ?? "agent")) {
          const existing = errors.get(node.id) ?? [];
          if (!existing.includes("One entry point is required")) {
            errors.set(node.id, [...existing, "One entry point is required"]);
          }
        }
      }
    }

    return errors;
  }, [nodes, edges]);
}
