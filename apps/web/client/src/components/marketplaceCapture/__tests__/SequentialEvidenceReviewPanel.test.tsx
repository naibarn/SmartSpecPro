/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §5.6.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SequentialEvidencePreview } from "@shared/marketplaceCapture/sequentialEvidencePreview";
import type { HyperframesAutoPlanOverrideInput } from "@shared/hyperframes/autoPlan";
import { SequentialEvidenceReviewPanel } from "../SequentialEvidenceReviewPanel";

function evidencePreviewFixture(
  overrides: Partial<SequentialEvidencePreview> = {}
): SequentialEvidencePreview {
  return {
    needsConfirmation: [
      {
        id: "title_description_conflict:cm",
        attribute: "cm",
        claimText: "180 cm (title) vs 175 cm (description)",
        reason: "title_description_conflict",
        sources: ["title", "description"],
      },
    ],
    verifiedHighlights: [
      { attribute: "material", value: "stainless steel", source: "text" },
    ],
    childSubjectPolicy: { productChildRelated: false, childDepictionPlanned: false },
    assemblyDocumentation: { documented: false, evidence: [], source: "none" },
    ...overrides,
  };
}

describe("SequentialEvidenceReviewPanel", () => {
  it("renders nothing when enabled is false", () => {
    const { container } = render(
      <SequentialEvidenceReviewPanel
        enabled={false}
        evidencePreview={evidencePreviewFixture()}
        value={{}}
        onChange={vi.fn()}
        guardian={{ active: false, guardianReferenceAttached: false }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when evidencePreview is absent", () => {
    const { container } = render(
      <SequentialEvidenceReviewPanel
        enabled
        evidencePreview={undefined}
        value={{}}
        onChange={vi.fn()}
        guardian={{ active: false, guardianReferenceAttached: false }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is collapsed by default: confirmation rows are not in the DOM until expanded, aria-expanded toggles", () => {
    render(
      <SequentialEvidenceReviewPanel
        enabled
        evidencePreview={evidencePreviewFixture()}
        value={{}}
        onChange={vi.fn()}
        guardian={{ active: false, guardianReferenceAttached: false }}
        locale="th"
      />
    );

    expect(screen.queryByText("180 cm (title) vs 175 cm (description)")).toBeNull();
    const trigger = screen.getByRole("button", { name: "ตรวจหลักฐานและข้อขัดแย้ง" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("180 cm (title) vs 175 cm (description)")).toBeTruthy();
  });

  it("renders verified highlights as read-only chips with source, no interactive control", () => {
    render(
      <SequentialEvidenceReviewPanel
        enabled
        evidencePreview={evidencePreviewFixture()}
        value={{}}
        onChange={vi.fn()}
        guardian={{ active: false, guardianReferenceAttached: false }}
        locale="th"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "ตรวจหลักฐานและข้อขัดแย้ง" }));

    const highlight = screen.getByText("stainless steel");
    expect(highlight.tagName).not.toBe("BUTTON");
    expect(highlight.closest("button")).toBeNull();
    expect(screen.getByText(/text/)).toBeTruthy();
  });

  it("confirming a needsConfirmation row adds confirmedAttributes; excluding leaves it absent and never touches forbiddenClaims", () => {
    const onChange = vi.fn();
    render(
      <SequentialEvidenceReviewPanel
        enabled
        evidencePreview={evidencePreviewFixture()}
        value={{}}
        onChange={onChange}
        guardian={{ active: false, guardianReferenceAttached: false }}
        locale="th"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "ตรวจหลักฐานและข้อขัดแย้ง" }));

    fireEvent.click(screen.getByRole("button", { name: "ยืนยัน" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        confirmedAttributes: expect.objectContaining({ cm: expect.any(String) }),
      })
    );
    expect(onChange.mock.calls.at(-1)![0].forbiddenClaims).toBeUndefined();

    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "ตัดออก" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("จะไม่ถูกใช้ในรีวิว")).toBeTruthy();
  });

  it("confirming the last remaining item then un-confirming it removes the confirmedAttributes key entirely", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SequentialEvidenceReviewPanel
        enabled
        evidencePreview={evidencePreviewFixture()}
        value={{}}
        onChange={onChange}
        guardian={{ active: false, guardianReferenceAttached: false }}
        locale="th"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "ตรวจหลักฐานและข้อขัดแย้ง" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยัน" }));
    const confirmedValue = onChange.mock.calls.at(-1)![0] as HyperframesAutoPlanOverrideInput;
    expect(confirmedValue.confirmedAttributes).toBeDefined();

    onChange.mockClear();
    rerender(
      <SequentialEvidenceReviewPanel
        enabled
        evidencePreview={evidencePreviewFixture()}
        value={confirmedValue}
        onChange={onChange}
        guardian={{ active: false, guardianReferenceAttached: false }}
        locale="th"
      />
    );
    // The collapsible section is already expanded from the first render
    // (its `open` state persists across this `rerender`) — do not click the
    // trigger again here, that would collapse it.
    fireEvent.click(screen.getByRole("button", { name: "ยืนยัน" }));
    const unconfirmedValue = onChange.mock.calls.at(-1)![0] as HyperframesAutoPlanOverrideInput;
    expect(Object.prototype.hasOwnProperty.call(unconfirmedValue, "confirmedAttributes")).toBe(
      false
    );
  });

  it("forbiddenClaims splits on newline/comma, trims, drops empties; clearing removes the key", () => {
    const onChange = vi.fn();
    render(
      <SequentialEvidenceReviewPanel
        enabled
        evidencePreview={evidencePreviewFixture({ needsConfirmation: [] })}
        value={{}}
        onChange={onChange}
        guardian={{ active: false, guardianReferenceAttached: false }}
        locale="th"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "ตรวจหลักฐานและข้อขัดแย้ง" }));

    const textarea = screen.getByLabelText("คำที่ห้ามใช้");
    fireEvent.change(textarea, { target: { value: " รักษาโรค ,  หายขาด \n \n รับประกัน100% " } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        forbiddenClaims: ["รักษาโรค", "หายขาด", "รับประกัน100%"],
      })
    );

    fireEvent.change(textarea, { target: { value: "" } });
    const cleared = onChange.mock.calls.at(-1)![0] as HyperframesAutoPlanOverrideInput;
    expect(Object.prototype.hasOwnProperty.call(cleared, "forbiddenClaims")).toBe(false);
  });

  it("targetAudience and userRequirements write their own keys; empty-after-trim removes them", () => {
    const onChange = vi.fn();
    render(
      <SequentialEvidenceReviewPanel
        enabled
        evidencePreview={evidencePreviewFixture({ needsConfirmation: [] })}
        value={{}}
        onChange={onChange}
        guardian={{ active: false, guardianReferenceAttached: false }}
        locale="th"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "ตรวจหลักฐานและข้อขัดแย้ง" }));

    const audience = screen.getByLabelText("กลุ่มเป้าหมาย (ไม่บังคับ)");
    fireEvent.change(audience, { target: { value: "คุณแม่มือใหม่" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetAudience: "คุณแม่มือใหม่" })
    );
    fireEvent.change(audience, { target: { value: "   " } });
    expect(
      Object.prototype.hasOwnProperty.call(
        onChange.mock.calls.at(-1)![0],
        "targetAudience"
      )
    ).toBe(false);

    const requirements = screen.getByLabelText("ความต้องการเพิ่มเติม (ไม่บังคับ)");
    fireEvent.change(requirements, { target: { value: "โทนอบอุ่นขึ้น" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ userRequirements: "โทนอบอุ่นขึ้น" })
    );
  });

  it("preserves unrelated existing override keys on every emit", () => {
    const onChange = vi.fn();
    render(
      <SequentialEvidenceReviewPanel
        enabled
        evidencePreview={evidencePreviewFixture({ needsConfirmation: [] })}
        value={{ qualityMode: "high", shotCount: 9 }}
        onChange={onChange}
        guardian={{ active: false, guardianReferenceAttached: false }}
        locale="th"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "ตรวจหลักฐานและข้อขัดแย้ง" }));
    fireEvent.change(screen.getByLabelText("กลุ่มเป้าหมาย (ไม่บังคับ)"), {
      target: { value: "คุณแม่มือใหม่" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ qualityMode: "high", shotCount: 9 })
    );
  });

  it("renders the guardian notice inside the panel when guardian.active is true", () => {
    render(
      <SequentialEvidenceReviewPanel
        enabled
        evidencePreview={evidencePreviewFixture()}
        value={{}}
        onChange={vi.fn()}
        guardian={{ active: true, guardianReferenceAttached: false }}
        locale="th"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "ตรวจหลักฐานและข้อขัดแย้ง" }));
    expect(screen.getByRole("note")).toBeTruthy();
  });
});
