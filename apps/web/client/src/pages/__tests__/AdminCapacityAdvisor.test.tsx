// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminCapacityAdvisor from "../AdminCapacityAdvisor";

const navigate = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/capacity-advisor", navigate],
}));

vi.mock("@/components/admin/CapacityAdvisorPanel", () => ({
  CapacityAdvisorPanel: () => (
    <div data-testid="capacity-advisor-panel">summary panel</div>
  ),
}));

describe("AdminCapacityAdvisor page", () => {
  it("provides a dedicated explanation before the advisor panel", () => {
    render(<AdminCapacityAdvisor />);

    expect(
      screen.getByRole("heading", { name: "ประเมินความพร้อมของระบบ" })
    ).toBeInTheDocument();
    expect(screen.getByText("หน้านี้ใช้ตอบคำถามอะไร?")).toBeInTheDocument();
    expect(screen.getByTestId("capacity-advisor-panel")).toBeInTheDocument();
  });

  it("keeps a clear route back to the Admin command center", () => {
    render(<AdminCapacityAdvisor />);
    fireEvent.click(
      screen.getByRole("button", { name: "กลับไป Command Center" })
    );
    expect(navigate).toHaveBeenCalledWith("/admin/dashboard");
  });
});
