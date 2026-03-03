import { useCallback, useRef, useState } from "react";
import type { Node, Edge } from "reactflow";
import type { AgencyNodeData } from "@/components/agency/nodes/types";

interface Snapshot {
  nodes: Array<{
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: AgencyNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
    data?: Record<string, unknown>;
  }>;
}

const MAX_HISTORY = 40;
const DEBOUNCE_MS = 300;

/**
 * Circular buffer undo/redo for the agency canvas.
 * Stores structural data only (no instruction text) to save RAM.
 */
export function useAgencyHistory() {
  const historyRef = useRef<Snapshot[]>([]);
  const posRef = useRef<number>(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    setCanUndo(posRef.current > 0);
    setCanRedo(posRef.current < historyRef.current.length - 1);
  }, []);

  const snapshot = useCallback(
    (nodes: Node<AgencyNodeData>[], edges: Edge[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Trim forward history
        historyRef.current = historyRef.current.slice(0, posRef.current + 1);

        const snap: Snapshot = {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            // Store structural data only (skip instructions text to save RAM)
            data: {
              nodeType: n.data.nodeType,
              name: n.data.name,
              description: n.data.description,
              model: n.data.model,
              modelSettings: n.data.modelSettings,
              isEntryPoint: n.data.isEntryPoint,
              isOptional: n.data.isOptional,
              tools: n.data.tools?.map((t) => ({ toolId: t.toolId, toolName: t.toolName })),
              nodeConfig: n.data.nodeConfig,
            },
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: e.type,
            data: e.data as Record<string, unknown>,
          })),
        };

        historyRef.current.push(snap);

        // Cap at MAX_HISTORY
        if (historyRef.current.length > MAX_HISTORY) {
          historyRef.current.shift();
        } else {
          posRef.current++;
        }

        updateFlags();
      }, DEBOUNCE_MS);
    },
    [updateFlags],
  );

  const undo = useCallback(
    (
      setNodes: (nodes: Node<AgencyNodeData>[]) => void,
      setEdges: (edges: Edge[]) => void,
    ) => {
      if (posRef.current <= 0) return;
      posRef.current--;
      const snap = historyRef.current[posRef.current];
      if (snap) {
        setNodes(snap.nodes as Node<AgencyNodeData>[]);
        setEdges(snap.edges as Edge[]);
      }
      updateFlags();
    },
    [updateFlags],
  );

  const redo = useCallback(
    (
      setNodes: (nodes: Node<AgencyNodeData>[]) => void,
      setEdges: (edges: Edge[]) => void,
    ) => {
      if (posRef.current >= historyRef.current.length - 1) return;
      posRef.current++;
      const snap = historyRef.current[posRef.current];
      if (snap) {
        setNodes(snap.nodes as Node<AgencyNodeData>[]);
        setEdges(snap.edges as Edge[]);
      }
      updateFlags();
    },
    [updateFlags],
  );

  return { snapshot, undo, redo, canUndo, canRedo };
}
