import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { assertBillingActionAuthorized } from "../services/billing/authorization";
import {
  getBillingProfileForUser,
  getInvoiceForUser,
  listInvoicesForUser,
  listSupportRecoveryCasesForUser,
  upsertBillingProfileForUser,
} from "../services/billing/profiles";
import { createTopupCheckout, getTopupPaymentOptions } from "../services/billing/topupService";
import {
  createPromptPayDirectTopup,
  getPromptPayDirectAvailability,
  getPromptPayDirectPaymentForUser,
  resolvePromptPaySlipAccess,
  uploadPromptPaySlip,
} from "../services/billing/promptpayDirectService";
import { listInvoiceDocuments, resolveInvoiceDocumentAccess } from "../services/billing/documentAccess";
import { requestInvoiceReconciliation } from "../services/billing/recovery";
import { getCurrentBillingSubscriptionForUser } from "../services/billing/orchestration";
import {
  disableAutoRenewForUser,
  enableAutoRenewForUser,
  getCurrentSubscriptionPaymentSettingsForUser,
  listPaymentMethodsForUser,
  removePaymentMethodForUser,
  setDefaultPaymentMethodForUser,
} from "../services/billing/paymentMethods";
import {
  confirmPaymentMethodSetup,
  createPaymentMethodSetupIntent,
  getPaymentMethodSetupSessionStatus,
  getBeamCardCapabilityMatrixAsync,
} from "../services/billing/paymentMethodSetup";
import { assertBillingFeatureEnabled } from "../services/billing/featureFlags";
import { assertBillingStepUpIfRequired } from "../services/billing/stepUp";
import { listRenewalAttemptsForSubscription } from "../services/billing/autoRenew";
import { resolveTenantIdVarchar } from "../services/tenantContext";

const nullableTrimmedString = z.string().trim().max(512).optional().nullable();

const billingProfileInputSchema = z.object({
  legalNameTh: nullableTrimmedString,
  legalNameEn: nullableTrimmedString,
  taxId: nullableTrimmedString,
  phone: nullableTrimmedString,
  email: z.string().trim().email().optional().nullable().or(z.literal("").transform(() => null)),
  addressLine1: nullableTrimmedString,
  addressLine2: nullableTrimmedString,
  subdistrict: nullableTrimmedString,
  district: nullableTrimmedString,
  province: nullableTrimmedString,
  postalCode: nullableTrimmedString,
  country: nullableTrimmedString,
  contactName: nullableTrimmedString,
  invoiceNote: z.string().trim().max(2000).optional().nullable(),
});

const consentSnapshotSchema = z.object({
  consentText: z.string().trim().min(1).max(5000),
  locale: z.string().trim().min(2).max(16),
  enrollmentSource: z.string().trim().min(1).max(64).default("billing_center"),
  ipAddress: z.string().trim().max(128).optional().nullable(),
  userAgent: z.string().trim().max(1024).optional().nullable(),
});

const paymentMethodConfirmSchema = z.object({
  setupSessionId: z.string().trim().max(128).optional().nullable(),
  providerCustomerId: z.string().trim().max(128).optional().nullable(),
  providerPaymentMethodId: z.string().trim().min(1).max(128),
  brand: z.string().trim().max(64).optional().nullable(),
  last4: z.string().trim().max(8).optional().nullable(),
  expMonth: z.number().int().min(1).max(12).optional().nullable(),
  expYear: z.number().int().min(2024).max(2100).optional().nullable(),
  cardholderName: z.string().trim().max(256).optional().nullable(),
  setAsDefault: z.boolean().optional(),
  autoRenewEligible: z.boolean().optional(),
  status: z.enum(["active", "requires_verification"]).optional(),
  consentVersion: z.string().trim().max(128).optional().nullable(),
  consentSnapshot: consentSnapshotSchema.optional().nullable(),
});

export const billingRouter = router({
  getPromptPayDirectAvailability: protectedProcedure.query(async () => getPromptPayDirectAvailability()),

  getTopupPaymentOptions: protectedProcedure.query(async () => getTopupPaymentOptions()),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    assertBillingActionAuthorized(
      { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
      "edit_billing_profile",
      { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
    );

    return getBillingProfileForUser(ctx.user.id);
  }),

  upsertProfile: protectedProcedure
    .input(billingProfileInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "edit_billing_profile",
        { ownerUserId: ctx.user.id, tenantId },
      );

      return upsertBillingProfileForUser({
        userId: ctx.user.id,
        actorUserId: ctx.user.id,
        input: {
          ...input,
          tenantId,
        },
      });
    }),

  listInvoices: protectedProcedure.query(async ({ ctx }) => {
    assertBillingActionAuthorized(
      { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
      "view_invoice",
      { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
    );

    return listInvoicesForUser(ctx.user.id);
  }),

  getCurrentSubscription: protectedProcedure.query(async ({ ctx }) => {
    assertBillingActionAuthorized(
      { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
      "view_invoice",
      { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
    );

    return getCurrentBillingSubscriptionForUser(ctx.user.id);
  }),

  listRenewalAttempts: protectedProcedure.query(async ({ ctx }) => {
    assertBillingActionAuthorized(
      { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
      "view_invoice",
      { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
    );

    const subscription = await getCurrentBillingSubscriptionForUser(ctx.user.id);
    if (!subscription) {
      return [];
    }

    return listRenewalAttemptsForSubscription({
      subscriptionId: subscription.id,
      limit: 20,
    });
  }),

  listPaymentMethods: protectedProcedure.query(async ({ ctx }) => {
    assertBillingActionAuthorized(
      { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
      "view_payment_method",
      { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
    );

    return listPaymentMethodsForUser(ctx.user.id);
  }),

  getSubscriptionPaymentSettings: protectedProcedure.query(async ({ ctx }) => {
    assertBillingActionAuthorized(
      { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
      "view_payment_method",
      { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
    );

    return getCurrentSubscriptionPaymentSettingsForUser(ctx.user.id);
  }),

  getPaymentMethodCapabilities: protectedProcedure.query(async ({ ctx }) => {
    assertBillingActionAuthorized(
      { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
      "view_payment_method",
      { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
    );
    return getBeamCardCapabilityMatrixAsync();
  }),

  getPaymentMethodSetupSession: protectedProcedure
    .input(z.object({ setupSessionId: z.string().trim().min(1).max(128) }))
    .query(async ({ ctx, input }) => {
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "view_payment_method",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );
      return getPaymentMethodSetupSessionStatus({
        userId: ctx.user.id,
        setupSessionId: input.setupSessionId,
      });
    }),

  createPaymentMethodSetupIntent: protectedProcedure
    .input(z.object({
      returnUrl: z.string().trim().url().max(2048).optional().nullable(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      await assertBillingFeatureEnabled("BILLING_PHASE2_SAVED_CARDS_ENABLED");
      await assertBillingStepUpIfRequired({ req: ctx.req, action: "manage_payment_method", actorUserId: ctx.user.id });
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "manage_payment_method",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      const currentSettings = await getCurrentSubscriptionPaymentSettingsForUser(ctx.user.id);
      return createPaymentMethodSetupIntent({
        userId: ctx.user.id,
        tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId),
        rolloutCohort: currentSettings?.settings?.rolloutCohort ?? null,
        returnUrl: input?.returnUrl ?? null,
      });
    }),

  confirmPaymentMethodSetup: protectedProcedure
    .input(paymentMethodConfirmSchema)
    .mutation(async ({ ctx, input }) => {
      await assertBillingFeatureEnabled("BILLING_PHASE2_SAVED_CARDS_ENABLED");
      await assertBillingStepUpIfRequired({ req: ctx.req, action: "manage_payment_method", actorUserId: ctx.user.id });
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "manage_payment_method",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      return confirmPaymentMethodSetup({
        userId: ctx.user.id,
        actorUserId: ctx.user.id,
        tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId),
        setupSessionId: input.setupSessionId ?? null,
        providerCustomerId: input.providerCustomerId ?? null,
        providerPaymentMethodId: input.providerPaymentMethodId,
        brand: input.brand ?? null,
        last4: input.last4 ?? null,
        expMonth: input.expMonth ?? null,
        expYear: input.expYear ?? null,
        cardholderName: input.cardholderName ?? null,
        setAsDefault: input.setAsDefault,
        autoRenewEligible: input.autoRenewEligible,
        status: input.status,
        consentVersion: input.consentVersion ?? null,
        consentSnapshotJson: input.consentSnapshot ?? null,
      });
    }),

  setDefaultPaymentMethod: protectedProcedure
    .input(z.object({ paymentMethodId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertBillingStepUpIfRequired({ req: ctx.req, action: "set_default_payment_method", actorUserId: ctx.user.id });
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "set_default_payment_method",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      return setDefaultPaymentMethodForUser({
        userId: ctx.user.id,
        paymentMethodId: input.paymentMethodId,
        actorUserId: ctx.user.id,
      });
    }),

  removePaymentMethod: protectedProcedure
    .input(z.object({ paymentMethodId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "manage_payment_method",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      return removePaymentMethodForUser({
        userId: ctx.user.id,
        paymentMethodId: input.paymentMethodId,
        actorUserId: ctx.user.id,
      });
    }),

  enableAutoRenew: protectedProcedure
    .input(z.object({
      paymentMethodId: z.number().int().positive(),
      consentVersion: z.string().trim().min(1).max(128),
      consentSnapshot: consentSnapshotSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBillingFeatureEnabled("BILLING_PHASE2_AUTO_RENEW_ENABLED");
      await assertBillingStepUpIfRequired({ req: ctx.req, action: "enable_auto_renew", actorUserId: ctx.user.id });
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "enable_auto_renew",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      return enableAutoRenewForUser({
        userId: ctx.user.id,
        actorUserId: ctx.user.id,
        defaultPaymentMethodId: input.paymentMethodId,
        consentVersion: input.consentVersion,
        consentSnapshotJson: input.consentSnapshot,
      });
    }),

  disableAutoRenew: protectedProcedure
    .input(z.object({ reason: z.string().trim().max(1000).optional().nullable() }).optional())
    .mutation(async ({ ctx, input }) => {
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "disable_auto_renew",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      return disableAutoRenewForUser({
        userId: ctx.user.id,
        actorUserId: ctx.user.id,
        reason: input?.reason ?? null,
      });
    }),

  getInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "view_invoice",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      const invoice = await getInvoiceForUser({ invoiceId: input.invoiceId, userId: ctx.user.id });
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      return invoice;
    }),

  createTopupCheckout: protectedProcedure
    .input(z.object({
      packageId: z.number().int().positive(),
      paymentChannel: z.enum(["beam_promptpay", "beam_card", "promptpay_direct_manual"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "edit_billing_profile",
        { ownerUserId: ctx.user.id, tenantId },
      );

      const paymentOptions = await getTopupPaymentOptions();
      if (!paymentOptions.availableChannels.includes(input.paymentChannel)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "วิธีชำระเงินนี้ยังไม่เปิดใช้งานหรือยังตั้งค่าไม่ครบ",
        });
      }

      if (input.paymentChannel === "promptpay_direct_manual") {
        return createPromptPayDirectTopup({
          tenantId,
          userId: ctx.user.id,
          actorUserId: ctx.user.id,
          packageId: input.packageId,
        });
      }

      return createTopupCheckout({
        tenantId,
        userId: ctx.user.id,
        actorUserId: ctx.user.id,
        packageId: input.packageId,
        paymentMethod: input.paymentChannel === "beam_card" ? "card" : "promptpay",
      });
    }),

  getPromptPayDirectPayment: protectedProcedure
    .input(z.object({ paymentId: z.number().int().positive().optional(), invoiceId: z.number().int().positive().optional() }).refine((value) => Boolean(value.paymentId || value.invoiceId), "paymentId or invoiceId is required"))
    .query(async ({ ctx, input }) => {
      const payment = await getPromptPayDirectPaymentForUser({ ...input, userId: ctx.user.id });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
      return payment;
    }),

  uploadPromptPaySlip: protectedProcedure
    .input(z.object({
      paymentId: z.number().int().positive(),
      fileName: z.string().trim().min(1).max(255),
      contentType: z.string().trim().min(1).max(128),
      base64Content: z.string().min(1).max(15_000_000),
      note: z.string().trim().max(1000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => uploadPromptPaySlip({ ...input, userId: ctx.user.id })),

  getPromptPaySlipAccess: protectedProcedure
    .input(z.object({ slipId: z.number().int().positive(), ttlSeconds: z.number().int().min(60).max(3600).optional() }))
    .query(async ({ ctx, input }) => {
      const access = await resolvePromptPaySlipAccess({ slipId: input.slipId, actorUserId: ctx.user.id, isAdmin: false, ttlSeconds: input.ttlSeconds });
      if (!access) throw new TRPCError({ code: "NOT_FOUND", message: "Slip not found" });
      return access;
    }),

  listDocuments: protectedProcedure
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "download_invoice_document",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      const invoice = await getInvoiceForUser({ invoiceId: input.invoiceId, userId: ctx.user.id });
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      return listInvoiceDocuments(invoice.id);
    }),

  getDocumentAccess: protectedProcedure
    .input(z.object({
      invoiceId: z.number().int().positive(),
      documentId: z.number().int().positive(),
      ttlSeconds: z.number().int().min(60).max(3600).optional(),
    }))
    .query(async ({ ctx, input }) => {
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "download_invoice_document",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      const invoice = await getInvoiceForUser({ invoiceId: input.invoiceId, userId: ctx.user.id });
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      const access = await resolveInvoiceDocumentAccess({
        invoiceId: invoice.id,
        documentId: input.documentId,
        ttlSeconds: input.ttlSeconds,
        actorUserId: ctx.user.id,
        actorType: "user",
      });
      if (!access) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }
      return access;
    }),

  refreshInvoiceStatus: protectedProcedure
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "view_invoice",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      const invoice = await getInvoiceForUser({ invoiceId: input.invoiceId, userId: ctx.user.id });
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      return requestInvoiceReconciliation({
        invoiceId: invoice.id,
        actorUserId: ctx.user.id,
      });
    }),

  listRecoveryCases: protectedProcedure
    .input(z.object({
      invoiceId: z.number().int().positive().optional().nullable(),
      limit: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      assertBillingActionAuthorized(
        { id: ctx.user.id, role: ctx.user.role, currentTenantId: ctx.user.currentTenantId, registeredDomain: ctx.user.registeredDomain },
        "view_invoice",
        { ownerUserId: ctx.user.id, tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) },
      );

      if (input.invoiceId) {
        const invoice = await getInvoiceForUser({ invoiceId: input.invoiceId, userId: ctx.user.id });
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
        }
      }

      return listSupportRecoveryCasesForUser({
        userId: ctx.user.id,
        invoiceId: input.invoiceId ?? null,
        limit: input.limit,
      });
    }),
});
