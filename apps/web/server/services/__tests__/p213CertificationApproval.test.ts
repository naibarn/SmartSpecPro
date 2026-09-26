import { afterEach, describe, expect, it } from "vitest";

import {
  buildP213CertificationDescriptor,
  classifyP213ApprovalDecision,
  isP213CertificationDescriptor,
  assertP213CertificationAdmission,
  isP213CertificationRequester,
} from "../p213CertificationApproval";

const originalMode = process.env.P213_CERTIFICATION_MODE;
const originalTenant = process.env.P213_CERTIFICATION_TENANT_ID;
const originalRequester = process.env.P213_CERTIFICATION_REQUESTER_USER_ID;
const originalApprover = process.env.P213_CERTIFICATION_APPROVER_USER_ID;
const originalProject = process.env.P213_CERTIFICATION_PROJECT_REF;

afterEach(() => {
  if (originalMode === undefined) delete process.env.P213_CERTIFICATION_MODE;
  else process.env.P213_CERTIFICATION_MODE = originalMode;
  if (originalTenant === undefined) delete process.env.P213_CERTIFICATION_TENANT_ID;
  else process.env.P213_CERTIFICATION_TENANT_ID = originalTenant;
  if (originalRequester === undefined) delete process.env.P213_CERTIFICATION_REQUESTER_USER_ID;
  else process.env.P213_CERTIFICATION_REQUESTER_USER_ID = originalRequester;
  if (originalApprover === undefined) delete process.env.P213_CERTIFICATION_APPROVER_USER_ID;
  else process.env.P213_CERTIFICATION_APPROVER_USER_ID = originalApprover;
  if (originalProject === undefined) delete process.env.P213_CERTIFICATION_PROJECT_REF;
  else process.env.P213_CERTIFICATION_PROJECT_REF = originalProject;
});

const allowDecision = {
  version: "2026-03-10" as const,
  tenantId: "tenant-p213",
  userId: 109,
  workflowId: 0,
  executionId: "job-p213",
  traceId: "trace-p213",
  actionType: "click",
  actionClass: "read" as const,
  pageSensitivity: "none" as const,
  decision: "allow" as const,
  reasonCodes: [],
  confidence: 1,
  riskScore: 0,
  evidence: { actionDigest: "decision:sha256:p213" },
  approval: { required: false },
};

describe("P213 certification approval boundary", () => {
  it("constructs the marker only when the server-side mode, tenant, and requester guards match", () => {
    process.env.P213_CERTIFICATION_MODE = "true";
    process.env.P213_CERTIFICATION_TENANT_ID = "tenant-p213";
    process.env.P213_CERTIFICATION_REQUESTER_USER_ID = "109";
    process.env.P213_CERTIFICATION_APPROVER_USER_ID = "1";
    process.env.P213_CERTIFICATION_PROJECT_REF = "p213-certification";

    const descriptor = buildP213CertificationDescriptor({ tenantId: "tenant-p213", requesterId: 109, projectRef: "p213-certification" });

    expect(descriptor).toEqual(expect.objectContaining({
      purpose: "p213_certification",
      fixture: "approval_required",
      riskClass: "explicit_approval_test",
      tenantId: "tenant-p213",
      requesterId: 109,
      issuedBy: "server",
    }));
    expect(isP213CertificationDescriptor(descriptor)).toBe(true);
  });

  it("fails closed when the server has no scoped project or distinct approver guard", () => {
    process.env.P213_CERTIFICATION_MODE = "true";
    process.env.P213_CERTIFICATION_TENANT_ID = "tenant-p213";
    process.env.P213_CERTIFICATION_REQUESTER_USER_ID = "109";
    process.env.P213_CERTIFICATION_PROJECT_REF = "p213-certification";

    expect(() => assertP213CertificationAdmission({
      tenantId: "tenant-p213",
      requesterId: 109,
      projectRef: "p213-certification",
    })).toThrow("P213_CERTIFICATION_APPROVER_NOT_CONFIGURED");

    process.env.P213_CERTIFICATION_APPROVER_USER_ID = "109";
    expect(() => assertP213CertificationAdmission({
      tenantId: "tenant-p213",
      requesterId: 109,
      projectRef: "p213-certification",
    })).toThrow("P213_CERTIFICATION_APPROVER_MUST_BE_DISTINCT");
  });

  it("accepts only a configured project and a distinct server-side approver", () => {
    process.env.P213_CERTIFICATION_MODE = "true";
    process.env.P213_CERTIFICATION_TENANT_ID = "tenant-p213";
    process.env.P213_CERTIFICATION_REQUESTER_USER_ID = "109";
    process.env.P213_CERTIFICATION_APPROVER_USER_ID = "1";
    process.env.P213_CERTIFICATION_PROJECT_REF = "p213-certification";

    expect(assertP213CertificationAdmission({
      tenantId: "tenant-p213",
      requesterId: 109,
      projectRef: "p213-certification",
    })).toEqual({ approverId: 1, projectRef: "p213-certification" });

    expect(() => assertP213CertificationAdmission({
      tenantId: "tenant-p213",
      requesterId: 109,
      projectRef: "other-project",
    })).toThrow("P213_CERTIFICATION_PROJECT_MISMATCH");
  });

  it("fails closed when certification mode is disabled", () => {
    process.env.P213_CERTIFICATION_MODE = "false";
    process.env.P213_CERTIFICATION_TENANT_ID = "tenant-p213";
    process.env.P213_CERTIFICATION_REQUESTER_USER_ID = "109";
    process.env.P213_CERTIFICATION_APPROVER_USER_ID = "1";
    process.env.P213_CERTIFICATION_PROJECT_REF = "p213-certification";

    expect(() => assertP213CertificationAdmission({
      tenantId: "tenant-p213",
      requesterId: 109,
      projectRef: "p213-certification",
    })).toThrow("P213_CERTIFICATION_MODE_DISABLED");
  });

  it("admits only the configured requester identity for the certification-scoped route", () => {
    process.env.P213_CERTIFICATION_MODE = "true";
    process.env.P213_CERTIFICATION_TENANT_ID = "tenant-p213";
    process.env.P213_CERTIFICATION_REQUESTER_USER_ID = "109";
    process.env.P213_CERTIFICATION_APPROVER_USER_ID = "1";
    process.env.P213_CERTIFICATION_PROJECT_REF = "p213-certification";

    expect(isP213CertificationRequester({
      tenantId: "tenant-p213",
      requesterId: 109,
      projectRef: "p213-certification",
    })).toBe(true);
    expect(isP213CertificationRequester({
      tenantId: "tenant-p213",
      requesterId: 110,
      projectRef: "p213-certification",
    })).toBe(false);
    expect(isP213CertificationRequester({
      tenantId: "other-tenant",
      requesterId: 109,
      projectRef: "p213-certification",
    })).toBe(false);
    expect(isP213CertificationRequester({
      tenantId: "tenant-p213",
      requesterId: 109,
      projectRef: "other-project",
    })).toBe(false);
  });

  it("does not grant the scoped requester admission while certification mode is off", () => {
    process.env.P213_CERTIFICATION_MODE = "false";
    process.env.P213_CERTIFICATION_TENANT_ID = "tenant-p213";
    process.env.P213_CERTIFICATION_REQUESTER_USER_ID = "109";
    process.env.P213_CERTIFICATION_APPROVER_USER_ID = "1";
    process.env.P213_CERTIFICATION_PROJECT_REF = "p213-certification";

    expect(isP213CertificationRequester({
      tenantId: "tenant-p213",
      requesterId: 109,
      projectRef: "p213-certification",
    })).toBe(false);
  });

  it("rejects an untrusted client-shaped marker and does not widen ordinary policy", () => {
    expect(isP213CertificationDescriptor({
      purpose: "p213_certification",
      fixture: "approval_required",
      riskClass: "explicit_approval_test",
      tenantId: "tenant-p213",
      requesterId: 109,
    })).toBe(false);

    expect(() => classifyP213ApprovalDecision(allowDecision, { purpose: "p213_certification" })).toThrow("P213_CERTIFICATION_DESCRIPTOR_INVALID");
  });

  it("turns only the validated certification allow into require_approval", () => {
    process.env.P213_CERTIFICATION_MODE = "true";
    process.env.P213_CERTIFICATION_TENANT_ID = "tenant-p213";
    process.env.P213_CERTIFICATION_REQUESTER_USER_ID = "109";
    process.env.P213_CERTIFICATION_APPROVER_USER_ID = "1";
    process.env.P213_CERTIFICATION_PROJECT_REF = "p213-certification";
    const descriptor = buildP213CertificationDescriptor({ tenantId: "tenant-p213", requesterId: 109, projectRef: "p213-certification" });

    expect(classifyP213ApprovalDecision(allowDecision, descriptor)).toMatchObject({
      decision: "require_approval",
      reasonCodes: ["P213_CERTIFICATION_APPROVAL_REQUIRED"],
      approval: { required: true, approvalTtlSeconds: 300 },
      evidence: allowDecision.evidence,
    });
  });

  it("does not convert an already denied decision into approval", () => {
    const denied = { ...allowDecision, decision: "deny" as const, reasonCodes: ["POLICY_DENIED"] };
    expect(classifyP213ApprovalDecision(denied, null)).toEqual(denied);
  });
});
