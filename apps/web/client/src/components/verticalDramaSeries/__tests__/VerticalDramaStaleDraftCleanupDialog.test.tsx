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
    expect(isVerticalDramaSeriesIndexPath("/drama-series/21/episodes/140")).toBe(
      false
    );
  });

  it("defaults to the oldest non-empty cleanup bucket", () => {
    expect(defaultVerticalDramaStaleDraftDays({ 5: 9, 7: 5, 10: 2 })).toBe(10);
    expect(defaultVerticalDramaStaleDraftDays({ 5: 9, 7: 5, 10: 0 })).toBe(7);
    expect(defaultVerticalDramaStaleDraftDays({ 5: 9, 7: 0, 10: 0 })).toBe(5);
    expect(
      defaultVerticalDramaStaleDraftDays({ 5: 0, 7: 0, 10: 0 })
    ).toBeNull();
  });

  it("builds a stable signature from all cleanup counts", () => {
    expect(verticalDramaStaleDraftCleanupSignature({ 5: 9, 7: 5, 10: 2 })).toBe(
      "5:9|7:5|10:2"
    );
  });

  it("offers once per loaded summary signature and closes off the index route", () => {
    const { result, rerender } = renderHook(
      ({ enabled, isLoaded, counts }) =>
        useVerticalDramaStaleDraftCleanupOffer({ enabled, isLoaded, counts }),
      {
        initialProps: {
          enabled: true,
          isLoaded: true,
          counts: { 5: 9, 7: 5, 10: 2 },
        },
      }
    );

    expect(result.current.open).toBe(true);
    expect(result.current.selectedDays).toBe(10);
    act(() => result.current.setOpen(false));
    rerender({ enabled: true, isLoaded: true, counts: { 5: 9, 7: 5, 10: 2 } });
    expect(result.current.open).toBe(false);

    rerender({ enabled: true, isLoaded: true, counts: { 5: 10, 7: 6, 10: 3 } });
    expect(result.current.open).toBe(true);
    rerender({
      enabled: false,
      isLoaded: true,
      counts: { 5: 10, 7: 6, 10: 3 },
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
        counts={{ 5: 9, 7: 5, 10: 0 }}
        selectedDays={7}
        isPending={false}
        onOpenChange={onOpenChange}
        onSelectedDaysChange={onSelectedDaysChange}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("ล้างงาน Draft เก่าหรือไม่?")).toBeInTheDocument();
    expect(screen.getByText(/ไม่กระทบซีรีส์ที่สร้างแล้ว/)).toBeInTheDocument();
    expect(screen.getByLabelText(/เกิน 5 วัน.*9 งาน/)).toBeEnabled();
    expect(screen.getByLabelText(/เกิน 7 วัน.*5 งาน/)).toBeChecked();
    expect(screen.getByLabelText(/เกิน 10 วัน.*0 งาน/)).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/เกิน 5 วัน.*9 งาน/));
    expect(onSelectedDaysChange).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByRole("button", { name: "ลบออกจากรายการ" }));
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
        counts={{ 5: 4, 7: 2, 10: 1 }}
        selectedDays={10}
        isPending
        onOpenChange={onOpenChange}
        onSelectedDaysChange={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(
      screen.getByRole("button", { name: "Remove from inbox" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep for now" })).toBeDisabled();
  });
});
