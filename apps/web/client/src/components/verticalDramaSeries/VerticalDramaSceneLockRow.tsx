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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  VD_SLEEP_SURFACE_TYPES,
  resolveSceneVisualState,
  type VdSceneSleepSurface,
  type VdSceneVisualState,
} from "@shared/verticalDramaSeries/sceneContinuity";

export type VerticalDramaSceneVisualStateView = {
  locationKey?: string;
  lightingState?: string;
  fixedElements?: Array<{ name?: string; placement?: string }>;
  spatialLayout?: string;
  stagingAxis?: string;
  sleepSurface?: Partial<VdSceneSleepSurface>;
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
  sleepSurface?: VdSceneSleepSurface | null;
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

type PairItem = { name: string; placement: string };
type WardrobeItem = { character: string; wardrobe: string };
type PropItem = { name: string; placement: string; fromShot?: number };

function parseListRows(
  value: string,
  kind: "pair" | "wardrobe" | "prop",
): PairItem[] | WardrobeItem[] | PropItem[] {
  const lines = value.split(/\r?\n/);
  const parseParts = (line: string) =>
    line
      .split("|")
      .map(part => part.trim())
      .filter(Boolean);
  if (kind === "wardrobe") {
    return lines.flatMap<WardrobeItem>(line => {
      const [character, wardrobe] = parseParts(line);
      return character && wardrobe ? [{ character, wardrobe }] : [];
    });
  }
  if (kind === "prop") {
    return lines.flatMap<PropItem>(line => {
      const [name, placement, fromShotText] = parseParts(line);
      if (!name || !placement) return [];
      const fromShot = Number(fromShotText);
      return [
        {
          name,
          placement,
          ...(Number.isInteger(fromShot) && fromShot > 0 ? { fromShot } : {}),
        },
      ];
    });
  }
  return lines.flatMap<PairItem>(line => {
    const [name, placement] = parseParts(line);
    return name && placement ? [{ name, placement }] : [];
  });
}

function formatListRows(
  value: readonly PairItem[] | readonly WardrobeItem[] | readonly PropItem[] | undefined,
  kind: "pair" | "wardrobe" | "prop",
): string {
  return (value ?? [])
    .map(item => {
      if (kind === "wardrobe") {
        const wardrobe = item as WardrobeItem;
        return `${wardrobe.character} | ${wardrobe.wardrobe}`;
      }
      const pair = item as PairItem | PropItem;
      const prop = item as PropItem;
      return `${pair.name} | ${pair.placement}${
        kind === "prop" && prop.fromShot ? ` | ${prop.fromShot}` : ""
      }`;
    })
    .join("\n");
}

function listHelperText(locale: Lang, kind: "fixed" | "props" | "wardrobe") {
  if (kind === "fixed") {
    return copy(
      locale,
      "ใส่ 1 รายการต่อบรรทัดในรูปแบบ ชื่อสิ่งของ | ตำแหน่ง เช่น เตียงนอนทรงยาว | ข้างโต๊ะ",
      "One item per line: name | placement, for example long bed | beside the desk.",
    );
  }
  if (kind === "props") {
    return copy(
      locale,
      "ใส่ 1 รายการต่อบรรทัด: ชื่อ | ตำแหน่ง | เริ่มเห็นตั้งแต่ช็อต (ถ้ามี)",
      "One item per line: name | placement | first shot (optional).",
    );
  }
  return copy(
    locale,
    "ใส่ 1 ตัวละครต่อบรรทัดในรูปแบบ ตัวละคร | เสื้อผ้า",
    "One character per line: character | wardrobe.",
  );
}

function SceneListField(props: {
  locale: Lang;
  label: string;
  description: string;
  example: string;
  value: string;
  onChange: (value: string) => void;
  kind: "fixed" | "props" | "wardrobe";
  testId: string;
}) {
  const parseKind = props.kind === "wardrobe" ? "wardrobe" : props.kind === "props" ? "prop" : "pair";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.testId}>{props.label}</Label>
      <p className="text-xs text-muted-foreground">{props.description}</p>
      <Textarea
        id={props.testId}
        data-testid={props.testId}
        value={props.value}
        onChange={event => {
          const parsed = parseListRows(event.target.value, parseKind);
          if (props.kind === "wardrobe") {
            props.onChange(formatListRows(parsed as WardrobeItem[], "wardrobe"));
          } else if (props.kind === "props") {
            props.onChange(formatListRows(parsed as PropItem[], "prop"));
          } else {
            props.onChange(formatListRows(parsed as PairItem[], "pair"));
          }
        }}
        placeholder={props.example}
        rows={3}
      />
      <p className="text-[11px] text-muted-foreground">{listHelperText(props.locale, props.kind)}</p>
    </div>
  );
}

export function VerticalDramaSceneLockDialog(props: {
  locale: Lang;
  locationKey: string;
  state?: VerticalDramaSceneVisualStateView;
  memberShotNumbers?: number[];
  saving?: boolean;
  onSubmit: (patch: VerticalDramaSceneVisualStatePatch) => void;
  onClose: () => void;
}): ReactElement {
  const normalized = useMemo(
    () => normalizeState(props.locationKey, props.state),
    [props.locationKey, props.state],
  );
  const [draft, setDraft] = useState<VerticalDramaSceneVisualStatePatch>({});

  useEffect(() => {
    setDraft({
      lightingState: normalized?.lightingState ?? "",
      fixedElements: normalized?.fixedElements ?? [],
      spatialLayout: normalized?.spatialLayout ?? "",
      stagingAxis: normalized?.stagingAxis ?? "",
      sleepSurface: normalized?.sleepSurface,
      wardrobeInScene: normalized?.wardrobeInScene ?? [],
      activeProps: normalized?.activeProps ?? [],
      paletteMood: normalized?.paletteMood ?? "",
      timeJumpSuspected: normalized?.timeJumpSuspected ?? false,
      coverageGaps: normalized?.coverageGaps ?? [],
    });
  }, [
    props.locationKey,
    props.state,
    normalized?.lightingState,
    normalized?.fixedElements,
    normalized?.spatialLayout,
    normalized?.stagingAxis,
    normalized?.sleepSurface,
    normalized?.wardrobeInScene,
    normalized?.activeProps,
    normalized?.paletteMood,
    normalized?.timeJumpSuspected,
    normalized?.coverageGaps,
  ]);

  const pendingPatch = useMemo(
    () => diffPatch(normalized, draft),
    [normalized, draft],
  );
  const memberShotNumbers = props.memberShotNumbers ?? normalized?.memberShotNumbers ?? [];
  const submit = () => props.onSubmit(pendingPatch);
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent
        className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]"
        data-testid={`vd-scene-lock-dialog-${props.locationKey}`}
      >
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
        <div
          className="min-h-0 overflow-y-auto overscroll-contain pr-1"
          data-testid={`vd-scene-lock-dialog-body-${props.locationKey}`}
        >
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
            <p className="text-xs text-muted-foreground">
              {copy(
                props.locale,
                "กำหนดว่าเป็นกลางวัน กลางคืน หรือแสงแบบใด เพื่อไม่ให้แต่ละช็อตมีเวลาไม่ตรงกัน",
                "Define day/night and lighting so the scene does not change time between shots.",
              )}
            </p>
          </div>
          <div className="space-y-2 rounded border border-sky-400/40 bg-sky-50/40 p-2 dark:bg-sky-950/20">
            <div>
              <Label>
                {copy(props.locale, "เฟอร์นิเจอร์และที่นอนหลัก", "Furniture and primary sleep surface")}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {copy(
                  props.locale,
                  "ระบุของชิ้นใหญ่ที่ต้องอยู่ในฉาก เช่น เตียงนอนทรงยาว เปล หรือโซฟา พร้อมตำแหน่งในห้อง",
                  "Describe large objects that must remain in the scene, including the bed or sleep surface.",
                )}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`vd-scene-lock-dialog-sleep-type-${props.locationKey}`}>
                  {copy(props.locale, "ประเภทที่นอน", "Sleep surface type")}
                </Label>
                <select
                  id={`vd-scene-lock-dialog-sleep-type-${props.locationKey}`}
                  data-testid={`vd-scene-lock-dialog-sleep-type-${props.locationKey}`}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={draft.sleepSurface?.type ?? ""}
                  onChange={event => {
                    const type = event.target.value as VdSceneSleepSurface["type"];
                    setDraft(current => ({
                      ...current,
                      sleepSurface: type
                        ? {
                            type,
                            name: current.sleepSurface?.name ?? "",
                            occupant: current.sleepSurface?.occupant,
                            placement: current.sleepSurface?.placement ?? "",
                          }
                        : null,
                    }));
                  }}
                >
                  <option value="">
                    {copy(props.locale, "ยังไม่ระบุ", "Not specified")}
                  </option>
                  {VD_SLEEP_SURFACE_TYPES.map(type => (
                    <option key={type} value={type}>
                      {type === "long_bed"
                        ? copy(props.locale, "เตียงนอนทรงยาว", "Long bed")
                        : type === "single_bed"
                          ? copy(props.locale, "เตียงเดี่ยว", "Single bed")
                          : type === "crib_bassinet"
                            ? copy(props.locale, "เปลเด็ก", "Crib / bassinet")
                            : type === "floor_mattress"
                              ? copy(props.locale, "ที่นอนปูพื้น", "Floor mattress")
                              : type === "sofa"
                                ? copy(props.locale, "โซฟา", "Sofa")
                                : copy(props.locale, "อื่น ๆ", "Other")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`vd-scene-lock-dialog-sleep-name-${props.locationKey}`}>
                  {copy(props.locale, "ชื่อ/รายละเอียด", "Name / detail")}
                </Label>
                <Input
                  id={`vd-scene-lock-dialog-sleep-name-${props.locationKey}`}
                  data-testid={`vd-scene-lock-dialog-sleep-name-${props.locationKey}`}
                  value={draft.sleepSurface?.name ?? ""}
                  placeholder={copy(props.locale, "เช่น เตียงนอนทรงยาวของภูมิ ไม่ใช่เปลเด็ก", "e.g. Phum's long bed, not a baby bassinet")}
                  onChange={event =>
                    setDraft(current => ({
                      ...current,
                      sleepSurface: current.sleepSurface
                        ? { ...current.sleepSurface, name: event.target.value }
                        : undefined,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`vd-scene-lock-dialog-sleep-occupant-${props.locationKey}`}>
                  {copy(props.locale, "ใครใช้/อยู่บนที่นอน", "Occupant")}
                </Label>
                <Input
                  id={`vd-scene-lock-dialog-sleep-occupant-${props.locationKey}`}
                  value={draft.sleepSurface?.occupant ?? ""}
                  placeholder={copy(props.locale, "เช่น ภูมิ", "e.g. Phum")}
                  onChange={event =>
                    setDraft(current => ({
                      ...current,
                      sleepSurface: current.sleepSurface
                        ? { ...current.sleepSurface, occupant: event.target.value }
                        : undefined,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`vd-scene-lock-dialog-sleep-placement-${props.locationKey}`}>
                  {copy(props.locale, "ตำแหน่งในห้อง", "Placement")}
                </Label>
                <Input
                  id={`vd-scene-lock-dialog-sleep-placement-${props.locationKey}`}
                  data-testid={`vd-scene-lock-dialog-sleep-placement-${props.locationKey}`}
                  value={draft.sleepSurface?.placement ?? ""}
                  placeholder={copy(props.locale, "เช่น ข้างโต๊ะเล็กด้านขวา", "e.g. beside the small desk on the right")}
                  onChange={event =>
                    setDraft(current => ({
                      ...current,
                      sleepSurface: current.sleepSurface
                        ? { ...current.sleepSurface, placement: event.target.value }
                        : undefined,
                    }))
                  }
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {copy(
                props.locale,
                "ตัวอย่าง: เตียงนอนทรงยาวของภูมิ ไม่ใช่เปลเด็ก — ค่านี้จะถูกใช้ร่วมกันกับทุกช็อตในฉาก",
                "Example: Phum's long bed, not a baby bassinet — this is shared by every shot in the scene.",
              )}
            </p>
            {draft.sleepSurface ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => setDraft(current => ({ ...current, sleepSurface: null }))}
              >
                <Trash2 aria-hidden="true" className="h-3 w-3" />
                {copy(props.locale, "ล้างข้อมูลที่นอน", "Clear sleep-surface data")}
              </Button>
            ) : null}
          </div>
          <SceneListField
            locale={props.locale}
            kind="fixed"
            label={copy(props.locale, "เฟอร์นิเจอร์/องค์ประกอบคงที่อื่น ๆ", "Other fixed furniture/elements")}
            description={copy(props.locale, "สิ่งที่ต้องอยู่ในฉากต่อเนื่องกัน เช่น หน้าต่าง โคมไฟ หรือตู้", "Objects that should remain fixed, such as windows, lamps, or cabinets.")}
            example={copy(props.locale, "เช่น หน้าต่าง | ผนังด้านซ้าย", "e.g. window | left wall")}
            value={formatListRows(draft.fixedElements as PairItem[] | undefined, "pair")}
            onChange={value => setDraft(current => ({ ...current, fixedElements: parseListRows(value, "pair") as PairItem[] }))}
            testId={`vd-scene-lock-dialog-fixed-${props.locationKey}`}
          />
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
            <p className="text-xs text-muted-foreground">
              {copy(props.locale, "บอกว่าตัวละคร เฟอร์นิเจอร์ และหน้าต่างอยู่ตรงไหน เพื่อให้มุมกล้องต่อเนื่องกัน", "Describe where characters, furniture, and windows are so camera views stay consistent.")}
            </p>
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
            <p className="text-xs text-muted-foreground">
              {copy(props.locale, "กำหนดทิศทางหรือฝั่งที่กล้องและตัวละครยึดไว้", "Define the side or direction the camera and characters keep.")}
            </p>
          </div>
          <SceneListField
            locale={props.locale}
            kind="props"
            label={copy(props.locale, "Props ที่ต้องคงอยู่", "Props to keep consistent")}
            description={copy(props.locale, "ของประกอบฉากที่ควรเห็นหรืออยู่ตำแหน่งเดิม เช่น สมุด โทรศัพท์ หรือโคมไฟ", "Props that should remain consistent, such as a notebook, phone, or lamp.")}
            example={copy(props.locale, "เช่น สมุด | บนโต๊ะ | 1", "e.g. notebook | on the desk | 1")}
            value={formatListRows(draft.activeProps as PropItem[] | undefined, "prop")}
            onChange={value => setDraft(current => ({ ...current, activeProps: parseListRows(value, "prop") as PropItem[] }))}
            testId={`vd-scene-lock-dialog-props-${props.locationKey}`}
          />
          <SceneListField
            locale={props.locale}
            kind="wardrobe"
            label={copy(props.locale, "เสื้อผ้าในฉาก", "Wardrobe in scene")}
            description={copy(props.locale, "เสื้อผ้าที่ตัวละครควรใส่ต่อเนื่องกันในฉากนี้", "Wardrobe characters should keep throughout this scene.")}
            example={copy(props.locale, "เช่น พิมพ์ชนก | เสื้อคลุมไหมพรมสีครีม", "e.g. Phimchanok | cream knit cardigan")}
            value={formatListRows(draft.wardrobeInScene as WardrobeItem[] | undefined, "wardrobe")}
            onChange={value => setDraft(current => ({ ...current, wardrobeInScene: parseListRows(value, "wardrobe") as WardrobeItem[] }))}
            testId={`vd-scene-lock-dialog-wardrobe-${props.locationKey}`}
          />
          <div className="space-y-1.5">
            <Label htmlFor={`vd-scene-lock-dialog-coverage-gaps-${props.locationKey}`}>
              {copy(props.locale, "จุดที่ต้องตรวจสอบ", "Coverage gaps to review")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {copy(
                props.locale,
                "ระบุสิ่งที่ยังไม่แน่ใจหรือมุมที่ภาพยังแสดงไม่ครบ เพื่อให้ระบบและผู้ใช้ตรวจสอบช็อตที่เกี่ยวข้อง",
                "List details that are uncertain or angles still missing so the system and user can review affected shots.",
              )}
            </p>
            <Textarea
              id={`vd-scene-lock-dialog-coverage-gaps-${props.locationKey}`}
              data-testid={`vd-scene-lock-dialog-coverage-gaps-${props.locationKey}`}
              value={(draft.coverageGaps ?? []).join("\n")}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  coverageGaps: event.target.value
                    .split(/\r?\n/)
                    .map(value => value.trim())
                    .filter(Boolean),
                }))
              }
              placeholder={copy(
                props.locale,
                "เช่น ยังไม่ยืนยันว่าหน้าต่างอยู่ด้านซ้ายของเตียง",
                "e.g. Window position relative to the bed is not confirmed",
              )}
              rows={2}
            />
            <p className="text-[11px] text-muted-foreground">
              {copy(props.locale, "ใส่ 1 จุดต่อบรรทัด; ลบข้อความทั้งหมดเมื่อตรวจสอบเรียบร้อยแล้ว", "One gap per line; clear the field when all details are confirmed.")}
            </p>
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
            <p className="text-xs text-muted-foreground">
              {copy(props.locale, "กำหนดบรรยากาศโดยรวม เช่น อบอุ่น เงียบสงบ หรือกดดัน", "Set the overall mood, such as warm, calm, or tense.")}
            </p>
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
          <p className="text-xs text-muted-foreground">
            {copy(
              props.locale,
              "การแก้ไขที่นี่จะใช้กับทุกช็อตในสถานที่เดียวกัน ภาพเดิมจะไม่ถูกลบ แต่ช็อตที่เกี่ยวข้องจะต้องสร้างใหม่จึงเห็นผล",
              "Changes here apply to every shot in this location. Existing images stay available, but affected shots need regeneration to show the change.",
            )}
          </p>
          <div
            className="rounded border border-amber-400/50 bg-amber-50/60 px-2 py-1.5 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"
            data-testid={`vd-scene-lock-dialog-impact-${props.locationKey}`}
          >
            {Object.keys(pendingPatch).length > 0
              ? copy(
                  props.locale,
                  `กำลังแก้ไข ${Object.keys(pendingPatch).length} รายการ มีผลกับ ${memberShotNumbers.length} ช็อต ภาพเดิมยังอยู่และจะมีป้ายให้สร้างใหม่`,
                  `You are changing ${Object.keys(pendingPatch).length} field(s) for ${memberShotNumbers.length} shot(s). Existing images stay available and will be marked for regeneration.`,
                )
              : copy(
                  props.locale,
                  `ยังไม่มีการเปลี่ยนแปลง มีผลกับ ${memberShotNumbers.length} ช็อตเมื่อบันทึก`,
                  `No changes yet. Saving will apply to ${memberShotNumbers.length} shot(s).`,
                )}
          </div>
          </div>
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
  memberShotNumbers?: number[];
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
  const [open, setOpen] = useState(false);
  if (props.enabled !== true) return null;
  const memberShotNumbers = props.memberShotNumbers ?? normalized?.memberShotNumbers ?? [];

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
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="flex flex-col gap-1.5 rounded border border-border/60 bg-muted/20 p-2"
      data-testid={`vd-scene-lock-${props.locationKey}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left text-xs font-medium outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`vd-scene-lock-toggle-${props.locationKey}`}
            aria-label={copy(
              props.locale,
              "เปิดหรือยุบข้อมูลกลางของฉาก",
              "Expand or collapse shared scene visual state",
            )}
          >
            <ChevronDown
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            />
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate">
                {copy(
                  props.locale,
                  "Scene Visual State — ข้อมูลกลางของฉากนี้",
                  "Scene Visual State — Shared scene facts",
                )}
              </span>
              <span className="block text-[11px] font-normal text-muted-foreground">
                {copy(
                  props.locale,
                  `แก้ไขครั้งเดียว ใช้กับทุกช็อตในฉากนี้ (${memberShotNumbers.length} ช็อต)`,
                  `Edit once for every shot in this scene (${memberShotNumbers.length} shots)`,
                )}
              </span>
            </span>
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-1.5">
          <span
            className="rounded border px-1.5 py-0.5 text-[10px]"
            data-testid={`vd-scene-lock-status-${props.locationKey}`}
          >
            {status}
          </span>
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
              {copy(props.locale, "แก้ไขข้อมูลฉาก", "Edit scene facts")}
            </Button>
          ) : null}
        </div>
      </div>
      {summary ? (
        <p
          className="line-clamp-2 text-xs text-muted-foreground"
          data-testid={`vd-scene-lock-summary-${props.locationKey}`}
        >
          {summary}
        </p>
      ) : null}
      <CollapsibleContent
        className="space-y-2 border-t border-border/60 pt-2"
        data-testid={`vd-scene-lock-content-${props.locationKey}`}
      >
        <p className="text-xs text-muted-foreground">
          {copy(
            props.locale,
            "ข้อมูลชุดนี้เป็นข้อกำหนดกลางของฉาก ใช้ร่วมกันกับทุกช็อตด้านล่าง คุณแก้ไขรายละเอียดที่ภาพสร้างผิดหรือไม่ตรงกับเรื่องย่อได้ที่นี่",
            "These are the shared scene facts used by every shot below. Correct details that the generated image got wrong or that do not match the synopsis here.",
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{copy(props.locale, "ใช้กับช็อต:", "Member shots:")}</span>
          <span className="font-medium text-foreground">
            {memberShotNumbers.join(", ") || copy(props.locale, "ยังไม่มี", "None")}
          </span>
        </div>
        <div
          className="grid gap-1.5 text-[11px] sm:grid-cols-2"
          data-testid={`vd-scene-lock-facts-${props.locationKey}`}
        >
          <p>
            <span className="font-medium">{copy(props.locale, "แสง/เวลา: ", "Lighting/time: ")}</span>
            {normalized?.lightingState || copy(props.locale, "ยังไม่ระบุ", "Not specified")}
          </p>
          <p>
            <span className="font-medium">{copy(props.locale, "ผังฉาก: ", "Layout: ")}</span>
            {normalized?.spatialLayout || copy(props.locale, "ยังไม่ระบุ", "Not specified")}
          </p>
          <p>
            <span className="font-medium">{copy(props.locale, "แกนการจัดฉาก: ", "Staging axis: ")}</span>
            {normalized?.stagingAxis || copy(props.locale, "ยังไม่ระบุ", "Not specified")}
          </p>
          <p>
            <span className="font-medium">{copy(props.locale, "โทน/อารมณ์: ", "Palette/mood: ")}</span>
            {normalized?.paletteMood || copy(props.locale, "ยังไม่ระบุ", "Not specified")}
          </p>
          <p className="sm:col-span-2">
            <span className="font-medium">{copy(props.locale, "องค์ประกอบคงที่: ", "Fixed elements: ")}</span>
            {(normalized?.fixedElements ?? [])
              .map(item => `${item.name} — ${item.placement}`)
              .join(" • ") || copy(props.locale, "ยังไม่ระบุ", "Not specified")}
          </p>
          <p className="sm:col-span-2">
            <span className="font-medium">{copy(props.locale, "Props: ", "Props: ")}</span>
            {(normalized?.activeProps ?? [])
              .map(item => `${item.name} — ${item.placement}`)
              .join(" • ") || copy(props.locale, "ยังไม่ระบุ", "Not specified")}
          </p>
          <p className="sm:col-span-2">
            <span className="font-medium">{copy(props.locale, "เสื้อผ้า: ", "Wardrobe: ")}</span>
            {(normalized?.wardrobeInScene ?? [])
              .map(item => `${item.character} — ${item.wardrobe}`)
              .join(" • ") || copy(props.locale, "ยังไม่ระบุ", "Not specified")}
          </p>
          <p className="sm:col-span-2">
            <span className="font-medium">{copy(props.locale, "จุดที่ต้องตรวจสอบ: ", "Coverage gaps: ")}</span>
            {(normalized?.coverageGaps ?? []).join(" • ") || copy(props.locale, "ไม่มี", "None")}
          </p>
          <p>
            <span className="font-medium">{copy(props.locale, "กระโดดเวลา: ", "Time jump: ")}</span>
            {normalized?.timeJumpSuspected
              ? copy(props.locale, "สงสัย", "Suspected")
              : copy(props.locale, "ไม่พบ", "Not suspected")}
          </p>
        </div>
        {normalized?.sleepSurface ? (
          <p className="rounded bg-sky-50 px-2 py-1.5 text-xs text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
            {copy(props.locale, "ที่นอนหลัก: ", "Primary sleep surface: ")}
            {normalized.sleepSurface.name} ({normalized.sleepSurface.type}) — {normalized.sleepSurface.placement}
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          {copy(
            props.locale,
            "การบันทึกจะไม่ลบภาพเดิม แต่ช็อตที่เกี่ยวข้องจะถูกทำเครื่องหมายว่าต้องสร้างใหม่",
            "Saving does not delete existing images, but affected shots will be marked for regeneration.",
          )}
        </p>
      </CollapsibleContent>
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
            normalized?.revision ?? 0,
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
          ? copy(props.locale, "AI สร้างใหม่ทับของเดิม (มีค่าใช้จ่าย)", "AI re-plan and overwrite (paid)")
          : copy(props.locale, "ให้ AI วางแผนข้อมูลฉาก (มีค่าใช้จ่าย)", "Ask AI to plan scene facts (paid)")}
      </Button>
      {editing ? (
        <VerticalDramaSceneLockDialog
          locale={props.locale}
          locationKey={props.locationKey}
          state={props.state}
          memberShotNumbers={memberShotNumbers}
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
    </Collapsible>
  );
}
