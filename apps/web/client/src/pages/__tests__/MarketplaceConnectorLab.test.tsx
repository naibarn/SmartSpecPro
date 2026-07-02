/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MarketplaceConnectorLab, {
  buildFieldCoverage,
  createPayloadShapeHash,
  detectUnknownFieldPaths,
} from "../MarketplaceConnectorLab";
import MarketplaceConnectorConnect from "../MarketplaceConnectorConnect";

const saveFieldSampleMutateMock = vi.hoisted(() => vi.fn());
const createSnapshotMutateMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: vi.fn(() => true),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketplaceIntelligence: {
      saveFieldSample: {
        useMutation: (options: any) => ({
          mutate: (input: unknown) => {
            saveFieldSampleMutateMock(input);
            options?.onSuccess?.({ fieldSample: { id: "mcfs_test" } });
          },
          isPending: false,
        }),
      },
      createSnapshotFromProbe: {
        useMutation: (options: any) => ({
          mutate: (input: unknown) => {
            createSnapshotMutateMock(input);
            options?.onSuccess?.({ snapshot: { id: "mss_test" } });
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

Object.defineProperty(window.navigator, "clipboard", {
  value: {
    writeText: vi.fn(),
  },
  configurable: true,
});

const windowOpenMock = vi.fn();
Object.defineProperty(window, "open", {
  value: windowOpenMock,
  configurable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/marketplace-connectors/shopee/status") {
      return Promise.resolve(new Response(JSON.stringify({
        provider: "shopee",
        status: "not_connected",
        scopes: [],
        expiresAt: null,
        grantHashPrefix: null,
      }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (url === "/api/marketplace-connectors/shopee/events") {
      return Promise.resolve(new Response(JSON.stringify({ provider: "shopee", events: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    }
    if (url === "/api/marketplace-connectors/shopee/probe") {
      return import("../../../../shared/marketplaceMcpProbeFixture").then(({ createRecordedShopeeMcpProbe }) => (
        new Response(JSON.stringify(createRecordedShopeeMcpProbe({ latencyMs: 12 })), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      ));
    }
    return Promise.resolve(new Response(JSON.stringify({ error: { message: `Unexpected request ${url}` } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }));
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MarketplaceConnectorLab helpers", () => {
  it("creates stable payload shape hashes when values change but structure is the same", () => {
    const first = createPayloadShapeHash({ items: [{ title: "A", price: 1, raw: { itemid: "1" } }] });
    const second = createPayloadShapeHash({ items: [{ title: "B", price: 2, raw: { itemid: "2" } }] });
    const third = createPayloadShapeHash({ items: [{ title: "B", price: 2, raw: { itemid: "2", new_field: true } }] });

    expect(first).toBe(second);
    expect(third).not.toBe(first);
  });

  it("computes field coverage and unknown fields for connector fixtures", () => {
    const items = [{
      rank: 1,
      title: "CGM",
      sellerName: "Seller",
      brand: "Brand",
      price: 100,
      currency: "THB",
      soldCount: 20,
      rating: 4.8,
      reviewCount: 10,
      officialStore: true,
      badges: ["Mall"],
      sourceUrl: "https://example.test/item",
      raw: { campaign_label: "health" },
    }];

    expect(buildFieldCoverage(items)[0]).toMatchObject({ field: "title", covered: 1, total: 1, percent: 100 });
    expect(detectUnknownFieldPaths({
      keyword: "CGM",
      locale: "th-TH",
      region: "TH",
      connectorCapabilityVersion: "test",
      capturedAt: "2026-07-01T00:00:00.000Z",
      items,
    })).toContain("raw.campaign_label");
  });
});

describe("MarketplaceConnectorLab", () => {
  it("renders fixture replay, normalized preview, field coverage, unknown fields, and shape hash", async () => {
    render(<MarketplaceConnectorLab />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/marketplace-connectors/shopee/status"));

    expect(screen.getByRole("heading", { name: /Marketplace Connector Lab/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fixture replay/i }));
    expect(screen.getAllByText("Recorded MCP sample").length).toBeGreaterThan(0);
    expect(screen.getByText(/not live Shopee data/i)).toBeInTheDocument();
    expect(screen.getByText(/psh_/)).toBeInTheDocument();
    expect(screen.getByText("Ottai M8 CGM 1 ครบชุด-พรีเซลล์")).toBeInTheDocument();

    expect(screen.getByText("MCP field discovery")).toBeInTheDocument();
    expect(screen.getByText("item_data.item_card_display_price.price")).toBeInTheDocument();
  });

  it("shows write-back guidance instead of calling a direct live connector when the grant is active", async () => {
    const { toast } = await import("sonner");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/marketplace-connectors/shopee/status") {
        return Promise.resolve(new Response(JSON.stringify({
          provider: "shopee",
          status: "active",
          scopes: ["marketplace.search.read"],
          expiresAt: "2026-07-08T10:00:00.000Z",
          grantHashPrefix: "abc123def456",
        }), { status: 200, headers: { "content-type": "application/json" } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ provider: "shopee", events: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    }));

    render(<MarketplaceConnectorLab />);
    await waitFor(() => expect(screen.getByText("Grant active")).toBeInTheDocument());
    expect(screen.getByText(/Live data must come from the OpenAI-hosted Shopee app/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Keyword"), { target: { value: "notebook" } });
    fireEvent.click(screen.getByRole("button", { name: /Run fixture \/ show write-back note/i }));

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/OpenAI-hosted Shopee app/i));
    });
    expect(fetch).not.toHaveBeenCalledWith("/api/marketplace-connectors/shopee/probe", expect.anything());
  });

  it("blocks live run without an active grant but keeps fixture replay usable", async () => {
    const { toast } = await import("sonner");
    render(<MarketplaceConnectorLab />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/marketplace-connectors/shopee/status"));

    fireEvent.click(screen.getByRole("button", { name: /Run fixture \/ show write-back note/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/active grant/i));
    });

    fireEvent.click(screen.getByRole("button", { name: /Fixture replay/i }));
    fireEvent.click(screen.getByRole("button", { name: /Run fixture \/ show write-back note/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Fixture replay ready");
    });
  });

  it("saves field samples and snapshots through the marketplace intelligence API", async () => {
    const { toast } = await import("sonner");
    render(<MarketplaceConnectorLab />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/marketplace-connectors/shopee/status"));

    fireEvent.click(screen.getByRole("button", { name: /Fixture replay/i }));
    fireEvent.click(screen.getByRole("button", { name: /Run fixture \/ show write-back note/i }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Fixture replay ready");
    });

    fireEvent.click(screen.getByRole("button", { name: /Save fixture/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create snapshot/i }));

    await waitFor(() => {
      expect(saveFieldSampleMutateMock).toHaveBeenCalledWith({ keyword: "CGM", region: "TH", locale: "th-TH", limit: 10, sourceMode: "recorded_sample" });
      expect(createSnapshotMutateMock).toHaveBeenCalledWith({ keyword: "CGM", region: "TH", locale: "th-TH", limit: 10, sourceMode: "recorded_sample" });
      expect(toast.success).toHaveBeenCalledWith("Fixture saved: mcfs_test");
      expect(toast.success).toHaveBeenCalledWith("Snapshot draft created: mss_test");
    });
    expect(screen.getByText("mss_test")).toBeInTheDocument();
  });
});

describe("MarketplaceConnectorConnect", () => {
  it("shows browser authorization, revoke, and lab navigation", async () => {
    const { toast } = await import("sonner");
    let connectorState = {
      provider: "shopee",
      status: "not_connected",
      scopes: [] as string[],
      expiresAt: null as string | null,
      revokedAt: null as string | null,
      grantHashPrefix: null as string | null,
      authorizationAttemptId: null as string | null,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      if (url === "/api/marketplace-connectors/shopee/status" && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(connectorState), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      if (url === "/api/marketplace-connectors/shopee/events" && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify({ provider: "shopee", events: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      if (url === "/api/marketplace-connectors/shopee/authorize/start" && method === "POST") {
        connectorState = {
          provider: "shopee",
          status: "pending",
          scopes: ["marketplace.search.read"],
          expiresAt: "2026-07-01T10:00:00.000Z",
          revokedAt: null,
          grantHashPrefix: null,
          authorizationAttemptId: "attempt-1",
        };
        return Promise.resolve(new Response(JSON.stringify({
          ...connectorState,
          authorizationUrl: "https://example.test/shopee-authorize",
        }), { status: 200, headers: { "content-type": "application/json" } }));
      }
      if (url === "/api/marketplace-connectors/shopee/authorize/complete" && method === "POST") {
        connectorState = {
          provider: "shopee",
          status: "active",
          scopes: ["marketplace.search.read"],
          expiresAt: "2026-07-08T10:00:00.000Z",
          revokedAt: null,
          grantHashPrefix: "abc123def456",
          authorizationAttemptId: null,
        };
        return Promise.resolve(new Response(JSON.stringify(connectorState), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      if (url === "/api/marketplace-connectors/shopee/revoke" && method === "POST") {
        connectorState = {
          provider: "shopee",
          status: "revoked",
          scopes: ["marketplace.search.read"],
          expiresAt: null,
          revokedAt: "2026-07-01T10:30:00.000Z",
          grantHashPrefix: "abc123def456",
          authorizationAttemptId: null,
        };
        return Promise.resolve(new Response(JSON.stringify(connectorState), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: { message: `Unexpected request ${method} ${url}` } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketplaceConnectorConnect />);

    expect(screen.getByRole("heading", { name: /Connect Shopee Connector/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /Authorize in browser/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/marketplace-connectors/shopee/authorize/start", expect.objectContaining({
        method: "POST",
      }));
      expect(windowOpenMock).toHaveBeenCalledWith("https://example.test/shopee-authorize", "_blank", "noopener,noreferrer");
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Authorization page opened/i));
    });
    expect(screen.getAllByText("Authorization page opened").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText("marketplace.search.read")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /I completed provider authorization/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/marketplace-connectors/shopee/authorize/complete", expect.objectContaining({
        method: "POST",
      }));
      expect(toast.success).toHaveBeenCalledWith("Connector grant confirmed in SmartSpecPro");
      expect(screen.getAllByText("Connected").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("abc123def456")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Revoke access/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Access revoked"));
    expect(screen.getAllByText("Revoked").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Open Connector Lab/i })).toHaveAttribute("href", "/marketplace-capture/intelligence/connector-lab");
  });

  it("auto-confirms the grant when the authorization handoff is the internal connector page", async () => {
    const { toast } = await import("sonner");
    let connectorState = {
      provider: "shopee",
      status: "not_connected",
      scopes: [] as string[],
      expiresAt: null as string | null,
      revokedAt: null as string | null,
      grantHashPrefix: null as string | null,
      authorizationAttemptId: null as string | null,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      if (url === "/api/marketplace-connectors/shopee/status" && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(connectorState), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      if (url === "/api/marketplace-connectors/shopee/events" && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify({ provider: "shopee", events: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      if (url === "/api/marketplace-connectors/shopee/authorize/start" && method === "POST") {
        connectorState = {
          provider: "shopee",
          status: "pending",
          scopes: ["marketplace.search.read"],
          expiresAt: "2026-07-01T10:00:00.000Z",
          revokedAt: null,
          grantHashPrefix: null,
          authorizationAttemptId: "attempt-1",
        };
        return Promise.resolve(new Response(JSON.stringify({
          ...connectorState,
          authorizationUrl: "/marketplace-capture/intelligence/connect/authorize?provider=shopee",
        }), { status: 200, headers: { "content-type": "application/json" } }));
      }
      if (url === "/api/marketplace-connectors/shopee/authorize/complete" && method === "POST") {
        connectorState = {
          provider: "shopee",
          status: "active",
          scopes: ["marketplace.search.read"],
          expiresAt: "2026-07-08T10:00:00.000Z",
          revokedAt: null,
          grantHashPrefix: "abc123def456",
          authorizationAttemptId: null,
        };
        return Promise.resolve(new Response(JSON.stringify(connectorState), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: { message: `Unexpected request ${method} ${url}` } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketplaceConnectorConnect />);

    await waitFor(() => expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /Authorize in browser/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/marketplace-connectors/shopee/authorize/complete", expect.objectContaining({
        method: "POST",
      }));
      expect(toast.success).toHaveBeenCalledWith("Connector grant confirmed in SmartSpecPro");
      expect(screen.getAllByText("Connected").length).toBeGreaterThan(0);
    });
    expect(windowOpenMock).not.toHaveBeenCalled();
  });
});
