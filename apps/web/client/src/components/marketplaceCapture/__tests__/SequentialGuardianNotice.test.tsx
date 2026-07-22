/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §5.5.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SequentialGuardianNotice } from "../SequentialGuardianNotice";

describe("SequentialGuardianNotice", () => {
  it("renders null when active is false", () => {
    const { container } = render(
      <SequentialGuardianNotice active={false} guardianReferenceAttached={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the §17.5 Thai notice when active is true", () => {
    render(
      <SequentialGuardianNotice active guardianReferenceAttached={false} locale="th" />
    );
    expect(
      screen.getByText(
        "สินค้านี้เกี่ยวกับเด็ก — ทุกเฟรมที่มีเด็กใช้งานสินค้า ระบบจะใส่ผู้ปกครองอยู่ในฉากด้วยเสมอ คุณสามารถอัปโหลดรูปตัวละครผู้ใหญ่ เพื่อกำหนดหน้าตาผู้ปกครองได้"
      )
    ).toBeTruthy();
    expect(screen.getByRole("note")).toBeTruthy();
  });

  it("shows the upload-reference attach hint when no guardian reference is attached", () => {
    render(
      <SequentialGuardianNotice active guardianReferenceAttached={false} locale="th" />
    );
    expect(screen.getByText("อัปโหลด reference")).toBeTruthy();
    expect(screen.queryByText(/แนบรูป reference ผู้ปกครองแล้ว/)).toBeNull();
  });

  it("shows a distinct confirmation line when a guardian reference is already attached", () => {
    render(<SequentialGuardianNotice active guardianReferenceAttached locale="th" />);
    expect(screen.getByText("แนบรูป reference ผู้ปกครองแล้ว")).toBeTruthy();
  });

  it("has no opt-out control of any kind", () => {
    render(
      <SequentialGuardianNotice
        active
        guardianReferenceAttached={false}
        onOpenCharacterUpload={vi.fn()}
      />
    );
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();

    const interactive = [
      ...screen.queryAllByRole("button"),
      ...screen.queryAllByRole("link"),
    ];
    for (const control of interactive) {
      const name = control.getAttribute("aria-label") ?? control.textContent ?? "";
      expect(name).not.toMatch(/ปิด|ยกเลิก|ไม่ใช้|opt.?out|disable/i);
    }
  });

  it("invokes onOpenCharacterUpload when the attach hint is activated", () => {
    const onOpenCharacterUpload = vi.fn();
    render(
      <SequentialGuardianNotice
        active
        guardianReferenceAttached={false}
        onOpenCharacterUpload={onOpenCharacterUpload}
        locale="th"
      />
    );
    screen.getByRole("button", { name: "อัปโหลด reference" }).click();
    expect(onOpenCharacterUpload).toHaveBeenCalledTimes(1);
  });

  it("renders the English notice when locale=en", () => {
    render(<SequentialGuardianNotice active guardianReferenceAttached={false} locale="en" />);
    expect(screen.getByText("Upload reference")).toBeTruthy();
    expect(
      screen.getByText(/every frame where a child uses the product/i)
    ).toBeTruthy();
  });
});
