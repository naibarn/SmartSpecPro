import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SeriesLookLockPicker } from "../SeriesLookLockPicker";

describe("SeriesLookLockPicker", () => {
  it("renders the five catalog genres plus inherit and none as accessible controls", () => {
    render(
      <SeriesLookLockPicker
        lang="th"
        value={{ mode: "none" }}
        hasInheritedLook
        onChange={() => undefined}
      />
    );
    expect(screen.getByText("ดราม่า / โรแมนติก")).toBeInTheDocument();
    expect(screen.getByText("สยองขวัญ / ระทึกขวัญ")).toBeInTheDocument();
    expect(screen.getByText("ไซไฟ / ไซเบอร์พังก์")).toBeInTheDocument();
    expect(screen.getByText("แอ็กชัน / มหากาพย์")).toBeInTheDocument();
    expect(screen.getByText("แฟนตาซี / เทพนิยาย")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "ใช้ลุคจากต้นทาง" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "ไม่ล็อกลุค" })).toBeChecked();
  });

  it("disables unavailable inheritance and emits one selected genre", () => {
    const onChange = vi.fn();
    render(
      <SeriesLookLockPicker
        lang="en"
        value={{ mode: "none" }}
        hasInheritedLook={false}
        onChange={onChange}
      />
    );
    expect(screen.getByRole("checkbox", { name: "Use source look" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Action / Epic" }));
    expect(onChange).toHaveBeenCalledWith({ mode: "genre", genreKey: "action_epic" });
  });
});
