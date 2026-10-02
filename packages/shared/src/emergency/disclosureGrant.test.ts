import { describe, expect, it } from "vitest";
import { discloseEmergencyFields, type EmergencyDisclosureGrant } from "./disclosureGrant";

describe("emergency task-specific disclosure grants", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  const grant: EmergencyDisclosureGrant = {
    subjectRef: "person-1", recipientRef: "responder-2", purpose: "task-response",
    resourceType: "case", resourceRef: "case-3", fields: ["approximateLocation", "needSummary"],
    jurisdictionRef: "district-4", expiresAt: "2026-09-30T13:00:00.000Z",
  };
  const request = { subjectRef: "person-1", recipientRef: "responder-2", purpose: "task-response",
    resourceType: "case", resourceRef: "case-3", jurisdictionRef: "district-4", now };

  it("returns only granted fields for an exact active scope", () => {
    expect(discloseEmergencyFields({ approximateLocation: { latitude: 13.756331, longitude: 100.501762 }, needSummary: "water", contact: "private" }, grant, request))
      .toEqual({ approximateLocation: { latitude: 13.75, longitude: 100.5 }, needSummary: "water" });
    expect(discloseEmergencyFields({ approximateLocation: { latitude: 13.756331, longitude: 100.501762 }, needSummary: "water" }, grant, request))
      .not.toHaveProperty("contact");
  });

  it("fails closed for revoked, expired, or cross-scope access", () => {
    expect(discloseEmergencyFields({ needSummary: "water" }, { ...grant, revokedAt: now.toISOString() }, request)).toBeNull();
    expect(discloseEmergencyFields({ needSummary: "water" }, { ...grant, expiresAt: now.toISOString() }, request)).toBeNull();
    expect(discloseEmergencyFields({ needSummary: "water" }, grant, { ...request, jurisdictionRef: "district-other" })).toBeNull();
    expect(discloseEmergencyFields({ needSummary: "water" }, grant, { ...request, purpose: "other" })).toBeNull();
  });

  it("does not turn an empty field grant into whole-record access", () => {
    expect(discloseEmergencyFields({ needSummary: "water" }, { ...grant, fields: [] }, request)).toBeNull();
    expect(discloseEmergencyFields({ needSummary: "water" }, { ...grant, fields: ["contact"] }, request)).toBeNull();
  });

  it("rejects malformed grant and request data instead of throwing or expanding scope", () => {
    expect(discloseEmergencyFields({ needSummary: "water" }, { ...grant, subjectRef: "" }, request)).toBeNull();
    expect(discloseEmergencyFields({ needSummary: "water" }, grant, { ...request, now: new Date("invalid") })).toBeNull();
    expect(discloseEmergencyFields({ approximateLocation: { latitude: 500, longitude: 200 } }, grant, request)).toBeNull();
    expect(discloseEmergencyFields(null as never, grant, request)).toBeNull();
  });
});
