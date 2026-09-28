// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VerticalDramaStaleDraftCleanupDialog,
  defaultVerticalDramaStaleDraftDays,
  isVerticalDramaSeriesIndexPath,
  useVerticalDramaStaleDraftCleanupOffer,
  verticalDramaStaleDraftCleanupSignature,
} from "@/components/verticalDramaSeries/VerticalDramaStaleDraftCleanupDialog";

describe("VerticalDramaStaleDraftCleanupDialog", () => {
  it("enables Draft cleanup only on the series index route", () => {
    expect(isVerticalDramaSeriesIndexPath("/drama-series")).toBe(true);
    expect(isVerticalDramaSeriesIndexPath("/drama-series/?tab=all")).toBe(true);
    expect(isVerticalDramaSeriesIndexPath("/drama-series/21")).toBe(false);
    expect(
      isVerticalDramaSeriesIndexPath("/drama-series/21/episodes/140")
    ).toBe(false);
  });

  it("defaults to the oldest non-empty cleanup bucket", () => {
    expect(defaultVerticalDramaStaleDraftDays({ 7: 5, 10: 2 })).toBe(10);
    expect(defaultVerticalDramaStaleDraftDays({ 7: 5, 10: 0 })).toBe(7);
    expect(defaultVerticalDramaStaleDraftDays({ 7: 0, 10: 0 })).toBeNull();
  });

  it("builds a stable signature from all cleanup counts", () => {
    expect(verticalDramaStaleDraftCleanupSignature({ 7: 5, 10: 2 })).toBe(
      "7:5|10:2"
    );
  });

  it("does not interrupt the index route with an automatic modal", () => {
    const { result, rerender } = renderHook(
      ({ enabled, isLoaded, counts }) =>
        useVerticalDramaStaleDraftCleanupOffer({ enabled, isLoaded, counts }),
      {
        initialProps: {
          enabled: true,
          isLoaded: true,
          counts: { 7: 5, 10: 2 },
        },
      }
    );

    expect(result.current.open).toBe(false);
    expect(result.current.hasEligibleJobs).toBe(true);
    expect(result.current.selectedDays).toBe(10);
    act(() => result.current.openCleanupDialog());
    expect(result.current.open).toBe(true);
    act(() => result.current.setOpen(false));
    rerender({ enabled: true, isLoaded: true, counts: { 7: 5, 10: 2 } });
    expect(result.current.open).toBe(false);

    rerender({ enabled: true, isLoaded: true, counts: { 7: 6, 10: 3 } });
    expect(result.current.open).toBe(false);
    rerender({
      enabled: false,
      isLoaded: true,
      counts: { 7: 6, 10: 3 },
    });
    expect(result.current.open).toBe(false);
  });

  it("shows bilingual-safe age choices and submits the selected threshold", () => {
    const onOpenChange = vi.fn();
    const onSelectedDaysChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <VerticalDramaStaleDraftCleanupDialog
        lang="th"
        open
        counts={{ 7: 5, 10: 0 }}
        selectedDays={7}
        isPending={false}
        onOpenChange={onOpenChange}
        onSelectedDaysChange={onSelectedDaysChange}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText("จัดการงาน Draft ที่ไม่มีการเคลื่อนไหว")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ประวัติและ version เดิมยังอยู่/)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/ไม่มีการเคลื่อนไหวเกิน 7 วัน.*5 งาน/)
    ).toBeChecked();
    expect(
      screen.getByLabelText(/ไม่มีการเคลื่อนไหวเกิน 10 วัน.*0 งาน/)
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "เก็บเข้าประวัติ" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "เก็บไว้ก่อน" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("locks dismissal and confirmation while cleanup is pending", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <VerticalDramaStaleDraftCleanupDialog
        lang="en"
        open
        counts={{ 7: 2, 10: 1 }}
        selectedDays={10}
        isPending
        onOpenChange={onOpenChange}
        onSelectedDaysChange={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(
      screen.getByRole("button", { name: "Archive to history" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep for now" })).toBeDisabled();
  });
});
