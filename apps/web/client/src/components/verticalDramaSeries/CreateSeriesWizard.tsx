/**
 * CreateSeriesWizard (spec feature 131, section 03 · §8.2).
 *
 * 6-step Create-Series Wizard, extracted from VerticalDramaSeriesPage so it can
 * be mounted once by VerticalDramaShell and triggered from any of the three
 * vertical-drama pages. Runs in DRY-RUN mode — reaching Review and confirming
 * creates a series shell only and never triggers paid generation.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Loader2, Search, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pickCopy, verticalDramaCopy, wizardSteps } from "./verticalDramaCopy";

interface WizardState {
  title: string;
  genre: string;
  logline: string;
  targetEpisodeCount: string;
  locale: "th" | "en";
  targetDurationSeconds: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: string;
  visualBible: string;
  productTieInEnabled: boolean;
  productName: string;
  productId?: string;
  productImageUrl?: string;
  forbiddenClaims: string;
}

const INITIAL_WIZARD: WizardState = {
  title: "",
  genre: "",
  logline: "",
  targetEpisodeCount: "10",
  locale: "th",
  targetDurationSeconds: "60",
  mainPlot: "",
  seasonArc: "",
  tone: "",
  cliffhangerStyle: "",
  characters: "",
  visualBible: "",
  productTieInEnabled: false,
  productName: "",
  forbiddenClaims: "",
};

export function CreateSeriesWizard({
  open,
  lang,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  lang: "th" | "en";
  onOpenChange: (open: boolean) => void;
  onCreated: (seriesId: string) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<WizardState>(INITIAL_WIZARD);
  const [presetSearch, setPresetSearch] = useState("");
  const [presetCategory, setPresetCategory] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");

  const presetsQuery = trpc.verticalDramaSeries.listGenrePresets.useQuery({ locale: lang });
  const presets = presetsQuery.data?.presets ?? [];
  const presetCategories = useMemo(
    () => Array.from(new Set(presets.map((p) => p.category))),
    [presets],
  );
  const filteredPresets = useMemo(() => {
    const q = presetSearch.trim().toLowerCase();
    return presets.filter((p) => {
      const matchesQuery = !q || p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      const matchesCategory = presetCategory === "all" || p.category === presetCategory;
      return matchesQuery && matchesCategory;
    });
  }, [presets, presetSearch, presetCategory]);

  const productsQuery = trpc.marketplaceCapture.listProducts.useQuery(
    { query: productSearch || undefined, limit: 20 },
    { enabled: form.productTieInEnabled },
  );
  const products = productsQuery.data ?? [];

  const generateStoryMutation = trpc.verticalDramaSeries.generateStoryBible.useMutation({
    onSuccess: (data: { creditsUsed: number }) => {
      toast.success(
        lang === "th"
          ? `สร้างเนื้อเรื่องเต็มแล้ว (ใช้ ${data.creditsUsed} เครดิต)`
          : `Full story generated (${data.creditsUsed} credits used)`,
      );
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message ||
          (lang === "th"
            ? "สร้างเนื้อเรื่องเต็มไม่สำเร็จ — ลองใหม่ได้จากหน้าซีรีย์"
            : "Full story generation failed — retry from the series page"),
      );
    },
  });

  const createMutation = trpc.verticalDramaSeries.create.useMutation({
    onSuccess: (data: { series: { id: string } }) => {
      toast.success(
        lang === "th" ? "สร้างโครงซีรีย์แล้ว (โหมดวางแผน)" : "Series shell created (planning mode)",
      );
      const seriesId = data.series.id;
      setForm(INITIAL_WIZARD);
      setStepIndex(0);
      onCreated(seriesId);
      // Best-effort: immediately expand the wizard's bible into a full story.
      // A failure here is non-fatal — the series shell still exists and the
      // user can retry "Generate story" from the series detail page. This
      // runs in the background after the dialog has already closed.
      generateStoryMutation.mutate({ seriesId });
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || (lang === "th" ? "สร้างไม่สำเร็จ" : "Create failed"));
    },
  });

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function applyPreset(preset: (typeof presets)[number]) {
    set("genre", preset.title);
    set("logline", preset.logline);
    set("mainPlot", preset.mainPlot);
    set("seasonArc", preset.seasonArc);
    set("tone", preset.tone);
    set("cliffhangerStyle", preset.cliffhangerStyle);
    set(
      "characters",
      preset.characters.map((c) => `${c.name} — ${c.role}: ${c.description}`).join("\n"),
    );
    set("visualBible", preset.visualBible);
    toast.success(
      lang === "th"
        ? `นำ Preset "${preset.title}" มาใช้แล้ว — แก้ไขต่อได้ทุกแท็บ`
        : `Applied preset "${preset.title}" — edit any tab freely`,
    );
  }

  // All steps are always reachable (freely-navigable tabs) — this only drives
  // a per-step completion badge so the user can see what's filled vs. still
  // needs attention before creating the series.
  const stepComplete = useMemo(() => {
    return [
      form.title.trim().length > 0 && Number(form.targetEpisodeCount) > 0,
      form.mainPlot.trim().length > 0 || form.seasonArc.trim().length > 0,
      form.characters.trim().length > 0,
      form.visualBible.trim().length > 0,
      !form.productTieInEnabled || form.productName.trim().length > 0,
      true, // review tab has nothing of its own to "complete"
    ];
  }, [form]);

  // Hard requirement to actually create the series (title + episode count) —
  // this only gates the final Create action, never tab navigation.
  const createValid = form.title.trim().length > 0 && Number(form.targetEpisodeCount) > 0;
  const createBlockedReason = !createValid
    ? lang === "th"
      ? "กรุณากรอกชื่อซีรีย์และจำนวนตอนที่ถูกต้องในแท็บ 'ตั้งค่าพื้นฐาน'"
      : "Enter a series title and a valid episode count in the 'Basic setup' tab"
    : "";

  const isLast = stepIndex === wizardSteps.length - 1;

  const handleCreate = () => {
    if (createMutation.isPending || generateStoryMutation.isPending) return;
    createMutation.mutate({
      title: form.title.trim(),
      locale: form.locale,
      genre: form.genre.trim() || undefined,
      tone: form.tone.trim() || undefined,
      targetEpisodeCount: Number(form.targetEpisodeCount) || undefined,
      defaultEpisodeDurationSeconds: Number(form.targetDurationSeconds) || undefined,
      bible:
        form.logline || form.mainPlot || form.seasonArc || form.visualBible
          ? {
              logline: form.logline,
              mainPlot: form.mainPlot,
              seasonArc: form.seasonArc,
              visualStyle: form.visualBible,
              cliffhangerStyle: form.cliffhangerStyle,
              charactersDraft: form.characters,
            }
          : undefined,
      productTieIn: form.productTieInEnabled
        ? {
            enabled: true,
            productName: form.productName || undefined,
            productId: form.productId || undefined,
            productSource: form.productId ? "marketplace" : "manual",
            forbiddenClaims: form.forbiddenClaims
              ? form.forbiddenClaims.split(",").map((s) => s.trim()).filter(Boolean)
              : [],
          }
        : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Responsive width tiers — must use `sm:`+ variants to override the base
          DialogContent's `sm:max-w-lg` cap (a non-responsive max-w-* would lose the
          cascade at sm+ and the dialog would stay ~512px on desktop).
          mobile: ~full width · tablet: 3xl · laptop: 5xl · desktop: 6xl. */}
      <DialogContent className="flex h-[92dvh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:h-[88dvh] sm:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
        <div className="shrink-0 border-b p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{pickCopy(lang, verticalDramaCopy.createSeries)}</DialogTitle>
            <DialogDescription>{pickCopy(lang, verticalDramaCopy.planningOnly)}</DialogDescription>
          </DialogHeader>

          {/* Stepper — every step is always clickable; the dot shows completion, not access. */}
          <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="wizard steps">
            {wizardSteps.map((step, i) => (
              <li key={step.id}>
                <button
                  type="button"
                  aria-current={i === stepIndex ? "step" : undefined}
                  onClick={() => setStepIndex(i)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                    i === stepIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent",
                  )}
                >
                  {i + 1}. {pickCopy(lang, step)}
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      stepComplete[i]
                        ? "bg-emerald-500"
                        : i === stepIndex
                          ? "bg-primary-foreground/60"
                          : "bg-amber-500",
                    )}
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <WizardStep
            stepIndex={stepIndex}
            lang={lang}
            form={form}
            set={set}
            presets={filteredPresets as GenrePreset[]}
            presetsLoading={presetsQuery.isLoading}
            presetSearch={presetSearch}
            onPresetSearchChange={setPresetSearch}
            presetCategory={presetCategory}
            onPresetCategoryChange={setPresetCategory}
            presetCategories={presetCategories}
            onApplyPreset={applyPreset}
            products={products as MarketplaceProductOption[]}
            productsLoading={productsQuery.isLoading}
            productSearch={productSearch}
            onProductSearchChange={setProductSearch}
          />
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t p-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button
                variant="outline"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                disabled={createMutation.isPending || generateStoryMutation.isPending}
              >
                {pickCopy(lang, verticalDramaCopy.back)}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLast && createBlockedReason && (
              <span className="text-xs text-destructive" role="note">
                {createBlockedReason}
              </span>
            )}
            {isLast ? (
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || generateStoryMutation.isPending || !createValid}
                className="gap-2"
              >
                {(createMutation.isPending || generateStoryMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                {createMutation.isPending
                  ? lang === "th"
                    ? "กำลังสร้างซีรีย์…"
                    : "Creating series…"
                  : generateStoryMutation.isPending
                    ? lang === "th"
                      ? "กำลังสร้างเนื้อเรื่องเต็ม (ใช้เครดิต)…"
                      : "Generating full story (uses credits)…"
                    : lang === "th"
                      ? "สร้างซีรีย์และเนื้อเรื่องเต็ม"
                      : "Create series & generate story"}
              </Button>
            ) : (
              <Button
                onClick={() => setStepIndex((i) => Math.min(wizardSteps.length - 1, i + 1))}
              >
                {lang === "th" ? "ถัดไป" : "Next"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface GenrePresetCharacter {
  name: string;
  role: string;
  description: string;
}

interface GenrePreset {
  id: string;
  title: string;
  category: string;
  logline: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: GenrePresetCharacter[];
  visualBible: string;
  scope: "global" | "private";
}

interface MarketplaceProductOption {
  id: string;
  productName: string;
  imageUrl?: string | null;
  platform?: string | null;
  priceCurrent?: string | number | null;
  currency?: string | null;
}

function WizardStep({
  stepIndex,
  lang,
  form,
  set,
  presets,
  presetsLoading,
  presetSearch,
  onPresetSearchChange,
  presetCategory,
  onPresetCategoryChange,
  presetCategories,
  onApplyPreset,
  products,
  productsLoading,
  productSearch,
  onProductSearchChange,
}: {
  stepIndex: number;
  lang: "th" | "en";
  form: WizardState;
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
  presets: GenrePreset[];
  presetsLoading: boolean;
  presetSearch: string;
  onPresetSearchChange: (value: string) => void;
  presetCategory: string;
  onPresetCategoryChange: (value: string) => void;
  presetCategories: string[];
  onApplyPreset: (preset: GenrePreset) => void;
  products: MarketplaceProductOption[];
  productsLoading: boolean;
  productSearch: string;
  onProductSearchChange: (value: string) => void;
}) {
  const th = lang === "th";
  switch (stepIndex) {
    case 0:
      return (
        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {th ? "เริ่มจาก Preset แนวเรื่อง (ไม่บังคับ)" : "Start from a genre preset (optional)"}
            </div>
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={presetSearch}
                onChange={(e) => onPresetSearchChange(e.target.value)}
                placeholder={th ? "ค้นหา preset ตามชื่อหรือหมวด…" : "Search presets by title or category…"}
                className="pl-9"
              />
            </div>
            <Select value={presetCategory} onValueChange={onPresetCategoryChange}>
              <SelectTrigger className="mb-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{th ? "ทุกหมวดหมู่" : "All categories"}</SelectItem>
                {presetCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {presetsLoading ? (
              <p className="text-xs text-muted-foreground">{th ? "กำลังโหลด…" : "Loading…"}</p>
            ) : presets.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {th ? "ไม่พบ preset ที่ตรงกัน" : "No matching presets"}
              </p>
            ) : (
              <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onApplyPreset(preset)}
                    className={cn(
                      "rounded-md border bg-background p-2.5 text-left text-xs transition-colors hover:border-primary hover:bg-accent",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium">{preset.title}</p>
                      {preset.scope === "private" && (
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px] leading-4"
                        >
                          {th ? "ของฉัน" : "Mine"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground">{preset.logline}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Field label={th ? "ชื่อซีรีย์ *" : "Series title *"}>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={th ? "แนวเรื่อง" : "Genre"}>
              <Input value={form.genre} onChange={(e) => set("genre", e.target.value)} />
            </Field>
            <Field label={th ? "จำนวนตอนเป้าหมาย" : "Target episode count"}>
              <Input
                type="number"
                min={1}
                value={form.targetEpisodeCount}
                onChange={(e) => set("targetEpisodeCount", e.target.value)}
              />
            </Field>
          </div>
          <Field label={th ? "เรื่องย่อ (logline)" : "Logline"}>
            <Textarea value={form.logline} onChange={(e) => set("logline", e.target.value)} rows={2} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={th ? "ภาษา" : "Language"}>
              <Select value={form.locale} onValueChange={(v) => set("locale", v as "th" | "en")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="th">ไทย</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={th ? "ความยาวต่อตอน (วินาที)" : "Target duration (sec)"}>
              <Input
                type="number"
                min={1}
                value={form.targetDurationSeconds}
                onChange={(e) => set("targetDurationSeconds", e.target.value)}
              />
            </Field>
          </div>
        </div>
      );
    case 1:
      return (
        <div className="grid gap-4">
          <Field label={th ? "โครงเรื่องหลัก" : "Main plot"}>
            <Textarea value={form.mainPlot} onChange={(e) => set("mainPlot", e.target.value)} rows={3} />
          </Field>
          <Field label={th ? "โครงซีซัน" : "Season arc"}>
            <Textarea value={form.seasonArc} onChange={(e) => set("seasonArc", e.target.value)} rows={2} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={th ? "โทน" : "Tone"}>
              <Input value={form.tone} onChange={(e) => set("tone", e.target.value)} />
            </Field>
            <Field label={th ? "สไตล์ตอนจบค้าง (cliffhanger)" : "Cliffhanger style"}>
              <Input
                value={form.cliffhangerStyle}
                onChange={(e) => set("cliffhangerStyle", e.target.value)}
              />
            </Field>
          </div>
        </div>
      );
    case 2:
      return (
        <Field label={th ? "ตัวละคร / บทบาท / ความสัมพันธ์ (หนึ่งบรรทัดต่อหนึ่งตัว)" : "Characters / roles / relationships (one per line)"}>
          <Textarea value={form.characters} onChange={(e) => set("characters", e.target.value)} rows={6} />
        </Field>
      );
    case 3:
      return (
        <Field label={th ? "วิชวลไบเบิล / สไตล์ภาพ (ร่าง)" : "Visual bible / style notes (draft)"}>
          <Textarea value={form.visualBible} onChange={(e) => set("visualBible", e.target.value)} rows={6} />
        </Field>
      );
    case 4:
      return (
        <div className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.productTieInEnabled}
              onChange={(e) => set("productTieInEnabled", e.target.checked)}
            />
            {th ? "เปิดใช้สินค้าผูกเรื่อง (Product tie-in)" : "Enable product tie-in"}
          </label>
          {form.productTieInEnabled && (
            <>
              {form.productId ? (
                <div className="flex items-center gap-3 rounded-md border bg-background p-2.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                    {form.productImageUrl ? (
                      <img
                        src={form.productImageUrl}
                        alt={form.productName || "Product"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{form.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {th ? "สินค้าจากคลังสินค้า" : "Linked from saved products"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      set("productId", undefined);
                      set("productImageUrl", undefined);
                    }}
                    aria-label={th ? "ยกเลิกการเลือกสินค้า" : "Clear selected product"}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="relative mb-2">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      value={productSearch}
                      onChange={(e) => onProductSearchChange(e.target.value)}
                      placeholder={th ? "ค้นหาสินค้าที่บันทึกไว้..." : "Search saved products..."}
                      className="pl-9"
                    />
                  </div>
                  {productsLoading ? (
                    <p className="text-xs text-muted-foreground">{th ? "กำลังโหลด…" : "Loading…"}</p>
                  ) : products.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {th ? "ไม่พบสินค้าที่บันทึกไว้" : "No saved products found"}
                    </p>
                  ) : (
                    <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                      {products.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            set("productId", product.id);
                            set("productName", product.productName);
                            set("productImageUrl", product.imageUrl ?? undefined);
                          }}
                          className={cn(
                            "flex items-center gap-2 rounded-md border bg-background p-2.5 text-left text-xs transition-colors hover:border-primary hover:bg-accent",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.productName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{product.productName}</p>
                            <p className="mt-0.5 truncate text-muted-foreground">
                              {[product.priceCurrent, product.currency].filter(Boolean).join(" ") || "-"}
                              {product.platform ? ` · ${product.platform}` : ""}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Field label={th ? "หรือกรอกชื่อสินค้าเอง" : "Or enter a product name manually"}>
                <Input value={form.productName} onChange={(e) => set("productName", e.target.value)} />
              </Field>
              <Field label={th ? "ข้อความต้องห้าม (คั่นด้วยจุลภาค)" : "Forbidden claims (comma-separated)"}>
                <Input
                  value={form.forbiddenClaims}
                  onChange={(e) => set("forbiddenClaims", e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
      );
    case 5:
    default:
      return (
        <div className="grid gap-3 text-sm">
          <p className="rounded-md bg-muted p-3 text-muted-foreground">
            {th
              ? "ตรวจสอบก่อนสร้าง: การกดสร้างจะสร้างเฉพาะโครงซีรีย์ (dry-run) เท่านั้น ยังไม่มีการสร้างสื่อที่มีค่าใช้จ่าย"
              : "Review before creating: confirming creates a series shell only (dry-run). No paid generation is triggered."}
          </p>
          <ReviewRow label={th ? "ชื่อ" : "Title"} value={form.title || "-"} />
          <ReviewRow label={th ? "แนวเรื่อง" : "Genre"} value={form.genre || "-"} />
          <ReviewRow
            label={th ? "จำนวนตอน" : "Episodes"}
            value={form.targetEpisodeCount || "-"}
          />
          <ReviewRow label={th ? "ภาษา" : "Language"} value={form.locale} />
          <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-b-0">
            <span className="text-muted-foreground">{th ? "สินค้าผูกเรื่อง" : "Product tie-in"}</span>
            <span className="flex items-center gap-2 font-medium">
              {form.productTieInEnabled && form.productImageUrl && (
                <img
                  src={form.productImageUrl}
                  alt={form.productName || "Product"}
                  className="h-6 w-6 shrink-0 rounded object-cover"
                />
              )}
              {form.productTieInEnabled
                ? form.productName || (th ? "เปิดใช้งาน" : "Enabled")
                : th
                  ? "ไม่มี"
                  : "None"}
            </span>
          </div>
        </div>
      );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
