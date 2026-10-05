/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminIntelligenceRegistry from "../AdminIntelligenceRegistry";

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn(),
  refetch: vi.fn(),
  catalogRefetch: vi.fn(),
  query: {
    data: [] as any[],
    isLoading: false,
    isFetching: false,
    isError: false,
  },
  catalog: {
    data: {
      sources: [
        {
          sourceId: "th-rid-river-levels",
          displayName: "Royal Irrigation Department — water observations",
          sourceFamily: "RID",
          capabilities: [{ label: "River level observation" }],
          researchUrl: "https://swoc-api-service.rid.go.th/api/docs/",
          researchEvidence: "API_DOCUMENTATION",
        },
      ],
    } as any,
    isLoading: false,
    isFetching: false,
    isError: false,
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/intelligence-registry", mocks.setLocation],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    intelligenceRegistry: {
      listCandidateCatalog: {
        useQuery: () => ({ ...mocks.catalog, refetch: mocks.catalogRefetch }),
      },
      listPendingSources: {
        useQuery: () => ({ ...mocks.query, refetch: mocks.refetch }),
      },
    },
  },
}));
vi.mock("@/i18n", () => ({ i18n: { language: "en" } }));
vi.mock("@astryxdesign/core/Dialog", async () => {
  const React = await import("react");
  return {
    Dialog: ({ isOpen, children }: any) =>
      isOpen
        ? React.createElement("section", { role: "dialog" }, children)
        : null,
    DialogHeader: ({ title, subtitle }: any) =>
      React.createElement(
        "header",
        null,
        React.createElement("h2", null, title),
        React.createElement("p", null, subtitle)
      ),
  };
});

describe("AdminIntelligenceRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query = {
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
    };
    mocks.catalog = {
      data: {
        sources: [
          {
            sourceId: "th-rid-river-levels",
            displayName: "Royal Irrigation Department — water observations",
            sourceFamily: "RID",
            capabilities: [{ label: "River level observation" }],
            researchUrl: "https://swoc-api-service.rid.go.th/api/docs/",
            researchEvidence: "API_DOCUMENTATION",
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    };
  });

  it("shows the researched candidate catalog separately when no proposals are waiting", () => {
    render(<AdminIntelligenceRegistry />);
    expect(screen.getByText("Researched source catalog")).toBeTruthy();
    expect(
      screen.getByText("Royal Irrigation Department — water observations")
    ).toBeTruthy();
    expect(screen.getByLabelText("Candidate · unverified")).toBeTruthy();
    expect(screen.getByText("No source proposals yet")).toBeTruthy();
    expect(screen.getByText(/does not activate or fetch data/i)).toBeTruthy();
  });

  it("shows pending source metadata without presenting it as active", () => {
    mocks.query = {
      data: [
        {
          id: "src-flood",
          canonicalSourceId: "thai-flood-feed",
          providerId: "drr-api",
          independenceGroup: "drr",
          status: "pending_review",
          sourceJson: {
            name: "Flood warnings",
            sourceType: "API",
            rightsPolicyRef: "rights-drr",
          },
          createdAt: new Date("2026-10-02T00:00:00.000Z"),
        },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
    };
    render(<AdminIntelligenceRegistry />);
    expect(screen.getByText("Flood warnings")).toBeTruthy();
    expect(screen.getByText("pending_review")).toBeTruthy();
    expect(screen.getByText("rights-drr")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /approve|activate/i })
    ).toBeNull();
  });

  it("delegates operational source approval to the Spec 260 review route with checklist evidence", async () => {
    const operationalSource = {
      id: "legacy-src-1", sourceRef: "th-rid-levels", displayName: "RID levels", sourceType: "official",
      dataClassification: "general", canonicalOrigin: "https://example.gov.th", independenceGroup: "rid", jurisdictionRef: "TH",
      status: "pending_review", createdAt: "2026-10-01T00:00:00.000Z",
    };
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () => options?.method === "PATCH" ? {} : { items: [operationalSource] },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminIntelligenceRegistry />);
    fireEvent.click(await screen.findByRole("button", { name: "Review and approve" }));
    for (const label of [
      "Verify the HTTPS origin and data owner",
      "Verify the schema and meaning of the data",
      "Verify the update cadence and timestamps",
      "Verify usage rights and redistribution terms",
      "Verify attribution requirements",
      "Verify permitted purpose and geographic scope",
    ]) fireEvent.click(screen.getByRole("checkbox", { name: label }));
    fireEvent.change(screen.getByLabelText("Approval rationale"), { target: { value: "Verified source documents" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve source" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(true));
    const [reviewUrl, reviewOptions] = fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH")!;
    expect(reviewUrl).toBe("/api/operations/emergency/intelligence/sources/legacy-src-1");
    expect(reviewOptions).toMatchObject({ method: "PATCH", credentials: "include" });
    expect(JSON.parse(String(reviewOptions?.body))).toEqual({
      status: "active",
      reason: "Verified source documents [endpoint=verified, schema=verified, cadence=verified, rights=verified, attribution=verified, purpose=verified]",
    });
    expect(await screen.findByText("Source approved")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("keeps refresh available and retries load failures", () => {
    mocks.query = {
      data: [],
      isLoading: false,
      isFetching: false,
      isError: true,
    };
    render(<AdminIntelligenceRegistry />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(mocks.catalogRefetch).toHaveBeenCalledOnce();
  });

  it("opens research evidence and submits a candidate into the real review queue", async () => {
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => ({
      ok: true,
      json: async () => ({ items: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminIntelligenceRegistry />);
    fireEvent.click(
      screen.getByRole("button", { name: "View source details and evidence" })
    );
    expect(
      screen.getByRole("link", {
        name: "https://swoc-api-service.rid.go.th/api/docs/",
      })
    ).toHaveAttribute("href", "https://swoc-api-service.rid.go.th/api/docs/");
    expect(
      screen.getAllByText(
        /Active status alone does not enable automatic data retrieval/i
      ).length
    ).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Send this candidate for review" })
    );
    expect(screen.getByText("Submit source for review")).toBeTruthy();
    expect(screen.getByLabelText("HTTPS source domain")).toHaveValue(
      "https://swoc-api-service.rid.go.th"
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "POST")
      ).toBe(true);
    });
    const [submitUrl, submitOptions] = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "POST"
    )!;
    expect(submitUrl).toContain(
      "/api/operations/emergency/intelligence/sources"
    );
    expect(JSON.parse(String(submitOptions?.body))).toMatchObject({
      sourceRef: "th-rid-river-levels",
      sourceType: "official",
      canonicalOrigin: "https://swoc-api-service.rid.go.th",
      independenceGroup: "RID",
      jurisdictionRef: "TH",
    });
    expect(
      await screen.findByText(
        /Submitted for review\. This source is not connected/i
      )
    ).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("returns to the user dashboard from the page header", () => {
    render(<AdminIntelligenceRegistry />);
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(mocks.setLocation).toHaveBeenCalledWith("/dashboard");
  });
});
