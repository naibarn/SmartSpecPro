---
name: Spec 034 Audit — Quick Fix Guide
description: Action items and code snippets for missing preview handlers
type: project
---

# Spec 034 Agency Templates — Quick Fix Implementation Guide

## Critical Issues & Code Fixes

### Issue 1: Missing media_prompt Preview Handler

**Current**: If Python emits `intent: "media_prompt"`, Node.js returns `null` from `buildAgencyPreview()` → preview not displayed.

**Fix Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyPreviewService.ts`

**Step 1**: Add schema definition (after line 48)

```typescript
const mediaPromptPayloadSchema = z.object({
  mediaType: z.enum(["image", "video", "audio"]),
  prompt: z.string().min(1).max(5000),
  model: z.string().max(100).optional(),
  referenceImageUrls: z.array(z.string().max(2048)).max(5).optional(),
  extraParams: z.record(z.unknown()).optional(),
});

type MediaPromptPayload = z.infer<typeof mediaPromptPayloadSchema>;
```

**Step 2**: Add handler in buildAgencyPreview (after line 378, before comparison handler)

```typescript
  if (run.structuredResult.intent === "media_prompt" && payload) {
    const parsed = mediaPromptPayloadSchema.safeParse(payload);
    if (parsed.success) {
      return {
        previewType: "media_prompt",
        artifactId: artifact.id,
        intent: artifact.intent,
        artifactType: artifact.artifact_type,
        lifecycleState,
        summaryText: artifact.summary ?? run.structuredResult.summary ?? run.response,
        responseText: run.response,
        provenance,
        commit,
        audit,
        data: {
          mediaType: parsed.data.mediaType,
          prompt: parsed.data.prompt,
          model: parsed.data.model ?? null,
          referenceImageUrls: parsed.data.referenceImageUrls ?? [],
        },
      };
    }
  }
```

**Step 3**: Update AgencyPreview union type (lines 114–154)

```typescript
export type AgencyPreview =
  | PreviewBase<"research", { ... }> // existing
  | PreviewBase<"storyboard", { ... }> // existing
  | PreviewBase<"deck", { ... }> // existing
  | PreviewBase<"comparison", { ... }> // existing
  | PreviewBase<"media_prompt", {
      mediaType: "image" | "video" | "audio";
      prompt: string;
      model: string | null;
      referenceImageUrls: string[];
    }>
  | PreviewBase<"text_content", { ... }>; // added in next issue
```

---

### Issue 2: Missing text_content Preview Handler

**Current**: If Python emits `intent: "text_content"`, Node.js returns `null`.

**Fix Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyPreviewService.ts`

**Step 1**: Add schema definition (after mediaPromptPayloadSchema)

```typescript
const textContentPayloadSchema = z.object({
  title: z.string().max(255).optional(),
  content: z.string().min(1).max(50000),
  format: z.enum(["plain", "markdown", "html"]).default("markdown"),
});

type TextContentPayload = z.infer<typeof textContentPayloadSchema>;
```

**Step 2**: Add handler in buildAgencyPreview (after media_prompt handler, before comparison)

```typescript
  if (run.structuredResult.intent === "text_content" && payload) {
    const parsed = textContentPayloadSchema.safeParse(payload);
    if (parsed.success) {
      return {
        previewType: "text_content",
        artifactId: artifact.id,
        intent: artifact.intent,
        artifactType: artifact.artifact_type,
        lifecycleState,
        summaryText: artifact.summary ?? parsed.data.title ?? run.response,
        responseText: run.response,
        provenance,
        commit,
        audit,
        data: {
          title: parsed.data.title ?? "Generated Content",
          content: parsed.data.content,
          format: parsed.data.format,
        },
      };
    }
  }
```

---

### Issue 3: Missing Frontend Preview Cards

**Current**: AgencyPreviewCard doesn't render media_prompt or text_content types.

**Fix Location 1**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/AgencyPreviewCard.tsx`

**Step 1**: Update typeConfig (add after line 90, before final `} as const;`)

```typescript
  media_prompt: {
    icon: Zap,  // add to imports: import { Zap } from "lucide-react";
    label: "Media Prompt",
    borderColor: "border-orange-200",
    bgColor: "bg-orange-50/40",
    iconBg: "bg-orange-100 text-orange-700",
  },
  text_content: {
    icon: FileText,  // already imported
    label: "Text Content",
    borderColor: "border-gray-200",
    bgColor: "bg-gray-50/40",
    iconBg: "bg-gray-100 text-gray-700",
  },
```

**Step 2**: Update previewType interface (line 28)

```typescript
export interface AgencyPreviewProps {
  previewType: "research" | "storyboard" | "deck" | "comparison" | "media_prompt" | "text_content";
  // ... rest of fields
}
```

**Step 3**: Update interface Props (line 54)

```typescript
interface AgencyPreviewCardProps {
  preview: AgencyPreviewProps;
  // ... rest unchanged
}
```

**Step 4**: Add render cases in main render logic (find the main switch/if in return statement)

```typescript
{/* Locate existing: if (preview.previewType === "research") { ... } */}
{/* Add these cases similarly: */}

{preview.previewType === "media_prompt" && (
  <MediaPromptPreviewContent
    data={preview.data as any}
  />
)}

{preview.previewType === "text_content" && (
  <TextContentPreviewContent
    data={preview.data as any}
  />
)}
```

---

### Issue 4: Create Missing Preview Content Components

**New File 1**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/MediaPromptPreviewContent.tsx`

```typescript
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Copy, Zap } from "lucide-react";
import { toast } from "sonner";

interface MediaPromptPreviewContentProps {
  data: {
    mediaType: "image" | "video" | "audio";
    prompt: string;
    model: string | null;
    referenceImageUrls: string[];
  };
}

export function MediaPromptPreviewContent({
  data,
}: MediaPromptPreviewContentProps) {
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(data.prompt);
    toast.success("Prompt copied to clipboard");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1">
          <Zap className="h-3 w-3" />
          {data.mediaType}
        </Badge>
        {data.model && <Badge variant="outline">{data.model}</Badge>}
      </div>

      <div className="rounded-lg bg-muted/40 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">
            Prompt
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyPrompt}
            className="h-6 px-2 text-xs"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-sm leading-relaxed">{data.prompt}</p>
      </div>

      {data.referenceImageUrls.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Reference Images
            </p>
            <div className="flex gap-2">
              {data.referenceImageUrls.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  alt={`Reference ${idx + 1}`}
                  className="h-12 w-12 rounded border object-cover"
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

**New File 2**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/TextContentPreviewContent.tsx`

```typescript
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ReactMarkdown from "react-markdown";

interface TextContentPreviewContentProps {
  data: {
    title: string;
    content: string;
    format: "plain" | "markdown" | "html";
  };
}

export function TextContentPreviewContent({
  data,
}: TextContentPreviewContentProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{data.format}</Badge>
      </div>

      {data.title && (
        <>
          <h3 className="text-lg font-semibold">{data.title}</h3>
          <Separator />
        </>
      )}

      <div className="prose prose-sm max-w-none dark:prose-invert">
        {data.format === "markdown" ? (
          <ReactMarkdown>{data.content}</ReactMarkdown>
        ) : data.format === "html" ? (
          <div
            dangerouslySetInnerHTML={{ __html: data.content }}
            className="space-y-2"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {data.content}
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step**: Add imports to AgencyPreviewCard.tsx

```typescript
import { MediaPromptPreviewContent } from "./MediaPromptPreviewContent";
import { TextContentPreviewContent } from "./TextContentPreviewContent";
```

---

### Issue 5: Update Preview Commit Button Support

**Current**: PreviewCommitButton uses generic fallback labels for unknown preview types.

**Fix Location**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/PreviewCommitButton.tsx`

**Step 1**: Update commitLabel function (lines 160–173)

```typescript
function commitLabel(previewType: string): string {
  switch (previewType) {
    case "deck":
      return "Save as Presentation";
    case "research":
      return "Save to Library";
    case "storyboard":
      return "Save to Library";
    case "comparison":
      return "Save to Library";
    case "media_prompt":
      return "Use Prompt";  // NEW
    case "text_content":
      return "Save to Library";  // NEW
    default:
      return "Save";
  }
}
```

**Step 2**: Update commitSuccessMessage function (lines 175–188)

```typescript
function commitSuccessMessage(previewType: string): string {
  switch (previewType) {
    case "deck":
      return "Presentation created successfully";
    case "research":
      return "Research report saved to Library";
    case "storyboard":
      return "Storyboard saved to Library";
    case "comparison":
      return "Comparison saved to Library";
    case "media_prompt":
      return "Prompt ready in Media Studio";  // NEW
    case "text_content":
      return "Text content saved to Library";  // NEW
    default:
      return "Saved successfully";
  }
}
```

---

## Testing Checklist

After implementing all fixes, verify:

**Unit Tests**:
- [ ] agencyPreviewService.buildAgencyPreview handles media_prompt payload
- [ ] agencyPreviewService.buildAgencyPreview handles text_content payload
- [ ] AgencyPreviewCard renders media_prompt type
- [ ] AgencyPreviewCard renders text_content type

**Integration Tests**:
- [ ] Template → Run → Emit media_prompt → Preview renders → Commit works
- [ ] Template → Run → Emit text_content → Preview renders → Commit works

**Manual Tests**:
- [ ] Create agency from platform-* template
- [ ] Run with prompt that generates media_prompt intent
- [ ] Verify preview card displays with correct icon/label
- [ ] Verify "Use Prompt" button works
- [ ] Do same for text_content intent

---

## Implementation Order

1. **agencyPreviewService.ts** — Add schemas and handlers (30 min)
2. **AgencyPreviewCard.tsx** — Update typeConfig and render logic (30 min)
3. **MediaPromptPreviewContent.tsx** — Create new component (30 min)
4. **TextContentPreviewContent.tsx** — Create new component (30 min)
5. **PreviewCommitButton.tsx** — Update labels (15 min)
6. **Run tests** — Verify all preview types render (30 min)

**Total**: ~3 hours

---

## Verification Commands

After merging:

```bash
# Type check for schema alignment
cd apps/web && pnpm check

# Run preview tests
cd apps/web && pnpm test -- agencyPreview

# Run integration test if created
cd apps/web && pnpm test -- agency.template.integration

# Lint for any unused imports
cd apps/web && pnpm format
```

---

## Rollback Plan

If issues found:

1. Revert agencyPreviewService.ts to previous version
2. AgencyPreviewCard will fallback to returning null (safe)
3. No data loss (preview just won't display)
4. Can iterate safely in next cycle

---

## Questions for User

Before implementing:

1. Should media_prompt preview auto-navigate to Media Studio on commit?
2. Should text_content be committable or display-only?
3. Are chat_reply intents still needed in Python?
