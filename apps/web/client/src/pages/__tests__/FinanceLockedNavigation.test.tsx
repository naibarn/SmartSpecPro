/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setLocationMock = vi.fn();
let mockPath = "/finance";

const mocks = vi.hoisted(() => ({
  getPreferencesUseQuery: vi.fn(() => ({
    data: { privateVault: { enabled: true } },
    isLoading: false,
  })),
  getPersonalConversationUseQuery: vi.fn(() => ({
    data: { id: 42, projectId: "personal" },
    isLoading: false,
  })),
  financeQuery: vi.fn(() => ({ data: [], isLoading: false })),
  searchFinanceEvidenceQuery: vi.fn(() => ({
    data: { searchResults: { results: [] }, linkedDocuments: [] },
    isLoading: false,
    isFetching: false,
  })),
  exportReportPdfMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  genericMutation: vi.fn(() => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false })),
}));

vi.mock("wouter", () => ({
  useLocation: () => [mockPath, setLocationMock] as const,
  useSearch: () => "",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: "42" },
  }),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue ?? key,
    i18n: {
      exists: () => true,
      resolvedLanguage: "en",
      language: "en",
      changeLanguage: vi.fn(),
    },
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => <div data-testid="locale-toggle" />,
}));

vi.mock("@/components/help", () => ({
  HelpButton: () => <button type="button">Help</button>,
}));

vi.mock("framer-motion", () => ({
  motion: {
    header: (props: React.HTMLAttributes<HTMLElement>) => <header {...props} />,
    section: (props: React.HTMLAttributes<HTMLElement>) => <section {...props} />,
  },
}));

vi.mock("@/components/finance/FinanceHub", () => ({
  FinanceHub: () => <div data-testid="finance-hub" />,
}));

vi.mock("@/components/finance/FinanceCounterpartyAutocomplete", () => ({
  FinanceCounterpartyAutocomplete: () => <div data-testid="counterparty-autocomplete" />,
}));

vi.mock("@/lib/privateVault", () => ({
  getPrivateVaultAccessToken: vi.fn(() => null),
  setPrivateVaultAccessToken: vi.fn(),
  clearPrivateVaultAccessToken: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    users: {
      getPreferences: {
        useQuery: mocks.getPreferencesUseQuery,
      },
      unlockPrivateVault: {
        useMutation: mocks.genericMutation,
      },
    },
    chat: {
      getPersonalConversation: {
        useQuery: mocks.getPersonalConversationUseQuery,
      },
      createPersonalConversation: {
        useMutation: mocks.genericMutation,
      },
      getConversation: {
        useQuery: vi.fn(() => ({ data: { id: 42, projectId: "personal" }, isLoading: false })),
      },
    },
    finance: {
      getDailySummary: { useQuery: mocks.financeQuery },
      getMonthlySummary: { useQuery: mocks.financeQuery },
      listDrafts: { useQuery: mocks.financeQuery },
      listTransactions: { useQuery: mocks.financeQuery },
      listRecurringRules: { useQuery: mocks.financeQuery },
      listCounterparties: { useQuery: mocks.financeQuery },
      listPaymentInstitutions: { useQuery: mocks.financeQuery },
      listPaymentAccounts: { useQuery: mocks.financeQuery },
      searchFinanceEvidence: { useQuery: mocks.searchFinanceEvidenceQuery },
      listLinkedDocuments: { useQuery: mocks.financeQuery },
      exportReportPdf: { useMutation: mocks.exportReportPdfMutation },
      parseTextToDraft: { useMutation: mocks.genericMutation },
      confirmDraft: { useMutation: mocks.genericMutation },
      voidTransaction: { useMutation: mocks.genericMutation },
      pauseRecurringRule: { useMutation: mocks.genericMutation },
      resumeRecurringRule: { useMutation: mocks.genericMutation },
      ingestFinanceDocument: { useMutation: mocks.genericMutation },
      upsertPaymentInstitution: { useMutation: mocks.genericMutation },
      upsertPaymentAccount: { useMutation: mocks.genericMutation },
      archivePaymentAccount: { useMutation: mocks.genericMutation },
      updateDraft: { useMutation: mocks.genericMutation },
    },
    library: {
      uploadFile: {
        useMutation: mocks.genericMutation,
      },
    },
  },
}));

import FinancePage from "../Finance";
import FinanceReportsPage from "../FinanceReports";

describe("Finance locked navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPath = "/finance";
  });

  it("blocks the finance workspace behind the private vault gate", () => {
    render(<FinancePage />);

    expect(screen.getByRole("heading", { name: /privateVault\.unlockTitle/i })).toBeInTheDocument();
    expect(screen.queryByTestId("finance-hub")).not.toBeInTheDocument();
    expect(screen.queryByText(/Quick Draft/i)).not.toBeInTheDocument();
  });

  it("blocks finance reports behind the private vault gate", () => {
    mockPath = "/finance/reports";

    render(<FinanceReportsPage />);

    expect(screen.getByRole("heading", { name: /privateVault\.unlockTitle/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /payment accounts/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /category breakdown/i })).not.toBeInTheDocument();
  });
});
