/**
 * Brand Kit dialog (Feature 133 follow-up) — the entire brand-kit backend
 * (CRUD + attach/detach + brand-lock enforcement at compile time, see
 * `server/routers/videoProjects.ts`'s `brandKitsRouter` + `setBrandKit`)
 * existed with zero UI. This dialog is the single entry point for both:
 *
 *  1. Picking which brand kit (if any) is attached to the CURRENT project
 *     (`trpc.videoProjects.setBrandKit`, optimistic-concurrency via
 *     `baseRevision` — same "reset baseRevision + refetch the project"
 *     pattern every other mutating panel in this workspace uses after a
 *     save/job/restore completes, see `onAttached` below and
 *     `RevisionHistoryDialog.tsx`'s `onRestored`).
 *  2. Managing the tenant+owner's brand kits themselves (create/edit/delete,
 *     `trpc.videoProjects.brandKits.*`).
 *
 * `setBrandKit` writes `video_projects.brandKitId` unconditionally, but only
 * backfills `document.brandKitId` (the field the compiler actually reads —
 * see `resolveBrandKitForDocument` in the router) when the project already
 * has a document (`documentUpdated: true`). When it doesn't
 * (`documentUpdated: false`), the attachment is still saved — the next
 * `saveDocument` call backfills it — but we must tell the user explicitly,
 * or they'd reasonably assume the brand kit is already enforced.
 *
 * Each of the 6 `locks` toggles gets an inline one-line explanation of what
 * it actually blocks at render time (per the task brief: users must not
 * discover a lock only when their render fails) — see `videoStudioCopy.ts`'s
 * `brandKitLock*Hint` keys, which mirror the enforcement semantics
 * documented in `videoProjectCompiler.ts` (colors/fonts were already
 * enforced; iconStyle/motionIntensity/cta/productFidelity are the newly
 * implemented same-document consistency checks).
 *
 * NOTE — Astryx exception: same deliberate, twice-confirmed exception as the
 * rest of `components/videoStudio/*` (see `VideoStudioWorkspacePage.tsx`'s
 * top-of-file docstring / `planning/video-studio-astryx-migration/plan.md`).
 */
import { useState } from "react";
import { Palette } from "lucide-react";
import { toast } from "sonner";

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, Layout, LayoutContent, VStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";

import { trpc } from "@/lib/trpc";
import type { CaptionPresetId } from "@shared/videoIntelligence/projectSchemas";
import { captionPresetLabel } from "./CaptionsPanel";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

const CAPTION_PRESET_IDS: CaptionPresetId[] = [
  "classic_box",
  "minimal_shadow",
  "creator_pop",
  "karaoke_word",
  "highlight_bar",
  "lower_third",
  "cinematic_wide",
  "neon_glow",
  "review_bubble",
  "no_subtitle_style",
];

interface BrandKitLocks {
  colors?: boolean;
  fonts?: boolean;
  iconStyle?: boolean;
  motionIntensity?: boolean;
  cta?: boolean;
  productFidelity?: boolean;
}

/** Shape of a row returned by `brandKits.list`/`.create`/`.update` — a local
 * structural type (not imported from `drizzle/schema.ts`) matching the
 * `RevisionRow` convention in `RevisionHistoryDialog.tsx`, so this client
 * file never pulls in server-only Drizzle types. */
interface BrandKitRow {
  id: number;
  name: string;
  colors?: { primary?: string; secondary?: string; accent?: string } | null;
  fonts?: { heading?: string; body?: string } | null;
  captionPresetId?: string | null;
  locks?: BrandKitLocks | null;
}

const DEFAULT_LOCKS: Required<BrandKitLocks> = {
  colors: false,
  fonts: false,
  iconStyle: false,
  motionIntensity: false,
  cta: false,
  productFidelity: false,
};

interface BrandKitFormState {
  name: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  fontHeading: string;
  fontBody: string;
  captionPresetId: string;
  locks: Required<BrandKitLocks>;
}

const BLANK_FORM: BrandKitFormState = {
  name: "",
  colorPrimary: "#2563eb",
  colorSecondary: "",
  colorAccent: "",
  fontHeading: "Inter",
  fontBody: "Inter",
  captionPresetId: "",
  locks: { ...DEFAULT_LOCKS },
};

function rowToForm(row: BrandKitRow): BrandKitFormState {
  return {
    name: row.name,
    colorPrimary: row.colors?.primary ?? "#2563eb",
    colorSecondary: row.colors?.secondary ?? "",
    colorAccent: row.colors?.accent ?? "",
    fontHeading: row.fonts?.heading ?? "Inter",
    fontBody: row.fonts?.body ?? "Inter",
    captionPresetId: row.captionPresetId ?? "",
    locks: { ...DEFAULT_LOCKS, ...(row.locks ?? {}) },
  };
}

function formToPayload(form: BrandKitFormState) {
  return {
    name: form.name.trim(),
    colors: {
      primary: form.colorPrimary.trim() || "#000000",
      secondary: form.colorSecondary.trim() || undefined,
      accent: form.colorAccent.trim() || undefined,
    },
    fonts: {
      heading: form.fontHeading.trim() || "Inter",
      body: form.fontBody.trim() || "Inter",
    },
    captionPresetId: form.captionPresetId || null,
    locks: form.locks,
  };
}

function ColorSwatch({ hex }: { hex: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 rounded-full border border-border/60"
      style={{ backgroundColor: hex || "transparent" }}
    />
  );
}

function BrandKitLockField({
  lang,
  labelKey,
  hintKey,
  value,
  onChange,
}: {
  lang: VideoStudioLang;
  labelKey: keyof typeof videoStudioCopy;
  hintKey: keyof typeof videoStudioCopy;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Switch
      data-testid="brand-kit-lock-toggle"
      label={pickCopy(lang, videoStudioCopy[labelKey])}
      description={pickCopy(lang, videoStudioCopy[hintKey])}
      value={value}
      onChange={onChange}
      labelSpacing="spread"
    />
  );
}

function BrandKitLockFields({
  lang,
  locks,
  onChange,
}: {
  lang: VideoStudioLang;
  locks: Required<BrandKitLocks>;
  onChange: (locks: Required<BrandKitLocks>) => void;
}) {
  return (
    <VStack gap={2}>
      <Text type="label" color="secondary">
        {pickCopy(lang, videoStudioCopy.brandKitLocksLabel)}
      </Text>
      <BrandKitLockField
        lang={lang}
        labelKey="brandKitLockColors"
        hintKey="brandKitLockColorsHint"
        value={locks.colors}
        onChange={(v) => onChange({ ...locks, colors: v })}
      />
      <BrandKitLockField
        lang={lang}
        labelKey="brandKitLockFonts"
        hintKey="brandKitLockFontsHint"
        value={locks.fonts}
        onChange={(v) => onChange({ ...locks, fonts: v })}
      />
      <BrandKitLockField
        lang={lang}
        labelKey="brandKitLockIconStyle"
        hintKey="brandKitLockIconStyleHint"
        value={locks.iconStyle}
        onChange={(v) => onChange({ ...locks, iconStyle: v })}
      />
      <BrandKitLockField
        lang={lang}
        labelKey="brandKitLockMotionIntensity"
        hintKey="brandKitLockMotionIntensityHint"
        value={locks.motionIntensity}
        onChange={(v) => onChange({ ...locks, motionIntensity: v })}
      />
      <BrandKitLockField
        lang={lang}
        labelKey="brandKitLockCta"
        hintKey="brandKitLockCtaHint"
        value={locks.cta}
        onChange={(v) => onChange({ ...locks, cta: v })}
      />
      <BrandKitLockField
        lang={lang}
        labelKey="brandKitLockProductFidelity"
        hintKey="brandKitLockProductFidelityHint"
        value={locks.productFidelity}
        onChange={(v) => onChange({ ...locks, productFidelity: v })}
      />
    </VStack>
  );
}

function BrandKitFormFields({
  lang,
  form,
  onChange,
}: {
  lang: VideoStudioLang;
  form: BrandKitFormState;
  onChange: (form: BrandKitFormState) => void;
}) {
  return (
    <VStack gap={3}>
      <TextInput
        label={pickCopy(lang, videoStudioCopy.brandKitNameLabel)}
        placeholder={pickCopy(lang, videoStudioCopy.brandKitNamePlaceholder)}
        value={form.name}
        onChange={(value) => onChange({ ...form, name: value })}
      />

      <VStack gap={1.5}>
        <Text type="label" color="secondary">
          {pickCopy(lang, videoStudioCopy.brandKitColorsLabel)}
        </Text>
        <HStack gap={2} wrap="wrap">
          <TextInput
            label={pickCopy(lang, videoStudioCopy.brandKitColorPrimary)}
            value={form.colorPrimary}
            onChange={(value) => onChange({ ...form, colorPrimary: value })}
            startIcon={<ColorSwatch hex={form.colorPrimary} />}
          />
          <TextInput
            label={pickCopy(lang, videoStudioCopy.brandKitColorSecondary)}
            value={form.colorSecondary}
            onChange={(value) => onChange({ ...form, colorSecondary: value })}
            startIcon={<ColorSwatch hex={form.colorSecondary} />}
          />
          <TextInput
            label={pickCopy(lang, videoStudioCopy.brandKitColorAccent)}
            value={form.colorAccent}
            onChange={(value) => onChange({ ...form, colorAccent: value })}
            startIcon={<ColorSwatch hex={form.colorAccent} />}
          />
        </HStack>
      </VStack>

      <VStack gap={1.5}>
        <Text type="label" color="secondary">
          {pickCopy(lang, videoStudioCopy.brandKitFontsLabel)}
        </Text>
        <HStack gap={2} wrap="wrap">
          <TextInput
            label={pickCopy(lang, videoStudioCopy.brandKitFontHeading)}
            value={form.fontHeading}
            onChange={(value) => onChange({ ...form, fontHeading: value })}
          />
          <TextInput
            label={pickCopy(lang, videoStudioCopy.brandKitFontBody)}
            value={form.fontBody}
            onChange={(value) => onChange({ ...form, fontBody: value })}
          />
        </HStack>
      </VStack>

      <Selector
        label={pickCopy(lang, videoStudioCopy.brandKitCaptionPresetLabel)}
        placeholder={pickCopy(lang, videoStudioCopy.brandKitCaptionPresetNone)}
        hasClear
        value={form.captionPresetId || null}
        onChange={(value) => onChange({ ...form, captionPresetId: value ?? "" })}
        options={CAPTION_PRESET_IDS.map((id) => ({ value: id, label: captionPresetLabel(lang, id) }))}
      />

      <BrandKitLockFields lang={lang} locks={form.locks} onChange={(locks) => onChange({ ...form, locks })} />
    </VStack>
  );
}

export function BrandKitDialog({
  lang,
  projectId,
  projectRevision,
  currentBrandKitId,
  isOpen,
  onOpenChange,
  /** Called after a successful attach/detach so the caller can reset its
   * `baseRevision`/draft state and refetch the project — the SAME pattern
   * every other mutating panel in this workspace uses after a save/job/
   * restore completes (see `RevisionHistoryDialog.tsx`'s `onRestored`). */
  onAttached,
}: {
  lang: VideoStudioLang;
  projectId: number;
  projectRevision: number;
  currentBrandKitId: number | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAttached: () => void;
}) {
  const utils = trpc.useUtils();
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState<BrandKitFormState>(BLANK_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<BrandKitFormState>(BLANK_FORM);
  const [deleteTarget, setDeleteTarget] = useState<BrandKitRow | null>(null);

  const listQuery = trpc.videoProjects.brandKits.list.useQuery(undefined, { enabled: isOpen });
  const kits = (listQuery.data ?? []) as BrandKitRow[];
  const currentKit = kits.find((kit) => kit.id === currentBrandKitId) ?? null;

  function invalidateList() {
    utils.videoProjects.brandKits.list.invalidate();
  }

  const setBrandKit = trpc.videoProjects.setBrandKit.useMutation({
    onSuccess: (result) => {
      if (result.documentUpdated) {
        toast.success(
          result.brandKitId
            ? pickCopy(lang, videoStudioCopy.brandKitAttachSuccess)
            : pickCopy(lang, videoStudioCopy.brandKitDetachSuccess),
        );
      } else {
        toast.info(pickCopy(lang, videoStudioCopy.brandKitNoDocumentYet));
      }
      onAttached();
    },
    onError: (error) => toast.error(error.message),
  });

  const createBrandKit = trpc.videoProjects.brandKits.create.useMutation({
    onSuccess: () => {
      toast.success(pickCopy(lang, videoStudioCopy.brandKitCreateSuccess));
      invalidateList();
      setIsCreating(false);
      setCreateForm(BLANK_FORM);
    },
    onError: (error) => toast.error(error.message),
  });

  const updateBrandKit = trpc.videoProjects.brandKits.update.useMutation({
    onSuccess: () => {
      toast.success(pickCopy(lang, videoStudioCopy.brandKitUpdateSuccess));
      invalidateList();
      setEditingId(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteBrandKit = trpc.videoProjects.brandKits.delete.useMutation({
    onSuccess: () => {
      toast.success(pickCopy(lang, videoStudioCopy.brandKitDeleteSuccess));
      invalidateList();
      setDeleteTarget(null);
    },
    onError: (error) => toast.error(error.message),
  });

  function startEditing(kit: BrandKitRow) {
    setEditingId(kit.id);
    setEditForm(rowToForm(kit));
  }

  function attach(brandKitId: number | null) {
    setBrandKit.mutate({ projectId, baseRevision: projectRevision, brandKitId });
  }

  function openCreateForm() {
    setCreateForm(BLANK_FORM);
    setIsCreating(true);
  }

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        purpose="form"
        width={640}
        data-testid="video-studio-brand-kit-dialog"
      >
        <Layout
          height="auto"
          header={
            <DialogHeader
              title={pickCopy(lang, videoStudioCopy.brandKitTitle)}
              subtitle={pickCopy(lang, videoStudioCopy.brandKitSubtitle)}
              onOpenChange={onOpenChange}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={5}>
                <VStack gap={2}>
                  <Heading level={4}>{pickCopy(lang, videoStudioCopy.brandKitAttachedSectionTitle)}</Heading>

                  {listQuery.isLoading ? (
                    <Skeleton height={72} width="100%" />
                  ) : listQuery.isError ? (
                    <Banner
                      status="error"
                      title={pickCopy(lang, videoStudioCopy.brandKitLoadError)}
                      description={listQuery.error?.message}
                    />
                  ) : (
                    <VStack gap={2}>
                      {currentKit ? (
                        <Card padding={3} data-testid="brand-kit-current-preview">
                          <HStack gap={2} align="center" justify="between" wrap="wrap">
                            <VStack gap={1}>
                              <Text type="body" weight="bold">
                                {currentKit.name}
                              </Text>
                              <HStack gap={1.5} align="center">
                                <ColorSwatch hex={currentKit.colors?.primary} />
                                <ColorSwatch hex={currentKit.colors?.secondary} />
                                <ColorSwatch hex={currentKit.colors?.accent} />
                                <Text type="supporting" color="secondary">
                                  {currentKit.fonts?.heading} / {currentKit.fonts?.body}
                                </Text>
                              </HStack>
                            </VStack>
                            <Button
                              data-testid="brand-kit-detach"
                              type="button"
                              variant="secondary"
                              size="sm"
                              label={pickCopy(lang, videoStudioCopy.brandKitDetach)}
                              isDisabled={setBrandKit.isPending}
                              onClick={() => attach(null)}
                            />
                          </HStack>
                        </Card>
                      ) : (
                        <Text type="body" color="secondary" data-testid="brand-kit-none-attached">
                          {pickCopy(lang, videoStudioCopy.brandKitNoneAttached)}
                        </Text>
                      )}

                      {kits.length > 0 ? (
                        <Selector
                          data-testid="brand-kit-select"
                          label={pickCopy(lang, videoStudioCopy.brandKitSelectLabel)}
                          placeholder={pickCopy(lang, videoStudioCopy.brandKitSelectPlaceholder)}
                          value={currentBrandKitId != null ? String(currentBrandKitId) : undefined}
                          onChange={(value) => attach(Number(value))}
                          isDisabled={setBrandKit.isPending}
                          options={kits.map((kit) => ({ value: String(kit.id), label: kit.name }))}
                        />
                      ) : null}
                    </VStack>
                  )}
                </VStack>

                <VStack gap={3}>
                  <HStack gap={2} align="center" justify="between">
                    <Heading level={4}>{pickCopy(lang, videoStudioCopy.brandKitManageSectionTitle)}</Heading>
                    {!isCreating ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        label={pickCopy(lang, videoStudioCopy.brandKitCreateNew)}
                        onClick={openCreateForm}
                      />
                    ) : null}
                  </HStack>

                  {!listQuery.isLoading && !listQuery.isError && kits.length === 0 && !isCreating ? (
                    <EmptyState
                      isCompact
                      icon={<Palette className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />}
                      title={pickCopy(lang, videoStudioCopy.brandKitEmptyTitle)}
                      description={pickCopy(lang, videoStudioCopy.brandKitEmptyBody)}
                      actions={
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          label={pickCopy(lang, videoStudioCopy.brandKitCreateFirst)}
                          onClick={openCreateForm}
                        />
                      }
                    />
                  ) : null}

                  {isCreating ? (
                    <Card padding={3} data-testid="brand-kit-create-form">
                      <VStack gap={3}>
                        <BrandKitFormFields lang={lang} form={createForm} onChange={setCreateForm} />
                        <HStack gap={2} justify="end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            label={pickCopy(lang, videoStudioCopy.cancel)}
                            onClick={() => setIsCreating(false)}
                          />
                          <Button
                            data-testid="brand-kit-create"
                            type="button"
                            variant="primary"
                            size="sm"
                            label={pickCopy(lang, videoStudioCopy.brandKitSave)}
                            isDisabled={!createForm.name.trim()}
                            isLoading={createBrandKit.isPending}
                            onClick={() => {
                              if (!createForm.name.trim()) {
                                toast.error(pickCopy(lang, videoStudioCopy.brandKitNameRequired));
                                return;
                              }
                              createBrandKit.mutate(formToPayload(createForm));
                            }}
                          />
                        </HStack>
                      </VStack>
                    </Card>
                  ) : null}

                  {kits.map((kit) => (
                    <Card key={kit.id} padding={3} data-testid="brand-kit-list-item">
                      {editingId === kit.id ? (
                        <VStack gap={3}>
                          <BrandKitFormFields lang={lang} form={editForm} onChange={setEditForm} />
                          <HStack gap={2} justify="end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              label={pickCopy(lang, videoStudioCopy.cancel)}
                              onClick={() => setEditingId(null)}
                            />
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              label={pickCopy(lang, videoStudioCopy.brandKitSave)}
                              isDisabled={!editForm.name.trim()}
                              isLoading={updateBrandKit.isPending}
                              onClick={() => {
                                if (!editForm.name.trim()) {
                                  toast.error(pickCopy(lang, videoStudioCopy.brandKitNameRequired));
                                  return;
                                }
                                updateBrandKit.mutate({ brandKitId: kit.id, ...formToPayload(editForm) });
                              }}
                            />
                          </HStack>
                        </VStack>
                      ) : (
                        <HStack gap={2} align="center" justify="between" wrap="wrap">
                          <VStack gap={1}>
                            <Text type="body" weight="bold">
                              {kit.name}
                            </Text>
                            <HStack gap={1.5} align="center">
                              <ColorSwatch hex={kit.colors?.primary} />
                              <ColorSwatch hex={kit.colors?.secondary} />
                              <ColorSwatch hex={kit.colors?.accent} />
                              <Text type="supporting" color="secondary">
                                {kit.fonts?.heading} / {kit.fonts?.body}
                              </Text>
                            </HStack>
                          </VStack>
                          <HStack gap={1.5}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              label={pickCopy(lang, videoStudioCopy.brandKitEdit)}
                              onClick={() => startEditing(kit)}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              label={pickCopy(lang, videoStudioCopy.brandKitDelete)}
                              onClick={() => setDeleteTarget(kit)}
                            />
                          </HStack>
                        </HStack>
                      )}
                    </Card>
                  ))}
                </VStack>
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={pickCopy(lang, videoStudioCopy.brandKitDeleteConfirmTitle)}
        description={pickCopy(lang, videoStudioCopy.brandKitDeleteConfirmBody)}
        actionLabel={pickCopy(lang, videoStudioCopy.brandKitDelete)}
        actionVariant="destructive"
        isActionLoading={deleteBrandKit.isPending}
        data-testid="brand-kit-delete-confirm"
        onAction={() => {
          if (deleteTarget) {
            deleteBrandKit.mutate({ brandKitId: deleteTarget.id });
          }
        }}
      />
    </>
  );
}
