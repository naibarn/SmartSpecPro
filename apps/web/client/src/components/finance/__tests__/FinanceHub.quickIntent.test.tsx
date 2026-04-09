/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { format } from "date-fns";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => {
  const noopInvalidate = vi.fn();
  const parseTextToDraftMutateAsync = vi.fn(async () => ({
    id: 99,
    type: "income",
    source: "chat_text",
    status: "draft",
    confidence: 0.91,
    needsClarification: false,
    missingFields: [],
    payloadJson: {
      amountMinor: 25000,
      currency: "THB",
      categoryCode: "transport",
      merchantName: "Charge Point",
      note: null,
      occurredAt: "2026-04-10T00:00:00.000Z",
    },
  }));
  const updateDraftMutateAsync = vi.fn(async (input: { draftId: number; patch?: { occurredAt?: string } }) => ({
    id: input.draftId,
    type: "expense",
    source: "ocr_document",
    status: "draft",
    confidence: 0.84,
    needsClarification: false,
    missingFields: [],
    version: 2,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    payloadJson: {
      amountMinor: 25000,
      currency: "THB",
      categoryCode: "transport",
      merchantName: "Charge Point",
      note: null,
      occurredAt: input.patch?.occurredAt ?? "2026-04-10T00:00:00.000Z",
    },
  }));

  return {
    mockUseUtils: vi.fn(() => ({
      finance: {
        listDrafts: { invalidate: noopInvalidate },
        getDailySummary: { invalidate: noopInvalidate },
        getMonthlySummary: { invalidate: noopInvalidate },
        listTransactions: { invalidate: noopInvalidate },
        listRecurringRules: { invalidate: noopInvalidate },
      },
    })),
    mockConversationQuery: vi.fn(),
    mockDailySummaryQuery: vi.fn(),
    mockMonthlySummaryQuery: vi.fn(),
    mockDraftsQuery: vi.fn(),
    mockTransactionsQuery: vi.fn(),
    mockRecurringRulesQuery: vi.fn(),
    mockMonthlyTransactionsQuery: vi.fn(),
    mockEvidenceQuery: vi.fn(),
    mockParseTextToDraftMutateAsync: parseTextToDraftMutateAsync,
    mockUpdateDraftMutateAsync: updateDraftMutateAsync,
    mockConfirmDraftMutateAsync: vi.fn(async () => ({
      id: 100,
      type: "income",
      status: "confirmed",
      amountMinor: 25000,
      currency: "THB",
      categoryCode: "transport",
      merchantName: "Charge Point",
      source: "chat_text",
      confidence: 0.91,
      occurredAt: "2026-04-10T00:00:00.000Z",
    })),
  };
});

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, params?: Record<string, string | number> | string) => {
      const defaultValue = typeof params === "string" ? params : undefined;
      const map: Record<string, string> = {
        "dashboard:finance.eyebrow": "Private Finance",
        "dashboard:finance.title": "Personal Finance",
        "dashboard:finance.description": "A private, user-scoped finance workspace for chat drafts, OCR receipts, recurring rules, and reports.",
        "dashboard:finance.quick.title": "Quick Draft",
        "dashboard:finance.quick.description": "Type a note or upload a receipt to turn it into a draft transaction.",
        "dashboard:finance.quick.textPlaceholder": "Example: Lunch with client, 120 THB",
        "dashboard:finance.quick.categoryPlaceholder": "Custom category hint, e.g. taxi / coffee / rent",
        "dashboard:finance.quick.intentLabel": "Intent",
        "dashboard:finance.quick.dateLabel": "Date",
        "dashboard:finance.quick.timeLabel": "Time",
        "dashboard:finance.quick.datetimeHelper": "Defaults to the current date and time. OCR receipts use the receipt date and default to 00:00 when time is missing.",
        "dashboard:finance.quick.now": "Now",
        "dashboard:finance.quick.intent.auto": "Auto intent",
        "dashboard:finance.quick.intent.expense": "Expense",
        "dashboard:finance.quick.intent.income": "Income",
        "dashboard:finance.quick.intent.transfer": "Transfer",
        "dashboard:finance.quick.addExpense": "Add Expense",
        "dashboard:finance.quick.addIncome": "Add Income",
        "dashboard:finance.quick.parseText": "Parse Text",
        "dashboard:finance.quick.upload": "Upload Receipt",
        "dashboard:finance.quick.voiceInput": "Voice input",
        "dashboard:finance.quick.voiceStop": "Stop mic",
        "dashboard:finance.quick.voiceTranscribing": "Transcribing",
        "dashboard:finance.summary.todayIncome": "Today income",
        "dashboard:finance.summary.todayExpense": "Today expense",
        "dashboard:finance.summary.monthBalance": "Month balance",
        "dashboard:finance.summary.openDrafts": "Open drafts",
        "dashboard:finance.drafts.title": "Drafts",
        "dashboard:finance.drafts.empty": "No open drafts yet.",
        "dashboard:finance.drafts.editSectionTitle": "Edit date and time",
        "dashboard:finance.drafts.editDescription": "Adjust the OCR date or time before confirming this draft.",
        "dashboard:finance.drafts.editDateLabel": "Draft date",
        "dashboard:finance.drafts.editTimeLabel": "Draft time",
        "dashboard:finance.drafts.resetToOriginal": "Reset",
        "dashboard:finance.drafts.saveEdit": "Save date/time",
        "dashboard:finance.drafts.editSaving": "Saving draft date and time...",
        "dashboard:finance.drafts.editSaved": "Draft date and time saved.",
        "dashboard:finance.drafts.editError": "Could not save draft date and time.",
        "dashboard:finance.transactions.title": "Recent Transactions",
        "dashboard:finance.transactions.empty": "No confirmed transactions yet.",
        "dashboard:finance.recurring.title": "Recurring Rules",
        "dashboard:finance.recurring.empty": "No active recurring rules yet.",
        "dashboard:finance.report.categoryBreakdown": "Category Breakdown",
        "dashboard:finance.report.categoryBreakdownDescription": "This month’s confirmed spend by category.",
        "dashboard:finance.report.categoryBreakdownEmpty": "No category data yet.",
        "dashboard:finance.report.evidenceTrail": "Evidence Trail",
        "dashboard:finance.report.evidenceTrailDescription": "Inspect linked receipts and search the finance library.",
        "dashboard:finance.report.evidenceTrailEmpty": "No linked evidence yet.",
        "dashboard:finance.report.recurringDueSoon": "Recurring Due Soon",
        "dashboard:finance.report.recurringDueSoonDescription": "Recurring rules that should run in the next two weeks.",
        "dashboard:finance.report.recurringDueSoonEmpty": "No recurring items due soon.",
        "dashboard:finance.quick.statusInvalidDateTime": "Please choose a valid date and time.",
        "dashboard:finance.locked.title": "Personal finance is locked",
        "dashboard:finance.locked.description": "Open a personal chat to keep receipts, drafts, and reports isolated from work conversations.",
        "dashboard:finance.locked.createPersonal": "Create Personal Chat",
        "dashboard:finance.locked.openPanel": "Open Finance Panel",
        "dashboard:finance.openPanel": "Open Finance Panel",
      };
      return map[key] ?? defaultValue ?? key;
    },
  }),
}));

vi.mock("@/hooks/usePushToTalk", () => ({
  usePushToTalk: () => ({
    isRecording: false,
    isTranscribing: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mocks.mockUseUtils,
    chat: {
      getConversation: { useQuery: mocks.mockConversationQuery },
    },
    finance: {
      getDailySummary: { useQuery: mocks.mockDailySummaryQuery },
      getMonthlySummary: { useQuery: mocks.mockMonthlySummaryQuery },
      listDrafts: { useQuery: mocks.mockDraftsQuery },
      listTransactions: { useQuery: mocks.mockTransactionsQuery },
      listRecurringRules: { useQuery: mocks.mockRecurringRulesQuery },
      searchFinanceEvidence: { useQuery: mocks.mockEvidenceQuery },
      parseTextToDraft: {
        useMutation: vi.fn(() => ({
          mutateAsync: mocks.mockParseTextToDraftMutateAsync,
          isPending: false,
        })),
      },
      updateDraft: {
        useMutation: vi.fn(() => ({
          mutateAsync: mocks.mockUpdateDraftMutateAsync,
          isPending: false,
        })),
      },
      confirmDraft: {
        useMutation: vi.fn(() => ({
          mutateAsync: mocks.mockConfirmDraftMutateAsync,
          isPending: false,
        })),
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
    library: {
      uploadFile: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
    },
  },
}));

import { FinanceHub } from "../FinanceHub";

describe("FinanceHub quick intent buttons", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.mockConversationQuery.mockReturnValue({
      data: { id: 42, projectId: "personal" },
      isLoading: false,
    });
    mocks.mockDailySummaryQuery.mockReturnValue({
      data: { incomeMinor: 0, expenseMinor: 0 },
      isLoading: false,
    });
    mocks.mockMonthlySummaryQuery.mockReturnValue({
      data: {
        balanceMinor: 0,
        rangeStart: "2026-04-01T00:00:00.000Z",
        rangeEnd: "2026-04-30T23:59:59.999Z",
      },
      isLoading: false,
    });
    mocks.mockDraftsQuery.mockReturnValue({ data: [], isLoading: false });
    mocks.mockTransactionsQuery.mockReturnValue({ data: [], isLoading: false });
    mocks.mockRecurringRulesQuery.mockReturnValue({ data: [], isLoading: false });
    mocks.mockMonthlyTransactionsQuery.mockReturnValue({ data: [], isLoading: false });
    mocks.mockEvidenceQuery.mockReturnValue({
      data: { searchResults: { results: [] }, linkedDocuments: [] },
      isLoading: false,
    });
  });

  it("quick-saves an expense and shows a saved status", async () => {
    render(<FinanceHub conversationId={42} surface="panel" />);

    const textarea = screen.getByPlaceholderText("Example: Lunch with client, 120 THB");
    fireEvent.change(textarea, { target: { value: "จ่ายค่าชาร์จไฟรถยนต์ไฟฟ้า 250 บาท" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "15:30" } });

    fireEvent.click(screen.getByRole("button", { name: "Add Expense" }));
    const expectedOccurredAt = new Date("2026-04-10T15:30").toISOString();
    expect(textarea).toHaveValue("Expense: จ่ายค่าชาร์จไฟรถยนต์ไฟฟ้า 250 บาท");
    expect(screen.getByRole("button", { name: "Add Expense" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Intent: Expense")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.mockParseTextToDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          text: "Expense: จ่ายค่าชาร์จไฟรถยนต์ไฟฟ้า 250 บาท",
          typeHint: "expense",
          categoryHint: null,
          occurredAt: expectedOccurredAt,
        }),
      );
      expect(mocks.mockConfirmDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          draftId: 99,
        }),
      );
      expect(screen.getByText("Saved")).toBeInTheDocument();
      expect(screen.getByText("Saved to your finance log and updated the summary above.")).toBeInTheDocument();
    });
  });

  it("quick-saves an income and updates the summary status", async () => {
    render(<FinanceHub conversationId={42} surface="panel" />);

    const textarea = screen.getByPlaceholderText("Example: Lunch with client, 120 THB");
    fireEvent.change(textarea, { target: { value: "เงินเดือน 45000 บาท" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-04-11" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "08:05" } });

    fireEvent.click(screen.getByRole("button", { name: "Add Income" }));
    const expectedOccurredAt = new Date("2026-04-11T08:05").toISOString();

    await waitFor(() => {
      expect(mocks.mockParseTextToDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          text: "Income: เงินเดือน 45000 บาท",
          typeHint: "income",
          categoryHint: null,
          occurredAt: expectedOccurredAt,
        }),
      );
      expect(mocks.mockConfirmDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          draftId: 99,
        }),
      );
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  it("resets the composer date and time to now", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-04-12T09:45:00.000Z");
    vi.setSystemTime(now);

    render(<FinanceHub conversationId={42} surface="panel" />);

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "07:15" } });
    fireEvent.click(screen.getByRole("button", { name: "Now" }));

    expect(screen.getByLabelText("Date")).toHaveValue(format(now, "yyyy-MM-dd"));
    expect(screen.getByLabelText("Time")).toHaveValue(format(now, "HH:mm"));
  });

  it("lets OCR drafts edit their date and time inline", async () => {
    const draft = {
      id: 77,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      type: "expense",
      status: "draft",
      source: "ocr_document",
      idempotencyKey: "finance-draft-doc:77",
      sourceHash: "ocr-hash",
      payloadJson: {
        amountMinor: 25000,
        currency: "THB",
        categoryCode: "transport",
        merchantName: "Charge Point",
        note: null,
        occurredAt: "2026-04-10T00:00:00.000Z",
        confidence: 0.84,
        needsClarification: false,
        missingFields: [],
        version: 1,
      },
      missingFields: [],
      confidence: "0.84",
      needsClarification: false,
      clarificationPrompt: null,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      recurringRuleId: null,
      expiresAt: new Date("2026-05-10T00:00:00.000Z"),
      allowedScopes: ["user:7"],
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      version: 1,
    } as any;

    mocks.mockDraftsQuery.mockReturnValue({ data: [draft], isLoading: false });

    render(<FinanceHub conversationId={42} surface="panel" />);

    fireEvent.change(screen.getByLabelText("Draft date"), { target: { value: "2026-04-11" } });
    fireEvent.change(screen.getByLabelText("Draft time"), { target: { value: "08:15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save date/time" }));

    await waitFor(() => {
      expect(mocks.mockUpdateDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          draftId: 77,
          expectedVersion: 1,
          patch: {
            occurredAt: new Date("2026-04-11T08:15").toISOString(),
          },
        }),
      );
      expect(screen.getByText("Draft date and time saved.")).toBeInTheDocument();
    });
  });
});
