import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { assertBillingActionAuthorized, authorizeBillingAction } from "./authorization";

describe("billing authorization", () => {
  it("allows a user to view their own invoice", () => {
    const decision = authorizeBillingAction(
      { id: 17, role: "user" },
      "view_invoice",
      { ownerUserId: 17, tenantId: "tenant-a" },
    );

    expect(decision).toEqual({
      allowed: true,
      reason: "owner_scope",
    });
  });

  it("allows a user to manage their own payment methods", () => {
    const decision = authorizeBillingAction(
      { id: 17, role: "user" },
      "manage_payment_method",
      { ownerUserId: 17, tenantId: "tenant-a" },
    );

    expect(decision).toEqual({
      allowed: true,
      reason: "owner_scope",
    });
  });

  it("denies a user from viewing another user's invoice", () => {
    const decision = authorizeBillingAction(
      { id: 17, role: "user" },
      "view_invoice",
      { ownerUserId: 42, tenantId: "tenant-a" },
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "owner_mismatch",
    });
  });

  it("allows a domain_admin to view tenant-scoped invoices", () => {
    const decision = authorizeBillingAction(
      { id: 3, role: "domain_admin", currentTenantId: "tenant-a", registeredDomain: "tenant-a.example.com" },
      "view_invoice",
      { ownerUserId: 42, tenantId: "tenant-a", tenantPrimaryDomain: "tenant-a.example.com" },
    );

    expect(decision).toEqual({
      allowed: true,
      reason: "tenant_scope",
    });
  });

  it("denies a domain_admin from viewing another tenant's invoice", () => {
    const decision = authorizeBillingAction(
      { id: 3, role: "domain_admin", currentTenantId: "tenant-a", registeredDomain: "tenant-a.example.com" },
      "view_invoice",
      { ownerUserId: 42, tenantId: "tenant-b", tenantPrimaryDomain: "tenant-b.example.com" },
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "tenant_mismatch",
    });
  });

  it("denies domain_admin manual mark paid in phase 1", () => {
    const decision = authorizeBillingAction(
      { id: 3, role: "domain_admin", currentTenantId: "tenant-a" },
      "manual_mark_paid",
      { tenantId: "tenant-a" },
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "tenant_mismatch",
    });
  });

  it("allows admin privileged recovery actions", () => {
    const decision = authorizeBillingAction(
      { id: 1, role: "admin" },
      "manual_mark_paid",
      { tenantId: "tenant-a" },
    );

    expect(decision).toEqual({
      allowed: true,
      reason: "privileged_role",
    });
  });

  it("allows support_admin to request reconciliation in tenant scope", () => {
    const decision = authorizeBillingAction(
      { id: 9, role: "support_admin", currentTenantId: "tenant-a" },
      "request_reconciliation",
      { tenantId: "tenant-a" },
    );

    expect(decision).toEqual({
      allowed: true,
      reason: "tenant_scope",
    });
  });

  it("denies support_admin from manual mark paid", () => {
    const decision = authorizeBillingAction(
      { id: 9, role: "support_admin", currentTenantId: "tenant-a" },
      "manual_mark_paid",
      { tenantId: "tenant-a" },
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "tenant_mismatch",
    });
  });

  it("allows finance_admin to manual mark paid in tenant scope", () => {
    const decision = authorizeBillingAction(
      { id: 12, role: "finance_admin", currentTenantId: "tenant-a" },
      "manual_mark_paid",
      { tenantId: "tenant-a" },
    );

    expect(decision).toEqual({
      allowed: true,
      reason: "tenant_scope",
    });
  });

  it("allows finance_admin to revoke payment methods in tenant scope", () => {
    const decision = authorizeBillingAction(
      { id: 12, role: "finance_admin", currentTenantId: "tenant-a" },
      "revoke_payment_method",
      { tenantId: "tenant-a" },
    );

    expect(decision).toEqual({
      allowed: true,
      reason: "tenant_scope",
    });
  });

  it("denies billing_admin from revoking payment methods", () => {
    const decision = authorizeBillingAction(
      { id: 22, role: "billing_admin", currentTenantId: "tenant-a" },
      "revoke_payment_method",
      { tenantId: "tenant-a" },
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "tenant_mismatch",
    });
  });

  it("throws forbidden when assert helper blocks privileged action", () => {
    expect(() =>
      assertBillingActionAuthorized(
        { id: 7, role: "user" },
        "manual_mark_paid",
        { tenantId: "tenant-a" },
      ),
    ).toThrowError(TRPCError);
  });
});
