/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerticalDramaSceneLockRow } from "@/components/verticalDramaSeries/VerticalDramaSceneLockRow";

describe("VerticalDramaSceneLockRow", () => {
  it("is absent when the feature is disabled", () => {
    const { container } = render(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="hall"
        enabled={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("plans an unlocked scene and uses the overwrite action for an existing lock", () => {
    const onPlan = vi.fn();
    const { rerender } = render(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="hall"
        enabled
        onPlan={onPlan}
      />
    );
    expect(screen.getByTestId("vd-scene-lock-status-hall")).toHaveTextContent(
      "ยังไม่ล็อก"
    );
    fireEvent.click(screen.getByTestId("vd-scene-lock-plan-hall"));
    expect(onPlan).toHaveBeenCalledWith("hall", undefined, 0);

    rerender(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="hall"
        enabled
        state={{ locationKey: "hall", lightingState: "late afternoon" }}
        onPlan={onPlan}
      />
    );
    expect(screen.getByTestId("vd-scene-lock-status-hall")).toHaveTextContent(
      "ล็อกแล้ว"
    );
    expect(screen.getByTestId("vd-scene-lock-summary-hall")).toHaveTextContent(
      "late afternoon"
    );
    fireEvent.click(screen.getByTestId("vd-scene-lock-plan-hall"));
    expect(onPlan).toHaveBeenLastCalledWith("hall", true, 0);
  });

  it("starts collapsed and explains the shared scene scope", () => {
    render(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="bedroom"
        enabled
        state={{
          locationKey: "bedroom",
          memberShotNumbers: [1, 2, 3],
          lightingState: "กลางคืน",
          sleepSurface: {
            type: "long_bed",
            name: "เตียงนอนทรงยาวของภูมิ",
            placement: "ข้างโต๊ะเล็ก",
          },
        }}
      />
    );

    expect(screen.getByTestId("vd-scene-lock-content-bedroom")).toHaveAttribute(
      "hidden",
    );
    expect(
      screen.getByText("แก้ไขครั้งเดียว ใช้กับทุกช็อตในฉากนี้ (3 ช็อต)"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("vd-scene-lock-toggle-bedroom"));
    expect(
      screen.getByText(
        "ข้อมูลชุดนี้เป็นข้อกำหนดกลางของฉาก ใช้ร่วมกันกับทุกช็อตด้านล่าง คุณแก้ไขรายละเอียดที่ภาพสร้างผิดหรือไม่ตรงกับเรื่องย่อได้ที่นี่",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/เตียงนอนทรงยาวของภูมิ/)).toBeInTheDocument();
  });

  it("marks manual/stale states and sends only changed fields", () => {
    const onSubmitEdit = vi.fn();
    render(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="hall"
        enabled
        state={{
          locationKey: "hall",
          lightingState: "day",
          spatialLayout: "left",
          manualEdit: true,
          stale: true,
        }}
        onSubmitEdit={onSubmitEdit}
      />
    );
    expect(screen.getByTestId("vd-scene-lock-status-hall")).toHaveTextContent(
      "ต้องตรวจสอบ"
    );
    fireEvent.click(screen.getByTestId("vd-scene-lock-edit-hall"));
    expect(screen.getByTestId("vd-scene-lock-dialog-hall")).toHaveClass(
      "overflow-hidden",
      "grid-rows-[auto_minmax(0,1fr)_auto]",
      "max-h-[calc(100dvh-1rem)]",
    );
    expect(screen.getByTestId("vd-scene-lock-dialog-body-hall")).toHaveClass(
      "min-h-0",
      "overflow-y-auto",
    );
    const lighting = screen.getByTestId("vd-scene-lock-dialog-lighting-hall");
    fireEvent.change(lighting, { target: { value: "night" } });
    fireEvent.click(screen.getByTestId("vd-scene-lock-dialog-save-hall"));
    expect(onSubmitEdit).toHaveBeenCalledWith(
      "hall",
      {
        lightingState: "night",
      },
      0
    );
  });

  it("edits the structured sleep surface with an example that prevents bed confusion", () => {
    const onSubmitEdit = vi.fn();
    render(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="bedroom"
        enabled
        state={{
          locationKey: "bedroom",
          memberShotNumbers: [2, 4],
          sleepSurface: {
            type: "crib_bassinet",
            name: "เปลเดิม",
            occupant: "ภูมิ",
            placement: "ข้างเตียง",
          },
        }}
        onSubmitEdit={onSubmitEdit}
      />,
    );

    fireEvent.click(screen.getByTestId("vd-scene-lock-edit-bedroom"));
    expect(screen.getByTestId("vd-scene-lock-dialog-impact-bedroom")).toHaveTextContent(
      "ยังไม่มีการเปลี่ยนแปลง มีผลกับ 2 ช็อตเมื่อบันทึก",
    );
    fireEvent.change(screen.getByTestId("vd-scene-lock-dialog-sleep-type-bedroom"), {
      target: { value: "long_bed" },
    });
    fireEvent.change(screen.getByTestId("vd-scene-lock-dialog-sleep-name-bedroom"), {
      target: { value: "เตียงนอนทรงยาวของภูมิ" },
    });
    fireEvent.change(screen.getByTestId("vd-scene-lock-dialog-sleep-placement-bedroom"), {
      target: { value: "ข้างโต๊ะเล็ก" },
    });
    fireEvent.click(screen.getByTestId("vd-scene-lock-dialog-save-bedroom"));

    expect(onSubmitEdit).toHaveBeenCalledWith(
      "bedroom",
      {
        sleepSurface: {
          type: "long_bed",
          name: "เตียงนอนทรงยาวของภูมิ",
          occupant: "ภูมิ",
          placement: "ข้างโต๊ะเล็ก",
        },
      },
      0,
    );
  });

  it("lets the user edit coverage gaps with a clear per-line explanation", () => {
    const onSubmitEdit = vi.fn();
    render(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="bedroom"
        enabled
        state={{
          locationKey: "bedroom",
          coverageGaps: ["ยังไม่ยืนยันตำแหน่งหน้าต่าง"],
        }}
        memberShotNumbers={[1, 2]}
        onSubmitEdit={onSubmitEdit}
      />,
    );

    fireEvent.click(screen.getByTestId("vd-scene-lock-edit-bedroom"));
    expect(
      screen.getByText("ใส่ 1 จุดต่อบรรทัด; ลบข้อความทั้งหมดเมื่อตรวจสอบเรียบร้อยแล้ว"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("vd-scene-lock-dialog-coverage-gaps-bedroom"), {
      target: { value: "ยืนยันแล้ว: หน้าต่างอยู่ซ้ายของเตียง\nตรวจสอบสีผ้าม่าน" },
    });
    fireEvent.click(screen.getByTestId("vd-scene-lock-dialog-save-bedroom"));

    expect(onSubmitEdit).toHaveBeenCalledWith(
      "bedroom",
      {
        coverageGaps: ["ยืนยันแล้ว: หน้าต่างอยู่ซ้ายของเตียง", "ตรวจสอบสีผ้าม่าน"],
      },
      0,
    );
  });
});
