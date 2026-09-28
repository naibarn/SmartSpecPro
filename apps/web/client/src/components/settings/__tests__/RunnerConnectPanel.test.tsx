/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RunnerConnectPanel } from "../RunnerConnectPanel";

describe("RunnerConnectPanel", () => {
  it("links to browser approval without rendering fields or credentials", () => {
    render(<RunnerConnectPanel />);

    expect(
      screen.getByRole("link", { name: /เปิดหน้าการเชื่อมต่อ Runner/ })
    ).toHaveAttribute("href", "/runners/connect");
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(
      screen.queryByText(/BEGIN (PUBLIC|PRIVATE) KEY/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/accessToken|refreshToken|SAH_RUNNER_/i)
    ).not.toBeInTheDocument();
  });
});
