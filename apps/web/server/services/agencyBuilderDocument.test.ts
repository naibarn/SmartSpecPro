import { describe, expect, it } from "vitest";

import {
  AGENCY_DEFAULT_COMPILE_MODE,
  AGENCY_DEFAULT_COMPATIBILITY_MODE,
  AGENCY_DEFAULT_ENGINE,
  AGENCY_STRICT_COMPILE_MODE,
  buildAgencyDocumentFromRows,
  buildAgencyVersionSnapshot,
  normalizeAgencyDocumentSnapshot,
  shouldPersistAgencyDocumentV2,
} from "./agencyBuilderDocument";

describe("agencyBuilderDocument", () => {
  it("normalizes a legacy snapshot into a root legacy subgraph", () => {
    const document = normalizeAgencyDocumentSnapshot(
      {
        name: "Legacy Agency",
        nodes: [
          {
            name: "Researcher",
            nodeType: "agent",
            isEntryPoint: true,
          },
          {
            name: "Writer",
            nodeType: "agent",
          },
        ],
        edges: [
          {
            fromAgentName: "Researcher",
            toAgentName: "Writer",
            flowType: "delegation",
          },
        ],
      },
      "Fallback Agency",
    );

    expect(document.documentVersion).toBe(1);
    expect(document.defaultEngine).toBe(AGENCY_DEFAULT_ENGINE);
    expect(document.settings.compileMode).toBe(AGENCY_DEFAULT_COMPILE_MODE);
    expect(document.settings.compatibilityMode).toBe(
      AGENCY_DEFAULT_COMPATIBILITY_MODE,
    );
    expect(document.subgraphs).toEqual([
      {
        id: "sg_root_legacy",
        name: "Legacy Agency Root",
        engine: AGENCY_DEFAULT_ENGINE,
        entryNodeIds: ["Researcher"],
        exitNodeIds: ["Writer"],
        nodeIds: ["Researcher", "Writer"],
        boundaryPolicy: null,
      },
    ]);
  });

  it("preserves a hybrid v2 snapshot and its explicit settings", () => {
    const document = normalizeAgencyDocumentSnapshot(
      {
        documentVersion: 2,
        name: "Hybrid Agency",
        defaultEngine: "adk2",
        nodes: [
          {
            id: "node-1",
            name: "Creative Router",
            nodeType: "router",
            subgraphId: "sg_creative",
            engineHint: "adk2",
          },
        ],
        edges: [],
        subgraphs: [
          {
            id: "sg_creative",
            name: "Creative Cluster",
            engine: "adk2",
            entryNodeIds: ["node-1"],
            exitNodeIds: ["node-1"],
            nodeIds: ["node-1"],
            boundaryPolicy: { bridgeMode: "sync" },
          },
        ],
        settings: {
          compileMode: "assist",
          compatibilityMode: "hybrid",
          traceLevel: "verbose",
        },
      },
      "Fallback Agency",
    );

    expect(document.documentVersion).toBe(2);
    expect(document.defaultEngine).toBe("adk2");
    expect(document.settings).toEqual({
      compileMode: "assist",
      compatibilityMode: "hybrid",
      traceLevel: "verbose",
    });
    expect(document.subgraphs).toEqual([
      {
        id: "sg_creative",
        name: "Creative Cluster",
        engine: "adk2",
        entryNodeIds: ["node-1"],
        exitNodeIds: ["node-1"],
        nodeIds: ["node-1"],
        boundaryPolicy: { bridgeMode: "sync" },
      },
    ]);
  });

  it("builds a root subgraph from persisted rows when no subgraphs exist", () => {
    const document = buildAgencyDocumentFromRows({
      agency: {
        name: "Persisted Agency",
      },
      nodes: [
        {
          id: "agent-1",
          name: "Researcher",
          nodeType: "agent",
          isEntryPoint: true,
        },
      ],
      edges: [],
      subgraphs: [],
    });

    expect(document.documentVersion).toBe(1);
    expect(document.settings.compileMode).toBe(AGENCY_DEFAULT_COMPILE_MODE);
    expect(document.subgraphs).toEqual([
      {
        id: "sg_root_legacy",
        name: "Legacy Agency Root",
        engine: AGENCY_DEFAULT_ENGINE,
        entryNodeIds: ["agent-1"],
        exitNodeIds: ["agent-1"],
        nodeIds: ["agent-1"],
        boundaryPolicy: null,
      },
    ]);
  });

  it("builds a v2 version snapshot when hybrid metadata must persist", () => {
    const snapshot = buildAgencyVersionSnapshot(
      {
        documentVersion: 2,
        name: "Hybrid Agency",
        defaultEngine: "adk2",
        nodes: [
          {
            id: "node-1",
            name: "Creative Router",
            nodeType: "router",
            subgraphId: "sg_creative",
            engineHint: "adk2",
            runtimeConfig: { timeoutMs: 30_000 },
          },
        ],
        edges: [],
        subgraphs: [
          {
            id: "sg_creative",
            name: "Creative Cluster",
            engine: "adk2",
            entryNodeIds: ["node-1"],
            exitNodeIds: ["node-1"],
            nodeIds: ["node-1"],
            boundaryPolicy: null,
          },
        ],
        settings: {
          compileMode: AGENCY_STRICT_COMPILE_MODE,
          compatibilityMode: "hybrid",
          traceLevel: "standard",
        },
      },
      { persistAsDocumentV2: true },
    );

    expect(snapshot).toEqual({
      documentVersion: 2,
      name: "Hybrid Agency",
      defaultEngine: "adk2",
      nodes: [
        {
          id: "node-1",
          name: "Creative Router",
          nodeType: "router",
          subgraphId: "sg_creative",
          engineHint: "adk2",
          runtimeConfig: { timeoutMs: 30_000 },
        },
      ],
      edges: [],
      subgraphs: [
        {
          id: "sg_creative",
          name: "Creative Cluster",
          engine: "adk2",
          entryNodeIds: ["node-1"],
          exitNodeIds: ["node-1"],
          nodeIds: ["node-1"],
          boundaryPolicy: null,
        },
      ],
      settings: {
        compileMode: AGENCY_STRICT_COMPILE_MODE,
        compatibilityMode: "hybrid",
        traceLevel: "standard",
      },
    });
  });

  it("detects when a save must persist the full document v2 shape", () => {
    expect(
      shouldPersistAgencyDocumentV2({
        nodes: [
          {
            name: "Creative Router",
            subgraphId: "sg_creative",
          },
        ],
      }),
    ).toBe(true);

    expect(
      shouldPersistAgencyDocumentV2({
        defaultEngine: AGENCY_DEFAULT_ENGINE,
        compileMode: AGENCY_DEFAULT_COMPILE_MODE,
        compatibilityMode: AGENCY_DEFAULT_COMPATIBILITY_MODE,
        nodes: [
          {
            name: "Researcher",
          },
        ],
      }),
    ).toBe(false);
  });
});
