/**
 * VerticalDramaCharacterStockPanel (spec feature 131, section-05 · §7.1 / §7.2 / §7.3).
 *
 * The durable per-series character-stock surface: the character roster on the
 * left, and — for the selected character — its reference-asset stock (approved /
 * pending / stale) plus the durable stock manifest on the right. Add a character,
 * import an existing canonical media asset as a reference, then approve / reject /
 * mark-stale it through the state machine. Nothing here triggers paid generation.
 *
 * Consumes only `trpc.verticalDramaCharacters.*`. Covers the section State Matrix
 * (loading / empty / error / selected) and Accessibility Acceptance:
 *  - status is conveyed by icon + text, never color alone,
 *  - every control has an accessible name,
 *  - inline Thai/English copy driven by the shared language hook.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useVerticalDramaLang } from "@/components/verticalDramaSeries/verticalDramaCopy";
import type {
  VerticalDramaCharacterAsset,
  VerticalDramaCharacterAssetState,
} from "@shared/verticalDramaSeries/characterAssets";

/* -------------------------------------------------------------------------- */
/* Localized copy                                                             */
/* -------------------------------------------------------------------------- */

type Lang = "th" | "en";
const t = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);

/** Icon + label per asset state — status is never color-only. */
const STATE_META: Record<
  VerticalDramaCharacterAssetState,
  { icon: typeof CheckCircle2; th: string; en: string; tone: string }
> = {
  approved: { icon: CheckCircle2, th: "อนุมัติแล้ว", en: "Approved", tone: "text-emerald-600 dark:text-emerald-400" },
  rejected: { icon: XCircle, th: "ปฏิเสธ", en: "Rejected", tone: "text-destructive" },
  stale: { icon: AlertTriangle, th: "ต้องรีเฟรช", en: "Stale", tone: "text-amber-600 dark:text-amber-400" },
  draft: { icon: Clock, th: "ฉบับร่าง", en: "Draft", tone: "text-muted-foreground" },
  generated: { icon: Clock, th: "สร้างแล้ว (รออนุมัติ)", en: "Generated (pending)", tone: "text-muted-foreground" },
  imported: { icon: Clock, th: "นำเข้าแล้ว (รออนุมัติ)", en: "Imported (pending)", tone: "text-muted-foreground" },
};

function AssetStateBadge({ state, lang }: { state: VerticalDramaCharacterAssetState; lang: Lang }) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", meta.tone)}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {t(lang, meta.th, meta.en)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Props                                                                       */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaCharacterStockPanelProps {
  seriesId: string;
  /** When true (archived series), all mutating controls are disabled. */
  readOnly?: boolean;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export function VerticalDramaCharacterStockPanel({
  seriesId,
  readOnly = false,
  className,
}: VerticalDramaCharacterStockPanelProps) {
  const lang = useVerticalDramaLang();
  const utils = trpc.useUtils();

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newRole, setNewRole] = useState("");
  const [importMediaAssetId, setImportMediaAssetId] = useState("");
  /** Newly-generated portrait URLs keyed by characterId — only populated for
   *  this session's freshly-generated images (see `generateImageMutation`).
   *  Pre-existing assets without a resolvable URL keep their plain-text
   *  `Media #{id}` rendering; this is a pragmatic, session-local cache. */
  const [generatedImageUrls, setGeneratedImageUrls] = useState<
    Record<string, { imageUrl: string; mediaAssetId: string }>
  >({});

  const listQuery = trpc.verticalDramaCharacters.listCharacters.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 15_000 },
  );

  const invalidate = () =>
    utils.verticalDramaCharacters.listCharacters.invalidate({ seriesId });

  const onError = (err: { message?: string }) =>
    toast.error(err?.message ?? t(lang, "เกิดข้อผิดพลาด", "Something went wrong"));

  const createMutation = trpc.verticalDramaCharacters.createCharacter.useMutation({
    onSuccess: (res) => {
      setNewName("");
      setNewKey("");
      setNewRole("");
      setSelectedCharacterId(res.character.characterId);
      invalidate();
      toast.success(t(lang, "เพิ่มตัวละครแล้ว", "Character added"));
    },
    onError,
  });

  const linkMutation = trpc.verticalDramaCharacters.linkAsset.useMutation({
    onSuccess: () => {
      setImportMediaAssetId("");
      invalidate();
      toast.success(t(lang, "นำเข้าอ้างอิงแล้ว", "Reference imported"));
    },
    onError,
  });

  const approveMutation = trpc.verticalDramaCharacters.approveAsset.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t(lang, "อนุมัติอ้างอิงแล้ว", "Reference approved"));
    },
    onError,
  });

  const transitionMutation = trpc.verticalDramaCharacters.transitionAsset.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t(lang, "อัปเดตสถานะแล้ว", "Status updated"));
    },
    onError,
  });

  const markStaleMutation = trpc.verticalDramaCharacters.markStale.useMutation({
    onSuccess: (res) => {
      invalidate();
      toast.success(
        t(lang, `ทำเครื่องหมายรีเฟรช ${res.staleCount} รายการ`, `${res.staleCount} marked stale`),
      );
    },
    onError,
  });

  const generateImageMutation = trpc.verticalDramaCharacters.generateCharacterImage.useMutation({
    onSuccess: (res, variables) => {
      setGeneratedImageUrls((prev) => ({
        ...prev,
        [variables.characterId]: { imageUrl: res.imageUrl, mediaAssetId: res.mediaAssetId },
      }));
      invalidate();
      const totalCredits = res.creditsUsed.promptGeneration + res.creditsUsed.imageRender;
      toast.success(
        t(
          lang,
          `สร้างภาพตัวละครแล้ว (ใช้ ${totalCredits} เครดิต)`,
          `Character image generated (${totalCredits} credits used)`,
        ),
      );
    },
    onError,
  });

  const characters = listQuery.data?.characters ?? [];
  const manifest = listQuery.data?.manifest;
  const assets = (manifest?.assets ?? []) as VerticalDramaCharacterAsset[];

  // Auto-select the first character once data loads.
  const effectiveSelectedId = useMemo(() => {
    if (selectedCharacterId && characters.some((c) => c.characterId === selectedCharacterId)) {
      return selectedCharacterId;
    }
    return characters[0]?.characterId ?? null;
  }, [selectedCharacterId, characters]);

  const selectedCharacter = characters.find((c) => c.characterId === effectiveSelectedId) ?? null;
  const selectedAssets = assets.filter(
    (a) => effectiveSelectedId != null && a.characterId === effectiveSelectedId,
  );
  const mutating =
    createMutation.isPending ||
    linkMutation.isPending ||
    approveMutation.isPending ||
    transitionMutation.isPending ||
    markStaleMutation.isPending ||
    generateImageMutation.isPending;

  /* ---- Loading ---- */
  if (listQuery.isLoading) {
    return (
      <section aria-busy="true" aria-label={t(lang, "สต็อกตัวละคร", "Character stock")} className={cn("grid gap-4", className)}>
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </section>
    );
  }

  /* ---- Error ---- */
  if (listQuery.isError) {
    return (
      <Card className={cn("border-destructive/40", className)}>
        <CardContent role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {listQuery.error?.message ?? t(lang, "โหลดสต็อกตัวละครไม่สำเร็จ", "Failed to load character stock")}
          </p>
          <Button variant="outline" onClick={() => listQuery.refetch()}>
            {t(lang, "ลองอีกครั้ง", "Retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-label={t(lang, "สต็อกตัวละคร", "Character stock")} className={cn("flex flex-col gap-4", className)}>
      {/* Manifest summary */}
      {manifest && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 py-3 text-sm">
            <span className="font-medium">{t(lang, "แมนิเฟสต์สต็อก", "Stock manifest")}</span>
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              {t(lang, "อนุมัติ", "Approved")}: {manifest.approvedCount}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock aria-hidden="true" className="h-4 w-4" />
              {t(lang, "รอดำเนินการ", "Pending")}: {manifest.pendingCount}
            </span>
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              {t(lang, "ต้องรีเฟรช", "Stale")}: {manifest.staleCount}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        {/* Roster + add-character */}
        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t(lang, "ตัวละครในซีรีย์", "Series characters")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 p-2">
              {characters.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  {t(lang, "ยังไม่มีตัวละคร", "No characters yet")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1" role="listbox" aria-label={t(lang, "รายชื่อตัวละคร", "Character list")}>
                  {characters.map((c: (typeof characters)[number]) => {
                    const active = c.characterId === effectiveSelectedId;
                    const generatingThis =
                      generateImageMutation.isPending &&
                      generateImageMutation.variables?.characterId === c.characterId;
                    return (
                      <li key={c.characterId} className="flex items-center gap-1">
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => setSelectedCharacterId(c.characterId)}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1",
                            active ? "bg-muted font-medium" : "hover:bg-muted/60",
                          )}
                        >
                          <User aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{c.name}</span>
                          {c.role && (
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              {c.role}
                            </Badge>
                          )}
                        </button>
                        {!readOnly && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            disabled={mutating}
                            aria-label={t(lang, "สร้างภาพตัวละคร", "Generate character image")}
                            title={t(lang, "สร้างภาพตัวละคร", "Generate character image")}
                            onClick={() =>
                              generateImageMutation.mutate({ seriesId, characterId: c.characterId })
                            }
                          >
                            {generatingThis ? (
                              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {!readOnly && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t(lang, "เพิ่มตัวละคร", "Add character")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="vd-char-name" className="text-xs">
                    {t(lang, "ชื่อ", "Name")}
                  </Label>
                  <Input
                    id="vd-char-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t(lang, "เช่น มินา", "e.g. Mina")}
                    maxLength={255}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="vd-char-key" className="text-xs">
                    {t(lang, "คีย์ (ตัวระบุ)", "Key (identifier)")}
                  </Label>
                  <Input
                    id="vd-char-key"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="mina_lead"
                    maxLength={64}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="vd-char-role" className="text-xs">
                    {t(lang, "บทบาท (ไม่บังคับ)", "Role (optional)")}
                  </Label>
                  <Input
                    id="vd-char-role"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    placeholder={t(lang, "นางเอก", "Protagonist")}
                    maxLength={100}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="mt-1 gap-2"
                  disabled={mutating || newName.trim() === "" || newKey.trim() === ""}
                  onClick={() =>
                    createMutation.mutate({
                      seriesId,
                      name: newName.trim(),
                      characterKey: newKey.trim(),
                      role: newRole.trim() || undefined,
                    })
                  }
                >
                  {createMutation.isPending ? (
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  )}
                  {t(lang, "เพิ่มตัวละคร", "Add character")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Selected character detail */}
        <div className="flex flex-col gap-3">
          {!selectedCharacter ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <User aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {characters.length === 0
                    ? t(lang, "เพิ่มตัวละครแรกเพื่อเริ่มสร้างสต็อกอ้างอิง", "Add the first character to start the reference stock.")
                    : t(lang, "เลือกตัวละครเพื่อดูอ้างอิง", "Select a character to view references.")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <User aria-hidden="true" className="h-4 w-4" />
                    {selectedCharacter.name}
                    {selectedCharacter.role && (
                      <Badge variant="outline" className="text-[10px]">
                        {selectedCharacter.role}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {t(lang, "คีย์", "Key")}: <code className="font-mono">{selectedCharacter.characterKey}</code>
                </CardContent>
              </Card>

              {/* Import a reference asset */}
              {!readOnly && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t(lang, "นำเข้าอ้างอิง", "Import reference")}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Label htmlFor="vd-media-id" className="text-xs">
                      {t(lang, "รหัสมีเดียแอสเซ็ต (ที่มีอยู่)", "Media asset ID (existing)")}
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id="vd-media-id"
                        value={importMediaAssetId}
                        onChange={(e) => setImportMediaAssetId(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="12345"
                        inputMode="numeric"
                        className="max-w-[200px]"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={mutating || importMediaAssetId.trim() === ""}
                        onClick={() =>
                          linkMutation.mutate({
                            seriesId,
                            characterId: selectedCharacter.characterId,
                            mediaAssetId: importMediaAssetId.trim(),
                            assetType: "character_reference",
                            source: "imported",
                          })
                        }
                      >
                        {linkMutation.isPending ? (
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus aria-hidden="true" className="h-4 w-4" />
                        )}
                        {t(lang, "นำเข้า", "Import")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        lang,
                        "อ้างอิงชี้ไปยังแอสเซ็ตมาตรฐาน — ไม่มีการสร้างที่มีค่าใช้จ่าย",
                        "References point at a canonical asset — no paid generation.",
                      )}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Reference asset list */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {t(lang, "อ้างอิงของตัวละคร", "Character references")} ({selectedAssets.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  {selectedAssets.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      {t(lang, "ยังไม่มีอ้างอิงสำหรับตัวละครนี้", "No references for this character yet.")}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {selectedAssets.map((asset) => {
                        const isPending =
                          asset.state === "draft" ||
                          asset.state === "generated" ||
                          asset.state === "imported";
                        const busyThis =
                          (approveMutation.isPending && approveMutation.variables?.assetLinkId === asset.assetLinkId) ||
                          (transitionMutation.isPending && transitionMutation.variables?.assetLinkId === asset.assetLinkId) ||
                          (markStaleMutation.isPending &&
                            markStaleMutation.variables?.assetLinkIds?.includes(asset.assetLinkId));
                        // Only the freshly-generated asset from this session has a
                        // resolvable URL — matched by characterId + mediaAssetId.
                        // Older/imported assets fall back to the plain-text label.
                        const generatedForCharacter = generatedImageUrls[asset.characterId];
                        const thumbnailUrl =
                          generatedForCharacter &&
                          String(asset.mediaAssetId) === generatedForCharacter.mediaAssetId
                            ? generatedForCharacter.imageUrl
                            : null;
                        return (
                          <li
                            key={asset.assetLinkId}
                            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border p-2"
                          >
                            {thumbnailUrl && (
                              <img
                                src={thumbnailUrl}
                                alt={t(lang, "ภาพตัวละครที่สร้างขึ้น", "Generated character portrait")}
                                className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {asset.assetType}
                                {asset.role ? ` · ${asset.role}` : ""}
                              </p>
                              {thumbnailUrl ? (
                                <p className="truncate text-xs text-muted-foreground">
                                  {t(lang, "ที่มา", "Source")}: {asset.source}
                                  {asset.containsHumanFace ? ` · ${t(lang, "มีใบหน้า", "Has face")}` : ""}
                                </p>
                              ) : (
                                <p className="truncate text-xs text-muted-foreground">
                                  {t(lang, "มีเดีย", "Media")} #{asset.mediaAssetId ?? "—"} ·{" "}
                                  {t(lang, "ที่มา", "Source")}: {asset.source}
                                  {asset.containsHumanFace ? ` · ${t(lang, "มีใบหน้า", "Has face")}` : ""}
                                </p>
                              )}
                              {asset.rejectionReason && (
                                <p className="mt-0.5 text-xs text-destructive">
                                  {t(lang, "เหตุผล", "Reason")}: {asset.rejectionReason}
                                </p>
                              )}
                            </div>
                            <AssetStateBadge state={asset.state} lang={lang} />
                            {!readOnly && (
                              <div className="flex flex-wrap items-center gap-1">
                                {isPending && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1 px-2"
                                    disabled={mutating}
                                    aria-label={t(lang, "อนุมัติอ้างอิงนี้", "Approve this reference")}
                                    onClick={() =>
                                      approveMutation.mutate({ seriesId, assetLinkId: asset.assetLinkId })
                                    }
                                  >
                                    {busyThis ? (
                                      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    )}
                                    {t(lang, "อนุมัติ", "Approve")}
                                  </Button>
                                )}
                                {asset.state !== "rejected" && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 gap-1 px-2 text-destructive hover:text-destructive"
                                    disabled={mutating}
                                    aria-label={t(lang, "ปฏิเสธอ้างอิงนี้", "Reject this reference")}
                                    onClick={() =>
                                      transitionMutation.mutate({
                                        seriesId,
                                        assetLinkId: asset.assetLinkId,
                                        to: "rejected",
                                        rejectionReason: t(lang, "ปฏิเสธโดยผู้ใช้", "Rejected by reviewer"),
                                      })
                                    }
                                  >
                                    <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
                                    {t(lang, "ปฏิเสธ", "Reject")}
                                  </Button>
                                )}
                                {asset.state === "approved" && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 gap-1 px-2"
                                    disabled={mutating}
                                    aria-label={t(lang, "ทำเครื่องหมายว่าต้องรีเฟรช", "Mark stale")}
                                    onClick={() =>
                                      markStaleMutation.mutate({
                                        seriesId,
                                        assetLinkIds: [asset.assetLinkId],
                                      })
                                    }
                                  >
                                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                                    {t(lang, "ต้องรีเฟรช", "Mark stale")}
                                  </Button>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default VerticalDramaCharacterStockPanel;
