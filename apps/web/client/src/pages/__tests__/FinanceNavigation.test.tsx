/**
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setLocationMock = vi.fn();
let mockPath = "/finance";
const { getPersonalConversationUseQuery } = vi.hoisted(() => ({
  getPersonalConversationUseQuery: vi.fn(() => ({
    data: { id: 42, projectId: "personal" },
    isLoading: false,
  })),
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

vi.mock("@/components/finance/FinanceAccessGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/finance/FinanceHub", () => ({
  FinanceHub: () => <div data-testid="finance-hub" />,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    chat: {
      getPersonalConversation: {
        useQuery: getPersonalConversationUseQuery,
      },
      createPersonalConversation: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
    },
    finance: {
      getDailySummary: {
        useQuery: vi.fn(() => ({ data: { incomeMinor: 0, expenseMinor: 0 }, isLoading: false })),
      },
      getMonthlySummary: {
        useQuery: vi.fn(() => ({ data: { balanceMinor: 0, rangeStart: null, rangeEnd: null }, isLoading: false })),
      },
      listDrafts: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
      listTransactions: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
      listCounterparties: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
      listPaymentInstitutions: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
      listPaymentAccounts: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
      listRecurringRules: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
      searchFinanceEvidence: {
        useQuery: vi.fn(() => ({ data: { searchResults: { results: [] }, linkedDocuments: [] }, isLoading: false, isFetching: false })),
      },
      exportReportPdf: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      listLinkedDocuments: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
      parseTextToDraft: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      confirmDraft: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      voidTransaction: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      pauseRecurringRule: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      resumeRecurringRule: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      ingestFinanceDocument: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
    },
    users: {
      getPreferences: {
        useQuery: vi.fn(() => ({
          data: { privateVault: { enabled: false } },
          isLoading: false,
        })),
      },
      unlockPrivateVault: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
    },
    library: {
      uploadFile: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
    },
  },
}));

import FinancePage from "../Finance";
import FinanceReportsPage from "../FinanceReports";

describe("Finance navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPath = "/finance";
  });

  it("shows a visible back button on the finance workspace", () => {
    render(<FinancePage />);

    expect(screen.getByRole("button", { name: /back to dashboard/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back to dashboard/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/dashboard");
  });

  it("shows a back button on finance reports locked view", () => {
    mockPath = "/finance/reports";
    getPersonalConversationUseQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
    });
    render(<FinanceReportsPage />);

    expect(screen.getByRole("button", { name: /back to dashboard/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back to dashboard/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the finance report surface with range summary and counterparties", () => {
    mockPath = "/finance/reports";

    render(<FinanceReportsPage />);

    expect(screen.getByRole("button", { name: /back to dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/income in range/i)).toBeInTheDocument();
    expect(screen.getByText(/expense in range/i)).toBeInTheDocument();
    expect(screen.getAllByText(/counterparties/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /payment accounts/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /payment institutions/i })).toBeInTheDocument();
  });
});
