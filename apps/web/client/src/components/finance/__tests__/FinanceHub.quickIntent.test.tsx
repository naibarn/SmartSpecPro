/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { format } from "date-fns";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as useMobile from "@/hooks/useMobile";

beforeEach(() => {
  vi.spyOn(useMobile, "useIsMobile").mockReturnValue(false);
  if (!HTMLElement.prototype.hasPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => false),
    });
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  }
});

const mocks = vi.hoisted(() => {
  const noopInvalidate = vi.fn();
  const toastMock = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };
  const uploadFileMutateAsync = vi.fn(async () => ({
    item: {
      id: 123,
      sourceUrl: "https://cdn.example.com/library/uploads/finance/slip.png",
      title: "slip.png",
      metadata: {
        extracted_text: "สายด่วนโอนเงิน 250 บาท",
      },
    },
  }));
  const ingestFinanceDocumentMutateAsync = vi.fn(async () => ({
    extraction: {
      id: 456,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 123,
      source: "ocr_document",
      idempotencyKey: "finance-ocr:42:123",
      sourceHash: "ocr-hash",
      ocrProvider: "library_upload_pipeline",
      ocrText: "สายด่วนโอนเงิน 250 บาท",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "image/png",
      fileHash: "ocr-hash",
      pageCount: 1,
      sourceMessageId: null,
      allowedScopes: ["user:7"],
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    },
    draft: {
      id: 1001,
      version: 1,
      type: "transfer",
      source: "ocr_document",
      status: "draft",
      confidence: 0.84,
      needsClarification: false,
      missingFields: [],
        payloadJson: {
          amountMinor: 25000,
          currency: "THB",
          categoryCode: "transport",
          merchantName: "Charge Point",
          note: "สายด่วนโอนเงิน 250 บาท",
          occurredAt: "2026-04-10T00:00:00.000Z",
          paymentMethodKind: "bank_account",
          paymentDirection: "both",
          paymentSourceLabel: "SCB Main · ••••1234",
          paymentDestinationLabel: "KBank Blue · ••••5678",
          paymentSourceInstitutionName: "Siam Commercial Bank",
          paymentDestinationInstitutionName: "Kasikornbank",
          paymentInstitutionName: "Siam Commercial Bank",
          paymentAccountNickname: "SCB Main",
          paymentAccountLast4: "1234",
          paymentAccountMaskedIdentifier: "••••1234",
          evidence: [
            {
              field: "paymentSourceInstitutionName",
              value: "Siam Commercial Bank",
              snippet: "source bank Siam Commercial Bank",
              confidence: 0.84,
            },
            {
              field: "paymentDestinationInstitutionName",
              value: "Kasikornbank",
              snippet: "destination bank Kasikornbank",
              confidence: 0.84,
            },
          ],
        },
    },
    libraryItem: {
      id: 123,
      title: "slip.png",
    },
  }));
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
  const updateDraftMutateAsync = vi.fn(async (input: { draftId: number; patch?: Record<string, any> }) => ({
    id: input.draftId,
    type: input.patch?.type ?? "expense",
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
      categoryCode: input.patch?.categoryCode ?? "transport",
      type: input.patch?.type ?? "expense",
      counterpartyName: input.patch?.counterpartyName ?? "Charge Point",
      merchantName: input.patch?.merchantName ?? input.patch?.counterpartyName ?? "Charge Point",
      note: input.patch?.note ?? null,
      occurredAt: input.patch?.occurredAt ?? "2026-04-10T00:00:00.000Z",
      humanReadableSummary: input.patch?.humanReadableSummary ?? null,
      evidence: input.patch?.evidence ?? [],
    },
  }));
  const cancelDraftMutateAsync = vi.fn(async (input: { draftId: number }) => ({
    id: input.draftId,
    type: "expense",
    source: "ocr_document",
    status: "cancelled",
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
      type: "expense",
      counterpartyName: "Charge Point",
      merchantName: "Charge Point",
      note: null,
      occurredAt: "2026-04-10T00:00:00.000Z",
      humanReadableSummary: null,
      evidence: [],
    },
  }));
  const restoreDraftMutateAsync = vi.fn(async (input: { draftId: number }) => ({
    id: input.draftId,
    type: "expense",
    source: "ocr_document",
    status: "draft",
    confidence: 0.84,
    needsClarification: false,
    missingFields: [],
    version: 3,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    payloadJson: {
      amountMinor: 25000,
      currency: "THB",
      categoryCode: "transport",
      type: "expense",
      counterpartyName: "Charge Point",
      merchantName: "Charge Point",
      note: null,
      occurredAt: "2026-04-10T00:00:00.000Z",
      humanReadableSummary: null,
      evidence: [],
    },
  }));
  const voidTransactionMutateAsync = vi.fn(async (input: { transactionId: number; reason?: string }) => ({
    id: input.transactionId,
    type: "expense",
    status: "voided",
    amountMinor: 25000,
    currency: "THB",
    categoryCode: "transport",
    merchantName: "Charge Point",
    source: "ocr_document",
    confidence: 0.91,
    occurredAt: "2026-04-10T00:00:00.000Z",
    voidedAt: "2026-04-10T00:00:00.000Z",
    voidReason: input.reason ?? null,
  }));

  return {
    mockUseUtils: vi.fn(() => ({
      finance: {
        listDrafts: { invalidate: noopInvalidate },
        getDailySummary: { invalidate: noopInvalidate },
        getMonthlySummary: { invalidate: noopInvalidate },
        listTransactions: { invalidate: noopInvalidate },
        listRecurringRules: { invalidate: noopInvalidate },
        listCounterparties: { invalidate: noopInvalidate },
        listPaymentInstitutions: { invalidate: noopInvalidate },
        listPaymentAccounts: { invalidate: noopInvalidate },
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
    mockSemanticDuplicateWarningQuery: vi.fn(),
    mockCounterpartiesQuery: vi.fn(),
    mockMerchantPinCandidatesQuery: vi.fn(() => ({
      data: [],
      isLoading: false,
    })),
    mockPinnedMerchantPresetsQuery: vi.fn(() => ({
      data: [],
      isLoading: false,
    })),
    mockParseTextToDraftMutateAsync: parseTextToDraftMutateAsync,
    mockUpdateDraftMutateAsync: updateDraftMutateAsync,
    mockCancelDraftMutateAsync: cancelDraftMutateAsync,
    mockRestoreDraftMutateAsync: restoreDraftMutateAsync,
    mockVoidTransactionMutateAsync: voidTransactionMutateAsync,
    mockUploadFileMutateAsync: uploadFileMutateAsync,
    mockIngestFinanceDocumentMutateAsync: ingestFinanceDocumentMutateAsync,
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
    toastMock,
  };
});

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, params?: Record<string, string | number> | string) => {
      const defaultValue = typeof params === "string" ? params : undefined;
      const map: Record<string, string> = {
        "dashboard:finance.eyebrow": "การเงินส่วนตัว",
        "dashboard:finance.title": "การเงินส่วนตัว",
        "dashboard:finance.description": "พื้นที่การเงินส่วนตัวสำหรับฉบับร่างจากแชท ใบเสร็จ OCR กฎรายการประจำ และรายงาน",
        "dashboard:finance.quick.title": "ฉบับร่างด่วน",
        "dashboard:finance.quick.description": "พิมพ์บันทึกหรืออัปโหลดใบเสร็จเพื่อแปลงเป็นรายการฉบับร่าง",
        "dashboard:finance.quick.textPlaceholder": "ตัวอย่าง: กินข้าวกับลูกค้า 120 บาท",
        "dashboard:finance.quick.categoryPlaceholder": "คำใบ้หมวดหมู่ เช่น taxi / coffee / rent",
        "dashboard:finance.quick.intentLabel": "ประเภท",
        "dashboard:finance.quick.dateLabel": "วัน",
        "dashboard:finance.quick.timeLabel": "เวลา",
        "dashboard:finance.quick.datetimeHelper": "ใช้วันและเวลาปัจจุบันเป็นค่าเริ่มต้น โดย OCR ของใบเสร็จจะใช้วันที่บนใบเสร็จ และถ้าไม่มีเวลา ระบบจะตั้งเป็น 00:00",
        "dashboard:finance.quick.now": "ตอนนี้",
        "dashboard:finance.quick.intent.auto": "เลือกอัตโนมัติ",
        "dashboard:finance.quick.intent.expense": "รายจ่าย",
        "dashboard:finance.quick.intent.income": "รายรับ",
        "dashboard:finance.quick.intent.transfer": "โอนเงิน",
        "dashboard:finance.quick.addExpense": "เพิ่มรายจ่าย",
        "dashboard:finance.quick.addIncome": "เพิ่มรายรับ",
        "dashboard:finance.quick.parseText": "แปลงข้อความ",
        "dashboard:finance.quick.upload": "อัปโหลดใบเสร็จ",
        "dashboard:finance.quick.voiceInput": "ป้อนด้วยเสียง",
        "dashboard:finance.quick.voiceStop": "หยุดไมค์",
        "dashboard:finance.quick.voiceTranscribing": "กำลังถอดเสียง",
        "dashboard:finance.summary.todayIncome": "รายรับวันนี้",
        "dashboard:finance.summary.todayExpense": "รายจ่ายวันนี้",
        "dashboard:finance.summary.monthBalance": "ยอดคงเหลือเดือนนี้",
        "dashboard:finance.summary.openDrafts": "ฉบับร่างที่เปิดอยู่",
        "dashboard:finance.drafts.title": "ฉบับร่าง",
        "dashboard:finance.drafts.empty": "ยังไม่มีฉบับร่างที่เปิดอยู่",
        "dashboard:finance.drafts.editSectionTitle": "แก้ไขวันและเวลา",
        "dashboard:finance.drafts.editDescription": "ปรับวันหรือเวลาของ OCR ก่อนยืนยันฉบับร่างนี้",
        "dashboard:finance.drafts.editDateLabel": "วันที่ของฉบับร่าง",
        "dashboard:finance.drafts.editTimeLabel": "เวลาของฉบับร่าง",
        "dashboard:finance.drafts.resetToOriginal": "รีเซ็ต",
        "dashboard:finance.drafts.saveEdit": "บันทึกวัน/เวลา",
        "dashboard:finance.drafts.editSaving": "กำลังบันทึกวันและเวลาของฉบับร่าง...",
        "dashboard:finance.drafts.editSaved": "บันทึกวันและเวลาของฉบับร่างแล้ว",
        "dashboard:finance.drafts.editError": "ไม่สามารถบันทึกวันและเวลาของฉบับร่างได้",
        "dashboard:finance.transactions.title": "รายการล่าสุด",
        "dashboard:finance.transactions.empty": "ยังไม่มีรายการที่ยืนยันแล้ว",
        "dashboard:finance.recurring.title": "กฎรายการประจำ",
        "dashboard:finance.recurring.empty": "ยังไม่มีกฎรายการประจำที่ใช้งานอยู่",
        "dashboard:finance.report.categoryBreakdown": "สรุปตามหมวดหมู่",
        "dashboard:finance.report.categoryBreakdownDescription": "รายจ่ายที่ยืนยันแล้วของเดือนนี้แยกตามหมวดหมู่",
        "dashboard:finance.report.categoryBreakdownEmpty": "ยังไม่มีข้อมูลหมวดหมู่",
        "dashboard:finance.report.evidenceTrail": "เส้นทางหลักฐาน",
        "dashboard:finance.report.evidenceTrailDescription": "ตรวจดูใบเสร็จที่เชื่อมโยงและค้นหาในคลังการเงิน",
        "dashboard:finance.report.evidenceTrailEmpty": "ยังไม่มีหลักฐานที่เชื่อมโยง",
        "dashboard:finance.report.recurringDueSoon": "รายการประจำที่กำลังถึงกำหนด",
        "dashboard:finance.report.recurringDueSoonDescription": "กฎรายการประจำที่จะทำงานในอีกสองสัปดาห์ข้างหน้า",
        "dashboard:finance.report.recurringDueSoonEmpty": "ยังไม่มีรายการประจำที่กำลังถึงกำหนด",
        "dashboard:finance.quick.statusInvalidDateTime": "กรุณาเลือกวันและเวลาที่ถูกต้อง",
        "dashboard:finance.locked.title": "การเงินส่วนตัวถูกล็อก",
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
  toast: mocks.toastMock,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mocks.mockUseUtils,
    chat: {
      getConversation: { useQuery: mocks.mockConversationQuery },
    },
      localAi: {
        analyzeAttachmentAssist: {
          useMutation: vi.fn(() => ({
          mutateAsync: vi.fn(async () => ({
            kind: "document_ocr",
            extractedText: "สายด่วนโอนเงิน 250 บาท",
            caption: null,
            ocrText: "สายด่วนโอนเงิน 250 บาท",
            warning: null,
            searchQuality: "full_text",
            metadata: { ocr_provider: "typhoon_ocr_1_5" },
          })),
          isPending: false,
        })),
      },
    },
    finance: {
      getDailySummary: { useQuery: mocks.mockDailySummaryQuery },
      getMonthlySummary: { useQuery: mocks.mockMonthlySummaryQuery },
      listDrafts: { useQuery: mocks.mockDraftsQuery },
      listTransactions: { useQuery: mocks.mockTransactionsQuery },
      listRecurringRules: { useQuery: mocks.mockRecurringRulesQuery },
      searchFinanceEvidence: { useQuery: mocks.mockEvidenceQuery },
      getSemanticDuplicateWarning: { useQuery: mocks.mockSemanticDuplicateWarningQuery },
      listCounterparties: { useQuery: mocks.mockCounterpartiesQuery },
      listMerchantPinCandidates: { useQuery: mocks.mockMerchantPinCandidatesQuery },
      listPaymentInstitutions: {
        useQuery: vi.fn(() => ({
          data: [
            {
              id: 11,
              displayName: "Siam Commercial Bank",
              normalizedName: "siam commercial bank",
              usageCount: 3,
              lastSeenAt: "2026-04-10T00:00:00.000Z",
              aliases: ["SCB"],
              kind: "bank",
            },
          ],
          isLoading: false,
        })),
      },
      listPaymentAccounts: {
        useQuery: vi.fn(() => ({
          data: [
            {
              id: 21,
              displayLabel: "SCB Main · Siam Commercial Bank · ••••1234 · account",
              nickname: "SCB Main",
              institutionName: "Siam Commercial Bank",
              institutionKind: "bank",
              kind: "bank_account",
              last4: "1234",
              maskedIdentifier: "••••1234",
              usageCount: 4,
              lastSeenAt: "2026-04-10T00:00:00.000Z",
              aliases: ["Main SCB"],
              isPrimary: true,
            },
          ],
          isLoading: false,
        })),
      },
      getSlipMappingPresets: {
        useQuery: vi.fn(() => ({
          data: [
            {
              id: "internal-transfer",
              enabled: true,
              label: "Internal transfer",
              matchText: "โอนเงิน|transfer|transfer slip|bank transfer",
              transactionType: "transfer",
              categoryCode: "transfer.internal",
              counterpartyName: null,
              merchantName: null,
              note: "Internal transfer between bank accounts",
              priority: 110,
            },
            {
              id: "ride-transport",
              enabled: true,
              label: "Ride / transport",
              matchText: "grab|bolt|taxi|รถไฟฟ้า|mrt|bts|เดินทาง|transport|ride",
              transactionType: "expense",
              categoryCode: "transport",
              counterpartyName: null,
              merchantName: null,
              note: "Transport expense",
              priority: 90,
            },
          ],
          isLoading: false,
        })),
      },
      getPinnedMerchantPresets: {
        useQuery: mocks.mockPinnedMerchantPresetsQuery,
      },
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
      cancelDraft: {
        useMutation: vi.fn(() => ({
          mutateAsync: mocks.mockCancelDraftMutateAsync,
          isPending: false,
        })),
      },
      restoreDraft: {
        useMutation: vi.fn(() => ({
          mutateAsync: mocks.mockRestoreDraftMutateAsync,
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
        useMutation: vi.fn(() => ({
          mutateAsync: mocks.mockVoidTransactionMutateAsync,
          isPending: false,
        })),
      },
      pauseRecurringRule: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      resumeRecurringRule: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      ingestFinanceDocument: {
        useMutation: vi.fn(() => ({ mutateAsync: mocks.mockIngestFinanceDocumentMutateAsync, isPending: false })),
      },
      upsertPaymentInstitution: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      upsertPaymentAccount: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      archivePaymentAccount: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
    },
    library: {
      uploadFile: {
        useMutation: vi.fn(() => ({ mutateAsync: mocks.mockUploadFileMutateAsync, isPending: false })),
      },
    },
  },
}));

import { FinanceHub } from "../FinanceHub";

describe("FinanceHub quick intent buttons", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    window.sessionStorage.clear();
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
    mocks.mockSemanticDuplicateWarningQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });
    mocks.mockCounterpartiesQuery.mockReturnValue({
      data: [
        {
          id: 1,
          displayName: "Charge Point",
          normalizedName: "charge point",
          usageCount: 5,
          lastSeenAt: null,
          aliases: ["Charge Point"],
        },
      ],
      isLoading: false,
    });
  });

  it("quick-saves an expense and shows a saved status", async () => {
    render(<FinanceHub conversationId={42} surface="panel" />);

    expect(screen.getByText("เพิ่มบัญชีธนาคารหรือบัตรเครดิต")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText("ตัวอย่าง: กินข้าวกับลูกค้า 120 บาท");
    fireEvent.change(textarea, { target: { value: "จ่ายค่าชาร์จไฟรถยนต์ไฟฟ้า 250 บาท" } });
    fireEvent.change(screen.getByPlaceholderText("คู่ค้า / ผู้รับ / ผู้จ่าย เช่น Starbucks หรือ ACME"), { target: { value: "Charge Point" } });
    fireEvent.change(screen.getByLabelText("วัน"), { target: { value: "2026-04-10" } });
    fireEvent.change(screen.getByLabelText("เวลา"), { target: { value: "15:30" } });

    fireEvent.click(screen.getByRole("button", { name: "เพิ่มรายจ่าย" }));
    const expectedOccurredAt = new Date("2026-04-10T15:30").toISOString();
    expect(textarea).toHaveValue("รายจ่าย: จ่ายค่าชาร์จไฟรถยนต์ไฟฟ้า 250 บาท");
    expect(screen.getByRole("button", { name: "เพิ่มรายจ่าย" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("ประเภท: รายจ่าย")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.mockParseTextToDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          text: "รายจ่าย: จ่ายค่าชาร์จไฟรถยนต์ไฟฟ้า 250 บาท",
          typeHint: "expense",
          categoryHint: null,
          counterpartyName: "Charge Point",
          occurredAt: expectedOccurredAt,
        }),
      );
      expect(mocks.mockConfirmDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          draftId: 99,
        }),
      );
      expect(screen.getByText("บันทึกแล้ว")).toBeInTheDocument();
      expect(screen.getByText("บันทึกลงสมุดการเงินและอัปเดตสรุปด้านบนแล้ว")).toBeInTheDocument();
    });
  });

  it("quick-saves an income and updates the summary status", async () => {
    render(<FinanceHub conversationId={42} surface="panel" />);

    const textarea = screen.getByPlaceholderText("ตัวอย่าง: กินข้าวกับลูกค้า 120 บาท");
    fireEvent.change(textarea, { target: { value: "เงินเดือน 45000 บาท" } });
    fireEvent.change(screen.getByPlaceholderText("คู่ค้า / ผู้รับ / ผู้จ่าย เช่น Starbucks หรือ ACME"), { target: { value: "ACME Payroll" } });
    fireEvent.change(screen.getByLabelText("วัน"), { target: { value: "2026-04-11" } });
    fireEvent.change(screen.getByLabelText("เวลา"), { target: { value: "08:05" } });

    fireEvent.click(screen.getByRole("button", { name: "เพิ่มรายรับ" }));
    const expectedOccurredAt = new Date("2026-04-11T08:05").toISOString();

    await waitFor(() => {
      expect(mocks.mockParseTextToDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          text: "รายรับ: เงินเดือน 45000 บาท",
          typeHint: "income",
          categoryHint: null,
          counterpartyName: "ACME Payroll",
          occurredAt: expectedOccurredAt,
        }),
      );
      expect(mocks.mockConfirmDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          draftId: 99,
        }),
      );
      expect(screen.getByText("บันทึกแล้ว")).toBeInTheDocument();
    });
  });

  it("resets the composer date and time to now", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-04-12T09:45:00.000Z");
    vi.setSystemTime(now);

    render(<FinanceHub conversationId={42} surface="panel" />);

    fireEvent.change(screen.getByLabelText("วัน"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("เวลา"), { target: { value: "07:15" } });
    fireEvent.click(screen.getByRole("button", { name: "ตอนนี้" }));

    expect(screen.getByLabelText("วัน")).toHaveValue(format(now, "yyyy-MM-dd"));
    expect(screen.getByLabelText("เวลา")).toHaveValue(format(now, "HH:mm"));
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

    fireEvent.change(screen.getByLabelText("วันที่ของฉบับร่าง"), { target: { value: "2026-04-11" } });
    fireEvent.change(screen.getByLabelText("เวลาของฉบับร่าง"), { target: { value: "08:15" } });
    fireEvent.change(screen.getByLabelText("คู่ค้า/ผู้เกี่ยวข้อง"), { target: { value: "Bangkok Charge" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกวัน/เวลา" }));

    await waitFor(() => {
      expect(mocks.mockUpdateDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          draftId: 77,
          expectedVersion: 1,
          patch: {
            occurredAt: new Date("2026-04-11T08:15").toISOString(),
            counterpartyName: "Bangkok Charge",
          },
        }),
      );
      expect(screen.getByText("บันทึกวันและเวลาของฉบับร่างแล้ว")).toBeInTheDocument();
    });
  });

  it("lets users cancel an erroneous open draft", async () => {
    const draft = {
      id: 78,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      type: "expense",
      status: "draft",
      source: "ocr_document",
      idempotencyKey: "finance-draft-doc:78",
      sourceHash: "ocr-hash-78",
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

    fireEvent.click(screen.getByRole("button", { name: "ยกเลิกฉบับร่าง" }));
    const cancelButtons = screen.getAllByRole("button", { name: "ยกเลิกฉบับร่าง" });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);

    await waitFor(() => {
      expect(mocks.mockCancelDraftMutateAsync).toHaveBeenCalledWith({
        conversationId: 42,
        draftId: 78,
      });
    });
  });

  it("requires a short reason when voiding a confirmed transaction and remembers the last reason for the session", async () => {
    window.sessionStorage.setItem("finance.confirmedTransactionVoidReason", "duplicate slip");
    mocks.mockTransactionsQuery.mockReturnValue({
      data: [
        {
          id: 901,
          amountMinor: 25000,
          currency: "THB",
          categoryCode: "transport",
          merchantName: "Charge Point",
          counterpartyName: "Charge Point",
          type: "expense",
          status: "confirmed",
          source: "ocr_document",
          occurredAt: "2026-04-10T15:30:00.000Z",
          createdAt: "2026-04-10T15:30:00.000Z",
        },
      ],
      isLoading: false,
    });

    render(<FinanceHub conversationId={42} surface="panel" />);

    fireEvent.click(screen.getByRole("button", { name: /เมนูการจัดการรายการของ Charge Point/i }));
    await waitFor(() => {
      expect(screen.getByText("ลบ / โมฆะ")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("ลบ / โมฆะ"));

    const reasonField = screen.getByLabelText("เหตุผล (จำเป็น)");
    expect(reasonField).toHaveValue("duplicate slip");

    fireEvent.change(reasonField, { target: { value: " duplicate slip - import error " } });
    fireEvent.click(screen.getByRole("button", { name: "ลบ / โมฆะ" }));

    await waitFor(() => {
      expect(mocks.mockVoidTransactionMutateAsync).toHaveBeenCalledWith({
        conversationId: 42,
        transactionId: 901,
        reason: "duplicate slip - import error",
      });
      expect(window.sessionStorage.getItem("finance.confirmedTransactionVoidReason")).toBe("duplicate slip - import error");
    });
  });

  it("shows a semantic duplicate warning before confirming a draft", async () => {
    const draft = {
      id: 77,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      type: "transfer",
      status: "draft",
      source: "ocr_document",
      idempotencyKey: "finance-draft-doc:77",
      sourceHash: "ocr-hash",
      payloadJson: {
        amountMinor: 25000,
        currency: "THB",
        categoryCode: "transfer.internal",
        counterpartyName: "Charge Point",
        merchantName: "Charge Point",
        note: "สายด่วนโอนเงิน 250 บาท",
        occurredAt: "2026-04-10T00:00:00.000Z",
        confidence: 0.84,
        needsClarification: false,
        missingFields: [],
        paymentMethodKind: "bank_account",
        paymentDirection: "both",
        paymentSourceLabel: "SCB Main · Siam Commercial Bank · ••••1234 · account",
        paymentDestinationLabel: "KBank Blue · Kasikornbank · ••••5678 · account",
        paymentSourceInstitutionName: "Siam Commercial Bank",
        paymentDestinationInstitutionName: "Kasikornbank",
        paymentInstitutionName: "Siam Commercial Bank",
        paymentAccountNickname: "SCB Main",
        paymentAccountLast4: "1234",
        paymentAccountMaskedIdentifier: "••••1234",
        paymentSourceName: "นายพงษ์",
        paymentDestinationName: "ร้านค้า",
        slipReference: "C20260410",
        merchantId: "MID123",
        paymentFeeMinor: 0,
        evidence: [],
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
    mocks.mockSemanticDuplicateWarningQuery.mockReturnValue({
      data: {
        sourceKind: "exact_transaction",
        sourceLabel: "Existing confirmed transaction",
        draftId: 77,
        transactionId: 998,
        type: "transfer",
        amountMinor: 25000,
        currency: "THB",
        occurredAt: "2026-04-10T00:00:00.000Z",
        counterpartyName: "Charge Point",
        merchantName: "Charge Point",
        note: "สายด่วนโอนเงิน 250 บาท",
        paymentMethodKind: "bank_account",
        paymentDirection: "both",
        paymentSourceAccountId: null,
        paymentDestinationAccountId: null,
        paymentSourceLabel: "SCB Main · Siam Commercial Bank · ••••1234 · account",
        paymentDestinationLabel: "KBank Blue · Kasikornbank · ••••5678 · account",
        paymentSourceName: "นายพงษ์",
        paymentDestinationName: "ร้านค้า",
        paymentSourceInstitutionName: "Siam Commercial Bank",
        paymentDestinationInstitutionName: "Kasikornbank",
        paymentInstitutionName: "Siam Commercial Bank",
        paymentAccountNickname: "SCB Main",
        paymentAccountLast4: "1234",
        paymentAccountMaskedIdentifier: "••••1234",
        slipReference: "C20260410",
        merchantId: "MID123",
        paymentFeeMinor: 0,
      },
      isLoading: false,
    });

    render(<FinanceHub conversationId={42} surface="panel" />);

    expect(screen.getByText("Possible duplicate slip")).toBeInTheDocument();
    expect(screen.getByText("Existing confirmed transaction")).toBeInTheDocument();
    expect(screen.getByText("Review before confirm")).toBeInTheDocument();
  });

  it("uploads transfer slips with OCR enabled and the correct intent metadata", async () => {
    const { container } = render(<FinanceHub conversationId={42} surface="panel" />);

    expect(screen.getByText("อัปโหลดหลักฐาน")).toBeInTheDocument();
    expect(screen.getByText(/ตัวแปลงสลิปที่ตั้งค่าไว้/i)).toBeInTheDocument();

    const uploadSlipButton = screen.getByRole("button", { name: "อัปโหลดสลิปโอนเงิน" });
    fireEvent.click(uploadSlipButton);

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();

    const file = new File(["slip-image"], "slip.png", { type: "image/png" });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    return waitFor(() => {
      expect(mocks.mockUploadFileMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: "slip.png",
          fileType: "image/png",
          metadata: expect.objectContaining({
            finance_intake: true,
            source: "finance_chat",
            original_file_name: "slip.png",
            finance_capture_intent: "transfer_slip",
            analysis_profile: "document_ocr",
            extracted_text: "สายด่วนโอนเงิน 250 บาท",
            ocr_text: "สายด่วนโอนเงิน 250 บาท",
          }),
        }),
      );
      expect(mocks.mockIngestFinanceDocumentMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          libraryItemId: 123,
          captureIntent: "transfer_slip",
          idempotencyKey: "finance-ocr:42:123",
        }),
      );
      expect(screen.getByText("ประมวลผล slip.png เสร็จแล้ว")).toBeInTheDocument();
      expect(screen.getByText("Typhoon OCR 1.5")).toBeInTheDocument();
      expect(screen.getByText("ตัวอย่างจาก OCR")).toBeInTheDocument();
      expect(screen.getByText("สรุปจาก AI และฟิลด์สำคัญ")).toBeInTheDocument();
      expect(screen.getByText("ฟิลด์หลัก")).toBeInTheDocument();
      expect(screen.getByText(/ความมั่นใจ 84%/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "แสดงรายละเอียด" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "ขยายดูเพิ่มเติม" })).toBeInTheDocument();
    }).then(() => {
      fireEvent.click(screen.getByRole("button", { name: "ขยายดูเพิ่มเติม" }));

      expect(screen.getByRole("button", { name: "ย่อการแสดงผล" })).toBeInTheDocument();
      expect(screen.getByText("สรุปจาก AI และฟิลด์สำคัญ")).toBeInTheDocument();
      expect(screen.getByText("ฟิลด์หลัก")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "แสดงรายละเอียด" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "แสดงรายละเอียด" }));
      expect(screen.getByRole("button", { name: "ซ่อนรายละเอียด" })).toBeInTheDocument();
      expect(screen.getByText("ฟิลด์สำคัญ")).toBeInTheDocument();
      expect(screen.getByText(/ความมั่นใจ\s+84%/i)).toBeInTheDocument();
      expect(screen.getAllByText("ธนาคารผู้โอน").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("ธนาคารผู้รับเงิน").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("Siam Commercial Bank").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("Kasikornbank").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("รายการหลักฐาน")).toBeInTheDocument();
      expect(screen.getByText(/จับได้ 2 รายการหลักฐาน: ธนาคารผู้โอน, ธนาคารผู้รับเงิน/i)).toBeInTheDocument();
      expect(screen.getAllByText(/ธนาคารผู้โอน/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Siam Commercial Bank/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole("link", { name: /เปิดไฟล์ต้นฉบับ/i })).toHaveAttribute(
        "href",
        "https://cdn.example.com/library/uploads/finance/slip.png",
      );
      expect(screen.getByDisplayValue("สายด่วนโอนเงิน 250 บาท")).toBeInTheDocument();
      expect(screen.getByDisplayValue("SCB Main · ••••1234")).toBeInTheDocument();
      expect(screen.getByDisplayValue(/KBank Blue/)).toBeInTheDocument();
      expect(screen.getByDisplayValue("Siam Commercial Bank")).toBeInTheDocument();
      expect(screen.getByDisplayValue("1234")).toBeInTheDocument();
      expect(screen.getByDisplayValue("••••1234")).toBeInTheDocument();
    });
  });

  it("continues upload when the configured slip parser returns no text but provides unified metadata", async () => {
    const analyzeAttachmentAssistMutateAsync = vi.fn(async () => ({
      kind: "document_ocr",
      extractedText: null,
      caption: null,
      ocrText: null,
      warning: "Configured parser returned no text.",
      searchQuality: "metadata_only",
      metadata: {
        ocr_provider: "finance_payin_llm_parser",
        analysis_profile: "finance_payin_llm_parser",
        unified_payin_slip_summary: "สรุปรายการสลิปโอนเงิน\nจำนวนเงิน: 250.00 THB",
        unified_payin_slip_result: {
          transaction: {
            amount: 250,
            currency: "THB",
            transaction_type: "transfer_between_accounts",
          },
        },
      },
    }));

    mocks.mockConversationQuery.mockReturnValue({
      data: { id: 42, projectId: "personal" },
      isLoading: false,
    });
    mocks.mockDraftsQuery.mockReturnValue({ data: [], isLoading: false });

    const localAiMock = (await import("@/lib/trpc")).trpc.localAi;
    localAiMock.analyzeAttachmentAssist.useMutation = vi.fn(() => ({
      mutateAsync: analyzeAttachmentAssistMutateAsync,
      isPending: false,
    })) as any;

    const { container } = render(<FinanceHub conversationId={42} surface="panel" />);

    const uploadSlipButton = screen.getByRole("button", { name: "อัปโหลดสลิปโอนเงิน" });
    fireEvent.click(uploadSlipButton);

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();

    const file = new File(["slip-image"], "slip.png", { type: "image/png" });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mocks.mockUploadFileMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: "slip.png",
          metadata: expect.objectContaining({
            analysis_profile: "finance_payin_llm_parser",
            unified_payin_slip_summary: expect.stringContaining("สรุปรายการสลิปโอนเงิน"),
          }),
        }),
      );
      expect(mocks.mockIngestFinanceDocumentMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          captureIntent: "transfer_slip",
          conversationId: 42,
        }),
      );
      expect(screen.getByText(/ประมวลผล slip\.png เสร็จแล้ว/i)).toBeInTheDocument();
      expect(screen.getByText(/ตัวแปลง LLM/i)).toBeInTheDocument();
    });
  });

  it("applies a suggested slip preset to the current OCR draft", async () => {
    const { container } = render(<FinanceHub conversationId={42} surface="panel" />);

    const uploadSlipButton = screen.getByRole("button", { name: "อัปโหลดสลิปโอนเงิน" });
    fireEvent.click(uploadSlipButton);

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();

    const file = new File(["slip-image"], "slip.png", { type: "image/png" });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ใช้ Internal transfer/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /ใช้ Internal transfer/i }));

    await waitFor(() => {
      expect(mocks.mockUpdateDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          draftId: 1001,
          expectedVersion: 1,
          patch: expect.objectContaining({
            type: "transfer",
            categoryCode: "transfer.internal",
            humanReadableSummary: expect.stringContaining("Internal transfer"),
          }),
        }),
      );
      expect(screen.getByText("ใช้แล้ว: Internal transfer")).toBeInTheDocument();
    });
  });

  it("prefers a frequent merchant pattern before generic presets", async () => {
    mocks.mockPinnedMerchantPresetsQuery.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mocks.mockTransactionsQuery.mockReturnValue({
      data: [
        {
          id: 501,
          merchantName: "Charge Point",
          counterpartyName: "Charge Point",
          categoryCode: "transfer.internal",
          type: "transfer",
          amountMinor: 25000,
          currency: "THB",
          occurredAt: "2026-04-08T10:00:00.000Z",
          createdAt: "2026-04-08T10:00:00.000Z",
        },
        {
          id: 502,
          merchantName: "Charge Point",
          counterpartyName: "Charge Point",
          categoryCode: "transfer.internal",
          type: "transfer",
          amountMinor: 25000,
          currency: "THB",
          occurredAt: "2026-04-09T10:00:00.000Z",
          createdAt: "2026-04-09T10:00:00.000Z",
        },
        {
          id: 503,
          merchantName: "Charge Point",
          counterpartyName: "Charge Point",
          categoryCode: "transfer.internal",
          type: "transfer",
          amountMinor: 25000,
          currency: "THB",
          occurredAt: "2026-04-10T10:00:00.000Z",
          createdAt: "2026-04-10T10:00:00.000Z",
        },
      ],
      isLoading: false,
    });

    const { container } = render(<FinanceHub conversationId={42} surface="panel" />);

    const uploadSlipButton = screen.getByRole("button", { name: "อัปโหลดสลิปโอนเงิน" });
    fireEvent.click(uploadSlipButton);

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();

    const file = new File(["slip-image"], "slip.png", { type: "image/png" });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText("ร้านค้าที่เคยใช้บ่อย")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /ใช้ Charge Point/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /ใช้ Charge Point/i }));

    await waitFor(() => {
      expect(mocks.mockUpdateDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          draftId: 1001,
          expectedVersion: 1,
          patch: expect.objectContaining({
            type: "transfer",
            categoryCode: "transfer.internal",
            counterpartyName: "Charge Point",
            merchantName: "Charge Point",
          }),
        }),
      );
      expect(screen.getByText("ใช้แล้ว: Charge Point")).toBeInTheDocument();
    });
  });

  it("shows pinned merchant presets before history suggestions", async () => {
    mocks.mockPinnedMerchantPresetsQuery.mockReturnValue({
      data: [
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
      isLoading: false,
    });

    const { container } = render(<FinanceHub conversationId={42} surface="panel" />);

    const uploadSlipButton = screen.getByRole("button", { name: "อัปโหลดสลิปโอนเงิน" });
    fireEvent.click(uploadSlipButton);

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();

    const file = new File(["slip-image"], "slip.png", { type: "image/png" });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getAllByText("ร้านค้าปักหมุด").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /ใช้ Charge Point/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /ใช้ Charge Point/i }));

    await waitFor(() => {
      expect(mocks.mockUpdateDraftMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          draftId: 1001,
          expectedVersion: 1,
          patch: expect.objectContaining({
            categoryCode: "transport.fuel",
            counterpartyName: "Charge Point",
            merchantName: "Charge Point",
          }),
        }),
      );
      expect(screen.getAllByText("ใช้แล้ว: Charge Point").length).toBeGreaterThan(0);
    });
  });

  it("shows evidence and transfer details inside one mobile accordion", async () => {
    vi.mocked(useMobile.useIsMobile).mockReturnValue(true);
    try {
      const { container } = render(<FinanceHub conversationId={42} surface="panel" />);

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeTruthy();

      const file = new File(["slip-image"], "slip.png", { type: "image/png" });
      fireEvent.change(fileInput as HTMLInputElement, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByText("หลักฐานและรายละเอียดการโอน")).toBeInTheDocument();
      });

      const mobileCard = screen.getByText("หลักฐานและรายละเอียดการโอน").closest(".rounded-xl");
      expect(mobileCard).toBeTruthy();
      expect(within(mobileCard as HTMLElement).getByRole("button", { name: "แสดงรายละเอียด" })).toBeInTheDocument();
      fireEvent.click(within(mobileCard as HTMLElement).getByRole("button", { name: "แสดงรายละเอียด" }));

      expect(within(mobileCard as HTMLElement).getByRole("button", { name: "ซ่อนรายละเอียด" })).toBeInTheDocument();
      expect(
        within(mobileCard as HTMLElement).getByText(
          /จับได้ 2 รายการหลักฐาน: ธนาคารผู้โอน, ธนาคารผู้รับเงิน • รายการโอน: Siam Commercial Bank · SCB Main → Kasikornbank · KBank Blue/i,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("รายการหลักฐาน")).toBeInTheDocument();
      expect(screen.getByText("รายละเอียดการโอน")).toBeInTheDocument();
    } finally {
      vi.mocked(useMobile.useIsMobile).mockReturnValue(false);
    }
  });

  it("keeps self-transfer slips split into paid-from and received-into preview cards", async () => {
    mocks.mockIngestFinanceDocumentMutateAsync.mockResolvedValueOnce({
      extraction: {
        id: 457,
        tenantId: "tenant-1",
        projectId: "personal",
        ownerUserId: 7,
        libraryItemId: 124,
        source: "ocr_document",
        idempotencyKey: "finance-ocr:42:124",
        sourceHash: "ocr-hash-self-transfer",
        ocrProvider: "library_upload_pipeline",
        ocrText: "โอนจากบัญชีออมทรัพย์ SCB Main 1234 ไปบัญชีกระแสรายวัน SCB Bills 5678",
        ocrJson: {},
        extractedJson: {},
        confidenceJson: {},
        mimeType: "image/png",
        fileHash: "ocr-hash-self-transfer",
        pageCount: 1,
        sourceMessageId: null,
        allowedScopes: ["user:7"],
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      },
      draft: {
        id: 1002,
        type: "transfer",
        source: "ocr_document",
        status: "draft",
        confidence: 0.87,
        needsClarification: false,
        missingFields: [],
        payloadJson: {
          amountMinor: 1200000,
          currency: "THB",
          categoryCode: "transfer",
          merchantName: "Self transfer",
          note: "โอนจากบัญชีออมทรัพย์ SCB Main 1234 ไปบัญชีกระแสรายวัน SCB Bills 5678",
          occurredAt: "2026-04-10T00:00:00.000Z",
          paymentMethodKind: "bank_account",
          paymentDirection: "both",
          paymentSourceLabel: "SCB Main · Siam Commercial Bank · ••••1234 · account",
          paymentDestinationLabel: "SCB Bills · Siam Commercial Bank · ••••5678 · account",
          paymentSourceInstitutionName: "Siam Commercial Bank",
          paymentDestinationInstitutionName: "Siam Commercial Bank",
          paymentInstitutionName: "Siam Commercial Bank",
          paymentAccountNickname: "SCB Main",
          paymentAccountLast4: "1234",
          paymentAccountMaskedIdentifier: "••••1234",
          evidence: [
            {
              field: "paymentSourceInstitutionName",
              value: "Siam Commercial Bank",
              snippet: "source bank Siam Commercial Bank",
              confidence: 0.84,
            },
            {
              field: "paymentDestinationInstitutionName",
              value: "Siam Commercial Bank",
              snippet: "destination bank Siam Commercial Bank",
              confidence: 0.84,
            },
          ],
          sourceUrl: "https://cdn.example.com/library/uploads/finance/self-transfer.png",
          sourceFileName: "self-transfer.png",
        },
      },
      libraryItem: {
        id: 124,
        title: "self-transfer.png",
      },
    });

    const { container } = render(<FinanceHub conversationId={42} surface="panel" />);

    fireEvent.click(screen.getByRole("button", { name: "อัปโหลดสลิปโอนเงิน" }));

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(["slip-image"], "self-transfer.png", { type: "image/png" });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText("ประมวลผล self-transfer.png เสร็จแล้ว")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "ขยายดูเพิ่มเติม" }));

    expect(screen.getByText("โอนระหว่างบัญชีตัวเอง")).toBeInTheDocument();
    expect(screen.getByText("สรุปจาก AI และฟิลด์สำคัญ")).toBeInTheDocument();
    expect(screen.getByText("ฟิลด์หลัก")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "แสดงรายละเอียด" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "แสดงรายละเอียด" }));
    expect(screen.getByRole("button", { name: "ซ่อนรายละเอียด" })).toBeInTheDocument();
    expect(screen.getByText("ฟิลด์สำคัญ")).toBeInTheDocument();
    expect(screen.getByText("ฝั่งผู้โอน")).toBeInTheDocument();
    expect(screen.getByText("ฝั่งผู้รับเงิน")).toBeInTheDocument();
    expect(screen.getByText("เงินออก")).toBeInTheDocument();
    expect(screen.getByText("เงินเข้า")).toBeInTheDocument();
    expect(screen.getAllByText("Siam Commercial Bank").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("ธนาคารผู้โอน").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("ธนาคารผู้รับเงิน").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("SCB Main").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("SCB Bills")).toBeInTheDocument();
    expect(screen.getAllByText("เลขที่ปิดบัง").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("link", { name: /เปิดไฟล์ต้นฉบับ/i })).toHaveAttribute(
      "href",
      "https://cdn.example.com/library/uploads/finance/self-transfer.png",
    );
  });

  it("shows confirmed transaction slip subfields in the full transaction view", async () => {
    mocks.mockTransactionsQuery.mockReturnValue({
      data: [
        {
          id: 501,
          tenantId: "tenant-1",
          projectId: "personal",
          ownerUserId: 7,
          type: "transfer",
          status: "confirmed",
          source: "ocr_document",
          amountMinor: 72600,
          currency: "THB",
          occurredAt: "2026-04-09T09:30:00.000Z",
          categoryCode: "transfer",
          merchantName: "TIKTOKSHOPSELLER",
          counterpartyName: "TIKTOKSHOPSELLER",
          note: "Krungthai transfer slip",
          paymentMethodKind: "bank_account",
          paymentDirection: "both",
          paymentSourceName: "นายพพร จ**",
          paymentDestinationName: "TIKTOKSHOPSELLER",
          paymentSourceInstitutionName: "Krungthai Bank",
          paymentDestinationInstitutionName: "Kasikornbank",
          paymentInstitutionName: "Krungthai Bank",
          paymentSourceLabel: "Krungthai Main · ••••5770",
          paymentDestinationLabel: "TIKTOKSHOPSELLER · ••••3201",
          paymentAccountNickname: "Krungthai Main",
          paymentAccountLast4: "5770",
          paymentAccountMaskedIdentifier: "••••5770",
          slipReference: "C20250429511921197051",
          merchantId: "010555609115211",
          paymentFeeMinor: 0,
          paymentInstrumentConfidence: 0.94,
          sourceUrl: "https://cdn.example.com/library/uploads/finance/slip-20260409.jpg",
          sourceFileName: "slip-20260409.jpg",
          confidence: "0.94",
          idempotencyKey: "finance-confirm:501",
          sourceHash: "slip-hash",
          confirmedFromDraftId: 99,
          recurringRuleId: null,
          sourceMessageId: null,
          sourceLibraryItemId: 123,
          confirmedAt: "2026-04-09T09:35:00.000Z",
          confirmedByUserId: 7,
          voidedAt: null,
          voidedByUserId: null,
          voidReason: null,
          allowedScopes: ["user:7"],
          createdAt: "2026-04-09T09:35:00.000Z",
          updatedAt: "2026-04-09T09:35:00.000Z",
        },
      ],
      isLoading: false,
    });

    render(<FinanceHub conversationId={42} surface="panel" />);

    expect(screen.getByText("รายละเอียดรายการยืนยัน")).toBeInTheDocument();
    expect(screen.getByText("สรุปอ่านง่าย")).toBeInTheDocument();
    expect(
      screen.getAllByText((_, element) => {
        const text = element?.textContent?.replace(/\s+/g, " ") ?? "";
        return text.includes("สรุปสลิป: โอนเงิน") && text.includes("ผู้โอน: Krungthai Bank · Krungthai Main · ••••5770");
      }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("ภาพรวม")).toBeInTheDocument();
    expect(screen.getByText("เส้นทางการจ่าย")).toBeInTheDocument();
    expect(screen.getByText("ข้อมูลสลิป")).toBeInTheDocument();
    expect(screen.getByText("ธนาคารผู้โอน")).toBeInTheDocument();
    expect(screen.getByText("ธนาคารผู้รับเงิน")).toBeInTheDocument();
    expect(screen.getByText("เลขอ้างอิงสลิป")).toBeInTheDocument();
    expect(screen.getByText("รหัสร้านค้า")).toBeInTheDocument();
    expect(screen.getByText("ไฟล์ต้นฉบับ")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /slip-20260409\.jpg/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: /slip-20260409\.jpg/i })[0]).toHaveAttribute(
      "href",
      "https://cdn.example.com/library/uploads/finance/slip-20260409.jpg",
    );
  });

  it("falls back to a readable OCR error message when the backend message is empty", async () => {
    mocks.mockIngestFinanceDocumentMutateAsync.mockRejectedValueOnce(new Error("No message available"));

    const { container } = render(<FinanceHub conversationId={42} surface="panel" />);

    fireEvent.click(screen.getByRole("button", { name: "อัปโหลดสลิปโอนเงิน" }));

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(["slip-image"], "slip.png", { type: "image/png" });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mocks.toastMock.error).toHaveBeenCalledWith("ประมวลผล OCR ใบเสร็จไม่สำเร็จ");
    });
  });
});
