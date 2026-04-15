/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);
const googleAiUpdateMutateMock = vi.fn().mockResolvedValue(undefined);
const googleAiTestMutateMock = vi.fn().mockResolvedValue({
  success: true,
  message: "Connection successful",
});
const testConnectionMutateAsyncMock = vi.fn(async (input: { providerId: string }) => ({
  success: true,
  providerId: input.providerId,
  message: "Connection successful",
  elapsedMs: 123,
  rateLimitNote: input.providerId === "typhoon_ocr_1_5"
    ? "Typhoon OCR is capped at 20 requests per minute system-wide."
    : null,
}));
const refetchMock = vi.fn().mockResolvedValue(undefined);
const mockDocumentOcrSettings = [
  { key: "image_ocr_provider", value: "typhoon_ocr_1_5" },
  { key: "pdf_ocr_provider", value: "landingai_ade" },
  { key: "payin_slip_parser_mode", value: "unified_llm_parser" },
  { key: "landingai_ade_api_key", value: "la_key", isConfigured: true },
  { key: "typhoon_ocr_api_key", value: "ty_key", isConfigured: true },
  { key: "ocr_credits_per_page", value: "2" },
  { key: "typhoon_ocr_image_credits", value: "3" },
  { key: "typhoon_ocr_pdf_page_credits", value: "4" },
] as const;
const mockFinanceSettings = [
  {
    key: "slip_mapping_presets",
    value: JSON.stringify({
      version: 1,
      presets: [
        {
          id: "salary-payroll",
          enabled: true,
          label: "Salary / payroll",
          matchText: "salary|payroll|เงินเดือน",
          transactionType: "income",
          categoryCode: "income.salary",
          counterpartyName: "Employer",
          merchantName: "Employer",
          note: "Salary or payroll credit",
          priority: 100,
        },
        {
          id: "ride-transport",
          enabled: true,
          label: "Ride / transport",
          matchText: "grab|bolt|taxi",
          transactionType: "expense",
          categoryCode: "transport",
          counterpartyName: null,
          merchantName: null,
          note: "Transport expense",
          priority: 90,
        },
      ],
    }),
  },
  {
    key: "pinned_merchant_presets",
    value: JSON.stringify({
      version: 1,
      presets: [
        {
          id: "charge-point-pin",
          enabled: true,
          label: "Charge Point",
          matchText: "Charge Point|chargepoint|EV Charge Point",
          transactionType: "expense",
          categoryCode: "transport.fuel",
          counterpartyName: "Charge Point",
          merchantName: "Charge Point",
          note: "EV charging",
          priority: 500,
        },
      ],
    }),
  },
] as const;
const mockGoogleAiSettings = { apiKeyConfigured: true, source: "db" };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      role: "admin",
      currentTenantId: "tenant-1",
    },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    systemSettings: {
      getSettingsByCategory: {
        useQuery: (input?: { category?: string }) => ({
          data: input?.category === "finance" ? mockFinanceSettings : mockDocumentOcrSettings,
          isLoading: false,
          refetch: refetchMock,
        }),
      },
      getGoogleAiSettings: {
        useQuery: () => ({
          data: mockGoogleAiSettings,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      updateGoogleAiSettings: {
        useMutation: () => ({
          mutate: googleAiUpdateMutateMock,
          mutateAsync: googleAiUpdateMutateMock,
          isPending: false,
        }),
      },
      testGoogleAiConnection: {
        useMutation: () => ({
          mutate: googleAiTestMutateMock,
          mutateAsync: googleAiTestMutateMock,
          isPending: false,
        }),
      },
      updateSetting: {
        useMutation: () => ({
          mutateAsync: mutateAsyncMock,
          isPending: false,
        }),
      },
      testDocumentOcrConnection: {
        useMutation: () => ({
          mutateAsync: testConnectionMutateAsyncMock,
          isPending: false,
        }),
      },
    },
    tenantFeatureFlags: {
      getFeatureFlags: {
        useQuery: () => ({
          data: { documentOcrExternalProcessing: false },
          isLoading: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ title, description, children }: any) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));

import DocumentOcrSettingsPanel from "../DocumentOcrSettingsPanel";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DocumentOcrSettingsPanel", () => {
  it("renders configured providers and routing snapshot", () => {
    render(<DocumentOcrSettingsPanel />);

    expect(screen.getByText("Document OCR Settings")).toBeInTheDocument();
    expect(screen.getByText("Deployment-wide")).toBeInTheDocument();
    expect(screen.getByText("Typhoon OCR docs")).toBeInTheDocument();
    expect(screen.getByText("Runtime note")).toBeInTheDocument();
    expect(screen.getByText("Routing overview")).toBeInTheDocument();
    expect(screen.getByText("API-backed OCR")).toBeInTheDocument();
    expect(screen.getAllByText("Ready")).toHaveLength(3);
    expect(screen.getByText("Transfer slip parser mode")).toBeInTheDocument();
    expect(screen.getByText("Transfer slip parser")).toBeInTheDocument();
    expect(screen.getAllByText("Transfer slip parser (installed skill)").length).toBeGreaterThan(0);
    expect(screen.getByText("Transfer slip parsing")).toBeInTheDocument();
    expect(screen.getByText(/Use one flow for transfer-slip images/i)).toBeInTheDocument();
    expect(screen.getByText(/Transfer slip parser replaces OCR for image-based transfer slips/i)).toBeInTheDocument();
    expect(screen.getByText("Provider keys")).toBeInTheDocument();
    expect(screen.getByText("Selected: Typhoon OCR 1.5")).toBeInTheDocument();
    expect(screen.getByText("Selected: LandingAI ADE")).toBeInTheDocument();
    expect(screen.getByText("Google AI OCR key")).toBeInTheDocument();
    expect(screen.getByText("Test Google vision connection")).toBeInTheDocument();
    expect(screen.getByText("Typhoon OCR API key")).toBeInTheDocument();
    expect(screen.getByText("System cap: 20 requests/minute")).toBeInTheDocument();
    expect(screen.getByText("Legacy OCR fallback credits per page")).toBeInTheDocument();
    expect(screen.getAllByText("Native extraction").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Typhoon OCR 1.5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Credits / image")).toHaveLength(3);
    expect(screen.getAllByText("Credits / PDF page")).toHaveLength(3);
    expect(screen.getByText(/Finance slip mapping and merchant pin rules now live on a separate Finance Rules page/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Finance Rules page/i })).toBeInTheDocument();
  });

  it("saves the image OCR provider independently", async () => {
    render(<DocumentOcrSettingsPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Save image provider/i }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "document_ocr",
          key: "image_ocr_provider",
          value: "typhoon_ocr_1_5",
        }),
      );
    });
  });

  it("can clear a configured Typhoon key", async () => {
    render(<DocumentOcrSettingsPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Clear Typhoon key/i }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "document_ocr",
          key: "typhoon_ocr_api_key",
          clear: true,
        }),
      );
    });
  });

  it("can test the configured Typhoon OCR connection", async () => {
    render(<DocumentOcrSettingsPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Test Typhoon connection/i }));

    await waitFor(() => {
      expect(testConnectionMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: "typhoon_ocr_1_5",
        }),
      );
    });

    expect(await screen.findByText("Connection successful")).toBeInTheDocument();
    expect(screen.getByText(/123ms/)).toBeInTheDocument();
    expect(
      screen.getByText("Typhoon OCR is capped at 20 requests per minute system-wide."),
    ).toBeInTheDocument();
  });

  it("can test the configured Google AI vision OCR connection", async () => {
    render(<DocumentOcrSettingsPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Test Google vision connection/i }));

    await waitFor(() => {
      expect(googleAiTestMutateMock).toHaveBeenCalled();
    });
  });

  it("saves provider pricing as image and PDF rates", async () => {
    render(<DocumentOcrSettingsPanel />);

    const typhoonImageInput = screen.getAllByLabelText("Credits / image", { selector: "input" })[0];
    fireEvent.change(typhoonImageInput, { target: { value: "7" } });

    const typhoonPdfInput = screen.getAllByLabelText("Credits / PDF page", { selector: "input" })[0];
    fireEvent.change(typhoonPdfInput, { target: { value: "8" } });

    const saveButtons = screen.getAllByRole("button", { name: /Save pricing/i });
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "document_ocr",
          key: "typhoon_ocr_image_credits",
          value: "7",
        }),
      );
    });

    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "document_ocr",
        key: "typhoon_ocr_pdf_page_credits",
        value: "8",
      }),
    );
  });
});
