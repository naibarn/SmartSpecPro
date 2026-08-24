import { describe, expect, it } from "vitest";
import {
  getLegalDocument,
  LEGAL_CONTACT,
  legalDocuments,
} from "./legalContent";

describe("legal content", () => {
  it("keeps Privacy and Terms sections aligned between English and Thai", () => {
    for (const kind of ["privacy", "terms"] as const) {
      const englishIds = legalDocuments.en[kind].sections.map(
        section => section.id
      );
      const thaiIds = legalDocuments.th[kind].sections.map(
        section => section.id
      );

      expect(englishIds.length).toBeGreaterThanOrEqual(12);
      expect(thaiIds).toEqual(englishIds);
    }
  });

  it("uses only the currently verified temporary contact identity", () => {
    expect(LEGAL_CONTACT.controller).toBe("Smart AI Hub Team");
    expect(LEGAL_CONTACT.email).toBe("smartaihubapp@gmail.com");
    expect(LEGAL_CONTACT.location).toBe("Nakhon Ratchasima, Thailand");

    const allText = JSON.stringify(legalDocuments);
    expect(allText).not.toContain("privacy@smartaihub.app");
    expect(allText).not.toContain("support@smartaihub.app");
    expect(allText).not.toMatch(/SOC\s*2|AES-256|CCPA|CPRA|GDPR-compliant/i);
  });

  it("returns the selected language and falls back to English", () => {
    expect(getLegalDocument("en", "privacy").title).toBe("Privacy Policy");
    expect(getLegalDocument("th", "privacy").title).toBe(
      "นโยบายความเป็นส่วนตัว"
    );
    expect(getLegalDocument("en", "terms").title).toBe("Terms of Service");
    expect(getLegalDocument("th", "terms").title).toBe("ข้อกำหนดการให้บริการ");
  });

  it("keeps legal content free of raw markdown markers", () => {
    const allText = JSON.stringify(legalDocuments);
    expect(allText).not.toMatch(/\*\*|^\s*[•-]\s/m);
  });
});
