import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, Sparkles } from "lucide-react";
import {
  resolveSceneVisualState,
  type VdSceneVisualState,
} from "@shared/verticalDramaSeries/sceneContinuity";

export type VerticalDramaSceneVisualStateView = {
  locationKey?: string;
  lightingState?: string;
  fixedElements?: Array<{ name?: string; placement?: string }>;
  spatialLayout?: string;
  stagingAxis?: string;
  wardrobeInScene?: Array<{ character?: string; wardrobe?: string }>;
  activeProps?: Array<{ name?: string; placement?: string; fromShot?: number }>;
  paletteMood?: string;
  timeJumpSuspected?: boolean;
  coverageGaps?: string[];
  memberShotNumbers?: number[];
  plannedAt?: string;
  skillVersion?: string;
  manualEdit?: boolean;
  stale?: boolean;
};

export type VerticalDramaShotSceneAnchorView = {
  anchorShotNumber?: number;
  mediaAssetId?: number;
  source?: string;
  attachedAt?: string;
};

export type VerticalDramaSceneVisualStatePatch = {
  lightingState?: string;
  fixedElements?: Array<{ name: string; placement: string }>;
  spatialLayout?: string;
  stagingAxis?: string;
  wardrobeInScene?: Array<{ character: string; wardrobe: string }>;
  activeProps?: Array<{ name: string; placement: string; fromShot?: number }>;
  paletteMood?: string;
  timeJumpSuspected?: boolean;
  coverageGaps?: string[];
};

type Lang = "th" | "en";
const copy = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);

function normalizeState(
  locationKey: string,
  state?: VerticalDramaSceneVisualStateView
): VdSceneVisualState | undefined {
  if (!state) return undefined;
  return resolveSceneVisualState({ locationKey, ...state });
}

function diffPatch(
  before: VdSceneVisualState | undefined,
  draft: VerticalDramaSceneVisualStatePatch
): VerticalDramaSceneVisualStatePatch {
  const patch: VerticalDramaSceneVisualStatePatch = {};
  for (const key of Object.keys(draft) as Array<
    keyof VerticalDramaSceneVisualStatePatch
  >) {
    const next = draft[key];
    const previous = before?.[key as keyof VdSceneVisualState];
    if (JSON.stringify(next) !== JSON.stringify(previous)) {
      patch[key] = next as never;
    }
  }
  return patch;
}

export function VerticalDramaSceneLockDialog(props: {
  locale: Lang;
  locationKey: string;
  state?: VerticalDramaSceneVisualStateView;
  saving?: boolean;
  onSubmit: (patch: VerticalDramaSceneVisualStatePatch) => void;
  onClose: () => void;
}): ReactElement {
  const normalized = normalizeState(props.locationKey, props.state);
  const [draft, setDraft] = useState<VerticalDramaSceneVisualStatePatch>({});

  useEffect(() => {
    setDraft({
      lightingState: normalized?.lightingState ?? "",
      spatialLayout: normalized?.spatialLayout ?? "",
      stagingAxis: normalized?.stagingAxis ?? "",
      paletteMood: normalized?.paletteMood ?? "",
      timeJumpSuspected: normalized?.timeJumpSuspected ?? false,
    });
  }, [
    props.locationKey,
    props.state,
    normalized?.lightingState,
    normalized?.spatialLayout,
    normalized?.stagingAxis,
    normalized?.paletteMood,
    normalized?.timeJumpSuspected,
  ]);

  const submit = () => props.onSubmit(diffPatch(normalized, draft));
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent data-testid={`vd-scene-lock-dialog-${props.locationKey}`}>
        <DialogHeader>
          <DialogTitle>
            {copy(
              props.locale,
              "แก้ไขล็อกความต่อเนื่องของฉาก",
              "Edit scene continuity lock"
            )}
          </DialogTitle>
          <DialogDescription>{props.locationKey}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label
              htmlFor={`vd-scene-lock-dialog-lighting-${props.locationKey}`}
            >
              {copy(props.locale, "แสง / ช่วงเวลา", "Lighting / time of day")}
            </Label>
            <Textarea
              id={`vd-scene-lock-dialog-lighting-${props.locationKey}`}
              data-testid={`vd-scene-lock-dialog-lighting-${props.locationKey}`}
              value={draft.lightingState ?? ""}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  lightingState: event.target.value,
                }))
              }
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`vd-scene-lock-dialog-layout-${props.locationKey}`}>
              {copy(props.locale, "ผังฉาก", "Spatial layout")}
            </Label>
            <Textarea
              id={`vd-scene-lock-dialog-layout-${props.locationKey}`}
              value={draft.spatialLayout ?? ""}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  spatialLayout: event.target.value,
                }))
              }
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`vd-scene-lock-dialog-axis-${props.locationKey}`}>
              {copy(props.locale, "แกนการจัดฉาก", "Staging axis")}
            </Label>
            <Input
              id={`vd-scene-lock-dialog-axis-${props.locationKey}`}
              value={draft.stagingAxis ?? ""}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  stagingAxis: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor={`vd-scene-lock-dialog-palette-${props.locationKey}`}
            >
              {copy(props.locale, "โทนสีและอารมณ์", "Palette and mood")}
            </Label>
            <Input
              id={`vd-scene-lock-dialog-palette-${props.locationKey}`}
              value={draft.paletteMood ?? ""}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  paletteMood: event.target.value,
                }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.timeJumpSuspected === true}
              onCheckedChange={checked =>
                setDraft(current => ({
                  ...current,
                  timeJumpSuspected: checked === true,
                }))
              }
            />
            {copy(
              props.locale,
              "สงสัยว่ามีการกระโดดเวลา",
              "Time jump suspected"
            )}
          </label>
          {normalized?.fixedElements?.length ||
          normalized?.activeProps?.length ||
          normalized?.wardrobeInScene?.length ? (
            <p className="text-xs text-muted-foreground">
              {copy(
                props.locale,
                "องค์ประกอบ ฉากประกอบ และเสื้อผ้าจะแสดงแบบอ่านอย่างเดียวในระยะนี้",
                "Fixed elements, props, and wardrobe are read-only in this phase."
              )}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={props.onClose}
            disabled={props.saving}
          >
            {copy(props.locale, "ยกเลิก", "Cancel")}
          </Button>
          <Button
            type="button"
            data-testid={`vd-scene-lock-dialog-save-${props.locationKey}`}
            onClick={submit}
            disabled={props.saving}
          >
            {props.saving ? (
              <Loader2
                className="mr-1.5 h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {copy(props.locale, "บันทึก", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VerticalDramaSceneLockRow(props: {
  locale: Lang;
  locationKey: string;
  state?: VerticalDramaSceneVisualStateView;
  enabled?: boolean;
  planning?: boolean;
  saving?: boolean;
  onPlan?: (
    locationKey: string,
    force?: boolean,
    expectedRevision?: number
  ) => void;
  onSubmitEdit?: (
    locationKey: string,
    patch: VerticalDramaSceneVisualStatePatch,
    expectedRevision?: number
  ) => void;
}): ReactElement | null {
  const normalized = useMemo(
    () => normalizeState(props.locationKey, props.state),
    [props.locationKey, props.state]
  );
  const [editing, setEditing] = useState(false);
  if (props.enabled !== true) return null;

  const status = normalized?.stale
    ? copy(props.locale, "ต้องตรวจสอบ", "Needs review")
    : normalized?.manualEdit
      ? copy(props.locale, "แก้ด้วยมือ", "Manual")
      : normalized
        ? copy(props.locale, "ล็อกแล้ว", "Locked")
        : copy(props.locale, "ยังไม่ล็อก", "Not locked");
  const summary =
    normalized?.lightingState?.trim() || normalized?.spatialLayout?.trim();
  const hasState = Boolean(normalized);

  return (
    <div
      className="flex flex-col gap-1.5 rounded border border-border/60 bg-muted/20 p-2"
      data-testid={`vd-scene-lock-${props.locationKey}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
          <span>
            {copy(
              props.locale,
              "ล็อกความต่อเนื่องของฉาก",
              "Scene continuity lock"
            )}
          </span>
          <span
            className="rounded border px-1.5 py-0.5 text-[10px]"
            data-testid={`vd-scene-lock-status-${props.locationKey}`}
          >
            {status}
          </span>
        </div>
        {hasState ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            data-testid={`vd-scene-lock-edit-${props.locationKey}`}
            onClick={() => setEditing(true)}
            disabled={props.saving}
          >
            <Pencil aria-hidden="true" className="h-3 w-3" />
            {copy(props.locale, "แก้ไขล็อกฉาก", "Edit scene lock")}
          </Button>
        ) : null}
      </div>
      {summary ? (
        <p
          className="line-clamp-2 text-xs text-muted-foreground"
          data-testid={`vd-scene-lock-summary-${props.locationKey}`}
        >
          {summary}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit gap-1.5 text-xs"
        data-testid={`vd-scene-lock-plan-${props.locationKey}`}
        onClick={() =>
          props.onPlan?.(
            props.locationKey,
            hasState ? true : undefined,
            normalized?.revision ?? 0
          )
        }
        disabled={props.planning || props.saving}
      >
        {props.planning ? (
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        {hasState
          ? copy(
              props.locale,
              "สร้างใหม่ทับของเดิม (มีค่าใช้จ่าย)",
              "Re-plan and overwrite (paid)"
            )
          : copy(
              props.locale,
              "วางแผนล็อกฉาก (มีค่าใช้จ่าย)",
              "Plan scene lock (paid)"
            )}
      </Button>
      {editing ? (
        <VerticalDramaSceneLockDialog
          locale={props.locale}
          locationKey={props.locationKey}
          state={props.state}
          saving={props.saving}
          onClose={() => setEditing(false)}
          onSubmit={patch => {
            props.onSubmitEdit?.(
              props.locationKey,
              patch,
              normalized?.revision ?? 0
            );
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}
