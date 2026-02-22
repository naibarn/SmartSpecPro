diff --git a/.claude/settings.local.json b/.claude/settings.local.json
index 5e44cf3..f815a2a 100644
--- a/.claude/settings.local.json
+++ b/.claude/settings.local.json
@@ -110,7 +110,79 @@
       "Bash(# Check web log for more recent errors \\(user may have tried again after restart\\) tail -100 /tmp/smartspec-web.log)",
       "Bash(ss:*)",
       "Bash(.venv/bin/celery:*)",
-      "Bash(.venv/bin/python:*)"
+      "Bash(.venv/bin/python:*)",
+      "Bash(source:*)",
+      "Bash(ruff check:*)",
+      "Bash(.venv/bin/python3:*)",
+      "Bash(crontab:*)",
+      "Read(//etc/cron.d/**)",
+      "Bash(docker exec:*)",
+      "Bash(node:*)",
+      "Bash(bash /home/dev/projects/SmartSpecPro/deep_plan/scripts/checks/validate-env.sh)",
+      "WebFetch(domain:docs.n8n.io)",
+      "WebFetch(domain:generactorai.com)",
+      "WebFetch(domain:github.com)",
+      "WebFetch(domain:latenode.com)",
+      "WebFetch(domain:docs.zapier.com)",
+      "WebFetch(domain:agenta.ai)",
+      "WebFetch(domain:community.n8n.io)",
+      "WebFetch(domain:n8n.io)",
+      "WebFetch(domain:blog.promptlayer.com)",
+      "WebFetch(domain:benocode.vn)",
+      "WebFetch(domain:tetrate.io)",
+      "WebFetch(domain:help.zapier.com)",
+      "WebFetch(domain:docs.comfy.org)",
+      "WebFetch(domain:simmering.dev)",
+      "WebFetch(domain:arxiv.org)",
+      "Bash(PLUGIN_ROOT=\"/home/dev/.claude/plugins/cache/piercelamb-plugins/deep-plan/0.3.0\":*)",
+      "Bash(git -C:*)",
+      "Bash(./node_modules/.bin/vitest:*)",
+      "Bash(./apps/web/node_modules/.bin/vitest run:*)",
+      "Bash(NODE_PATH=./node_modules npx tsx:*)",
+      "Bash(python -c:*)",
+      "Bash(.venv/bin/pip show:*)",
+      "Bash(.venv/bin/pip install:*)",
+      "Bash(# Read:*)",
+      "Bash(/tmp/create_workflow_versions.sql:*)",
+      "Bash(PGPASSWORD=smartspec123 psql:*)",
+      "Bash(then)",
+      "Bash(else)",
+      "Bash(fi)",
+      "Bash(__NEW_LINE_8a90f9f0d4206859__ echo \"\")",
+      "Read(//home/dev/projects/SmartSpecPro/**)",
+      "Bash(# Check git history for any .env files that were ever committed echo \"\"=== .env files in git history ===\"\" git -C /home/dev/projects/SmartSpecPro log --all --diff-filter=A --name-only --pretty=format:''%h %s'' -- ''*.env'' ''*/.env'' ''**/.env'')",
+      "Bash(head -30 echo \"\" echo \"=== Check for actual secret patterns in tracked files ===\" git -C /home/dev/projects/SmartSpecPro grep -l 'LLM_ENCRYPTION_KEY\\\\|JWT_SECRET\\\\|SECRET_KEY\\\\|GATEWAY_TOKEN\\\\|MCP_TOKEN\\\\|ENCRYPTION_MASTER_KEY' -- ':!*.example' ':!*.md' ':!CLAUDE.md' ':!*.test.*' ':!node_modules')",
+      "Bash(/usr/local/bin/pg_dump:*)",
+      "Bash(for file in /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/OneDriveCallback.tsx /home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/OneDriveBrowser.tsx /home/dev/projects/SmartSpecPro/apps/web/client/src/components/library/EditInOneDriveBar.tsx /home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/OneDrivePanel.tsx /home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/OneDriveFolderPicker.tsx /home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/DisconnectOneDriveDialog.tsx)",
+      "Bash(do)",
+      "Bash(if [ -f \"$file\" ])",
+      "Bash(done)",
+      "mcp__plugin_context7_context7__query-docs",
+      "WebFetch(domain:www.firecrawl.dev)",
+      "WebFetch(domain:research.trychroma.com)",
+      "WebFetch(domain:www.zeroentropy.dev)",
+      "WebFetch(domain:www.analyticsvidhya.com)",
+      "WebFetch(domain:app.ailog.fr)",
+      "WebFetch(domain:community.openai.com)",
+      "WebFetch(domain:docs.ragas.io)",
+      "WebFetch(domain:www.confident-ai.com)",
+      "WebFetch(domain:www.getmaxim.ai)",
+      "WebFetch(domain:www.pinecone.io)",
+      "WebFetch(domain:www.stack-ai.com)",
+      "WebFetch(domain:weaviate.io)",
+      "Bash(.venv/bin/pytest:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/specs/feature/019-RAG-MaturityAssessment/implementation/code_review/section-01-review.md:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/specs/feature/019-RAG-MaturityAssessment/implementation/code_review/section-01-interview.md:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/specs/feature/019-RAG-MaturityAssessment/implementation/code_review/section-02-review.md:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/specs/feature/019-RAG-MaturityAssessment/implementation/code_review/section-02-interview.md:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_guardrails.py:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_citations.py:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_query_router.py:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/guardrails.py:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/query_router.py:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/specs/feature/019-RAG-MaturityAssessment/implementation/code_review/section-06-review.md:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/specs/feature/019-RAG-MaturityAssessment/implementation/code_review/section-06-interview.md:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_rag_executor.py:*)"
     ],
     "deny": [
       "Bash(rm *)",
diff --git a/apps/web/client/src/components/chat/ChatView.tsx b/apps/web/client/src/components/chat/ChatView.tsx
index 4101338..d00815d 100644
--- a/apps/web/client/src/components/chat/ChatView.tsx
+++ b/apps/web/client/src/components/chat/ChatView.tsx
@@ -138,6 +138,53 @@ const skillIconMap: Record<string, React.ElementType> = {
   "prompt-enhancement": Sparkles,
 };
 
+type MediaModelOption = {
+  id: string;
+  type: "image" | "video" | "audio";
+  name: string;
+  description: string | null;
+  provider: string;
+  creditCost: number;
+  supportsAspectRatios: string[] | null;
+  supportsSizes: string[] | null;
+  supportsDurations: number[] | null;
+};
+
+function toMediaModelOption(value: unknown): MediaModelOption | null {
+  if (!value || typeof value !== "object") return null;
+  const candidate = value as Record<string, unknown>;
+
+  const type = candidate.type;
+  if (type !== "image" && type !== "video" && type !== "audio") {
+    return null;
+  }
+  if (
+    typeof candidate.id !== "string" ||
+    typeof candidate.name !== "string" ||
+    typeof candidate.provider !== "string" ||
+    typeof candidate.creditCost !== "number"
+  ) {
+    return null;
+  }
+
+  const normalizeStringArray = (raw: unknown): string[] | null =>
+    Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : null;
+  const normalizeNumberArray = (raw: unknown): number[] | null =>
+    Array.isArray(raw) ? raw.filter((v): v is number => typeof v === "number") : null;
+
+  return {
+    id: candidate.id,
+    type,
+    name: candidate.name,
+    description: typeof candidate.description === "string" ? candidate.description : null,
+    provider: candidate.provider,
+    creditCost: candidate.creditCost,
+    supportsAspectRatios: normalizeStringArray(candidate.supportsAspectRatios),
+    supportsSizes: normalizeStringArray(candidate.supportsSizes),
+    supportsDurations: normalizeNumberArray(candidate.supportsDurations),
+  };
+}
+
 type MessageRole = "user" | "assistant" | "system";
 
 interface Message {
@@ -463,10 +510,17 @@ export function ChatView({ conversationId, onTitleUpdate }: ChatViewProps) {
   } | null>(null);
 
   // Filter media models by detected skill type (image / video)
-  const filteredMediaModels = useMemo(() => {
+  const filteredMediaModels = useMemo<MediaModelOption[]>(() => {
     if (!allMediaModelsData?.models || !detectedSkill) return [];
     const type = detectedSkill.type === "video-generation" ? "video" : "image";
-    return allMediaModelsData.models.filter(m => m.type === type);
+    const normalized: MediaModelOption[] = [];
+    for (const model of allMediaModelsData.models) {
+      const option = toMediaModelOption(model);
+      if (option && option.type === type) {
+        normalized.push(option);
+      }
+    }
+    return normalized;
   }, [allMediaModelsData?.models, detectedSkill]);
 
   // Auto-select default media model when skill type changes (reads localStorage first)
@@ -488,7 +542,9 @@ export function ChatView({ conversationId, onTitleUpdate }: ChatViewProps) {
       const defaultId = isVideo
         ? allMediaModelsData?.defaults?.video
         : allMediaModelsData?.defaults?.image;
-      const preferred = defaultId && filteredMediaModels.find(m => m.id === defaultId);
+      const preferred = defaultId
+        ? filteredMediaModels.find(m => m.id === defaultId)
+        : undefined;
       return (preferred?.id ?? filteredMediaModels[0]?.id) || "";
     });
   }, [filteredMediaModels, detectedSkill, allMediaModelsData?.defaults]);
diff --git a/apps/web/client/src/components/workflow/ConvertWithISCDialog.tsx b/apps/web/client/src/components/workflow/ConvertWithISCDialog.tsx
index b8cf3b9..d89ed1b 100644
--- a/apps/web/client/src/components/workflow/ConvertWithISCDialog.tsx
+++ b/apps/web/client/src/components/workflow/ConvertWithISCDialog.tsx
@@ -23,8 +23,6 @@ import type { SkillInputSchema } from "@/components/media/DynamicSkillForm";
 import { trpc } from "@/lib/trpc";
 
 const EMPTY_SCHEMA: SkillInputSchema = {
-  version: "1.0",
-  skillId: "",
   title: "",
   sections: [],
   outputMapping: {},
diff --git a/apps/web/client/src/components/workflow/execution/ConsolePanel.tsx b/apps/web/client/src/components/workflow/execution/ConsolePanel.tsx
index 52975e6..094e30b 100644
--- a/apps/web/client/src/components/workflow/execution/ConsolePanel.tsx
+++ b/apps/web/client/src/components/workflow/execution/ConsolePanel.tsx
@@ -207,8 +207,8 @@ export function ConsolePanel({
 
   // ── Resize drag ─────────────────────────────────────────────────────────
   // Stable refs so removeEventListener matches addEventListeners
-  const onResizeMouseMoveRef = useRef<(e: MouseEvent) => void>();
-  const onResizeMouseUpRef = useRef<() => void>();
+  const onResizeMouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
+  const onResizeMouseUpRef = useRef<(() => void) | null>(null);
 
   useEffect(() => {
     onResizeMouseMoveRef.current = (e: MouseEvent) => {
diff --git a/apps/web/client/src/hooks/useTenantPage.ts b/apps/web/client/src/hooks/useTenantPage.ts
index 231bf46..c6af456 100644
--- a/apps/web/client/src/hooks/useTenantPage.ts
+++ b/apps/web/client/src/hooks/useTenantPage.ts
@@ -13,6 +13,7 @@ interface TenantPageData {
     subtitle?: string;
     content?: string;
     image?: string;
+    settings?: Record<string, unknown>;
     buttons?: Array<{ text: string; link: string; style?: string }>;
     items?: Array<any>;
   }>;
diff --git a/apps/web/client/src/lib/presentationEditorState.ts b/apps/web/client/src/lib/presentationEditorState.ts
index f92105c..33ed77e 100644
--- a/apps/web/client/src/lib/presentationEditorState.ts
+++ b/apps/web/client/src/lib/presentationEditorState.ts
@@ -1,69 +1,22 @@
-export type PresentationElementType = "text" | "image" | "rect" | "line";
+import {
+  presentationSlideContentSchema,
+  type PresentationSlideContent as SharedPresentationSlideContent,
+  type PresentationSlideElement as SharedPresentationElement,
+} from "@shared/presentation/contracts";
 
-interface PresentationElementBase {
-  id: string;
-  type: PresentationElementType;
-  x: number;
-  y: number;
-  width: number;
-  height: number;
-  opacity?: number;
-}
-
-export interface PresentationTextElement extends PresentationElementBase {
-  type: "text";
-  text: string;
-  color: string;
-}
-
-export interface PresentationImageElement extends PresentationElementBase {
-  type: "image";
-  src: string;
-  alt: string;
-}
-
-export interface PresentationRectElement extends PresentationElementBase {
-  type: "rect";
-  fill: string;
-}
-
-export interface PresentationLineElement extends PresentationElementBase {
-  type: "line";
-  stroke: string;
-  strokeWidth: number;
-}
-
-export type PresentationElement =
-  | PresentationTextElement
-  | PresentationImageElement
-  | PresentationRectElement
-  | PresentationLineElement;
-
-export interface PresentationSlideContent {
-  elements: PresentationElement[];
-  transition?: string;
-  durationMs?: number;
-}
+export type PresentationElementType = SharedPresentationElement["type"];
+export type PresentationElement = SharedPresentationElement;
+export type PresentationElementPatch = Partial<Omit<PresentationElement, "id" | "type">>;
+export type PresentationSlideContent = SharedPresentationSlideContent;
 
 export function ensureSlideContent(input: unknown): PresentationSlideContent {
-  const asObject =
-    input && typeof input === "object" && !Array.isArray(input)
-      ? (input as Record<string, unknown>)
-      : {};
-  const elements = Array.isArray(asObject.elements)
-    ? (asObject.elements as PresentationElement[])
-    : [];
-  const transition =
-    typeof asObject.transition === "string" ? asObject.transition : undefined;
-  const durationMs =
-    typeof asObject.durationMs === "number" && Number.isFinite(asObject.durationMs)
-      ? asObject.durationMs
-      : undefined;
+  const parsed = presentationSlideContentSchema.safeParse(input);
+  if (parsed.success) {
+    return parsed.data;
+  }
 
   return {
-    elements,
-    transition,
-    durationMs,
+    elements: [],
   };
 }
 
@@ -115,17 +68,6 @@ export function createElement(
         stroke: "#1f2937",
         strokeWidth: 2,
       };
-    default:
-      return {
-        id,
-        type: "text",
-        x: 80,
-        y: 80,
-        width: 320,
-        height: 80,
-        text: "New text",
-        color: "#111827",
-      };
   }
 }
 
@@ -142,7 +84,7 @@ export function addElement(
 export function updateElementById(
   content: PresentationSlideContent,
   elementId: string,
-  patch: Partial<PresentationElement>,
+  patch: PresentationElementPatch,
 ): PresentationSlideContent {
   return {
     ...content,
@@ -154,7 +96,7 @@ export function updateElementById(
       return {
         ...element,
         ...patch,
-      };
+      } as PresentationElement;
     }),
   };
 }
diff --git a/apps/web/client/src/pages/AdminSkills.tsx b/apps/web/client/src/pages/AdminSkills.tsx
index c78dd48..5127a4c 100644
--- a/apps/web/client/src/pages/AdminSkills.tsx
+++ b/apps/web/client/src/pages/AdminSkills.tsx
@@ -1001,7 +1001,7 @@ export default function AdminSkills() {
                                 variant="outline"
                                 size="sm"
                                 className="text-green-600 border-green-300 hover:bg-green-50"
-                                onClick={() => approveMutation.mutate({ id: skill.id })}
+                                onClick={() => approveMutation.mutate({ skillId: skill.id })}
                                 disabled={approveMutation.isPending}
                               >
                                 <CheckCircle2 className="mr-1 h-3 w-3" />
@@ -1059,7 +1059,7 @@ export default function AdminSkills() {
               onClick={() => {
                 if (rejectingSkill && rejectReason.trim()) {
                   rejectMutation.mutate({
-                    id: rejectingSkill.id,
+                    skillId: rejectingSkill.id,
                     reason: rejectReason.trim(),
                   });
                 }
diff --git a/apps/web/client/src/pages/DocumentManagement.tsx b/apps/web/client/src/pages/DocumentManagement.tsx
index 95651bb..d92d1ce 100644
--- a/apps/web/client/src/pages/DocumentManagement.tsx
+++ b/apps/web/client/src/pages/DocumentManagement.tsx
@@ -574,7 +574,8 @@ export default function DocumentManagement() {
 
   async function handleSaveMarkdown() {
     if (!selectedItem || previewType !== "markdown") return;
-    const draft = markdownDraftByDocId[selectedItem.id];
+    const selectedItemId = selectedItem.id;
+    const draft = markdownDraftByDocId[selectedItemId];
     const contentToSave = draft?.value ?? "";
 
     // Safety guard: refuse to persist an empty document.  This prevents data
@@ -601,14 +602,14 @@ export default function DocumentManagement() {
       setSelectedId(updatedItem.id);
       await Promise.all([
         trpcUtils.library.listDocuments.invalidate(),
-        trpcUtils.library.getMarkdownContent.invalidate({ id: selectedItem.id }),
+        trpcUtils.library.getMarkdownContent.invalidate({ id: selectedItemId }),
       ]);
     }
 
     try {
       setMarkdownError(undefined);
       const result = await saveMarkdownMutation.mutateAsync({
-        id: selectedItem.id,
+        id: selectedItemId,
         content: contentToSave,
         expectedUpdatedAt,
       });
@@ -620,7 +621,7 @@ export default function DocumentManagement() {
       if (isVersionConflict) {
         try {
           const retryResult = await saveMarkdownMutation.mutateAsync({
-            id: selectedItem.id,
+            id: selectedItemId,
             content: contentToSave,
           });
           toast.success("Markdown saved. Re-indexing started.");
diff --git a/apps/web/client/src/pages/PresentationEditor.tsx b/apps/web/client/src/pages/PresentationEditor.tsx
index d343623..d4ffdb3 100644
--- a/apps/web/client/src/pages/PresentationEditor.tsx
+++ b/apps/web/client/src/pages/PresentationEditor.tsx
@@ -13,6 +13,7 @@ import {
   ensureSlideContent,
   updateElementById,
   type PresentationElement,
+  type PresentationElementPatch,
   type PresentationElementType,
   type PresentationSlideContent,
 } from "@/lib/presentationEditorState";
@@ -246,7 +247,7 @@ export default function PresentationEditor() {
     setSaveState("idle");
   }
 
-  function handleUpdateSelectedElement(patch: Partial<PresentationElement>) {
+  function handleUpdateSelectedElement(patch: PresentationElementPatch) {
     if (!selectedElementId) return;
     setDraftContent((current) => updateElementById(current, selectedElementId, patch));
     setSaveState("idle");
@@ -332,13 +333,17 @@ export default function PresentationEditor() {
     );
   }
 
-  if (guardQuery.data && !guardQuery.data.allowed) {
+  const blockedGuard = guardQuery.data && guardQuery.data.allowed === false
+    ? guardQuery.data
+    : null;
+
+  if (blockedGuard) {
     return (
       <div className="min-h-screen p-8 space-y-4">
         <h1 className="text-xl font-semibold">Wrong editor route</h1>
-        <p className="text-sm text-muted-foreground">{guardQuery.data.message}</p>
-        <Button onClick={() => setLocation(guardQuery.data.recoveryCta.href)}>
-          {guardQuery.data.recoveryCta.label}
+        <p className="text-sm text-muted-foreground">{blockedGuard.message}</p>
+        <Button onClick={() => setLocation(blockedGuard.recoveryCta.href)}>
+          {blockedGuard.recoveryCta.label}
         </Button>
       </div>
     );
diff --git a/apps/web/server/middleware/prometheusMetrics.ts b/apps/web/server/middleware/prometheusMetrics.ts
index 08c6fe9..7a95bc2 100644
--- a/apps/web/server/middleware/prometheusMetrics.ts
+++ b/apps/web/server/middleware/prometheusMetrics.ts
@@ -147,7 +147,7 @@ export function createPrometheusMiddleware() {
     const startTime = Date.now();
 
     let statusCode = "200";
-    let errorCode: string | undefined;
+    let errorCode = "INTERNAL_SERVER_ERROR";
     let cached = "false";
 
     try {
diff --git a/apps/web/server/routers/chat.executeSkill.test.ts b/apps/web/server/routers/chat.executeSkill.test.ts
index 5e4c7a9..bbeb121 100644
--- a/apps/web/server/routers/chat.executeSkill.test.ts
+++ b/apps/web/server/routers/chat.executeSkill.test.ts
@@ -1,21 +1,21 @@
-import { describe, it, expect, beforeEach, jest } from '@jest/globals';
+import { describe, it, expect, beforeEach, vi } from 'vitest';
 import { TRPCError } from '@trpc/server';
 
 // Mock dependencies
-jest.mock('../services/skillRegistry');
-jest.mock('../services/skillExecutor');
-jest.mock('../services/rateLimiter');
-jest.mock('../db');
+vi.mock('../services/skillRegistry');
+vi.mock('../services/skillExecutor');
+vi.mock('../services/rateLimiter');
+vi.mock('../db');
 
 describe('executeSkill API', () => {
   const mockCaller = {
     chat: {
-      executeSkill: jest.fn(),
+      executeSkill: vi.fn(),
     },
   };
 
   beforeEach(() => {
-    jest.clearAllMocks();
+    vi.clearAllMocks();
   });
 
   describe('Input Validation', () => {
@@ -52,7 +52,7 @@ describe('executeSkill API', () => {
     });
 
     it('merges dynamicParams with extraParams (dynamicParams takes precedence)', async () => {
-      const mockExecute = jest.fn().mockResolvedValue({ success: true });
+      const mockExecute = vi.fn().mockResolvedValue({ success: true });
       mockCaller.chat.executeSkill.mockImplementation(async (input: any) => {
         // Simulate merging logic
         const merged = { ...input.extraParams, ...input.dynamicParams };
diff --git a/apps/web/server/routers/chat.ts b/apps/web/server/routers/chat.ts
index 364a920..4fcd4f7 100644
--- a/apps/web/server/routers/chat.ts
+++ b/apps/web/server/routers/chat.ts
@@ -98,6 +98,9 @@ async function handleIscCreateSkill(
   const safeSlug = action.slug.replace(/[^a-z0-9-]/g, "-").slice(0, 80);
 
   const db = await getDb();
+  if (!db) {
+    return { ok: false, reason: "Database not available" };
+  }
 
   // 3. Deduplication with auto-rename: find all existing slugs that start with
   //    this base slug so we can pick the next available suffix (-2, -3, …).
@@ -1186,6 +1189,12 @@ export const chatRouter = router({
       // Authorization: verify user has access to restricted skills (visibleByDefault=false)
       {
         const db = await getDb();
+        if (!db) {
+          throw new TRPCError({
+            code: "INTERNAL_SERVER_ERROR",
+            message: "Database not available",
+          });
+        }
         const [accessCheck] = await db
           .select({
             visibleByDefault: skillsTable.visibleByDefault,
@@ -1258,6 +1267,12 @@ export const chatRouter = router({
 
         // Load skill's systemPrompt and knowledgebase from DB
         const skillDb = await getDb();
+        if (!skillDb) {
+          throw new TRPCError({
+            code: "INTERNAL_SERVER_ERROR",
+            message: "Database not available",
+          });
+        }
         const [skillRow] = await skillDb
           .select({ systemPrompt: skillsTable.systemPrompt, knowledgebase: skillsTable.knowledgebase })
           .from(skillsTable)
diff --git a/apps/web/server/routers/presentation.ts b/apps/web/server/routers/presentation.ts
index e1660da..651a153 100644
--- a/apps/web/server/routers/presentation.ts
+++ b/apps/web/server/routers/presentation.ts
@@ -11,6 +11,7 @@ import {
 import {
   isPresentationItemType,
   presentationAvailabilitySchema,
+  presentationSlideContentSchema,
   presentationRouteGuardInputSchema,
   presentationRouteGuardResultSchema,
   type PresentationAvailability,
@@ -369,7 +370,7 @@ export const presentationRouter = router({
       deckId: z.number().int().positive(),
       expectedVersion: z.number().int().nonnegative(),
       title: z.string().min(1).max(255).optional(),
-      slideContent: z.record(z.any()).optional(),
+      slideContent: presentationSlideContentSchema.optional(),
       notes: z.string().max(5_000).nullable().optional(),
     }))
     .mutation(async ({ input, ctx }) => {
@@ -410,7 +411,7 @@ export const presentationRouter = router({
       expectedVersion: z.number().int().nonnegative(),
       saveMode: z.enum(["manual", "autosave"]).optional(),
       title: z.string().min(1).max(255).optional(),
-      slideContent: z.record(z.any()).optional(),
+      slideContent: presentationSlideContentSchema.optional(),
       notes: z.string().max(5_000).nullable().optional(),
     }))
     .mutation(async ({ input, ctx }) => {
diff --git a/apps/web/server/routers/skills.ts b/apps/web/server/routers/skills.ts
index 231af25..5711d1f 100644
--- a/apps/web/server/routers/skills.ts
+++ b/apps/web/server/routers/skills.ts
@@ -25,8 +25,16 @@ import {
   type PromptEnhancementRequest,
 } from "../services/promptEnhancementService";
 import { db, getDb } from "../db";
-import { llmProviders, skills, type Skill, type InsertSkill } from "../../drizzle/schema";
-import { eq, asc, desc, like, or, and, sql } from "drizzle-orm";
+import {
+  llmProviders,
+  skills,
+  skillPermissions,
+  userGroups,
+  users as usersTable,
+  type Skill,
+  type InsertSkill,
+} from "../../drizzle/schema";
+import { eq, asc, desc, like, or, and, sql, inArray } from "drizzle-orm";
 import { deductCredits, calculateCreditsForLLM, hasEnoughCredits } from "../services/creditService";
 import { getProviderForModel } from "../services/llmRouter";
 import { getUploadsDir } from "../storage";
@@ -1803,6 +1811,268 @@ export const skillsRouter = router({
       };
     }),
 
+  /**
+   * List skills waiting for admin approval to become public.
+   */
+  listPending: adminProcedure
+    .query(async () => {
+      const dbInstance = await getDb();
+      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const rows = await dbInstance
+        .select({
+          id: skills.id,
+          slug: skills.slug,
+          name: skills.name,
+          description: skills.description,
+          category: skills.category,
+          version: skills.version,
+          author: skills.author,
+          icon: skills.icon,
+          tags: skills.tags,
+          folderPath: skills.folderPath,
+          isAutoTrigger: skills.isAutoTrigger,
+          triggerPatterns: skills.triggerPatterns,
+          isEnabled: skills.isEnabled,
+          enabledByDefault: skills.enabledByDefault,
+          visibleByDefault: skills.visibleByDefault,
+          creditMultiplier: skills.creditMultiplier,
+          priority: skills.priority,
+          availableModels: skills.availableModels,
+          defaultModel: skills.defaultModel,
+          systemPrompt: skills.systemPrompt,
+          skillContent: skills.skillContent,
+          knowledgebase: skills.knowledgebase,
+          configJson: skills.configJson,
+          executionMode: skills.executionMode,
+          marketplaceContent: skills.marketplaceContent,
+          importSource: skills.importSource,
+          importedFromZip: skills.importedFromZip,
+          createdBy: skills.createdBy,
+          createdAt: skills.createdAt,
+          updatedAt: skills.updatedAt,
+          visibility: skills.visibility,
+          tenantId: skills.tenantId,
+          approvedBy: skills.approvedBy,
+          approvedAt: skills.approvedAt,
+          rejectionReason: skills.rejectionReason,
+          ownerName: usersTable.name,
+        })
+        .from(skills)
+        .leftJoin(usersTable, eq(skills.createdBy, usersTable.id))
+        .where(eq(skills.visibility, "pending_approval"))
+        .orderBy(desc(skills.updatedAt), desc(skills.createdAt));
+
+      return rows.map((skill) => ({
+        ...skill,
+        creditMultiplier: Number(skill.creditMultiplier) || 1,
+        tags: skill.tags || [],
+        triggerPatterns: skill.triggerPatterns || [],
+      }));
+    }),
+
+  /**
+   * Approve a pending skill and make it public.
+   */
+  approveSkill: adminProcedure
+    .input(z.object({ skillId: z.number() }))
+    .mutation(async ({ ctx, input }) => {
+      const dbInstance = await getDb();
+      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const [updated] = await dbInstance
+        .update(skills)
+        .set({
+          visibility: "public",
+          approvedBy: ctx.user.id,
+          approvedAt: new Date(),
+          rejectionReason: null,
+          updatedAt: new Date(),
+        })
+        .where(eq(skills.id, input.skillId))
+        .returning({ id: skills.id, visibility: skills.visibility });
+
+      if (!updated) {
+        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.skillId} not found` });
+      }
+
+      await refreshSkillCache();
+      return { success: true, skillId: updated.id, visibility: updated.visibility };
+    }),
+
+  /**
+   * Reject a pending skill submission.
+   */
+  rejectSkill: adminProcedure
+    .input(
+      z.object({
+        skillId: z.number(),
+        reason: z.string().max(1000).optional(),
+      }),
+    )
+    .mutation(async ({ input }) => {
+      const dbInstance = await getDb();
+      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const [updated] = await dbInstance
+        .update(skills)
+        .set({
+          visibility: "rejected",
+          approvedBy: null,
+          approvedAt: null,
+          rejectionReason: input.reason?.trim() || "Rejected by admin",
+          updatedAt: new Date(),
+        })
+        .where(eq(skills.id, input.skillId))
+        .returning({ id: skills.id, visibility: skills.visibility });
+
+      if (!updated) {
+        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.skillId} not found` });
+      }
+
+      await refreshSkillCache();
+      return { success: true, skillId: updated.id, visibility: updated.visibility };
+    }),
+
+  /**
+   * Get groups that currently have access to a private skill.
+   */
+  getSkillGroups: protectedProcedure
+    .input(z.object({ skillId: z.number() }))
+    .query(async ({ ctx, input }) => {
+      const dbInstance = await getDb();
+      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const [skill] = await dbInstance
+        .select({ createdBy: skills.createdBy })
+        .from(skills)
+        .where(eq(skills.id, input.skillId))
+        .limit(1);
+
+      if (!skill) {
+        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.skillId} not found` });
+      }
+
+      const isAdmin = ctx.user.role === "admin";
+      if (!isAdmin && skill.createdBy !== ctx.user.id) {
+        throw new TRPCError({ code: "FORBIDDEN", message: "You can only view groups for your own skills" });
+      }
+
+      return dbInstance
+        .select({
+          id: userGroups.id,
+          name: userGroups.name,
+          description: userGroups.description,
+        })
+        .from(skillPermissions)
+        .innerJoin(userGroups, eq(skillPermissions.groupId, userGroups.id))
+        .where(eq(skillPermissions.skillId, input.skillId))
+        .orderBy(asc(userGroups.name));
+    }),
+
+  /**
+   * Share a private skill with one or more groups.
+   */
+  shareWithGroups: protectedProcedure
+    .input(
+      z.object({
+        skillId: z.number(),
+        groupIds: z.array(z.number()).min(1).max(50),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      const dbInstance = await getDb();
+      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const [skill] = await dbInstance
+        .select({ createdBy: skills.createdBy })
+        .from(skills)
+        .where(eq(skills.id, input.skillId))
+        .limit(1);
+
+      if (!skill) {
+        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.skillId} not found` });
+      }
+
+      const isAdmin = ctx.user.role === "admin";
+      if (!isAdmin && skill.createdBy !== ctx.user.id) {
+        throw new TRPCError({ code: "FORBIDDEN", message: "You can only share your own skills" });
+      }
+
+      const ownedGroups = await dbInstance
+        .select({ id: userGroups.id })
+        .from(userGroups)
+        .where(
+          isAdmin
+            ? inArray(userGroups.id, input.groupIds)
+            : and(inArray(userGroups.id, input.groupIds), eq(userGroups.ownerId, ctx.user.id)),
+        );
+
+      if (ownedGroups.length === 0) {
+        throw new TRPCError({ code: "BAD_REQUEST", message: "No valid groups were provided" });
+      }
+
+      for (const group of ownedGroups) {
+        await dbInstance
+          .insert(skillPermissions)
+          .values({
+            skillId: input.skillId,
+            groupId: group.id,
+            grantedByUserId: ctx.user.id,
+          })
+          .onConflictDoNothing();
+      }
+
+      return { success: true, sharedCount: ownedGroups.length };
+    }),
+
+  /**
+   * Remove a group's access to a private skill.
+   */
+  unshareGroup: protectedProcedure
+    .input(
+      z.object({
+        skillId: z.number(),
+        groupId: z.number(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      const dbInstance = await getDb();
+      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const [skill] = await dbInstance
+        .select({ createdBy: skills.createdBy })
+        .from(skills)
+        .where(eq(skills.id, input.skillId))
+        .limit(1);
+
+      if (!skill) {
+        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.skillId} not found` });
+      }
+
+      const isAdmin = ctx.user.role === "admin";
+      if (!isAdmin && skill.createdBy !== ctx.user.id) {
+        throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage sharing for your own skills" });
+      }
+
+      if (!isAdmin) {
+        const [group] = await dbInstance
+          .select({ id: userGroups.id })
+          .from(userGroups)
+          .where(and(eq(userGroups.id, input.groupId), eq(userGroups.ownerId, ctx.user.id)))
+          .limit(1);
+        if (!group) {
+          throw new TRPCError({ code: "FORBIDDEN", message: "You can only unshare groups you own" });
+        }
+      }
+
+      await dbInstance
+        .delete(skillPermissions)
+        .where(and(eq(skillPermissions.skillId, input.skillId), eq(skillPermissions.groupId, input.groupId)));
+
+      return { success: true };
+    }),
+
   /**
    * Create a new skill (admin only)
    */
@@ -1829,6 +2099,7 @@ export const skillsRouter = router({
         marketplaceContent: z.string().optional(),
         knowledgebase: z.string().optional(),
         configJson: z.record(z.any()).optional(),
+        visibility: z.enum(["private", "pending_approval", "public", "rejected"]).optional(),
       })
     )
     .mutation(async ({ ctx, input }) => {
@@ -1874,6 +2145,7 @@ export const skillsRouter = router({
           configJson: input.configJson,
           importSource: "manual",
           createdBy: ctx.user?.id,
+          visibility: input.visibility ?? "private",
         })
         .returning();
 
@@ -1911,6 +2183,7 @@ export const skillsRouter = router({
         marketplaceContent: z.string().nullable().optional(),
         knowledgebase: z.string().nullable().optional(),
         configJson: z.record(z.any()).nullable().optional(),
+        visibility: z.enum(["private", "pending_approval", "public", "rejected"]).optional(),
       })
     )
     .mutation(async ({ input }) => {
@@ -1943,6 +2216,7 @@ export const skillsRouter = router({
       if (updateData.marketplaceContent !== undefined) updateObj.marketplaceContent = updateData.marketplaceContent;
       if (updateData.knowledgebase !== undefined) updateObj.knowledgebase = updateData.knowledgebase;
       if (updateData.configJson !== undefined) updateObj.configJson = updateData.configJson;
+      if (updateData.visibility !== undefined) updateObj.visibility = updateData.visibility;
 
       const [updated] = await dbInstance
         .update(skills)
diff --git a/apps/web/server/services/presentationCompatibilityService.test.ts b/apps/web/server/services/presentationCompatibilityService.test.ts
index c0fa46e..6fc8a8d 100644
--- a/apps/web/server/services/presentationCompatibilityService.test.ts
+++ b/apps/web/server/services/presentationCompatibilityService.test.ts
@@ -35,7 +35,12 @@ function buildSourceItem(overrides?: Partial<Record<string, unknown>>) {
 }
 
 function createDeps(overrides?: Partial<PresentationConversionDependencies>): PresentationConversionDependencies {
+  const sourceStore = new Map<string, any>();
+  const idempotencyStore = new Map<string, any>();
+  const lockStore = new Set<string>();
+
   return {
+    useInMemoryStateFallback: true,
     getLibraryItemById: vi.fn().mockResolvedValue(buildSourceItem()),
     createLibraryItem: vi.fn().mockResolvedValue({
       item: {
@@ -50,6 +55,40 @@ function createDeps(overrides?: Partial<PresentationConversionDependencies>): Pr
       },
     }),
     upsertSourceAttachment: vi.fn().mockResolvedValue(undefined),
+    cleanupExpiredConversionState: vi.fn().mockResolvedValue(undefined),
+    getStoredConversionBySource: vi.fn(async ({ tenantId, sourceItemId }) => {
+      return sourceStore.get(`${tenantId}:${sourceItemId}`) ?? null;
+    }),
+    getStoredConversionByIdempotency: vi.fn(async ({ tenantId, sourceItemId, idempotencyKey }) => {
+      return idempotencyStore.get(`${tenantId}:${sourceItemId}:${idempotencyKey}`) ?? null;
+    }),
+    upsertStoredConversionRecord: vi.fn(async (input: any) => {
+      const record = {
+        sourceItemId: input.sourceItemId,
+        sourceFormat: input.sourceFormat,
+        deckLibraryItemId: input.deckLibraryItemId,
+        deckId: input.deckId,
+        partialFidelity: input.partialFidelity,
+        fidelityWarnings: input.fidelityWarnings,
+      };
+      sourceStore.set(`${input.tenantId}:${input.sourceItemId}`, record);
+      idempotencyStore.set(`${input.tenantId}:${input.sourceItemId}:${input.idempotencyKey}`, record);
+      return record;
+    }),
+    acquireConversionLock: vi.fn(async ({ tenantId, sourceItemId }) => {
+      const key = `${tenantId}:${sourceItemId}`;
+      if (lockStore.has(key)) {
+        return false;
+      }
+      lockStore.add(key);
+      return true;
+    }),
+    releaseConversionLock: vi.fn(async ({ tenantId, sourceItemId }) => {
+      lockStore.delete(`${tenantId}:${sourceItemId}`);
+    }),
+    now: () => Date.parse("2026-02-22T10:00:00.000Z"),
+    conversionLockTtlMs: 3 * 60_000,
+    conversionRecordTtlMs: 24 * 60 * 60_000,
     ...overrides,
   };
 }
@@ -90,7 +129,24 @@ describe("presentationCompatibilityService", () => {
   });
 
   it("reuses one converted deck for repeated idempotency requests", async () => {
-    const deps = createDeps();
+    const state = new Map<string, any>();
+    const deps = createDeps({
+      getStoredConversionBySource: vi.fn(async () => state.get("source") ?? null),
+      getStoredConversionByIdempotency: vi.fn(async () => state.get("idempotency") ?? null),
+      upsertStoredConversionRecord: vi.fn(async (input: any) => {
+        const record = {
+          sourceItemId: input.sourceItemId,
+          sourceFormat: input.sourceFormat,
+          deckLibraryItemId: input.deckLibraryItemId,
+          deckId: input.deckId,
+          partialFidelity: input.partialFidelity,
+          fidelityWarnings: input.fidelityWarnings,
+        };
+        state.set("source", record);
+        state.set("idempotency", record);
+        return record;
+      }),
+    });
 
     const first = await convertOfficeSourceToPresentation(
       {
@@ -117,6 +173,84 @@ describe("presentationCompatibilityService", () => {
     expect(deps.createPresentationDeckForLibraryItem).toHaveBeenCalledTimes(1);
   });
 
+  it("suppresses duplicates across dependency instances when state is shared", async () => {
+    const sourceStore = new Map<string, any>();
+    const idempotencyStore = new Map<string, any>();
+    const lockStore = new Set<string>();
+    const now = Date.parse("2026-02-22T10:01:00.000Z");
+
+    const sharedState: Partial<PresentationConversionDependencies> = {
+      getStoredConversionBySource: async ({ tenantId, sourceItemId }) => {
+        return sourceStore.get(`${tenantId}:${sourceItemId}`) ?? null;
+      },
+      getStoredConversionByIdempotency: async ({ tenantId, sourceItemId, idempotencyKey }) => {
+        return idempotencyStore.get(`${tenantId}:${sourceItemId}:${idempotencyKey}`) ?? null;
+      },
+      upsertStoredConversionRecord: async (input) => {
+        const record = {
+          sourceItemId: input.sourceItemId,
+          sourceFormat: input.sourceFormat,
+          deckLibraryItemId: input.deckLibraryItemId,
+          deckId: input.deckId,
+          partialFidelity: input.partialFidelity,
+          fidelityWarnings: input.fidelityWarnings,
+        };
+        sourceStore.set(`${input.tenantId}:${input.sourceItemId}`, record);
+        idempotencyStore.set(`${input.tenantId}:${input.sourceItemId}:${input.idempotencyKey}`, record);
+        return record;
+      },
+      acquireConversionLock: async ({ tenantId, sourceItemId }) => {
+        const key = `${tenantId}:${sourceItemId}`;
+        if (lockStore.has(key)) {
+          return false;
+        }
+        lockStore.add(key);
+        return true;
+      },
+      releaseConversionLock: async ({ tenantId, sourceItemId }) => {
+        lockStore.delete(`${tenantId}:${sourceItemId}`);
+      },
+      now: () => now,
+    };
+
+    const createLibraryItem = vi.fn().mockResolvedValue({
+      item: { id: 777 },
+      idempotent: false,
+    });
+    const createPresentationDeckForLibraryItem = vi.fn().mockResolvedValue({
+      created: true,
+      deck: { id: 888 },
+    });
+
+    const depsA = createDeps({
+      ...sharedState,
+      createLibraryItem,
+      createPresentationDeckForLibraryItem,
+    });
+    const depsB = createDeps({
+      ...sharedState,
+      createLibraryItem,
+      createPresentationDeckForLibraryItem,
+    });
+
+    const first = await convertOfficeSourceToPresentation(
+      { sourceItemId: 501, idempotencyKey: "multi-a" },
+      actor,
+      depsA,
+    );
+    const second = await convertOfficeSourceToPresentation(
+      { sourceItemId: 501, idempotencyKey: "multi-b" },
+      actor,
+      depsB,
+    );
+
+    expect(first.conversionStatus).toBe("created");
+    expect(second.conversionStatus).toBe("existing");
+    expect(second.deckId).toBe(first.deckId);
+    expect(createLibraryItem).toHaveBeenCalledTimes(1);
+    expect(createPresentationDeckForLibraryItem).toHaveBeenCalledTimes(1);
+  });
+
   it("serializes concurrent conversions with source lock response", async () => {
     let releaseCreateItem: (() => void) | null = null;
     const blockedCreateItem = new Promise((resolve) => {
diff --git a/apps/web/server/services/presentationCompatibilityService.ts b/apps/web/server/services/presentationCompatibilityService.ts
index b768e2d..1588e86 100644
--- a/apps/web/server/services/presentationCompatibilityService.ts
+++ b/apps/web/server/services/presentationCompatibilityService.ts
@@ -1,3 +1,5 @@
+import crypto from "crypto";
+
 import {
   createLibraryItem,
   getLibraryItemById,
@@ -8,7 +10,16 @@ import {
   PresentationServiceError,
   type PresentationActor,
 } from "./presentationService";
-import { upsertPresentationSourceAttachment } from "./presentationPersistence";
+import {
+  cleanupExpiredPresentationConversionState,
+  getActivePresentationConversionByIdempotency,
+  getActivePresentationConversionBySource,
+  releasePresentationConversionLock,
+  tryAcquirePresentationConversionLock,
+  upsertPresentationConversionRecord,
+  upsertPresentationSourceAttachment,
+  type StoredPresentationConversionRecord,
+} from "./presentationPersistence";
 import {
   PRESENTATION_COMPATIBILITY_SCHEMA_VERSION,
   PRESENTATION_CONVERSION_SCHEMA_VERSION,
@@ -29,7 +40,6 @@ import {
 } from "./presentationObservability";
 
 interface ConversionRecord {
-  sourceKey: string;
   sourceItemId: number;
   sourceFormat: "pptx" | "ppt";
   deckLibraryItemId: number;
@@ -38,24 +48,245 @@ interface ConversionRecord {
   fidelityWarnings: string[];
 }
 
-const conversionBySource = new Map<string, ConversionRecord>();
-const conversionByIdempotencyKey = new Map<string, ConversionRecord>();
-const conversionLocks = new Set<string>();
+interface ConversionStateRecord extends ConversionRecord {
+  idempotencyKey: string;
+  expiresAtMs: number;
+}
+
+const CONVERSION_LOCK_TTL_MS = 3 * 60_000;
+const CONVERSION_RECORD_TTL_MS = 24 * 60 * 60_000;
+
+const fallbackConversionBySource = new Map<string, ConversionStateRecord>();
+const fallbackConversionByIdempotency = new Map<string, ConversionStateRecord>();
+const fallbackConversionLocks = new Map<string, { lockToken: string; expiresAtMs: number }>();
 
 export interface PresentationConversionDependencies {
+  useInMemoryStateFallback?: boolean;
   getLibraryItemById: typeof getLibraryItemById;
   createLibraryItem: typeof createLibraryItem;
   createPresentationDeckForLibraryItem: typeof createPresentationDeckForLibraryItem;
   upsertSourceAttachment: typeof upsertPresentationSourceAttachment;
+  cleanupExpiredConversionState: (input: { now: Date }) => Promise<void>;
+  getStoredConversionBySource: (input: {
+    tenantId: string;
+    sourceItemId: number;
+    now: Date;
+  }) => Promise<StoredPresentationConversionRecord | null>;
+  getStoredConversionByIdempotency: (input: {
+    tenantId: string;
+    sourceItemId: number;
+    idempotencyKey: string;
+    now: Date;
+  }) => Promise<StoredPresentationConversionRecord | null>;
+  upsertStoredConversionRecord: (input: {
+    tenantId: string;
+    sourceItemId: number;
+    sourceFormat: "pptx" | "ppt";
+    idempotencyKey: string;
+    deckLibraryItemId: number;
+    deckId: number;
+    partialFidelity: boolean;
+    fidelityWarnings: string[];
+    now: Date;
+    expiresAt: Date;
+  }) => Promise<StoredPresentationConversionRecord>;
+  acquireConversionLock: (input: {
+    tenantId: string;
+    sourceItemId: number;
+    lockToken: string;
+    now: Date;
+    expiresAt: Date;
+  }) => Promise<boolean>;
+  releaseConversionLock: (input: {
+    tenantId: string;
+    sourceItemId: number;
+    lockToken: string;
+  }) => Promise<void>;
+  now: () => number;
+  conversionLockTtlMs: number;
+  conversionRecordTtlMs: number;
 }
 
+const durableStateDependencies = {
+  cleanupExpiredConversionState: cleanupExpiredPresentationConversionState,
+  getStoredConversionBySource: getActivePresentationConversionBySource,
+  getStoredConversionByIdempotency: getActivePresentationConversionByIdempotency,
+  upsertStoredConversionRecord: upsertPresentationConversionRecord,
+  acquireConversionLock: tryAcquirePresentationConversionLock,
+  releaseConversionLock: releasePresentationConversionLock,
+};
+
 const defaultDependencies: PresentationConversionDependencies = {
   getLibraryItemById,
   createLibraryItem,
   createPresentationDeckForLibraryItem,
   upsertSourceAttachment: upsertPresentationSourceAttachment,
+  ...durableStateDependencies,
+  now: Date.now,
+  conversionLockTtlMs: CONVERSION_LOCK_TTL_MS,
+  conversionRecordTtlMs: CONVERSION_RECORD_TTL_MS,
 };
 
+function buildSourceKey(actor: Pick<PresentationActor, "tenantId">, sourceItemId: number): string {
+  return `${actor.tenantId}:${sourceItemId}`;
+}
+
+function buildIdempotencyCacheKey(sourceKey: string, idempotencyKey: string): string {
+  return `${sourceKey}:${idempotencyKey}`;
+}
+
+function pruneFallbackConversionState(nowMs: number): void {
+  for (const [sourceKey, record] of fallbackConversionBySource.entries()) {
+    if (record.expiresAtMs <= nowMs) {
+      fallbackConversionBySource.delete(sourceKey);
+      fallbackConversionByIdempotency.delete(buildIdempotencyCacheKey(sourceKey, record.idempotencyKey));
+    }
+  }
+
+  for (const [sourceKey, lockState] of fallbackConversionLocks.entries()) {
+    if (lockState.expiresAtMs <= nowMs) {
+      fallbackConversionLocks.delete(sourceKey);
+    }
+  }
+}
+
+function toStoredRecord(record: ConversionStateRecord): StoredPresentationConversionRecord {
+  return {
+    sourceItemId: record.sourceItemId,
+    sourceFormat: record.sourceFormat,
+    deckLibraryItemId: record.deckLibraryItemId,
+    deckId: record.deckId,
+    partialFidelity: record.partialFidelity,
+    fidelityWarnings: record.fidelityWarnings,
+  };
+}
+
+const fallbackStateDependencies = {
+  async cleanupExpiredConversionState(): Promise<void> {
+    return;
+  },
+
+  async getStoredConversionBySource(input: {
+    tenantId: string;
+    sourceItemId: number;
+    now: Date;
+  }): Promise<StoredPresentationConversionRecord | null> {
+    const nowMs = input.now.getTime();
+    pruneFallbackConversionState(nowMs);
+    const sourceKey = buildSourceKey({ tenantId: input.tenantId }, input.sourceItemId);
+    const record = fallbackConversionBySource.get(sourceKey);
+    return record ? toStoredRecord(record) : null;
+  },
+
+  async getStoredConversionByIdempotency(input: {
+    tenantId: string;
+    sourceItemId: number;
+    idempotencyKey: string;
+    now: Date;
+  }): Promise<StoredPresentationConversionRecord | null> {
+    const nowMs = input.now.getTime();
+    pruneFallbackConversionState(nowMs);
+    const sourceKey = buildSourceKey({ tenantId: input.tenantId }, input.sourceItemId);
+    const record = fallbackConversionByIdempotency.get(
+      buildIdempotencyCacheKey(sourceKey, input.idempotencyKey),
+    );
+    return record ? toStoredRecord(record) : null;
+  },
+
+  async upsertStoredConversionRecord(input: {
+    tenantId: string;
+    sourceItemId: number;
+    sourceFormat: "pptx" | "ppt";
+    idempotencyKey: string;
+    deckLibraryItemId: number;
+    deckId: number;
+    partialFidelity: boolean;
+    fidelityWarnings: string[];
+    now: Date;
+    expiresAt: Date;
+  }): Promise<StoredPresentationConversionRecord> {
+    const nowMs = input.now.getTime();
+    pruneFallbackConversionState(nowMs);
+    const sourceKey = buildSourceKey({ tenantId: input.tenantId }, input.sourceItemId);
+    const record: ConversionStateRecord = {
+      sourceItemId: input.sourceItemId,
+      sourceFormat: input.sourceFormat,
+      deckLibraryItemId: input.deckLibraryItemId,
+      deckId: input.deckId,
+      partialFidelity: input.partialFidelity,
+      fidelityWarnings: input.fidelityWarnings,
+      idempotencyKey: input.idempotencyKey,
+      expiresAtMs: input.expiresAt.getTime(),
+    };
+    fallbackConversionBySource.set(sourceKey, record);
+    fallbackConversionByIdempotency.set(
+      buildIdempotencyCacheKey(sourceKey, input.idempotencyKey),
+      record,
+    );
+    return toStoredRecord(record);
+  },
+
+  async acquireConversionLock(input: {
+    tenantId: string;
+    sourceItemId: number;
+    lockToken: string;
+    now: Date;
+    expiresAt: Date;
+  }): Promise<boolean> {
+    const nowMs = input.now.getTime();
+    pruneFallbackConversionState(nowMs);
+    const sourceKey = buildSourceKey({ tenantId: input.tenantId }, input.sourceItemId);
+    const existing = fallbackConversionLocks.get(sourceKey);
+    if (existing && existing.expiresAtMs > nowMs) {
+      return false;
+    }
+    fallbackConversionLocks.set(sourceKey, {
+      lockToken: input.lockToken,
+      expiresAtMs: input.expiresAt.getTime(),
+    });
+    return true;
+  },
+
+  async releaseConversionLock(input: {
+    tenantId: string;
+    sourceItemId: number;
+    lockToken: string;
+  }): Promise<void> {
+    const sourceKey = buildSourceKey({ tenantId: input.tenantId }, input.sourceItemId);
+    const existing = fallbackConversionLocks.get(sourceKey);
+    if (existing?.lockToken === input.lockToken) {
+      fallbackConversionLocks.delete(sourceKey);
+    }
+  },
+};
+
+function resolveDependencies(
+  deps?: Partial<PresentationConversionDependencies>,
+): PresentationConversionDependencies {
+  const useFallbackState = deps?.useInMemoryStateFallback === true;
+  const stateDependencies = useFallbackState ? fallbackStateDependencies : durableStateDependencies;
+
+  return {
+    getLibraryItemById: deps?.getLibraryItemById ?? defaultDependencies.getLibraryItemById,
+    createLibraryItem: deps?.createLibraryItem ?? defaultDependencies.createLibraryItem,
+    createPresentationDeckForLibraryItem:
+      deps?.createPresentationDeckForLibraryItem ?? defaultDependencies.createPresentationDeckForLibraryItem,
+    upsertSourceAttachment: deps?.upsertSourceAttachment ?? defaultDependencies.upsertSourceAttachment,
+    cleanupExpiredConversionState:
+      deps?.cleanupExpiredConversionState ?? stateDependencies.cleanupExpiredConversionState,
+    getStoredConversionBySource: deps?.getStoredConversionBySource ?? stateDependencies.getStoredConversionBySource,
+    getStoredConversionByIdempotency:
+      deps?.getStoredConversionByIdempotency ?? stateDependencies.getStoredConversionByIdempotency,
+    upsertStoredConversionRecord:
+      deps?.upsertStoredConversionRecord ?? stateDependencies.upsertStoredConversionRecord,
+    acquireConversionLock: deps?.acquireConversionLock ?? stateDependencies.acquireConversionLock,
+    releaseConversionLock: deps?.releaseConversionLock ?? stateDependencies.releaseConversionLock,
+    now: deps?.now ?? defaultDependencies.now,
+    conversionLockTtlMs: deps?.conversionLockTtlMs ?? defaultDependencies.conversionLockTtlMs,
+    conversionRecordTtlMs: deps?.conversionRecordTtlMs ?? defaultDependencies.conversionRecordTtlMs,
+  };
+}
+
 function normalizeSourceExtension(item: Pick<LibraryItemDto, "metadata" | "sourceUrl" | "title">): string {
   const metadata = item.metadata && typeof item.metadata === "object"
     ? item.metadata
@@ -116,10 +347,6 @@ function collectFidelityWarnings(metadata: Record<string, unknown>): string[] {
   return warnings.slice(0, 25);
 }
 
-function buildSourceKey(actor: PresentationActor, sourceItemId: number): string {
-  return `${actor.tenantId}:${sourceItemId}`;
-}
-
 function toBasePresentationTitle(sourceTitle: string): string {
   const base = sourceTitle.replace(/\.(pptx?|PPTX?)$/, "");
   const trimmed = base.trim();
@@ -148,9 +375,10 @@ function toCompatibilityReadOnly(
 export async function getPresentationCompatibilityOpen(
   itemId: number,
   actor: PresentationActor,
-  deps: PresentationConversionDependencies = defaultDependencies,
+  deps?: Partial<PresentationConversionDependencies>,
 ): Promise<PresentationCompatibilityResult> {
-  const item = await deps.getLibraryItemById(itemId, actor);
+  const resolved = resolveDependencies(deps);
+  const item = await resolved.getLibraryItemById(itemId, actor);
   if (!item) {
     throw new PresentationServiceError(
       PRESENTATION_ERROR_CODE.NOT_FOUND,
@@ -232,10 +460,12 @@ function recordConversionOutcome(
 export async function convertOfficeSourceToPresentation(
   input: { sourceItemId: number; idempotencyKey: string },
   actor: PresentationActor,
-  deps: PresentationConversionDependencies = defaultDependencies,
+  deps?: Partial<PresentationConversionDependencies>,
 ): Promise<PresentationConversionResult> {
+  const resolved = resolveDependencies(deps);
+
   try {
-    const sourceItem = await deps.getLibraryItemById(input.sourceItemId, actor);
+    const sourceItem = await resolved.getLibraryItemById(input.sourceItemId, actor);
     if (!sourceItem) {
       throw new PresentationServiceError(
         PRESENTATION_ERROR_CODE.NOT_FOUND,
@@ -273,21 +503,41 @@ export async function convertOfficeSourceToPresentation(
       );
     }
 
+    const nowMs = resolved.now();
+    const now = new Date(nowMs);
     const sourceKey = buildSourceKey(actor, sourceItem.id);
-    const existingBySource = conversionBySource.get(sourceKey);
+    await resolved.cleanupExpiredConversionState({ now });
+
+    const existingBySource = await resolved.getStoredConversionBySource({
+      tenantId: actor.tenantId,
+      sourceItemId: sourceItem.id,
+      now,
+    });
     if (existingBySource) {
-      recordConversionOutcome(actor, sourceFormat, "existing");
+      recordConversionOutcome(actor, existingBySource.sourceFormat, "existing");
       return toConversionResult("existing", existingBySource);
     }
 
-    const idempotencyCacheKey = `${sourceKey}:${normalizedIdempotencyKey}`;
-    const existingByIdempotency = conversionByIdempotencyKey.get(idempotencyCacheKey);
+    const existingByIdempotency = await resolved.getStoredConversionByIdempotency({
+      tenantId: actor.tenantId,
+      sourceItemId: sourceItem.id,
+      idempotencyKey: normalizedIdempotencyKey,
+      now,
+    });
     if (existingByIdempotency) {
-      recordConversionOutcome(actor, sourceFormat, "existing");
+      recordConversionOutcome(actor, existingByIdempotency.sourceFormat, "existing");
       return toConversionResult("existing", existingByIdempotency);
     }
 
-    if (conversionLocks.has(sourceKey)) {
+    const lockToken = `presentation-conversion-lock-${crypto.randomUUID()}`;
+    const lockAcquired = await resolved.acquireConversionLock({
+      tenantId: actor.tenantId,
+      sourceItemId: sourceItem.id,
+      lockToken,
+      now,
+      expiresAt: new Date(nowMs + resolved.conversionLockTtlMs),
+    });
+    if (!lockAcquired) {
       recordConversionOutcome(actor, sourceFormat, "locked");
       return presentationConversionResultSchema.parse({
         schemaVersion: PRESENTATION_CONVERSION_SCHEMA_VERSION,
@@ -300,10 +550,8 @@ export async function convertOfficeSourceToPresentation(
       });
     }
 
-    conversionLocks.add(sourceKey);
-
     try {
-      const convertedItem = await deps.createLibraryItem(
+      const convertedItem = await resolved.createLibraryItem(
         {
           itemType: PRESENTATION_ITEM_TYPE,
           source: "presentation_conversion",
@@ -323,7 +571,7 @@ export async function convertOfficeSourceToPresentation(
         actor,
       );
 
-      const createdDeck = await deps.createPresentationDeckForLibraryItem(
+      const createdDeck = await resolved.createPresentationDeckForLibraryItem(
         {
           libraryItemId: convertedItem.item.id,
           title: toBasePresentationTitle(sourceItem.title),
@@ -332,7 +580,7 @@ export async function convertOfficeSourceToPresentation(
         actor,
       );
 
-      await deps.upsertSourceAttachment({
+      await resolved.upsertSourceAttachment({
         deckId: createdDeck.deck.id,
         sourceLibraryItemId: sourceItem.id,
         sourceFormat,
@@ -341,22 +589,37 @@ export async function convertOfficeSourceToPresentation(
         fidelityWarnings,
       });
 
-      const record: ConversionRecord = {
-        sourceKey,
+      const persistedAtMs = resolved.now();
+      const persistedRecord = await resolved.upsertStoredConversionRecord({
+        tenantId: actor.tenantId,
         sourceItemId: sourceItem.id,
         sourceFormat,
+        idempotencyKey: normalizedIdempotencyKey,
         deckLibraryItemId: convertedItem.item.id,
         deckId: createdDeck.deck.id,
         partialFidelity: fidelityWarnings.length > 0,
         fidelityWarnings,
-      };
+        now: new Date(persistedAtMs),
+        expiresAt: new Date(persistedAtMs + resolved.conversionRecordTtlMs),
+      });
 
-      conversionBySource.set(sourceKey, record);
-      conversionByIdempotencyKey.set(idempotencyCacheKey, record);
       recordConversionOutcome(actor, sourceFormat, "created");
-      return toConversionResult("created", record);
+      return toConversionResult("created", persistedRecord);
     } finally {
-      conversionLocks.delete(sourceKey);
+      try {
+        await resolved.releaseConversionLock({
+          tenantId: actor.tenantId,
+          sourceItemId: sourceItem.id,
+          lockToken,
+        });
+      } catch (releaseError) {
+        recordPresentationLog("presentation_conversion_lock_release_failed", {
+          tenantId: actor.tenantId,
+          userId: actor.userId,
+          sourceKey,
+          error: releaseError instanceof Error ? releaseError.message : String(releaseError),
+        });
+      }
     }
   } catch (error) {
     if (error instanceof PresentationServiceError) {
@@ -372,7 +635,7 @@ export async function convertOfficeSourceToPresentation(
 }
 
 export function resetPresentationConversionStateForTests(): void {
-  conversionBySource.clear();
-  conversionByIdempotencyKey.clear();
-  conversionLocks.clear();
+  fallbackConversionBySource.clear();
+  fallbackConversionByIdempotency.clear();
+  fallbackConversionLocks.clear();
 }
diff --git a/apps/web/server/services/presentationObservability.test.ts b/apps/web/server/services/presentationObservability.test.ts
index 85ba105..c4ea7d7 100644
--- a/apps/web/server/services/presentationObservability.test.ts
+++ b/apps/web/server/services/presentationObservability.test.ts
@@ -127,6 +127,7 @@ describe("presentationObservability", () => {
 
   it("records conversion failure metrics for unsupported conversion requests", async () => {
     const deps = {
+      useInMemoryStateFallback: true,
       getLibraryItemById: vi.fn().mockResolvedValue({
         id: 501,
         tenantId: actor.tenantId,
diff --git a/apps/web/server/services/presentationPersistence.test.ts b/apps/web/server/services/presentationPersistence.test.ts
index 53a7ca2..0ef6567 100644
--- a/apps/web/server/services/presentationPersistence.test.ts
+++ b/apps/web/server/services/presentationPersistence.test.ts
@@ -25,6 +25,24 @@ describe("presentation schema migration", () => {
   });
 });
 
+describe("presentation hardening migration", () => {
+  it("adds durable conversion state and tenant integrity constraints", () => {
+    const migrationPath = path.resolve(
+      import.meta.dirname,
+      "../../drizzle/0033_presentation_hardening_stream_c.sql",
+    );
+    const sql = fs.readFileSync(migrationPath, "utf-8");
+
+    expect(sql).toContain("CREATE TABLE IF NOT EXISTS presentation_conversion_records");
+    expect(sql).toContain("CREATE TABLE IF NOT EXISTS presentation_conversion_locks");
+    expect(sql).toContain("presentation_asset_links_deck_tenant_fk");
+    expect(sql).toContain("presentation_asset_links_library_item_tenant_fk");
+    expect(sql).toContain("presentation_asset_links_slide_deck_fk");
+    expect(sql.toUpperCase()).not.toContain("DROP TABLE");
+    expect(sql.toUpperCase()).not.toContain("DROP COLUMN");
+  });
+});
+
 describe("slide ordering invariants", () => {
   it("rejects duplicate order indexes", () => {
     expect(() => assertNoDuplicateOrderIndexes([0, 1, 1, 2])).toThrow(/duplicate/i);
diff --git a/apps/web/server/services/presentationPersistence.ts b/apps/web/server/services/presentationPersistence.ts
index 66e4206..c6b5dba 100644
--- a/apps/web/server/services/presentationPersistence.ts
+++ b/apps/web/server/services/presentationPersistence.ts
@@ -1,12 +1,15 @@
-import { and, eq, sql } from "drizzle-orm";
+import { and, eq, gt, lte, sql } from "drizzle-orm";
 
 import { getDb } from "../db";
 import {
   presentationAssetLinks,
+  presentationConversionLocks,
+  presentationConversionRecords,
   presentationDecks,
   presentationSourceAttachments,
   presentationSlides,
   type PresentationAssetLink,
+  type PresentationConversionRecord,
   type PresentationDeck,
   type PresentationSourceAttachment,
   type PresentationSlide,
@@ -85,6 +88,56 @@ export interface UpsertPresentationSourceAttachmentInput {
   fidelityWarnings: string[];
 }
 
+export interface PresentationConversionLookupInput {
+  tenantId: string;
+  sourceItemId: number;
+  now: Date;
+}
+
+export interface PresentationConversionIdempotencyLookupInput extends PresentationConversionLookupInput {
+  idempotencyKey: string;
+}
+
+export interface UpsertPresentationConversionRecordInput {
+  tenantId: string;
+  sourceItemId: number;
+  sourceFormat: "pptx" | "ppt";
+  idempotencyKey: string;
+  deckLibraryItemId: number;
+  deckId: number;
+  partialFidelity: boolean;
+  fidelityWarnings: string[];
+  now: Date;
+  expiresAt: Date;
+}
+
+export interface AcquirePresentationConversionLockInput {
+  tenantId: string;
+  sourceItemId: number;
+  lockToken: string;
+  now: Date;
+  expiresAt: Date;
+}
+
+export interface ReleasePresentationConversionLockInput {
+  tenantId: string;
+  sourceItemId: number;
+  lockToken: string;
+}
+
+export interface StoredPresentationConversionRecord {
+  sourceItemId: number;
+  sourceFormat: "pptx" | "ppt";
+  deckLibraryItemId: number;
+  deckId: number;
+  partialFidelity: boolean;
+  fidelityWarnings: string[];
+}
+
+export interface CleanupExpiredPresentationConversionStateInput {
+  now: Date;
+}
+
 async function resolveDb(dbClient?: DbClient): Promise<DbClient> {
   if (dbClient) {
     return dbClient;
@@ -525,3 +578,185 @@ export async function upsertPresentationSourceAttachment(
 
   return created[0];
 }
+
+function mapStoredConversionRecord(
+  row: PresentationConversionRecord,
+): StoredPresentationConversionRecord {
+  const rawWarnings = Array.isArray(row.fidelityWarnings) ? row.fidelityWarnings : [];
+  return {
+    sourceItemId: row.sourceItemId,
+    sourceFormat: row.sourceFormat === "ppt" ? "ppt" : "pptx",
+    deckLibraryItemId: row.deckLibraryItemId,
+    deckId: row.deckId,
+    partialFidelity: row.partialFidelity,
+    fidelityWarnings: rawWarnings.filter((warning): warning is string => typeof warning === "string"),
+  };
+}
+
+export async function getActivePresentationConversionBySource(
+  input: PresentationConversionLookupInput,
+  dbClient?: DbClient,
+): Promise<StoredPresentationConversionRecord | null> {
+  const db = await resolveDb(dbClient);
+
+  await db
+    .delete(presentationConversionRecords)
+    .where(and(
+      eq(presentationConversionRecords.tenantId, input.tenantId),
+      eq(presentationConversionRecords.sourceItemId, input.sourceItemId),
+      lte(presentationConversionRecords.expiresAt, input.now),
+    ));
+
+  const rows = await db
+    .select()
+    .from(presentationConversionRecords)
+    .where(and(
+      eq(presentationConversionRecords.tenantId, input.tenantId),
+      eq(presentationConversionRecords.sourceItemId, input.sourceItemId),
+      gt(presentationConversionRecords.expiresAt, input.now),
+    ))
+    .limit(1);
+
+  if (!rows[0]) {
+    return null;
+  }
+
+  return mapStoredConversionRecord(rows[0]);
+}
+
+export async function getActivePresentationConversionByIdempotency(
+  input: PresentationConversionIdempotencyLookupInput,
+  dbClient?: DbClient,
+): Promise<StoredPresentationConversionRecord | null> {
+  const db = await resolveDb(dbClient);
+
+  await db
+    .delete(presentationConversionRecords)
+    .where(and(
+      eq(presentationConversionRecords.tenantId, input.tenantId),
+      eq(presentationConversionRecords.sourceItemId, input.sourceItemId),
+      lte(presentationConversionRecords.expiresAt, input.now),
+    ));
+
+  const rows = await db
+    .select()
+    .from(presentationConversionRecords)
+    .where(and(
+      eq(presentationConversionRecords.tenantId, input.tenantId),
+      eq(presentationConversionRecords.sourceItemId, input.sourceItemId),
+      eq(presentationConversionRecords.idempotencyKey, input.idempotencyKey),
+      gt(presentationConversionRecords.expiresAt, input.now),
+    ))
+    .limit(1);
+
+  if (!rows[0]) {
+    return null;
+  }
+
+  return mapStoredConversionRecord(rows[0]);
+}
+
+export async function upsertPresentationConversionRecord(
+  input: UpsertPresentationConversionRecordInput,
+  dbClient?: DbClient,
+): Promise<StoredPresentationConversionRecord> {
+  const db = await resolveDb(dbClient);
+
+  const rows = await db
+    .insert(presentationConversionRecords)
+    .values({
+      tenantId: input.tenantId,
+      sourceItemId: input.sourceItemId,
+      sourceFormat: input.sourceFormat,
+      idempotencyKey: input.idempotencyKey,
+      deckLibraryItemId: input.deckLibraryItemId,
+      deckId: input.deckId,
+      partialFidelity: input.partialFidelity,
+      fidelityWarnings: input.fidelityWarnings,
+      expiresAt: input.expiresAt,
+      createdAt: input.now,
+      updatedAt: input.now,
+    })
+    .onConflictDoUpdate({
+      target: [presentationConversionRecords.tenantId, presentationConversionRecords.sourceItemId],
+      set: {
+        sourceFormat: input.sourceFormat,
+        idempotencyKey: input.idempotencyKey,
+        deckLibraryItemId: input.deckLibraryItemId,
+        deckId: input.deckId,
+        partialFidelity: input.partialFidelity,
+        fidelityWarnings: input.fidelityWarnings,
+        expiresAt: input.expiresAt,
+        updatedAt: input.now,
+      },
+    })
+    .returning();
+
+  if (!rows[0]) {
+    throw new Error("Failed to persist presentation conversion record");
+  }
+
+  return mapStoredConversionRecord(rows[0]);
+}
+
+export async function tryAcquirePresentationConversionLock(
+  input: AcquirePresentationConversionLockInput,
+  dbClient?: DbClient,
+): Promise<boolean> {
+  const db = await resolveDb(dbClient);
+
+  const inserted = await db.transaction(async (tx) => {
+    await tx
+      .delete(presentationConversionLocks)
+      .where(and(
+        eq(presentationConversionLocks.tenantId, input.tenantId),
+        eq(presentationConversionLocks.sourceItemId, input.sourceItemId),
+        lte(presentationConversionLocks.expiresAt, input.now),
+      ));
+
+    return tx
+      .insert(presentationConversionLocks)
+      .values({
+        tenantId: input.tenantId,
+        sourceItemId: input.sourceItemId,
+        lockToken: input.lockToken,
+        expiresAt: input.expiresAt,
+        createdAt: input.now,
+        updatedAt: input.now,
+      })
+      .onConflictDoNothing()
+      .returning({ lockToken: presentationConversionLocks.lockToken });
+  });
+
+  return inserted[0]?.lockToken === input.lockToken;
+}
+
+export async function releasePresentationConversionLock(
+  input: ReleasePresentationConversionLockInput,
+  dbClient?: DbClient,
+): Promise<void> {
+  const db = await resolveDb(dbClient);
+
+  await db
+    .delete(presentationConversionLocks)
+    .where(and(
+      eq(presentationConversionLocks.tenantId, input.tenantId),
+      eq(presentationConversionLocks.sourceItemId, input.sourceItemId),
+      eq(presentationConversionLocks.lockToken, input.lockToken),
+    ));
+}
+
+export async function cleanupExpiredPresentationConversionState(
+  input: CleanupExpiredPresentationConversionStateInput,
+  dbClient?: DbClient,
+): Promise<void> {
+  const db = await resolveDb(dbClient);
+
+  await db
+    .delete(presentationConversionLocks)
+    .where(lte(presentationConversionLocks.expiresAt, input.now));
+
+  await db
+    .delete(presentationConversionRecords)
+    .where(lte(presentationConversionRecords.expiresAt, input.now));
+}
diff --git a/apps/web/server/services/presentationPlaybackExport.test.ts b/apps/web/server/services/presentationPlaybackExport.test.ts
index ace613b..ddf9704 100644
--- a/apps/web/server/services/presentationPlaybackExport.test.ts
+++ b/apps/web/server/services/presentationPlaybackExport.test.ts
@@ -101,7 +101,7 @@ describe("presentationPlaybackExport", () => {
         {
           getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
           enqueueExportJob: vi.fn(),
-          now: () => 1_000,
+          now: () => Date.parse("2026-02-22T10:00:01.000Z"),
         },
       ),
     ).rejects.toSatisfy((error: unknown) => {
@@ -130,7 +130,7 @@ describe("presentationPlaybackExport", () => {
         {
           getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
           enqueueExportJob: vi.fn(),
-          now: () => 2_000,
+          now: () => Date.parse("2026-02-22T10:00:02.000Z"),
           acceptedRenderSchemaVersions: ["presentation_render_v0"],
         },
       ),
@@ -145,7 +145,7 @@ describe("presentationPlaybackExport", () => {
   it("dedupes duplicate export requests within the dedupe window", async () => {
     const enqueueExportJob = vi.fn().mockResolvedValue({ jobId: "job-1" });
     const deckDetail = buildDeckDetail();
-    let now = 10_000;
+    let now = Date.parse("2026-02-22T10:00:10.000Z");
 
     const first = await triggerPresentationExport(
       { deckId: 101, format: "png", idempotencyKey: "click-1" },
@@ -175,9 +175,103 @@ describe("presentationPlaybackExport", () => {
     expect(second.deduped).toBe(true);
   });
 
+  it("expires stale export status entries after ttl", async () => {
+    vi.useFakeTimers();
+    try {
+      const deckDetail = buildDeckDetail();
+      const baseMs = Date.parse("2026-02-22T12:00:00.000Z");
+      vi.setSystemTime(baseMs);
+
+      const queued = await triggerPresentationExport(
+        { deckId: 101, format: "mp4", idempotencyKey: "ttl-status" },
+        actor,
+        {
+          getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
+          enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-ttl-1" }),
+        },
+      );
+
+      expect(getPresentationExportStatus(queued.exportId, actor).status).toBe("queued");
+
+      vi.setSystemTime(baseMs + 16 * 60_000);
+
+      expect(() => getPresentationExportStatus(queued.exportId, actor)).toThrowError(
+        PresentationServiceError,
+      );
+      expect(() => getPresentationExportStatus(queued.exportId, actor)).toThrow(
+        PRESENTATION_ERROR_CODE.NOT_FOUND,
+      );
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
+  it("evicts oldest dedupe entries when maxDedupeEntries is exceeded", async () => {
+    const enqueueExportJob = vi.fn().mockResolvedValue({ jobId: "job-cap-1" });
+    const deckDetail = buildDeckDetail();
+    let now = Date.parse("2026-02-22T10:00:50.000Z");
+
+    const dependencies = {
+      getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
+      enqueueExportJob,
+      now: () => now,
+      maxDedupeEntries: 2,
+      maxStatusEntries: 10,
+      maxResultEntries: 10,
+    };
+
+    await triggerPresentationExport({ deckId: 101, format: "png", idempotencyKey: "cap-a" }, actor, dependencies);
+    now += 100;
+    await triggerPresentationExport({ deckId: 101, format: "png", idempotencyKey: "cap-b" }, actor, dependencies);
+    now += 100;
+    await triggerPresentationExport({ deckId: 101, format: "png", idempotencyKey: "cap-c" }, actor, dependencies);
+    now += 100;
+    await triggerPresentationExport({ deckId: 101, format: "png", idempotencyKey: "cap-a" }, actor, dependencies);
+
+    expect(enqueueExportJob).toHaveBeenCalledTimes(4);
+  });
+
+  it("evicts oldest status entries when maxStatusEntries is exceeded", async () => {
+    const deckDetail = buildDeckDetail();
+    let now = Date.parse("2026-02-22T10:01:00.000Z");
+
+    const dependencies = {
+      getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
+      enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-cap-status" }),
+      now: () => now,
+      maxDedupeEntries: 10,
+      maxStatusEntries: 2,
+      maxResultEntries: 2,
+    };
+
+    const first = await triggerPresentationExport(
+      { deckId: 101, format: "mp4", idempotencyKey: "status-cap-a" },
+      actor,
+      dependencies,
+    );
+    now += 100;
+    const second = await triggerPresentationExport(
+      { deckId: 101, format: "mp4", idempotencyKey: "status-cap-b" },
+      actor,
+      dependencies,
+    );
+    now += 100;
+    const third = await triggerPresentationExport(
+      { deckId: 101, format: "mp4", idempotencyKey: "status-cap-c" },
+      actor,
+      dependencies,
+    );
+
+    expect(() => getPresentationExportStatus(first.exportId, actor)).toThrow(
+      PRESENTATION_ERROR_CODE.NOT_FOUND,
+    );
+    expect(getPresentationExportStatus(second.exportId, actor).status).toBe("queued");
+    expect(getPresentationExportStatus(third.exportId, actor).status).toBe("queued");
+  });
+
   it("enforces per-user and per-deck throttles with stable retry semantics", async () => {
     const deckDetail = buildDeckDetail();
-    let now = 20_000;
+    let now = Date.parse("2026-02-22T10:00:20.000Z");
 
     const dependencies = {
       getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
@@ -215,7 +309,7 @@ describe("presentationPlaybackExport", () => {
       {
         getDeckDetail: vi.fn().mockResolvedValue(deckDetail),
         enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-scope-1" }),
-        now: () => 40_000,
+        now: () => Date.parse("2026-02-22T10:00:40.000Z"),
       },
     );
 
diff --git a/apps/web/server/services/presentationPlaybackExport.ts b/apps/web/server/services/presentationPlaybackExport.ts
index ecb4e1a..98e6121 100644
--- a/apps/web/server/services/presentationPlaybackExport.ts
+++ b/apps/web/server/services/presentationPlaybackExport.ts
@@ -36,6 +36,13 @@ const DEDUPE_WINDOW_MS = 15_000;
 const THROTTLE_WINDOW_MS = 60_000;
 const MAX_USER_REQUESTS_PER_WINDOW = 6;
 const MAX_DECK_REQUESTS_PER_WINDOW = 4;
+const EXPORT_STATUS_TTL_MS = 15 * 60_000;
+const EXPORT_RESULT_TTL_MS = 15 * 60_000;
+const MAX_DEDUPE_REGISTRY_ENTRIES = 5_000;
+const MAX_STATUS_REGISTRY_ENTRIES = 5_000;
+const MAX_RESULT_REGISTRY_ENTRIES = 5_000;
+const MAX_THROTTLE_KEYS = 5_000;
+const MAX_THROTTLE_WINDOW_ENTRIES_PER_KEY = 120;
 
 interface PresentationExportStateRecord {
   exportId: string;
@@ -43,14 +50,31 @@ interface PresentationExportStateRecord {
   createdAtMs: number;
 }
 
+interface PresentationExportStatusStateRecord {
+  createdAtMs: number;
+  value: PresentationExportStatusResult & { tenantId: string; userId: number };
+}
+
+interface PresentationExportResultStateRecord {
+  createdAtMs: number;
+  value: PresentationExportResult;
+}
+
 interface TriggerPresentationExportDependencies {
   getDeckDetail?: (deckId: number, actor: PresentationActor) => Promise<PresentationDeckDetail>;
   enqueueExportJob?: (renderSpec: PresentationRenderSpec, format: "png" | "mp4") => Promise<{ jobId: string }>;
   now?: () => number;
   dedupeWindowMs?: number;
   throttleWindowMs?: number;
+  statusTtlMs?: number;
+  resultTtlMs?: number;
   maxUserRequestsPerMinute?: number;
   maxDeckRequestsPerMinute?: number;
+  maxDedupeEntries?: number;
+  maxStatusEntries?: number;
+  maxResultEntries?: number;
+  maxThrottleKeys?: number;
+  maxThrottleWindowEntriesPerKey?: number;
   acceptedRenderSchemaVersions?: string[];
   recordMetric?: (metric: string, tags?: Record<string, string>) => void;
   recordLog?: (event: string, payload: Record<string, unknown>) => void;
@@ -78,8 +102,8 @@ export interface TriggerPresentationExportInput {
 }
 
 const dedupeRegistry = new Map<string, PresentationExportStateRecord>();
-const statusRegistry = new Map<string, PresentationExportStatusResult & { tenantId: string; userId: number }>();
-const resultRegistry = new Map<string, PresentationExportResult>();
+const statusRegistry = new Map<string, PresentationExportStatusStateRecord>();
+const resultRegistry = new Map<string, PresentationExportResultStateRecord>();
 const userWindowRegistry = new Map<string, number[]>();
 const deckWindowRegistry = new Map<string, number[]>();
 
@@ -122,14 +146,140 @@ function pruneWindow(entries: number[], nowMs: number, windowMs: number): number
   return entries.filter((ts) => ts > floor);
 }
 
+function trimRegistryByAge<K, V extends { createdAtMs: number }>(
+  registry: Map<K, V>,
+  nowMs: number,
+  ttlMs: number,
+): void {
+  for (const [key, record] of registry.entries()) {
+    if (nowMs - record.createdAtMs > ttlMs) {
+      registry.delete(key);
+    }
+  }
+}
+
+function trimRegistryToMaxEntries<K, V extends { createdAtMs: number }>(
+  registry: Map<K, V>,
+  maxEntries: number,
+): void {
+  if (registry.size <= maxEntries) {
+    return;
+  }
+
+  const sorted = [...registry.entries()].sort((a, b) => a[1].createdAtMs - b[1].createdAtMs);
+  const deleteCount = registry.size - maxEntries;
+  for (let index = 0; index < deleteCount; index += 1) {
+    registry.delete(sorted[index][0]);
+  }
+}
+
+function evictOldestThrottleKey(registry: Map<string, number[]>): void {
+  let oldestKey: string | null = null;
+  let oldestActivity = Number.POSITIVE_INFINITY;
+
+  for (const [key, entries] of registry.entries()) {
+    const latest = entries[entries.length - 1] ?? Number.NEGATIVE_INFINITY;
+    if (latest < oldestActivity) {
+      oldestActivity = latest;
+      oldestKey = key;
+    }
+  }
+
+  if (oldestKey !== null) {
+    registry.delete(oldestKey);
+  }
+}
+
+function compactThrottleRegistry(
+  registry: Map<string, number[]>,
+  nowMs: number,
+  windowMs: number,
+  maxKeys: number,
+  maxEntriesPerKey: number,
+): void {
+  for (const [key, entries] of registry.entries()) {
+    const active = pruneWindow(entries, nowMs, windowMs).slice(-maxEntriesPerKey);
+    if (active.length === 0) {
+      registry.delete(key);
+      continue;
+    }
+    registry.set(key, active);
+  }
+
+  while (registry.size > maxKeys) {
+    evictOldestThrottleKey(registry);
+  }
+}
+
+function compactExportState(
+  nowMs: number,
+  options: {
+    dedupeWindowMs: number;
+    statusTtlMs: number;
+    resultTtlMs: number;
+    throttleWindowMs: number;
+    maxDedupeEntries: number;
+    maxStatusEntries: number;
+    maxResultEntries: number;
+    maxThrottleKeys: number;
+    maxThrottleWindowEntriesPerKey: number;
+  },
+): void {
+  trimRegistryByAge(dedupeRegistry, nowMs, options.dedupeWindowMs);
+  trimRegistryByAge(statusRegistry, nowMs, options.statusTtlMs);
+  trimRegistryByAge(resultRegistry, nowMs, options.resultTtlMs);
+
+  for (const [dedupeKey, dedupeState] of dedupeRegistry.entries()) {
+    if (!statusRegistry.has(dedupeState.exportId) || !resultRegistry.has(dedupeState.exportId)) {
+      dedupeRegistry.delete(dedupeKey);
+    }
+  }
+
+  trimRegistryToMaxEntries(dedupeRegistry, options.maxDedupeEntries);
+  trimRegistryToMaxEntries(statusRegistry, options.maxStatusEntries);
+  trimRegistryToMaxEntries(resultRegistry, options.maxResultEntries);
+
+  compactThrottleRegistry(
+    userWindowRegistry,
+    nowMs,
+    options.throttleWindowMs,
+    options.maxThrottleKeys,
+    options.maxThrottleWindowEntriesPerKey,
+  );
+  compactThrottleRegistry(
+    deckWindowRegistry,
+    nowMs,
+    options.throttleWindowMs,
+    options.maxThrottleKeys,
+    options.maxThrottleWindowEntriesPerKey,
+  );
+}
+
+function getDefaultStateOptions(nowMs: number) {
+  return {
+    dedupeWindowMs: DEDUPE_WINDOW_MS,
+    statusTtlMs: EXPORT_STATUS_TTL_MS,
+    resultTtlMs: EXPORT_RESULT_TTL_MS,
+    throttleWindowMs: THROTTLE_WINDOW_MS,
+    maxDedupeEntries: MAX_DEDUPE_REGISTRY_ENTRIES,
+    maxStatusEntries: MAX_STATUS_REGISTRY_ENTRIES,
+    maxResultEntries: MAX_RESULT_REGISTRY_ENTRIES,
+    maxThrottleKeys: MAX_THROTTLE_KEYS,
+    maxThrottleWindowEntriesPerKey: MAX_THROTTLE_WINDOW_ENTRIES_PER_KEY,
+    nowMs,
+  };
+}
+
 function enforceThrottle(
   key: string,
   limit: number,
   nowMs: number,
   windowMs: number,
   registry: Map<string, number[]>,
+  maxKeys: number,
+  maxEntriesPerKey: number,
 ): void {
-  const active = pruneWindow(registry.get(key) ?? [], nowMs, windowMs);
+  let active = pruneWindow(registry.get(key) ?? [], nowMs, windowMs).slice(-maxEntriesPerKey);
   if (active.length >= limit) {
     const oldest = active[0] ?? nowMs;
     const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (nowMs - oldest)) / 1000));
@@ -140,8 +290,17 @@ function enforceThrottle(
     );
   }
 
+  if (!registry.has(key) && registry.size >= maxKeys) {
+    evictOldestThrottleKey(registry);
+  }
+
   active.push(nowMs);
-  registry.set(key, active);
+  active = active.slice(-maxEntriesPerKey);
+  if (active.length === 0) {
+    registry.delete(key);
+  } else {
+    registry.set(key, active);
+  }
 }
 
 function resolveDedupeKey(input: TriggerPresentationExportInput, actor: PresentationActor): string {
@@ -158,8 +317,16 @@ function resolveDependencies(
     now: dependencies?.now ?? Date.now,
     dedupeWindowMs: dependencies?.dedupeWindowMs ?? DEDUPE_WINDOW_MS,
     throttleWindowMs: dependencies?.throttleWindowMs ?? THROTTLE_WINDOW_MS,
+    statusTtlMs: dependencies?.statusTtlMs ?? EXPORT_STATUS_TTL_MS,
+    resultTtlMs: dependencies?.resultTtlMs ?? EXPORT_RESULT_TTL_MS,
     maxUserRequestsPerMinute: dependencies?.maxUserRequestsPerMinute ?? MAX_USER_REQUESTS_PER_WINDOW,
     maxDeckRequestsPerMinute: dependencies?.maxDeckRequestsPerMinute ?? MAX_DECK_REQUESTS_PER_WINDOW,
+    maxDedupeEntries: dependencies?.maxDedupeEntries ?? MAX_DEDUPE_REGISTRY_ENTRIES,
+    maxStatusEntries: dependencies?.maxStatusEntries ?? MAX_STATUS_REGISTRY_ENTRIES,
+    maxResultEntries: dependencies?.maxResultEntries ?? MAX_RESULT_REGISTRY_ENTRIES,
+    maxThrottleKeys: dependencies?.maxThrottleKeys ?? MAX_THROTTLE_KEYS,
+    maxThrottleWindowEntriesPerKey:
+      dependencies?.maxThrottleWindowEntriesPerKey ?? MAX_THROTTLE_WINDOW_ENTRIES_PER_KEY,
     acceptedRenderSchemaVersions: dependencies?.acceptedRenderSchemaVersions ?? [PRESENTATION_RENDER_SCHEMA_VERSION],
     recordMetric: dependencies?.recordMetric ?? ((metric: string) => incrementPresentationMetric(metric)),
     recordLog: dependencies?.recordLog ?? recordPresentationLog,
@@ -246,13 +413,24 @@ export async function triggerPresentationExport(
 ): Promise<PresentationExportResult> {
   const resolved = resolveDependencies(dependencies);
   const nowMs = resolved.now();
+  compactExportState(nowMs, {
+    dedupeWindowMs: resolved.dedupeWindowMs,
+    statusTtlMs: resolved.statusTtlMs,
+    resultTtlMs: resolved.resultTtlMs,
+    throttleWindowMs: resolved.throttleWindowMs,
+    maxDedupeEntries: resolved.maxDedupeEntries,
+    maxStatusEntries: resolved.maxStatusEntries,
+    maxResultEntries: resolved.maxResultEntries,
+    maxThrottleKeys: resolved.maxThrottleKeys,
+    maxThrottleWindowEntriesPerKey: resolved.maxThrottleWindowEntriesPerKey,
+  });
   try {
     const dedupeKey = resolveDedupeKey(input, actor);
     const dedupeHit = dedupeRegistry.get(dedupeKey);
     if (dedupeHit && nowMs - dedupeHit.createdAtMs <= resolved.dedupeWindowMs) {
-      const existing = statusRegistry.get(dedupeHit.exportId);
-      const existingResult = resultRegistry.get(dedupeHit.exportId);
-      if (existing && existingResult) {
+      const existing = statusRegistry.get(dedupeHit.exportId)?.value;
+      const existingResult = resultRegistry.get(dedupeHit.exportId)?.value;
+      if (existing !== undefined && existingResult !== undefined) {
         resolved.recordMetric("presentation.export.deduped", { format: input.format });
         resolved.recordLog("presentation_export_deduped", {
           tenantId: actor.tenantId,
@@ -267,6 +445,8 @@ export async function triggerPresentationExport(
           message: "Duplicate export suppressed. Existing job is still active.",
         });
       }
+
+      dedupeRegistry.delete(dedupeKey);
     }
 
     enforceThrottle(
@@ -275,6 +455,8 @@ export async function triggerPresentationExport(
       nowMs,
       resolved.throttleWindowMs,
       userWindowRegistry,
+      resolved.maxThrottleKeys,
+      resolved.maxThrottleWindowEntriesPerKey,
     );
     enforceThrottle(
       `${actor.tenantId}:${input.deckId}`,
@@ -282,6 +464,8 @@ export async function triggerPresentationExport(
       nowMs,
       resolved.throttleWindowMs,
       deckWindowRegistry,
+      resolved.maxThrottleKeys,
+      resolved.maxThrottleWindowEntriesPerKey,
     );
 
     const detail = await resolved.getDeckDetail(input.deckId, actor);
@@ -304,9 +488,12 @@ export async function triggerPresentationExport(
       message: "Export queued",
     });
     statusRegistry.set(exportId, {
-      ...status,
-      tenantId: actor.tenantId,
-      userId: actor.userId,
+      createdAtMs: nowMs,
+      value: {
+        ...status,
+        tenantId: actor.tenantId,
+        userId: actor.userId,
+      },
     });
     dedupeRegistry.set(dedupeKey, {
       exportId,
@@ -335,7 +522,21 @@ export async function triggerPresentationExport(
       message: "Export queued",
       renderSpec,
     });
-    resultRegistry.set(exportId, result);
+    resultRegistry.set(exportId, {
+      createdAtMs: nowMs,
+      value: result,
+    });
+    compactExportState(nowMs, {
+      dedupeWindowMs: resolved.dedupeWindowMs,
+      statusTtlMs: resolved.statusTtlMs,
+      resultTtlMs: resolved.resultTtlMs,
+      throttleWindowMs: resolved.throttleWindowMs,
+      maxDedupeEntries: resolved.maxDedupeEntries,
+      maxStatusEntries: resolved.maxStatusEntries,
+      maxResultEntries: resolved.maxResultEntries,
+      maxThrottleKeys: resolved.maxThrottleKeys,
+      maxThrottleWindowEntriesPerKey: resolved.maxThrottleWindowEntriesPerKey,
+    });
     return result;
   } catch (error) {
     if (error instanceof PresentationServiceError) {
@@ -357,7 +558,10 @@ export function getPresentationExportStatus(
   exportId: string,
   actor?: PresentationActor,
 ): PresentationExportStatusResult {
-  const status = statusRegistry.get(exportId);
+  const defaults = getDefaultStateOptions(Date.now());
+  compactExportState(defaults.nowMs, defaults);
+
+  const status = statusRegistry.get(exportId)?.value;
   if (!status) {
     throw new PresentationServiceError(
       PRESENTATION_ERROR_CODE.NOT_FOUND,
diff --git a/apps/web/server/services/presentationService.test.ts b/apps/web/server/services/presentationService.test.ts
index 63ac037..59f58b8 100644
--- a/apps/web/server/services/presentationService.test.ts
+++ b/apps/web/server/services/presentationService.test.ts
@@ -148,6 +148,95 @@ describe("presentationService", () => {
     });
   });
 
+  it("rejects add-slide when slideContent contains unsupported element schema", async () => {
+    persistenceMocks.getPresentationDeckById.mockResolvedValue({
+      id: 101,
+      tenantId: actor.tenantId,
+      libraryItemId: 44,
+      title: "Deck",
+      description: null,
+      version: 1,
+      slideCount: 1,
+      totalAssetBytes: 0,
+      createdAt: new Date(),
+      updatedAt: new Date(),
+    });
+    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());
+
+    await expect(
+      addSlideToDeck(
+        {
+          deckId: 101,
+          expectedVersion: 1,
+          title: "Bad slide",
+          slideContent: {
+            elements: [
+              {
+                id: "el-1",
+                type: "video",
+                x: 10,
+                y: 10,
+                width: 100,
+                height: 100,
+              },
+            ],
+          },
+        },
+        actor,
+      ),
+    ).rejects.toSatisfy((error: unknown) => {
+      if (!(error instanceof PresentationServiceError)) return false;
+      return error.code === PRESENTATION_ERROR_CODE.VALIDATION_FAILED;
+    });
+  });
+
+  it("rejects add-slide when slideContent payload is oversized", async () => {
+    persistenceMocks.getPresentationDeckById.mockResolvedValue({
+      id: 101,
+      tenantId: actor.tenantId,
+      libraryItemId: 44,
+      title: "Deck",
+      description: null,
+      version: 1,
+      slideCount: 1,
+      totalAssetBytes: 0,
+      createdAt: new Date(),
+      updatedAt: new Date(),
+    });
+    libraryServiceMocks.getLibraryItemById.mockResolvedValue(buildPresentationLibraryItem());
+
+    const largeValidElements = Array.from({ length: 40 }).map((_, index) => ({
+      id: `txt-${index}`,
+      type: "text" as const,
+      x: index,
+      y: index,
+      width: 300,
+      height: 80,
+      text: "x".repeat(9_000),
+      color: "#111827",
+    }));
+
+    await expect(
+      addSlideToDeck(
+        {
+          deckId: 101,
+          expectedVersion: 1,
+          title: "Huge slide",
+          slideContent: {
+            elements: largeValidElements,
+          },
+        },
+        actor,
+      ),
+    ).rejects.toSatisfy((error: unknown) => {
+      if (!(error instanceof PresentationServiceError)) return false;
+      return (
+        error.code === PRESENTATION_ERROR_CODE.VALIDATION_FAILED
+        && error.message.includes("exceeds max bytes")
+      );
+    });
+  });
+
   it("rejects attach asset when referenced item is not readable in tenant scope", async () => {
     persistenceMocks.getPresentationDeckById.mockResolvedValue({
       id: 101,
diff --git a/apps/web/server/services/presentationService.ts b/apps/web/server/services/presentationService.ts
index fd478f7..c88f234 100644
--- a/apps/web/server/services/presentationService.ts
+++ b/apps/web/server/services/presentationService.ts
@@ -30,7 +30,11 @@ import {
   PRESENTATION_ITEM_TYPE,
   PRESENTATION_LIMITS,
 } from "@shared/presentation/constants";
-import { presentationVersionConflictSchema, type PresentationVersionConflict } from "@shared/presentation/contracts";
+import {
+  presentationSlideContentSchema,
+  presentationVersionConflictSchema,
+  type PresentationVersionConflict,
+} from "@shared/presentation/contracts";
 import {
   recordPresentationFailureMetric,
   recordPresentationLog,
@@ -281,6 +285,41 @@ function ensureExpectedDeckVersion(deck: PresentationDeck, expectedVersion: numb
   throwDeckVersionConflict(deck, expectedVersion);
 }
 
+function computeSlideContentBytes(slideContent: unknown): number {
+  try {
+    return Buffer.byteLength(JSON.stringify(slideContent), "utf8");
+  } catch {
+    return Number.POSITIVE_INFINITY;
+  }
+}
+
+function validateSlideContentPayload(slideContent: Record<string, unknown>): Record<string, unknown> {
+  const parsed = presentationSlideContentSchema.safeParse(slideContent);
+  if (!parsed.success) {
+    throw new PresentationServiceError(
+      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
+      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: slideContent failed schema validation`,
+      {
+        issueCount: parsed.error.issues.length,
+      },
+    );
+  }
+
+  const byteSize = computeSlideContentBytes(parsed.data);
+  if (byteSize > PRESENTATION_LIMITS.maxSlideContentBytes) {
+    throw new PresentationServiceError(
+      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
+      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: slideContent exceeds max bytes (${PRESENTATION_LIMITS.maxSlideContentBytes})`,
+      {
+        maxSlideContentBytes: PRESENTATION_LIMITS.maxSlideContentBytes,
+        byteSize,
+      },
+    );
+  }
+
+  return parsed.data;
+}
+
 async function resolveDb(dbClient?: DbClient): Promise<DbClient> {
   if (dbClient) {
     return dbClient;
@@ -509,11 +548,16 @@ export async function addSlideToDeck(
     );
   }
 
+  const validatedSlideContent =
+    input.slideContent === undefined
+      ? undefined
+      : validateSlideContentPayload(input.slideContent);
+
   return createPresentationSlide(
     {
       deckId: input.deckId,
       title: input.title,
-      slideContent: input.slideContent,
+      slideContent: validatedSlideContent,
       notes: input.notes,
     },
     db,
@@ -572,6 +616,10 @@ export async function updateSlideInDeck(
   dbClient?: DbClient,
 ): Promise<PresentationSlide> {
   const { deck, db } = await resolveDeckContext(input.deckId, actor, { write: true }, dbClient);
+  const validatedSlideContent =
+    input.slideContent === undefined
+      ? undefined
+      : validateSlideContentPayload(input.slideContent);
   const currentSlide = await getSlideById(input.slideId, input.deckId, db);
   if (!currentSlide) {
     throw new PresentationServiceError(
@@ -592,7 +640,7 @@ export async function updateSlideInDeck(
     updates.title = input.title;
   }
   if (input.slideContent !== undefined) {
-    updates.slideContent = input.slideContent;
+    updates.slideContent = validatedSlideContent;
   }
   if (input.notes !== undefined) {
     updates.notes = input.notes;
diff --git a/apps/web/server/services/presentationWorkflowRegression.test.ts b/apps/web/server/services/presentationWorkflowRegression.test.ts
index 5715c44..7ddea2b 100644
--- a/apps/web/server/services/presentationWorkflowRegression.test.ts
+++ b/apps/web/server/services/presentationWorkflowRegression.test.ts
@@ -47,6 +47,7 @@ describe("presentation workflow regression", () => {
 
   it("supports read-only open -> convert -> edit -> export -> reopen", async () => {
     const deps = {
+      useInMemoryStateFallback: true,
       getLibraryItemById: vi.fn().mockResolvedValue(buildSourceItem()),
       createLibraryItem: vi.fn().mockResolvedValue({
         item: { id: 901 },
@@ -118,7 +119,7 @@ describe("presentation workflow regression", () => {
           assets: [],
         }),
         enqueueExportJob: vi.fn().mockResolvedValue({ jobId: "job-workflow-1" }),
-        now: () => 50_000,
+        now: () => Date.parse("2026-02-22T11:00:50.000Z"),
       },
     );
 
diff --git a/apps/web/shared/presentation/constants.ts b/apps/web/shared/presentation/constants.ts
index 9775ca7..1f3ce18 100644
--- a/apps/web/shared/presentation/constants.ts
+++ b/apps/web/shared/presentation/constants.ts
@@ -7,6 +7,8 @@ export const PRESENTATION_LIMITS = {
   maxAssetsPerDeck: 500,
   softDeckSizeBytes: 75 * 1024 * 1024,
   hardDeckSizeBytes: 100 * 1024 * 1024,
+  maxElementsPerSlide: 250,
+  maxSlideContentBytes: 256 * 1024,
 } as const;
 
 export const PRESENTATION_ERROR_CODE_VALUES = [
diff --git a/apps/web/shared/presentation/contracts.ts b/apps/web/shared/presentation/contracts.ts
index 13f1356..427776c 100644
--- a/apps/web/shared/presentation/contracts.ts
+++ b/apps/web/shared/presentation/contracts.ts
@@ -7,6 +7,7 @@ import {
   PRESENTATION_ERROR_CODE_VALUES,
   PRESENTATION_EXPORT_SCHEMA_VERSION,
   PRESENTATION_ITEM_TYPE,
+  PRESENTATION_LIMITS,
   PRESENTATION_RENDER_SCHEMA_VERSION,
   PRESENTATION_SLIDESHOW_SCHEMA_VERSION,
 } from "./constants";
@@ -145,6 +146,70 @@ export const presentationTransitionSchema = z.enum([
   "fade",
 ]);
 
+const presentationElementCoordinateSchema = z.number().finite().min(-100_000).max(100_000);
+const presentationElementSizeSchema = z.number().finite().min(0).max(100_000);
+const presentationElementOpacitySchema = z.number().finite().min(0).max(1);
+
+export const presentationTextElementSchema = z.object({
+  id: z.string().min(1).max(128),
+  type: z.literal("text"),
+  x: presentationElementCoordinateSchema,
+  y: presentationElementCoordinateSchema,
+  width: presentationElementSizeSchema,
+  height: presentationElementSizeSchema,
+  opacity: presentationElementOpacitySchema.optional(),
+  text: z.string().max(10_000),
+  color: z.string().min(1).max(64),
+}).strict();
+
+export const presentationImageElementSchema = z.object({
+  id: z.string().min(1).max(128),
+  type: z.literal("image"),
+  x: presentationElementCoordinateSchema,
+  y: presentationElementCoordinateSchema,
+  width: presentationElementSizeSchema,
+  height: presentationElementSizeSchema,
+  opacity: presentationElementOpacitySchema.optional(),
+  src: z.string().max(4_096),
+  alt: z.string().max(512),
+}).strict();
+
+export const presentationRectElementSchema = z.object({
+  id: z.string().min(1).max(128),
+  type: z.literal("rect"),
+  x: presentationElementCoordinateSchema,
+  y: presentationElementCoordinateSchema,
+  width: presentationElementSizeSchema,
+  height: presentationElementSizeSchema,
+  opacity: presentationElementOpacitySchema.optional(),
+  fill: z.string().min(1).max(64),
+}).strict();
+
+export const presentationLineElementSchema = z.object({
+  id: z.string().min(1).max(128),
+  type: z.literal("line"),
+  x: presentationElementCoordinateSchema,
+  y: presentationElementCoordinateSchema,
+  width: presentationElementSizeSchema,
+  height: presentationElementSizeSchema,
+  opacity: presentationElementOpacitySchema.optional(),
+  stroke: z.string().min(1).max(64),
+  strokeWidth: z.number().finite().min(0).max(1_000),
+}).strict();
+
+export const presentationSlideElementSchema = z.discriminatedUnion("type", [
+  presentationTextElementSchema,
+  presentationImageElementSchema,
+  presentationRectElementSchema,
+  presentationLineElementSchema,
+]);
+
+export const presentationSlideContentSchema = z.object({
+  elements: z.array(presentationSlideElementSchema).max(PRESENTATION_LIMITS.maxElementsPerSlide),
+  transition: presentationTransitionSchema.optional(),
+  durationMs: z.number().finite().min(250).max(120_000).optional(),
+}).strict();
+
 export const presentationSlideshowSlideSchema = z.object({
   slideId: z.number().int().positive(),
   orderIndex: z.number().int().nonnegative(),
@@ -211,6 +276,8 @@ export type PresentationConversionResult = z.infer<typeof presentationConversion
 export type PresentationSlideshowPayload = z.infer<typeof presentationSlideshowPayloadSchema>;
 export type PresentationRenderSpec = z.infer<typeof presentationRenderSpecSchema>;
 export type PresentationTransition = z.infer<typeof presentationTransitionSchema>;
+export type PresentationSlideElement = z.infer<typeof presentationSlideElementSchema>;
+export type PresentationSlideContent = z.infer<typeof presentationSlideContentSchema>;
 export type PresentationExportResult = z.infer<typeof presentationExportResultSchema>;
 export type PresentationExportStatusResult = z.infer<typeof presentationExportStatusResultSchema>;
 
diff --git a/python-backend/app/orchestrator/node_executors/rag_executor.py b/python-backend/app/orchestrator/node_executors/rag_executor.py
index 9181a9e..c75eaa0 100644
--- a/python-backend/app/orchestrator/node_executors/rag_executor.py
+++ b/python-backend/app/orchestrator/node_executors/rag_executor.py
@@ -1,24 +1,270 @@
-"""RAG Query node executor."""
+"""RAG Query node executor.
+
+Replaces the stub with a full implementation that wires together all RAG
+components (sections 01-06) into the production execution path.
+"""
+
+from __future__ import annotations
+
+import time
+from typing import Any
+
+import structlog
+from sqlalchemy import select
+
+from app.core.database import get_db_context
+from app.models.library import LibraryChunk, LibraryItem
+from app.models.tenant import Tenant
 from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
+from app.orchestrator.rag.guardrails import (
+    RetrievalGuardrails,
+    RetrievalQuality,
+)
+from app.orchestrator.rag.hybrid_rag import (
+    HybridRAGEngine,
+    RAGConfig,
+    RAGResult,
+    SearchMode,
+)
+
+logger = structlog.get_logger()
+
+
+def _failed_response(
+    error: str = "",
+    failure_mode: str = "permissive",
+) -> dict[str, Any]:
+    """Build a standardised error/empty response."""
+    return {
+        "documents": [],
+        "context": "No relevant information was found to answer this query.",
+        "quality": {
+            "quality": "failed",
+            "confidence_score": 0.0,
+            "top_score": 0.0,
+            "avg_score": 0.0,
+            "doc_count": 0,
+            "recommended_action": "refuse_answer",
+            "explanation": "No documents passed the quality threshold.",
+        },
+        "metadata": {
+            "total_results": 0,
+            "search_mode": "hybrid",
+            "failure_mode": failure_mode,
+            **({"error": error} if error else {}),
+        },
+    }
 
 
 class RAGExecutor:
-    """Executor for RAG Query nodes."""
+    """Executor for RAG Query nodes.
+
+    Implements the 9-step execution flow:
+    1. Extract inputs and config
+    2. Open AsyncSession and query chunks from PostgreSQL
+    3. Query tenant settings for rag_failure_mode
+    4. Instantiate HybridRAGEngine
+    5. Load chunks into the engine
+    6. Retrieve with scope filters
+    7. Apply guardrails and quality assessment
+    8. Build response
+    9. Clean up
+    """
 
     async def execute(
         self,
         data: NodeExecutionData,
         context: ExecutionContext,
-    ) -> dict:
-        """Execute RAG query."""
-        # TODO: Integrate with HybridRAG service
+    ) -> dict[str, Any]:
+        """Execute RAG query against the full pipeline."""
+
+        # --- Step 1: Extract inputs and config ---
         query = data.inputs.get("query", "")
+        top_k = data.config.get("top_k", 5)
+        mode_str = data.config.get("mode", "hybrid")
+        try:
+            mode = SearchMode(mode_str)
+        except ValueError:
+            mode = SearchMode.HYBRID
+
+        effective_scopes: list[str] = context.extra_data.get(
+            "effective_scopes",
+            [f"u:{context.user_id}", "p:global"],
+        )
+
+        # Validate tenant_id
+        if context.tenant_id is None:
+            logger.warning("rag_executor_no_tenant_id", user_id=context.user_id)
+            return _failed_response(error="tenant_id is required")
+
+        tenant_id = context.tenant_id
+        engine: HybridRAGEngine | None = None
+
+        try:
+            async with get_db_context() as session:
+                # --- Step 2: Query chunks from PostgreSQL ---
+                chunk_stmt = (
+                    select(LibraryChunk)
+                    .where(LibraryChunk.tenant_id == tenant_id)
+                    .where(LibraryChunk.is_parent.is_(False))
+                )
+                # Optionally filter by library_item_id
+                library_item_id = data.config.get("library_item_id")
+                if library_item_id is not None:
+                    chunk_stmt = chunk_stmt.where(
+                        LibraryChunk.library_item_id == library_item_id,
+                    )
+
+                chunk_rows = (await session.execute(chunk_stmt)).scalars().all()
+
+                if not chunk_rows:
+                    logger.info(
+                        "rag_executor_no_chunks",
+                        tenant_id=tenant_id,
+                    )
+                    return _failed_response(failure_mode="permissive")
+
+                # Build item_id → LibraryItem map for titles
+                item_ids = list({c.library_item_id for c in chunk_rows})
+                item_stmt = select(LibraryItem).where(LibraryItem.id.in_(item_ids))
+                item_rows = (await session.execute(item_stmt)).scalars().all()
+                item_map: dict[int, LibraryItem] = {i.id: i for i in item_rows}
+
+                # --- Step 3: Query tenant settings ---
+                tenant_stmt = select(Tenant).where(Tenant.id == tenant_id)
+                tenant_row = (await session.execute(tenant_stmt)).scalar_one_or_none()
+
+                if tenant_row and tenant_row.settings:
+                    failure_mode = tenant_row.settings.get(
+                        "rag_failure_mode", "permissive",
+                    )
+                else:
+                    failure_mode = "permissive"
+
+                # --- Step 4: Instantiate engine (request-scoped) ---
+                config = RAGConfig(mode=mode, top_k=top_k)
+                engine = HybridRAGEngine(config=config)
+
+                # --- Step 5: Load chunks into engine ---
+                for chunk in chunk_rows:
+                    parent_item = item_map.get(chunk.library_item_id)
+                    section_heading = ""
+                    if chunk.metadata_json:
+                        section_heading = chunk.metadata_json.get(
+                            "section_heading", "",
+                        )
+
+                    await engine.add_document(
+                        content=chunk.content,
+                        metadata={
+                            "chunk_id": str(chunk.id),
+                            "parent_doc_id": str(chunk.library_item_id),
+                            "parent_doc_title": parent_item.title if parent_item else "",
+                            "section_heading": section_heading,
+                            "allowed_scopes": chunk.allowed_scopes or [],
+                            "tenant_id": chunk.tenant_id,
+                        },
+                        source_type=parent_item.item_type if parent_item else "document",
+                        source_id=str(chunk.library_item_id),
+                        doc_id=chunk.vector_ref_id or str(chunk.id),
+                    )
+
+                # --- Step 6: Retrieve with scope filters ---
+                rag_result: RAGResult = await engine.retrieve(
+                    query=query,
+                    top_k=top_k,
+                    mode=mode,
+                    filters={
+                        "tenant_id": tenant_id,
+                        "allowed_scopes": effective_scopes,
+                    },
+                    user_id=context.user_id,
+                    tenant_id=tenant_id,
+                    effective_scopes=effective_scopes,
+                )
+
+            # --- Step 7: Apply guardrails ---
+            guardrails = RetrievalGuardrails(failure_mode=failure_mode)
+            assessment = guardrails.assess(rag_result)
+
+            # --- Step 8: Build response ---
+            # Check failure-mode gating
+            if assessment.recommended_action == "refuse_answer":
+                return {
+                    "documents": [],
+                    "context": "No relevant information was found to answer this query.",
+                    "quality": {
+                        "quality": assessment.quality.value,
+                        "confidence_score": assessment.confidence_score,
+                        "top_score": assessment.top_score,
+                        "avg_score": assessment.avg_score,
+                        "doc_count": assessment.doc_count,
+                        "recommended_action": assessment.recommended_action,
+                        "explanation": assessment.explanation,
+                    },
+                    "metadata": {
+                        "total_results": 0,
+                        "search_mode": mode.value,
+                        "failure_mode": failure_mode,
+                        "retrieval_time_ms": rag_result.retrieval_time_ms,
+                        "total_time_ms": rag_result.total_time_ms,
+                    },
+                }
+
+            # Build document list with citations
+            context_str, citations = rag_result.get_context_with_citations()
+
+            doc_list = []
+            for doc in rag_result.documents:
+                doc_list.append({
+                    "text": doc.content,
+                    "score": doc.final_score,
+                    "chunk_id": doc.chunk_id or doc.metadata.get("chunk_id"),
+                    "parent_doc_title": (
+                        doc.parent_doc_title
+                        or doc.metadata.get("parent_doc_title", "")
+                    ),
+                    "section_heading": (
+                        doc.section_heading
+                        or doc.metadata.get("section_heading", "")
+                    ),
+                    "citation_ref": doc.citation_ref(),
+                })
+
+            return {
+                "documents": doc_list,
+                "context": context_str,
+                "quality": {
+                    "quality": assessment.quality.value,
+                    "confidence_score": assessment.confidence_score,
+                    "top_score": assessment.top_score,
+                    "avg_score": assessment.avg_score,
+                    "doc_count": assessment.doc_count,
+                    "recommended_action": assessment.recommended_action,
+                    "explanation": assessment.explanation,
+                },
+                "metadata": {
+                    "total_results": rag_result.final_count,
+                    "search_mode": mode.value,
+                    "retrieval_time_ms": rag_result.retrieval_time_ms,
+                    "rerank_time_ms": rag_result.rerank_time_ms,
+                    "total_time_ms": rag_result.total_time_ms,
+                    "bm25_candidates": rag_result.bm25_candidates,
+                    "vector_candidates": rag_result.vector_candidates,
+                },
+            }
+
+        except Exception as exc:
+            logger.error(
+                "rag_executor_error",
+                tenant_id=tenant_id,
+                error=str(exc),
+            )
+            return _failed_response(
+                error=str(exc),
+                failure_mode="permissive",
+            )
 
-        return {
-            "documents": [
-                {"text": "Document 1 content", "score": 0.95},
-                {"text": "Document 2 content", "score": 0.88},
-            ],
-            "context": "Document 1 content\n\nDocument 2 content",
-            "metadata": {"total_results": 2, "search_mode": "hybrid"},
-        }
+        finally:
+            if engine is not None:
+                await engine.cleanup()
diff --git a/python-backend/app/orchestrator/rag/scope_engine.py b/python-backend/app/orchestrator/rag/scope_engine.py
index 2cf6f22..1949e91 100644
--- a/python-backend/app/orchestrator/rag/scope_engine.py
+++ b/python-backend/app/orchestrator/rag/scope_engine.py
@@ -156,7 +156,6 @@ async def recompute_allowed_scopes(
         prefix = {
             "user": _USER,
             "group": _GROUP,
-            "tenant": _TENANT,
             "tenant_role": _TENANT,
         }.get(perm.subject_type)
 
diff --git a/python-backend/coverage.xml b/python-backend/coverage.xml
index 5a70a46..e3ea47d 100644
--- a/python-backend/coverage.xml
+++ b/python-backend/coverage.xml
@@ -1,5 +1,5 @@
 <?xml version="1.0" ?>
-<coverage version="7.13.2" timestamp="1771232367545" lines-valid="38501" lines-covered="8613" line-rate="0.2237" branches-valid="10064" branches-covered="110" branch-rate="0.01093" complexity="0">
+<coverage version="7.13.2" timestamp="1771744773477" lines-valid="43563" lines-covered="9695" line-rate="0.2226" branches-valid="11656" branches-covered="373" branch-rate="0.032" complexity="0">
 	<!-- Generated by coverage.py: https://coverage.readthedocs.io/en/7.13.2 -->
 	<!-- Based on https://raw.githubusercontent.com/cobertura/web/master/htdocs/xml/coverage-04.dtd -->
 	<sources>
@@ -16,7 +16,7 @@
 				</class>
 			</classes>
 		</package>
-		<package name="api" line-rate="0.3958" branch-rate="0.001466" complexity="0">
+		<package name="api" line-rate="0.3753" branch-rate="0.001202" complexity="0">
 			<classes>
 				<class name="admin_alerts.py" filename="api/admin_alerts.py" complexity="0" line-rate="0.1694" branch-rate="0">
 					<methods/>
@@ -309,7 +309,7 @@
 						<line number="431" hits="0"/>
 					</lines>
 				</class>
-				<class name="approvals.py" filename="api/approvals.py" complexity="0" line-rate="0.6649" branch-rate="0">
+				<class name="approvals.py" filename="api/approvals.py" complexity="0" line-rate="0.4767" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="6" hits="1"/>
@@ -317,45 +317,44 @@
 						<line number="8" hits="1"/>
 						<line number="9" hits="1"/>
 						<line number="10" hits="1"/>
-						<line number="12" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="13" hits="1"/>
 						<line number="14" hits="1"/>
-						<line number="15" hits="1"/>
 						<line number="16" hits="1"/>
 						<line number="17" hits="1"/>
 						<line number="18" hits="1"/>
+						<line number="19" hits="1"/>
 						<line number="20" hits="1"/>
-						<line number="27" hits="1"/>
-						<line number="29" hits="0"/>
-						<line number="30" hits="0"/>
-						<line number="37" hits="1"/>
-						<line number="38" hits="1"/>
-						<line number="39" hits="1"/>
-						<line number="40" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="31" hits="1"/>
+						<line number="33" hits="0"/>
+						<line number="34" hits="0"/>
 						<line number="41" hits="1"/>
 						<line number="42" hits="1"/>
+						<line number="43" hits="1"/>
+						<line number="44" hits="1"/>
 						<line number="45" hits="1"/>
 						<line number="46" hits="1"/>
-						<line number="47" hits="1"/>
+						<line number="49" hits="1"/>
 						<line number="50" hits="1"/>
 						<line number="51" hits="1"/>
-						<line number="52" hits="1"/>
-						<line number="53" hits="1"/>
 						<line number="54" hits="1"/>
-						<line number="61" hits="1"/>
-						<line number="63" hits="1"/>
-						<line number="64" hits="1"/>
+						<line number="55" hits="1"/>
+						<line number="56" hits="1"/>
+						<line number="57" hits="1"/>
+						<line number="58" hits="1"/>
 						<line number="65" hits="1"/>
-						<line number="66" hits="1"/>
 						<line number="67" hits="1"/>
 						<line number="68" hits="1"/>
 						<line number="69" hits="1"/>
 						<line number="70" hits="1"/>
 						<line number="71" hits="1"/>
+						<line number="72" hits="1"/>
+						<line number="73" hits="1"/>
 						<line number="74" hits="1"/>
-						<line number="76" hits="1"/>
-						<line number="77" hits="1"/>
+						<line number="75" hits="1"/>
 						<line number="78" hits="1"/>
-						<line number="79" hits="1"/>
 						<line number="80" hits="1"/>
 						<line number="81" hits="1"/>
 						<line number="82" hits="1"/>
@@ -369,36 +368,36 @@
 						<line number="90" hits="1"/>
 						<line number="91" hits="1"/>
 						<line number="92" hits="1"/>
+						<line number="93" hits="1"/>
 						<line number="94" hits="1"/>
 						<line number="95" hits="1"/>
+						<line number="96" hits="1"/>
 						<line number="98" hits="1"/>
-						<line number="100" hits="1"/>
-						<line number="101" hits="1"/>
+						<line number="99" hits="1"/>
+						<line number="102" hits="1"/>
 						<line number="104" hits="1"/>
-						<line number="106" hits="1"/>
-						<line number="107" hits="1"/>
+						<line number="105" hits="1"/>
 						<line number="108" hits="1"/>
-						<line number="109" hits="1"/>
 						<line number="110" hits="1"/>
 						<line number="111" hits="1"/>
+						<line number="112" hits="1"/>
 						<line number="113" hits="1"/>
 						<line number="114" hits="1"/>
+						<line number="115" hits="1"/>
 						<line number="117" hits="1"/>
-						<line number="119" hits="1"/>
-						<line number="120" hits="1"/>
+						<line number="118" hits="1"/>
 						<line number="121" hits="1"/>
-						<line number="122" hits="1"/>
 						<line number="123" hits="1"/>
 						<line number="124" hits="1"/>
 						<line number="125" hits="1"/>
 						<line number="126" hits="1"/>
 						<line number="127" hits="1"/>
 						<line number="128" hits="1"/>
+						<line number="129" hits="1"/>
+						<line number="130" hits="1"/>
 						<line number="131" hits="1"/>
-						<line number="133" hits="1"/>
-						<line number="134" hits="1"/>
+						<line number="132" hits="1"/>
 						<line number="135" hits="1"/>
-						<line number="136" hits="1"/>
 						<line number="137" hits="1"/>
 						<line number="138" hits="1"/>
 						<line number="139" hits="1"/>
@@ -410,102 +409,188 @@
 						<line number="145" hits="1"/>
 						<line number="146" hits="1"/>
 						<line number="147" hits="1"/>
+						<line number="148" hits="1"/>
 						<line number="149" hits="1"/>
 						<line number="150" hits="1"/>
+						<line number="151" hits="1"/>
 						<line number="153" hits="1"/>
-						<line number="155" hits="1"/>
-						<line number="156" hits="1"/>
+						<line number="154" hits="1"/>
 						<line number="157" hits="1"/>
-						<line number="158" hits="1"/>
-						<line number="165" hits="1"/>
-						<line number="166" hits="1"/>
-						<line number="177" hits="0"/>
-						<line number="179" hits="0"/>
-						<line number="194" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="195,200"/>
+						<line number="159" hits="1"/>
+						<line number="160" hits="1"/>
+						<line number="161" hits="1"/>
+						<line number="162" hits="1"/>
+						<line number="170" hits="1"/>
+						<line number="185" hits="0"/>
+						<line number="186" hits="0"/>
+						<line number="188" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="189,195"/>
+						<line number="189" hits="0"/>
+						<line number="193" hits="0"/>
 						<line number="195" hits="0"/>
-						<line number="200" hits="0"/>
-						<line number="203" hits="1"/>
-						<line number="204" hits="1"/>
+						<line number="198" hits="0"/>
+						<line number="199" hits="0"/>
+						<line number="211" hits="0"/>
+						<line number="212" hits="0"/>
+						<line number="214" hits="0"/>
+						<line number="217" hits="0"/>
 						<line number="219" hits="0"/>
-						<line number="221" hits="0"/>
+						<line number="220" hits="0"/>
+						<line number="222" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="224,267"/>
+						<line number="224" hits="0"/>
+						<line number="228" hits="0"/>
+						<line number="229" hits="0"/>
+						<line number="230" hits="0"/>
 						<line number="231" hits="0"/>
+						<line number="233" hits="0"/>
+						<line number="234" hits="0"/>
 						<line number="239" hits="0"/>
-						<line number="247" hits="1"/>
-						<line number="248" hits="1"/>
+						<line number="241" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="242,248"/>
+						<line number="242" hits="0"/>
+						<line number="246" hits="0"/>
+						<line number="248" hits="0"/>
+						<line number="253" hits="0"/>
+						<line number="255" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="256,262"/>
 						<line number="256" hits="0"/>
-						<line number="258" hits="0"/>
+						<line number="260" hits="0"/>
 						<line number="262" hits="0"/>
-						<line number="265" hits="1"/>
-						<line number="266" hits="1"/>
-						<line number="274" hits="0"/>
-						<line number="276" hits="0"/>
-						<line number="278" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="279,284"/>
+						<line number="264" hits="0"/>
+						<line number="265" hits="0"/>
+						<line number="267" hits="0"/>
+						<line number="269" hits="0"/>
+						<line number="272" hits="0"/>
 						<line number="279" hits="0"/>
+						<line number="280" hits="0"/>
+						<line number="281" hits="0"/>
+						<line number="283" hits="0"/>
 						<line number="284" hits="0"/>
-						<line number="287" hits="1"/>
-						<line number="288" hits="1"/>
+						<line number="289" hits="0"/>
+						<line number="290" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="291,295"/>
+						<line number="291" hits="0"/>
+						<line number="292" hits="0"/>
+						<line number="295" hits="0"/>
+						<line number="296" hits="0"/>
 						<line number="297" hits="0"/>
+						<line number="298" hits="0"/>
 						<line number="300" hits="0"/>
-						<line number="305" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="306,312"/>
+						<line number="303" hits="0"/>
+						<line number="304" hits="0"/>
 						<line number="306" hits="0"/>
+						<line number="307" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="308,310"/>
+						<line number="308" hits="0"/>
+						<line number="310" hits="0"/>
+						<line number="311" hits="0"/>
 						<line number="312" hits="0"/>
-						<line number="319" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="320,325"/>
-						<line number="320" hits="0"/>
-						<line number="325" hits="0"/>
-						<line number="328" hits="1"/>
-						<line number="329" hits="1"/>
-						<line number="339" hits="0"/>
-						<line number="341" hits="0"/>
-						<line number="343" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="344,349"/>
-						<line number="344" hits="0"/>
-						<line number="349" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="350,355"/>
-						<line number="350" hits="0"/>
-						<line number="355" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="356,361"/>
-						<line number="356" hits="0"/>
-						<line number="361" hits="0"/>
-						<line number="362" hits="0"/>
-						<line number="365" hits="1"/>
-						<line number="366" hits="1"/>
-						<line number="374" hits="0"/>
-						<line number="376" hits="0"/>
-						<line number="377" hits="0"/>
-						<line number="384" hits="1"/>
-						<line number="385" hits="1"/>
-						<line number="396" hits="0"/>
+						<line number="314" hits="0"/>
+						<line number="322" hits="0"/>
+						<line number="323" hits="0"/>
+						<line number="334" hits="1"/>
+						<line number="335" hits="1"/>
+						<line number="346" hits="0"/>
+						<line number="348" hits="0"/>
+						<line number="363" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="364,369"/>
+						<line number="364" hits="0"/>
+						<line number="369" hits="0"/>
+						<line number="372" hits="1"/>
+						<line number="373" hits="1"/>
+						<line number="388" hits="0"/>
+						<line number="390" hits="0"/>
 						<line number="398" hits="0"/>
-						<line number="412" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="413,418"/>
-						<line number="413" hits="0"/>
-						<line number="418" hits="0"/>
-						<line number="421" hits="1"/>
-						<line number="422" hits="1"/>
-						<line number="433" hits="0"/>
-						<line number="435" hits="0"/>
-						<line number="441" hits="0"/>
-						<line number="444" hits="1"/>
-						<line number="445" hits="1"/>
-						<line number="453" hits="0"/>
-						<line number="455" hits="0"/>
-						<line number="457" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="458,463"/>
-						<line number="458" hits="0"/>
-						<line number="463" hits="0"/>
-						<line number="466" hits="1"/>
-						<line number="467" hits="1"/>
-						<line number="476" hits="0"/>
-						<line number="478" hits="0"/>
-						<line number="483" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="484,489"/>
-						<line number="484" hits="0"/>
-						<line number="489" hits="0"/>
-						<line number="492" hits="1"/>
-						<line number="493" hits="1"/>
-						<line number="501" hits="0"/>
-						<line number="503" hits="0"/>
-						<line number="506" hits="1"/>
-						<line number="507" hits="1"/>
+						<line number="404" hits="0"/>
+						<line number="412" hits="1"/>
+						<line number="413" hits="1"/>
+						<line number="421" hits="0"/>
+						<line number="423" hits="0"/>
+						<line number="427" hits="0"/>
+						<line number="430" hits="1"/>
+						<line number="431" hits="1"/>
+						<line number="440" hits="0"/>
+						<line number="442" hits="0"/>
+						<line number="444" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="445,450"/>
+						<line number="445" hits="0"/>
+						<line number="450" hits="0"/>
+						<line number="453" hits="1"/>
+						<line number="454" hits="1"/>
+						<line number="470" hits="0"/>
+						<line number="473" hits="0"/>
+						<line number="474" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="475,481"/>
+						<line number="475" hits="0"/>
+						<line number="481" hits="0"/>
+						<line number="486" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="487,493"/>
+						<line number="487" hits="0"/>
+						<line number="493" hits="0"/>
+						<line number="494" hits="0"/>
+						<line number="500" hits="0"/>
+						<line number="502" hits="0"/>
+						<line number="507" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="508,515"/>
+						<line number="508" hits="0"/>
+						<line number="515" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="516,525"/>
 						<line number="516" hits="0"/>
-						<line number="518" hits="0"/>
-						<line number="520" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="521,526"/>
-						<line number="521" hits="0"/>
-						<line number="526" hits="0"/>
+						<line number="525" hits="0"/>
+						<line number="528" hits="1"/>
+						<line number="529" hits="1"/>
+						<line number="540" hits="0"/>
+						<line number="542" hits="0"/>
+						<line number="544" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="545,550"/>
+						<line number="545" hits="0"/>
+						<line number="550" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="551,556"/>
+						<line number="551" hits="0"/>
+						<line number="556" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="557,562"/>
+						<line number="557" hits="0"/>
+						<line number="562" hits="0"/>
+						<line number="563" hits="0"/>
+						<line number="566" hits="1"/>
+						<line number="567" hits="1"/>
+						<line number="576" hits="0"/>
+						<line number="579" hits="0"/>
+						<line number="580" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="581,586"/>
+						<line number="581" hits="0"/>
+						<line number="586" hits="0"/>
+						<line number="587" hits="0"/>
+						<line number="594" hits="1"/>
+						<line number="595" hits="1"/>
+						<line number="607" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="608,613"/>
+						<line number="608" hits="0"/>
+						<line number="613" hits="0"/>
+						<line number="615" hits="0"/>
+						<line number="629" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="630,635"/>
+						<line number="630" hits="0"/>
+						<line number="635" hits="0"/>
+						<line number="638" hits="1"/>
+						<line number="639" hits="1"/>
+						<line number="650" hits="0"/>
+						<line number="652" hits="0"/>
+						<line number="658" hits="0"/>
+						<line number="661" hits="1"/>
+						<line number="662" hits="1"/>
+						<line number="670" hits="0"/>
+						<line number="672" hits="0"/>
+						<line number="674" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="675,680"/>
+						<line number="675" hits="0"/>
+						<line number="680" hits="0"/>
+						<line number="683" hits="1"/>
+						<line number="684" hits="1"/>
+						<line number="695" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="696,701"/>
+						<line number="696" hits="0"/>
+						<line number="701" hits="0"/>
+						<line number="703" hits="0"/>
+						<line number="708" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="709,714"/>
+						<line number="709" hits="0"/>
+						<line number="714" hits="0"/>
+						<line number="717" hits="1"/>
+						<line number="718" hits="1"/>
+						<line number="728" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="729,734"/>
+						<line number="729" hits="0"/>
+						<line number="734" hits="0"/>
+						<line number="736" hits="0"/>
+						<line number="739" hits="1"/>
+						<line number="740" hits="1"/>
+						<line number="751" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="752,757"/>
+						<line number="752" hits="0"/>
+						<line number="757" hits="0"/>
+						<line number="759" hits="0"/>
+						<line number="761" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="762,767"/>
+						<line number="762" hits="0"/>
+						<line number="767" hits="0"/>
 					</lines>
 				</class>
 				<class name="artifacts.py" filename="api/artifacts.py" complexity="0" line-rate="0.4112" branch-rate="0.04167">
@@ -1145,73 +1230,333 @@
 						<line number="463" hits="0"/>
 					</lines>
 				</class>
-				<class name="internal_mcp.py" filename="api/internal_mcp.py" complexity="0" line-rate="0.375" branch-rate="0">
+				<class name="internal_library.py" filename="api/internal_library.py" complexity="0" line-rate="0.6111" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="8" hits="1"/>
-						<line number="9" hits="1"/>
 						<line number="10" hits="1"/>
-						<line number="12" hits="1"/>
+						<line number="11" hits="1"/>
 						<line number="13" hits="1"/>
+						<line number="14" hits="1"/>
 						<line number="15" hits="1"/>
 						<line number="16" hits="1"/>
 						<line number="18" hits="1"/>
+						<line number="19" hits="1"/>
 						<line number="20" hits="1"/>
-						<line number="26" hits="1"/>
-						<line number="28" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="29,30"/>
-						<line number="29" hits="0"/>
+						<line number="22" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="29" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="30,31"/>
 						<line number="30" hits="0"/>
-						<line number="31" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="32,33"/>
-						<line number="32" hits="0"/>
-						<line number="33" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,34"/>
-						<line number="34" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="33,34"/>
+						<line number="33" hits="0"/>
+						<line number="34" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,35"/>
+						<line number="35" hits="0"/>
+						<line number="38" hits="1"/>
+						<line number="39" hits="1"/>
 						<line number="40" hits="1"/>
 						<line number="41" hits="1"/>
-						<line number="42" hits="1"/>
-						<line number="43" hits="1"/>
 						<line number="44" hits="1"/>
-						<line number="47" hits="1"/>
-						<line number="48" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="46" hits="1"/>
 						<line number="49" hits="1"/>
-						<line number="50" hits="1"/>
-						<line number="56" hits="1"/>
-						<line number="57" hits="1"/>
+						<line number="54" hits="1"/>
 						<line number="66" hits="0"/>
-						<line number="68" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="69,73"/>
-						<line number="69" hits="0"/>
-						<line number="70" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="71,73"/>
-						<line number="71" hits="0"/>
-						<line number="73" hits="0"/>
-						<line number="76" hits="1"/>
-						<line number="77" hits="1"/>
-						<line number="82" hits="0"/>
-						<line number="84" hits="0"/>
-						<line number="85" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="86,91"/>
+						<line number="67" hits="0"/>
+						<line number="74" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="85" hits="0"/>
 						<line number="86" hits="0"/>
-						<line number="91" hits="0"/>
-						<line number="93" hits="0"/>
+						<line number="92" hits="0"/>
+					</lines>
+				</class>
+				<class name="internal_mcp.py" filename="api/internal_mcp.py" complexity="0" line-rate="0.3662" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="8" hits="1"/>
+						<line number="9" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="30" hits="1"/>
+						<line number="32" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="33,34"/>
+						<line number="33" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="35" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="36,37"/>
+						<line number="36" hits="0"/>
+						<line number="37" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,38"/>
+						<line number="38" hits="0"/>
+						<line number="44" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="46" hits="1"/>
+						<line number="47" hits="1"/>
+						<line number="48" hits="1"/>
+						<line number="51" hits="1"/>
+						<line number="52" hits="1"/>
+						<line number="53" hits="1"/>
+						<line number="54" hits="1"/>
+						<line number="60" hits="1"/>
+						<line number="61" hits="1"/>
+						<line number="70" hits="0"/>
+						<line number="72" hits="0"/>
+						<line number="73" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="74,81"/>
+						<line number="74" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="76" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="77,78"/>
+						<line number="77" hits="0"/>
+						<line number="78" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="79,83"/>
+						<line number="79" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="83" hits="0"/>
+						<line number="86" hits="1"/>
+						<line number="87" hits="1"/>
+						<line number="92" hits="0"/>
 						<line number="94" hits="0"/>
-						<line number="97" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="98,101"/>
-						<line number="98" hits="0"/>
-						<line number="99" hits="0"/>
+						<line number="95" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="96,101"/>
+						<line number="96" hits="0"/>
 						<line number="101" hits="0"/>
 						<line number="103" hits="0"/>
+						<line number="104" hits="0"/>
+						<line number="107" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="108,111"/>
 						<line number="108" hits="0"/>
 						<line number="109" hits="0"/>
+						<line number="111" hits="0"/>
 						<line number="113" hits="0"/>
-						<line number="114" hits="0"/>
-						<line number="115" hits="0"/>
-						<line number="124" hits="1"/>
-						<line number="126" hits="0"/>
-						<line number="127" hits="0"/>
-						<line number="128" hits="0"/>
-						<line number="129" hits="0"/>
-						<line number="131" hits="0"/>
-						<line number="132" hits="0"/>
+						<line number="118" hits="0"/>
+						<line number="119" hits="0"/>
+						<line number="123" hits="0"/>
+						<line number="124" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="134" hits="1"/>
+						<line number="136" hits="0"/>
+						<line number="137" hits="0"/>
+						<line number="138" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="141" hits="0"/>
+						<line number="142" hits="0"/>
+						<line number="151" hits="0"/>
+						<line number="152" hits="0"/>
+						<line number="153" hits="0"/>
+						<line number="154" hits="0"/>
+					</lines>
+				</class>
+				<class name="internal_onedrive.py" filename="api/internal_onedrive.py" complexity="0" line-rate="0.256" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="13" hits="1"/>
+						<line number="14" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="25" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="31" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="35" hits="1"/>
+						<line number="41" hits="1"/>
+						<line number="43" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="44,45"/>
+						<line number="44" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="47,48"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,49"/>
+						<line number="49" hits="0"/>
+						<line number="52" hits="1"/>
+						<line number="56" hits="0"/>
+						<line number="62" hits="1"/>
+						<line number="63" hits="1"/>
+						<line number="64" hits="1"/>
+						<line number="67" hits="1"/>
+						<line number="68" hits="1"/>
+						<line number="69" hits="1"/>
+						<line number="72" hits="1"/>
+						<line number="73" hits="1"/>
+						<line number="74" hits="1"/>
+						<line number="77" hits="1"/>
+						<line number="78" hits="1"/>
+						<line number="79" hits="1"/>
+						<line number="82" hits="1"/>
+						<line number="83" hits="1"/>
+						<line number="84" hits="1"/>
+						<line number="85" hits="1"/>
+						<line number="86" hits="1"/>
+						<line number="92" hits="1"/>
+						<line number="93" hits="1"/>
+						<line number="98" hits="0"/>
+						<line number="100" hits="0"/>
+						<line number="102" hits="0"/>
+						<line number="103" hits="0"/>
+						<line number="107" hits="0"/>
+						<line number="110" hits="1"/>
+						<line number="111" hits="1"/>
+						<line number="116" hits="0"/>
+						<line number="118" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="121" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="128" hits="1"/>
+						<line number="129" hits="1"/>
+						<line number="134" hits="0"/>
+						<line number="136" hits="0"/>
+						<line number="138" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="140" hits="0"/>
 						<line number="141" hits="0"/>
 						<line number="142" hits="0"/>
 						<line number="143" hits="0"/>
-						<line number="144" hits="0"/>
+						<line number="146" hits="1"/>
+						<line number="147" hits="1"/>
+						<line number="152" hits="0"/>
+						<line number="154" hits="0"/>
+						<line number="156" hits="0"/>
+						<line number="157" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="167" hits="1"/>
+						<line number="168" hits="1"/>
+						<line number="176" hits="0"/>
+						<line number="177" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="178,179"/>
+						<line number="178" hits="0"/>
+						<line number="179" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="180,182"/>
+						<line number="180" hits="0"/>
+						<line number="182" hits="0"/>
+						<line number="184" hits="0"/>
+						<line number="185" hits="0"/>
+						<line number="186" hits="0"/>
+						<line number="187" hits="0"/>
+						<line number="188" hits="0"/>
+						<line number="191" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="192,194"/>
+						<line number="192" hits="0"/>
+						<line number="194" hits="0"/>
+						<line number="196" hits="0"/>
+						<line number="203" hits="0"/>
+						<line number="204" hits="0"/>
+						<line number="211" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="212,218"/>
+						<line number="212" hits="0"/>
+						<line number="216" hits="0"/>
+						<line number="218" hits="0"/>
+						<line number="219" hits="0"/>
+						<line number="221" hits="0"/>
+						<line number="235" hits="1"/>
+						<line number="236" hits="1"/>
+						<line number="247" hits="0"/>
+						<line number="248" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="249,250"/>
+						<line number="249" hits="0"/>
+						<line number="250" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="251,256"/>
+						<line number="251" hits="0"/>
+						<line number="256" hits="0"/>
+						<line number="258" hits="0"/>
+						<line number="259" hits="0"/>
+						<line number="260" hits="0"/>
+						<line number="261" hits="0"/>
+						<line number="262" hits="0"/>
+						<line number="264" hits="0"/>
+						<line number="266" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="268,274"/>
+						<line number="268" hits="0"/>
+						<line number="269" hits="0"/>
+						<line number="270" hits="0"/>
+						<line number="274" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="276,280"/>
+						<line number="276" hits="0"/>
+						<line number="277" hits="0"/>
+						<line number="280" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="281,283"/>
+						<line number="281" hits="0"/>
+						<line number="283" hits="0"/>
+						<line number="284" hits="0"/>
+						<line number="290" hits="0"/>
+						<line number="291" hits="0"/>
+						<line number="298" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="299,305"/>
+						<line number="299" hits="0"/>
+						<line number="303" hits="0"/>
+						<line number="305" hits="0"/>
+						<line number="306" hits="0"/>
+						<line number="307" hits="0"/>
+						<line number="309" hits="0"/>
+						<line number="310" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="311,326"/>
+						<line number="311" hits="0"/>
+						<line number="312" hits="0"/>
+						<line number="313" hits="0"/>
+						<line number="315" hits="0"/>
+						<line number="326" hits="0"/>
+						<line number="335" hits="1"/>
+						<line number="336" hits="0"/>
+						<line number="337" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="338,339"/>
+						<line number="338" hits="0"/>
+						<line number="339" hits="0"/>
+						<line number="342" hits="1"/>
+						<line number="343" hits="0"/>
+						<line number="344" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="345,346"/>
+						<line number="345" hits="0"/>
+						<line number="346" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="347,348"/>
+						<line number="347" hits="0"/>
+						<line number="348" hits="0"/>
+						<line number="351" hits="1"/>
+						<line number="352" hits="1"/>
+						<line number="359" hits="0"/>
+						<line number="360" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="361,363"/>
+						<line number="361" hits="0"/>
+						<line number="363" hits="0"/>
+						<line number="364" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="365,366"/>
+						<line number="365" hits="0"/>
+						<line number="366" hits="0"/>
+						<line number="368" hits="0"/>
+						<line number="369" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="370,371"/>
+						<line number="370" hits="0"/>
+						<line number="371" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="372,376"/>
+						<line number="372" hits="0"/>
+						<line number="376" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="377,382"/>
+						<line number="377" hits="0"/>
+						<line number="382" hits="0"/>
+						<line number="384" hits="0"/>
+						<line number="385" hits="0"/>
+						<line number="386" hits="0"/>
+						<line number="387" hits="0"/>
+						<line number="388" hits="0"/>
+						<line number="391" hits="0"/>
+						<line number="392" hits="0"/>
+						<line number="394" hits="0"/>
+						<line number="395" hits="0"/>
+						<line number="402" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="403,404"/>
+						<line number="403" hits="0"/>
+						<line number="404" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="405,411"/>
+						<line number="405" hits="0"/>
+						<line number="409" hits="0"/>
+						<line number="411" hits="0"/>
+						<line number="413" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="414,416"/>
+						<line number="414" hits="0"/>
+						<line number="416" hits="0"/>
+						<line number="417" hits="0"/>
+						<line number="418" hits="0"/>
+						<line number="421" hits="0"/>
+						<line number="423" hits="0"/>
+						<line number="424" hits="0"/>
+						<line number="430" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="431,437"/>
+						<line number="431" hits="0"/>
+						<line number="435" hits="0"/>
+						<line number="437" hits="0"/>
+						<line number="438" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="439,440"/>
+						<line number="439" hits="0"/>
+						<line number="440" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="441,447"/>
+						<line number="441" hits="0"/>
+						<line number="447" hits="0"/>
+						<line number="448" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="449,450"/>
+						<line number="449" hits="0"/>
+						<line number="450" hits="0"/>
+						<line number="452" hits="0"/>
+						<line number="457" hits="0"/>
 					</lines>
 				</class>
 				<class name="internal_provider.py" filename="api/internal_provider.py" complexity="0" line-rate="0.4167" branch-rate="0">
@@ -1863,7 +2208,7 @@
 						<line number="311" hits="0"/>
 					</lines>
 				</class>
-				<class name="oauth.py" filename="api/oauth.py" complexity="0" line-rate="0.3025" branch-rate="0">
+				<class name="oauth.py" filename="api/oauth.py" complexity="0" line-rate="0.3177" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="6" hits="1"/>
@@ -1881,153 +2226,299 @@
 						<line number="20" hits="1"/>
 						<line number="21" hits="1"/>
 						<line number="22" hits="1"/>
-						<line number="24" hits="1"/>
-						<line number="26" hits="1"/>
-						<line number="29" hits="1"/>
-						<line number="31" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="25" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="30" hits="1"/>
 						<line number="32" hits="1"/>
-						<line number="35" hits="1"/>
-						<line number="37" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="36" hits="1"/>
 						<line number="38" hits="1"/>
 						<line number="39" hits="1"/>
-						<line number="42" hits="1"/>
+						<line number="40" hits="1"/>
 						<line number="43" hits="1"/>
-						<line number="47" hits="0"/>
+						<line number="44" hits="1"/>
 						<line number="48" hits="0"/>
 						<line number="49" hits="0"/>
-						<line number="51" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="52,57"/>
-						<line number="52" hits="0"/>
-						<line number="57" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="52" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="53,58"/>
+						<line number="53" hits="0"/>
 						<line number="58" hits="0"/>
-						<line number="60" hits="0"/>
-						<line number="71" hits="0"/>
-						<line number="74" hits="1"/>
+						<line number="59" hits="0"/>
+						<line number="61" hits="0"/>
+						<line number="72" hits="0"/>
 						<line number="75" hits="1"/>
-						<line number="79" hits="0"/>
+						<line number="76" hits="1"/>
 						<line number="80" hits="0"/>
 						<line number="81" hits="0"/>
-						<line number="83" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="84,89"/>
-						<line number="84" hits="0"/>
-						<line number="89" hits="0"/>
+						<line number="82" hits="0"/>
+						<line number="84" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="85,90"/>
+						<line number="85" hits="0"/>
 						<line number="90" hits="0"/>
-						<line number="92" hits="0"/>
-						<line number="100" hits="0"/>
-						<line number="103" hits="1"/>
+						<line number="91" hits="0"/>
+						<line number="93" hits="0"/>
+						<line number="101" hits="0"/>
 						<line number="104" hits="1"/>
-						<line number="116" hits="0"/>
+						<line number="105" hits="1"/>
 						<line number="117" hits="0"/>
 						<line number="118" hits="0"/>
 						<line number="119" hits="0"/>
-						<line number="121" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="122,127"/>
-						<line number="122" hits="0"/>
-						<line number="127" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="128,133"/>
-						<line number="128" hits="0"/>
-						<line number="133" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="122" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="123,128"/>
+						<line number="123" hits="0"/>
+						<line number="128" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="129,134"/>
+						<line number="129" hits="0"/>
 						<line number="134" hits="0"/>
 						<line number="135" hits="0"/>
-						<line number="144" hits="0"/>
-						<line number="146" hits="0"/>
+						<line number="136" hits="0"/>
+						<line number="145" hits="0"/>
 						<line number="147" hits="0"/>
-						<line number="151" hits="0"/>
+						<line number="148" hits="0"/>
 						<line number="152" hits="0"/>
 						<line number="153" hits="0"/>
-						<line number="159" hits="1"/>
+						<line number="154" hits="0"/>
 						<line number="160" hits="1"/>
-						<line number="172" hits="0"/>
+						<line number="161" hits="1"/>
 						<line number="173" hits="0"/>
 						<line number="174" hits="0"/>
 						<line number="175" hits="0"/>
-						<line number="177" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="178,183"/>
-						<line number="178" hits="0"/>
-						<line number="183" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="184,189"/>
-						<line number="184" hits="0"/>
-						<line number="189" hits="0"/>
+						<line number="176" hits="0"/>
+						<line number="178" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="179,184"/>
+						<line number="179" hits="0"/>
+						<line number="184" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="185,190"/>
+						<line number="185" hits="0"/>
 						<line number="190" hits="0"/>
 						<line number="191" hits="0"/>
-						<line number="200" hits="0"/>
-						<line number="202" hits="0"/>
+						<line number="192" hits="0"/>
+						<line number="201" hits="0"/>
 						<line number="203" hits="0"/>
-						<line number="207" hits="0"/>
+						<line number="204" hits="0"/>
 						<line number="208" hits="0"/>
 						<line number="209" hits="0"/>
-						<line number="215" hits="1"/>
+						<line number="210" hits="0"/>
 						<line number="216" hits="1"/>
-						<line number="227" hits="0"/>
-						<line number="229" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="230,236"/>
-						<line number="230" hits="0"/>
-						<line number="236" hits="0"/>
-						<line number="237" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="238,242"/>
-						<line number="238" hits="0"/>
+						<line number="217" hits="1"/>
+						<line number="228" hits="0"/>
+						<line number="230" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="231,237"/>
+						<line number="231" hits="0"/>
+						<line number="237" hits="0"/>
+						<line number="238" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="239,243"/>
 						<line number="239" hits="0"/>
 						<line number="240" hits="0"/>
-						<line number="242" hits="0"/>
+						<line number="241" hits="0"/>
 						<line number="243" hits="0"/>
 						<line number="244" hits="0"/>
-						<line number="246" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="247,252"/>
-						<line number="247" hits="0"/>
-						<line number="252" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="253,258"/>
-						<line number="253" hits="0"/>
-						<line number="258" hits="0"/>
+						<line number="245" hits="0"/>
+						<line number="247" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="248,253"/>
+						<line number="248" hits="0"/>
+						<line number="253" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="254,259"/>
+						<line number="254" hits="0"/>
 						<line number="259" hits="0"/>
 						<line number="260" hits="0"/>
-						<line number="270" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="271,273"/>
-						<line number="271" hits="0"/>
-						<line number="273" hits="0"/>
-						<line number="278" hits="0"/>
+						<line number="261" hits="0"/>
+						<line number="271" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="272,274"/>
+						<line number="272" hits="0"/>
+						<line number="274" hits="0"/>
 						<line number="279" hits="0"/>
-						<line number="283" hits="0"/>
+						<line number="280" hits="0"/>
 						<line number="284" hits="0"/>
-						<line number="290" hits="1"/>
+						<line number="285" hits="0"/>
 						<line number="291" hits="1"/>
-						<line number="303" hits="0"/>
-						<line number="305" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="306,311"/>
-						<line number="306" hits="0"/>
-						<line number="311" hits="0"/>
+						<line number="292" hits="1"/>
+						<line number="304" hits="0"/>
+						<line number="306" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="307,312"/>
+						<line number="307" hits="0"/>
 						<line number="312" hits="0"/>
 						<line number="313" hits="0"/>
-						<line number="318" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="319,321"/>
-						<line number="319" hits="0"/>
-						<line number="321" hits="0"/>
-						<line number="326" hits="0"/>
+						<line number="314" hits="0"/>
+						<line number="319" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="320,322"/>
+						<line number="320" hits="0"/>
+						<line number="322" hits="0"/>
 						<line number="327" hits="0"/>
-						<line number="331" hits="0"/>
+						<line number="328" hits="0"/>
 						<line number="332" hits="0"/>
-						<line number="338" hits="1"/>
+						<line number="333" hits="0"/>
 						<line number="339" hits="1"/>
-						<line number="349" hits="0"/>
+						<line number="340" hits="1"/>
 						<line number="350" hits="0"/>
-						<line number="352" hits="0"/>
-						<line number="357" hits="0"/>
-						<line number="359" hits="0"/>
-						<line number="374" hits="1"/>
+						<line number="351" hits="0"/>
+						<line number="353" hits="0"/>
+						<line number="358" hits="0"/>
+						<line number="360" hits="0"/>
 						<line number="375" hits="1"/>
 						<line number="376" hits="1"/>
-						<line number="379" hits="1"/>
+						<line number="377" hits="1"/>
 						<line number="380" hits="1"/>
-						<line number="385" hits="0"/>
+						<line number="381" hits="1"/>
 						<line number="386" hits="0"/>
 						<line number="387" hits="0"/>
 						<line number="388" hits="0"/>
 						<line number="389" hits="0"/>
-						<line number="395" hits="1"/>
+						<line number="390" hits="0"/>
 						<line number="396" hits="1"/>
-						<line number="402" hits="0"/>
+						<line number="397" hits="1"/>
 						<line number="403" hits="0"/>
 						<line number="404" hits="0"/>
-						<line number="410" hits="0"/>
+						<line number="405" hits="0"/>
 						<line number="411" hits="0"/>
 						<line number="412" hits="0"/>
-						<line number="418" hits="1"/>
+						<line number="413" hits="0"/>
 						<line number="419" hits="1"/>
-						<line number="424" hits="0"/>
+						<line number="420" hits="1"/>
 						<line number="425" hits="0"/>
-						<line number="428" hits="1"/>
+						<line number="426" hits="0"/>
 						<line number="429" hits="1"/>
-						<line number="434" hits="0"/>
+						<line number="430" hits="1"/>
 						<line number="435" hits="0"/>
-						<line number="436" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="437,441"/>
-						<line number="437" hits="0"/>
-						<line number="441" hits="0"/>
+						<line number="436" hits="0"/>
+						<line number="437" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="438,442"/>
+						<line number="438" hits="0"/>
+						<line number="442" hits="0"/>
+						<line number="448" hits="1"/>
+						<line number="449" hits="1"/>
+						<line number="450" hits="1"/>
+						<line number="453" hits="1"/>
+						<line number="454" hits="1"/>
+						<line number="459" hits="0"/>
+						<line number="460" hits="0"/>
+						<line number="461" hits="0"/>
+						<line number="462" hits="0"/>
+						<line number="463" hits="0"/>
+						<line number="469" hits="1"/>
+						<line number="470" hits="1"/>
+						<line number="476" hits="0"/>
+						<line number="477" hits="0"/>
+						<line number="478" hits="0"/>
+						<line number="484" hits="0"/>
+						<line number="485" hits="0"/>
+						<line number="486" hits="0"/>
+						<line number="492" hits="1"/>
+						<line number="493" hits="1"/>
+						<line number="498" hits="0"/>
+						<line number="499" hits="0"/>
+						<line number="502" hits="1"/>
+						<line number="503" hits="1"/>
+						<line number="508" hits="0"/>
+						<line number="509" hits="0"/>
+						<line number="510" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="511,515"/>
+						<line number="511" hits="0"/>
+						<line number="515" hits="0"/>
+					</lines>
+				</class>
+				<class name="onedrive.py" filename="api/onedrive.py" complexity="0" line-rate="0.3333" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="8" hits="1"/>
+						<line number="9" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="14" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="19" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="42" hits="1"/>
+						<line number="43" hits="1"/>
+						<line number="44" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="46" hits="1"/>
+						<line number="49" hits="1"/>
+						<line number="50" hits="1"/>
+						<line number="51" hits="1"/>
+						<line number="54" hits="1"/>
+						<line number="55" hits="1"/>
+						<line number="56" hits="1"/>
+						<line number="59" hits="1"/>
+						<line number="60" hits="1"/>
+						<line number="61" hits="1"/>
+						<line number="64" hits="1"/>
+						<line number="65" hits="1"/>
+						<line number="71" hits="1"/>
+						<line number="72" hits="1"/>
+						<line number="78" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="79,83"/>
+						<line number="79" hits="0"/>
+						<line number="83" hits="0"/>
+						<line number="84" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="86" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="92" hits="0"/>
+						<line number="93" hits="0"/>
+						<line number="94" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="99" hits="0"/>
+						<line number="100" hits="0"/>
+						<line number="110" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="111,120"/>
+						<line number="111" hits="0"/>
+						<line number="115" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="121" hits="0"/>
+						<line number="122" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="126" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="128,130"/>
+						<line number="128" hits="0"/>
+						<line number="130" hits="0"/>
+						<line number="131" hits="0"/>
+						<line number="133" hits="0"/>
+						<line number="134" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="136" hits="0"/>
+						<line number="137" hits="0"/>
+						<line number="143" hits="1"/>
+						<line number="144" hits="1"/>
+						<line number="150" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="151,155"/>
+						<line number="151" hits="0"/>
+						<line number="155" hits="0"/>
+						<line number="156" hits="0"/>
+						<line number="157" hits="0"/>
+						<line number="158" hits="0"/>
+						<line number="159" hits="0"/>
+						<line number="164" hits="0"/>
+						<line number="165" hits="0"/>
+						<line number="167" hits="0"/>
+						<line number="168" hits="0"/>
+						<line number="174" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="175,184"/>
+						<line number="175" hits="0"/>
+						<line number="179" hits="0"/>
+						<line number="184" hits="0"/>
+						<line number="185" hits="0"/>
+						<line number="186" hits="0"/>
+						<line number="188" hits="0"/>
+						<line number="189" hits="0"/>
+						<line number="191" hits="0"/>
+						<line number="192" hits="0"/>
+						<line number="193" hits="0"/>
+						<line number="194" hits="0"/>
+						<line number="195" hits="0"/>
+						<line number="201" hits="1"/>
+						<line number="202" hits="1"/>
+						<line number="209" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="210,214"/>
+						<line number="210" hits="0"/>
+						<line number="214" hits="0"/>
+						<line number="215" hits="0"/>
+						<line number="216" hits="0"/>
+						<line number="217" hits="0"/>
+						<line number="218" hits="0"/>
+						<line number="223" hits="0"/>
+						<line number="224" hits="0"/>
+						<line number="226" hits="0"/>
+						<line number="227" hits="0"/>
+						<line number="234" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="235,238"/>
+						<line number="235" hits="0"/>
+						<line number="236" hits="0"/>
+						<line number="238" hits="0"/>
+						<line number="242" hits="0"/>
+						<line number="247" hits="0"/>
+						<line number="248" hits="0"/>
+						<line number="249" hits="0"/>
+						<line number="250" hits="0"/>
+						<line number="251" hits="0"/>
 					</lines>
 				</class>
 				<class name="openai_compat.py" filename="api/openai_compat.py" complexity="0" line-rate="0.1943" branch-rate="0">
@@ -3069,7 +3560,7 @@
 						<line number="442" hits="0"/>
 					</lines>
 				</class>
-				<class name="workflows.py" filename="api/workflows.py" complexity="0" line-rate="0.3744" branch-rate="0">
+				<class name="workflows.py" filename="api/workflows.py" complexity="0" line-rate="0.342" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="2" hits="1"/>
@@ -3098,426 +3589,632 @@
 						<line number="27" hits="1"/>
 						<line number="28" hits="1"/>
 						<line number="29" hits="1"/>
+						<line number="30" hits="1"/>
 						<line number="31" hits="1"/>
-						<line number="32" hits="1"/>
-						<line number="35" hits="1"/>
-						<line number="36" hits="1"/>
-						<line number="39" hits="1"/>
-						<line number="42" hits="1"/>
-						<line number="43" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="41" hits="1"/>
 						<line number="44" hits="1"/>
-						<line number="47" hits="1"/>
-						<line number="50" hits="1"/>
-						<line number="51" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="46" hits="1"/>
+						<line number="49" hits="1"/>
 						<line number="52" hits="1"/>
 						<line number="53" hits="1"/>
 						<line number="54" hits="1"/>
-						<line number="57" hits="1"/>
-						<line number="60" hits="1"/>
-						<line number="61" hits="1"/>
-						<line number="67" hits="1"/>
-						<line number="70" hits="1"/>
-						<line number="71" hits="1"/>
-						<line number="72" hits="1"/>
-						<line number="75" hits="1"/>
+						<line number="55" hits="1"/>
+						<line number="56" hits="1"/>
+						<line number="59" hits="1"/>
+						<line number="62" hits="1"/>
+						<line number="63" hits="1"/>
+						<line number="66" hits="1"/>
+						<line number="69" hits="1"/>
+						<line number="74" hits="1"/>
+						<line number="77" hits="1"/>
 						<line number="78" hits="1"/>
-						<line number="83" hits="1"/>
+						<line number="79" hits="1"/>
+						<line number="82" hits="1"/>
+						<line number="85" hits="1"/>
 						<line number="86" hits="1"/>
-						<line number="87" hits="1"/>
-						<line number="88" hits="1"/>
-						<line number="91" hits="1"/>
+						<line number="89" hits="1"/>
+						<line number="92" hits="1"/>
+						<line number="93" hits="1"/>
 						<line number="94" hits="1"/>
 						<line number="95" hits="1"/>
 						<line number="96" hits="1"/>
-						<line number="97" hits="1"/>
-						<line number="98" hits="1"/>
 						<line number="99" hits="1"/>
 						<line number="100" hits="1"/>
-						<line number="101" hits="1"/>
-						<line number="102" hits="1"/>
 						<line number="105" hits="1"/>
 						<line number="108" hits="1"/>
 						<line number="109" hits="1"/>
 						<line number="112" hits="1"/>
 						<line number="115" hits="1"/>
+						<line number="116" hits="1"/>
+						<line number="117" hits="1"/>
+						<line number="118" hits="1"/>
+						<line number="119" hits="1"/>
+						<line number="120" hits="1"/>
 						<line number="121" hits="1"/>
-						<line number="124" hits="1"/>
-						<line number="125" hits="1"/>
+						<line number="122" hits="1"/>
+						<line number="123" hits="1"/>
 						<line number="126" hits="1"/>
 						<line number="129" hits="1"/>
+						<line number="130" hits="1"/>
+						<line number="131" hits="1"/>
 						<line number="132" hits="1"/>
-						<line number="135" hits="1"/>
 						<line number="138" hits="1"/>
-						<line number="139" hits="1"/>
-						<line number="140" hits="1"/>
 						<line number="141" hits="1"/>
-						<line number="144" hits="1"/>
-						<line number="147" hits="1"/>
-						<line number="148" hits="1"/>
+						<line number="142" hits="1"/>
+						<line number="143" hits="1"/>
+						<line number="146" hits="1"/>
 						<line number="149" hits="1"/>
-						<line number="150" hits="1"/>
-						<line number="151" hits="1"/>
-						<line number="152" hits="1"/>
-						<line number="153" hits="1"/>
-						<line number="156" hits="1"/>
+						<line number="154" hits="1"/>
 						<line number="157" hits="1"/>
-						<line number="170" hits="0"/>
-						<line number="172" hits="0"/>
-						<line number="178" hits="0"/>
-						<line number="179" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="180,183"/>
-						<line number="180" hits="0"/>
-						<line number="183" hits="0"/>
-						<line number="184" hits="0"/>
-						<line number="186" hits="0"/>
-						<line number="193" hits="0"/>
-						<line number="199" hits="0"/>
-						<line number="200" hits="0"/>
-						<line number="205" hits="0"/>
-						<line number="211" hits="0"/>
-						<line number="212" hits="0"/>
-						<line number="217" hits="0"/>
+						<line number="158" hits="1"/>
+						<line number="159" hits="1"/>
+						<line number="162" hits="1"/>
+						<line number="165" hits="1"/>
+						<line number="166" hits="1"/>
+						<line number="167" hits="1"/>
+						<line number="168" hits="1"/>
+						<line number="169" hits="1"/>
+						<line number="170" hits="1"/>
+						<line number="171" hits="1"/>
+						<line number="172" hits="1"/>
+						<line number="173" hits="1"/>
+						<line number="176" hits="1"/>
+						<line number="179" hits="1"/>
+						<line number="180" hits="1"/>
+						<line number="183" hits="1"/>
+						<line number="186" hits="1"/>
+						<line number="192" hits="1"/>
+						<line number="195" hits="1"/>
+						<line number="196" hits="1"/>
+						<line number="197" hits="1"/>
+						<line number="200" hits="1"/>
+						<line number="203" hits="1"/>
+						<line number="206" hits="1"/>
+						<line number="209" hits="1"/>
+						<line number="210" hits="1"/>
+						<line number="211" hits="1"/>
+						<line number="212" hits="1"/>
+						<line number="215" hits="1"/>
+						<line number="218" hits="1"/>
+						<line number="219" hits="1"/>
+						<line number="220" hits="1"/>
+						<line number="221" hits="1"/>
+						<line number="222" hits="1"/>
 						<line number="223" hits="1"/>
 						<line number="224" hits="1"/>
-						<line number="233" hits="0"/>
+						<line number="227" hits="1"/>
+						<line number="228" hits="1"/>
+						<line number="239" hits="0"/>
+						<line number="242" hits="0"/>
+						<line number="243" hits="0"/>
+						<line number="244" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="245,247"/>
+						<line number="245" hits="0"/>
+						<line number="247" hits="0"/>
 						<line number="250" hits="0"/>
-						<line number="256" hits="1"/>
-						<line number="257" hits="1"/>
+						<line number="257" hits="0"/>
+						<line number="258" hits="0"/>
+						<line number="267" hits="0"/>
 						<line number="268" hits="0"/>
-						<line number="271" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="272,282"/>
-						<line number="272" hits="0"/>
+						<line number="270" hits="0"/>
+						<line number="271" hits="0"/>
 						<line number="276" hits="0"/>
-						<line number="282" hits="0"/>
-						<line number="283" hits="0"/>
-						<line number="284" hits="0"/>
-						<line number="286" hits="0"/>
-						<line number="287" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="288,300"/>
-						<line number="288" hits="0"/>
-						<line number="294" hits="0"/>
-						<line number="300" hits="0"/>
-						<line number="301" hits="0"/>
-						<line number="303" hits="0"/>
-						<line number="313" hits="0"/>
-						<line number="314" hits="0"/>
-						<line number="317" hits="0"/>
-						<line number="319" hits="0"/>
-						<line number="320" hits="0"/>
-						<line number="321" hits="0"/>
-						<line number="322" hits="0"/>
-						<line number="323" hits="0"/>
+						<line number="277" hits="0"/>
+						<line number="278" hits="0"/>
+						<line number="285" hits="0"/>
+						<line number="290" hits="0"/>
+						<line number="291" hits="0"/>
+						<line number="296" hits="0"/>
+						<line number="297" hits="0"/>
+						<line number="298" hits="0"/>
+						<line number="304" hits="0"/>
+						<line number="311" hits="0"/>
+						<line number="314" hits="1"/>
+						<line number="315" hits="1"/>
 						<line number="324" hits="0"/>
-						<line number="327" hits="0"/>
+						<line number="327" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="328,331"/>
+						<line number="328" hits="0"/>
+						<line number="331" hits="0"/>
+						<line number="332" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="333,335"/>
+						<line number="333" hits="0"/>
+						<line number="335" hits="0"/>
+						<line number="337" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="338,345"/>
+						<line number="338" hits="0"/>
 						<line number="339" hits="0"/>
-						<line number="342" hits="0"/>
+						<line number="345" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="346,353"/>
 						<line number="346" hits="0"/>
-						<line number="354" hits="0"/>
-						<line number="361" hits="1"/>
-						<line number="362" hits="1"/>
+						<line number="353" hits="0"/>
+						<line number="359" hits="1"/>
+						<line number="360" hits="1"/>
+						<line number="371" hits="0"/>
 						<line number="372" hits="0"/>
+						<line number="374" hits="0"/>
 						<line number="375" hits="0"/>
-						<line number="376" hits="0"/>
-						<line number="378" hits="0"/>
+						<line number="376" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="377,379"/>
+						<line number="377" hits="0"/>
 						<line number="379" hits="0"/>
-						<line number="382" hits="0"/>
-						<line number="385" hits="0"/>
-						<line number="386" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="387,388"/>
+						<line number="381" hits="0"/>
 						<line number="387" hits="0"/>
-						<line number="388" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="389,391"/>
-						<line number="389" hits="0"/>
-						<line number="391" hits="0"/>
-						<line number="399" hits="0"/>
-						<line number="407" hits="1"/>
-						<line number="408" hits="1"/>
-						<line number="431" hits="0"/>
+						<line number="388" hits="0"/>
+						<line number="400" hits="0"/>
+						<line number="401" hits="0"/>
+						<line number="403" hits="0"/>
+						<line number="404" hits="0"/>
+						<line number="409" hits="0"/>
+						<line number="410" hits="0"/>
+						<line number="411" hits="0"/>
+						<line number="421" hits="0"/>
+						<line number="426" hits="0"/>
+						<line number="427" hits="0"/>
 						<line number="432" hits="0"/>
 						<line number="433" hits="0"/>
-						<line number="436" hits="0"/>
-						<line number="437" hits="0"/>
-						<line number="438" hits="0"/>
-						<line number="439" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="440,442"/>
+						<line number="434" hits="0"/>
 						<line number="440" hits="0"/>
-						<line number="442" hits="0"/>
-						<line number="443" hits="0"/>
-						<line number="444" hits="0"/>
-						<line number="445" hits="0"/>
-						<line number="446" hits="0"/>
-						<line number="449" hits="0"/>
+						<line number="448" hits="0"/>
+						<line number="451" hits="1"/>
+						<line number="452" hits="1"/>
 						<line number="457" hits="0"/>
-						<line number="467" hits="0"/>
-						<line number="468" hits="0"/>
-						<line number="469" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="470,475"/>
+						<line number="459" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="460,462"/>
+						<line number="460" hits="0"/>
+						<line number="462" hits="0"/>
+						<line number="463" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="464,466"/>
+						<line number="464" hits="0"/>
+						<line number="466" hits="0"/>
+						<line number="468" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="469,477"/>
+						<line number="469" hits="0"/>
 						<line number="470" hits="0"/>
-						<line number="475" hits="0"/>
-						<line number="476" hits="0"/>
-						<line number="479" hits="0"/>
+						<line number="477" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="478,485"/>
+						<line number="478" hits="0"/>
 						<line number="485" hits="0"/>
-						<line number="487" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="488,494"/>
-						<line number="488" hits="0"/>
-						<line number="494" hits="0"/>
-						<line number="495" hits="0"/>
-						<line number="501" hits="0"/>
-						<line number="509" hits="0"/>
+						<line number="491" hits="1"/>
+						<line number="492" hits="1"/>
+						<line number="505" hits="0"/>
+						<line number="507" hits="0"/>
+						<line number="513" hits="0"/>
+						<line number="514" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="515,518"/>
+						<line number="515" hits="0"/>
 						<line number="518" hits="0"/>
 						<line number="519" hits="0"/>
-						<line number="520" hits="0"/>
 						<line number="521" hits="0"/>
-						<line number="522" hits="0"/>
-						<line number="528" hits="1"/>
-						<line number="529" hits="1"/>
-						<line number="547" hits="0"/>
-						<line number="548" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="549,552"/>
+						<line number="531" hits="0"/>
+						<line number="543" hits="0"/>
+						<line number="544" hits="0"/>
 						<line number="549" hits="0"/>
-						<line number="552" hits="0"/>
-						<line number="553" hits="0"/>
-						<line number="554" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="555,558"/>
 						<line number="555" hits="0"/>
-						<line number="558" hits="0"/>
-						<line number="564" hits="0"/>
-						<line number="565" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="566,568"/>
-						<line number="566" hits="0"/>
-						<line number="568" hits="0"/>
-						<line number="569" hits="0"/>
-						<line number="571" hits="0"/>
-						<line number="572" hits="0"/>
-						<line number="573" hits="0"/>
-						<line number="581" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="582,590"/>
-						<line number="582" hits="0"/>
-						<line number="583" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="584,590"/>
-						<line number="584" hits="0"/>
-						<line number="585" hits="0"/>
-						<line number="586" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="587,590"/>
-						<line number="587" hits="0"/>
-						<line number="590" hits="0"/>
-						<line number="591" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="592,596"/>
-						<line number="592" hits="0"/>
-						<line number="593" hits="0"/>
+						<line number="556" hits="0"/>
+						<line number="561" hits="0"/>
+						<line number="567" hits="1"/>
+						<line number="568" hits="1"/>
+						<line number="577" hits="0"/>
 						<line number="594" hits="0"/>
-						<line number="596" hits="0"/>
-						<line number="597" hits="0"/>
-						<line number="600" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,606"/>
-						<line number="606" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="607,610"/>
-						<line number="607" hits="0"/>
-						<line number="608" hits="0"/>
-						<line number="610" hits="0"/>
-						<line number="611" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="600,612"/>
+						<line number="600" hits="1"/>
+						<line number="601" hits="1"/>
 						<line number="612" hits="0"/>
-						<line number="615" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="600,616"/>
+						<line number="615" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="616,626"/>
 						<line number="616" hits="0"/>
-						<line number="618" hits="0"/>
-						<line number="619" hits="0"/>
 						<line number="620" hits="0"/>
-						<line number="621" hits="0"/>
-						<line number="622" hits="0"/>
-						<line number="624" hits="0"/>
-						<line number="635" hits="1"/>
-						<line number="636" hits="1"/>
-						<line number="650" hits="0"/>
-						<line number="651" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="652,655"/>
-						<line number="652" hits="0"/>
-						<line number="655" hits="0"/>
+						<line number="626" hits="0"/>
+						<line number="627" hits="0"/>
+						<line number="628" hits="0"/>
+						<line number="630" hits="0"/>
+						<line number="631" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="632,644"/>
+						<line number="632" hits="0"/>
+						<line number="638" hits="0"/>
+						<line number="644" hits="0"/>
+						<line number="645" hits="0"/>
+						<line number="647" hits="0"/>
+						<line number="657" hits="0"/>
+						<line number="658" hits="0"/>
 						<line number="661" hits="0"/>
-						<line number="662" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="663,664"/>
 						<line number="663" hits="0"/>
-						<line number="664" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="665,668"/>
+						<line number="664" hits="0"/>
 						<line number="665" hits="0"/>
+						<line number="666" hits="0"/>
+						<line number="667" hits="0"/>
 						<line number="668" hits="0"/>
 						<line number="669" hits="0"/>
 						<line number="672" hits="0"/>
+						<line number="673" hits="0"/>
 						<line number="674" hits="0"/>
-						<line number="675" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="676,678"/>
-						<line number="676" hits="0"/>
-						<line number="678" hits="0"/>
-						<line number="681" hits="0"/>
-						<line number="683" hits="0"/>
-						<line number="685" hits="0"/>
-						<line number="686" hits="0"/>
-						<line number="687" hits="0"/>
-						<line number="688" hits="0"/>
-						<line number="689" hits="0"/>
+						<line number="675" hits="0"/>
+						<line number="690" hits="0"/>
 						<line number="692" hits="0"/>
-						<line number="693" hits="0"/>
-						<line number="695" hits="0"/>
-						<line number="696" hits="0"/>
-						<line number="698" hits="0"/>
-						<line number="705" hits="1"/>
-						<line number="706" hits="1"/>
-						<line number="730" hits="0"/>
+						<line number="700" hits="0"/>
+						<line number="707" hits="1"/>
+						<line number="708" hits="1"/>
+						<line number="718" hits="0"/>
+						<line number="721" hits="0"/>
+						<line number="722" hits="0"/>
+						<line number="724" hits="0"/>
+						<line number="725" hits="0"/>
+						<line number="728" hits="0"/>
+						<line number="731" hits="0"/>
+						<line number="732" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="733,734"/>
+						<line number="733" hits="0"/>
+						<line number="734" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="735,737"/>
+						<line number="735" hits="0"/>
 						<line number="737" hits="0"/>
-						<line number="749" hits="1"/>
-						<line number="750" hits="1"/>
-						<line number="758" hits="0"/>
-						<line number="759" hits="0"/>
-						<line number="761" hits="0"/>
-						<line number="801" hits="1"/>
-						<line number="802" hits="1"/>
-						<line number="810" hits="0"/>
-						<line number="841" hits="0"/>
-						<line number="843" hits="0"/>
-						<line number="846" hits="1"/>
-						<line number="847" hits="1"/>
+						<line number="745" hits="0"/>
+						<line number="753" hits="1"/>
+						<line number="754" hits="1"/>
+						<line number="777" hits="0"/>
+						<line number="782" hits="0"/>
+						<line number="783" hits="0"/>
+						<line number="787" hits="0"/>
+						<line number="790" hits="0"/>
+						<line number="791" hits="0"/>
+						<line number="792" hits="0"/>
+						<line number="793" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="794,796"/>
+						<line number="794" hits="0"/>
+						<line number="796" hits="0"/>
+						<line number="797" hits="0"/>
+						<line number="798" hits="0"/>
+						<line number="799" hits="0"/>
+						<line number="800" hits="0"/>
+						<line number="803" hits="0"/>
+						<line number="811" hits="0"/>
+						<line number="821" hits="0"/>
+						<line number="822" hits="0"/>
+						<line number="823" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="824,829"/>
+						<line number="824" hits="0"/>
+						<line number="829" hits="0"/>
+						<line number="830" hits="0"/>
+						<line number="833" hits="0"/>
+						<line number="839" hits="0"/>
+						<line number="841" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="842,848"/>
+						<line number="842" hits="0"/>
+						<line number="848" hits="0"/>
+						<line number="849" hits="0"/>
 						<line number="855" hits="0"/>
-						<line number="862" hits="1"/>
-						<line number="863" hits="1"/>
-						<line number="871" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="872,874"/>
+						<line number="863" hits="0"/>
 						<line number="872" hits="0"/>
+						<line number="873" hits="0"/>
 						<line number="874" hits="0"/>
-						<line number="879" hits="0"/>
-						<line number="881" hits="0"/>
-						<line number="889" hits="1"/>
-						<line number="890" hits="1"/>
+						<line number="876" hits="0"/>
+						<line number="877" hits="0"/>
+						<line number="883" hits="1"/>
+						<line number="884" hits="1"/>
+						<line number="902" hits="0"/>
+						<line number="903" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="904,907"/>
 						<line number="904" hits="0"/>
 						<line number="907" hits="0"/>
-						<line number="911" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="912,914"/>
-						<line number="912" hits="0"/>
+						<line number="908" hits="0"/>
+						<line number="909" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="910,913"/>
+						<line number="910" hits="0"/>
 						<line number="913" hits="0"/>
-						<line number="914" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="915,918"/>
-						<line number="915" hits="0"/>
-						<line number="916" hits="0"/>
-						<line number="918" hits="0"/>
 						<line number="919" hits="0"/>
+						<line number="920" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="921,923"/>
 						<line number="921" hits="0"/>
-						<line number="922" hits="0"/>
 						<line number="923" hits="0"/>
-						<line number="925" hits="0"/>
-						<line number="944" hits="1"/>
-						<line number="945" hits="1"/>
+						<line number="924" hits="0"/>
+						<line number="926" hits="0"/>
+						<line number="927" hits="0"/>
+						<line number="928" hits="0"/>
+						<line number="929" hits="0"/>
+						<line number="937" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="938,946"/>
+						<line number="938" hits="0"/>
+						<line number="939" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="940,946"/>
+						<line number="940" hits="0"/>
+						<line number="941" hits="0"/>
+						<line number="942" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="943,946"/>
+						<line number="943" hits="0"/>
+						<line number="946" hits="0"/>
+						<line number="947" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="948,951"/>
+						<line number="948" hits="0"/>
+						<line number="949" hits="0"/>
+						<line number="951" hits="0"/>
+						<line number="952" hits="0"/>
+						<line number="953" hits="0"/>
+						<line number="956" hits="0"/>
 						<line number="957" hits="0"/>
-						<line number="963" hits="0"/>
-						<line number="964" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="965,966"/>
-						<line number="965" hits="0"/>
-						<line number="966" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="967,973"/>
-						<line number="967" hits="0"/>
-						<line number="973" hits="0"/>
-						<line number="974" hits="0"/>
-						<line number="975" hits="0"/>
+						<line number="969" hits="0"/>
+						<line number="970" hits="0"/>
+						<line number="971" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="976,1011"/>
+						<line number="976" hits="0"/>
+						<line number="977" hits="0"/>
 						<line number="978" hits="0"/>
 						<line number="979" hits="0"/>
-						<line number="981" hits="0"/>
+						<line number="982" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="983,992"/>
 						<line number="983" hits="0"/>
+						<line number="992" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="993,996"/>
+						<line number="993" hits="0"/>
 						<line number="994" hits="0"/>
-						<line number="1001" hits="0"/>
-						<line number="1008" hits="1"/>
-						<line number="1009" hits="1"/>
-						<line number="1016" hits="0"/>
-						<line number="1041" hits="1"/>
-						<line number="1044" hits="1"/>
-						<line number="1045" hits="1"/>
-						<line number="1046" hits="1"/>
-						<line number="1047" hits="1"/>
-						<line number="1048" hits="1"/>
-						<line number="1051" hits="1"/>
-						<line number="1054" hits="1"/>
-						<line number="1055" hits="1"/>
-						<line number="1056" hits="1"/>
-						<line number="1057" hits="1"/>
-						<line number="1058" hits="1"/>
-						<line number="1059" hits="1"/>
-						<line number="1060" hits="1"/>
-						<line number="1061" hits="1"/>
-						<line number="1062" hits="1"/>
-						<line number="1065" hits="1"/>
-						<line number="1068" hits="1"/>
-						<line number="1069" hits="1"/>
-						<line number="1072" hits="1"/>
-						<line number="1073" hits="1"/>
+						<line number="996" hits="0"/>
+						<line number="997" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="971,998"/>
+						<line number="998" hits="0"/>
+						<line number="999" hits="0"/>
+						<line number="1005" hits="0"/>
+						<line number="1008" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="971,1009"/>
+						<line number="1009" hits="0"/>
+						<line number="1011" hits="0"/>
+						<line number="1018" hits="0"/>
+						<line number="1020" hits="0"/>
+						<line number="1021" hits="0"/>
+						<line number="1022" hits="0"/>
+						<line number="1023" hits="0"/>
+						<line number="1025" hits="0"/>
+						<line number="1027" hits="0"/>
+						<line number="1038" hits="1"/>
+						<line number="1039" hits="1"/>
+						<line number="1053" hits="0"/>
+						<line number="1054" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1055,1058"/>
+						<line number="1055" hits="0"/>
+						<line number="1058" hits="0"/>
+						<line number="1064" hits="0"/>
+						<line number="1065" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1066,1067"/>
+						<line number="1066" hits="0"/>
+						<line number="1067" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1068,1071"/>
+						<line number="1068" hits="0"/>
+						<line number="1071" hits="0"/>
+						<line number="1072" hits="0"/>
+						<line number="1075" hits="0"/>
+						<line number="1077" hits="0"/>
+						<line number="1078" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1079,1081"/>
+						<line number="1079" hits="0"/>
+						<line number="1081" hits="0"/>
 						<line number="1084" hits="0"/>
-						<line number="1085" hits="0"/>
 						<line number="1086" hits="0"/>
-						<line number="1089" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1090,1096"/>
+						<line number="1088" hits="0"/>
+						<line number="1089" hits="0"/>
 						<line number="1090" hits="0"/>
+						<line number="1091" hits="0"/>
+						<line number="1092" hits="0"/>
+						<line number="1095" hits="0"/>
 						<line number="1096" hits="0"/>
-						<line number="1097" hits="0"/>
 						<line number="1098" hits="0"/>
 						<line number="1099" hits="0"/>
-						<line number="1100" hits="0"/>
 						<line number="1101" hits="0"/>
-						<line number="1102" hits="0"/>
-						<line number="1108" hits="0"/>
-						<line number="1114" hits="0"/>
-						<line number="1115" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1116,1122"/>
-						<line number="1116" hits="0"/>
-						<line number="1122" hits="0"/>
-						<line number="1130" hits="0"/>
-						<line number="1131" hits="0"/>
-						<line number="1132" hits="0"/>
-						<line number="1134" hits="0"/>
-						<line number="1143" hits="0"/>
-						<line number="1156" hits="1"/>
+						<line number="1108" hits="1"/>
+						<line number="1109" hits="1"/>
+						<line number="1121" hits="0"/>
+						<line number="1122" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1123,1138"/>
+						<line number="1123" hits="0"/>
+						<line number="1138" hits="0"/>
+						<line number="1145" hits="0"/>
 						<line number="1157" hits="1"/>
+						<line number="1158" hits="1"/>
+						<line number="1166" hits="0"/>
 						<line number="1167" hits="0"/>
-						<line number="1176" hits="0"/>
-						<line number="1177" hits="0"/>
-						<line number="1180" hits="0"/>
-						<line number="1186" hits="0"/>
-						<line number="1187" hits="0"/>
-						<line number="1189" hits="0"/>
-						<line number="1196" hits="0"/>
-						<line number="1215" hits="1"/>
-						<line number="1216" hits="1"/>
-						<line number="1225" hits="0"/>
-						<line number="1234" hits="0"/>
-						<line number="1235" hits="0"/>
-						<line number="1237" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1238,1243"/>
+						<line number="1169" hits="0"/>
+						<line number="1211" hits="1"/>
+						<line number="1212" hits="1"/>
+						<line number="1220" hits="0"/>
+						<line number="1222" hits="0"/>
+						<line number="1237" hits="0"/>
 						<line number="1238" hits="0"/>
+						<line number="1240" hits="0"/>
+						<line number="1241" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1242,1267"/>
+						<line number="1242" hits="0"/>
 						<line number="1243" hits="0"/>
 						<line number="1244" hits="0"/>
+						<line number="1245" hits="0"/>
 						<line number="1246" hits="0"/>
-						<line number="1252" hits="0"/>
-						<line number="1260" hits="1"/>
-						<line number="1263" hits="1"/>
-						<line number="1264" hits="1"/>
-						<line number="1265" hits="1"/>
-						<line number="1269" hits="1"/>
+						<line number="1249" hits="0"/>
+						<line number="1250" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1251,1252"/>
+						<line number="1251" hits="0"/>
+						<line number="1252" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1253,1255"/>
+						<line number="1253" hits="0"/>
+						<line number="1255" hits="0"/>
+						<line number="1267" hits="0"/>
+						<line number="1269" hits="0"/>
+						<line number="1272" hits="1"/>
 						<line number="1273" hits="1"/>
-						<line number="1276" hits="1"/>
-						<line number="1279" hits="1"/>
-						<line number="1280" hits="1"/>
-						<line number="1281" hits="1"/>
-						<line number="1282" hits="1"/>
-						<line number="1283" hits="1"/>
-						<line number="1284" hits="1"/>
-						<line number="1285" hits="1"/>
+						<line number="1281" hits="0"/>
 						<line number="1288" hits="1"/>
-						<line number="1291" hits="1"/>
-						<line number="1292" hits="1"/>
-						<line number="1295" hits="1"/>
-						<line number="1296" hits="1"/>
-						<line number="1308" hits="0"/>
-						<line number="1316" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1317,1323"/>
-						<line number="1317" hits="0"/>
-						<line number="1323" hits="0"/>
-						<line number="1329" hits="0"/>
-						<line number="1330" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1331,1337"/>
-						<line number="1331" hits="0"/>
-						<line number="1337" hits="0"/>
+						<line number="1289" hits="1"/>
+						<line number="1297" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1298,1300"/>
+						<line number="1298" hits="0"/>
+						<line number="1300" hits="0"/>
+						<line number="1305" hits="0"/>
+						<line number="1307" hits="0"/>
+						<line number="1315" hits="1"/>
+						<line number="1316" hits="1"/>
+						<line number="1330" hits="0"/>
+						<line number="1333" hits="0"/>
+						<line number="1337" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1338,1340"/>
+						<line number="1338" hits="0"/>
+						<line number="1339" hits="0"/>
+						<line number="1340" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1341,1344"/>
+						<line number="1341" hits="0"/>
+						<line number="1342" hits="0"/>
 						<line number="1344" hits="0"/>
 						<line number="1345" hits="0"/>
-						<line number="1346" hits="0"/>
+						<line number="1347" hits="0"/>
 						<line number="1348" hits="0"/>
-						<line number="1356" hits="0"/>
-						<line number="1367" hits="1"/>
-						<line number="1368" hits="1"/>
-						<line number="1378" hits="0"/>
-						<line number="1387" hits="0"/>
-						<line number="1388" hits="0"/>
+						<line number="1349" hits="0"/>
+						<line number="1351" hits="0"/>
+						<line number="1370" hits="1"/>
+						<line number="1371" hits="1"/>
+						<line number="1383" hits="0"/>
+						<line number="1389" hits="0"/>
+						<line number="1390" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1391,1392"/>
 						<line number="1391" hits="0"/>
-						<line number="1397" hits="0"/>
-						<line number="1398" hits="0"/>
+						<line number="1392" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1393,1399"/>
+						<line number="1393" hits="0"/>
+						<line number="1399" hits="0"/>
 						<line number="1400" hits="0"/>
+						<line number="1401" hits="0"/>
+						<line number="1404" hits="0"/>
+						<line number="1405" hits="0"/>
 						<line number="1407" hits="0"/>
-						<line number="1424" hits="1"/>
-						<line number="1425" hits="1"/>
-						<line number="1434" hits="0"/>
-						<line number="1443" hits="0"/>
-						<line number="1444" hits="0"/>
-						<line number="1446" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1447,1452"/>
-						<line number="1447" hits="0"/>
-						<line number="1452" hits="0"/>
-						<line number="1453" hits="0"/>
-						<line number="1455" hits="0"/>
+						<line number="1409" hits="0"/>
+						<line number="1420" hits="0"/>
+						<line number="1427" hits="0"/>
+						<line number="1434" hits="1"/>
+						<line number="1435" hits="1"/>
+						<line number="1446" hits="0"/>
+						<line number="1448" hits="0"/>
+						<line number="1458" hits="0"/>
+						<line number="1459" hits="0"/>
 						<line number="1461" hits="0"/>
-						<line number="1469" hits="1"/>
-						<line number="1470" hits="1"/>
-						<line number="1477" hits="0"/>
+						<line number="1462" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1463,1478"/>
+						<line number="1463" hits="0"/>
+						<line number="1478" hits="0"/>
+						<line number="1481" hits="1"/>
+						<line number="1482" hits="1"/>
+						<line number="1490" hits="0"/>
+						<line number="1492" hits="0"/>
+						<line number="1514" hits="1"/>
+						<line number="1517" hits="1"/>
+						<line number="1518" hits="1"/>
+						<line number="1519" hits="1"/>
+						<line number="1520" hits="1"/>
+						<line number="1521" hits="1"/>
+						<line number="1524" hits="1"/>
+						<line number="1527" hits="1"/>
+						<line number="1528" hits="1"/>
+						<line number="1529" hits="1"/>
+						<line number="1530" hits="1"/>
+						<line number="1531" hits="1"/>
+						<line number="1532" hits="1"/>
+						<line number="1533" hits="1"/>
+						<line number="1534" hits="1"/>
+						<line number="1535" hits="1"/>
+						<line number="1538" hits="1"/>
+						<line number="1541" hits="1"/>
+						<line number="1542" hits="1"/>
+						<line number="1545" hits="1"/>
+						<line number="1546" hits="1"/>
+						<line number="1557" hits="0"/>
+						<line number="1558" hits="0"/>
+						<line number="1559" hits="0"/>
+						<line number="1562" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1563,1569"/>
+						<line number="1563" hits="0"/>
+						<line number="1569" hits="0"/>
+						<line number="1570" hits="0"/>
+						<line number="1571" hits="0"/>
+						<line number="1572" hits="0"/>
+						<line number="1573" hits="0"/>
+						<line number="1574" hits="0"/>
+						<line number="1575" hits="0"/>
+						<line number="1581" hits="0"/>
+						<line number="1587" hits="0"/>
+						<line number="1588" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1589,1595"/>
+						<line number="1589" hits="0"/>
+						<line number="1595" hits="0"/>
+						<line number="1603" hits="0"/>
+						<line number="1604" hits="0"/>
+						<line number="1605" hits="0"/>
+						<line number="1607" hits="0"/>
+						<line number="1616" hits="0"/>
+						<line number="1629" hits="1"/>
+						<line number="1630" hits="1"/>
+						<line number="1640" hits="0"/>
+						<line number="1649" hits="0"/>
+						<line number="1650" hits="0"/>
+						<line number="1653" hits="0"/>
+						<line number="1659" hits="0"/>
+						<line number="1660" hits="0"/>
+						<line number="1662" hits="0"/>
+						<line number="1669" hits="0"/>
+						<line number="1688" hits="1"/>
+						<line number="1689" hits="1"/>
+						<line number="1698" hits="0"/>
+						<line number="1707" hits="0"/>
+						<line number="1708" hits="0"/>
+						<line number="1710" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1711,1716"/>
+						<line number="1711" hits="0"/>
+						<line number="1716" hits="0"/>
+						<line number="1717" hits="0"/>
+						<line number="1719" hits="0"/>
+						<line number="1725" hits="0"/>
+						<line number="1733" hits="1"/>
+						<line number="1736" hits="1"/>
+						<line number="1737" hits="1"/>
+						<line number="1738" hits="1"/>
+						<line number="1742" hits="1"/>
+						<line number="1746" hits="1"/>
+						<line number="1749" hits="1"/>
+						<line number="1752" hits="1"/>
+						<line number="1753" hits="1"/>
+						<line number="1754" hits="1"/>
+						<line number="1755" hits="1"/>
+						<line number="1756" hits="1"/>
+						<line number="1757" hits="1"/>
+						<line number="1758" hits="1"/>
+						<line number="1761" hits="1"/>
+						<line number="1764" hits="1"/>
+						<line number="1765" hits="1"/>
+						<line number="1768" hits="1"/>
+						<line number="1769" hits="1"/>
+						<line number="1781" hits="0"/>
+						<line number="1789" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1790,1796"/>
+						<line number="1790" hits="0"/>
+						<line number="1796" hits="0"/>
+						<line number="1802" hits="0"/>
+						<line number="1803" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1804,1810"/>
+						<line number="1804" hits="0"/>
+						<line number="1810" hits="0"/>
+						<line number="1817" hits="0"/>
+						<line number="1818" hits="0"/>
+						<line number="1819" hits="0"/>
+						<line number="1821" hits="0"/>
+						<line number="1829" hits="0"/>
+						<line number="1840" hits="1"/>
+						<line number="1841" hits="1"/>
+						<line number="1851" hits="0"/>
+						<line number="1860" hits="0"/>
+						<line number="1861" hits="0"/>
+						<line number="1864" hits="0"/>
+						<line number="1870" hits="0"/>
+						<line number="1871" hits="0"/>
+						<line number="1873" hits="0"/>
+						<line number="1880" hits="0"/>
+						<line number="1897" hits="1"/>
+						<line number="1898" hits="1"/>
+						<line number="1907" hits="0"/>
+						<line number="1916" hits="0"/>
+						<line number="1917" hits="0"/>
+						<line number="1919" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1920,1925"/>
+						<line number="1920" hits="0"/>
+						<line number="1925" hits="0"/>
+						<line number="1926" hits="0"/>
+						<line number="1928" hits="0"/>
+						<line number="1934" hits="0"/>
+						<line number="1942" hits="1"/>
+						<line number="1943" hits="1"/>
+						<line number="1952" hits="0"/>
+						<line number="1955" hits="0"/>
+						<line number="1956" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1957,1960"/>
+						<line number="1957" hits="0"/>
+						<line number="1960" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1961,1964"/>
+						<line number="1961" hits="0"/>
+						<line number="1964" hits="0"/>
+						<line number="1965" hits="0"/>
+						<line number="1971" hits="0"/>
+						<line number="1995" hits="1"/>
+						<line number="1998" hits="1"/>
+						<line number="1999" hits="1"/>
+						<line number="2000" hits="1"/>
+						<line number="2001" hits="1"/>
+						<line number="2004" hits="1"/>
+						<line number="2005" hits="1"/>
+						<line number="2014" hits="0"/>
+						<line number="2015" hits="0"/>
+						<line number="2016" hits="0"/>
+						<line number="2019" hits="0"/>
+						<line number="2020" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="2021,2024"/>
+						<line number="2021" hits="0"/>
+						<line number="2024" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="2025,2028"/>
+						<line number="2025" hits="0"/>
+						<line number="2028" hits="0"/>
+						<line number="2029" hits="0"/>
+						<line number="2035" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="2036,2042"/>
+						<line number="2036" hits="0"/>
+						<line number="2042" hits="0"/>
+						<line number="2043" hits="0"/>
+						<line number="2046" hits="0"/>
+						<line number="2047" hits="0"/>
+						<line number="2050" hits="0"/>
+						<line number="2058" hits="0"/>
+						<line number="2066" hits="0"/>
+						<line number="2082" hits="1"/>
+						<line number="2083" hits="1"/>
+						<line number="2090" hits="0"/>
 					</lines>
 				</class>
 				<class name="ws_ticket.py" filename="api/ws_ticket.py" complexity="0" line-rate="0.3846" branch-rate="0">
@@ -3566,7 +4263,7 @@
 				</class>
 			</classes>
 		</package>
-		<package name="api.v1" line-rate="0.4351" branch-rate="0.08099" complexity="0">
+		<package name="api.v1" line-rate="0.349" branch-rate="0" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="api/v1/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
@@ -4592,7 +5289,7 @@
 						<line number="260" hits="0"/>
 					</lines>
 				</class>
-				<class name="media_generation.py" filename="api/v1/media_generation.py" complexity="0" line-rate="0.2421" branch-rate="0.07787">
+				<class name="media_generation.py" filename="api/v1/media_generation.py" complexity="0" line-rate="0.195" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="1" hits="1"/>
@@ -4666,27 +5363,27 @@
 						<line number="107" hits="1"/>
 						<line number="108" hits="1"/>
 						<line number="111" hits="1"/>
-						<line number="116" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="117"/>
+						<line number="116" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="117,119"/>
 						<line number="117" hits="0"/>
-						<line number="119" hits="1"/>
-						<line number="120" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="121"/>
+						<line number="119" hits="0"/>
+						<line number="120" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="121,124"/>
 						<line number="121" hits="0"/>
-						<line number="124" hits="1"/>
-						<line number="125" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="126" hits="1"/>
-						<line number="127" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="128"/>
+						<line number="124" hits="0"/>
+						<line number="125" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="126,127"/>
+						<line number="126" hits="0"/>
+						<line number="127" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="128,134"/>
 						<line number="128" hits="0"/>
 						<line number="129" hits="0"/>
 						<line number="130" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="131,132"/>
 						<line number="131" hits="0"/>
 						<line number="132" hits="0"/>
-						<line number="134" hits="1"/>
-						<line number="141" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="142"/>
+						<line number="134" hits="0"/>
+						<line number="141" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="142,143"/>
 						<line number="142" hits="0"/>
-						<line number="143" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="144" hits="1"/>
-						<line number="145" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="147"/>
-						<line number="146" hits="1"/>
+						<line number="143" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="144,145"/>
+						<line number="144" hits="0"/>
+						<line number="145" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="146,147"/>
+						<line number="146" hits="0"/>
 						<line number="147" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="148,151"/>
 						<line number="148" hits="0"/>
 						<line number="151" hits="0"/>
@@ -4697,8 +5394,8 @@
 						<line number="157" hits="0"/>
 						<line number="159" hits="0"/>
 						<line number="162" hits="1"/>
-						<line number="164" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="167"/>
-						<line number="165" hits="1"/>
+						<line number="164" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="165,167"/>
+						<line number="165" hits="0"/>
 						<line number="167" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="168,173"/>
 						<line number="168" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="169,173"/>
 						<line number="169" hits="0"/>
@@ -4706,18 +5403,18 @@
 						<line number="171" hits="0"/>
 						<line number="173" hits="0"/>
 						<line number="176" hits="1"/>
-						<line number="181" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="182"/>
+						<line number="181" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="182,184"/>
 						<line number="182" hits="0"/>
-						<line number="184" hits="1"/>
-						<line number="185" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="186"/>
+						<line number="184" hits="0"/>
+						<line number="185" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="186,189"/>
 						<line number="186" hits="0"/>
-						<line number="189" hits="1"/>
-						<line number="190" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="191"/>
+						<line number="189" hits="0"/>
+						<line number="190" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="191,195"/>
 						<line number="191" hits="0"/>
 						<line number="192" hits="0"/>
 						<line number="193" hits="0"/>
 						<line number="194" hits="0"/>
-						<line number="195" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="196"/>
+						<line number="195" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="196,207"/>
 						<line number="196" hits="0"/>
 						<line number="197" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="198,202"/>
 						<line number="198" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="199,202"/>
@@ -4727,15 +5424,15 @@
 						<line number="202" hits="0"/>
 						<line number="203" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="204,207"/>
 						<line number="204" hits="0"/>
-						<line number="207" hits="1"/>
-						<line number="208" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="225"/>
-						<line number="209" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="220"/>
-						<line number="210" hits="1"/>
-						<line number="211" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="216"/>
-						<line number="212" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="209"/>
-						<line number="213" hits="1"/>
-						<line number="214" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="212"/>
-						<line number="215" hits="1"/>
+						<line number="207" hits="0"/>
+						<line number="208" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="209,225"/>
+						<line number="209" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="210,220"/>
+						<line number="210" hits="0"/>
+						<line number="211" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="212,216"/>
+						<line number="212" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="209,213"/>
+						<line number="213" hits="0"/>
+						<line number="214" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="212,215"/>
+						<line number="215" hits="0"/>
 						<line number="216" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="209,217"/>
 						<line number="217" hits="0"/>
 						<line number="218" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="209,219"/>
@@ -5788,7 +6485,7 @@
 						<line number="777" hits="0"/>
 					</lines>
 				</class>
-				<class name="task_handlers.py" filename="api/v1/task_handlers.py" complexity="0" line-rate="0.676" branch-rate="0.4821">
+				<class name="task_handlers.py" filename="api/v1/task_handlers.py" complexity="0" line-rate="0.144" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="14" hits="1"/>
@@ -5824,331 +6521,334 @@
 						<line number="97" hits="1"/>
 						<line number="100" hits="1"/>
 						<line number="101" hits="1"/>
-						<line number="109" hits="1"/>
-						<line number="110" hits="1"/>
-						<line number="111" hits="1"/>
-						<line number="112" hits="1"/>
-						<line number="113" hits="1"/>
-						<line number="115" hits="1"/>
-						<line number="116" hits="1"/>
-						<line number="119" hits="1"/>
-						<line number="120" hits="1"/>
-						<line number="121" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="122"/>
+						<line number="109" hits="0"/>
+						<line number="110" hits="0"/>
+						<line number="111" hits="0"/>
+						<line number="112" hits="0"/>
+						<line number="113" hits="0"/>
+						<line number="115" hits="0"/>
+						<line number="116" hits="0"/>
+						<line number="119" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="121" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="122,128"/>
 						<line number="122" hits="0"/>
 						<line number="123" hits="0"/>
-						<line number="128" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="133" hits="1"/>
-						<line number="139" hits="1"/>
-						<line number="141" hits="1"/>
-						<line number="142" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="143"/>
+						<line number="128" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="133,139"/>
+						<line number="133" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="141" hits="0"/>
+						<line number="142" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="143,158"/>
 						<line number="143" hits="0"/>
-						<line number="149" hits="1"/>
-						<line number="150" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="157"/>
-						<line number="151" hits="1"/>
-						<line number="152" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="153"/>
-						<line number="153" hits="0"/>
-						<line number="157" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="174"/>
-						<line number="158" hits="1"/>
-						<line number="159" hits="1"/>
-						<line number="161" hits="1"/>
-						<line number="168" hits="1"/>
-						<line number="169" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="174"/>
-						<line number="170" hits="1"/>
-						<line number="171" hits="1"/>
-						<line number="172" hits="1"/>
-						<line number="174" hits="1"/>
-						<line number="175" hits="1"/>
-						<line number="179" hits="1"/>
-						<line number="181" hits="1"/>
-						<line number="187" hits="1"/>
-						<line number="192" hits="1"/>
-						<line number="193" hits="1"/>
-						<line number="202" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="203" hits="1"/>
-						<line number="204" hits="1"/>
-						<line number="211" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="223"/>
-						<line number="212" hits="1"/>
-						<line number="223" hits="1"/>
-						<line number="231" hits="1"/>
-						<line number="237" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="238" hits="1"/>
-						<line number="243" hits="1"/>
-						<line number="249" hits="1"/>
-						<line number="258" hits="1"/>
-						<line number="264" hits="1"/>
-						<line number="265" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="266" hits="1"/>
-						<line number="272" hits="1"/>
-						<line number="281" hits="1"/>
-						<line number="287" hits="1"/>
-						<line number="288" hits="1"/>
-						<line number="290" hits="1"/>
-						<line number="303" hits="1"/>
-						<line number="314" hits="1"/>
-						<line number="315" hits="1"/>
-						<line number="326" hits="1"/>
-						<line number="327" hits="1"/>
-						<line number="328" hits="1"/>
-						<line number="329" hits="1"/>
-						<line number="330" hits="1"/>
-						<line number="332" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="152" hits="0"/>
+						<line number="158" hits="0"/>
+						<line number="159" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="160,166"/>
+						<line number="160" hits="0"/>
+						<line number="161" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="162,166"/>
+						<line number="162" hits="0"/>
+						<line number="166" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="167,183"/>
+						<line number="167" hits="0"/>
+						<line number="168" hits="0"/>
+						<line number="170" hits="0"/>
+						<line number="177" hits="0"/>
+						<line number="178" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="179,183"/>
+						<line number="179" hits="0"/>
+						<line number="180" hits="0"/>
+						<line number="181" hits="0"/>
+						<line number="183" hits="0"/>
+						<line number="184" hits="0"/>
+						<line number="188" hits="0"/>
+						<line number="190" hits="0"/>
+						<line number="199" hits="0"/>
+						<line number="205" hits="0"/>
+						<line number="210" hits="0"/>
+						<line number="211" hits="0"/>
+						<line number="220" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="221,255"/>
+						<line number="221" hits="0"/>
+						<line number="222" hits="0"/>
+						<line number="229" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="230,241"/>
+						<line number="230" hits="0"/>
+						<line number="241" hits="0"/>
+						<line number="249" hits="0"/>
+						<line number="255" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="256,282"/>
+						<line number="256" hits="0"/>
+						<line number="261" hits="0"/>
+						<line number="267" hits="0"/>
+						<line number="276" hits="0"/>
+						<line number="282" hits="0"/>
+						<line number="283" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="284,305"/>
+						<line number="284" hits="0"/>
+						<line number="290" hits="0"/>
+						<line number="299" hits="0"/>
+						<line number="305" hits="0"/>
+						<line number="306" hits="0"/>
+						<line number="308" hits="0"/>
+						<line number="321" hits="0"/>
+						<line number="332" hits="1"/>
 						<line number="333" hits="1"/>
-						<line number="338" hits="1"/>
-						<line number="339" hits="1"/>
-						<line number="340" hits="1"/>
-						<line number="343" hits="1"/>
-						<line number="344" hits="1"/>
-						<line number="345" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="346" hits="1"/>
-						<line number="347" hits="1"/>
-						<line number="353" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="358" hits="1"/>
-						<line number="359" hits="1"/>
-						<line number="365" hits="1"/>
-						<line number="366" hits="1"/>
-						<line number="368" hits="1"/>
-						<line number="371" hits="1"/>
-						<line number="374" hits="1"/>
-						<line number="377" hits="1"/>
-						<line number="378" hits="1"/>
-						<line number="381" hits="1"/>
-						<line number="393" hits="1"/>
-						<line number="394" hits="1"/>
-						<line number="402" hits="1"/>
-						<line number="403" hits="1"/>
-						<line number="409" hits="1"/>
-						<line number="418" hits="1"/>
-						<line number="428" hits="1"/>
-						<line number="430" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="457"/>
-						<line number="431" hits="1"/>
-						<line number="436" hits="1"/>
-						<line number="437" hits="1"/>
-						<line number="443" hits="1"/>
-						<line number="452" hits="1"/>
-						<line number="457" hits="0"/>
-						<line number="459" hits="1"/>
-						<line number="461" hits="1"/>
-						<line number="464" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="465" hits="1"/>
-						<line number="466" hits="1"/>
-						<line number="472" hits="1"/>
-						<line number="481" hits="1"/>
-						<line number="485" hits="1"/>
-						<line number="486" hits="1"/>
-						<line number="491" hits="0"/>
-						<line number="493" hits="0"/>
-						<line number="494" hits="0"/>
-						<line number="495" hits="0"/>
-						<line number="501" hits="0"/>
-						<line number="510" hits="0"/>
-						<line number="516" hits="1"/>
-						<line number="519" hits="1"/>
-						<line number="520" hits="1"/>
-						<line number="525" hits="0"/>
-						<line number="526" hits="0"/>
-						<line number="527" hits="0"/>
+						<line number="344" hits="0"/>
+						<line number="345" hits="0"/>
+						<line number="346" hits="0"/>
+						<line number="347" hits="0"/>
+						<line number="348" hits="0"/>
+						<line number="350" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="351,356"/>
+						<line number="351" hits="0"/>
+						<line number="356" hits="0"/>
+						<line number="357" hits="0"/>
+						<line number="358" hits="0"/>
+						<line number="361" hits="0"/>
+						<line number="362" hits="0"/>
+						<line number="363" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="364,371"/>
+						<line number="364" hits="0"/>
+						<line number="365" hits="0"/>
+						<line number="371" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="376,383"/>
+						<line number="376" hits="0"/>
+						<line number="377" hits="0"/>
+						<line number="383" hits="0"/>
+						<line number="384" hits="0"/>
+						<line number="386" hits="0"/>
+						<line number="389" hits="0"/>
+						<line number="392" hits="0"/>
+						<line number="395" hits="0"/>
+						<line number="396" hits="0"/>
+						<line number="399" hits="0"/>
+						<line number="411" hits="0"/>
+						<line number="412" hits="0"/>
+						<line number="420" hits="0"/>
+						<line number="421" hits="0"/>
+						<line number="427" hits="0"/>
+						<line number="436" hits="0"/>
+						<line number="446" hits="0"/>
+						<line number="448" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="449,475"/>
+						<line number="449" hits="0"/>
+						<line number="454" hits="0"/>
+						<line number="455" hits="0"/>
+						<line number="461" hits="0"/>
+						<line number="470" hits="0"/>
+						<line number="475" hits="0"/>
+						<line number="477" hits="0"/>
+						<line number="479" hits="0"/>
+						<line number="482" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="483,503"/>
+						<line number="483" hits="0"/>
+						<line number="484" hits="0"/>
+						<line number="490" hits="0"/>
+						<line number="499" hits="0"/>
+						<line number="503" hits="0"/>
+						<line number="512" hits="0"/>
+						<line number="513" hits="0"/>
+						<line number="518" hits="0"/>
+						<line number="520" hits="0"/>
+						<line number="521" hits="0"/>
+						<line number="522" hits="0"/>
 						<line number="528" hits="0"/>
-						<line number="530" hits="0"/>
-						<line number="531" hits="0"/>
-						<line number="533" hits="0"/>
-						<line number="534" hits="0"/>
-						<line number="536" hits="0"/>
 						<line number="537" hits="0"/>
-						<line number="545" hits="0"/>
-						<line number="546" hits="0"/>
-						<line number="547" hits="0"/>
-						<line number="556" hits="0"/>
+						<line number="543" hits="0"/>
+						<line number="546" hits="1"/>
+						<line number="547" hits="1"/>
+						<line number="552" hits="0"/>
+						<line number="553" hits="0"/>
+						<line number="554" hits="0"/>
+						<line number="555" hits="0"/>
 						<line number="557" hits="0"/>
-						<line number="563" hits="1"/>
-						<line number="564" hits="1"/>
-						<line number="570" hits="1"/>
-						<line number="571" hits="1"/>
-						<line number="573" hits="1"/>
-						<line number="574" hits="1"/>
-						<line number="576" hits="1"/>
-						<line number="577" hits="1"/>
-						<line number="578" hits="0"/>
-						<line number="579" hits="0"/>
-						<line number="580" hits="0"/>
-						<line number="586" hits="1"/>
-						<line number="587" hits="1"/>
-						<line number="593" hits="1"/>
-						<line number="594" hits="1"/>
-						<line number="596" hits="1"/>
-						<line number="597" hits="1"/>
-						<line number="599" hits="1"/>
-						<line number="600" hits="1"/>
+						<line number="558" hits="0"/>
+						<line number="560" hits="0"/>
+						<line number="561" hits="0"/>
+						<line number="563" hits="0"/>
+						<line number="564" hits="0"/>
+						<line number="572" hits="0"/>
+						<line number="573" hits="0"/>
+						<line number="574" hits="0"/>
+						<line number="583" hits="0"/>
+						<line number="584" hits="0"/>
+						<line number="590" hits="1"/>
+						<line number="591" hits="1"/>
+						<line number="597" hits="0"/>
+						<line number="598" hits="0"/>
+						<line number="600" hits="0"/>
 						<line number="601" hits="0"/>
-						<line number="602" hits="0"/>
 						<line number="603" hits="0"/>
-						<line number="609" hits="1"/>
-						<line number="610" hits="1"/>
-						<line number="617" hits="1"/>
-						<line number="619" hits="1"/>
-						<line number="620" hits="1"/>
-						<line number="625" hits="1"/>
-						<line number="626" hits="1"/>
-						<line number="627" hits="1"/>
-						<line number="635" hits="0"/>
-						<line number="636" hits="0"/>
-						<line number="637" hits="0"/>
-						<line number="643" hits="1"/>
-						<line number="644" hits="1"/>
-						<line number="650" hits="1"/>
-						<line number="651" hits="1"/>
-						<line number="653" hits="1"/>
-						<line number="654" hits="1"/>
-						<line number="656" hits="1"/>
-						<line number="657" hits="1"/>
-						<line number="658" hits="0"/>
-						<line number="659" hits="0"/>
-						<line number="660" hits="0"/>
-						<line number="666" hits="1"/>
-						<line number="667" hits="1"/>
-						<line number="673" hits="1"/>
-						<line number="675" hits="1"/>
-						<line number="676" hits="1"/>
-						<line number="678" hits="1"/>
-						<line number="679" hits="0"/>
-						<line number="683" hits="1"/>
-						<line number="684" hits="1"/>
-						<line number="685" hits="1"/>
-						<line number="691" hits="1"/>
-						<line number="692" hits="1"/>
-						<line number="698" hits="1"/>
-						<line number="700" hits="1"/>
-						<line number="701" hits="1"/>
-						<line number="702" hits="1"/>
-						<line number="705" hits="1"/>
+						<line number="604" hits="0"/>
+						<line number="605" hits="0"/>
+						<line number="606" hits="0"/>
+						<line number="607" hits="0"/>
+						<line number="613" hits="1"/>
+						<line number="614" hits="1"/>
+						<line number="620" hits="0"/>
+						<line number="621" hits="0"/>
+						<line number="623" hits="0"/>
+						<line number="624" hits="0"/>
+						<line number="626" hits="0"/>
+						<line number="627" hits="0"/>
+						<line number="628" hits="0"/>
+						<line number="629" hits="0"/>
+						<line number="630" hits="0"/>
+						<line number="636" hits="1"/>
+						<line number="637" hits="1"/>
+						<line number="644" hits="0"/>
+						<line number="646" hits="0"/>
+						<line number="647" hits="0"/>
+						<line number="652" hits="0"/>
+						<line number="653" hits="0"/>
+						<line number="654" hits="0"/>
+						<line number="662" hits="0"/>
+						<line number="663" hits="0"/>
+						<line number="664" hits="0"/>
+						<line number="670" hits="1"/>
+						<line number="671" hits="1"/>
+						<line number="677" hits="0"/>
+						<line number="678" hits="0"/>
+						<line number="680" hits="0"/>
+						<line number="681" hits="0"/>
+						<line number="683" hits="0"/>
+						<line number="684" hits="0"/>
+						<line number="685" hits="0"/>
+						<line number="686" hits="0"/>
+						<line number="687" hits="0"/>
+						<line number="693" hits="1"/>
+						<line number="694" hits="1"/>
+						<line number="700" hits="0"/>
+						<line number="702" hits="0"/>
+						<line number="703" hits="0"/>
+						<line number="705" hits="0"/>
 						<line number="706" hits="0"/>
-						<line number="710" hits="1"/>
-						<line number="711" hits="1"/>
-						<line number="712" hits="1"/>
+						<line number="710" hits="0"/>
+						<line number="711" hits="0"/>
+						<line number="712" hits="0"/>
 						<line number="718" hits="1"/>
 						<line number="719" hits="1"/>
-						<line number="725" hits="1"/>
-						<line number="727" hits="1"/>
-						<line number="728" hits="1"/>
-						<line number="730" hits="1"/>
-						<line number="731" hits="1"/>
+						<line number="725" hits="0"/>
+						<line number="727" hits="0"/>
+						<line number="728" hits="0"/>
+						<line number="729" hits="0"/>
 						<line number="732" hits="0"/>
 						<line number="733" hits="0"/>
-						<line number="734" hits="0"/>
-						<line number="740" hits="1"/>
-						<line number="741" hits="1"/>
-						<line number="747" hits="1"/>
-						<line number="749" hits="1"/>
-						<line number="750" hits="1"/>
-						<line number="752" hits="1"/>
-						<line number="753" hits="1"/>
+						<line number="737" hits="0"/>
+						<line number="738" hits="0"/>
+						<line number="739" hits="0"/>
+						<line number="745" hits="1"/>
+						<line number="746" hits="1"/>
+						<line number="752" hits="0"/>
 						<line number="754" hits="0"/>
 						<line number="755" hits="0"/>
-						<line number="756" hits="0"/>
-						<line number="765" hits="1"/>
-						<line number="766" hits="1"/>
-						<line number="773" hits="1"/>
-						<line number="775" hits="1"/>
-						<line number="776" hits="1"/>
-						<line number="777" hits="1"/>
-						<line number="779" hits="1"/>
-						<line number="780" hits="1"/>
-						<line number="783" hits="1"/>
-						<line number="794" hits="0"/>
-						<line number="795" hits="0"/>
-						<line number="797" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="798,804"/>
-						<line number="798" hits="0"/>
-						<line number="804" hits="1"/>
-						<line number="808" hits="0"/>
+						<line number="757" hits="0"/>
+						<line number="758" hits="0"/>
+						<line number="759" hits="0"/>
+						<line number="760" hits="0"/>
+						<line number="761" hits="0"/>
+						<line number="767" hits="1"/>
+						<line number="768" hits="1"/>
+						<line number="774" hits="0"/>
+						<line number="776" hits="0"/>
+						<line number="777" hits="0"/>
+						<line number="779" hits="0"/>
+						<line number="780" hits="0"/>
+						<line number="781" hits="0"/>
+						<line number="782" hits="0"/>
+						<line number="783" hits="0"/>
+						<line number="792" hits="1"/>
+						<line number="793" hits="1"/>
+						<line number="800" hits="0"/>
+						<line number="802" hits="0"/>
+						<line number="803" hits="0"/>
+						<line number="804" hits="0"/>
+						<line number="806" hits="0"/>
+						<line number="807" hits="0"/>
 						<line number="810" hits="0"/>
-						<line number="811" hits="0"/>
-						<line number="817" hits="1"/>
-						<line number="829" hits="1"/>
-						<line number="830" hits="1"/>
-						<line number="831" hits="1"/>
-						<line number="833" hits="1"/>
-						<line number="834" hits="1"/>
-						<line number="837" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="838"/>
+						<line number="821" hits="0"/>
+						<line number="822" hits="0"/>
+						<line number="824" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="825,831"/>
+						<line number="825" hits="0"/>
+						<line number="831" hits="0"/>
+						<line number="835" hits="0"/>
+						<line number="837" hits="0"/>
 						<line number="838" hits="0"/>
-						<line number="839" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="837,840"/>
-						<line number="840" hits="0"/>
-						<line number="843" hits="0"/>
-						<line number="844" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="846,850"/>
-						<line number="846" hits="0"/>
-						<line number="847" hits="0"/>
-						<line number="848" hits="0"/>
-						<line number="850" hits="0"/>
-						<line number="851" hits="0"/>
-						<line number="852" hits="0"/>
-						<line number="853" hits="0"/>
-						<line number="854" hits="0"/>
+						<line number="844" hits="1"/>
 						<line number="856" hits="0"/>
-						<line number="859" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="860,865"/>
+						<line number="857" hits="0"/>
+						<line number="858" hits="0"/>
 						<line number="860" hits="0"/>
 						<line number="861" hits="0"/>
-						<line number="862" hits="0"/>
+						<line number="864" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="865,921"/>
 						<line number="865" hits="0"/>
-						<line number="866" hits="0"/>
-						<line number="867" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="868,875"/>
-						<line number="868" hits="0"/>
-						<line number="869" hits="0"/>
+						<line number="866" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="864,867"/>
+						<line number="867" hits="0"/>
 						<line number="870" hits="0"/>
-						<line number="871" hits="0"/>
-						<line number="872" hits="0"/>
+						<line number="871" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="873,877"/>
 						<line number="873" hits="0"/>
+						<line number="874" hits="0"/>
 						<line number="875" hits="0"/>
-						<line number="877" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="878,885"/>
+						<line number="877" hits="0"/>
 						<line number="878" hits="0"/>
 						<line number="879" hits="0"/>
+						<line number="880" hits="0"/>
+						<line number="881" hits="0"/>
 						<line number="883" hits="0"/>
-						<line number="884" hits="0"/>
-						<line number="885" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="839,886"/>
-						<line number="886" hits="0"/>
+						<line number="886" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="887,892"/>
 						<line number="887" hits="0"/>
-						<line number="891" hits="0"/>
+						<line number="888" hits="0"/>
+						<line number="889" hits="0"/>
 						<line number="892" hits="0"/>
-						<line number="894" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="895" hits="1"/>
-						<line number="897" hits="1"/>
-						<line number="900" hits="1"/>
-						<line number="901" hits="1"/>
-						<line number="907" hits="1"/>
-						<line number="909" hits="1"/>
-						<line number="910" hits="1"/>
-						<line number="911" hits="1"/>
-						<line number="912" hits="1"/>
-						<line number="914" hits="1"/>
-						<line number="917" hits="1"/>
-						<line number="919" hits="1"/>
-						<line number="920" hits="1"/>
-						<line number="921" hits="0"/>
+						<line number="893" hits="0"/>
+						<line number="894" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="895,902"/>
+						<line number="895" hits="0"/>
+						<line number="896" hits="0"/>
+						<line number="897" hits="0"/>
+						<line number="898" hits="0"/>
+						<line number="899" hits="0"/>
+						<line number="900" hits="0"/>
+						<line number="902" hits="0"/>
+						<line number="904" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="905,912"/>
+						<line number="905" hits="0"/>
+						<line number="906" hits="0"/>
+						<line number="910" hits="0"/>
+						<line number="911" hits="0"/>
+						<line number="912" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="866,913"/>
+						<line number="913" hits="0"/>
+						<line number="914" hits="0"/>
+						<line number="918" hits="0"/>
+						<line number="919" hits="0"/>
+						<line number="921" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="860,922"/>
 						<line number="922" hits="0"/>
-						<line number="923" hits="0"/>
+						<line number="924" hits="0"/>
+						<line number="927" hits="1"/>
 						<line number="928" hits="1"/>
-						<line number="929" hits="1"/>
-						<line number="932" hits="1"/>
-						<line number="933" hits="1"/>
-						<line number="943" hits="1"/>
-						<line number="945" hits="1"/>
-						<line number="946" hits="1"/>
-						<line number="947" hits="1"/>
-						<line number="949" hits="1"/>
-						<line number="950" hits="1"/>
-						<line number="953" hits="1"/>
-						<line number="965" hits="0"/>
-						<line number="967" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="968,985"/>
-						<line number="968" hits="0"/>
-						<line number="969" hits="0"/>
+						<line number="934" hits="0"/>
+						<line number="936" hits="0"/>
+						<line number="937" hits="0"/>
+						<line number="938" hits="0"/>
+						<line number="939" hits="0"/>
+						<line number="941" hits="0"/>
+						<line number="944" hits="0"/>
+						<line number="946" hits="0"/>
+						<line number="947" hits="0"/>
+						<line number="948" hits="0"/>
+						<line number="949" hits="0"/>
+						<line number="950" hits="0"/>
+						<line number="955" hits="0"/>
+						<line number="956" hits="0"/>
+						<line number="959" hits="1"/>
+						<line number="960" hits="1"/>
+						<line number="970" hits="0"/>
+						<line number="972" hits="0"/>
 						<line number="973" hits="0"/>
-						<line number="981" hits="0"/>
-						<line number="982" hits="0"/>
-						<line number="983" hits="0"/>
-						<line number="985" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="986,989"/>
-						<line number="986" hits="0"/>
-						<line number="987" hits="0"/>
-						<line number="989" hits="1"/>
-						<line number="993" hits="0"/>
+						<line number="974" hits="0"/>
+						<line number="976" hits="0"/>
+						<line number="977" hits="0"/>
+						<line number="980" hits="0"/>
+						<line number="992" hits="0"/>
+						<line number="994" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="995,1012"/>
 						<line number="995" hits="0"/>
 						<line number="996" hits="0"/>
+						<line number="1000" hits="0"/>
+						<line number="1008" hits="0"/>
+						<line number="1009" hits="0"/>
+						<line number="1010" hits="0"/>
+						<line number="1012" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1013,1016"/>
+						<line number="1013" hits="0"/>
+						<line number="1014" hits="0"/>
+						<line number="1016" hits="0"/>
+						<line number="1020" hits="0"/>
+						<line number="1022" hits="0"/>
+						<line number="1023" hits="0"/>
 					</lines>
 				</class>
 				<class name="webhooks.py" filename="api/v1/webhooks.py" complexity="0" line-rate="0.5" branch-rate="0">
@@ -6318,7 +7018,206 @@
 				</class>
 			</classes>
 		</package>
-		<package name="core" line-rate="0.2079" branch-rate="0.01989" complexity="0">
+		<package name="conversion" line-rate="0" branch-rate="0" complexity="0">
+			<classes>
+				<class name="__init__.py" filename="conversion/__init__.py" complexity="0" line-rate="0" branch-rate="1">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="6" hits="0"/>
+					</lines>
+				</class>
+				<class name="adapter_registry.py" filename="conversion/adapter_registry.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="7" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="20" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="23" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="24,26"/>
+						<line number="24" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="23,25"/>
+						<line number="25" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="29" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="34" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="35,37"/>
+						<line number="35" hits="0"/>
+						<line number="37" hits="0"/>
+					</lines>
+				</class>
+				<class name="analyzer.py" filename="conversion/analyzer.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="17" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="20" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="25" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="27" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="29" hits="0"/>
+						<line number="30" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="36" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="129" hits="0"/>
+						<line number="131" hits="0"/>
+						<line number="132" hits="0"/>
+						<line number="134" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="136" hits="0"/>
+						<line number="138" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="139,169"/>
+						<line number="139" hits="0"/>
+						<line number="140" hits="0"/>
+						<line number="142" hits="0"/>
+						<line number="152" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="163" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="164,165"/>
+						<line number="164" hits="0"/>
+						<line number="165" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="138,166"/>
+						<line number="166" hits="0"/>
+						<line number="169" hits="0"/>
+						<line number="170" hits="0"/>
+						<line number="173" hits="0"/>
+						<line number="176" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="177,179"/>
+						<line number="177" hits="0"/>
+						<line number="178" hits="0"/>
+						<line number="179" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="180,183"/>
+						<line number="180" hits="0"/>
+						<line number="181" hits="0"/>
+						<line number="183" hits="0"/>
+						<line number="184" hits="0"/>
+						<line number="186" hits="0"/>
+						<line number="189" hits="0"/>
+						<line number="193" hits="0"/>
+						<line number="204" hits="0"/>
+						<line number="206" hits="0"/>
+						<line number="209" hits="0"/>
+						<line number="212" hits="0"/>
+						<line number="215" hits="0"/>
+						<line number="216" hits="0"/>
+						<line number="218" hits="0"/>
+						<line number="220" hits="0"/>
+						<line number="224" hits="0"/>
+						<line number="226" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="227,232"/>
+						<line number="227" hits="0"/>
+						<line number="228" hits="0"/>
+						<line number="232" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="233,238"/>
+						<line number="233" hits="0"/>
+						<line number="234" hits="0"/>
+						<line number="238" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="239,243"/>
+						<line number="239" hits="0"/>
+						<line number="243" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="244,246"/>
+						<line number="244" hits="0"/>
+						<line number="246" hits="0"/>
+					</lines>
+				</class>
+			</classes>
+		</package>
+		<package name="conversion.adapters" line-rate="0" branch-rate="0" complexity="0">
+			<classes>
+				<class name="__init__.py" filename="conversion/adapters/__init__.py" complexity="0" line-rate="0" branch-rate="1">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+					</lines>
+				</class>
+				<class name="approval_gate_adapter.py" filename="conversion/adapters/approval_gate_adapter.py" complexity="0" line-rate="0" branch-rate="1">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="22" hits="0"/>
+						<line number="24" hits="0"/>
+					</lines>
+				</class>
+				<class name="base.py" filename="conversion/adapters/base.py" complexity="0" line-rate="0" branch-rate="1">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="7" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="18" hits="0"/>
+					</lines>
+				</class>
+				<class name="file_upload_adapter.py" filename="conversion/adapters/file_upload_adapter.py" complexity="0" line-rate="0" branch-rate="1">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="22" hits="0"/>
+						<line number="24" hits="0"/>
+					</lines>
+				</class>
+				<class name="form_input_adapter.py" filename="conversion/adapters/form_input_adapter.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="22" hits="0"/>
+						<line number="23" hits="0"/>
+						<line number="25" hits="0"/>
+						<line number="26" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="27,38"/>
+						<line number="27" hits="0"/>
+						<line number="36" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="56" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="57,58"/>
+						<line number="57" hits="0"/>
+						<line number="58" hits="0"/>
+						<line number="60" hits="0"/>
+					</lines>
+				</class>
+			</classes>
+		</package>
+		<package name="core" line-rate="0.1938" branch-rate="0.008523" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="core/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
@@ -7023,10 +7922,10 @@
 						<line number="13" hits="1"/>
 						<line number="16" hits="1"/>
 						<line number="23" hits="1"/>
-						<line number="75" hits="1"/>
-						<line number="115" hits="1"/>
-						<line number="117" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="118"/>
-						<line number="118" hits="0"/>
+						<line number="87" hits="1"/>
+						<line number="139" hits="1"/>
+						<line number="141" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="142"/>
+						<line number="142" hits="0"/>
 					</lines>
 				</class>
 				<class name="checkpointer.py" filename="core/checkpointer.py" complexity="0" line-rate="0.4583" branch-rate="0">
@@ -7240,7 +8139,7 @@
 						<line number="123" hits="0"/>
 					</lines>
 				</class>
-				<class name="csrf.py" filename="core/csrf.py" complexity="0" line-rate="0.3762" branch-rate="0.04545">
+				<class name="csrf.py" filename="core/csrf.py" complexity="0" line-rate="0.3564" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="6" hits="1"/>
@@ -7310,8 +8209,8 @@
 						<line number="210" hits="1"/>
 						<line number="227" hits="1"/>
 						<line number="235" hits="1"/>
-						<line number="247" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="251"/>
-						<line number="248" hits="1"/>
+						<line number="247" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="248,251"/>
+						<line number="248" hits="0"/>
 						<line number="251" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="252,264"/>
 						<line number="252" hits="0"/>
 						<line number="255" hits="0"/>
@@ -7346,7 +8245,7 @@
 						<line number="367" hits="0"/>
 					</lines>
 				</class>
-				<class name="database.py" filename="core/database.py" complexity="0" line-rate="0.5676" branch-rate="0.5">
+				<class name="database.py" filename="core/database.py" complexity="0" line-rate="0.5405" branch-rate="0.5">
 					<methods/>
 					<lines>
 						<line number="6" hits="1"/>
@@ -7377,7 +8276,7 @@
 						<line number="68" hits="0"/>
 						<line number="70" hits="0"/>
 						<line number="73" hits="1"/>
-						<line number="78" hits="1"/>
+						<line number="78" hits="0"/>
 						<line number="81" hits="1"/>
 						<line number="84" hits="0"/>
 						<line number="97" hits="0"/>
@@ -8294,38 +9193,38 @@
 						<line number="16" hits="1"/>
 						<line number="19" hits="1"/>
 						<line number="22" hits="1"/>
-						<line number="30" hits="0"/>
-						<line number="32" hits="0"/>
+						<line number="31" hits="0"/>
 						<line number="33" hits="0"/>
-						<line number="36" hits="0"/>
-						<line number="38" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="39,48"/>
-						<line number="39" hits="0"/>
-						<line number="40" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="38,41"/>
-						<line number="41" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="42,46"/>
-						<line number="42" hits="0"/>
-						<line number="43" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="38,44"/>
-						<line number="44" hits="0"/>
-						<line number="46" hits="0"/>
-						<line number="48" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="49,54"/>
-						<line number="49" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="37" hits="0"/>
+						<line number="39" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="40,49"/>
+						<line number="40" hits="0"/>
+						<line number="41" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="39,42"/>
+						<line number="42" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="43,47"/>
+						<line number="43" hits="0"/>
+						<line number="44" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="39,45"/>
+						<line number="45" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="49" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="50,55"/>
 						<line number="50" hits="0"/>
 						<line number="51" hits="0"/>
-						<line number="54" hits="0"/>
-						<line number="63" hits="0"/>
-						<line number="68" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="69,74"/>
-						<line number="69" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="68,70"/>
-						<line number="70" hits="0"/>
-						<line number="71" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="68,72"/>
-						<line number="72" hits="0"/>
-						<line number="74" hits="0"/>
-						<line number="77" hits="1"/>
-						<line number="86" hits="0"/>
-						<line number="88" hits="0"/>
-						<line number="92" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="93,94"/>
+						<line number="52" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="68" hits="0"/>
+						<line number="75" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="76,81"/>
+						<line number="76" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="75,77"/>
+						<line number="77" hits="0"/>
+						<line number="78" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="75,79"/>
+						<line number="79" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="84" hits="1"/>
 						<line number="93" hits="0"/>
-						<line number="94" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="95,97"/>
 						<line number="95" hits="0"/>
-						<line number="97" hits="0"/>
+						<line number="99" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="100,101"/>
+						<line number="100" hits="0"/>
+						<line number="101" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="102,104"/>
+						<line number="102" hits="0"/>
+						<line number="104" hits="0"/>
 					</lines>
 				</class>
 				<class name="openapi.py" filename="core/openapi.py" complexity="0" line-rate="0.3529" branch-rate="0">
@@ -8755,7 +9654,7 @@
 						<line number="87" hits="0"/>
 					</lines>
 				</class>
-				<class name="request_logging.py" filename="core/request_logging.py" complexity="0" line-rate="0.7333" branch-rate="0.5">
+				<class name="request_logging.py" filename="core/request_logging.py" complexity="0" line-rate="0.3333" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="6" hits="1"/>
@@ -8769,26 +9668,26 @@
 						<line number="15" hits="1"/>
 						<line number="18" hits="1"/>
 						<line number="31" hits="1"/>
-						<line number="32" hits="1"/>
+						<line number="32" hits="0"/>
 						<line number="34" hits="1"/>
-						<line number="38" hits="1"/>
-						<line number="41" hits="1"/>
-						<line number="42" hits="1"/>
-						<line number="45" hits="1"/>
-						<line number="48" hits="1"/>
-						<line number="49" hits="1"/>
-						<line number="50" hits="1"/>
-						<line number="51" hits="1"/>
-						<line number="52" hits="1"/>
-						<line number="55" hits="1"/>
-						<line number="58" hits="1"/>
-						<line number="61" hits="1"/>
-						<line number="73" hits="1"/>
-						<line number="74" hits="1"/>
-						<line number="77" hits="1"/>
-						<line number="80" hits="1"/>
-						<line number="91" hits="1"/>
-						<line number="93" hits="1"/>
+						<line number="38" hits="0"/>
+						<line number="41" hits="0"/>
+						<line number="42" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="58" hits="0"/>
+						<line number="61" hits="0"/>
+						<line number="73" hits="0"/>
+						<line number="74" hits="0"/>
+						<line number="77" hits="0"/>
+						<line number="80" hits="0"/>
+						<line number="91" hits="0"/>
+						<line number="93" hits="0"/>
 						<line number="95" hits="0"/>
 						<line number="97" hits="0"/>
 						<line number="100" hits="0"/>
@@ -8796,12 +9695,12 @@
 						<line number="115" hits="1"/>
 						<line number="128" hits="1"/>
 						<line number="138" hits="1"/>
-						<line number="139" hits="1"/>
+						<line number="139" hits="0"/>
 						<line number="141" hits="1"/>
-						<line number="144" hits="1"/>
-						<line number="147" hits="1"/>
-						<line number="152" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="156"/>
-						<line number="153" hits="1"/>
+						<line number="144" hits="0"/>
+						<line number="147" hits="0"/>
+						<line number="152" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="153,156"/>
+						<line number="153" hits="0"/>
 						<line number="156" hits="0"/>
 						<line number="157" hits="0"/>
 						<line number="158" hits="0"/>
@@ -8925,7 +9824,7 @@
 						<line number="315" hits="0"/>
 					</lines>
 				</class>
-				<class name="security.py" filename="core/security.py" complexity="0" line-rate="0.3657" branch-rate="0.1034">
+				<class name="security.py" filename="core/security.py" complexity="0" line-rate="0.2743" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="13" hits="1"/>
@@ -9012,29 +9911,29 @@
 						<line number="253" hits="1"/>
 						<line number="254" hits="1"/>
 						<line number="256" hits="1"/>
-						<line number="273" hits="1"/>
-						<line number="275" hits="1"/>
-						<line number="278" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="279"/>
+						<line number="273" hits="0"/>
+						<line number="275" hits="0"/>
+						<line number="278" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="279,280"/>
 						<line number="279" hits="0"/>
-						<line number="280" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="281"/>
+						<line number="280" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="281,282"/>
 						<line number="281" hits="0"/>
-						<line number="282" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="283"/>
+						<line number="282" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="283,285"/>
 						<line number="283" hits="0"/>
-						<line number="285" hits="1"/>
-						<line number="288" hits="1"/>
-						<line number="291" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="292" hits="1"/>
-						<line number="295" hits="1"/>
-						<line number="300" hits="1"/>
-						<line number="303" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="305"/>
+						<line number="285" hits="0"/>
+						<line number="288" hits="0"/>
+						<line number="291" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="292,295"/>
+						<line number="292" hits="0"/>
+						<line number="295" hits="0"/>
+						<line number="300" hits="0"/>
+						<line number="303" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="305,327"/>
 						<line number="305" hits="0"/>
 						<line number="306" hits="0"/>
 						<line number="308" hits="0"/>
 						<line number="318" hits="0"/>
-						<line number="327" hits="1"/>
-						<line number="330" hits="1"/>
-						<line number="331" hits="1"/>
-						<line number="333" hits="1"/>
+						<line number="327" hits="0"/>
+						<line number="330" hits="0"/>
+						<line number="331" hits="0"/>
+						<line number="333" hits="0"/>
 						<line number="341" hits="1"/>
 						<line number="343" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,344"/>
 						<line number="344" hits="0"/>
@@ -12505,7 +13404,7 @@
 				</class>
 			</classes>
 		</package>
-		<package name="mcp" line-rate="0.1322" branch-rate="0" complexity="0">
+		<package name="mcp" line-rate="0.113" branch-rate="0" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="mcp/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
@@ -12605,100 +13504,338 @@
 						<line number="203" hits="0"/>
 						<line number="211" hits="0"/>
 						<line number="212" hits="0"/>
-						<line number="220" hits="0"/>
-						<line number="227" hits="0"/>
+						<line number="221" hits="0"/>
 						<line number="228" hits="0"/>
 						<line number="229" hits="0"/>
 						<line number="230" hits="0"/>
 						<line number="231" hits="0"/>
 						<line number="232" hits="0"/>
 						<line number="233" hits="0"/>
-						<line number="236" hits="1"/>
-						<line number="252" hits="0"/>
-						<line number="254" hits="0"/>
-						<line number="255" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="256,258"/>
-						<line number="256" hits="0"/>
-						<line number="258" hits="0"/>
+						<line number="234" hits="0"/>
+						<line number="237" hits="1"/>
+						<line number="253" hits="0"/>
+						<line number="255" hits="0"/>
+						<line number="256" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="257,259"/>
+						<line number="257" hits="0"/>
 						<line number="259" hits="0"/>
-						<line number="261" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="262,264"/>
-						<line number="262" hits="0"/>
-						<line number="264" hits="0"/>
-						<line number="267" hits="0"/>
-						<line number="268" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="269,271"/>
-						<line number="269" hits="0"/>
-						<line number="271" hits="0"/>
-						<line number="276" hits="0"/>
+						<line number="260" hits="0"/>
+						<line number="262" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="263,265"/>
+						<line number="263" hits="0"/>
+						<line number="265" hits="0"/>
+						<line number="268" hits="0"/>
+						<line number="269" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="270,272"/>
+						<line number="270" hits="0"/>
+						<line number="272" hits="0"/>
 						<line number="277" hits="0"/>
 						<line number="278" hits="0"/>
 						<line number="279" hits="0"/>
-						<line number="282" hits="0"/>
+						<line number="280" hits="0"/>
 						<line number="283" hits="0"/>
-						<line number="285" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="286,294"/>
-						<line number="286" hits="0"/>
-						<line number="294" hits="0"/>
+						<line number="284" hits="0"/>
+						<line number="286" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="287,295"/>
+						<line number="287" hits="0"/>
 						<line number="295" hits="0"/>
-						<line number="303" hits="0"/>
-						<line number="311" hits="0"/>
-						<line number="312" hits="0"/>
+						<line number="296" hits="0"/>
+						<line number="305" hits="0"/>
 						<line number="313" hits="0"/>
 						<line number="314" hits="0"/>
 						<line number="315" hits="0"/>
 						<line number="316" hits="0"/>
 						<line number="317" hits="0"/>
-						<line number="320" hits="1"/>
-						<line number="332" hits="0"/>
-						<line number="334" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="335,337"/>
-						<line number="335" hits="0"/>
+						<line number="318" hits="0"/>
+						<line number="319" hits="0"/>
+						<line number="322" hits="1"/>
+						<line number="334" hits="0"/>
+						<line number="336" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="337,339"/>
 						<line number="337" hits="0"/>
-						<line number="338" hits="0"/>
-						<line number="340" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="341,343"/>
-						<line number="341" hits="0"/>
+						<line number="339" hits="0"/>
+						<line number="340" hits="0"/>
+						<line number="342" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="343,345"/>
 						<line number="343" hits="0"/>
 						<line number="345" hits="0"/>
-						<line number="346" hits="0"/>
+						<line number="347" hits="0"/>
 						<line number="348" hits="0"/>
-						<line number="355" hits="0"/>
-						<line number="360" hits="0"/>
-						<line number="361" hits="0"/>
+						<line number="350" hits="0"/>
+						<line number="357" hits="0"/>
 						<line number="362" hits="0"/>
 						<line number="363" hits="0"/>
 						<line number="364" hits="0"/>
-						<line number="367" hits="1"/>
-						<line number="379" hits="0"/>
+						<line number="365" hits="0"/>
+						<line number="366" hits="0"/>
+						<line number="369" hits="1"/>
 						<line number="381" hits="0"/>
 						<line number="383" hits="0"/>
-						<line number="384" hits="0"/>
-						<line number="386" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="387,389"/>
-						<line number="387" hits="0"/>
+						<line number="385" hits="0"/>
+						<line number="386" hits="0"/>
+						<line number="388" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="389,391"/>
 						<line number="389" hits="0"/>
 						<line number="391" hits="0"/>
-						<line number="396" hits="0"/>
+						<line number="393" hits="0"/>
 						<line number="398" hits="0"/>
-						<line number="399" hits="0"/>
 						<line number="400" hits="0"/>
 						<line number="401" hits="0"/>
 						<line number="402" hits="0"/>
-						<line number="408" hits="1"/>
-						<line number="410" hits="0"/>
-						<line number="411" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="412,414"/>
+						<line number="403" hits="0"/>
+						<line number="404" hits="0"/>
+						<line number="410" hits="1"/>
 						<line number="412" hits="0"/>
-						<line number="414" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="415,416"/>
-						<line number="415" hits="0"/>
-						<line number="416" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,417"/>
+						<line number="413" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="414,416"/>
+						<line number="414" hits="0"/>
+						<line number="416" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="417,418"/>
 						<line number="417" hits="0"/>
-						<line number="422" hits="1"/>
-						<line number="492" hits="1"/>
+						<line number="418" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,419"/>
+						<line number="419" hits="0"/>
+						<line number="424" hits="1"/>
+						<line number="494" hits="1"/>
+					</lines>
+				</class>
+				<class name="onedrive_mcp.py" filename="mcp/onedrive_mcp.py" complexity="0" line-rate="0.09871" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="8" hits="1"/>
+						<line number="9" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="14" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="30" hits="1"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="39" hits="1"/>
+						<line number="41" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="42,48"/>
+						<line number="42" hits="0"/>
+						<line number="43" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="51" hits="1"/>
+						<line number="53" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="54,55"/>
+						<line number="54" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="58" hits="1"/>
+						<line number="60" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="61,62"/>
+						<line number="61" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="63" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="64,66"/>
+						<line number="64" hits="0"/>
+						<line number="66" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="70" hits="1"/>
+						<line number="72" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="73,74"/>
+						<line number="73" hits="0"/>
+						<line number="74" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="75,76"/>
+						<line number="75" hits="0"/>
+						<line number="76" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,77"/>
+						<line number="77" hits="0"/>
+						<line number="83" hits="1"/>
+						<line number="95" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="98" hits="0"/>
+						<line number="100" hits="0"/>
+						<line number="101" hits="0"/>
+						<line number="103" hits="0"/>
+						<line number="104" hits="0"/>
+						<line number="109" hits="0"/>
+						<line number="110" hits="0"/>
+						<line number="117" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="118,121"/>
+						<line number="118" hits="0"/>
+						<line number="119" hits="0"/>
+						<line number="121" hits="0"/>
+						<line number="122" hits="0"/>
+						<line number="124" hits="0"/>
+						<line number="125" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="126,135"/>
+						<line number="126" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="137" hits="0"/>
+						<line number="138" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="140" hits="0"/>
+						<line number="141" hits="0"/>
+						<line number="142" hits="0"/>
+						<line number="143" hits="0"/>
+						<line number="146" hits="1"/>
+						<line number="159" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="163" hits="0"/>
+						<line number="164" hits="0"/>
+						<line number="167" hits="0"/>
+						<line number="168" hits="0"/>
+						<line number="169" hits="0"/>
+						<line number="176" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="177,180"/>
+						<line number="177" hits="0"/>
+						<line number="178" hits="0"/>
+						<line number="180" hits="0"/>
+						<line number="181" hits="0"/>
+						<line number="182" hits="0"/>
+						<line number="185" hits="0"/>
+						<line number="186" hits="0"/>
+						<line number="187" hits="0"/>
+						<line number="193" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="194,198"/>
+						<line number="194" hits="0"/>
+						<line number="195" hits="0"/>
+						<line number="198" hits="0"/>
+						<line number="200" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="201,204"/>
+						<line number="201" hits="0"/>
+						<line number="204" hits="0"/>
+						<line number="205" hits="0"/>
+						<line number="206" hits="0"/>
+						<line number="208" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="209,217"/>
+						<line number="209" hits="0"/>
+						<line number="217" hits="0"/>
+						<line number="219" hits="0"/>
+						<line number="228" hits="0"/>
+						<line number="235" hits="0"/>
+						<line number="236" hits="0"/>
+						<line number="237" hits="0"/>
+						<line number="238" hits="0"/>
+						<line number="239" hits="0"/>
+						<line number="240" hits="0"/>
+						<line number="241" hits="0"/>
+						<line number="244" hits="1"/>
+						<line number="259" hits="0"/>
+						<line number="261" hits="0"/>
+						<line number="262" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="263,265"/>
+						<line number="263" hits="0"/>
+						<line number="265" hits="0"/>
+						<line number="266" hits="0"/>
+						<line number="269" hits="0"/>
+						<line number="270" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="271,273"/>
+						<line number="271" hits="0"/>
+						<line number="273" hits="0"/>
+						<line number="275" hits="0"/>
+						<line number="276" hits="0"/>
+						<line number="282" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="283,286"/>
+						<line number="283" hits="0"/>
+						<line number="284" hits="0"/>
+						<line number="286" hits="0"/>
+						<line number="287" hits="0"/>
+						<line number="288" hits="0"/>
+						<line number="289" hits="0"/>
+						<line number="290" hits="0"/>
+						<line number="293" hits="0"/>
+						<line number="294" hits="0"/>
+						<line number="296" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="297,305"/>
+						<line number="297" hits="0"/>
+						<line number="305" hits="0"/>
+						<line number="307" hits="0"/>
+						<line number="316" hits="0"/>
+						<line number="324" hits="0"/>
+						<line number="325" hits="0"/>
+						<line number="326" hits="0"/>
+						<line number="327" hits="0"/>
+						<line number="328" hits="0"/>
+						<line number="329" hits="0"/>
+						<line number="330" hits="0"/>
+						<line number="333" hits="1"/>
+						<line number="344" hits="0"/>
+						<line number="346" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="347,349"/>
+						<line number="347" hits="0"/>
+						<line number="349" hits="0"/>
+						<line number="350" hits="0"/>
+						<line number="352" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="353,355"/>
+						<line number="353" hits="0"/>
+						<line number="355" hits="0"/>
+						<line number="357" hits="0"/>
+						<line number="363" hits="0"/>
+						<line number="364" hits="0"/>
+						<line number="371" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="372,375"/>
+						<line number="372" hits="0"/>
+						<line number="373" hits="0"/>
+						<line number="375" hits="0"/>
+						<line number="376" hits="0"/>
+						<line number="378" hits="0"/>
+						<line number="379" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="380,389"/>
+						<line number="380" hits="0"/>
+						<line number="389" hits="0"/>
+						<line number="394" hits="0"/>
+						<line number="395" hits="0"/>
+						<line number="396" hits="0"/>
+						<line number="397" hits="0"/>
+						<line number="398" hits="0"/>
+						<line number="399" hits="0"/>
+						<line number="400" hits="0"/>
+						<line number="403" hits="1"/>
+						<line number="414" hits="0"/>
+						<line number="416" hits="0"/>
+						<line number="418" hits="0"/>
+						<line number="419" hits="0"/>
+						<line number="421" hits="0"/>
+						<line number="422" hits="0"/>
+						<line number="424" hits="0"/>
+						<line number="425" hits="0"/>
+						<line number="432" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="433,436"/>
+						<line number="433" hits="0"/>
+						<line number="434" hits="0"/>
+						<line number="436" hits="0"/>
+						<line number="438" hits="0"/>
+						<line number="439" hits="0"/>
+						<line number="440" hits="0"/>
+						<line number="441" hits="0"/>
+						<line number="442" hits="0"/>
+						<line number="443" hits="0"/>
+						<line number="444" hits="0"/>
+						<line number="450" hits="1"/>
+						<line number="452" hits="0"/>
+						<line number="455" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="456,459"/>
+						<line number="456" hits="0"/>
+						<line number="459" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="460,474"/>
+						<line number="460" hits="0"/>
+						<line number="461" hits="0"/>
+						<line number="462" hits="0"/>
+						<line number="464" hits="0"/>
+						<line number="465" hits="0"/>
+						<line number="466" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="467,468"/>
+						<line number="467" hits="0"/>
+						<line number="468" hits="0"/>
+						<line number="469" hits="0"/>
+						<line number="470" hits="0"/>
+						<line number="471" hits="0"/>
+						<line number="474" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="475,486"/>
+						<line number="475" hits="0"/>
+						<line number="476" hits="0"/>
+						<line number="477" hits="0"/>
+						<line number="479" hits="0"/>
+						<line number="480" hits="0"/>
+						<line number="481" hits="0"/>
+						<line number="482" hits="0"/>
+						<line number="483" hits="0"/>
+						<line number="486" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="487,503"/>
+						<line number="487" hits="0"/>
+						<line number="488" hits="0"/>
+						<line number="489" hits="0"/>
+						<line number="491" hits="0"/>
+						<line number="492" hits="0"/>
+						<line number="493" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="494,497"/>
+						<line number="494" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="493,495"/>
+						<line number="495" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="494,496"/>
+						<line number="496" hits="0"/>
+						<line number="497" hits="0"/>
+						<line number="498" hits="0"/>
+						<line number="499" hits="0"/>
+						<line number="500" hits="0"/>
+						<line number="503" hits="0"/>
+						<line number="504" hits="0"/>
+						<line number="505" hits="0"/>
+						<line number="506" hits="0"/>
+						<line number="511" hits="1"/>
+						<line number="576" hits="1"/>
 					</lines>
 				</class>
 			</classes>
 		</package>
-		<package name="middleware" line-rate="0.439" branch-rate="0.3" complexity="0">
+		<package name="middleware" line-rate="0.2439" branch-rate="0" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="middleware/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
 					<lines/>
 				</class>
-				<class name="oidc_auth.py" filename="middleware/oidc_auth.py" complexity="0" line-rate="0.439" branch-rate="0.3">
+				<class name="oidc_auth.py" filename="middleware/oidc_auth.py" complexity="0" line-rate="0.2439" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="7" hits="1"/>
@@ -12709,18 +13846,18 @@
 						<line number="14" hits="1"/>
 						<line number="17" hits="1"/>
 						<line number="24" hits="1"/>
-						<line number="27" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="28"/>
+						<line number="27" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="28,30"/>
 						<line number="28" hits="0"/>
-						<line number="30" hits="1"/>
-						<line number="32" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="35"/>
-						<line number="33" hits="1"/>
+						<line number="30" hits="0"/>
+						<line number="32" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="33,35"/>
+						<line number="33" hits="0"/>
 						<line number="35" hits="0"/>
 						<line number="37" hits="1"/>
-						<line number="39" hits="1"/>
-						<line number="40" hits="1"/>
-						<line number="42" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="43"/>
+						<line number="39" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="42" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="43,48"/>
 						<line number="43" hits="0"/>
-						<line number="48" hits="1"/>
+						<line number="48" hits="0"/>
 						<line number="50" hits="1"/>
 						<line number="52" hits="0"/>
 						<line number="54" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="55,60"/>
@@ -12746,7 +13883,7 @@
 				</class>
 			</classes>
 		</package>
-		<package name="models" line-rate="0.6874" branch-rate="0" complexity="0">
+		<package name="models" line-rate="0.6882" branch-rate="0" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="models/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
@@ -13758,122 +14895,117 @@
 						<line number="233" hits="0"/>
 					</lines>
 				</class>
-				<class name="library.py" filename="models/library.py" complexity="0" line-rate="0.9516" branch-rate="0">
+				<class name="library.py" filename="models/library.py" complexity="0" line-rate="0.9535" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="3" hits="1"/>
 						<line number="5" hits="1"/>
-						<line number="18" hits="1"/>
-						<line number="21" hits="1"/>
-						<line number="24" hits="1"/>
-						<line number="26" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="19" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="25" hits="1"/>
 						<line number="27" hits="1"/>
 						<line number="28" hits="1"/>
-						<line number="30" hits="1"/>
+						<line number="29" hits="1"/>
 						<line number="31" hits="1"/>
 						<line number="32" hits="1"/>
 						<line number="33" hits="1"/>
-						<line number="35" hits="1"/>
+						<line number="34" hits="1"/>
 						<line number="36" hits="1"/>
-						<line number="39" hits="1"/>
-						<line number="41" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="40" hits="1"/>
 						<line number="42" hits="1"/>
-						<line number="44" hits="1"/>
-						<line number="45" hits="1"/>
+						<line number="43" hits="1"/>
 						<line number="46" hits="1"/>
 						<line number="48" hits="1"/>
-						<line number="54" hits="1"/>
-						<line number="55" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="56,57"/>
-						<line number="56" hits="0"/>
-						<line number="57" hits="0"/>
-						<line number="60" hits="1"/>
-						<line number="63" hits="1"/>
+						<line number="49" hits="1"/>
+						<line number="50" hits="1"/>
+						<line number="52" hits="1"/>
+						<line number="59" hits="1"/>
+						<line number="60" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="61,62"/>
+						<line number="61" hits="0"/>
+						<line number="62" hits="0"/>
 						<line number="65" hits="1"/>
-						<line number="66" hits="1"/>
-						<line number="73" hits="1"/>
-						<line number="74" hits="1"/>
-						<line number="75" hits="1"/>
-						<line number="76" hits="1"/>
+						<line number="68" hits="1"/>
+						<line number="70" hits="1"/>
+						<line number="71" hits="1"/>
 						<line number="78" hits="1"/>
+						<line number="79" hits="1"/>
 						<line number="80" hits="1"/>
-						<line number="86" hits="1"/>
-						<line number="89" hits="1"/>
+						<line number="81" hits="1"/>
+						<line number="83" hits="1"/>
+						<line number="85" hits="1"/>
 						<line number="91" hits="1"/>
-						<line number="92" hits="1"/>
-						<line number="93" hits="1"/>
-						<line number="100" hits="1"/>
-						<line number="101" hits="1"/>
-						<line number="102" hits="1"/>
-						<line number="103" hits="1"/>
-						<line number="104" hits="1"/>
+						<line number="94" hits="1"/>
+						<line number="96" hits="1"/>
+						<line number="97" hits="1"/>
+						<line number="98" hits="1"/>
+						<line number="105" hits="1"/>
 						<line number="106" hits="1"/>
+						<line number="107" hits="1"/>
 						<line number="108" hits="1"/>
-						<line number="110" hits="1"/>
-						<line number="115" hits="1"/>
-						<line number="116" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="117,118"/>
-						<line number="117" hits="0"/>
-						<line number="118" hits="0"/>
-						<line number="121" hits="1"/>
-						<line number="124" hits="1"/>
-						<line number="126" hits="1"/>
-						<line number="127" hits="1"/>
+						<line number="109" hits="1"/>
+						<line number="111" hits="1"/>
+						<line number="114" hits="1"/>
+						<line number="117" hits="1"/>
+						<line number="118" hits="1"/>
+						<line number="120" hits="1"/>
+						<line number="122" hits="1"/>
 						<line number="128" hits="1"/>
-						<line number="135" hits="1"/>
-						<line number="136" hits="1"/>
+						<line number="129" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="130,131"/>
+						<line number="130" hits="0"/>
+						<line number="131" hits="0"/>
+						<line number="134" hits="1"/>
 						<line number="137" hits="1"/>
-						<line number="138" hits="1"/>
+						<line number="139" hits="1"/>
 						<line number="140" hits="1"/>
 						<line number="141" hits="1"/>
-						<line number="142" hits="1"/>
-						<line number="144" hits="1"/>
+						<line number="148" hits="1"/>
+						<line number="149" hits="1"/>
+						<line number="150" hits="1"/>
+						<line number="151" hits="1"/>
+						<line number="153" hits="1"/>
+						<line number="154" hits="1"/>
 						<line number="155" hits="1"/>
-						<line number="158" hits="1"/>
-						<line number="160" hits="1"/>
-						<line number="161" hits="1"/>
-						<line number="162" hits="1"/>
-						<line number="169" hits="1"/>
-						<line number="170" hits="1"/>
+						<line number="157" hits="1"/>
+						<line number="168" hits="1"/>
 						<line number="171" hits="1"/>
-						<line number="172" hits="1"/>
+						<line number="173" hits="1"/>
 						<line number="174" hits="1"/>
 						<line number="175" hits="1"/>
-						<line number="177" hits="1"/>
-						<line number="178" hits="1"/>
-						<line number="179" hits="1"/>
-						<line number="181" hits="1"/>
 						<line number="182" hits="1"/>
+						<line number="183" hits="1"/>
 						<line number="184" hits="1"/>
+						<line number="185" hits="1"/>
+						<line number="187" hits="1"/>
+						<line number="188" hits="1"/>
+						<line number="190" hits="1"/>
 						<line number="191" hits="1"/>
+						<line number="192" hits="1"/>
 						<line number="194" hits="1"/>
-						<line number="196" hits="1"/>
+						<line number="195" hits="1"/>
 						<line number="197" hits="1"/>
-						<line number="198" hits="1"/>
-						<line number="199" hits="1"/>
-						<line number="201" hits="1"/>
-						<line number="202" hits="1"/>
-						<line number="203" hits="1"/>
 						<line number="204" hits="1"/>
-						<line number="205" hits="1"/>
-						<line number="206" hits="1"/>
-						<line number="208" hits="1"/>
+						<line number="207" hits="1"/>
 						<line number="209" hits="1"/>
 						<line number="210" hits="1"/>
+						<line number="211" hits="1"/>
 						<line number="212" hits="1"/>
-						<line number="213" hits="1"/>
 						<line number="214" hits="1"/>
 						<line number="215" hits="1"/>
+						<line number="216" hits="1"/>
 						<line number="217" hits="1"/>
+						<line number="218" hits="1"/>
+						<line number="219" hits="1"/>
+						<line number="221" hits="1"/>
+						<line number="222" hits="1"/>
 						<line number="223" hits="1"/>
+						<line number="225" hits="1"/>
 						<line number="226" hits="1"/>
+						<line number="227" hits="1"/>
 						<line number="228" hits="1"/>
-						<line number="229" hits="1"/>
-						<line number="231" hits="1"/>
-						<line number="232" hits="1"/>
-						<line number="233" hits="1"/>
-						<line number="235" hits="1"/>
+						<line number="230" hits="1"/>
 						<line number="236" hits="1"/>
-						<line number="237" hits="1"/>
-						<line number="238" hits="1"/>
 						<line number="239" hits="1"/>
 						<line number="241" hits="1"/>
 						<line number="242" hits="1"/>
@@ -13884,7 +15016,17 @@
 						<line number="249" hits="1"/>
 						<line number="250" hits="1"/>
 						<line number="251" hits="1"/>
-						<line number="253" hits="1"/>
+						<line number="252" hits="1"/>
+						<line number="254" hits="1"/>
+						<line number="255" hits="1"/>
+						<line number="257" hits="1"/>
+						<line number="258" hits="1"/>
+						<line number="259" hits="1"/>
+						<line number="261" hits="1"/>
+						<line number="262" hits="1"/>
+						<line number="263" hits="1"/>
+						<line number="264" hits="1"/>
+						<line number="266" hits="1"/>
 					</lines>
 				</class>
 				<class name="marketplace_template.py" filename="models/marketplace_template.py" complexity="0" line-rate="0.9701" branch-rate="1">
@@ -16113,7 +17255,7 @@
 				</class>
 			</classes>
 		</package>
-		<package name="orchestrator" line-rate="0.2001" branch-rate="0" complexity="0">
+		<package name="orchestrator" line-rate="0.1852" branch-rate="0" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="orchestrator/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
@@ -16738,13 +17880,13 @@
 						<line number="12" hits="1"/>
 						<line number="14" hits="1"/>
 						<line number="17" hits="1"/>
-						<line number="19" hits="0"/>
-						<line number="26" hits="1"/>
-						<line number="28" hits="0"/>
-						<line number="31" hits="1"/>
-						<line number="33" hits="0"/>
-						<line number="36" hits="1"/>
-						<line number="38" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="32" hits="1"/>
+						<line number="34" hits="0"/>
+						<line number="37" hits="1"/>
+						<line number="39" hits="0"/>
+						<line number="42" hits="1"/>
+						<line number="44" hits="0"/>
 					</lines>
 				</class>
 				<class name="expression_resolver.py" filename="orchestrator/expression_resolver.py" complexity="0" line-rate="0" branch-rate="0">
@@ -17027,37 +18169,42 @@
 						<line number="267" hits="0"/>
 						<line number="270" hits="0"/>
 						<line number="271" hits="0"/>
-						<line number="273" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="274,279"/>
-						<line number="274" hits="0"/>
-						<line number="279" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="247,280"/>
+						<line number="276" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="277,278"/>
+						<line number="277" hits="0"/>
+						<line number="278" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="279,282"/>
+						<line number="279" hits="0"/>
 						<line number="280" hits="0"/>
-						<line number="285" hits="0"/>
-						<line number="292" hits="0"/>
-						<line number="293" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="294,297"/>
+						<line number="282" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="283,288"/>
+						<line number="283" hits="0"/>
+						<line number="288" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="247,289"/>
+						<line number="289" hits="0"/>
 						<line number="294" hits="0"/>
-						<line number="297" hits="0"/>
-						<line number="298" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="299,303"/>
-						<line number="299" hits="0"/>
-						<line number="300" hits="0"/>
+						<line number="301" hits="0"/>
+						<line number="302" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="303,306"/>
 						<line number="303" hits="0"/>
-						<line number="304" hits="0"/>
 						<line number="306" hits="0"/>
-						<line number="307" hits="0"/>
+						<line number="307" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="308,312"/>
 						<line number="308" hits="0"/>
-						<line number="310" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="312,321"/>
-						<line number="312" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="313,315"/>
+						<line number="309" hits="0"/>
+						<line number="312" hits="0"/>
 						<line number="313" hits="0"/>
-						<line number="315" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="316,318"/>
-						<line number="316" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="310,317"/>
+						<line number="315" hits="0"/>
+						<line number="316" hits="0"/>
 						<line number="317" hits="0"/>
-						<line number="318" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="310,319"/>
-						<line number="319" hits="0"/>
-						<line number="321" hits="0"/>
+						<line number="319" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="321,330"/>
+						<line number="321" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="322,324"/>
 						<line number="322" hits="0"/>
-						<line number="324" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,325"/>
-						<line number="325" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="324,326"/>
-						<line number="326" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="324,327"/>
-						<line number="327" hits="0"/>
+						<line number="324" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="325,327"/>
+						<line number="325" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="319,326"/>
+						<line number="326" hits="0"/>
+						<line number="327" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="319,328"/>
+						<line number="328" hits="0"/>
+						<line number="330" hits="0"/>
+						<line number="331" hits="0"/>
+						<line number="333" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,334"/>
+						<line number="334" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="333,335"/>
+						<line number="335" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="333,336"/>
+						<line number="336" hits="0"/>
 					</lines>
 				</class>
 				<class name="hitl.py" filename="orchestrator/hitl.py" complexity="0" line-rate="0" branch-rate="0">
@@ -17600,7 +18747,7 @@
 						<line number="170" hits="1"/>
 					</lines>
 				</class>
-				<class name="node_adapter.py" filename="orchestrator/node_adapter.py" complexity="0" line-rate="0.1935" branch-rate="0">
+				<class name="node_adapter.py" filename="orchestrator/node_adapter.py" complexity="0" line-rate="0.2131" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="3" hits="1"/>
@@ -17608,66 +18755,65 @@
 						<line number="5" hits="1"/>
 						<line number="6" hits="1"/>
 						<line number="8" hits="1"/>
-						<line number="10" hits="1"/>
-						<line number="15" hits="1"/>
-						<line number="17" hits="1"/>
-						<line number="20" hits="1"/>
-						<line number="23" hits="1"/>
-						<line number="45" hits="0"/>
-						<line number="47" hits="0"/>
-						<line number="50" hits="0"/>
-						<line number="63" hits="0"/>
-						<line number="66" hits="0"/>
-						<line number="75" hits="0"/>
-						<line number="82" hits="0"/>
-						<line number="83" hits="0"/>
-						<line number="86" hits="0"/>
-						<line number="89" hits="0"/>
+						<line number="9" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="46" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="65" hits="0"/>
+						<line number="68" hits="0"/>
+						<line number="77" hits="0"/>
+						<line number="84" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="88" hits="0"/>
 						<line number="90" hits="0"/>
-						<line number="92" hits="0"/>
-						<line number="99" hits="0"/>
-						<line number="105" hits="0"/>
+						<line number="100" hits="0"/>
 						<line number="106" hits="0"/>
-						<line number="113" hits="0"/>
-						<line number="119" hits="0"/>
-						<line number="128" hits="0"/>
-						<line number="135" hits="0"/>
+						<line number="107" hits="0"/>
+						<line number="114" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="129" hits="0"/>
 						<line number="136" hits="0"/>
-						<line number="138" hits="0"/>
-						<line number="141" hits="1"/>
-						<line number="153" hits="0"/>
-						<line number="155" hits="0"/>
+						<line number="137" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="142" hits="1"/>
+						<line number="154" hits="0"/>
 						<line number="156" hits="0"/>
 						<line number="157" hits="0"/>
-						<line number="159" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="160,180"/>
-						<line number="160" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="161,178"/>
-						<line number="161" hits="0"/>
-						<line number="162" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="163,176"/>
-						<line number="163" hits="0"/>
+						<line number="158" hits="0"/>
+						<line number="160" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="161,181"/>
+						<line number="161" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="162,179"/>
+						<line number="162" hits="0"/>
+						<line number="163" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="164,177"/>
 						<line number="164" hits="0"/>
 						<line number="165" hits="0"/>
-						<line number="167" hits="0"/>
-						<line number="168" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="169,174"/>
-						<line number="169" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="170,172"/>
-						<line number="170" hits="0"/>
-						<line number="172" hits="0"/>
+						<line number="166" hits="0"/>
+						<line number="168" hits="0"/>
+						<line number="169" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="170,175"/>
+						<line number="170" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="171,173"/>
+						<line number="171" hits="0"/>
 						<line number="173" hits="0"/>
 						<line number="174" hits="0"/>
-						<line number="176" hits="0"/>
-						<line number="178" hits="0"/>
-						<line number="180" hits="0"/>
-						<line number="183" hits="1"/>
-						<line number="189" hits="0"/>
+						<line number="175" hits="0"/>
+						<line number="177" hits="0"/>
+						<line number="179" hits="0"/>
+						<line number="181" hits="0"/>
+						<line number="184" hits="1"/>
 						<line number="190" hits="0"/>
 						<line number="191" hits="0"/>
-						<line number="192" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="193,201"/>
-						<line number="193" hits="0"/>
-						<line number="199" hits="0"/>
+						<line number="192" hits="0"/>
+						<line number="193" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="194,202"/>
+						<line number="194" hits="0"/>
 						<line number="200" hits="0"/>
 						<line number="201" hits="0"/>
+						<line number="202" hits="0"/>
 					</lines>
 				</class>
-				<class name="node_registry.py" filename="orchestrator/node_registry.py" complexity="0" line-rate="0.4348" branch-rate="0">
+				<class name="node_registry.py" filename="orchestrator/node_registry.py" complexity="0" line-rate="0.305" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="4" hits="1"/>
@@ -17685,15 +18831,15 @@
 						<line number="20" hits="1"/>
 						<line number="21" hits="1"/>
 						<line number="22" hits="1"/>
-						<line number="25" hits="1"/>
-						<line number="26" hits="1"/>
-						<line number="29" hits="1"/>
-						<line number="30" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="28" hits="1"/>
 						<line number="31" hits="1"/>
-						<line number="34" hits="1"/>
-						<line number="35" hits="1"/>
-						<line number="38" hits="1"/>
-						<line number="39" hits="1"/>
+						<line number="32" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="36" hits="1"/>
+						<line number="37" hits="1"/>
 						<line number="40" hits="1"/>
 						<line number="41" hits="1"/>
 						<line number="42" hits="1"/>
@@ -17701,67 +18847,116 @@
 						<line number="44" hits="1"/>
 						<line number="45" hits="1"/>
 						<line number="46" hits="1"/>
-						<line number="49" hits="1"/>
-						<line number="52" hits="1"/>
+						<line number="47" hits="1"/>
+						<line number="48" hits="1"/>
+						<line number="51" hits="1"/>
 						<line number="54" hits="1"/>
-						<line number="55" hits="0"/>
-						<line number="57" hits="1"/>
-						<line number="58" hits="1"/>
-						<line number="60" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="61,63"/>
-						<line number="61" hits="0"/>
-						<line number="62" hits="0"/>
+						<line number="56" hits="1"/>
+						<line number="57" hits="0"/>
+						<line number="59" hits="1"/>
+						<line number="60" hits="1"/>
+						<line number="62" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="63,65"/>
 						<line number="63" hits="0"/>
-						<line number="65" hits="1"/>
-						<line number="67" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="68,69"/>
-						<line number="68" hits="0"/>
-						<line number="69" hits="0"/>
-						<line number="71" hits="1"/>
-						<line number="73" hits="0"/>
-						<line number="75" hits="1"/>
-						<line number="77" hits="0"/>
-						<line number="79" hits="1"/>
-						<line number="83" hits="0"/>
-						<line number="159" hits="0"/>
-						<line number="240" hits="0"/>
-						<line number="268" hits="0"/>
-						<line number="297" hits="0"/>
-						<line number="363" hits="0"/>
-						<line number="452" hits="0"/>
-						<line number="492" hits="0"/>
-						<line number="511" hits="0"/>
-						<line number="547" hits="0"/>
-						<line number="588" hits="0"/>
-						<line number="624" hits="0"/>
-						<line number="665" hits="0"/>
-						<line number="712" hits="0"/>
-						<line number="791" hits="0"/>
-						<line number="888" hits="0"/>
-						<line number="1021" hits="0"/>
-						<line number="1116" hits="0"/>
-						<line number="1197" hits="0"/>
-						<line number="1258" hits="0"/>
-						<line number="1337" hits="0"/>
-						<line number="1380" hits="0"/>
-						<line number="1418" hits="0"/>
-						<line number="1483" hits="0"/>
-						<line number="1526" hits="0"/>
-						<line number="1569" hits="0"/>
-						<line number="1619" hits="0"/>
-						<line number="1661" hits="0"/>
-						<line number="1778" hits="0"/>
-						<line number="1855" hits="0"/>
-						<line number="1957" hits="0"/>
-						<line number="2006" hits="0"/>
-						<line number="2045" hits="0"/>
-						<line number="2091" hits="0"/>
-						<line number="2172" hits="0"/>
-						<line number="2215" hits="0"/>
-						<line number="2336" hits="0"/>
-						<line number="2412" hits="0"/>
-						<line number="2491" hits="0"/>
-						<line number="2551" hits="0"/>
-						<line number="2613" hits="0"/>
-						<line number="2684" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="65" hits="0"/>
+						<line number="67" hits="1"/>
+						<line number="69" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="70,71"/>
+						<line number="70" hits="0"/>
+						<line number="71" hits="0"/>
+						<line number="73" hits="1"/>
+						<line number="75" hits="0"/>
+						<line number="77" hits="1"/>
+						<line number="79" hits="0"/>
+						<line number="81" hits="1"/>
+						<line number="85" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="242" hits="0"/>
+						<line number="270" hits="0"/>
+						<line number="299" hits="0"/>
+						<line number="369" hits="0"/>
+						<line number="420" hits="0"/>
+						<line number="469" hits="0"/>
+						<line number="509" hits="0"/>
+						<line number="528" hits="0"/>
+						<line number="572" hits="0"/>
+						<line number="613" hits="0"/>
+						<line number="649" hits="0"/>
+						<line number="690" hits="0"/>
+						<line number="737" hits="0"/>
+						<line number="816" hits="0"/>
+						<line number="913" hits="0"/>
+						<line number="1046" hits="0"/>
+						<line number="1141" hits="0"/>
+						<line number="1222" hits="0"/>
+						<line number="1283" hits="0"/>
+						<line number="1362" hits="0"/>
+						<line number="1405" hits="0"/>
+						<line number="1443" hits="0"/>
+						<line number="1508" hits="0"/>
+						<line number="1551" hits="0"/>
+						<line number="1594" hits="0"/>
+						<line number="1644" hits="0"/>
+						<line number="1686" hits="0"/>
+						<line number="1803" hits="0"/>
+						<line number="1880" hits="0"/>
+						<line number="1982" hits="0"/>
+						<line number="2031" hits="0"/>
+						<line number="2070" hits="0"/>
+						<line number="2116" hits="0"/>
+						<line number="2197" hits="0"/>
+						<line number="2241" hits="0"/>
+						<line number="2284" hits="0"/>
+						<line number="2405" hits="0"/>
+						<line number="2481" hits="0"/>
+						<line number="2560" hits="0"/>
+						<line number="2620" hits="0"/>
+						<line number="2682" hits="0"/>
+						<line number="2753" hits="0"/>
+						<line number="2809" hits="0"/>
+						<line number="2873" hits="0"/>
+						<line number="2904" hits="0"/>
+						<line number="2965" hits="0"/>
+						<line number="3008" hits="0"/>
+						<line number="3067" hits="0"/>
+						<line number="3131" hits="0"/>
+						<line number="3185" hits="0"/>
+						<line number="3215" hits="0"/>
+						<line number="3272" hits="0"/>
+						<line number="3319" hits="0"/>
+						<line number="3379" hits="0"/>
+						<line number="3435" hits="0"/>
+						<line number="3503" hits="0"/>
+						<line number="3560" hits="0"/>
+						<line number="3648" hits="0"/>
+						<line number="3699" hits="0"/>
+						<line number="3750" hits="0"/>
+						<line number="3820" hits="1"/>
+						<line number="3822" hits="0"/>
+						<line number="3823" hits="0"/>
+						<line number="3824" hits="0"/>
+						<line number="3825" hits="0"/>
+						<line number="3826" hits="0"/>
+						<line number="3827" hits="0"/>
+						<line number="3828" hits="0"/>
+						<line number="3829" hits="0"/>
+						<line number="3830" hits="0"/>
+						<line number="3831" hits="0"/>
+						<line number="3832" hits="0"/>
+						<line number="3833" hits="0"/>
+						<line number="3834" hits="0"/>
+						<line number="3835" hits="0"/>
+						<line number="3836" hits="0"/>
+						<line number="3837" hits="0"/>
+						<line number="3838" hits="0"/>
+						<line number="3839" hits="0"/>
+						<line number="3840" hits="0"/>
+						<line number="3841" hits="0"/>
+						<line number="3842" hits="0"/>
+						<line number="3843" hits="0"/>
+						<line number="3844" hits="0"/>
+						<line number="3845" hits="0"/>
+						<line number="3847" hits="0"/>
+						<line number="3885" hits="0"/>
 					</lines>
 				</class>
 				<class name="orchestrator.py" filename="orchestrator/orchestrator.py" complexity="0" line-rate="0.157" branch-rate="0">
@@ -18749,21 +19944,21 @@
 						<line number="218" hits="0"/>
 						<line number="219" hits="0"/>
 						<line number="220" hits="0"/>
-						<line number="222" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="223,241"/>
+						<line number="222" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="223,244"/>
 						<line number="223" hits="0"/>
 						<line number="224" hits="0"/>
 						<line number="225" hits="0"/>
-						<line number="235" hits="0"/>
 						<line number="238" hits="0"/>
-						<line number="239" hits="0"/>
-						<line number="241" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="242,258"/>
+						<line number="241" hits="0"/>
 						<line number="242" hits="0"/>
-						<line number="243" hits="0"/>
-						<line number="244" hits="0"/>
-						<line number="253" hits="0"/>
-						<line number="254" hits="0"/>
-						<line number="255" hits="0"/>
+						<line number="244" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="245,261"/>
+						<line number="245" hits="0"/>
+						<line number="246" hits="0"/>
+						<line number="247" hits="0"/>
+						<line number="256" hits="0"/>
+						<line number="257" hits="0"/>
 						<line number="258" hits="0"/>
+						<line number="261" hits="0"/>
 					</lines>
 				</class>
 				<class name="streaming_adapter.py" filename="orchestrator/streaming_adapter.py" complexity="0" line-rate="1" branch-rate="1">
@@ -18955,777 +20150,1087 @@
 						<line number="25" hits="0"/>
 					</lines>
 				</class>
-				<class name="workflow_compiler.py" filename="orchestrator/workflow_compiler.py" complexity="0" line-rate="0.1173" branch-rate="0">
+				<class name="workflow_compiler.py" filename="orchestrator/workflow_compiler.py" complexity="0" line-rate="0.1399" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="3" hits="1"/>
-						<line number="5" hits="1"/>
+						<line number="4" hits="1"/>
 						<line number="6" hits="1"/>
-						<line number="8" hits="1"/>
+						<line number="7" hits="1"/>
 						<line number="9" hits="1"/>
 						<line number="10" hits="1"/>
 						<line number="11" hits="1"/>
 						<line number="12" hits="1"/>
-						<line number="14" hits="1"/>
-						<line number="17" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
 						<line number="20" hits="1"/>
-						<line number="23" hits="1"/>
+						<line number="25" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="30" hits="1"/>
 						<line number="34" hits="1"/>
-						<line number="35" hits="0"/>
 						<line number="37" hits="1"/>
-						<line number="56" hits="0"/>
-						<line number="57" hits="0"/>
-						<line number="59" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="60,63"/>
-						<line number="60" hits="0"/>
-						<line number="63" hits="0"/>
-						<line number="64" hits="0"/>
-						<line number="67" hits="0"/>
-						<line number="70" hits="0"/>
-						<line number="72" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="73,75"/>
+						<line number="40" hits="1"/>
+						<line number="51" hits="1"/>
+						<line number="52" hits="0"/>
+						<line number="54" hits="1"/>
 						<line number="73" hits="0"/>
-						<line number="75" hits="0"/>
+						<line number="74" hits="0"/>
+						<line number="76" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="77,80"/>
+						<line number="77" hits="0"/>
+						<line number="80" hits="0"/>
 						<line number="81" hits="0"/>
-						<line number="87" hits="1"/>
-						<line number="94" hits="0"/>
-						<line number="96" hits="0"/>
-						<line number="97" hits="0"/>
-						<line number="100" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="101,104"/>
-						<line number="101" hits="0"/>
-						<line number="104" hits="0"/>
-						<line number="108" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="109,110"/>
-						<line number="109" hits="0"/>
-						<line number="110" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="111,116"/>
+						<line number="84" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="89" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="90,92"/>
+						<line number="90" hits="0"/>
+						<line number="92" hits="0"/>
+						<line number="98" hits="0"/>
+						<line number="104" hits="1"/>
 						<line number="111" hits="0"/>
-						<line number="116" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="117,125"/>
-						<line number="117" hits="0"/>
+						<line number="113" hits="0"/>
+						<line number="114" hits="0"/>
+						<line number="117" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="118,121"/>
 						<line number="118" hits="0"/>
-						<line number="119" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="120,121"/>
-						<line number="120" hits="0"/>
-						<line number="121" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="116,122"/>
-						<line number="122" hits="0"/>
-						<line number="125" hits="0"/>
+						<line number="121" hits="0"/>
+						<line number="125" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="126,127"/>
 						<line number="126" hits="0"/>
-						<line number="127" hits="0"/>
-						<line number="128" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="129,134"/>
-						<line number="129" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="128,130"/>
-						<line number="130" hits="0"/>
-						<line number="134" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="135,143"/>
-						<line number="135" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="134,137"/>
-						<line number="137" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="138,140"/>
-						<line number="138" hits="0"/>
-						<line number="140" hits="0"/>
-						<line number="143" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="144,147"/>
+						<line number="127" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="128,133"/>
+						<line number="128" hits="0"/>
+						<line number="133" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="134,142"/>
+						<line number="134" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="136" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="137,138"/>
+						<line number="137" hits="0"/>
+						<line number="138" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="133,139"/>
+						<line number="139" hits="0"/>
+						<line number="142" hits="0"/>
+						<line number="143" hits="0"/>
 						<line number="144" hits="0"/>
+						<line number="145" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="146,151"/>
+						<line number="146" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="145,147"/>
 						<line number="147" hits="0"/>
-						<line number="149" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,150"/>
-						<line number="150" hits="0"/>
-						<line number="156" hits="1"/>
-						<line number="163" hits="0"/>
-						<line number="164" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="165,170"/>
-						<line number="165" hits="0"/>
-						<line number="166" hits="0"/>
-						<line number="167" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="164,168"/>
-						<line number="168" hits="0"/>
-						<line number="170" hits="0"/>
-						<line number="171" hits="0"/>
-						<line number="173" hits="0"/>
-						<line number="174" hits="0"/>
-						<line number="175" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="176,180"/>
-						<line number="176" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="177,178"/>
-						<line number="177" hits="0"/>
-						<line number="178" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="175,179"/>
-						<line number="179" hits="0"/>
+						<line number="151" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="152,160"/>
+						<line number="152" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="151,154"/>
+						<line number="154" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="155,157"/>
+						<line number="155" hits="0"/>
+						<line number="157" hits="0"/>
+						<line number="160" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="161,164"/>
+						<line number="161" hits="0"/>
+						<line number="164" hits="0"/>
+						<line number="166" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,167"/>
+						<line number="167" hits="0"/>
+						<line number="173" hits="1"/>
 						<line number="180" hits="0"/>
-						<line number="181" hits="0"/>
-						<line number="183" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,184"/>
-						<line number="184" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="183,185"/>
-						<line number="185" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="183,186"/>
-						<line number="186" hits="0"/>
-						<line number="189" hits="0"/>
-						<line number="191" hits="1"/>
+						<line number="181" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="182,187"/>
+						<line number="182" hits="0"/>
+						<line number="183" hits="0"/>
+						<line number="184" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="181,185"/>
+						<line number="185" hits="0"/>
+						<line number="187" hits="0"/>
+						<line number="188" hits="0"/>
+						<line number="190" hits="0"/>
+						<line number="191" hits="0"/>
+						<line number="192" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="193,197"/>
+						<line number="193" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="194,195"/>
+						<line number="194" hits="0"/>
+						<line number="195" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="192,196"/>
+						<line number="196" hits="0"/>
+						<line number="197" hits="0"/>
 						<line number="198" hits="0"/>
 						<line number="200" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,201"/>
-						<line number="201" hits="0"/>
-						<line number="202" hits="0"/>
+						<line number="201" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="200,202"/>
+						<line number="202" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="200,203"/>
 						<line number="203" hits="0"/>
-						<line number="204" hits="0"/>
-						<line number="206" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="207,209"/>
-						<line number="207" hits="0"/>
-						<line number="209" hits="0"/>
-						<line number="210" hits="0"/>
-						<line number="211" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="212,214"/>
-						<line number="212" hits="0"/>
-						<line number="214" hits="0"/>
-						<line number="215" hits="0"/>
-						<line number="217" hits="0"/>
-						<line number="218" hits="0"/>
-						<line number="219" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="220,222"/>
-						<line number="220" hits="0"/>
+						<line number="206" hits="0"/>
+						<line number="208" hits="1"/>
 						<line number="222" hits="0"/>
-						<line number="223" hits="0"/>
-						<line number="225" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="226,231"/>
+						<line number="224" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,225"/>
+						<line number="225" hits="0"/>
 						<line number="226" hits="0"/>
-						<line number="229" hits="0"/>
-						<line number="231" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="200,232"/>
-						<line number="232" hits="0"/>
-						<line number="241" hits="1"/>
+						<line number="227" hits="0"/>
+						<line number="228" hits="0"/>
+						<line number="230" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="231,233"/>
+						<line number="231" hits="0"/>
+						<line number="233" hits="0"/>
+						<line number="234" hits="0"/>
+						<line number="235" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="236,238"/>
+						<line number="236" hits="0"/>
+						<line number="238" hits="0"/>
+						<line number="239" hits="0"/>
+						<line number="241" hits="0"/>
+						<line number="242" hits="0"/>
+						<line number="243" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="244,246"/>
+						<line number="244" hits="0"/>
+						<line number="246" hits="0"/>
 						<line number="247" hits="0"/>
-						<line number="249" hits="0"/>
-						<line number="252" hits="0"/>
+						<line number="252" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="253,254"/>
+						<line number="253" hits="0"/>
+						<line number="254" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="255,258"/>
+						<line number="255" hits="0"/>
 						<line number="256" hits="0"/>
-						<line number="259" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="260,282"/>
-						<line number="260" hits="0"/>
-						<line number="261" hits="0"/>
+						<line number="258" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="262,268"/>
 						<line number="262" hits="0"/>
-						<line number="263" hits="0"/>
 						<line number="266" hits="0"/>
-						<line number="267" hits="0"/>
-						<line number="269" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="270,273"/>
-						<line number="270" hits="0"/>
-						<line number="273" hits="0"/>
-						<line number="279" hits="0"/>
-						<line number="282" hits="0"/>
-						<line number="285" hits="0"/>
-						<line number="287" hits="0"/>
-						<line number="289" hits="1"/>
-						<line number="302" hits="0"/>
+						<line number="268" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="224,269"/>
+						<line number="269" hits="0"/>
+						<line number="278" hits="1"/>
+						<line number="284" hits="0"/>
+						<line number="286" hits="0"/>
+						<line number="289" hits="0"/>
+						<line number="293" hits="0"/>
+						<line number="296" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="297,319"/>
+						<line number="297" hits="0"/>
+						<line number="298" hits="0"/>
+						<line number="299" hits="0"/>
+						<line number="300" hits="0"/>
 						<line number="303" hits="0"/>
-						<line number="304" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="305,309"/>
-						<line number="305" hits="0"/>
-						<line number="306" hits="0"/>
-						<line number="309" hits="0"/>
+						<line number="304" hits="0"/>
+						<line number="306" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="307,310"/>
+						<line number="307" hits="0"/>
 						<line number="310" hits="0"/>
-						<line number="312" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,313"/>
-						<line number="313" hits="0"/>
-						<line number="314" hits="0"/>
 						<line number="316" hits="0"/>
-						<line number="318" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="320,323"/>
-						<line number="320" hits="0"/>
-						<line number="321" hits="0"/>
-						<line number="323" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="325,328"/>
-						<line number="325" hits="0"/>
-						<line number="328" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="329,333"/>
-						<line number="329" hits="0"/>
-						<line number="333" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="312,334"/>
-						<line number="334" hits="0"/>
-						<line number="336" hits="1"/>
-						<line number="349" hits="0"/>
-						<line number="350" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="351,356"/>
+						<line number="319" hits="0"/>
+						<line number="322" hits="0"/>
+						<line number="324" hits="0"/>
+						<line number="326" hits="1"/>
+						<line number="339" hits="0"/>
+						<line number="340" hits="0"/>
+						<line number="341" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="342,346"/>
+						<line number="342" hits="0"/>
+						<line number="343" hits="0"/>
+						<line number="346" hits="0"/>
+						<line number="347" hits="0"/>
+						<line number="349" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,350"/>
+						<line number="350" hits="0"/>
 						<line number="351" hits="0"/>
-						<line number="352" hits="0"/>
 						<line number="353" hits="0"/>
-						<line number="356" hits="0"/>
+						<line number="355" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="357,360"/>
+						<line number="357" hits="0"/>
 						<line number="358" hits="0"/>
-						<line number="360" hits="0"/>
-						<line number="361" hits="0"/>
-						<line number="363" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="365,369"/>
-						<line number="365" hits="0"/>
+						<line number="360" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="362,365"/>
+						<line number="362" hits="0"/>
+						<line number="365" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="366,370"/>
 						<line number="366" hits="0"/>
-						<line number="369" hits="0"/>
+						<line number="370" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="349,371"/>
 						<line number="371" hits="0"/>
-						<line number="372" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="374,375"/>
-						<line number="374" hits="0"/>
-						<line number="375" hits="0"/>
-						<line number="377" hits="0"/>
-						<line number="383" hits="1"/>
-						<line number="392" hits="0"/>
+						<line number="373" hits="1"/>
+						<line number="386" hits="0"/>
+						<line number="387" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="388,393"/>
+						<line number="388" hits="0"/>
+						<line number="389" hits="0"/>
+						<line number="390" hits="0"/>
 						<line number="393" hits="0"/>
-						<line number="394" hits="0"/>
 						<line number="395" hits="0"/>
-						<line number="396" hits="0"/>
 						<line number="397" hits="0"/>
 						<line number="398" hits="0"/>
-						<line number="399" hits="0"/>
-						<line number="404" hits="0"/>
-					</lines>
-				</class>
-				<class name="workflow_state.py" filename="orchestrator/workflow_state.py" complexity="0" line-rate="0.9167" branch-rate="1">
-					<methods/>
-					<lines>
-						<line number="3" hits="1"/>
-						<line number="4" hits="1"/>
-						<line number="7" hits="1"/>
-						<line number="9" hits="0"/>
-						<line number="12" hits="1"/>
-						<line number="22" hits="1"/>
-						<line number="25" hits="1"/>
-						<line number="28" hits="1"/>
-						<line number="31" hits="1"/>
-						<line number="34" hits="1"/>
-						<line number="37" hits="1"/>
-						<line number="40" hits="1"/>
-					</lines>
-				</class>
-			</classes>
-		</package>
-		<package name="orchestrator.agents" line-rate="0.362" branch-rate="0" complexity="0">
-			<classes>
-				<class name="__init__.py" filename="orchestrator/agents/__init__.py" complexity="0" line-rate="1" branch-rate="1">
-					<methods/>
-					<lines>
-						<line number="18" hits="1"/>
-						<line number="23" hits="1"/>
-						<line number="28" hits="1"/>
-						<line number="33" hits="1"/>
-						<line number="41" hits="1"/>
-						<line number="50" hits="1"/>
+						<line number="400" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="402,406"/>
+						<line number="402" hits="0"/>
+						<line number="403" hits="0"/>
+						<line number="406" hits="0"/>
+						<line number="408" hits="0"/>
+						<line number="409" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="411,412"/>
+						<line number="411" hits="0"/>
+						<line number="412" hits="0"/>
+						<line number="418" hits="0"/>
+						<line number="423" hits="1"/>
+						<line number="436" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="437,444"/>
+						<line number="437" hits="0"/>
+						<line number="442" hits="0"/>
+						<line number="444" hits="0"/>
+						<line number="445" hits="0"/>
+						<line number="446" hits="0"/>
+						<line number="447" hits="0"/>
+						<line number="448" hits="0"/>
+						<line number="449" hits="0"/>
+						<line number="450" hits="0"/>
+						<line number="451" hits="0"/>
+						<line number="456" hits="0"/>
 					</lines>
 				</class>
-				<class name="budget_controller.py" filename="orchestrator/agents/budget_controller.py" complexity="0" line-rate="0.4096" branch-rate="0">
+				<class name="workflow_editor.py" filename="orchestrator/workflow_editor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="9" hits="1"/>
-						<line number="10" hits="1"/>
-						<line number="11" hits="1"/>
-						<line number="12" hits="1"/>
-						<line number="13" hits="1"/>
-						<line number="14" hits="1"/>
-						<line number="16" hits="1"/>
-						<line number="18" hits="1"/>
-						<line number="20" hits="1"/>
-						<line number="25" hits="1"/>
-						<line number="27" hits="1"/>
-						<line number="28" hits="1"/>
-						<line number="29" hits="1"/>
-						<line number="30" hits="1"/>
-						<line number="33" hits="1"/>
-						<line number="35" hits="1"/>
-						<line number="36" hits="1"/>
-						<line number="37" hits="1"/>
-						<line number="38" hits="1"/>
-						<line number="39" hits="1"/>
-						<line number="44" hits="1"/>
-						<line number="45" hits="1"/>
-						<line number="47" hits="1"/>
-						<line number="48" hits="1"/>
-						<line number="49" hits="1"/>
-						<line number="50" hits="1"/>
-						<line number="51" hits="1"/>
-						<line number="52" hits="1"/>
-						<line number="53" hits="1"/>
-						<line number="54" hits="1"/>
-						<line number="55" hits="1"/>
-						<line number="56" hits="1"/>
-						<line number="58" hits="1"/>
-						<line number="59" hits="0"/>
-						<line number="73" hits="1"/>
-						<line number="74" hits="1"/>
-						<line number="76" hits="1"/>
-						<line number="77" hits="1"/>
-						<line number="78" hits="1"/>
-						<line number="79" hits="1"/>
-						<line number="80" hits="1"/>
-						<line number="81" hits="1"/>
-						<line number="82" hits="1"/>
-						<line number="83" hits="1"/>
-						<line number="84" hits="1"/>
-						<line number="85" hits="1"/>
-						<line number="87" hits="1"/>
-						<line number="88" hits="1"/>
-						<line number="89" hits="0"/>
-						<line number="91" hits="1"/>
-						<line number="92" hits="1"/>
-						<line number="93" hits="0"/>
-						<line number="95" hits="1"/>
-						<line number="96" hits="1"/>
-						<line number="97" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="98,99"/>
-						<line number="98" hits="0"/>
-						<line number="99" hits="0"/>
-						<line number="101" hits="1"/>
-						<line number="103" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="104,105"/>
-						<line number="104" hits="0"/>
-						<line number="105" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="106,107"/>
-						<line number="106" hits="0"/>
-						<line number="107" hits="0"/>
-						<line number="109" hits="1"/>
-						<line number="110" hits="0"/>
-						<line number="127" hits="1"/>
-						<line number="128" hits="1"/>
-						<line number="130" hits="1"/>
-						<line number="131" hits="1"/>
-						<line number="132" hits="1"/>
-						<line number="133" hits="1"/>
-						<line number="135" hits="1"/>
-						<line number="136" hits="0"/>
-						<line number="147" hits="1"/>
-						<line number="168" hits="1"/>
-						<line number="170" hits="0"/>
-						<line number="172" hits="0"/>
-						<line number="173" hits="0"/>
-						<line number="175" hits="0"/>
-						<line number="180" hits="1"/>
-						<line number="195" hits="1"/>
-						<line number="196" hits="1"/>
-						<line number="197" hits="1"/>
-						<line number="198" hits="1"/>
-						<line number="201" hits="1"/>
-						<line number="202" hits="1"/>
-						<line number="204" hits="1"/>
-						<line number="210" hits="0"/>
-						<line number="211" hits="0"/>
-						<line number="214" hits="0"/>
-						<line number="215" hits="0"/>
-						<line number="217" hits="0"/>
-						<line number="219" hits="1"/>
-						<line number="241" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="242,251"/>
-						<line number="242" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="243,244"/>
-						<line number="243" hits="0"/>
-						<line number="244" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="245,246"/>
-						<line number="245" hits="0"/>
-						<line number="246" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="247,249"/>
-						<line number="247" hits="0"/>
-						<line number="249" hits="0"/>
-						<line number="251" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="252,255"/>
-						<line number="252" hits="0"/>
-						<line number="255" hits="0"/>
-						<line number="256" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="257,259"/>
-						<line number="257" hits="0"/>
-						<line number="259" hits="0"/>
-						<line number="267" hits="0"/>
-						<line number="269" hits="0"/>
-						<line number="278" hits="0"/>
-						<line number="280" hits="1"/>
-						<line number="295" hits="0"/>
-						<line number="297" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="298,303"/>
-						<line number="298" hits="0"/>
-						<line number="303" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="304,311"/>
-						<line number="304" hits="0"/>
-						<line number="311" hits="0"/>
-						<line number="313" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="314,330"/>
-						<line number="314" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="315,322"/>
-						<line number="315" hits="0"/>
-						<line number="322" hits="0"/>
-						<line number="330" hits="0"/>
-						<line number="332" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="333,338"/>
-						<line number="333" hits="0"/>
-						<line number="338" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="339,345"/>
-						<line number="339" hits="0"/>
-						<line number="345" hits="0"/>
-						<line number="352" hits="1"/>
-						<line number="377" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="20" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="23" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="354" hits="0"/>
+						<line number="355" hits="0"/>
+						<line number="361" hits="0"/>
+						<line number="362" hits="0"/>
+						<line number="363" hits="0"/>
+						<line number="364" hits="0"/>
+						<line number="367" hits="0"/>
+						<line number="374" hits="0"/>
+						<line number="375" hits="0"/>
 						<line number="378" hits="0"/>
+						<line number="379" hits="0"/>
 						<line number="380" hits="0"/>
-						<line number="391" hits="0"/>
+						<line number="381" hits="0"/>
+						<line number="383" hits="0"/>
+						<line number="389" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="390,392"/>
+						<line number="390" hits="0"/>
+						<line number="392" hits="0"/>
+						<line number="393" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="394,426"/>
 						<line number="394" hits="0"/>
-						<line number="395" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="396,410"/>
-						<line number="396" hits="0"/>
-						<line number="397" hits="0"/>
-						<line number="400" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="401,410"/>
+						<line number="395" hits="0"/>
+						<line number="397" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="398,401"/>
+						<line number="398" hits="0"/>
+						<line number="399" hits="0"/>
 						<line number="401" hits="0"/>
-						<line number="402" hits="0"/>
-						<line number="410" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="411,425"/>
-						<line number="411" hits="0"/>
+						<line number="403" hits="0"/>
+						<line number="404" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="405,412"/>
+						<line number="405" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="404,406"/>
+						<line number="406" hits="0"/>
+						<line number="407" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="408,409"/>
+						<line number="408" hits="0"/>
+						<line number="409" hits="0"/>
+						<line number="410" hits="0"/>
 						<line number="412" hits="0"/>
-						<line number="422" hits="0"/>
+						<line number="417" hits="0"/>
+						<line number="418" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="419,420"/>
+						<line number="419" hits="0"/>
+						<line number="420" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="421,422"/>
+						<line number="421" hits="0"/>
+						<line number="422" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="423,424"/>
 						<line number="423" hits="0"/>
-						<line number="425" hits="0"/>
-						<line number="433" hits="0"/>
-						<line number="435" hits="1"/>
-						<line number="437" hits="0"/>
-						<line number="439" hits="1"/>
-						<line number="456" hits="0"/>
-						<line number="458" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="459,461"/>
-						<line number="459" hits="0"/>
-						<line number="461" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="462,464"/>
-						<line number="462" hits="0"/>
-						<line number="464" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="465,468"/>
+						<line number="424" hits="0"/>
+						<line number="426" hits="0"/>
+						<line number="428" hits="0"/>
+						<line number="429" hits="0"/>
+						<line number="432" hits="0"/>
+						<line number="434" hits="0"/>
+						<line number="438" hits="0"/>
+						<line number="439" hits="0"/>
+						<line number="441" hits="0"/>
+						<line number="442" hits="0"/>
+						<line number="448" hits="0"/>
+						<line number="449" hits="0"/>
+						<line number="450" hits="0"/>
+						<line number="452" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="453,470"/>
+						<line number="453" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="454,456"/>
+						<line number="454" hits="0"/>
+						<line number="455" hits="0"/>
+						<line number="456" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="457,459"/>
+						<line number="457" hits="0"/>
+						<line number="458" hits="0"/>
+						<line number="459" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="460,462"/>
+						<line number="460" hits="0"/>
+						<line number="461" hits="0"/>
+						<line number="462" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="463,464"/>
+						<line number="463" hits="0"/>
+						<line number="464" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="465,466"/>
 						<line number="465" hits="0"/>
+						<line number="466" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="452,467"/>
+						<line number="467" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="452,468"/>
 						<line number="468" hits="0"/>
-						<line number="469" hits="0"/>
 						<line number="470" hits="0"/>
-						<line number="471" hits="0"/>
-						<line number="474" hits="0"/>
-						<line number="475" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="476,490"/>
-						<line number="476" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="477,484"/>
+						<line number="471" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="472,473"/>
+						<line number="472" hits="0"/>
+						<line number="473" hits="0"/>
+						<line number="475" hits="0"/>
 						<line number="477" hits="0"/>
 						<line number="484" hits="0"/>
 						<line number="485" hits="0"/>
 						<line number="486" hits="0"/>
 						<line number="487" hits="0"/>
 						<line number="488" hits="0"/>
+						<line number="489" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="490,492"/>
 						<line number="490" hits="0"/>
-						<line number="499" hits="1"/>
+						<line number="492" hits="0"/>
+						<line number="493" hits="0"/>
+						<line number="495" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="496,505"/>
+						<line number="496" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="497,498"/>
+						<line number="497" hits="0"/>
+						<line number="498" hits="0"/>
+						<line number="499" hits="0"/>
+						<line number="500" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="501,502"/>
 						<line number="501" hits="0"/>
 						<line number="502" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="503,505"/>
 						<line number="503" hits="0"/>
-						<line number="505" hits="0"/>
+						<line number="505" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="506,508"/>
 						<line number="506" hits="0"/>
-						<line number="507" hits="0"/>
-						<line number="509" hits="1"/>
+						<line number="508" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="509,511"/>
+						<line number="509" hits="0"/>
 						<line number="511" hits="0"/>
-						<line number="512" hits="0"/>
-						<line number="514" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="515,520"/>
-						<line number="515" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="514,516"/>
-						<line number="516" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="514,517"/>
+						<line number="513" hits="0"/>
+						<line number="515" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="516,517"/>
+						<line number="516" hits="0"/>
 						<line number="517" hits="0"/>
 						<line number="518" hits="0"/>
-						<line number="520" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="521,523"/>
-						<line number="521" hits="0"/>
-						<line number="523" hits="0"/>
+						<line number="520" hits="0"/>
+						<line number="534" hits="0"/>
+						<line number="535" hits="0"/>
+						<line number="537" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="538,543"/>
+						<line number="538" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="539,540"/>
+						<line number="539" hits="0"/>
+						<line number="540" hits="0"/>
+						<line number="541" hits="0"/>
+						<line number="543" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="544,546"/>
+						<line number="544" hits="0"/>
+						<line number="546" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="547,550"/>
+						<line number="547" hits="0"/>
+						<line number="548" hits="0"/>
+						<line number="550" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="551,553"/>
+						<line number="551" hits="0"/>
+						<line number="553" hits="0"/>
+						<line number="560" hits="0"/>
+						<line number="562" hits="0"/>
+						<line number="563" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="564,567"/>
+						<line number="564" hits="0"/>
+						<line number="565" hits="0"/>
+						<line number="567" hits="0"/>
+						<line number="568" hits="0"/>
+						<line number="569" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="570,575"/>
+						<line number="570" hits="0"/>
+						<line number="571" hits="0"/>
+						<line number="572" hits="0"/>
+						<line number="573" hits="0"/>
+						<line number="575" hits="0"/>
+						<line number="576" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="577,591"/>
+						<line number="577" hits="0"/>
+						<line number="578" hits="0"/>
+						<line number="579" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="583,587"/>
+						<line number="583" hits="0"/>
+						<line number="584" hits="0"/>
+						<line number="585" hits="0"/>
+						<line number="586" hits="0"/>
+						<line number="587" hits="0"/>
+						<line number="591" hits="0"/>
+						<line number="593" hits="0"/>
+						<line number="609" hits="0"/>
+						<line number="612" hits="0"/>
+						<line number="613" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="614,628"/>
+						<line number="614" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="615,616"/>
+						<line number="615" hits="0"/>
+						<line number="616" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="617,618"/>
+						<line number="617" hits="0"/>
+						<line number="618" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="619,620"/>
+						<line number="619" hits="0"/>
+						<line number="620" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="621,623"/>
+						<line number="621" hits="0"/>
+						<line number="623" hits="0"/>
+						<line number="624" hits="0"/>
+						<line number="625" hits="0"/>
+						<line number="628" hits="0"/>
+						<line number="629" hits="0"/>
+						<line number="631" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="632,634"/>
+						<line number="632" hits="0"/>
+						<line number="634" hits="0"/>
+						<line number="635" hits="0"/>
+						<line number="637" hits="0"/>
+						<line number="645" hits="0"/>
+						<line number="657" hits="0"/>
+						<line number="667" hits="0"/>
+						<line number="669" hits="0"/>
+						<line number="685" hits="0"/>
+						<line number="687" hits="0"/>
+						<line number="689" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="690,726"/>
+						<line number="690" hits="0"/>
+						<line number="691" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="692,699"/>
+						<line number="692" hits="0"/>
+						<line number="693" hits="0"/>
+						<line number="699" hits="0"/>
+						<line number="710" hits="0"/>
+						<line number="712" hits="0"/>
+						<line number="713" hits="0"/>
+						<line number="714" hits="0"/>
+						<line number="715" hits="0"/>
+						<line number="716" hits="0"/>
+						<line number="717" hits="0"/>
+						<line number="718" hits="0"/>
+						<line number="719" hits="0"/>
+						<line number="726" hits="0"/>
+						<line number="732" hits="0"/>
+						<line number="744" hits="0"/>
+						<line number="746" hits="0"/>
+						<line number="747" hits="0"/>
+						<line number="751" hits="0"/>
+						<line number="752" hits="0"/>
+						<line number="753" hits="0"/>
+						<line number="756" hits="0"/>
+						<line number="767" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="768,770"/>
+						<line number="768" hits="0"/>
+						<line number="770" hits="0"/>
+						<line number="773" hits="0"/>
+						<line number="774" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="776,777"/>
+						<line number="776" hits="0"/>
+						<line number="777" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="778,785"/>
+						<line number="778" hits="0"/>
+						<line number="785" hits="0"/>
+						<line number="786" hits="0"/>
+						<line number="788" hits="0"/>
+						<line number="818" hits="0"/>
+						<line number="825" hits="0"/>
+						<line number="833" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="834,836"/>
+						<line number="834" hits="0"/>
+						<line number="836" hits="0"/>
+						<line number="837" hits="0"/>
+						<line number="838" hits="0"/>
+						<line number="839" hits="0"/>
+						<line number="840" hits="0"/>
+						<line number="841" hits="0"/>
+						<line number="843" hits="0"/>
+						<line number="845" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="846,856"/>
+						<line number="846" hits="0"/>
+						<line number="847" hits="0"/>
+						<line number="852" hits="0"/>
+						<line number="856" hits="0"/>
+						<line number="857" hits="0"/>
+						<line number="858" hits="0"/>
+						<line number="859" hits="0"/>
+						<line number="860" hits="0"/>
+						<line number="862" hits="0"/>
+						<line number="869" hits="0"/>
+						<line number="870" hits="0"/>
+						<line number="874" hits="0"/>
+						<line number="876" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="877,886"/>
+						<line number="877" hits="0"/>
+						<line number="878" hits="0"/>
+						<line number="886" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="887,900"/>
+						<line number="887" hits="0"/>
+						<line number="888" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="889,900"/>
+						<line number="889" hits="0"/>
+						<line number="894" hits="0"/>
+						<line number="900" hits="0"/>
+						<line number="906" hits="0"/>
 					</lines>
 				</class>
-				<class name="handoff_protocol.py" filename="orchestrator/agents/handoff_protocol.py" complexity="0" line-rate="0.3886" branch-rate="0">
+				<class name="workflow_generator.py" filename="orchestrator/workflow_generator.py" complexity="0" line-rate="0.1204" branch-rate="0">
 					<methods/>
 					<lines>
+						<line number="8" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="14" hits="1"/>
+						<line number="15" hits="1"/>
 						<line number="16" hits="1"/>
-						<line number="17" hits="1"/>
 						<line number="18" hits="1"/>
-						<line number="19" hits="1"/>
 						<line number="20" hits="1"/>
 						<line number="21" hits="1"/>
 						<line number="23" hits="1"/>
-						<line number="25" hits="1"/>
+						<line number="28" hits="1"/>
+						<line number="29" hits="1"/>
 						<line number="30" hits="1"/>
-						<line number="35" hits="1"/>
-						<line number="40" hits="1"/>
-						<line number="45" hits="1"/>
+						<line number="31" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="42" hits="1"/>
 						<line number="47" hits="1"/>
-						<line number="52" hits="1"/>
-						<line number="54" hits="1"/>
-						<line number="55" hits="1"/>
-						<line number="56" hits="1"/>
-						<line number="57" hits="1"/>
-						<line number="58" hits="1"/>
-						<line number="61" hits="1"/>
-						<line number="63" hits="1"/>
-						<line number="64" hits="1"/>
-						<line number="67" hits="1"/>
-						<line number="69" hits="1"/>
-						<line number="70" hits="1"/>
-						<line number="71" hits="1"/>
-						<line number="72" hits="1"/>
-						<line number="73" hits="1"/>
-						<line number="78" hits="1"/>
-						<line number="79" hits="1"/>
-						<line number="81" hits="1"/>
-						<line number="82" hits="1"/>
-						<line number="83" hits="1"/>
-						<line number="84" hits="1"/>
-						<line number="85" hits="1"/>
-						<line number="86" hits="1"/>
-						<line number="87" hits="1"/>
-						<line number="88" hits="1"/>
-						<line number="90" hits="1"/>
-						<line number="91" hits="1"/>
-						<line number="92" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="93,94"/>
-						<line number="93" hits="0"/>
-						<line number="94" hits="0"/>
-						<line number="96" hits="1"/>
-						<line number="97" hits="0"/>
-						<line number="111" hits="1"/>
-						<line number="112" hits="1"/>
-						<line number="114" hits="1"/>
-						<line number="115" hits="1"/>
-						<line number="116" hits="1"/>
-						<line number="117" hits="1"/>
-						<line number="118" hits="1"/>
-						<line number="119" hits="1"/>
-						<line number="122" hits="1"/>
-						<line number="123" hits="1"/>
-						<line number="126" hits="1"/>
-						<line number="129" hits="1"/>
-						<line number="132" hits="1"/>
-						<line number="133" hits="1"/>
-						<line number="136" hits="1"/>
-						<line number="137" hits="1"/>
-						<line number="139" hits="1"/>
-						<line number="140" hits="1"/>
-						<line number="141" hits="0"/>
-						<line number="143" hits="1"/>
-						<line number="144" hits="1"/>
-						<line number="145" hits="0"/>
-						<line number="147" hits="1"/>
-						<line number="148" hits="1"/>
-						<line number="149" hits="0"/>
-						<line number="151" hits="1"/>
-						<line number="152" hits="1"/>
-						<line number="153" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="154,155"/>
-						<line number="154" hits="0"/>
-						<line number="155" hits="0"/>
-						<line number="157" hits="1"/>
-						<line number="158" hits="0"/>
-						<line number="177" hits="1"/>
-						<line number="193" hits="1"/>
-						<line number="194" hits="1"/>
-						<line number="196" hits="1"/>
-						<line number="204" hits="0"/>
-						<line number="205" hits="0"/>
-						<line number="206" hits="0"/>
-						<line number="207" hits="0"/>
-						<line number="210" hits="0"/>
-						<line number="212" hits="0"/>
-						<line number="214" hits="1"/>
+						<line number="127" hits="1"/>
+						<line number="239" hits="1"/>
+						<line number="241" hits="0"/>
+						<line number="242" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="243,244"/>
+						<line number="243" hits="0"/>
+						<line number="244" hits="0"/>
 						<line number="245" hits="0"/>
-						<line number="254" hits="0"/>
-						<line number="255" hits="0"/>
-						<line number="256" hits="0"/>
+						<line number="246" hits="0"/>
+						<line number="248" hits="0"/>
+						<line number="249" hits="0"/>
+						<line number="250" hits="0"/>
 						<line number="258" hits="0"/>
+						<line number="259" hits="0"/>
 						<line number="260" hits="0"/>
-						<line number="264" hits="0"/>
-						<line number="266" hits="0"/>
-						<line number="269" hits="0"/>
-						<line number="270" hits="0"/>
-						<line number="272" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="273,276"/>
-						<line number="273" hits="0"/>
+						<line number="261" hits="0"/>
+						<line number="262" hits="0"/>
+						<line number="265" hits="1"/>
+						<line number="270" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="271,274"/>
+						<line number="271" hits="0"/>
 						<line number="274" hits="0"/>
+						<line number="275" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="276,286"/>
 						<line number="276" hits="0"/>
-						<line number="279" hits="0"/>
+						<line number="277" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="278,284"/>
+						<line number="278" hits="0"/>
+						<line number="279" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="280,284"/>
+						<line number="280" hits="0"/>
+						<line number="281" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="279,282"/>
+						<line number="282" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="281,283"/>
 						<line number="283" hits="0"/>
+						<line number="284" hits="0"/>
 						<line number="286" hits="0"/>
+						<line number="287" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="288,291"/>
+						<line number="288" hits="0"/>
+						<line number="291" hits="0"/>
 						<line number="292" hits="0"/>
-						<line number="295" hits="0"/>
-						<line number="300" hits="0"/>
-						<line number="303" hits="0"/>
+						<line number="293" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="294,297"/>
+						<line number="294" hits="0"/>
+						<line number="297" hits="0"/>
+						<line number="298" hits="0"/>
+						<line number="299" hits="0"/>
+						<line number="302" hits="1"/>
 						<line number="306" hits="0"/>
-						<line number="309" hits="0"/>
+						<line number="307" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="308,310"/>
+						<line number="308" hits="0"/>
 						<line number="310" hits="0"/>
-						<line number="312" hits="0"/>
+						<line number="312" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="313,314"/>
+						<line number="313" hits="0"/>
 						<line number="314" hits="0"/>
-						<line number="322" hits="0"/>
-						<line number="324" hits="0"/>
-						<line number="325" hits="0"/>
-						<line number="326" hits="0"/>
+						<line number="315" hits="0"/>
+						<line number="316" hits="0"/>
+						<line number="317" hits="0"/>
+						<line number="320" hits="1"/>
+						<line number="326" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="327,329"/>
 						<line number="327" hits="0"/>
-						<line number="328" hits="0"/>
-						<line number="330" hits="1"/>
-						<line number="337" hits="0"/>
-						<line number="345" hits="0"/>
-						<line number="348" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="349,358"/>
+						<line number="329" hits="0"/>
+						<line number="331" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="332,333"/>
+						<line number="332" hits="0"/>
+						<line number="333" hits="0"/>
+						<line number="336" hits="1"/>
+						<line number="338" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="339,341"/>
+						<line number="339" hits="0"/>
+						<line number="341" hits="0"/>
+						<line number="346" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="348,354"/>
+						<line number="348" hits="0"/>
 						<line number="349" hits="0"/>
-						<line number="358" hits="0"/>
-						<line number="360" hits="1"/>
-						<line number="362" hits="0"/>
-						<line number="364" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,366"/>
-						<line number="366" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="367,372"/>
-						<line number="367" hits="0"/>
+						<line number="350" hits="0"/>
+						<line number="351" hits="0"/>
+						<line number="352" hits="0"/>
+						<line number="354" hits="0"/>
+						<line number="357" hits="1"/>
+						<line number="359" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="360,361"/>
+						<line number="360" hits="0"/>
+						<line number="361" hits="0"/>
+						<line number="362" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="363,367"/>
+						<line number="363" hits="0"/>
+						<line number="367" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="368,372"/>
 						<line number="368" hits="0"/>
-						<line number="369" hits="0"/>
-						<line number="372" hits="0"/>
-						<line number="375" hits="0"/>
-						<line number="376" hits="0"/>
-						<line number="383" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="364,384"/>
-						<line number="384" hits="0"/>
-						<line number="386" hits="1"/>
-						<line number="392" hits="0"/>
-						<line number="393" hits="0"/>
-						<line number="395" hits="0"/>
-						<line number="397" hits="0"/>
-						<line number="409" hits="0"/>
-						<line number="410" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="411,424"/>
-						<line number="411" hits="0"/>
-						<line number="413" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="414,416"/>
-						<line number="414" hits="0"/>
-						<line number="416" hits="0"/>
-						<line number="417" hits="0"/>
-						<line number="424" hits="0"/>
-						<line number="425" hits="0"/>
-						<line number="427" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="428,430"/>
-						<line number="428" hits="0"/>
-						<line number="430" hits="0"/>
-						<line number="431" hits="0"/>
-						<line number="434" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,435"/>
-						<line number="435" hits="0"/>
+						<line number="372" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="373,377"/>
+						<line number="373" hits="0"/>
+						<line number="377" hits="0"/>
+						<line number="380" hits="1"/>
+						<line number="381" hits="1"/>
+						<line number="387" hits="0"/>
+						<line number="388" hits="0"/>
+						<line number="389" hits="0"/>
+						<line number="390" hits="0"/>
+						<line number="393" hits="1"/>
+						<line number="400" hits="1"/>
+						<line number="420" hits="0"/>
+						<line number="429" hits="0"/>
+						<line number="437" hits="0"/>
+						<line number="443" hits="1"/>
+						<line number="444" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="445,457"/>
 						<line number="445" hits="0"/>
-						<line number="446" hits="0"/>
-						<line number="447" hits="0"/>
-						<line number="448" hits="0"/>
-						<line number="449" hits="0"/>
-						<line number="455" hits="1"/>
-						<line number="461" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="462,464"/>
-						<line number="462" hits="0"/>
-						<line number="464" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="465,476"/>
+						<line number="457" hits="0"/>
+						<line number="458" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="459,517"/>
+						<line number="459" hits="0"/>
+						<line number="460" hits="0"/>
+						<line number="461" hits="0"/>
+						<line number="464" hits="0"/>
 						<line number="465" hits="0"/>
-						<line number="468" hits="0"/>
-						<line number="473" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="464,474"/>
+						<line number="467" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="468,474"/>
+						<line number="468" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="469,470"/>
+						<line number="469" hits="0"/>
+						<line number="470" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="467,471"/>
+						<line number="471" hits="0"/>
 						<line number="474" hits="0"/>
+						<line number="475" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="476,485"/>
 						<line number="476" hits="0"/>
-						<line number="478" hits="1"/>
+						<line number="477" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="478,479"/>
+						<line number="478" hits="0"/>
+						<line number="479" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="480,481"/>
+						<line number="480" hits="0"/>
 						<line number="481" hits="0"/>
-						<line number="482" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="483,488"/>
-						<line number="483" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="482,484"/>
-						<line number="484" hits="0"/>
+						<line number="482" hits="0"/>
 						<line number="485" hits="0"/>
-						<line number="488" hits="0"/>
-						<line number="501" hits="0"/>
+						<line number="486" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="487,490"/>
+						<line number="487" hits="0"/>
+						<line number="490" hits="0"/>
+						<line number="491" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="492,503"/>
+						<line number="492" hits="0"/>
+						<line number="493" hits="0"/>
+						<line number="494" hits="0"/>
+						<line number="495" hits="0"/>
+						<line number="496" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="497,499"/>
+						<line number="497" hits="0"/>
+						<line number="498" hits="0"/>
+						<line number="499" hits="0"/>
+						<line number="503" hits="0"/>
+						<line number="504" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="505,507"/>
+						<line number="505" hits="0"/>
+						<line number="507" hits="0"/>
+						<line number="508" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="509,511"/>
 						<line number="509" hits="0"/>
-						<line number="511" hits="1"/>
+						<line number="511" hits="0"/>
+						<line number="512" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="513,515"/>
 						<line number="513" hits="0"/>
-						<line number="514" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="515,525"/>
 						<line number="515" hits="0"/>
-						<line number="523" hits="0"/>
-						<line number="525" hits="0"/>
-						<line number="527" hits="1"/>
+						<line number="517" hits="0"/>
+						<line number="523" hits="1"/>
+						<line number="524" hits="1"/>
+						<line number="527" hits="0"/>
+						<line number="529" hits="0"/>
 						<line number="530" hits="0"/>
-						<line number="531" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="532,533"/>
-						<line number="532" hits="0"/>
-						<line number="533" hits="0"/>
-						<line number="535" hits="1"/>
-						<line number="542" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="543,545"/>
+						<line number="532" hits="1"/>
+						<line number="539" hits="0"/>
+						<line number="541" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="542,546"/>
+						<line number="542" hits="0"/>
 						<line number="543" hits="0"/>
-						<line number="545" hits="0"/>
-						<line number="552" hits="1"/>
-						<line number="554" hits="0"/>
-						<line number="556" hits="1"/>
+						<line number="546" hits="0"/>
+						<line number="547" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="548,554"/>
+						<line number="548" hits="0"/>
+						<line number="549" hits="0"/>
+						<line number="550" hits="0"/>
+						<line number="551" hits="0"/>
+						<line number="552" hits="0"/>
+						<line number="554" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="556,569"/>
+						<line number="556" hits="0"/>
+						<line number="557" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="558,565"/>
 						<line number="558" hits="0"/>
-						<line number="559" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="560,562"/>
+						<line number="559" hits="0"/>
 						<line number="560" hits="0"/>
-						<line number="562" hits="0"/>
-						<line number="563" hits="0"/>
+						<line number="561" hits="0"/>
 						<line number="565" hits="0"/>
-						<line number="566" hits="0"/>
-						<line number="568" hits="1"/>
+						<line number="569" hits="0"/>
 						<line number="570" hits="0"/>
-						<line number="571" hits="0"/>
 						<line number="572" hits="0"/>
-						<line number="574" hits="0"/>
-					</lines>
-				</class>
-				<class name="kilo_adapter.py" filename="orchestrator/agents/kilo_adapter.py" complexity="0" line-rate="0.3481" branch-rate="0">
-					<methods/>
-					<lines>
-						<line number="9" hits="1"/>
-						<line number="10" hits="1"/>
-						<line number="11" hits="1"/>
-						<line number="12" hits="1"/>
-						<line number="13" hits="1"/>
-						<line number="15" hits="1"/>
-						<line number="17" hits="1"/>
-						<line number="25" hits="1"/>
-						<line number="32" hits="1"/>
-						<line number="37" hits="1"/>
-						<line number="38" hits="1"/>
-						<line number="40" hits="1"/>
-						<line number="41" hits="1"/>
-						<line number="42" hits="1"/>
-						<line number="43" hits="1"/>
-						<line number="44" hits="1"/>
-						<line number="45" hits="1"/>
-						<line number="46" hits="1"/>
-						<line number="47" hits="1"/>
-						<line number="49" hits="1"/>
-						<line number="50" hits="0"/>
-						<line number="62" hits="1"/>
-						<line number="63" hits="1"/>
-						<line number="65" hits="1"/>
-						<line number="66" hits="1"/>
-						<line number="67" hits="1"/>
-						<line number="68" hits="1"/>
-						<line number="69" hits="1"/>
-						<line number="70" hits="1"/>
-						<line number="71" hits="1"/>
-						<line number="72" hits="1"/>
-						<line number="73" hits="1"/>
-						<line number="74" hits="1"/>
-						<line number="75" hits="1"/>
-						<line number="77" hits="1"/>
-						<line number="78" hits="0"/>
-						<line number="95" hits="1"/>
-						<line number="103" hits="1"/>
-						<line number="109" hits="0"/>
-						<line number="110" hits="0"/>
-						<line number="111" hits="0"/>
-						<line number="113" hits="0"/>
-						<line number="115" hits="1"/>
-						<line number="125" hits="0"/>
-						<line number="127" hits="0"/>
-						<line number="129" hits="0"/>
-						<line number="134" hits="0"/>
-						<line number="142" hits="0"/>
-						<line number="145" hits="0"/>
-						<line number="148" hits="0"/>
-						<line number="149" hits="0"/>
-						<line number="151" hits="0"/>
-						<line number="158" hits="0"/>
-						<line number="160" hits="0"/>
-						<line number="161" hits="0"/>
-						<line number="162" hits="0"/>
-						<line number="164" hits="0"/>
-						<line number="172" hits="0"/>
-						<line number="173" hits="0"/>
-						<line number="174" hits="0"/>
-						<line number="176" hits="0"/>
-						<line number="184" hits="1"/>
-						<line number="190" hits="0"/>
-						<line number="193" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="194,204"/>
-						<line number="194" hits="0"/>
-						<line number="197" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="198,201"/>
-						<line number="198" hits="0"/>
-						<line number="201" hits="0"/>
-						<line number="204" hits="0"/>
-						<line number="209" hits="0"/>
-						<line number="210" hits="0"/>
+						<line number="573" hits="0"/>
+						<line number="575" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="576,579"/>
+						<line number="576" hits="0"/>
+						<line number="579" hits="0"/>
+						<line number="582" hits="0"/>
+						<line number="583" hits="0"/>
+						<line number="585" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="586,596"/>
+						<line number="586" hits="0"/>
+						<line number="587" hits="0"/>
+						<line number="588" hits="0"/>
+						<line number="589" hits="0"/>
+						<line number="590" hits="0"/>
+						<line number="596" hits="0"/>
+						<line number="597" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="598,627"/>
+						<line number="598" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="599,600"/>
+						<line number="599" hits="0"/>
+						<line number="600" hits="0"/>
+						<line number="602" hits="0"/>
+						<line number="603" hits="0"/>
+						<line number="604" hits="0"/>
+						<line number="605" hits="0"/>
+						<line number="608" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="609,616"/>
+						<line number="609" hits="0"/>
+						<line number="616" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="617,624"/>
+						<line number="617" hits="0"/>
+						<line number="624" hits="0"/>
+						<line number="627" hits="0"/>
+						<line number="628" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="629,632"/>
+						<line number="629" hits="0"/>
+						<line number="630" hits="0"/>
+						<line number="632" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="633,678"/>
+						<line number="633" hits="0"/>
+						<line number="634" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="635,636"/>
+						<line number="635" hits="0"/>
+						<line number="636" hits="0"/>
+						<line number="637" hits="0"/>
+						<line number="639" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="640,642"/>
+						<line number="640" hits="0"/>
+						<line number="642" hits="0"/>
+						<line number="643" hits="0"/>
+						<line number="644" hits="0"/>
+						<line number="647" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="648,655"/>
+						<line number="648" hits="0"/>
+						<line number="655" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="656,659"/>
+						<line number="656" hits="0"/>
+						<line number="659" hits="0"/>
+						<line number="660" hits="0"/>
+						<line number="663" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="632,664"/>
+						<line number="664" hits="0"/>
+						<line number="665" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="666,673"/>
+						<line number="666" hits="0"/>
+						<line number="671" hits="0"/>
+						<line number="673" hits="0"/>
+						<line number="674" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="632,675"/>
+						<line number="675" hits="0"/>
+						<line number="678" hits="0"/>
+						<line number="679" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="680,688"/>
+						<line number="680" hits="0"/>
+						<line number="688" hits="0"/>
+						<line number="694" hits="1"/>
+						<line number="706" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="707,720"/>
+						<line number="707" hits="0"/>
+						<line number="709" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="710,712"/>
+						<line number="710" hits="0"/>
+						<line number="712" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="713,715"/>
+						<line number="713" hits="0"/>
+						<line number="715" hits="0"/>
+						<line number="716" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="706,717"/>
+						<line number="717" hits="0"/>
+						<line number="720" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="721,729"/>
+						<line number="721" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="722,723"/>
+						<line number="722" hits="0"/>
+						<line number="723" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="724,725"/>
+						<line number="724" hits="0"/>
+						<line number="725" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="726,729"/>
+						<line number="726" hits="0"/>
+						<line number="729" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="730,734"/>
+						<line number="730" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="731,734"/>
+						<line number="731" hits="0"/>
+						<line number="734" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="735,741"/>
+						<line number="735" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="736,737"/>
+						<line number="736" hits="0"/>
+						<line number="737" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="738,741"/>
+						<line number="738" hits="0"/>
+						<line number="741" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,742"/>
+						<line number="742" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,743"/>
+						<line number="743" hits="0"/>
+						<line number="752" hits="0"/>
+						<line number="761" hits="1"/>
+						<line number="770" hits="0"/>
+						<line number="771" hits="0"/>
+						<line number="773" hits="0"/>
+						<line number="774" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="775,776"/>
+						<line number="775" hits="0"/>
+						<line number="776" hits="0"/>
+						<line number="778" hits="0"/>
+						<line number="798" hits="0"/>
+						<line number="806" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="807,809"/>
+						<line number="807" hits="0"/>
+						<line number="809" hits="0"/>
+						<line number="810" hits="0"/>
+						<line number="811" hits="0"/>
+						<line number="812" hits="0"/>
+						<line number="813" hits="0"/>
+						<line number="814" hits="0"/>
+						<line number="816" hits="0"/>
+						<line number="818" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="820,830"/>
+						<line number="820" hits="0"/>
+						<line number="821" hits="0"/>
+						<line number="826" hits="0"/>
+						<line number="830" hits="0"/>
+						<line number="831" hits="0"/>
+						<line number="832" hits="0"/>
+						<line number="833" hits="0"/>
+						<line number="834" hits="0"/>
+						<line number="838" hits="0"/>
+						<line number="845" hits="0"/>
+						<line number="851" hits="1"/>
+						<line number="853" hits="1"/>
+						<line number="860" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="861,863"/>
+						<line number="861" hits="0"/>
+						<line number="863" hits="0"/>
+						<line number="864" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="865,866"/>
+						<line number="865" hits="0"/>
+						<line number="866" hits="0"/>
+						<line number="878" hits="1"/>
+						<line number="892" hits="0"/>
+						<line number="894" hits="0"/>
+						<line number="896" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="897,923"/>
+						<line number="897" hits="0"/>
+						<line number="903" hits="0"/>
+						<line number="911" hits="0"/>
+						<line number="912" hits="0"/>
+						<line number="913" hits="0"/>
+						<line number="914" hits="0"/>
+						<line number="915" hits="0"/>
+						<line number="916" hits="0"/>
+						<line number="923" hits="0"/>
+					</lines>
+				</class>
+				<class name="workflow_state.py" filename="orchestrator/workflow_state.py" complexity="0" line-rate="0.8125" branch-rate="1">
+					<methods/>
+					<lines>
+						<line number="3" hits="1"/>
+						<line number="4" hits="1"/>
+						<line number="7" hits="1"/>
+						<line number="9" hits="0"/>
+						<line number="12" hits="1"/>
+						<line number="14" hits="0"/>
+						<line number="17" hits="1"/>
+						<line number="19" hits="0"/>
+						<line number="22" hits="1"/>
+						<line number="31" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="40" hits="1"/>
+						<line number="43" hits="1"/>
+						<line number="46" hits="1"/>
+						<line number="49" hits="1"/>
+					</lines>
+				</class>
+				<class name="workflow_validator.py" filename="orchestrator/workflow_validator.py" complexity="0" line-rate="0.5968" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="11" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="49" hits="1"/>
+						<line number="65" hits="1"/>
+						<line number="68" hits="1"/>
+						<line number="69" hits="1"/>
+						<line number="70" hits="1"/>
+						<line number="73" hits="1"/>
+						<line number="82" hits="1"/>
+						<line number="83" hits="1"/>
+						<line number="84" hits="1"/>
+						<line number="85" hits="1"/>
+						<line number="88" hits="1"/>
+						<line number="91" hits="1"/>
+						<line number="92" hits="1"/>
+						<line number="93" hits="1"/>
+						<line number="94" hits="1"/>
+						<line number="95" hits="1"/>
+						<line number="96" hits="1"/>
+						<line number="99" hits="1"/>
+						<line number="112" hits="1"/>
+						<line number="113" hits="1"/>
+						<line number="114" hits="1"/>
+						<line number="116" hits="1"/>
+						<line number="117" hits="1"/>
+						<line number="120" hits="0"/>
+						<line number="121" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="122,128"/>
+						<line number="122" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="123,126"/>
+						<line number="123" hits="0"/>
+						<line number="126" hits="0"/>
+						<line number="128" hits="0"/>
+						<line number="129" hits="0"/>
+						<line number="132" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="133,140"/>
+						<line number="133" hits="0"/>
+						<line number="140" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="141,153"/>
+						<line number="141" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="142,146"/>
+						<line number="142" hits="0"/>
+						<line number="146" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="140,147"/>
+						<line number="147" hits="0"/>
+						<line number="153" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="154,163"/>
+						<line number="154" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="153,155"/>
+						<line number="155" hits="0"/>
+						<line number="163" hits="0"/>
+						<line number="168" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="169,178"/>
+						<line number="169" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="168,170"/>
+						<line number="170" hits="0"/>
+						<line number="171" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="168,172"/>
+						<line number="172" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="171,173"/>
+						<line number="173" hits="0"/>
+						<line number="178" hits="0"/>
+						<line number="186" hits="1"/>
+						<line number="205" hits="1"/>
+						<line number="206" hits="1"/>
+						<line number="207" hits="1"/>
+						<line number="208" hits="1"/>
+						<line number="209" hits="1"/>
+						<line number="210" hits="1"/>
+						<line number="211" hits="1"/>
 						<line number="212" hits="1"/>
+						<line number="213" hits="1"/>
+					</lines>
+				</class>
+			</classes>
+		</package>
+		<package name="orchestrator.agents" line-rate="0.362" branch-rate="0" complexity="0">
+			<classes>
+				<class name="__init__.py" filename="orchestrator/agents/__init__.py" complexity="0" line-rate="1" branch-rate="1">
+					<methods/>
+					<lines>
+						<line number="18" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="28" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="41" hits="1"/>
+						<line number="50" hits="1"/>
+					</lines>
+				</class>
+				<class name="budget_controller.py" filename="orchestrator/agents/budget_controller.py" complexity="0" line-rate="0.4096" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="9" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="14" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="25" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="28" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="30" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="35" hits="1"/>
+						<line number="36" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="39" hits="1"/>
+						<line number="44" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="47" hits="1"/>
+						<line number="48" hits="1"/>
+						<line number="49" hits="1"/>
+						<line number="50" hits="1"/>
+						<line number="51" hits="1"/>
+						<line number="52" hits="1"/>
+						<line number="53" hits="1"/>
+						<line number="54" hits="1"/>
+						<line number="55" hits="1"/>
+						<line number="56" hits="1"/>
+						<line number="58" hits="1"/>
+						<line number="59" hits="0"/>
+						<line number="73" hits="1"/>
+						<line number="74" hits="1"/>
+						<line number="76" hits="1"/>
+						<line number="77" hits="1"/>
+						<line number="78" hits="1"/>
+						<line number="79" hits="1"/>
+						<line number="80" hits="1"/>
+						<line number="81" hits="1"/>
+						<line number="82" hits="1"/>
+						<line number="83" hits="1"/>
+						<line number="84" hits="1"/>
+						<line number="85" hits="1"/>
+						<line number="87" hits="1"/>
+						<line number="88" hits="1"/>
+						<line number="89" hits="0"/>
+						<line number="91" hits="1"/>
+						<line number="92" hits="1"/>
+						<line number="93" hits="0"/>
+						<line number="95" hits="1"/>
+						<line number="96" hits="1"/>
+						<line number="97" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="98,99"/>
+						<line number="98" hits="0"/>
+						<line number="99" hits="0"/>
+						<line number="101" hits="1"/>
+						<line number="103" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="104,105"/>
+						<line number="104" hits="0"/>
+						<line number="105" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="106,107"/>
+						<line number="106" hits="0"/>
+						<line number="107" hits="0"/>
+						<line number="109" hits="1"/>
+						<line number="110" hits="0"/>
+						<line number="127" hits="1"/>
+						<line number="128" hits="1"/>
+						<line number="130" hits="1"/>
+						<line number="131" hits="1"/>
+						<line number="132" hits="1"/>
+						<line number="133" hits="1"/>
+						<line number="135" hits="1"/>
+						<line number="136" hits="0"/>
+						<line number="147" hits="1"/>
+						<line number="168" hits="1"/>
+						<line number="170" hits="0"/>
+						<line number="172" hits="0"/>
+						<line number="173" hits="0"/>
+						<line number="175" hits="0"/>
+						<line number="180" hits="1"/>
+						<line number="195" hits="1"/>
+						<line number="196" hits="1"/>
+						<line number="197" hits="1"/>
+						<line number="198" hits="1"/>
+						<line number="201" hits="1"/>
+						<line number="202" hits="1"/>
+						<line number="204" hits="1"/>
+						<line number="210" hits="0"/>
+						<line number="211" hits="0"/>
 						<line number="214" hits="0"/>
 						<line number="215" hits="0"/>
-						<line number="216" hits="0"/>
-						<line number="220" hits="0"/>
-						<line number="221" hits="0"/>
-						<line number="223" hits="1"/>
-						<line number="229" hits="0"/>
-						<line number="231" hits="0"/>
-						<line number="234" hits="0"/>
-						<line number="244" hits="0"/>
-						<line number="246" hits="0"/>
+						<line number="217" hits="0"/>
+						<line number="219" hits="1"/>
+						<line number="241" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="242,251"/>
+						<line number="242" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="243,244"/>
+						<line number="243" hits="0"/>
+						<line number="244" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="245,246"/>
+						<line number="245" hits="0"/>
+						<line number="246" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="247,249"/>
 						<line number="247" hits="0"/>
-						<line number="248" hits="0"/>
 						<line number="249" hits="0"/>
-						<line number="254" hits="0"/>
-						<line number="256" hits="1"/>
-						<line number="258" hits="0"/>
-						<line number="266" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="267,269"/>
+						<line number="251" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="252,255"/>
+						<line number="252" hits="0"/>
+						<line number="255" hits="0"/>
+						<line number="256" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="257,259"/>
+						<line number="257" hits="0"/>
+						<line number="259" hits="0"/>
 						<line number="267" hits="0"/>
-						<line number="268" hits="0"/>
-						<line number="269" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="270,271"/>
-						<line number="270" hits="0"/>
-						<line number="271" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="272,274"/>
-						<line number="272" hits="0"/>
-						<line number="274" hits="0"/>
-						<line number="276" hits="1"/>
-						<line number="283" hits="0"/>
-						<line number="295" hits="1"/>
-						<line number="297" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="298,300"/>
+						<line number="269" hits="0"/>
+						<line number="278" hits="0"/>
+						<line number="280" hits="1"/>
+						<line number="295" hits="0"/>
+						<line number="297" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="298,303"/>
 						<line number="298" hits="0"/>
-						<line number="300" hits="0"/>
-						<line number="307" hits="1"/>
-						<line number="314" hits="0"/>
-						<line number="315" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,317"/>
-						<line number="317" hits="0"/>
-						<line number="324" hits="0"/>
+						<line number="303" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="304,311"/>
+						<line number="304" hits="0"/>
+						<line number="311" hits="0"/>
+						<line number="313" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="314,330"/>
+						<line number="314" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="315,322"/>
+						<line number="315" hits="0"/>
+						<line number="322" hits="0"/>
+						<line number="330" hits="0"/>
+						<line number="332" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="333,338"/>
 						<line number="333" hits="0"/>
+						<line number="338" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="339,345"/>
 						<line number="339" hits="0"/>
-						<line number="341" hits="0"/>
-						<line number="347" hits="1"/>
-						<line number="353" hits="0"/>
-						<line number="355" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="356,359"/>
-						<line number="356" hits="0"/>
-						<line number="357" hits="0"/>
-						<line number="359" hits="0"/>
-						<line number="361" hits="1"/>
-						<line number="367" hits="0"/>
-						<line number="369" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="370,377"/>
-						<line number="370" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="369,371"/>
-						<line number="371" hits="0"/>
-						<line number="375" hits="0"/>
+						<line number="345" hits="0"/>
+						<line number="352" hits="1"/>
 						<line number="377" hits="0"/>
-						<line number="379" hits="0"/>
+						<line number="378" hits="0"/>
 						<line number="380" hits="0"/>
-						<line number="386" hits="0"/>
-						<line number="388" hits="1"/>
-						<line number="390" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="391,400"/>
 						<line number="391" hits="0"/>
-						<line number="392" hits="0"/>
-						<line number="393" hits="0"/>
 						<line number="394" hits="0"/>
-						<line number="400" hits="0"/>
+						<line number="395" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="396,410"/>
+						<line number="396" hits="0"/>
+						<line number="397" hits="0"/>
+						<line number="400" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="401,410"/>
 						<line number="401" hits="0"/>
+						<line number="402" hits="0"/>
+						<line number="410" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="411,425"/>
+						<line number="411" hits="0"/>
+						<line number="412" hits="0"/>
+						<line number="422" hits="0"/>
+						<line number="423" hits="0"/>
+						<line number="425" hits="0"/>
+						<line number="433" hits="0"/>
+						<line number="435" hits="1"/>
+						<line number="437" hits="0"/>
+						<line number="439" hits="1"/>
+						<line number="456" hits="0"/>
+						<line number="458" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="459,461"/>
+						<line number="459" hits="0"/>
+						<line number="461" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="462,464"/>
+						<line number="462" hits="0"/>
+						<line number="464" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="465,468"/>
+						<line number="465" hits="0"/>
+						<line number="468" hits="0"/>
+						<line number="469" hits="0"/>
+						<line number="470" hits="0"/>
+						<line number="471" hits="0"/>
+						<line number="474" hits="0"/>
+						<line number="475" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="476,490"/>
+						<line number="476" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="477,484"/>
+						<line number="477" hits="0"/>
+						<line number="484" hits="0"/>
+						<line number="485" hits="0"/>
+						<line number="486" hits="0"/>
+						<line number="487" hits="0"/>
+						<line number="488" hits="0"/>
+						<line number="490" hits="0"/>
+						<line number="499" hits="1"/>
+						<line number="501" hits="0"/>
+						<line number="502" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="503,505"/>
+						<line number="503" hits="0"/>
+						<line number="505" hits="0"/>
+						<line number="506" hits="0"/>
+						<line number="507" hits="0"/>
+						<line number="509" hits="1"/>
+						<line number="511" hits="0"/>
+						<line number="512" hits="0"/>
+						<line number="514" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="515,520"/>
+						<line number="515" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="514,516"/>
+						<line number="516" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="514,517"/>
+						<line number="517" hits="0"/>
+						<line number="518" hits="0"/>
+						<line number="520" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="521,523"/>
+						<line number="521" hits="0"/>
+						<line number="523" hits="0"/>
 					</lines>
 				</class>
-				<class name="opencode_adapter.py" filename="orchestrator/agents/opencode_adapter.py" complexity="0" line-rate="0.25" branch-rate="0">
+				<class name="handoff_protocol.py" filename="orchestrator/agents/handoff_protocol.py" complexity="0" line-rate="0.3886" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="13" hits="1"/>
-						<line number="14" hits="1"/>
-						<line number="15" hits="1"/>
 						<line number="16" hits="1"/>
 						<line number="17" hits="1"/>
 						<line number="18" hits="1"/>
@@ -19735,68 +21240,427 @@
 						<line number="23" hits="1"/>
 						<line number="25" hits="1"/>
 						<line number="30" hits="1"/>
-						<line number="31" hits="1"/>
-						<line number="33" hits="1"/>
-						<line number="34" hits="1"/>
 						<line number="35" hits="1"/>
-						<line number="36" hits="1"/>
-						<line number="37" hits="1"/>
-						<line number="38" hits="1"/>
-						<line number="39" hits="1"/>
 						<line number="40" hits="1"/>
-						<line number="41" hits="1"/>
-						<line number="43" hits="1"/>
-						<line number="44" hits="0"/>
+						<line number="45" hits="1"/>
+						<line number="47" hits="1"/>
+						<line number="52" hits="1"/>
+						<line number="54" hits="1"/>
+						<line number="55" hits="1"/>
+						<line number="56" hits="1"/>
 						<line number="57" hits="1"/>
 						<line number="58" hits="1"/>
-						<line number="60" hits="1"/>
 						<line number="61" hits="1"/>
-						<line number="62" hits="1"/>
 						<line number="63" hits="1"/>
 						<line number="64" hits="1"/>
-						<line number="65" hits="1"/>
-						<line number="66" hits="1"/>
 						<line number="67" hits="1"/>
-						<line number="68" hits="1"/>
 						<line number="69" hits="1"/>
 						<line number="70" hits="1"/>
 						<line number="71" hits="1"/>
+						<line number="72" hits="1"/>
 						<line number="73" hits="1"/>
-						<line number="74" hits="0"/>
+						<line number="78" hits="1"/>
+						<line number="79" hits="1"/>
+						<line number="81" hits="1"/>
+						<line number="82" hits="1"/>
+						<line number="83" hits="1"/>
+						<line number="84" hits="1"/>
+						<line number="85" hits="1"/>
+						<line number="86" hits="1"/>
+						<line number="87" hits="1"/>
+						<line number="88" hits="1"/>
 						<line number="90" hits="1"/>
 						<line number="91" hits="1"/>
-						<line number="93" hits="1"/>
-						<line number="94" hits="1"/>
-						<line number="95" hits="1"/>
+						<line number="92" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="93,94"/>
+						<line number="93" hits="0"/>
+						<line number="94" hits="0"/>
 						<line number="96" hits="1"/>
-						<line number="99" hits="1"/>
-						<line number="100" hits="1"/>
-						<line number="102" hits="1"/>
-						<line number="103" hits="1"/>
-						<line number="104" hits="1"/>
-						<line number="105" hits="1"/>
-						<line number="106" hits="1"/>
-						<line number="107" hits="1"/>
+						<line number="97" hits="0"/>
+						<line number="111" hits="1"/>
 						<line number="112" hits="1"/>
+						<line number="114" hits="1"/>
+						<line number="115" hits="1"/>
+						<line number="116" hits="1"/>
+						<line number="117" hits="1"/>
+						<line number="118" hits="1"/>
+						<line number="119" hits="1"/>
+						<line number="122" hits="1"/>
+						<line number="123" hits="1"/>
+						<line number="126" hits="1"/>
 						<line number="129" hits="1"/>
+						<line number="132" hits="1"/>
+						<line number="133" hits="1"/>
+						<line number="136" hits="1"/>
+						<line number="137" hits="1"/>
+						<line number="139" hits="1"/>
+						<line number="140" hits="1"/>
+						<line number="141" hits="0"/>
+						<line number="143" hits="1"/>
+						<line number="144" hits="1"/>
 						<line number="145" hits="0"/>
-						<line number="146" hits="0"/>
-						<line number="147" hits="0"/>
-						<line number="148" hits="0"/>
+						<line number="147" hits="1"/>
+						<line number="148" hits="1"/>
 						<line number="149" hits="0"/>
-						<line number="151" hits="0"/>
-						<line number="158" hits="1"/>
-						<line number="160" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="161,171"/>
-						<line number="161" hits="0"/>
-						<line number="164" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="165,167"/>
-						<line number="165" hits="0"/>
-						<line number="167" hits="0"/>
-						<line number="171" hits="0"/>
-						<line number="173" hits="1"/>
-						<line number="183" hits="0"/>
-						<line number="185" hits="0"/>
-						<line number="186" hits="0"/>
-						<line number="193" hits="0"/>
+						<line number="151" hits="1"/>
+						<line number="152" hits="1"/>
+						<line number="153" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="154,155"/>
+						<line number="154" hits="0"/>
+						<line number="155" hits="0"/>
+						<line number="157" hits="1"/>
+						<line number="158" hits="0"/>
+						<line number="177" hits="1"/>
+						<line number="193" hits="1"/>
+						<line number="194" hits="1"/>
+						<line number="196" hits="1"/>
+						<line number="204" hits="0"/>
+						<line number="205" hits="0"/>
+						<line number="206" hits="0"/>
+						<line number="207" hits="0"/>
+						<line number="210" hits="0"/>
+						<line number="212" hits="0"/>
+						<line number="214" hits="1"/>
+						<line number="245" hits="0"/>
+						<line number="254" hits="0"/>
+						<line number="255" hits="0"/>
+						<line number="256" hits="0"/>
+						<line number="258" hits="0"/>
+						<line number="260" hits="0"/>
+						<line number="264" hits="0"/>
+						<line number="266" hits="0"/>
+						<line number="269" hits="0"/>
+						<line number="270" hits="0"/>
+						<line number="272" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="273,276"/>
+						<line number="273" hits="0"/>
+						<line number="274" hits="0"/>
+						<line number="276" hits="0"/>
+						<line number="279" hits="0"/>
+						<line number="283" hits="0"/>
+						<line number="286" hits="0"/>
+						<line number="292" hits="0"/>
+						<line number="295" hits="0"/>
+						<line number="300" hits="0"/>
+						<line number="303" hits="0"/>
+						<line number="306" hits="0"/>
+						<line number="309" hits="0"/>
+						<line number="310" hits="0"/>
+						<line number="312" hits="0"/>
+						<line number="314" hits="0"/>
+						<line number="322" hits="0"/>
+						<line number="324" hits="0"/>
+						<line number="325" hits="0"/>
+						<line number="326" hits="0"/>
+						<line number="327" hits="0"/>
+						<line number="328" hits="0"/>
+						<line number="330" hits="1"/>
+						<line number="337" hits="0"/>
+						<line number="345" hits="0"/>
+						<line number="348" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="349,358"/>
+						<line number="349" hits="0"/>
+						<line number="358" hits="0"/>
+						<line number="360" hits="1"/>
+						<line number="362" hits="0"/>
+						<line number="364" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,366"/>
+						<line number="366" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="367,372"/>
+						<line number="367" hits="0"/>
+						<line number="368" hits="0"/>
+						<line number="369" hits="0"/>
+						<line number="372" hits="0"/>
+						<line number="375" hits="0"/>
+						<line number="376" hits="0"/>
+						<line number="383" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="364,384"/>
+						<line number="384" hits="0"/>
+						<line number="386" hits="1"/>
+						<line number="392" hits="0"/>
+						<line number="393" hits="0"/>
+						<line number="395" hits="0"/>
+						<line number="397" hits="0"/>
+						<line number="409" hits="0"/>
+						<line number="410" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="411,424"/>
+						<line number="411" hits="0"/>
+						<line number="413" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="414,416"/>
+						<line number="414" hits="0"/>
+						<line number="416" hits="0"/>
+						<line number="417" hits="0"/>
+						<line number="424" hits="0"/>
+						<line number="425" hits="0"/>
+						<line number="427" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="428,430"/>
+						<line number="428" hits="0"/>
+						<line number="430" hits="0"/>
+						<line number="431" hits="0"/>
+						<line number="434" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,435"/>
+						<line number="435" hits="0"/>
+						<line number="445" hits="0"/>
+						<line number="446" hits="0"/>
+						<line number="447" hits="0"/>
+						<line number="448" hits="0"/>
+						<line number="449" hits="0"/>
+						<line number="455" hits="1"/>
+						<line number="461" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="462,464"/>
+						<line number="462" hits="0"/>
+						<line number="464" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="465,476"/>
+						<line number="465" hits="0"/>
+						<line number="468" hits="0"/>
+						<line number="473" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="464,474"/>
+						<line number="474" hits="0"/>
+						<line number="476" hits="0"/>
+						<line number="478" hits="1"/>
+						<line number="481" hits="0"/>
+						<line number="482" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="483,488"/>
+						<line number="483" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="482,484"/>
+						<line number="484" hits="0"/>
+						<line number="485" hits="0"/>
+						<line number="488" hits="0"/>
+						<line number="501" hits="0"/>
+						<line number="509" hits="0"/>
+						<line number="511" hits="1"/>
+						<line number="513" hits="0"/>
+						<line number="514" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="515,525"/>
+						<line number="515" hits="0"/>
+						<line number="523" hits="0"/>
+						<line number="525" hits="0"/>
+						<line number="527" hits="1"/>
+						<line number="530" hits="0"/>
+						<line number="531" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="532,533"/>
+						<line number="532" hits="0"/>
+						<line number="533" hits="0"/>
+						<line number="535" hits="1"/>
+						<line number="542" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="543,545"/>
+						<line number="543" hits="0"/>
+						<line number="545" hits="0"/>
+						<line number="552" hits="1"/>
+						<line number="554" hits="0"/>
+						<line number="556" hits="1"/>
+						<line number="558" hits="0"/>
+						<line number="559" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="560,562"/>
+						<line number="560" hits="0"/>
+						<line number="562" hits="0"/>
+						<line number="563" hits="0"/>
+						<line number="565" hits="0"/>
+						<line number="566" hits="0"/>
+						<line number="568" hits="1"/>
+						<line number="570" hits="0"/>
+						<line number="571" hits="0"/>
+						<line number="572" hits="0"/>
+						<line number="574" hits="0"/>
+					</lines>
+				</class>
+				<class name="kilo_adapter.py" filename="orchestrator/agents/kilo_adapter.py" complexity="0" line-rate="0.3481" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="9" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="25" hits="1"/>
+						<line number="32" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="40" hits="1"/>
+						<line number="41" hits="1"/>
+						<line number="42" hits="1"/>
+						<line number="43" hits="1"/>
+						<line number="44" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="46" hits="1"/>
+						<line number="47" hits="1"/>
+						<line number="49" hits="1"/>
+						<line number="50" hits="0"/>
+						<line number="62" hits="1"/>
+						<line number="63" hits="1"/>
+						<line number="65" hits="1"/>
+						<line number="66" hits="1"/>
+						<line number="67" hits="1"/>
+						<line number="68" hits="1"/>
+						<line number="69" hits="1"/>
+						<line number="70" hits="1"/>
+						<line number="71" hits="1"/>
+						<line number="72" hits="1"/>
+						<line number="73" hits="1"/>
+						<line number="74" hits="1"/>
+						<line number="75" hits="1"/>
+						<line number="77" hits="1"/>
+						<line number="78" hits="0"/>
+						<line number="95" hits="1"/>
+						<line number="103" hits="1"/>
+						<line number="109" hits="0"/>
+						<line number="110" hits="0"/>
+						<line number="111" hits="0"/>
+						<line number="113" hits="0"/>
+						<line number="115" hits="1"/>
+						<line number="125" hits="0"/>
+						<line number="127" hits="0"/>
+						<line number="129" hits="0"/>
+						<line number="134" hits="0"/>
+						<line number="142" hits="0"/>
+						<line number="145" hits="0"/>
+						<line number="148" hits="0"/>
+						<line number="149" hits="0"/>
+						<line number="151" hits="0"/>
+						<line number="158" hits="0"/>
+						<line number="160" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="162" hits="0"/>
+						<line number="164" hits="0"/>
+						<line number="172" hits="0"/>
+						<line number="173" hits="0"/>
+						<line number="174" hits="0"/>
+						<line number="176" hits="0"/>
+						<line number="184" hits="1"/>
+						<line number="190" hits="0"/>
+						<line number="193" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="194,204"/>
+						<line number="194" hits="0"/>
+						<line number="197" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="198,201"/>
+						<line number="198" hits="0"/>
+						<line number="201" hits="0"/>
+						<line number="204" hits="0"/>
+						<line number="209" hits="0"/>
+						<line number="210" hits="0"/>
+						<line number="212" hits="1"/>
+						<line number="214" hits="0"/>
+						<line number="215" hits="0"/>
+						<line number="216" hits="0"/>
+						<line number="220" hits="0"/>
+						<line number="221" hits="0"/>
+						<line number="223" hits="1"/>
+						<line number="229" hits="0"/>
+						<line number="231" hits="0"/>
+						<line number="234" hits="0"/>
+						<line number="244" hits="0"/>
+						<line number="246" hits="0"/>
+						<line number="247" hits="0"/>
+						<line number="248" hits="0"/>
+						<line number="249" hits="0"/>
+						<line number="254" hits="0"/>
+						<line number="256" hits="1"/>
+						<line number="258" hits="0"/>
+						<line number="266" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="267,269"/>
+						<line number="267" hits="0"/>
+						<line number="268" hits="0"/>
+						<line number="269" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="270,271"/>
+						<line number="270" hits="0"/>
+						<line number="271" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="272,274"/>
+						<line number="272" hits="0"/>
+						<line number="274" hits="0"/>
+						<line number="276" hits="1"/>
+						<line number="283" hits="0"/>
+						<line number="295" hits="1"/>
+						<line number="297" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="298,300"/>
+						<line number="298" hits="0"/>
+						<line number="300" hits="0"/>
+						<line number="307" hits="1"/>
+						<line number="314" hits="0"/>
+						<line number="315" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,317"/>
+						<line number="317" hits="0"/>
+						<line number="324" hits="0"/>
+						<line number="333" hits="0"/>
+						<line number="339" hits="0"/>
+						<line number="341" hits="0"/>
+						<line number="347" hits="1"/>
+						<line number="353" hits="0"/>
+						<line number="355" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="356,359"/>
+						<line number="356" hits="0"/>
+						<line number="357" hits="0"/>
+						<line number="359" hits="0"/>
+						<line number="361" hits="1"/>
+						<line number="367" hits="0"/>
+						<line number="369" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="370,377"/>
+						<line number="370" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="369,371"/>
+						<line number="371" hits="0"/>
+						<line number="375" hits="0"/>
+						<line number="377" hits="0"/>
+						<line number="379" hits="0"/>
+						<line number="380" hits="0"/>
+						<line number="386" hits="0"/>
+						<line number="388" hits="1"/>
+						<line number="390" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="391,400"/>
+						<line number="391" hits="0"/>
+						<line number="392" hits="0"/>
+						<line number="393" hits="0"/>
+						<line number="394" hits="0"/>
+						<line number="400" hits="0"/>
+						<line number="401" hits="0"/>
+					</lines>
+				</class>
+				<class name="opencode_adapter.py" filename="orchestrator/agents/opencode_adapter.py" complexity="0" line-rate="0.25" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="13" hits="1"/>
+						<line number="14" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="19" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="25" hits="1"/>
+						<line number="30" hits="1"/>
+						<line number="31" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="35" hits="1"/>
+						<line number="36" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="39" hits="1"/>
+						<line number="40" hits="1"/>
+						<line number="41" hits="1"/>
+						<line number="43" hits="1"/>
+						<line number="44" hits="0"/>
+						<line number="57" hits="1"/>
+						<line number="58" hits="1"/>
+						<line number="60" hits="1"/>
+						<line number="61" hits="1"/>
+						<line number="62" hits="1"/>
+						<line number="63" hits="1"/>
+						<line number="64" hits="1"/>
+						<line number="65" hits="1"/>
+						<line number="66" hits="1"/>
+						<line number="67" hits="1"/>
+						<line number="68" hits="1"/>
+						<line number="69" hits="1"/>
+						<line number="70" hits="1"/>
+						<line number="71" hits="1"/>
+						<line number="73" hits="1"/>
+						<line number="74" hits="0"/>
+						<line number="90" hits="1"/>
+						<line number="91" hits="1"/>
+						<line number="93" hits="1"/>
+						<line number="94" hits="1"/>
+						<line number="95" hits="1"/>
+						<line number="96" hits="1"/>
+						<line number="99" hits="1"/>
+						<line number="100" hits="1"/>
+						<line number="102" hits="1"/>
+						<line number="103" hits="1"/>
+						<line number="104" hits="1"/>
+						<line number="105" hits="1"/>
+						<line number="106" hits="1"/>
+						<line number="107" hits="1"/>
+						<line number="112" hits="1"/>
+						<line number="129" hits="1"/>
+						<line number="145" hits="0"/>
+						<line number="146" hits="0"/>
+						<line number="147" hits="0"/>
+						<line number="148" hits="0"/>
+						<line number="149" hits="0"/>
+						<line number="151" hits="0"/>
+						<line number="158" hits="1"/>
+						<line number="160" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="161,171"/>
+						<line number="161" hits="0"/>
+						<line number="164" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="165,167"/>
+						<line number="165" hits="0"/>
+						<line number="167" hits="0"/>
+						<line number="171" hits="0"/>
+						<line number="173" hits="1"/>
+						<line number="183" hits="0"/>
+						<line number="185" hits="0"/>
+						<line number="186" hits="0"/>
+						<line number="193" hits="0"/>
 						<line number="196" hits="0"/>
 						<line number="202" hits="0"/>
 						<line number="203" hits="0"/>
@@ -20783,7 +22647,7 @@
 				</class>
 			</classes>
 		</package>
-		<package name="orchestrator.node_executors" line-rate="0.1242" branch-rate="0" complexity="0">
+		<package name="orchestrator.node_executors" line-rate="0.04296" branch-rate="0" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="orchestrator/node_executors/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
@@ -20792,38 +22656,170 @@
 				<class name="approval_executor.py" filename="orchestrator/node_executors/approval_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="7" hits="0"/>
-						<line number="8" hits="0"/>
 						<line number="10" hits="0"/>
 						<line number="11" hits="0"/>
+						<line number="12" hits="0"/>
 						<line number="13" hits="0"/>
-						<line number="14" hits="0"/>
+						<line number="15" hits="0"/>
 						<line number="16" hits="0"/>
+						<line number="18" hits="0"/>
 						<line number="19" hits="0"/>
-						<line number="20" hits="0"/>
+						<line number="22" hits="0"/>
 						<line number="23" hits="0"/>
-						<line number="36" hits="0"/>
+						<line number="25" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="29" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0"/>
 						<line number="50" hits="0"/>
 						<line number="51" hits="0"/>
-						<line number="54" hits="0"/>
-						<line number="55" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="56,65"/>
-						<line number="56" hits="0"/>
-						<line number="65" hits="0"/>
-						<line number="70" hits="0"/>
-						<line number="72" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="77" hits="0"/>
 						<line number="84" hits="0"/>
-						<line number="96" hits="0"/>
-						<line number="99" hits="0"/>
-						<line number="107" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="108,122"/>
+						<line number="86" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="94" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="107" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="108,110"/>
 						<line number="108" hits="0"/>
-						<line number="122" hits="0"/>
-						<line number="127" hits="0"/>
+						<line number="110" hits="0"/>
+						<line number="111" hits="0"/>
+						<line number="113" hits="0"/>
+						<line number="114" hits="0"/>
+						<line number="115" hits="0"/>
+						<line number="116" hits="0"/>
+						<line number="117" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="118,120"/>
+						<line number="118" hits="0"/>
+						<line number="120" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="121,122"/>
+						<line number="121" hits="0"/>
+						<line number="122" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="123,126"/>
+						<line number="123" hits="0"/>
+						<line number="124" hits="0"/>
+						<line number="126" hits="0"/>
+						<line number="128" hits="0"/>
+						<line number="129" hits="0"/>
+						<line number="131" hits="0"/>
+						<line number="137" hits="0"/>
 						<line number="138" hits="0"/>
-						<line number="142" hits="0"/>
-						<line number="143" hits="0"/>
+						<line number="144" hits="0"/>
+						<line number="159" hits="0"/>
+						<line number="160" hits="0"/>
+						<line number="162" hits="0"/>
+						<line number="163" hits="0"/>
+						<line number="164" hits="0"/>
+						<line number="165" hits="0"/>
+						<line number="167" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="168,196"/>
+						<line number="168" hits="0"/>
+						<line number="169" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="170,172"/>
+						<line number="170" hits="0"/>
+						<line number="172" hits="0"/>
+						<line number="173" hits="0"/>
+						<line number="174" hits="0"/>
+						<line number="175" hits="0"/>
+						<line number="176" hits="0"/>
+						<line number="178" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="179,182"/>
+						<line number="179" hits="0"/>
+						<line number="180" hits="0"/>
+						<line number="182" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="183,190"/>
+						<line number="183" hits="0"/>
+						<line number="184" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="185,187"/>
+						<line number="185" hits="0"/>
+						<line number="187" hits="0"/>
+						<line number="188" hits="0"/>
+						<line number="190" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="191,194"/>
+						<line number="191" hits="0"/>
+						<line number="192" hits="0"/>
+						<line number="194" hits="0"/>
+						<line number="196" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="197,199"/>
+						<line number="197" hits="0"/>
+						<line number="199" hits="0"/>
+						<line number="200" hits="0"/>
+						<line number="202" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="203,211"/>
+						<line number="203" hits="0"/>
+						<line number="207" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="208,211"/>
+						<line number="208" hits="0"/>
+						<line number="211" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="212,225"/>
+						<line number="212" hits="0"/>
+						<line number="220" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="221,225"/>
+						<line number="221" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="220,222"/>
+						<line number="222" hits="0"/>
+						<line number="225" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="226,274"/>
+						<line number="226" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="228,274"/>
+						<line number="228" hits="0"/>
+						<line number="229" hits="0"/>
+						<line number="230" hits="0"/>
+						<line number="231" hits="0"/>
+						<line number="232" hits="0"/>
+						<line number="234" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="236,249"/>
+						<line number="236" hits="0"/>
+						<line number="249" hits="0"/>
+						<line number="261" hits="0"/>
+						<line number="262" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="263,268"/>
+						<line number="263" hits="0"/>
+						<line number="268" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="226,269"/>
+						<line number="269" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="268,270"/>
+						<line number="270" hits="0"/>
+						<line number="271" hits="0"/>
+						<line number="272" hits="0"/>
+						<line number="274" hits="0"/>
+						<line number="277" hits="0"/>
+						<line number="299" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="300,302"/>
+						<line number="300" hits="0"/>
+						<line number="302" hits="0"/>
+						<line number="303" hits="0"/>
+						<line number="305" hits="0"/>
+						<line number="306" hits="0"/>
+						<line number="308" hits="0"/>
+						<line number="323" hits="0"/>
+						<line number="324" hits="0"/>
+						<line number="325" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="326,340"/>
+						<line number="326" hits="0"/>
+						<line number="340" hits="0"/>
+						<line number="342" hits="0"/>
+						<line number="347" hits="0"/>
+						<line number="348" hits="0"/>
+						<line number="354" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,355"/>
+						<line number="355" hits="0"/>
+						<line number="356" hits="0"/>
+						<line number="358" hits="0"/>
+						<line number="359" hits="0"/>
+						<line number="360" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="361,370"/>
+						<line number="361" hits="0"/>
+						<line number="370" hits="0"/>
+						<line number="375" hits="0"/>
+						<line number="377" hits="0"/>
+						<line number="383" hits="0"/>
+						<line number="398" hits="0"/>
+						<line number="404" hits="0"/>
+						<line number="405" hits="0"/>
+						<line number="408" hits="0"/>
+						<line number="409" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="410,419"/>
+						<line number="410" hits="0"/>
+						<line number="419" hits="0"/>
+						<line number="420" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="421,430"/>
+						<line number="421" hits="0"/>
+						<line number="430" hits="0"/>
+						<line number="435" hits="0"/>
+						<line number="437" hits="0"/>
+						<line number="452" hits="0"/>
+						<line number="461" hits="0"/>
+						<line number="469" hits="0"/>
+						<line number="482" hits="0"/>
+						<line number="485" hits="0"/>
+						<line number="493" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="494,514"/>
+						<line number="494" hits="0"/>
+						<line number="500" hits="0"/>
+						<line number="514" hits="0"/>
+						<line number="519" hits="0"/>
+						<line number="524" hits="0"/>
+						<line number="535" hits="0"/>
+						<line number="539" hits="0"/>
+						<line number="540" hits="0"/>
 					</lines>
 				</class>
-				<class name="base.py" filename="orchestrator/node_executors/base.py" complexity="0" line-rate="0.95" branch-rate="1">
+				<class name="base.py" filename="orchestrator/node_executors/base.py" complexity="0" line-rate="0.9615" branch-rate="1">
 					<methods/>
 					<lines>
 						<line number="2" hits="1"/>
@@ -20844,8 +22840,14 @@
 						<line number="25" hits="1"/>
 						<line number="26" hits="1"/>
 						<line number="29" hits="1"/>
-						<line number="32" hits="1"/>
-						<line number="43" hits="0"/>
+						<line number="30" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="35" hits="1"/>
+						<line number="36" hits="1"/>
+						<line number="39" hits="1"/>
+						<line number="42" hits="1"/>
+						<line number="53" hits="0"/>
 					</lines>
 				</class>
 				<class name="conditional_executor.py" filename="orchestrator/node_executors/conditional_executor.py" complexity="0" line-rate="0" branch-rate="0">
@@ -20866,86 +22868,305 @@
 					<lines>
 						<line number="2" hits="0"/>
 						<line number="3" hits="0"/>
-						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
 						<line number="10" hits="0"/>
-						<line number="22" hits="0"/>
-						<line number="49" hits="0"/>
-						<line number="77" hits="0"/>
-						<line number="78" hits="0"/>
-						<line number="81" hits="0"/>
-						<line number="82" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="83,89"/>
-						<line number="83" hits="0"/>
-						<line number="89" hits="0"/>
-						<line number="90" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="91,93"/>
-						<line number="91" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="30" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="56" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="57,59"/>
+						<line number="57" hits="0"/>
+						<line number="59" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="68" hits="0"/>
+						<line number="69" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="70,71"/>
+						<line number="70" hits="0"/>
+						<line number="71" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="72,75"/>
+						<line number="72" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="79" hits="0"/>
+						<line number="82" hits="0"/>
+						<line number="83" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="84,88"/>
+						<line number="84" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="88" hits="0"/>
+						<line number="92" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="93,94"/>
 						<line number="93" hits="0"/>
-						<line number="96" hits="0"/>
-						<line number="97" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="98,101"/>
-						<line number="98" hits="0"/>
+						<line number="94" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="95,96"/>
+						<line number="95" hits="0"/>
+						<line number="96" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="97,98"/>
+						<line number="97" hits="0"/>
+						<line number="98" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="99,100"/>
+						<line number="99" hits="0"/>
+						<line number="100" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="101,103"/>
 						<line number="101" hits="0"/>
-						<line number="102" hits="0"/>
 						<line number="103" hits="0"/>
-						<line number="104" hits="0"/>
 						<line number="105" hits="0"/>
-						<line number="108" hits="0"/>
+						<line number="116" hits="0"/>
+						<line number="117" hits="0"/>
+						<line number="118" hits="0"/>
+						<line number="128" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="129,149"/>
+						<line number="129" hits="0"/>
+						<line number="130" hits="0"/>
+						<line number="137" hits="0"/>
+						<line number="138" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="144" hits="0"/>
 						<line number="145" hits="0"/>
-						<line number="157" hits="0"/>
-						<line number="167" hits="0"/>
-						<line number="168" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="169,171"/>
-						<line number="169" hits="0"/>
+						<line number="147" hits="0"/>
+						<line number="149" hits="0"/>
+						<line number="151" hits="0"/>
+						<line number="156" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="163" hits="0"/>
 						<line number="171" hits="0"/>
-						<line number="172" hits="0"/>
-						<line number="173" hits="0"/>
-						<line number="176" hits="0"/>
-						<line number="180" hits="0"/>
-						<line number="182" hits="0"/>
 						<line number="183" hits="0"/>
+						<line number="184" hits="0"/>
+						<line number="185" hits="0"/>
+						<line number="186" hits="0"/>
+						<line number="187" hits="0"/>
+						<line number="188" hits="0"/>
 					</lines>
 				</class>
-				<class name="llm_executor.py" filename="orchestrator/node_executors/llm_executor.py" complexity="0" line-rate="0" branch-rate="1">
+				<class name="llm_executor.py" filename="orchestrator/node_executors/llm_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="2" hits="0"/>
+						<line number="3" hits="0"/>
 						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
 						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="13" hits="0"/>
 						<line number="16" hits="0"/>
-						<line number="17" hits="0"/>
-						<line number="19" hits="0"/>
+						<line number="27" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="53" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="54,59"/>
+						<line number="54" hits="0"/>
+						<line number="59" hits="0"/>
+						<line number="60" hits="0"/>
+						<line number="61" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="65" hits="0"/>
+						<line number="66" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="68,78"/>
+						<line number="68" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="69,71"/>
+						<line number="69" hits="0"/>
+						<line number="70" hits="0"/>
+						<line number="71" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="72,74"/>
+						<line number="72" hits="0"/>
+						<line number="74" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="78" hits="0"/>
+						<line number="79" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="80,87"/>
+						<line number="80" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="88" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="89,90"/>
+						<line number="89" hits="0"/>
+						<line number="90" hits="0"/>
+						<line number="93" hits="0"/>
+						<line number="98" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="99,101"/>
+						<line number="99" hits="0"/>
+						<line number="101" hits="0"/>
+						<line number="113" hits="0"/>
+						<line number="114" hits="0"/>
+						<line number="115" hits="0"/>
+						<line number="125" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="126,148"/>
+						<line number="126" hits="0"/>
+						<line number="127" hits="0"/>
+						<line number="134" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="136" hits="0"/>
+						<line number="140" hits="0"/>
+						<line number="141" hits="0"/>
+						<line number="143" hits="0"/>
+						<line number="148" hits="0"/>
+						<line number="151" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="152,180"/>
+						<line number="152" hits="0"/>
+						<line number="159" hits="0"/>
+						<line number="160" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="161,180"/>
+						<line number="161" hits="0"/>
+						<line number="162" hits="0"/>
+						<line number="171" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="172,174"/>
+						<line number="172" hits="0"/>
+						<line number="174" hits="0"/>
+						<line number="180" hits="0"/>
+						<line number="181" hits="0"/>
+						<line number="182" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="183,187"/>
+						<line number="183" hits="0"/>
+						<line number="184" hits="0"/>
+						<line number="187" hits="0"/>
+						<line number="188" hits="0"/>
+						<line number="190" hits="0"/>
+						<line number="199" hits="0"/>
+						<line number="210" hits="0"/>
+						<line number="211" hits="0"/>
+						<line number="212" hits="0"/>
+						<line number="216" hits="0"/>
+						<line number="217" hits="0"/>
+						<line number="218" hits="0"/>
 					</lines>
 				</class>
 				<class name="loop_executor.py" filename="orchestrator/node_executors/loop_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="2" hits="0"/>
-						<line number="3" hits="0"/>
-						<line number="6" hits="0"/>
+						<line number="9" hits="0"/>
 						<line number="10" hits="0"/>
+						<line number="11" hits="0"/>
 						<line number="12" hits="0"/>
-						<line number="31" hits="0"/>
-						<line number="32" hits="0"/>
-						<line number="35" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="37,41"/>
-						<line number="37" hits="0"/>
-						<line number="38" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="23" hits="0"/>
 						<line number="39" hits="0"/>
-						<line number="40" hits="0"/>
-						<line number="41" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="43,50"/>
-						<line number="43" hits="0"/>
-						<line number="44" hits="0"/>
-						<line number="45" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="46,47"/>
-						<line number="46" hits="0"/>
 						<line number="47" hits="0"/>
-						<line number="50" hits="0"/>
+						<line number="56" hits="0"/>
 						<line number="59" hits="0"/>
-						<line number="60" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="62,80"/>
-						<line number="62" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="63,70"/>
-						<line number="63" hits="0"/>
-						<line number="64" hits="0"/>
-						<line number="70" hits="0"/>
-						<line number="75" hits="0"/>
-						<line number="80" hits="0"/>
+						<line number="66" hits="0"/>
+						<line number="68" hits="0"/>
 						<line number="91" hits="0"/>
-						<line number="93" hits="0"/>
-						<line number="94" hits="0"/>
+						<line number="92" hits="0"/>
+						<line number="95" hits="0"/>
+						<line number="97" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="98,105"/>
+						<line number="98" hits="0"/>
+						<line number="99" hits="0"/>
+						<line number="100" hits="0"/>
+						<line number="104" hits="0"/>
+						<line number="105" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="106,112"/>
+						<line number="106" hits="0"/>
+						<line number="107" hits="0"/>
+						<line number="108" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="109,110"/>
+						<line number="109" hits="0"/>
+						<line number="110" hits="0"/>
+						<line number="112" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="126" hits="0"/>
+						<line number="127" hits="0"/>
+						<line number="128" hits="0"/>
+						<line number="129" hits="0"/>
+						<line number="130" hits="0"/>
+						<line number="133" hits="0"/>
+						<line number="134" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="135,138"/>
+						<line number="135" hits="0"/>
+						<line number="138" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="141" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="142,213"/>
+						<line number="142" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="143,145"/>
+						<line number="143" hits="0"/>
+						<line number="145" hits="0"/>
+						<line number="148" hits="0"/>
+						<line number="150" hits="0"/>
+						<line number="151" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="153,164"/>
+						<line number="153" hits="0"/>
+						<line number="164" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="166,171"/>
+						<line number="166" hits="0"/>
+						<line number="171" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="172,178"/>
+						<line number="172" hits="0"/>
+						<line number="178" hits="0"/>
+						<line number="183" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="184,209"/>
+						<line number="184" hits="0"/>
+						<line number="186" hits="0"/>
+						<line number="187" hits="0"/>
+						<line number="192" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="193,194"/>
+						<line number="193" hits="0"/>
+						<line number="194" hits="0"/>
+						<line number="196" hits="0"/>
+						<line number="205" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="206,209"/>
+						<line number="206" hits="0"/>
+						<line number="209" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="141,210"/>
+						<line number="210" hits="0"/>
+						<line number="213" hits="0"/>
+						<line number="217" hits="0"/>
+						<line number="232" hits="0"/>
+						<line number="234" hits="0"/>
+						<line number="236" hits="0"/>
+						<line number="237" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="238,241"/>
+						<line number="238" hits="0"/>
+						<line number="241" hits="0"/>
+						<line number="243" hits="0"/>
+						<line number="256" hits="0"/>
+						<line number="258" hits="0"/>
+						<line number="261" hits="0"/>
+						<line number="262" hits="0"/>
+						<line number="263" hits="0"/>
+						<line number="264" hits="0"/>
+						<line number="267" hits="0"/>
+						<line number="271" hits="0"/>
+						<line number="284" hits="0"/>
+						<line number="286" hits="0"/>
+						<line number="293" hits="0"/>
+						<line number="294" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="295,308"/>
+						<line number="295" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="296,297"/>
+						<line number="296" hits="0"/>
+						<line number="297" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="298,301"/>
+						<line number="298" hits="0"/>
+						<line number="301" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="302,307"/>
+						<line number="302" hits="0"/>
+						<line number="307" hits="0"/>
+						<line number="308" hits="0"/>
+						<line number="314" hits="0"/>
+						<line number="333" hits="0"/>
+						<line number="334" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="335,337"/>
+						<line number="335" hits="0"/>
+						<line number="337" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="338,343"/>
+						<line number="338" hits="0"/>
+						<line number="343" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="344,350"/>
+						<line number="344" hits="0"/>
+						<line number="346" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="347,350"/>
+						<line number="347" hits="0"/>
+						<line number="350" hits="0"/>
+						<line number="351" hits="0"/>
+						<line number="352" hits="0"/>
+						<line number="353" hits="0"/>
+						<line number="356" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="357,383"/>
+						<line number="357" hits="0"/>
+						<line number="359" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="361,368"/>
+						<line number="361" hits="0"/>
+						<line number="362" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="363,364"/>
+						<line number="363" hits="0"/>
+						<line number="364" hits="0"/>
+						<line number="368" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="369,372"/>
+						<line number="369" hits="0"/>
+						<line number="372" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="373,378"/>
+						<line number="373" hits="0"/>
+						<line number="378" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="356,379"/>
+						<line number="379" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="356,380"/>
+						<line number="380" hits="0"/>
+						<line number="383" hits="0"/>
+						<line number="384" hits="0"/>
+						<line number="385" hits="0"/>
+						<line number="387" hits="0"/>
+						<line number="388" hits="0"/>
+						<line number="393" hits="0"/>
+						<line number="394" hits="0"/>
+						<line number="402" hits="0"/>
+						<line number="403" hits="0"/>
+						<line number="410" hits="0"/>
+						<line number="411" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="412,413"/>
+						<line number="412" hits="0"/>
+						<line number="413" hits="0"/>
+						<line number="414" hits="0"/>
+						<line number="424" hits="0"/>
+						<line number="425" hits="0"/>
+						<line number="428" hits="0"/>
+						<line number="430" hits="0"/>
+						<line number="431" hits="0"/>
+						<line number="432" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="433,434"/>
+						<line number="433" hits="0"/>
+						<line number="434" hits="0"/>
+						<line number="435" hits="0"/>
+						<line number="436" hits="0"/>
+						<line number="440" hits="0"/>
+						<line number="444" hits="0"/>
+						<line number="445" hits="0"/>
 					</lines>
 				</class>
 				<class name="rag_executor.py" filename="orchestrator/node_executors/rag_executor.py" complexity="0" line-rate="0" branch-rate="1">
@@ -20982,56 +23203,134 @@
 						<line number="169" hits="0"/>
 					</lines>
 				</class>
-			</classes>
-		</package>
-		<package name="orchestrator.node_executors.data_executors" line-rate="0" branch-rate="0" complexity="0">
-			<classes>
-				<class name="__init__.py" filename="orchestrator/node_executors/data_executors/__init__.py" complexity="0" line-rate="0" branch-rate="1">
+				<class name="video_executor.py" filename="orchestrator/node_executors/video_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
+						<line number="2" hits="0"/>
 						<line number="3" hits="0"/>
-						<line number="4" hits="0"/>
-						<line number="8" hits="0"/>
-						<line number="9" hits="0"/>
-						<line number="12" hits="0"/>
-						<line number="16" hits="0"/>
-					</lines>
-				</class>
-				<class name="batch_executor.py" filename="orchestrator/node_executors/data_executors/batch_executor.py" complexity="0" line-rate="0" branch-rate="0">
-					<methods/>
-					<lines>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
 						<line number="8" hits="0"/>
-						<line number="9" hits="0"/>
-						<line number="11" hits="0"/>
-						<line number="14" hits="0"/>
-						<line number="15" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="13" hits="0"/>
 						<line number="16" hits="0"/>
-						<line number="17" hits="0"/>
-						<line number="18" hits="0"/>
-						<line number="19" hits="0"/>
-						<line number="21" hits="0"/>
-						<line number="24" hits="0"/>
-						<line number="40" hits="0"/>
-						<line number="62" hits="0"/>
+						<line number="29" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="54" hits="0"/>
+						<line number="55" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="56,58"/>
+						<line number="56" hits="0"/>
+						<line number="58" hits="0"/>
+						<line number="59" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="60,63"/>
+						<line number="60" hits="0"/>
 						<line number="63" hits="0"/>
 						<line number="64" hits="0"/>
 						<line number="65" hits="0"/>
 						<line number="66" hits="0"/>
-						<line number="67" hits="0"/>
-						<line number="71" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="72,75"/>
+						<line number="69" hits="0"/>
+						<line number="70" hits="0"/>
+						<line number="71" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="72,73"/>
 						<line number="72" hits="0"/>
-						<line number="73" hits="0"/>
-						<line number="75" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="76,80"/>
-						<line number="76" hits="0"/>
-						<line number="80" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="81,86"/>
+						<line number="73" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="74,77"/>
+						<line number="74" hits="0"/>
+						<line number="77" hits="0"/>
 						<line number="81" hits="0"/>
-						<line number="86" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="87,97"/>
-						<line number="87" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="88,92"/>
-						<line number="88" hits="0"/>
-						<line number="89" hits="0"/>
+						<line number="84" hits="0"/>
+						<line number="85" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="86,90"/>
+						<line number="86" hits="0"/>
+						<line number="87" hits="0"/>
 						<line number="90" hits="0"/>
-						<line number="91" hits="0"/>
-						<line number="92" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="93,117"/>
+						<line number="94" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="95,96"/>
+						<line number="95" hits="0"/>
+						<line number="96" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="97,98"/>
+						<line number="97" hits="0"/>
+						<line number="98" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="99,100"/>
+						<line number="99" hits="0"/>
+						<line number="100" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="101,102"/>
+						<line number="101" hits="0"/>
+						<line number="102" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="103,104"/>
+						<line number="103" hits="0"/>
+						<line number="104" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="105,107"/>
+						<line number="105" hits="0"/>
+						<line number="107" hits="0"/>
+						<line number="109" hits="0"/>
+						<line number="121" hits="0"/>
+						<line number="122" hits="0"/>
+						<line number="123" hits="0"/>
+						<line number="133" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="134,154"/>
+						<line number="134" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="142" hits="0"/>
+						<line number="143" hits="0"/>
+						<line number="144" hits="0"/>
+						<line number="149" hits="0"/>
+						<line number="150" hits="0"/>
+						<line number="152" hits="0"/>
+						<line number="154" hits="0"/>
+						<line number="156" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="166" hits="0"/>
+						<line number="168" hits="0"/>
+						<line number="176" hits="0"/>
+						<line number="189" hits="0"/>
+						<line number="190" hits="0"/>
+						<line number="191" hits="0"/>
+						<line number="192" hits="0"/>
+						<line number="193" hits="0"/>
+						<line number="194" hits="0"/>
+					</lines>
+				</class>
+			</classes>
+		</package>
+		<package name="orchestrator.node_executors.data_executors" line-rate="0" branch-rate="0" complexity="0">
+			<classes>
+				<class name="__init__.py" filename="orchestrator/node_executors/data_executors/__init__.py" complexity="0" line-rate="0" branch-rate="1">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="19" hits="0"/>
+					</lines>
+				</class>
+				<class name="batch_executor.py" filename="orchestrator/node_executors/data_executors/batch_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="8" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="17" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="65" hits="0"/>
+						<line number="66" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="71" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="72,75"/>
+						<line number="72" hits="0"/>
+						<line number="73" hits="0"/>
+						<line number="75" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="76,80"/>
+						<line number="76" hits="0"/>
+						<line number="80" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="81,86"/>
+						<line number="81" hits="0"/>
+						<line number="86" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="87,97"/>
+						<line number="87" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="88,92"/>
+						<line number="88" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="90" hits="0"/>
+						<line number="91" hits="0"/>
+						<line number="92" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="93,117"/>
 						<line number="93" hits="0"/>
 						<line number="97" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="98,110"/>
 						<line number="98" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="99,105"/>
@@ -21188,6 +23487,77 @@
 						<line number="107" hits="0"/>
 					</lines>
 				</class>
+				<class name="csv_parser_executor.py" filename="orchestrator/node_executors/data_executors/csv_parser_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="27" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="30" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="35" hits="0"/>
+						<line number="36" hits="0"/>
+						<line number="37" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="39" hits="0"/>
+						<line number="42" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="44,50"/>
+						<line number="44" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="47,55"/>
+						<line number="47" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="51" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="52,55"/>
+						<line number="52" hits="0"/>
+						<line number="55" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="56,59"/>
+						<line number="56" hits="0"/>
+						<line number="59" hits="0"/>
+						<line number="60" hits="0"/>
+						<line number="67" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="68,74"/>
+						<line number="68" hits="0"/>
+						<line number="69" hits="0"/>
+						<line number="70" hits="0"/>
+						<line number="71" hits="0"/>
+						<line number="74" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="75,82"/>
+						<line number="75" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="76,79"/>
+						<line number="76" hits="0"/>
+						<line number="79" hits="0"/>
+						<line number="80" hits="0"/>
+						<line number="82" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="91" hits="0"/>
+						<line number="92" hits="0"/>
+						<line number="94" hits="0"/>
+						<line number="95" hits="0"/>
+						<line number="96" hits="0"/>
+						<line number="98" hits="0"/>
+						<line number="100" hits="0"/>
+						<line number="101" hits="0"/>
+						<line number="102" hits="0"/>
+						<line number="104" hits="0"/>
+						<line number="106" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="107,110"/>
+						<line number="107" hits="0"/>
+						<line number="110" hits="0"/>
+						<line number="111" hits="0"/>
+						<line number="112" hits="0"/>
+						<line number="113" hits="0"/>
+						<line number="116" hits="0"/>
+						<line number="117" hits="0"/>
+						<line number="118" hits="0"/>
+						<line number="119" hits="0"/>
+						<line number="122" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="123,124"/>
+						<line number="123" hits="0"/>
+						<line number="124" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="125,128"/>
+						<line number="125" hits="0"/>
+						<line number="128" hits="0"/>
+					</lines>
+				</class>
 				<class name="database_query_executor.py" filename="orchestrator/node_executors/data_executors/database_query_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
@@ -21339,6 +23709,135 @@
 						<line number="482" hits="0"/>
 					</lines>
 				</class>
+				<class name="excel_parser_executor.py" filename="orchestrator/node_executors/data_executors/excel_parser_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="17" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="22" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="35" hits="0"/>
+						<line number="36" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="42" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="43,48"/>
+						<line number="43" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="54" hits="0"/>
+						<line number="57" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="58,62"/>
+						<line number="58" hits="0"/>
+						<line number="62" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="63,65"/>
+						<line number="63" hits="0"/>
+						<line number="65" hits="0"/>
+						<line number="66" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="67,72"/>
+						<line number="67" hits="0"/>
+						<line number="72" hits="0"/>
+						<line number="73" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="74,79"/>
+						<line number="74" hits="0"/>
+						<line number="79" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="80,82"/>
+						<line number="80" hits="0"/>
+						<line number="82" hits="0"/>
+						<line number="94" hits="0"/>
+						<line number="95" hits="0"/>
+						<line number="98" hits="0"/>
+						<line number="99" hits="0"/>
+						<line number="101" hits="0"/>
+						<line number="102" hits="0"/>
+						<line number="104" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="105,107"/>
+						<line number="105" hits="0"/>
+						<line number="107" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="108,115"/>
+						<line number="108" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="109,113"/>
+						<line number="109" hits="0"/>
+						<line number="113" hits="0"/>
+						<line number="115" hits="0"/>
+						<line number="116" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="117,119"/>
+						<line number="117" hits="0"/>
+						<line number="119" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="121" hits="0"/>
+						<line number="123" hits="0"/>
+						<line number="124" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="125,131"/>
+						<line number="125" hits="0"/>
+						<line number="126" hits="0"/>
+						<line number="127" hits="0"/>
+						<line number="128" hits="0"/>
+						<line number="129" hits="0"/>
+						<line number="131" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="132,145"/>
+						<line number="132" hits="0"/>
+						<line number="133" hits="0"/>
+						<line number="134" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="136" hits="0"/>
+						<line number="145" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="146,168"/>
+						<line number="146" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="147,149"/>
+						<line number="147" hits="0"/>
+						<line number="149" hits="0"/>
+						<line number="151" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="152,154"/>
+						<line number="152" hits="0"/>
+						<line number="154" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="155,159"/>
+						<line number="155" hits="0"/>
+						<line number="159" hits="0"/>
+						<line number="160" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="161,166"/>
+						<line number="161" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="162,164"/>
+						<line number="162" hits="0"/>
+						<line number="164" hits="0"/>
+						<line number="166" hits="0"/>
+						<line number="168" hits="0"/>
+						<line number="170" hits="0"/>
+						<line number="179" hits="0"/>
+						<line number="188" hits="0"/>
+						<line number="189" hits="0"/>
+						<line number="195" hits="0"/>
+						<line number="197" hits="0"/>
+						<line number="199" hits="0"/>
+						<line number="201" hits="0"/>
+						<line number="202" hits="0"/>
+						<line number="204" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="205,220"/>
+						<line number="205" hits="0"/>
+						<line number="206" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="207,209"/>
+						<line number="207" hits="0"/>
+						<line number="209" hits="0"/>
+						<line number="211" hits="0"/>
+						<line number="212" hits="0"/>
+						<line number="213" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="214,217"/>
+						<line number="214" hits="0"/>
+						<line number="215" hits="0"/>
+						<line number="217" hits="0"/>
+						<line number="218" hits="0"/>
+						<line number="220" hits="0"/>
+						<line number="222" hits="0"/>
+						<line number="224" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="225,226"/>
+						<line number="225" hits="0"/>
+						<line number="226" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="227,228"/>
+						<line number="227" hits="0"/>
+						<line number="228" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="229,230"/>
+						<line number="229" hits="0"/>
+						<line number="230" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="231,232"/>
+						<line number="231" hits="0"/>
+						<line number="232" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="233,234"/>
+						<line number="233" hits="0"/>
+						<line number="234" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="235,236"/>
+						<line number="235" hits="0"/>
+						<line number="236" hits="0"/>
+						<line number="238" hits="0"/>
+						<line number="239" hits="0"/>
+						<line number="241" hits="0"/>
+						<line number="242" hits="0"/>
+					</lines>
+				</class>
 				<class name="filter_executor.py" filename="orchestrator/node_executors/data_executors/filter_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
@@ -21833,6 +24332,47 @@
 						<line number="334" hits="0"/>
 					</lines>
 				</class>
+				<class name="template_engine_executor.py" filename="orchestrator/node_executors/data_executors/template_engine_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="23" hits="0"/>
+						<line number="27" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="29" hits="0"/>
+						<line number="31" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="32,33"/>
+						<line number="32" hits="0"/>
+						<line number="33" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="34,35"/>
+						<line number="34" hits="0"/>
+						<line number="35" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="36,38"/>
+						<line number="36" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="54" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="55,56"/>
+						<line number="55" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="58" hits="0"/>
+						<line number="60" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="65" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="69" hits="0"/>
+						<line number="70" hits="0"/>
+						<line number="71" hits="0"/>
+						<line number="72" hits="0"/>
+					</lines>
+				</class>
 				<class name="transformer_executor.py" filename="orchestrator/node_executors/data_executors/transformer_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
@@ -22361,6 +24901,31 @@
 						<line number="523" hits="0"/>
 					</lines>
 				</class>
+				<class name="delay_executor.py" filename="orchestrator/node_executors/flow_executors/delay_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="25" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="35" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="36,38"/>
+						<line number="36" hits="0"/>
+						<line number="38" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="39,43"/>
+						<line number="39" hits="0"/>
+						<line number="43" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="51" hits="0"/>
+					</lines>
+				</class>
 				<class name="dlq_executor.py" filename="orchestrator/node_executors/flow_executors/dlq_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
@@ -22635,6 +25200,73 @@
 						<line number="531" hits="0"/>
 					</lines>
 				</class>
+				<class name="parallel_executor.py" filename="orchestrator/node_executors/flow_executors/parallel_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="23" hits="0"/>
+						<line number="25" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="28" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="29,40"/>
+						<line number="29" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="35" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="54" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="57" hits="0"/>
+						<line number="58" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="59,61"/>
+						<line number="59" hits="0"/>
+						<line number="61" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="68" hits="0"/>
+						<line number="78" hits="0"/>
+						<line number="82" hits="0"/>
+						<line number="83" hits="0"/>
+						<line number="84" hits="0"/>
+						<line number="86" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="87,94"/>
+						<line number="87" hits="0"/>
+						<line number="94" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="95,96"/>
+						<line number="95" hits="0"/>
+						<line number="96" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="97,98"/>
+						<line number="97" hits="0"/>
+						<line number="98" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="99,101"/>
+						<line number="99" hits="0"/>
+						<line number="101" hits="0"/>
+						<line number="104" hits="0"/>
+						<line number="105" hits="0"/>
+						<line number="107" hits="0"/>
+						<line number="116" hits="0"/>
+						<line number="118" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="119,121"/>
+						<line number="119" hits="0"/>
+						<line number="121" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="122,128"/>
+						<line number="122" hits="0"/>
+						<line number="123" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="124,126"/>
+						<line number="124" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="126" hits="0"/>
+						<line number="128" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="129,137"/>
+						<line number="129" hits="0"/>
+						<line number="130" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="131,135"/>
+						<line number="131" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="132,134"/>
+						<line number="132" hits="0"/>
+						<line number="134" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="137" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="138,143"/>
+						<line number="138" hits="0"/>
+						<line number="143" hits="0"/>
+					</lines>
+				</class>
 				<class name="rate_limiter_executor.py" filename="orchestrator/node_executors/flow_executors/rate_limiter_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
@@ -22855,6 +25487,44 @@
 						<line number="293" hits="0"/>
 					</lines>
 				</class>
+				<class name="subworkflow_executor.py" filename="orchestrator/node_executors/flow_executors/subworkflow_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="30" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="35" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="36,40"/>
+						<line number="36" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="58" hits="0"/>
+						<line number="60" hits="0"/>
+						<line number="68" hits="0"/>
+						<line number="70" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="71,73"/>
+						<line number="71" hits="0"/>
+						<line number="73" hits="0"/>
+						<line number="74" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="76,83"/>
+						<line number="76" hits="0"/>
+						<line number="77" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="78,81"/>
+						<line number="78" hits="0"/>
+						<line number="79" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="77,80"/>
+						<line number="80" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="83" hits="0"/>
+					</lines>
+				</class>
 				<class name="switch_executor.py" filename="orchestrator/node_executors/flow_executors/switch_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
@@ -23027,6 +25697,145 @@
 						<line number="9" hits="0"/>
 					</lines>
 				</class>
+				<class name="email_executor.py" filename="orchestrator/node_executors/integration_executors/email_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="29" hits="0"/>
+						<line number="30" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="36" hits="0"/>
+						<line number="37" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="39" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="41" hits="0"/>
+						<line number="42" hits="0"/>
+						<line number="43" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="48,49"/>
+						<line number="48" hits="0"/>
+						<line number="49" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="50,52"/>
+						<line number="50" hits="0"/>
+						<line number="52" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="53,56"/>
+						<line number="53" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="57" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="58,67"/>
+						<line number="58" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="72" hits="0"/>
+						<line number="80" hits="0"/>
+						<line number="82" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="83,85"/>
+						<line number="83" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="86" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,87"/>
+						<line number="87" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="92" hits="0"/>
+					</lines>
+				</class>
+				<class name="graphql_executor.py" filename="orchestrator/node_executors/integration_executors/graphql_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="29" hits="0"/>
+						<line number="30" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="35" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="36,37"/>
+						<line number="36" hits="0"/>
+						<line number="37" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="38,40"/>
+						<line number="38" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="41" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="42,44"/>
+						<line number="42" hits="0"/>
+						<line number="44" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="54" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="58" hits="0"/>
+					</lines>
+				</class>
+				<class name="http_executor.py" filename="orchestrator/node_executors/integration_executors/http_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="27" hits="0"/>
+						<line number="30" hits="0"/>
+						<line number="39" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="41" hits="0"/>
+						<line number="42" hits="0"/>
+						<line number="44" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="59" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="65" hits="0"/>
+						<line number="66" hits="0"/>
+						<line number="78" hits="0"/>
+						<line number="79" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="80,85"/>
+						<line number="80" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="87" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="88,93"/>
+						<line number="88" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="90" hits="0"/>
+						<line number="91" hits="0"/>
+						<line number="93" hits="0"/>
+						<line number="95" hits="0"/>
+						<line number="102" hits="0"/>
+						<line number="104" hits="0"/>
+						<line number="106" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="107,109"/>
+						<line number="107" hits="0"/>
+						<line number="109" hits="0"/>
+						<line number="110" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="111,114"/>
+						<line number="111" hits="0"/>
+						<line number="114" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="115,118"/>
+						<line number="115" hits="0"/>
+						<line number="118" hits="0"/>
+						<line number="119" hits="0"/>
+						<line number="120" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,121"/>
+						<line number="121" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="120,122"/>
+						<line number="122" hits="0"/>
+						<line number="123" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="127" hits="0"/>
+						<line number="129" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="130,132"/>
+						<line number="130" hits="0"/>
+						<line number="132" hits="0"/>
+						<line number="134" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="135,137"/>
+						<line number="135" hits="0"/>
+						<line number="137" hits="0"/>
+					</lines>
+				</class>
 				<class name="mcp_executor.py" filename="orchestrator/node_executors/integration_executors/mcp_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
@@ -23088,6 +25897,53 @@
 						<line number="210" hits="0"/>
 					</lines>
 				</class>
+				<class name="websocket_executor.py" filename="orchestrator/node_executors/integration_executors/websocket_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="23" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="30" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="36" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="37,40"/>
+						<line number="37" hits="0"/>
+						<line number="40" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="41,43"/>
+						<line number="41" hits="0"/>
+						<line number="43" hits="0"/>
+						<line number="44" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="58" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="59,65"/>
+						<line number="59" hits="0"/>
+						<line number="60" hits="0"/>
+						<line number="65" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="66,79"/>
+						<line number="66" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="68" hits="0"/>
+						<line number="73" hits="0"/>
+						<line number="74" hits="0"/>
+						<line number="79" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="80,96"/>
+						<line number="80" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="82" hits="0"/>
+						<line number="83" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="90" hits="0"/>
+						<line number="96" hits="0"/>
+					</lines>
+				</class>
 			</classes>
 		</package>
 		<package name="orchestrator.node_executors.io_executors" line-rate="0" branch-rate="0" complexity="0">
@@ -23096,7 +25952,88 @@
 					<methods/>
 					<lines>
 						<line number="3" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="13" hits="0"/>
+					</lines>
+				</class>
+				<class name="file_read_executor.py" filename="orchestrator/node_executors/io_executors/file_read_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
 						<line number="7" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="25" hits="0"/>
+						<line number="39" hits="0"/>
+						<line number="43" hits="0"/>
+						<line number="44" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="49" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="50,53"/>
+						<line number="50" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="54" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="55,60"/>
+						<line number="55" hits="0"/>
+						<line number="60" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="61,64"/>
+						<line number="61" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="65" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="78" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="82" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="86" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="88" hits="0"/>
+						<line number="90" hits="0"/>
+					</lines>
+				</class>
+				<class name="file_write_executor.py" filename="orchestrator/node_executors/io_executors/file_write_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="25" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="44" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="51" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="52,57"/>
+						<line number="52" hits="0"/>
+						<line number="57" hits="0"/>
+						<line number="60" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="61,64"/>
+						<line number="61" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="69" hits="0"/>
+						<line number="70" hits="0"/>
+						<line number="71" hits="0"/>
+						<line number="74" hits="0"/>
+						<line number="76" hits="0"/>
+						<line number="83" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="86" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="90" hits="0"/>
+						<line number="91" hits="0"/>
+						<line number="92" hits="0"/>
+						<line number="94" hits="0"/>
 					</lines>
 				</class>
 				<class name="http_request_executor.py" filename="orchestrator/node_executors/io_executors/http_request_executor.py" complexity="0" line-rate="0" branch-rate="0">
@@ -23256,6 +26193,367 @@
 						<line number="433" hits="0"/>
 					</lines>
 				</class>
+				<class name="library_input_executor.py" filename="orchestrator/node_executors/io_executors/library_input_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="7" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="29" hits="0"/>
+						<line number="30" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="35" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="41" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="49,50"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="51,52"/>
+						<line number="51" hits="0"/>
+						<line number="52" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="53,54"/>
+						<line number="53" hits="0"/>
+						<line number="54" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="60" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="65" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="66,68"/>
+						<line number="66" hits="0"/>
+						<line number="68" hits="0"/>
+						<line number="69" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="70,72"/>
+						<line number="70" hits="0"/>
+						<line number="72" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="73,78"/>
+						<line number="73" hits="0"/>
+						<line number="78" hits="0"/>
+						<line number="86" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="90" hits="0"/>
+						<line number="91" hits="0"/>
+						<line number="94" hits="0"/>
+						<line number="95" hits="0"/>
+						<line number="99" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="100,102"/>
+						<line number="100" hits="0"/>
+						<line number="102" hits="0"/>
+						<line number="103" hits="0"/>
+						<line number="104" hits="0"/>
+						<line number="105" hits="0"/>
+						<line number="106" hits="0"/>
+						<line number="108" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="109,123"/>
+						<line number="109" hits="0"/>
+						<line number="123" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="124,128"/>
+						<line number="124" hits="0"/>
+						<line number="128" hits="0"/>
+						<line number="129" hits="0"/>
+						<line number="130" hits="0"/>
+						<line number="131" hits="0"/>
+						<line number="133" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="134,136"/>
+						<line number="134" hits="0"/>
+						<line number="136" hits="0"/>
+						<line number="138" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="139,166"/>
+						<line number="139" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="140,144"/>
+						<line number="140" hits="0"/>
+						<line number="144" hits="0"/>
+						<line number="145" hits="0"/>
+						<line number="146" hits="0"/>
+						<line number="147" hits="0"/>
+						<line number="151" hits="0"/>
+						<line number="166" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="167,172"/>
+						<line number="167" hits="0"/>
+						<line number="172" hits="0"/>
+						<line number="176" hits="0"/>
+						<line number="177" hits="0"/>
+						<line number="186" hits="0"/>
+						<line number="200" hits="0"/>
+						<line number="203" hits="0"/>
+						<line number="204" hits="0"/>
+						<line number="205" hits="0"/>
+						<line number="206" hits="0"/>
+						<line number="208" hits="0"/>
+						<line number="209" hits="0"/>
+						<line number="210" hits="0"/>
+						<line number="212" hits="0"/>
+						<line number="213" hits="0"/>
+						<line number="215" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="216,218"/>
+						<line number="216" hits="0"/>
+						<line number="218" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="219,224"/>
+						<line number="219" hits="0"/>
+						<line number="224" hits="0"/>
+						<line number="226" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="227,229"/>
+						<line number="227" hits="0"/>
+						<line number="228" hits="0"/>
+						<line number="229" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="230,233"/>
+						<line number="230" hits="0"/>
+						<line number="231" hits="0"/>
+						<line number="233" hits="0"/>
+						<line number="235" hits="0"/>
+						<line number="241" hits="0"/>
+						<line number="243" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="244,248"/>
+						<line number="244" hits="0"/>
+						<line number="248" hits="0"/>
+						<line number="249" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="250,253"/>
+						<line number="250" hits="0"/>
+						<line number="253" hits="0"/>
+						<line number="254" hits="0"/>
+						<line number="255" hits="0"/>
+						<line number="256" hits="0"/>
+						<line number="258" hits="0"/>
+						<line number="278" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,279"/>
+						<line number="279" hits="0"/>
+						<line number="280" hits="0"/>
+						<line number="281" hits="0"/>
+						<line number="284" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="285,288"/>
+						<line number="285" hits="0"/>
+						<line number="286" hits="0"/>
+						<line number="287" hits="0"/>
+						<line number="288" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="278,289"/>
+						<line number="289" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="288,290"/>
+						<line number="290" hits="0"/>
+						<line number="295" hits="0"/>
+						<line number="304" hits="0"/>
+						<line number="306" hits="0"/>
+						<line number="307" hits="0"/>
+						<line number="309" hits="0"/>
+						<line number="313" hits="0"/>
+						<line number="315" hits="0"/>
+						<line number="316" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="317,335"/>
+						<line number="317" hits="0"/>
+						<line number="318" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="319,322"/>
+						<line number="319" hits="0"/>
+						<line number="322" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="323,329"/>
+						<line number="323" hits="0"/>
+						<line number="324" hits="0"/>
+						<line number="329" hits="0"/>
+						<line number="331" hits="0"/>
+						<line number="332" hits="0"/>
+						<line number="333" hits="0"/>
+						<line number="335" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="336,338"/>
+						<line number="336" hits="0"/>
+						<line number="338" hits="0"/>
+						<line number="339" hits="0"/>
+						<line number="341" hits="0"/>
+						<line number="349" hits="0"/>
+						<line number="350" hits="0"/>
+						<line number="354" hits="0"/>
+						<line number="356" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="357,358"/>
+						<line number="357" hits="0"/>
+						<line number="358" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="359,361"/>
+						<line number="359" hits="0"/>
+						<line number="361" hits="0"/>
+						<line number="373" hits="0"/>
+						<line number="379" hits="0"/>
+						<line number="383" hits="0"/>
+						<line number="384" hits="0"/>
+						<line number="385" hits="0"/>
+						<line number="386" hits="0"/>
+						<line number="388" hits="0"/>
+						<line number="401" hits="0"/>
+						<line number="402" hits="0"/>
+						<line number="404" hits="0"/>
+						<line number="405" hits="0"/>
+						<line number="407" hits="0"/>
+						<line number="413" hits="0"/>
+						<line number="417" hits="0"/>
+						<line number="418" hits="0"/>
+						<line number="421" hits="0"/>
+						<line number="422" hits="0"/>
+						<line number="430" hits="0"/>
+						<line number="442" hits="0"/>
+						<line number="443" hits="0"/>
+						<line number="444" hits="0"/>
+						<line number="445" hits="0"/>
+						<line number="446" hits="0"/>
+						<line number="448" hits="0"/>
+						<line number="449" hits="0"/>
+						<line number="450" hits="0"/>
+						<line number="457" hits="0"/>
+						<line number="458" hits="0"/>
+						<line number="459" hits="0"/>
+						<line number="460" hits="0"/>
+						<line number="461" hits="0"/>
+						<line number="462" hits="0"/>
+						<line number="463" hits="0"/>
+						<line number="465" hits="0"/>
+						<line number="466" hits="0"/>
+						<line number="468" hits="0"/>
+						<line number="469" hits="0"/>
+					</lines>
+				</class>
+				<class name="save_to_library_executor.py" filename="orchestrator/node_executors/io_executors/save_to_library_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="7" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="27" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="30" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="59" hits="0"/>
+						<line number="61" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="66" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="68" hits="0"/>
+						<line number="69" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="70,71"/>
+						<line number="70" hits="0"/>
+						<line number="71" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="72,73"/>
+						<line number="72" hits="0"/>
+						<line number="73" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="74,75"/>
+						<line number="74" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="77" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="83" hits="0"/>
+						<line number="84" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="86" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="88" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="91" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="92,94"/>
+						<line number="92" hits="0"/>
+						<line number="94" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="95,99"/>
+						<line number="95" hits="0"/>
+						<line number="99" hits="0"/>
+						<line number="100" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="101,103"/>
+						<line number="101" hits="0"/>
+						<line number="103" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="104,110"/>
+						<line number="104" hits="0"/>
+						<line number="110" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="111,113"/>
+						<line number="111" hits="0"/>
+						<line number="113" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="117,122"/>
+						<line number="117" hits="0"/>
+						<line number="122" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="123,127"/>
+						<line number="123" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="122,124"/>
+						<line number="124" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="127" hits="0"/>
+						<line number="128" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="129,131"/>
+						<line number="129" hits="0"/>
+						<line number="131" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="132,136"/>
+						<line number="132" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="133,134"/>
+						<line number="133" hits="0"/>
+						<line number="134" hits="0"/>
+						<line number="136" hits="0"/>
+						<line number="137" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="138,140"/>
+						<line number="138" hits="0"/>
+						<line number="140" hits="0"/>
+						<line number="141" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="142,147"/>
+						<line number="142" hits="0"/>
+						<line number="147" hits="0"/>
+						<line number="156" hits="0"/>
+						<line number="157" hits="0"/>
+						<line number="159" hits="0"/>
+						<line number="179" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="180,181"/>
+						<line number="180" hits="0"/>
+						<line number="181" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="182,184"/>
+						<line number="182" hits="0"/>
+						<line number="184" hits="0"/>
+						<line number="185" hits="0"/>
+						<line number="187" hits="0"/>
+						<line number="188" hits="0"/>
+						<line number="191" hits="0"/>
+						<line number="192" hits="0"/>
+						<line number="194" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="195,197"/>
+						<line number="195" hits="0"/>
+						<line number="197" hits="0"/>
+						<line number="198" hits="0"/>
+						<line number="202" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="203,215"/>
+						<line number="203" hits="0"/>
+						<line number="204" hits="0"/>
+						<line number="207" hits="0"/>
+						<line number="208" hits="0"/>
+						<line number="215" hits="0"/>
+						<line number="216" hits="0"/>
+						<line number="224" hits="0"/>
+						<line number="231" hits="0"/>
+						<line number="237" hits="0"/>
+						<line number="238" hits="0"/>
+						<line number="240" hits="0"/>
+						<line number="241" hits="0"/>
+						<line number="243" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="244,249"/>
+						<line number="244" hits="0"/>
+						<line number="249" hits="0"/>
+						<line number="251" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="252,254"/>
+						<line number="252" hits="0"/>
+						<line number="253" hits="0"/>
+						<line number="254" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="255,258"/>
+						<line number="255" hits="0"/>
+						<line number="256" hits="0"/>
+						<line number="258" hits="0"/>
+						<line number="260" hits="0"/>
+						<line number="267" hits="0"/>
+						<line number="268" hits="0"/>
+						<line number="278" hits="0"/>
+						<line number="279" hits="0"/>
+						<line number="281" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,282"/>
+						<line number="282" hits="0"/>
+						<line number="287" hits="0"/>
+						<line number="288" hits="0"/>
+						<line number="289" hits="0"/>
+						<line number="291" hits="0"/>
+						<line number="294" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="295,297"/>
+						<line number="295" hits="0"/>
+						<line number="297" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="298,309"/>
+						<line number="298" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="299,302"/>
+						<line number="299" hits="0"/>
+						<line number="302" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="303,305"/>
+						<line number="303" hits="0"/>
+						<line number="305" hits="0"/>
+						<line number="309" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="310,312"/>
+						<line number="310" hits="0"/>
+						<line number="312" hits="0"/>
+						<line number="314" hits="0"/>
+						<line number="315" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="316,318"/>
+						<line number="316" hits="0"/>
+						<line number="318" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="319,326"/>
+						<line number="319" hits="0"/>
+						<line number="320" hits="0"/>
+						<line number="321" hits="0"/>
+						<line number="322" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="323,324"/>
+						<line number="323" hits="0"/>
+						<line number="324" hits="0"/>
+						<line number="326" hits="0"/>
+						<line number="327" hits="0"/>
+						<line number="328" hits="0"/>
+						<line number="329" hits="0"/>
+						<line number="330" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="331,332"/>
+						<line number="331" hits="0"/>
+						<line number="332" hits="0"/>
+						<line number="334" hits="0"/>
+						<line number="335" hits="0"/>
+						<line number="337" hits="0"/>
+						<line number="338" hits="0"/>
+					</lines>
+				</class>
 				<class name="ssrf_guard.py" filename="orchestrator/node_executors/io_executors/ssrf_guard.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
@@ -23661,7 +26959,8 @@
 					<methods/>
 					<lines>
 						<line number="3" hits="0"/>
-						<line number="7" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="10" hits="0"/>
 					</lines>
 				</class>
 				<class name="metrics_collector_executor.py" filename="orchestrator/node_executors/output_executors/metrics_collector_executor.py" complexity="0" line-rate="0" branch-rate="0">
@@ -23912,6 +27211,34 @@
 						<line number="45" hits="0"/>
 					</lines>
 				</class>
+				<class name="write_to_console_executor.py" filename="orchestrator/node_executors/output_executors/write_to_console_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="2" hits="0"/>
+						<line number="3" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="37" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="41" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="42,45"/>
+						<line number="42" hits="0"/>
+						<line number="45" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="46,50"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="51,53"/>
+						<line number="51" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="59" hits="0"/>
+						<line number="60" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="61,63"/>
+						<line number="61" hits="0"/>
+						<line number="63" hits="0"/>
+					</lines>
+				</class>
 			</classes>
 		</package>
 		<package name="orchestrator.node_executors.output_executors.notification_providers" line-rate="0" branch-rate="0" complexity="0">
@@ -24154,12 +27481,194 @@
 				</class>
 			</classes>
 		</package>
-		<package name="orchestrator.node_executors.reliability_executors" line-rate="1" branch-rate="1" complexity="0">
+		<package name="orchestrator.node_executors.reliability_executors" line-rate="0" branch-rate="0" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="orchestrator/node_executors/reliability_executors/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
 					<lines/>
 				</class>
+				<class name="circuit_breaker_executor.py" filename="orchestrator/node_executors/reliability_executors/circuit_breaker_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="7" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="17" hits="0"/>
+						<line number="20" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="37" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="39" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="42" hits="0"/>
+						<line number="43" hits="0"/>
+						<line number="44" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="50" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="51,63"/>
+						<line number="51" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="52,55"/>
+						<line number="52" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="69" hits="0"/>
+						<line number="71" hits="0"/>
+						<line number="77" hits="0"/>
+						<line number="79" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="88" hits="0"/>
+						<line number="90" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="91,98"/>
+						<line number="91" hits="0"/>
+						<line number="98" hits="0"/>
+						<line number="100" hits="0"/>
+						<line number="102" hits="0"/>
+						<line number="104" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="105,111"/>
+						<line number="105" hits="0"/>
+						<line number="106" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,107"/>
+						<line number="107" hits="0"/>
+						<line number="108" hits="0"/>
+						<line number="109" hits="0"/>
+						<line number="111" hits="0"/>
+						<line number="113" hits="0"/>
+						<line number="115" hits="0"/>
+						<line number="117" hits="0"/>
+						<line number="118" hits="0"/>
+						<line number="120" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="121,122"/>
+						<line number="121" hits="0"/>
+						<line number="122" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,123"/>
+						<line number="123" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="127" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="128,129"/>
+						<line number="128" hits="0"/>
+						<line number="129" hits="0"/>
+						<line number="131" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="137" hits="0"/>
+						<line number="138" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="139,141"/>
+						<line number="139" hits="0"/>
+						<line number="141" hits="0"/>
+						<line number="142" hits="0"/>
+					</lines>
+				</class>
+				<class name="retry_executor.py" filename="orchestrator/node_executors/reliability_executors/retry_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="7" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="25" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="35" hits="0"/>
+						<line number="36" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="39" hits="0"/>
+						<line number="41" hits="0"/>
+						<line number="43" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="44,100"/>
+						<line number="44" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="69" hits="0"/>
+						<line number="70" hits="0"/>
+						<line number="71" hits="0"/>
+						<line number="73" hits="0"/>
+						<line number="87" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="88,91"/>
+						<line number="88" hits="0"/>
+						<line number="91" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="92,95"/>
+						<line number="92" hits="0"/>
+						<line number="95" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="43,96"/>
+						<line number="96" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="100" hits="0"/>
+						<line number="108" hits="0"/>
+						<line number="112" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="113,115"/>
+						<line number="113" hits="0"/>
+						<line number="115" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="116,118"/>
+						<line number="116" hits="0"/>
+						<line number="118" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="119,121"/>
+						<line number="119" hits="0"/>
+						<line number="121" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="122,127"/>
+						<line number="122" hits="0"/>
+						<line number="123" hits="0"/>
+						<line number="124" hits="0"/>
+						<line number="127" hits="0"/>
+						<line number="129" hits="0"/>
+						<line number="133" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="136" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="137,139"/>
+						<line number="137" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="140" hits="0"/>
+					</lines>
+				</class>
+				<class name="try_catch_executor.py" filename="orchestrator/node_executors/reliability_executors/try_catch_executor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="25" hits="0"/>
+						<line number="27" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="39" hits="0"/>
+						<line number="41" hits="0"/>
+						<line number="42" hits="0"/>
+						<line number="44" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="45,102"/>
+						<line number="45" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="71" hits="0"/>
+						<line number="72" hits="0"/>
+						<line number="73" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="88" hits="0"/>
+						<line number="93" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="44,95"/>
+						<line number="95" hits="0"/>
+						<line number="96" hits="0"/>
+						<line number="99" hits="0"/>
+						<line number="102" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="103,115"/>
+						<line number="103" hits="0"/>
+						<line number="115" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="126" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="127,130"/>
+						<line number="127" hits="0"/>
+						<line number="130" hits="0"/>
+						<line number="132" hits="0"/>
+						<line number="133" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="134,136"/>
+						<line number="134" hits="0"/>
+						<line number="136" hits="0"/>
+						<line number="138" hits="0"/>
+					</lines>
+				</class>
 			</classes>
 		</package>
 		<package name="orchestrator.node_executors.security_executors" line-rate="0" branch-rate="0" complexity="0">
@@ -24506,79 +28015,101 @@
 				<class name="schedule_trigger_executor.py" filename="orchestrator/node_executors/trigger_executors/schedule_trigger_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="2" hits="0"/>
 						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
 						<line number="5" hits="0"/>
-						<line number="6" hits="0"/>
+						<line number="7" hits="0"/>
 						<line number="8" hits="0"/>
+						<line number="9" hits="0"/>
 						<line number="10" hits="0"/>
-						<line number="13" hits="0"/>
-						<line number="31" hits="0"/>
-						<line number="49" hits="0"/>
-						<line number="55" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="29" hits="0"/>
+						<line number="36" hits="0"/>
+						<line number="37" hits="0"/>
+						<line number="39" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="49" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="51,56"/>
+						<line number="51" hits="0"/>
+						<line number="52" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="53,54"/>
+						<line number="53" hits="0"/>
+						<line number="54" hits="0"/>
 						<line number="56" hits="0"/>
+						<line number="57" hits="0"/>
+						<line number="58" hits="0"/>
 						<line number="59" hits="0"/>
-						<line number="60" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="61,84"/>
-						<line number="61" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="62,68"/>
+						<line number="60" hits="0"/>
 						<line number="62" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="65" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="66,68"/>
+						<line number="66" hits="0"/>
 						<line number="68" hits="0"/>
-						<line number="69" hits="0"/>
 						<line number="70" hits="0"/>
 						<line number="71" hits="0"/>
-						<line number="72" hits="0"/>
 						<line number="73" hits="0"/>
 						<line number="74" hits="0"/>
-						<line number="75" hits="0"/>
-						<line number="76" hits="0"/>
-						<line number="84" hits="0"/>
+						<line number="77" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="86" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="88" hits="0"/>
+						<line number="90" hits="0"/>
+						<line number="92" hits="0"/>
+						<line number="94" hits="0"/>
+						<line number="96" hits="0"/>
+						<line number="98" hits="0"/>
+						<line number="99" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,100"/>
+						<line number="100" hits="0"/>
+						<line number="102" hits="0"/>
+						<line number="104" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,106"/>
+						<line number="106" hits="0"/>
+						<line number="108" hits="0"/>
+						<line number="117" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="118,121"/>
+						<line number="118" hits="0"/>
+						<line number="121" hits="0"/>
+						<line number="123" hits="0"/>
+						<line number="125" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,126"/>
+						<line number="126" hits="0"/>
+						<line number="127" hits="0"/>
 					</lines>
 				</class>
 				<class name="webhook_trigger_executor.py" filename="orchestrator/node_executors/trigger_executors/webhook_trigger_executor.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="2" hits="0"/>
 						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
 						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
 						<line number="7" hits="0"/>
 						<line number="9" hits="0"/>
-						<line number="12" hits="0"/>
-						<line number="15" hits="0"/>
-						<line number="31" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="22" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="27" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="29" hits="0"/>
+						<line number="30" hits="0"/>
 						<line number="33" hits="0"/>
-						<line number="51" hits="0"/>
-						<line number="53" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="54,59"/>
-						<line number="54" hits="0"/>
-						<line number="59" hits="0"/>
-						<line number="60" hits="0"/>
-						<line number="61" hits="0"/>
-						<line number="62" hits="0"/>
+						<line number="34" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="35,43"/>
+						<line number="35" hits="0"/>
+						<line number="38" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="39,40"/>
+						<line number="39" hits="0"/>
+						<line number="40" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="41,43"/>
+						<line number="41" hits="0"/>
+						<line number="43" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="58" hits="0"/>
 						<line number="63" hits="0"/>
-						<line number="66" hits="0"/>
-						<line number="67" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="69,73"/>
-						<line number="69" hits="0"/>
-						<line number="70" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="71,73"/>
-						<line number="71" hits="0"/>
-						<line number="73" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="74,82"/>
-						<line number="74" hits="0"/>
-						<line number="75" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="76,82"/>
-						<line number="76" hits="0"/>
-						<line number="82" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="83,101"/>
+						<line number="65" hits="0"/>
+						<line number="70" hits="0"/>
+						<line number="77" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="82" hits="0"/>
 						<line number="83" hits="0"/>
-						<line number="85" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="86,90"/>
-						<line number="86" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="85,87"/>
-						<line number="87" hits="0"/>
-						<line number="88" hits="0"/>
-						<line number="90" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="91,101"/>
-						<line number="91" hits="0"/>
-						<line number="92" hits="0"/>
-						<line number="93" hits="0"/>
-						<line number="94" hits="0"/>
-						<line number="101" hits="0"/>
-						<line number="102" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="103,108"/>
-						<line number="103" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="104,106"/>
-						<line number="104" hits="0"/>
-						<line number="106" hits="0"/>
-						<line number="108" hits="0"/>
+						<line number="86" hits="0"/>
 					</lines>
 				</class>
 			</classes>
@@ -25562,79 +29093,83 @@
 				</class>
 			</classes>
 		</package>
-		<package name="orchestrator.rag" line-rate="0" branch-rate="0" complexity="0">
+		<package name="orchestrator.rag" line-rate="0.8779" branch-rate="0.7409" complexity="0">
 			<classes>
-				<class name="__init__.py" filename="orchestrator/rag/__init__.py" complexity="0" line-rate="0" branch-rate="1">
+				<class name="__init__.py" filename="orchestrator/rag/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
 					<lines>
-						<line number="13" hits="0"/>
-						<line number="19" hits="0"/>
-						<line number="20" hits="0"/>
-						<line number="21" hits="0"/>
-						<line number="23" hits="0"/>
+						<line number="13" hits="1"/>
+						<line number="19" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="39" hits="1"/>
+						<line number="41" hits="1"/>
 					</lines>
 				</class>
-				<class name="bm25_retriever.py" filename="orchestrator/rag/bm25_retriever.py" complexity="0" line-rate="0" branch-rate="0">
+				<class name="bm25_retriever.py" filename="orchestrator/rag/bm25_retriever.py" complexity="0" line-rate="0.8322" branch-rate="0.6714">
 					<methods/>
 					<lines>
-						<line number="9" hits="0"/>
-						<line number="10" hits="0"/>
-						<line number="11" hits="0"/>
-						<line number="12" hits="0"/>
-						<line number="13" hits="0"/>
-						<line number="15" hits="0"/>
-						<line number="17" hits="0"/>
-						<line number="20" hits="0"/>
-						<line number="21" hits="0"/>
-						<line number="23" hits="0"/>
-						<line number="24" hits="0"/>
-						<line number="25" hits="0"/>
-						<line number="26" hits="0"/>
-						<line number="27" hits="0"/>
-						<line number="30" hits="0"/>
-						<line number="45" hits="0"/>
-						<line number="57" hits="0"/>
-						<line number="73" hits="0"/>
-						<line number="74" hits="0"/>
-						<line number="75" hits="0"/>
-						<line number="76" hits="0"/>
-						<line number="79" hits="0"/>
-						<line number="82" hits="0"/>
-						<line number="85" hits="0"/>
-						<line number="88" hits="0"/>
-						<line number="89" hits="0"/>
-						<line number="90" hits="0"/>
-						<line number="92" hits="0"/>
-						<line number="94" hits="0"/>
-						<line number="105" hits="0"/>
-						<line number="108" hits="0"/>
-						<line number="109" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="111,124"/>
-						<line number="111" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="112,115"/>
-						<line number="112" hits="0"/>
-						<line number="115" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="116,119"/>
-						<line number="116" hits="0"/>
-						<line number="119" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="120,122"/>
+						<line number="9" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="25" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="30" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="57" hits="1"/>
+						<line number="73" hits="1"/>
+						<line number="74" hits="1"/>
+						<line number="75" hits="1"/>
+						<line number="76" hits="1"/>
+						<line number="79" hits="1"/>
+						<line number="82" hits="1"/>
+						<line number="85" hits="1"/>
+						<line number="88" hits="1"/>
+						<line number="89" hits="1"/>
+						<line number="90" hits="1"/>
+						<line number="92" hits="1"/>
+						<line number="94" hits="1"/>
+						<line number="105" hits="1"/>
+						<line number="108" hits="1"/>
+						<line number="109" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="111" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="112" hits="1"/>
+						<line number="115" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="116" hits="1"/>
+						<line number="119" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="120"/>
 						<line number="120" hits="0"/>
-						<line number="122" hits="0"/>
-						<line number="124" hits="0"/>
-						<line number="126" hits="0"/>
-						<line number="133" hits="0"/>
-						<line number="134" hits="0"/>
-						<line number="137" hits="0"/>
-						<line number="138" hits="0"/>
-						<line number="141" hits="0"/>
-						<line number="150" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="151,154"/>
+						<line number="122" hits="1"/>
+						<line number="124" hits="1"/>
+						<line number="126" hits="1"/>
+						<line number="133" hits="1"/>
+						<line number="134" hits="1"/>
+						<line number="137" hits="1"/>
+						<line number="138" hits="1"/>
+						<line number="141" hits="1"/>
+						<line number="150" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="151"/>
 						<line number="151" hits="0"/>
-						<line number="154" hits="0"/>
-						<line number="157" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="158,164"/>
-						<line number="158" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="159,160"/>
-						<line number="159" hits="0"/>
-						<line number="160" hits="0"/>
-						<line number="161" hits="0"/>
-						<line number="164" hits="0"/>
-						<line number="165" hits="0"/>
-						<line number="166" hits="0"/>
-						<line number="168" hits="0"/>
+						<line number="154" hits="1"/>
+						<line number="157" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="158" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="159" hits="1"/>
+						<line number="160" hits="1"/>
+						<line number="161" hits="1"/>
+						<line number="164" hits="1"/>
+						<line number="165" hits="1"/>
+						<line number="166" hits="1"/>
+						<line number="168" hits="1"/>
 						<line number="170" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="171,173"/>
 						<line number="171" hits="0"/>
 						<line number="173" hits="0"/>
@@ -25651,419 +29186,1208 @@
 						<line number="189" hits="0"/>
 						<line number="191" hits="0"/>
 						<line number="194" hits="0"/>
-						<line number="196" hits="0"/>
-						<line number="208" hits="0"/>
-						<line number="209" hits="0"/>
-						<line number="211" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="212,214"/>
+						<line number="196" hits="1"/>
+						<line number="208" hits="1"/>
+						<line number="209" hits="1"/>
+						<line number="211" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="212"/>
 						<line number="212" hits="0"/>
-						<line number="214" hits="0"/>
-						<line number="216" hits="0"/>
-						<line number="231" hits="0"/>
-						<line number="233" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="234,251"/>
-						<line number="234" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="235,238"/>
-						<line number="235" hits="0"/>
-						<line number="238" hits="0"/>
-						<line number="241" hits="0"/>
-						<line number="244" hits="0"/>
-						<line number="245" hits="0"/>
-						<line number="249" hits="0"/>
-						<line number="251" hits="0"/>
-						<line number="253" hits="0"/>
-						<line number="270" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="271,274"/>
+						<line number="214" hits="1"/>
+						<line number="216" hits="1"/>
+						<line number="231" hits="1"/>
+						<line number="233" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="234" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="235" hits="1"/>
+						<line number="238" hits="1"/>
+						<line number="241" hits="1"/>
+						<line number="244" hits="1"/>
+						<line number="245" hits="1"/>
+						<line number="249" hits="1"/>
+						<line number="251" hits="1"/>
+						<line number="253" hits="1"/>
+						<line number="270" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="271"/>
 						<line number="271" hits="0"/>
-						<line number="274" hits="0"/>
-						<line number="276" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="277,280"/>
-						<line number="277" hits="0"/>
-						<line number="280" hits="0"/>
-						<line number="281" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="282,285"/>
-						<line number="282" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="281,283"/>
-						<line number="283" hits="0"/>
-						<line number="285" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="286,289"/>
-						<line number="286" hits="0"/>
-						<line number="289" hits="0"/>
-						<line number="290" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="291,300"/>
-						<line number="291" hits="0"/>
-						<line number="292" hits="0"/>
-						<line number="294" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="290,296"/>
-						<line number="296" hits="0"/>
-						<line number="297" hits="0"/>
-						<line number="300" hits="0"/>
-						<line number="303" hits="0"/>
-						<line number="305" hits="0"/>
-						<line number="307" hits="0"/>
-						<line number="308" hits="0"/>
-						<line number="309" hits="0"/>
-						<line number="310" hits="0"/>
-						<line number="311" hits="0"/>
-						<line number="312" hits="0"/>
-						<line number="314" hits="0"/>
+						<line number="274" hits="1"/>
+						<line number="276" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="277" hits="1"/>
+						<line number="280" hits="1"/>
+						<line number="281" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="282" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="283" hits="1"/>
+						<line number="285" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="286" hits="1"/>
+						<line number="289" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="290" hits="1"/>
+						<line number="294" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="295" hits="1"/>
+						<line number="298" hits="1"/>
+						<line number="299" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="300" hits="1"/>
+						<line number="301" hits="1"/>
+						<line number="303" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="299"/>
+						<line number="305" hits="1"/>
+						<line number="306" hits="1"/>
+						<line number="309" hits="1"/>
+						<line number="312" hits="1"/>
+						<line number="314" hits="1"/>
+						<line number="319" hits="1"/>
+						<line number="320" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="321"/>
+						<line number="321" hits="0"/>
+						<line number="323" hits="1"/>
+						<line number="326" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="331"/>
+						<line number="327" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="328" hits="1"/>
+						<line number="331" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="332" hits="1"/>
+						<line number="333" hits="1"/>
+						<line number="334" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="335" hits="1"/>
+						<line number="338" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="339" hits="1"/>
+						<line number="340" hits="1"/>
+						<line number="341" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="342"/>
+						<line number="342" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="343,348"/>
+						<line number="343" hits="0"/>
+						<line number="344" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="345" hits="1"/>
+						<line number="348" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="349"/>
+						<line number="349" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="350,352"/>
+						<line number="350" hits="0"/>
+						<line number="352" hits="1"/>
+						<line number="354" hits="1"/>
+						<line number="356" hits="1"/>
+						<line number="357" hits="1"/>
+						<line number="358" hits="1"/>
+						<line number="359" hits="1"/>
+						<line number="360" hits="1"/>
+						<line number="361" hits="1"/>
+						<line number="363" hits="1"/>
 					</lines>
 				</class>
-				<class name="hybrid_rag.py" filename="orchestrator/rag/hybrid_rag.py" complexity="0" line-rate="0" branch-rate="0">
+				<class name="chunker.py" filename="orchestrator/rag/chunker.py" complexity="0" line-rate="0.9268" branch-rate="0.7727">
 					<methods/>
 					<lines>
-						<line number="17" hits="0"/>
-						<line number="18" hits="0"/>
-						<line number="19" hits="0"/>
-						<line number="20" hits="0"/>
-						<line number="21" hits="0"/>
-						<line number="22" hits="0"/>
-						<line number="23" hits="0"/>
-						<line number="24" hits="0"/>
-						<line number="26" hits="0"/>
-						<line number="28" hits="0"/>
-						<line number="33" hits="0"/>
-						<line number="35" hits="0"/>
-						<line number="36" hits="0"/>
-						<line number="37" hits="0"/>
-						<line number="38" hits="0"/>
-						<line number="43" hits="0"/>
-						<line number="44" hits="0"/>
-						<line number="46" hits="0"/>
-						<line number="47" hits="0"/>
-						<line number="48" hits="0"/>
-						<line number="51" hits="0"/>
-						<line number="52" hits="0"/>
-						<line number="53" hits="0"/>
-						<line number="54" hits="0"/>
-						<line number="57" hits="0"/>
-						<line number="58" hits="0"/>
-						<line number="60" hits="0"/>
-						<line number="61" hits="0"/>
-						<line number="76" hits="0"/>
-						<line number="77" hits="0"/>
-						<line number="79" hits="0"/>
-						<line number="80" hits="0"/>
-						<line number="83" hits="0"/>
-						<line number="84" hits="0"/>
-						<line number="85" hits="0"/>
-						<line number="88" hits="0"/>
-						<line number="89" hits="0"/>
-						<line number="90" hits="0"/>
-						<line number="93" hits="0"/>
-						<line number="95" hits="0"/>
-						<line number="96" hits="0"/>
-						<line number="112" hits="0"/>
-						<line number="114" hits="0"/>
-						<line number="115" hits="0"/>
-						<line number="117" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="119,127"/>
-						<line number="119" hits="0"/>
-						<line number="121" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="122,124"/>
-						<line number="122" hits="0"/>
-						<line number="124" hits="0"/>
-						<line number="125" hits="0"/>
-						<line number="127" hits="0"/>
-						<line number="130" hits="0"/>
-						<line number="131" hits="0"/>
-						<line number="134" hits="0"/>
-						<line number="135" hits="0"/>
+						<line number="9" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="14" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="25" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="28" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="32" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="35" hits="1"/>
+						<line number="36" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="41" hits="1"/>
+						<line number="42" hits="1"/>
+						<line number="43" hits="1"/>
+						<line number="44" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="46" hits="1"/>
+						<line number="47" hits="1"/>
+						<line number="48" hits="1"/>
+						<line number="49" hits="1"/>
+						<line number="50" hits="1"/>
+						<line number="51" hits="1"/>
+						<line number="52" hits="1"/>
+						<line number="53" hits="1"/>
+						<line number="54" hits="1"/>
+						<line number="55" hits="1"/>
+						<line number="56" hits="1"/>
+						<line number="59" hits="1"/>
+						<line number="62" hits="1"/>
+						<line number="63" hits="1"/>
+						<line number="65" hits="1"/>
+						<line number="66" hits="1"/>
+						<line number="68" hits="1"/>
+						<line number="70" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="71" hits="1"/>
+						<line number="73" hits="1"/>
+						<line number="74" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="75" hits="1"/>
+						<line number="77" hits="1"/>
+						<line number="79" hits="1"/>
+						<line number="80" hits="1"/>
+						<line number="82" hits="1"/>
+						<line number="104" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="105" hits="1"/>
+						<line number="108" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="109"/>
+						<line number="109" hits="0"/>
+						<line number="110" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="111" hits="1"/>
+						<line number="113" hits="1"/>
+						<line number="115" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="116" hits="1"/>
+						<line number="119" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="120" hits="1"/>
+						<line number="121" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="122" hits="1"/>
+						<line number="124" hits="1"/>
+						<line number="126" hits="1"/>
+						<line number="132" hits="1"/>
+						<line number="137" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="138"/>
 						<line number="138" hits="0"/>
-						<line number="139" hits="0"/>
-						<line number="140" hits="0"/>
+						<line number="140" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="173"/>
+						<line number="141" hits="1"/>
+						<line number="142" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="143"/>
 						<line number="143" hits="0"/>
-						<line number="144" hits="0"/>
-						<line number="147" hits="0"/>
-						<line number="148" hits="0"/>
-						<line number="151" hits="0"/>
-						<line number="154" hits="0"/>
-						<line number="155" hits="0"/>
-						<line number="160" hits="0"/>
-						<line number="171" hits="0"/>
-						<line number="179" hits="0"/>
-						<line number="182" hits="0"/>
-						<line number="183" hits="0"/>
-						<line number="184" hits="0"/>
-						<line number="187" hits="0"/>
-						<line number="190" hits="0"/>
+						<line number="145" hits="1"/>
+						<line number="146" hits="1"/>
+						<line number="148" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="149" hits="1"/>
+						<line number="150" hits="1"/>
+						<line number="151" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="152" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="154"/>
+						<line number="153" hits="1"/>
+						<line number="154" hits="1"/>
+						<line number="156" hits="1"/>
+						<line number="158" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="162"/>
+						<line number="159" hits="1"/>
+						<line number="162" hits="1"/>
+						<line number="163" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="164" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="165"/>
+						<line number="165" hits="0"/>
+						<line number="167" hits="1"/>
+						<line number="169" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="140"/>
+						<line number="170" hits="1"/>
+						<line number="173" hits="0"/>
+						<line number="177" hits="1"/>
+						<line number="179" hits="1"/>
+						<line number="180" hits="1"/>
+						<line number="185" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="186"/>
+						<line number="186" hits="0"/>
+						<line number="188" hits="1"/>
+						<line number="191" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="192"/>
 						<line number="192" hits="0"/>
-						<line number="198" hits="0"/>
-						<line number="199" hits="0"/>
-						<line number="201" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="202,207"/>
-						<line number="202" hits="0"/>
-						<line number="203" hits="0"/>
-						<line number="207" hits="0"/>
-						<line number="209" hits="0"/>
-						<line number="210" hits="0"/>
-						<line number="212" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="213,217"/>
-						<line number="213" hits="0"/>
-						<line number="214" hits="0"/>
-						<line number="217" hits="0"/>
-						<line number="219" hits="0"/>
-						<line number="220" hits="0"/>
-						<line number="222" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="223,225"/>
-						<line number="223" hits="0"/>
-						<line number="224" hits="0"/>
-						<line number="225" hits="0"/>
-						<line number="227" hits="0"/>
-						<line number="248" hits="0"/>
-						<line number="256" hits="0"/>
-						<line number="259" hits="0"/>
-						<line number="260" hits="0"/>
-						<line number="262" hits="0"/>
-						<line number="269" hits="0"/>
-						<line number="271" hits="0"/>
-						<line number="276" hits="0"/>
-						<line number="277" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="278,286"/>
-						<line number="278" hits="0"/>
-						<line number="285" hits="0"/>
-						<line number="286" hits="0"/>
-						<line number="288" hits="0"/>
-						<line number="309" hits="0"/>
-						<line number="310" hits="0"/>
-						<line number="313" hits="0"/>
-						<line number="314" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="315,320"/>
-						<line number="315" hits="0"/>
-						<line number="316" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="317,320"/>
-						<line number="317" hits="0"/>
-						<line number="318" hits="0"/>
-						<line number="320" hits="0"/>
-						<line number="321" hits="0"/>
-						<line number="323" hits="0"/>
-						<line number="325" hits="0"/>
-						<line number="327" hits="0"/>
-						<line number="328" hits="0"/>
-						<line number="330" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="331,338"/>
+						<line number="193" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="194,196"/>
+						<line number="194" hits="0"/>
+						<line number="196" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="197" hits="1"/>
+						<line number="198" hits="1"/>
+						<line number="200" hits="1"/>
+						<line number="201" hits="1"/>
+						<line number="203" hits="1"/>
+						<line number="205" hits="1"/>
+						<line number="207" hits="1"/>
+						<line number="212" hits="1"/>
+						<line number="214" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="215"/>
+						<line number="215" hits="0"/>
+						<line number="217" hits="1"/>
+						<line number="220" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="225"/>
+						<line number="221" hits="1"/>
+						<line number="222" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="225"/>
+						<line number="223" hits="1"/>
+						<line number="225" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="226" hits="1"/>
+						<line number="227" hits="1"/>
+						<line number="228" hits="1"/>
+						<line number="229" hits="1"/>
+						<line number="231" hits="1"/>
+						<line number="235" hits="1"/>
+						<line number="245" hits="1"/>
+						<line number="246" hits="1"/>
+						<line number="249" hits="1"/>
+						<line number="250" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="251" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="252" hits="1"/>
+						<line number="253" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="254" hits="1"/>
+						<line number="256" hits="1"/>
+						<line number="259" hits="1"/>
+						<line number="260" hits="1"/>
+						<line number="261" hits="1"/>
+						<line number="263" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="264" hits="1"/>
+						<line number="265" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="266" hits="1"/>
+						<line number="267" hits="1"/>
+						<line number="268" hits="1"/>
+						<line number="270" hits="1"/>
+						<line number="271" hits="1"/>
+						<line number="273" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="277"/>
+						<line number="274" hits="1"/>
+						<line number="277" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="278" hits="1"/>
+						<line number="279" hits="1"/>
+						<line number="280" hits="1"/>
+						<line number="283" hits="1"/>
+						<line number="284" hits="1"/>
+						<line number="285" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="286" hits="1"/>
+						<line number="288" hits="1"/>
+						<line number="290" hits="1"/>
+						<line number="306" hits="1"/>
+						<line number="307" hits="1"/>
+						<line number="309" hits="1"/>
+						<line number="313" hits="1"/>
+						<line number="314" hits="1"/>
+						<line number="316" hits="1"/>
+						<line number="320" hits="1"/>
+						<line number="322" hits="1"/>
+						<line number="323" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="324" hits="1"/>
+						<line number="325" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="326"/>
+						<line number="326" hits="0"/>
+						<line number="328" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="329" hits="1"/>
+						<line number="330" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="331"/>
 						<line number="331" hits="0"/>
-						<line number="336" hits="0"/>
-						<line number="338" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="339,346"/>
-						<line number="339" hits="0"/>
-						<line number="344" hits="0"/>
-						<line number="346" hits="0"/>
-						<line number="347" hits="0"/>
-						<line number="352" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="353,354"/>
-						<line number="353" hits="0"/>
-						<line number="354" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="355,357"/>
-						<line number="355" hits="0"/>
-						<line number="357" hits="0"/>
-						<line number="366" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="367,384"/>
-						<line number="367" hits="0"/>
-						<line number="370" hits="0"/>
-						<line number="371" hits="0"/>
-						<line number="377" hits="0"/>
+						<line number="333" hits="1"/>
+						<line number="334" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="335" hits="1"/>
+						<line number="337" hits="1"/>
+						<line number="338" hits="1"/>
+						<line number="340" hits="1"/>
+						<line number="354" hits="1"/>
+						<line number="356" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="357" hits="1"/>
+						<line number="376" hits="1"/>
+						<line number="377" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="378"/>
 						<line number="378" hits="0"/>
-						<line number="382" hits="0"/>
-						<line number="384" hits="0"/>
-						<line number="386" hits="0"/>
-						<line number="389" hits="0"/>
-						<line number="390" hits="0"/>
-						<line number="395" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="396,398"/>
-						<line number="396" hits="0"/>
-						<line number="398" hits="0"/>
-						<line number="407" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="408,421"/>
-						<line number="408" hits="0"/>
-						<line number="409" hits="0"/>
-						<line number="410" hits="0"/>
-						<line number="411" hits="0"/>
-						<line number="412" hits="0"/>
-						<line number="418" hits="0"/>
-						<line number="419" hits="0"/>
-						<line number="421" hits="0"/>
-						<line number="423" hits="0"/>
-						<line number="424" hits="0"/>
-						<line number="425" hits="0"/>
-						<line number="427" hits="0"/>
-						<line number="450" hits="0"/>
-						<line number="451" hits="0"/>
-						<line number="454" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="455,461"/>
-						<line number="455" hits="0"/>
-						<line number="456" hits="0"/>
-						<line number="457" hits="0"/>
-						<line number="458" hits="0"/>
-						<line number="461" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="462,472"/>
-						<line number="462" hits="0"/>
-						<line number="463" hits="0"/>
-						<line number="465" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="466,468"/>
-						<line number="466" hits="0"/>
-						<line number="468" hits="0"/>
-						<line number="469" hits="0"/>
-						<line number="472" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="473,475"/>
-						<line number="473" hits="0"/>
-						<line number="475" hits="0"/>
-						<line number="481" hits="0"/>
+						<line number="380" hits="1"/>
+						<line number="382" hits="1"/>
+						<line number="383" hits="1"/>
+						<line number="385" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="387" hits="1"/>
+						<line number="388" hits="1"/>
+						<line number="389" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="390" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="391" hits="1"/>
+						<line number="392" hits="1"/>
+						<line number="393" hits="1"/>
+						<line number="395" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="397"/>
+						<line number="397" hits="0"/>
+						<line number="399" hits="1"/>
+						<line number="400" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="401"/>
+						<line number="401" hits="0"/>
+						<line number="402" hits="0"/>
+						<line number="404" hits="1"/>
+						<line number="407" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="408" hits="1"/>
+						<line number="409" hits="1"/>
+						<line number="410" hits="1"/>
+						<line number="426" hits="1"/>
+						<line number="427" hits="1"/>
+						<line number="430" hits="1"/>
+						<line number="432" hits="1"/>
+						<line number="452" hits="1"/>
+						<line number="453" hits="1"/>
+						<line number="454" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="455" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="456" hits="1"/>
+						<line number="457" hits="1"/>
+						<line number="458" hits="1"/>
+						<line number="460" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="461"/>
+						<line number="461" hits="0"/>
+						<line number="463" hits="1"/>
+						<line number="465" hits="1"/>
+						<line number="469" hits="1"/>
+						<line number="479" hits="1"/>
+						<line number="480" hits="1"/>
+						<line number="482" hits="1"/>
+						<line number="483" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="484"/>
+						<line number="484" hits="0"/>
+						<line number="486" hits="1"/>
+						<line number="487" hits="1"/>
+						<line number="488" hits="1"/>
+						<line number="490" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="491" hits="1"/>
+						<line number="492" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="493" hits="1"/>
+						<line number="494" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="497"/>
+						<line number="495" hits="1"/>
+						<line number="497" hits="1"/>
+						<line number="498" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="519"/>
+						<line number="499" hits="1"/>
+						<line number="517" hits="1"/>
+						<line number="519" hits="1"/>
+						<line number="521" hits="1"/>
+					</lines>
+				</class>
+				<class name="guardrails.py" filename="orchestrator/rag/guardrails.py" complexity="0" line-rate="0.9744" branch-rate="0.9412">
+					<methods/>
+					<lines>
+						<line number="18" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="32" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="35" hits="1"/>
+						<line number="36" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="40" hits="1"/>
+						<line number="41" hits="1"/>
+						<line number="43" hits="1"/>
+						<line number="44" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="46" hits="1"/>
+						<line number="47" hits="1"/>
+						<line number="48" hits="1"/>
+						<line number="49" hits="1"/>
+						<line number="52" hits="1"/>
+						<line number="62" hits="1"/>
+						<line number="69" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="70"/>
+						<line number="70" hits="0"/>
+						<line number="73" hits="1"/>
+						<line number="74" hits="1"/>
+						<line number="75" hits="1"/>
+						<line number="76" hits="1"/>
+						<line number="78" hits="1"/>
+						<line number="84" hits="1"/>
+						<line number="86" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="87" hits="1"/>
+						<line number="97" hits="1"/>
+						<line number="98" hits="1"/>
+						<line number="99" hits="1"/>
+						<line number="102" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="103" hits="1"/>
+						<line number="104" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="105" hits="1"/>
+						<line number="106" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="107" hits="1"/>
+						<line number="109" hits="1"/>
+						<line number="112" hits="1"/>
+						<line number="115" hits="1"/>
+						<line number="117" hits="1"/>
+						<line number="119" hits="1"/>
+						<line number="128" hits="1"/>
+						<line number="138" hits="1"/>
+						<line number="139" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="140" hits="1"/>
+						<line number="141" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="142" hits="1"/>
+						<line number="143" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="144" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="145" hits="1"/>
+						<line number="146" hits="1"/>
+						<line number="148" hits="1"/>
+						<line number="150" hits="1"/>
+						<line number="154" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="155" hits="1"/>
+						<line number="157" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="158" hits="1"/>
+						<line number="160" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="161" hits="1"/>
+						<line number="163" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="164" hits="1"/>
+						<line number="166" hits="1"/>
+						<line number="168" hits="1"/>
+						<line number="170" hits="1"/>
+						<line number="172" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="173" hits="1"/>
+						<line number="178" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="179" hits="1"/>
+						<line number="184" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="185" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="192"/>
+						<line number="186" hits="1"/>
+						<line number="192" hits="0"/>
+						<line number="199" hits="1"/>
+					</lines>
+				</class>
+				<class name="hybrid_rag.py" filename="orchestrator/rag/hybrid_rag.py" complexity="0" line-rate="0.9252" branch-rate="0.8235">
+					<methods/>
+					<lines>
+						<line number="17" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="19" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="28" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="35" hits="1"/>
+						<line number="36" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="43" hits="1"/>
+						<line number="44" hits="1"/>
+						<line number="46" hits="1"/>
+						<line number="47" hits="1"/>
+						<line number="48" hits="1"/>
+						<line number="51" hits="1"/>
+						<line number="52" hits="1"/>
+						<line number="53" hits="1"/>
+						<line number="54" hits="1"/>
+						<line number="57" hits="1"/>
+						<line number="58" hits="1"/>
+						<line number="61" hits="1"/>
+						<line number="62" hits="1"/>
+						<line number="63" hits="1"/>
+						<line number="64" hits="1"/>
+						<line number="66" hits="1"/>
+						<line number="68" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="69" hits="1"/>
+						<line number="70" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="71" hits="1"/>
+						<line number="72" hits="1"/>
+						<line number="74" hits="1"/>
+						<line number="75" hits="1"/>
+						<line number="94" hits="1"/>
+						<line number="95" hits="1"/>
+						<line number="97" hits="1"/>
+						<line number="98" hits="1"/>
+						<line number="101" hits="1"/>
+						<line number="102" hits="1"/>
+						<line number="103" hits="1"/>
+						<line number="106" hits="1"/>
+						<line number="107" hits="1"/>
+						<line number="108" hits="1"/>
+						<line number="111" hits="1"/>
+						<line number="114" hits="1"/>
+						<line number="116" hits="1"/>
+						<line number="117" hits="1"/>
+						<line number="134" hits="1"/>
+						<line number="136" hits="1"/>
+						<line number="137" hits="1"/>
+						<line number="139" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="141" hits="1"/>
+						<line number="143" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="144"/>
+						<line number="144" hits="0"/>
+						<line number="146" hits="1"/>
+						<line number="147" hits="1"/>
+						<line number="149" hits="1"/>
+						<line number="151" hits="1"/>
+						<line number="159" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="160" hits="1"/>
+						<line number="162" hits="1"/>
+						<line number="163" hits="1"/>
+						<line number="164" hits="1"/>
+						<line number="165" hits="1"/>
+						<line number="167" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="168" hits="1"/>
+						<line number="170" hits="1"/>
+						<line number="172" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="173" hits="1"/>
+						<line number="176" hits="1"/>
+						<line number="180" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="191"/>
+						<line number="181" hits="1"/>
+						<line number="182" hits="1"/>
+						<line number="183" hits="1"/>
+						<line number="191" hits="1"/>
+						<line number="192" hits="1"/>
+						<line number="193" hits="1"/>
+						<line number="194" hits="1"/>
+						<line number="195" hits="1"/>
+						<line number="197" hits="1"/>
+						<line number="200" hits="1"/>
+						<line number="201" hits="1"/>
+						<line number="204" hits="1"/>
+						<line number="205" hits="1"/>
+						<line number="208" hits="1"/>
+						<line number="209" hits="1"/>
+						<line number="210" hits="1"/>
+						<line number="213" hits="1"/>
+						<line number="214" hits="1"/>
+						<line number="217" hits="1"/>
+						<line number="218" hits="1"/>
+						<line number="221" hits="1"/>
+						<line number="224" hits="1"/>
+						<line number="225" hits="1"/>
+						<line number="228" hits="1"/>
+						<line number="230" hits="1"/>
+						<line number="231" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="232" hits="1"/>
+						<line number="233" hits="1"/>
+						<line number="238" hits="1"/>
+						<line number="249" hits="1"/>
+						<line number="257" hits="1"/>
+						<line number="260" hits="1"/>
+						<line number="261" hits="1"/>
+						<line number="262" hits="1"/>
+						<line number="263" hits="1"/>
+						<line number="266" hits="1"/>
+						<line number="269" hits="1"/>
+						<line number="271" hits="1"/>
+						<line number="277" hits="1"/>
+						<line number="278" hits="1"/>
+						<line number="280" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="281" hits="1"/>
+						<line number="282" hits="1"/>
+						<line number="286" hits="1"/>
+						<line number="288" hits="1"/>
+						<line number="289" hits="1"/>
+						<line number="291" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="292" hits="1"/>
+						<line number="293" hits="1"/>
+						<line number="296" hits="1"/>
+						<line number="298" hits="1"/>
+						<line number="299" hits="1"/>
+						<line number="301" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="302" hits="1"/>
+						<line number="303" hits="1"/>
+						<line number="304" hits="1"/>
+						<line number="306" hits="1"/>
+						<line number="307" hits="1"/>
+						<line number="309" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="310" hits="1"/>
+						<line number="311" hits="1"/>
+						<line number="312" hits="1"/>
+						<line number="314" hits="1"/>
+						<line number="335" hits="1"/>
+						<line number="343" hits="1"/>
+						<line number="346" hits="1"/>
+						<line number="347" hits="1"/>
+						<line number="349" hits="1"/>
+						<line number="356" hits="1"/>
+						<line number="358" hits="1"/>
+						<line number="363" hits="1"/>
+						<line number="364" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="365" hits="1"/>
+						<line number="372" hits="1"/>
+						<line number="373" hits="1"/>
+						<line number="375" hits="1"/>
+						<line number="400" hits="1"/>
+						<line number="401" hits="1"/>
+						<line number="404" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="405" hits="1"/>
+						<line number="410" hits="1"/>
+						<line number="413" hits="1"/>
+						<line number="414" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="416"/>
+						<line number="415" hits="1"/>
+						<line number="416" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="417" hits="1"/>
+						<line number="420" hits="1"/>
+						<line number="421" hits="1"/>
+						<line number="422" hits="1"/>
+						<line number="423" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="424"/>
+						<line number="424" hits="0"/>
+						<line number="425" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="426,429"/>
+						<line number="426" hits="0"/>
+						<line number="427" hits="0"/>
+						<line number="429" hits="1"/>
+						<line number="430" hits="1"/>
+						<line number="432" hits="1"/>
+						<line number="434" hits="1"/>
+						<line number="436" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="437" hits="1"/>
+						<line number="445" hits="1"/>
+						<line number="450" hits="1"/>
+						<line number="453" hits="1"/>
+						<line number="455" hits="1"/>
+						<line number="456" hits="1"/>
+						<line number="458" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="466"/>
+						<line number="459" hits="1"/>
+						<line number="464" hits="1"/>
+						<line number="466" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="467" hits="1"/>
+						<line number="472" hits="1"/>
+						<line number="474" hits="1"/>
+						<line number="475" hits="1"/>
+						<line number="480" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="481" hits="1"/>
+						<line number="482" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="483"/>
 						<line number="483" hits="0"/>
-						<line number="485" hits="0"/>
-						<line number="486" hits="0"/>
-						<line number="488" hits="0"/>
-						<line number="490" hits="0"/>
-						<line number="500" hits="0"/>
-						<line number="502" hits="0"/>
-						<line number="503" hits="0"/>
-						<line number="505" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="506,507"/>
-						<line number="506" hits="0"/>
-						<line number="507" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="508,509"/>
-						<line number="508" hits="0"/>
-						<line number="509" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="510,512"/>
-						<line number="510" hits="0"/>
-						<line number="512" hits="0"/>
+						<line number="485" hits="1"/>
+						<line number="494" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="495" hits="1"/>
+						<line number="498" hits="1"/>
+						<line number="499" hits="1"/>
+						<line number="506" hits="1"/>
+						<line number="507" hits="1"/>
+						<line number="511" hits="1"/>
+						<line number="513" hits="1"/>
+						<line number="515" hits="1"/>
+						<line number="518" hits="1"/>
+						<line number="519" hits="1"/>
+						<line number="524" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="525" hits="1"/>
+						<line number="527" hits="1"/>
+						<line number="536" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="537"/>
+						<line number="537" hits="0"/>
+						<line number="538" hits="0"/>
+						<line number="539" hits="0"/>
+						<line number="540" hits="0"/>
+						<line number="541" hits="0"/>
+						<line number="548" hits="0"/>
+						<line number="549" hits="0"/>
+						<line number="551" hits="1"/>
+						<line number="553" hits="0"/>
+						<line number="554" hits="0"/>
+						<line number="555" hits="0"/>
+						<line number="557" hits="1"/>
+						<line number="580" hits="1"/>
+						<line number="581" hits="1"/>
+						<line number="584" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="585" hits="1"/>
+						<line number="586" hits="1"/>
+						<line number="587" hits="1"/>
+						<line number="588" hits="1"/>
+						<line number="591" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="592" hits="1"/>
+						<line number="593" hits="1"/>
+						<line number="595" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="596" hits="1"/>
+						<line number="598" hits="1"/>
+						<line number="599" hits="1"/>
+						<line number="602" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="603" hits="1"/>
+						<line number="605" hits="1"/>
+						<line number="611" hits="1"/>
+						<line number="613" hits="1"/>
+						<line number="615" hits="0"/>
+						<line number="616" hits="0"/>
+						<line number="618" hits="1"/>
+						<line number="620" hits="1"/>
+						<line number="630" hits="1"/>
+						<line number="632" hits="1"/>
+						<line number="633" hits="1"/>
+						<line number="635" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="637"/>
+						<line number="636" hits="1"/>
+						<line number="637" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="639"/>
+						<line number="638" hits="1"/>
+						<line number="639" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="640"/>
+						<line number="640" hits="0"/>
+						<line number="642" hits="1"/>
 					</lines>
 				</class>
-				<class name="reranker.py" filename="orchestrator/rag/reranker.py" complexity="0" line-rate="0" branch-rate="0">
+				<class name="query_processor.py" filename="orchestrator/rag/query_processor.py" complexity="0" line-rate="0.9552" branch-rate="0.8">
 					<methods/>
 					<lines>
-						<line number="9" hits="0"/>
-						<line number="10" hits="0"/>
-						<line number="11" hits="0"/>
-						<line number="13" hits="0"/>
-						<line number="15" hits="0"/>
-						<line number="18" hits="0"/>
-						<line number="28" hits="0"/>
-						<line number="42" hits="0"/>
-						<line number="43" hits="0"/>
-						<line number="44" hits="0"/>
-						<line number="47" hits="0"/>
-						<line number="49" hits="0"/>
-						<line number="55" hits="0"/>
-						<line number="72" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="73,75"/>
+						<line number="7" hits="1"/>
+						<line number="9" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="19" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="28" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="30" hits="1"/>
+						<line number="31" hits="1"/>
+						<line number="32" hits="1"/>
+						<line number="35" hits="1"/>
+						<line number="42" hits="1"/>
+						<line number="47" hits="1"/>
+						<line number="48" hits="1"/>
+						<line number="50" hits="1"/>
+						<line number="56" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="57" hits="1"/>
+						<line number="60" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="61"/>
+						<line number="61" hits="0"/>
+						<line number="66" hits="0"/>
+						<line number="68" hits="1"/>
+						<line number="74" hits="1"/>
+						<line number="75" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="76"/>
+						<line number="76" hits="0"/>
+						<line number="78" hits="1"/>
+						<line number="79" hits="1"/>
+						<line number="80" hits="1"/>
+						<line number="81" hits="1"/>
+						<line number="86" hits="1"/>
+						<line number="88" hits="1"/>
+						<line number="89" hits="1"/>
+						<line number="97" hits="1"/>
+						<line number="98" hits="1"/>
+						<line number="103" hits="1"/>
+						<line number="104" hits="1"/>
+						<line number="105" hits="1"/>
+						<line number="111" hits="1"/>
+						<line number="112" hits="1"/>
+						<line number="117" hits="1"/>
+						<line number="118" hits="1"/>
+						<line number="119" hits="1"/>
+						<line number="126" hits="1"/>
+						<line number="127" hits="1"/>
+						<line number="132" hits="1"/>
+						<line number="133" hits="1"/>
+						<line number="135" hits="1"/>
+						<line number="136" hits="1"/>
+						<line number="137" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="138" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="139" hits="1"/>
+						<line number="140" hits="1"/>
+						<line number="142" hits="1"/>
+						<line number="143" hits="1"/>
+						<line number="150" hits="1"/>
+						<line number="151" hits="1"/>
+						<line number="156" hits="1"/>
+						<line number="157" hits="1"/>
+						<line number="158" hits="1"/>
+					</lines>
+				</class>
+				<class name="query_router.py" filename="orchestrator/rag/query_router.py" complexity="0" line-rate="0.9722" branch-rate="0.8333">
+					<methods/>
+					<lines>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="19" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="28" hits="1"/>
+						<line number="31" hits="1"/>
+						<line number="32" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="35" hits="1"/>
+						<line number="36" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="41" hits="1"/>
+						<line number="48" hits="1"/>
+						<line number="54" hits="1"/>
+						<line number="60" hits="1"/>
+						<line number="63" hits="1"/>
+						<line number="69" hits="1"/>
+						<line number="73" hits="1"/>
+						<line number="74" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="75" hits="1"/>
+						<line number="83" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="84" hits="1"/>
+						<line number="92" hits="1"/>
+						<line number="93" hits="1"/>
+						<line number="94" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="95"/>
+						<line number="95" hits="0"/>
+						<line number="96" hits="1"/>
+						<line number="97" hits="1"/>
+						<line number="99" hits="1"/>
+						<line number="106" hits="1"/>
+						<line number="112" hits="1"/>
+					</lines>
+				</class>
+				<class name="reranker.py" filename="orchestrator/rag/reranker.py" complexity="0" line-rate="0.6486" branch-rate="0.5484">
+					<methods/>
+					<lines>
+						<line number="10" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="14" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="19" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="28" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="44" hits="1"/>
+						<line number="51" hits="1"/>
+						<line number="63" hits="1"/>
+						<line number="64" hits="1"/>
+						<line number="65" hits="1"/>
+						<line number="66" hits="1"/>
+						<line number="67" hits="1"/>
+						<line number="68" hits="1"/>
+						<line number="71" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="72" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="73"/>
 						<line number="73" hits="0"/>
-						<line number="75" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="77,79"/>
-						<line number="77" hits="0"/>
-						<line number="79" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="80,90"/>
-						<line number="80" hits="0"/>
-						<line number="81" hits="0"/>
-						<line number="82" hits="0"/>
-						<line number="83" hits="0"/>
-						<line number="88" hits="0"/>
-						<line number="90" hits="0"/>
-						<line number="92" hits="0"/>
-						<line number="103" hits="0"/>
-						<line number="104" hits="0"/>
-						<line number="106" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="107,110"/>
-						<line number="107" hits="0"/>
-						<line number="110" hits="0"/>
-						<line number="112" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="113,118"/>
-						<line number="113" hits="0"/>
-						<line number="114" hits="0"/>
-						<line number="115" hits="0"/>
-						<line number="118" hits="0"/>
-						<line number="120" hits="0"/>
-						<line number="122" hits="0"/>
-						<line number="123" hits="0"/>
-						<line number="125" hits="0"/>
-						<line number="140" hits="0"/>
-						<line number="150" hits="0"/>
-						<line number="151" hits="0"/>
-						<line number="158" hits="0"/>
-						<line number="159" hits="0"/>
-						<line number="161" hits="0"/>
-						<line number="163" hits="0"/>
-						<line number="164" hits="0"/>
-						<line number="169" hits="0"/>
-						<line number="171" hits="0"/>
-						<line number="185" hits="0"/>
-						<line number="187" hits="0"/>
-						<line number="189" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="191,218"/>
+						<line number="75" hits="1"/>
+						<line number="78" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="79" hits="1"/>
+						<line number="80" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="82" hits="1"/>
+						<line number="84" hits="1"/>
+						<line number="86" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="88"/>
+						<line number="87" hits="1"/>
+						<line number="88" hits="1"/>
+						<line number="91" hits="1"/>
+						<line number="92" hits="1"/>
+						<line number="93" hits="1"/>
+						<line number="94" hits="1"/>
+						<line number="96" hits="1"/>
+						<line number="102" hits="1"/>
+						<line number="121" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="122" hits="1"/>
+						<line number="124" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="126" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="127" hits="1"/>
+						<line number="128" hits="1"/>
+						<line number="131" hits="1"/>
+						<line number="138" hits="1"/>
+						<line number="139" hits="1"/>
+						<line number="141" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="142" hits="1"/>
+						<line number="143" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="144"/>
+						<line number="144" hits="0"/>
+						<line number="146" hits="1"/>
+						<line number="147" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="148" hits="1"/>
+						<line number="150" hits="1"/>
+						<line number="152" hits="1"/>
+						<line number="157" hits="1"/>
+						<line number="159" hits="1"/>
+						<line number="160" hits="1"/>
+						<line number="161" hits="1"/>
+						<line number="166" hits="1"/>
+						<line number="168" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="169" hits="1"/>
+						<line number="176" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="177"/>
+						<line number="177" hits="0"/>
+						<line number="179" hits="1"/>
+						<line number="185" hits="1"/>
+						<line number="187" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="188,190"/>
+						<line number="188" hits="0"/>
+						<line number="190" hits="0"/>
 						<line number="191" hits="0"/>
+						<line number="192" hits="0"/>
+						<line number="193" hits="0"/>
 						<line number="198" hits="0"/>
-						<line number="199" hits="0"/>
-						<line number="200" hits="0"/>
+						<line number="200" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="201,203"/>
+						<line number="201" hits="0"/>
 						<line number="203" hits="0"/>
-						<line number="204" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="205,206"/>
-						<line number="205" hits="0"/>
-						<line number="206" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="207,209"/>
-						<line number="207" hits="0"/>
-						<line number="209" hits="0"/>
+						<line number="205" hits="1"/>
+						<line number="210" hits="0"/>
+						<line number="211" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="212,219"/>
 						<line number="212" hits="0"/>
-						<line number="213" hits="0"/>
-						<line number="215" hits="0"/>
-						<line number="218" hits="0"/>
+						<line number="214" hits="0"/>
+						<line number="215" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="216,217"/>
+						<line number="216" hits="0"/>
+						<line number="217" hits="0"/>
+						<line number="219" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="220,223"/>
 						<line number="220" hits="0"/>
-						<line number="222" hits="0"/>
+						<line number="223" hits="0"/>
 						<line number="224" hits="0"/>
 						<line number="225" hits="0"/>
+						<line number="229" hits="0"/>
+						<line number="231" hits="1"/>
+						<line number="235" hits="1"/>
+						<line number="237" hits="1"/>
+						<line number="240" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="241" hits="1"/>
+						<line number="244" hits="1"/>
+						<line number="245" hits="1"/>
+						<line number="251" hits="1"/>
+						<line number="255" hits="1"/>
+						<line number="256" hits="1"/>
+						<line number="257" hits="1"/>
+						<line number="258" hits="1"/>
+						<line number="260" hits="0"/>
+						<line number="261" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="262,264"/>
+						<line number="262" hits="0"/>
+						<line number="264" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="265,267"/>
+						<line number="265" hits="0"/>
+						<line number="267" hits="0"/>
+						<line number="269" hits="0"/>
+						<line number="277" hits="0"/>
+						<line number="278" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="279,283"/>
+						<line number="279" hits="0"/>
+						<line number="280" hits="0"/>
+						<line number="281" hits="0"/>
+						<line number="283" hits="0"/>
+						<line number="289" hits="1"/>
+						<line number="293" hits="0"/>
+						<line number="294" hits="0"/>
+						<line number="295" hits="0"/>
+						<line number="296" hits="0"/>
+						<line number="298" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="299,301"/>
+						<line number="299" hits="0"/>
+						<line number="301" hits="0"/>
+						<line number="302" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="303,307"/>
+						<line number="303" hits="0"/>
+						<line number="304" hits="0"/>
+						<line number="305" hits="0"/>
+						<line number="307" hits="0"/>
+						<line number="308" hits="0"/>
+						<line number="310" hits="1"/>
+						<line number="312" hits="0"/>
+						<line number="319" hits="0"/>
+						<line number="320" hits="0"/>
+						<line number="326" hits="0"/>
+						<line number="327" hits="0"/>
+						<line number="328" hits="0"/>
+						<line number="329" hits="0"/>
+						<line number="330" hits="0"/>
+						<line number="331" hits="0"/>
+						<line number="337" hits="1"/>
+						<line number="341" hits="1"/>
+						<line number="343" hits="1"/>
+						<line number="344" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="345" hits="1"/>
+						<line number="351" hits="1"/>
+						<line number="352" hits="1"/>
+						<line number="353" hits="1"/>
+						<line number="355" hits="1"/>
+						<line number="356" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="357"/>
+						<line number="357" hits="0"/>
+						<line number="358" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="361"/>
+						<line number="359" hits="1"/>
+						<line number="361" hits="0"/>
+						<line number="363" hits="1"/>
+						<line number="364" hits="1"/>
+						<line number="365" hits="1"/>
+						<line number="367" hits="1"/>
+						<line number="368" hits="1"/>
+						<line number="374" hits="1"/>
+						<line number="386" hits="1"/>
+						<line number="387" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="388" hits="1"/>
+						<line number="389" hits="1"/>
+						<line number="391" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="393"/>
+						<line number="393" hits="0"/>
+						<line number="394" hits="0"/>
+						<line number="396" hits="1"/>
+						<line number="397" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="398" hits="1"/>
+						<line number="400" hits="1"/>
+						<line number="406" hits="1"/>
+						<line number="412" hits="1"/>
+						<line number="414" hits="1"/>
+						<line number="416" hits="1"/>
+						<line number="418" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="422"/>
+						<line number="419" hits="1"/>
+						<line number="420" hits="1"/>
+						<line number="422" hits="1"/>
+						<line number="423" hits="1"/>
+						<line number="424" hits="1"/>
+						<line number="426" hits="1"/>
 					</lines>
 				</class>
-				<class name="vector_retriever.py" filename="orchestrator/rag/vector_retriever.py" complexity="0" line-rate="0" branch-rate="0">
+				<class name="scope_engine.py" filename="orchestrator/rag/scope_engine.py" complexity="0" line-rate="0.9439" branch-rate="0.8947">
 					<methods/>
 					<lines>
-						<line number="9" hits="0"/>
-						<line number="10" hits="0"/>
-						<line number="11" hits="0"/>
-						<line number="12" hits="0"/>
-						<line number="13" hits="0"/>
-						<line number="15" hits="0"/>
-						<line number="17" hits="0"/>
-						<line number="20" hits="0"/>
-						<line number="21" hits="0"/>
-						<line number="23" hits="0"/>
-						<line number="24" hits="0"/>
-						<line number="25" hits="0"/>
-						<line number="28" hits="0"/>
-						<line number="40" hits="0"/>
-						<line number="42" hits="0"/>
-						<line number="56" hits="0"/>
-						<line number="57" hits="0"/>
-						<line number="58" hits="0"/>
-						<line number="61" hits="0"/>
-						<line number="64" hits="0"/>
-						<line number="67" hits="0"/>
-						<line number="69" hits="0"/>
-						<line number="75" hits="0"/>
-						<line number="86" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="87,91"/>
-						<line number="87" hits="0"/>
-						<line number="88" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="89,91"/>
-						<line number="89" hits="0"/>
-						<line number="91" hits="0"/>
-						<line number="93" hits="0"/>
-						<line number="94" hits="0"/>
-						<line number="95" hits="0"/>
-						<line number="100" hits="0"/>
-						<line number="103" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="104,106"/>
-						<line number="104" hits="0"/>
-						<line number="106" hits="0"/>
-						<line number="108" hits="0"/>
-						<line number="110" hits="0"/>
-						<line number="112" hits="0"/>
-						<line number="113" hits="0"/>
-						<line number="115" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="116,118"/>
-						<line number="116" hits="0"/>
-						<line number="118" hits="0"/>
+						<line number="18" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="34" hits="1"/>
+						<line number="37" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="39" hits="1"/>
+						<line number="40" hits="1"/>
+						<line number="43" hits="1"/>
+						<line number="68" hits="1"/>
+						<line number="71" hits="1"/>
+						<line number="75" hits="1"/>
+						<line number="81" hits="1"/>
+						<line number="82" hits="1"/>
+						<line number="84" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="85" hits="1"/>
+						<line number="87" hits="1"/>
+						<line number="94" hits="1"/>
+						<line number="97" hits="1"/>
+						<line number="130" hits="1"/>
+						<line number="134" hits="1"/>
+						<line number="135" hits="1"/>
+						<line number="137" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="138" hits="1"/>
+						<line number="139" hits="1"/>
+						<line number="142" hits="1"/>
+						<line number="145" hits="1"/>
+						<line number="150" hits="1"/>
+						<line number="151" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="152" hits="1"/>
+						<line number="153" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="154" hits="1"/>
+						<line number="156" hits="1"/>
+						<line number="162" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="151"/>
+						<line number="163" hits="1"/>
+						<line number="166" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="167" hits="1"/>
+						<line number="168" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="169" hits="1"/>
+						<line number="172" hits="1"/>
+						<line number="175" hits="1"/>
+						<line number="183" hits="1"/>
+						<line number="191" hits="1"/>
+						<line number="198" hits="1"/>
+						<line number="201" hits="1"/>
+						<line number="232" hits="1"/>
+						<line number="235" hits="1"/>
+						<line number="239" hits="1"/>
+						<line number="240" hits="1"/>
+						<line number="242" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="243" hits="1"/>
+						<line number="244" hits="1"/>
+						<line number="246" hits="1"/>
+						<line number="248" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="249"/>
+						<line number="249" hits="0"/>
+						<line number="251" hits="1"/>
+						<line number="254" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="255" hits="1"/>
+						<line number="256" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="257" hits="1"/>
+						<line number="260" hits="1"/>
+						<line number="261" hits="1"/>
+						<line number="262" hits="1"/>
+						<line number="268" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="269" hits="1"/>
+						<line number="270" hits="1"/>
+						<line number="274" hits="1"/>
+						<line number="275" hits="0"/>
+						<line number="276" hits="0"/>
+						<line number="282" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="283" hits="1"/>
+						<line number="284" hits="1"/>
+						<line number="285" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="304"/>
+						<line number="286" hits="1"/>
+						<line number="287" hits="1"/>
+						<line number="288" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="289" hits="1"/>
+						<line number="290" hits="1"/>
+						<line number="291" hits="1"/>
+						<line number="296" hits="1"/>
+						<line number="297" hits="1"/>
+						<line number="298" hits="0"/>
+						<line number="299" hits="0"/>
+						<line number="304" hits="1"/>
+						<line number="311" hits="1"/>
+						<line number="314" hits="1"/>
+						<line number="334" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="335"/>
+						<line number="335" hits="0"/>
+						<line number="337" hits="1"/>
+						<line number="338" hits="1"/>
+						<line number="340" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="341" hits="1"/>
+						<line number="343" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="344" hits="1"/>
+						<line number="351" hits="1"/>
+						<line number="354" hits="1"/>
+						<line number="382" hits="1"/>
+						<line number="384" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="385" hits="1"/>
+						<line number="389" hits="1"/>
+						<line number="391" hits="1"/>
+						<line number="401" hits="1"/>
+						<line number="407" hits="1"/>
+					</lines>
+				</class>
+				<class name="vector_retriever.py" filename="orchestrator/rag/vector_retriever.py" complexity="0" line-rate="0.886" branch-rate="0.5952">
+					<methods/>
+					<lines>
+						<line number="9" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="21" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="25" hits="1"/>
+						<line number="28" hits="1"/>
+						<line number="40" hits="1"/>
+						<line number="42" hits="1"/>
+						<line number="56" hits="1"/>
+						<line number="57" hits="1"/>
+						<line number="58" hits="1"/>
+						<line number="61" hits="1"/>
+						<line number="64" hits="1"/>
+						<line number="67" hits="1"/>
+						<line number="69" hits="1"/>
+						<line number="75" hits="1"/>
+						<line number="86" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="91"/>
+						<line number="87" hits="1"/>
+						<line number="88" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="89" hits="1"/>
+						<line number="91" hits="1"/>
+						<line number="93" hits="1"/>
+						<line number="94" hits="1"/>
+						<line number="95" hits="1"/>
+						<line number="100" hits="1"/>
+						<line number="103" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="106"/>
+						<line number="104" hits="1"/>
+						<line number="106" hits="1"/>
+						<line number="108" hits="1"/>
+						<line number="110" hits="1"/>
+						<line number="112" hits="1"/>
+						<line number="113" hits="1"/>
+						<line number="115" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="116" hits="1"/>
+						<line number="118" hits="1"/>
 						<line number="123" hits="0"/>
-						<line number="125" hits="0"/>
+						<line number="125" hits="1"/>
 						<line number="126" hits="0"/>
-						<line number="127" hits="0"/>
-						<line number="128" hits="0"/>
-						<line number="130" hits="0"/>
-						<line number="138" hits="0"/>
-						<line number="139" hits="0"/>
-						<line number="142" hits="0"/>
-						<line number="144" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="146,153"/>
-						<line number="146" hits="0"/>
-						<line number="147" hits="0"/>
-						<line number="150" hits="0"/>
-						<line number="153" hits="0"/>
-						<line number="154" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="155,157"/>
-						<line number="155" hits="0"/>
-						<line number="157" hits="0"/>
-						<line number="159" hits="0"/>
-						<line number="174" hits="0"/>
-						<line number="175" hits="0"/>
-						<line number="176" hits="0"/>
-						<line number="178" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="179,181"/>
+						<line number="127" hits="1"/>
+						<line number="128" hits="1"/>
+						<line number="130" hits="1"/>
+						<line number="138" hits="1"/>
+						<line number="139" hits="1"/>
+						<line number="142" hits="1"/>
+						<line number="144" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="146" hits="1"/>
+						<line number="147" hits="1"/>
+						<line number="150" hits="1"/>
+						<line number="153" hits="1"/>
+						<line number="154" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="157"/>
+						<line number="155" hits="1"/>
+						<line number="157" hits="1"/>
+						<line number="159" hits="1"/>
+						<line number="174" hits="1"/>
+						<line number="175" hits="1"/>
+						<line number="176" hits="1"/>
+						<line number="178" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="179"/>
 						<line number="179" hits="0"/>
-						<line number="181" hits="0"/>
-						<line number="183" hits="0"/>
-						<line number="190" hits="0"/>
-						<line number="191" hits="0"/>
-						<line number="194" hits="0"/>
-						<line number="197" hits="0"/>
-						<line number="204" hits="0"/>
-						<line number="206" hits="0"/>
-						<line number="223" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="224,227"/>
+						<line number="181" hits="1"/>
+						<line number="183" hits="1"/>
+						<line number="190" hits="1"/>
+						<line number="191" hits="1"/>
+						<line number="194" hits="1"/>
+						<line number="197" hits="1"/>
+						<line number="204" hits="1"/>
+						<line number="206" hits="1"/>
+						<line number="223" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="224"/>
 						<line number="224" hits="0"/>
-						<line number="227" hits="0"/>
-						<line number="230" hits="0"/>
-						<line number="232" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="233,244"/>
-						<line number="233" hits="0"/>
-						<line number="238" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="232,240"/>
-						<line number="240" hits="0"/>
-						<line number="241" hits="0"/>
-						<line number="244" hits="0"/>
-						<line number="247" hits="0"/>
-						<line number="249" hits="0"/>
-						<line number="251" hits="0"/>
-						<line number="252" hits="0"/>
-						<line number="253" hits="0"/>
-						<line number="255" hits="0"/>
+						<line number="227" hits="1"/>
+						<line number="230" hits="1"/>
+						<line number="232" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="234" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="235" hits="1"/>
+						<line number="237" hits="1"/>
+						<line number="242" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="232"/>
+						<line number="244" hits="1"/>
+						<line number="245" hits="1"/>
+						<line number="248" hits="1"/>
+						<line number="251" hits="1"/>
+						<line number="253" hits="1"/>
+						<line number="254" hits="1"/>
+						<line number="256" hits="1"/>
+						<line number="258" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="262"/>
+						<line number="259" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="260" hits="1"/>
+						<line number="262" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="263" hits="1"/>
+						<line number="264" hits="1"/>
+						<line number="265" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="266" hits="1"/>
+						<line number="268" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="269"/>
+						<line number="269" hits="0"/>
+						<line number="270" hits="0"/>
+						<line number="271" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="272,274"/>
+						<line number="272" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="273,277"/>
+						<line number="273" hits="0"/>
+						<line number="274" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="275,277"/>
+						<line number="275" hits="0"/>
+						<line number="277" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="278"/>
+						<line number="278" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="279,281"/>
+						<line number="279" hits="0"/>
+						<line number="281" hits="1"/>
+						<line number="283" hits="1"/>
+						<line number="285" hits="1"/>
+						<line number="286" hits="1"/>
+						<line number="287" hits="1"/>
+						<line number="289" hits="1"/>
 					</lines>
 				</class>
 			</classes>
@@ -28110,7 +32434,7 @@
 				</class>
 			</classes>
 		</package>
-		<package name="services" line-rate="0.2047" branch-rate="0.008854" complexity="0">
+		<package name="services" line-rate="0.1881" branch-rate="0.001484" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="services/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
@@ -28253,7 +32577,7 @@
 						<line number="426" hits="0"/>
 					</lines>
 				</class>
-				<class name="approval_db_service.py" filename="services/approval_db_service.py" complexity="0" line-rate="0.1761" branch-rate="0">
+				<class name="approval_db_service.py" filename="services/approval_db_service.py" complexity="0" line-rate="0.1571" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="9" hits="1"/>
@@ -28262,159 +32586,210 @@
 						<line number="12" hits="1"/>
 						<line number="13" hits="1"/>
 						<line number="14" hits="1"/>
+						<line number="15" hits="1"/>
 						<line number="16" hits="1"/>
-						<line number="23" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="24" hits="1"/>
 						<line number="26" hits="1"/>
-						<line number="35" hits="1"/>
-						<line number="42" hits="0"/>
-						<line number="43" hits="0"/>
-						<line number="45" hits="1"/>
-						<line number="87" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="88,90"/>
-						<line number="88" hits="0"/>
-						<line number="90" hits="0"/>
+						<line number="29" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="48" hits="1"/>
+						<line number="90" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="91,93"/>
+						<line number="91" hits="0"/>
 						<line number="93" hits="0"/>
-						<line number="115" hits="0"/>
-						<line number="116" hits="0"/>
-						<line number="117" hits="0"/>
+						<line number="96" hits="0"/>
+						<line number="118" hits="0"/>
 						<line number="119" hits="0"/>
-						<line number="128" hits="0"/>
-						<line number="130" hits="1"/>
-						<line number="141" hits="0"/>
-						<line number="142" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="143,144"/>
-						<line number="143" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="122" hits="0"/>
+						<line number="131" hits="0"/>
+						<line number="133" hits="1"/>
 						<line number="144" hits="0"/>
-						<line number="145" hits="0"/>
-						<line number="147" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="149,164"/>
-						<line number="149" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="154,164"/>
-						<line number="154" hits="0"/>
-						<line number="155" hits="0"/>
-						<line number="156" hits="0"/>
+						<line number="145" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="146,147"/>
+						<line number="146" hits="0"/>
+						<line number="147" hits="0"/>
+						<line number="148" hits="0"/>
+						<line number="150" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="152,167"/>
+						<line number="152" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="157,167"/>
+						<line number="157" hits="0"/>
 						<line number="158" hits="0"/>
-						<line number="164" hits="0"/>
-						<line number="166" hits="1"/>
-						<line number="183" hits="0"/>
-						<line number="191" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="192,194"/>
-						<line number="192" hits="0"/>
-						<line number="194" hits="0"/>
+						<line number="159" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="167" hits="0"/>
+						<line number="169" hits="1"/>
+						<line number="186" hits="0"/>
+						<line number="194" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="195,197"/>
 						<line number="195" hits="0"/>
 						<line number="197" hits="0"/>
-						<line number="199" hits="1"/>
-						<line number="220" hits="0"/>
-						<line number="227" hits="0"/>
-						<line number="228" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="229,230"/>
-						<line number="229" hits="0"/>
-						<line number="230" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="231,232"/>
-						<line number="231" hits="0"/>
-						<line number="232" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="233,235"/>
-						<line number="233" hits="0"/>
+						<line number="198" hits="0"/>
+						<line number="200" hits="0"/>
+						<line number="202" hits="1"/>
+						<line number="223" hits="0"/>
+						<line number="230" hits="0"/>
+						<line number="231" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="232,233"/>
+						<line number="232" hits="0"/>
+						<line number="233" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="234,235"/>
+						<line number="234" hits="0"/>
 						<line number="235" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="236,238"/>
 						<line number="236" hits="0"/>
-						<line number="238" hits="0"/>
+						<line number="238" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="239,241"/>
 						<line number="239" hits="0"/>
 						<line number="241" hits="0"/>
-						<line number="243" hits="1"/>
-						<line number="268" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="269,271"/>
-						<line number="269" hits="0"/>
-						<line number="271" hits="0"/>
-						<line number="272" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="273,275"/>
-						<line number="273" hits="0"/>
-						<line number="275" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="276,281"/>
-						<line number="276" hits="0"/>
-						<line number="281" hits="0"/>
-						<line number="282" hits="0"/>
-						<line number="290" hits="0"/>
-						<line number="293" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="295,297"/>
+						<line number="242" hits="0"/>
+						<line number="244" hits="0"/>
+						<line number="246" hits="1"/>
+						<line number="274" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="275,290"/>
+						<line number="275" hits="0"/>
+						<line number="279" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="280,290"/>
+						<line number="280" hits="0"/>
+						<line number="285" hits="0"/>
+						<line number="290" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="291,293"/>
+						<line number="291" hits="0"/>
+						<line number="293" hits="0"/>
+						<line number="294" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="295,297"/>
 						<line number="295" hits="0"/>
-						<line number="296" hits="0"/>
-						<line number="297" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="299,306"/>
-						<line number="299" hits="0"/>
-						<line number="302" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="303,306"/>
+						<line number="297" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="298,303"/>
+						<line number="298" hits="0"/>
 						<line number="303" hits="0"/>
 						<line number="304" hits="0"/>
-						<line number="306" hits="0"/>
-						<line number="307" hits="0"/>
-						<line number="309" hits="0"/>
+						<line number="312" hits="0"/>
+						<line number="315" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="317,319"/>
+						<line number="317" hits="0"/>
 						<line number="318" hits="0"/>
-						<line number="320" hits="1"/>
-						<line number="333" hits="0"/>
-						<line number="335" hits="0"/>
-						<line number="348" hits="0"/>
-						<line number="349" hits="0"/>
-						<line number="351" hits="0"/>
-						<line number="352" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="353,357"/>
-						<line number="353" hits="0"/>
-						<line number="354" hits="0"/>
+						<line number="319" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="321,328"/>
+						<line number="321" hits="0"/>
+						<line number="324" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="325,328"/>
+						<line number="325" hits="0"/>
+						<line number="326" hits="0"/>
+						<line number="328" hits="0"/>
+						<line number="329" hits="0"/>
+						<line number="331" hits="0"/>
+						<line number="340" hits="0"/>
+						<line number="342" hits="1"/>
 						<line number="355" hits="0"/>
-						<line number="357" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="358,365"/>
-						<line number="358" hits="0"/>
-						<line number="359" hits="0"/>
-						<line number="365" hits="0"/>
-						<line number="367" hits="1"/>
-						<line number="388" hits="0"/>
-						<line number="390" hits="0"/>
-						<line number="392" hits="0"/>
-						<line number="393" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="394,395"/>
-						<line number="394" hits="0"/>
-						<line number="395" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="396,397"/>
-						<line number="396" hits="0"/>
-						<line number="397" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="398,399"/>
-						<line number="398" hits="0"/>
-						<line number="399" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="400,402"/>
-						<line number="400" hits="0"/>
-						<line number="402" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="403,405"/>
-						<line number="403" hits="0"/>
-						<line number="405" hits="0"/>
-						<line number="406" hits="0"/>
-						<line number="407" hits="0"/>
-						<line number="409" hits="1"/>
-						<line number="431" hits="0"/>
-						<line number="437" hits="1"/>
-						<line number="456" hits="0"/>
-						<line number="457" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="458,459"/>
-						<line number="458" hits="0"/>
-						<line number="459" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="460,464"/>
-						<line number="460" hits="0"/>
-						<line number="464" hits="0"/>
-						<line number="466" hits="1"/>
-						<line number="487" hits="0"/>
-						<line number="488" hits="0"/>
-						<line number="495" hits="0"/>
-						<line number="496" hits="0"/>
-						<line number="497" hits="0"/>
-						<line number="502" hits="0"/>
-						<line number="504" hits="1"/>
-						<line number="517" hits="0"/>
-						<line number="522" hits="0"/>
-						<line number="523" hits="0"/>
-						<line number="524" hits="0"/>
-						<line number="526" hits="1"/>
-						<line number="545" hits="0"/>
-						<line number="546" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="547,549"/>
-						<line number="547" hits="0"/>
-						<line number="549" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="550,557"/>
-						<line number="550" hits="0"/>
+						<line number="357" hits="0"/>
+						<line number="370" hits="0"/>
+						<line number="371" hits="0"/>
+						<line number="373" hits="0"/>
+						<line number="374" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="375,379"/>
+						<line number="375" hits="0"/>
+						<line number="376" hits="0"/>
+						<line number="377" hits="0"/>
+						<line number="379" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="380,387"/>
+						<line number="380" hits="0"/>
+						<line number="381" hits="0"/>
+						<line number="387" hits="0"/>
+						<line number="389" hits="1"/>
+						<line number="410" hits="0"/>
+						<line number="412" hits="0"/>
+						<line number="414" hits="0"/>
+						<line number="415" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="416,417"/>
+						<line number="416" hits="0"/>
+						<line number="417" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="418,419"/>
+						<line number="418" hits="0"/>
+						<line number="419" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="420,421"/>
+						<line number="420" hits="0"/>
+						<line number="421" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="422,424"/>
+						<line number="422" hits="0"/>
+						<line number="424" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="425,427"/>
+						<line number="425" hits="0"/>
+						<line number="427" hits="0"/>
+						<line number="428" hits="0"/>
+						<line number="429" hits="0"/>
+						<line number="431" hits="1"/>
+						<line number="457" hits="0"/>
+						<line number="469" hits="0"/>
+						<line number="482" hits="0"/>
+						<line number="491" hits="0"/>
+						<line number="493" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="494,503"/>
+						<line number="494" hits="0"/>
+						<line number="500" hits="0"/>
+						<line number="503" hits="0"/>
+						<line number="504" hits="0"/>
+						<line number="509" hits="0"/>
+						<line number="510" hits="0"/>
+						<line number="512" hits="0"/>
+						<line number="519" hits="0"/>
+						<line number="521" hits="1"/>
+						<line number="536" hits="0"/>
+						<line number="542" hits="0"/>
+						<line number="543" hits="0"/>
+						<line number="545" hits="1"/>
 						<line number="555" hits="0"/>
+						<line number="556" hits="0"/>
 						<line number="557" hits="0"/>
-						<line number="558" hits="0"/>
+						<line number="558" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="559,560"/>
+						<line number="559" hits="0"/>
 						<line number="560" hits="0"/>
-						<line number="562" hits="0"/>
-						<line number="569" hits="0"/>
-						<line number="575" hits="1"/>
-						<line number="580" hits="0"/>
-						<line number="583" hits="1"/>
-						<line number="594" hits="0"/>
-						<line number="595" hits="0"/>
-						<line number="597" hits="1"/>
+						<line number="562" hits="1"/>
+						<line number="583" hits="0"/>
+						<line number="584" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="585,591"/>
+						<line number="585" hits="0"/>
+						<line number="590" hits="0"/>
+						<line number="591" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="592,601"/>
+						<line number="592" hits="0"/>
+						<line number="598" hits="0"/>
+						<line number="601" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="602,610"/>
 						<line number="602" hits="0"/>
-						<line number="603" hits="0"/>
-						<line number="605" hits="1"/>
-						<line number="610" hits="0"/>
-						<line number="613" hits="1"/>
-						<line number="618" hits="0"/>
-						<line number="619" hits="0"/>
-						<line number="621" hits="1"/>
-						<line number="626" hits="0"/>
-						<line number="627" hits="0"/>
+						<line number="607" hits="0"/>
+						<line number="610" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="611,619"/>
+						<line number="611" hits="0"/>
+						<line number="616" hits="0"/>
+						<line number="619" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="620,628"/>
+						<line number="620" hits="0"/>
+						<line number="625" hits="0"/>
+						<line number="628" hits="0"/>
+						<line number="629" hits="0"/>
+						<line number="631" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="633,645"/>
+						<line number="633" hits="0"/>
+						<line number="634" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="635,645"/>
+						<line number="635" hits="0"/>
+						<line number="641" hits="0"/>
+						<line number="645" hits="0"/>
+						<line number="647" hits="1"/>
+						<line number="672" hits="0"/>
+						<line number="673" hits="0"/>
+						<line number="680" hits="0"/>
+						<line number="681" hits="0"/>
+						<line number="683" hits="0"/>
+						<line number="684" hits="0"/>
+						<line number="685" hits="0"/>
+						<line number="690" hits="0"/>
+						<line number="692" hits="1"/>
+						<line number="705" hits="0"/>
+						<line number="710" hits="0"/>
+						<line number="711" hits="0"/>
+						<line number="712" hits="0"/>
+						<line number="714" hits="1"/>
+						<line number="733" hits="0"/>
+						<line number="734" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="735,737"/>
+						<line number="735" hits="0"/>
+						<line number="737" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="738,745"/>
+						<line number="738" hits="0"/>
+						<line number="743" hits="0"/>
+						<line number="745" hits="0"/>
+						<line number="746" hits="0"/>
+						<line number="748" hits="0"/>
+						<line number="750" hits="0"/>
+						<line number="757" hits="0"/>
+						<line number="763" hits="1"/>
+						<line number="768" hits="0"/>
+						<line number="771" hits="1"/>
+						<line number="782" hits="0"/>
+						<line number="783" hits="0"/>
+						<line number="785" hits="1"/>
+						<line number="790" hits="0"/>
+						<line number="791" hits="0"/>
+						<line number="793" hits="1"/>
+						<line number="798" hits="0"/>
+						<line number="801" hits="1"/>
+						<line number="806" hits="0"/>
+						<line number="807" hits="0"/>
+						<line number="809" hits="1"/>
+						<line number="814" hits="0"/>
+						<line number="815" hits="0"/>
 					</lines>
 				</class>
 				<class name="asset_service.py" filename="services/asset_service.py" complexity="0" line-rate="0.4333" branch-rate="0">
@@ -28685,7 +33060,7 @@
 						<line number="176" hits="0"/>
 					</lines>
 				</class>
-				<class name="cloud_task_events.py" filename="services/cloud_task_events.py" complexity="0" line-rate="0.82" branch-rate="0.6">
+				<class name="cloud_task_events.py" filename="services/cloud_task_events.py" complexity="0" line-rate="0.3" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="8" hits="1"/>
@@ -28700,47 +33075,47 @@
 						<line number="22" hits="1"/>
 						<line number="23" hits="1"/>
 						<line number="26" hits="1"/>
-						<line number="27" hits="1"/>
-						<line number="28" hits="1"/>
+						<line number="27" hits="0"/>
+						<line number="28" hits="0"/>
 						<line number="29" hits="0"/>
 						<line number="30" hits="0"/>
 						<line number="33" hits="1"/>
-						<line number="34" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="35"/>
+						<line number="34" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="35,36"/>
 						<line number="35" hits="0"/>
-						<line number="36" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="40"/>
-						<line number="37" hits="1"/>
-						<line number="38" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="36"/>
-						<line number="39" hits="1"/>
+						<line number="36" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="37,40"/>
+						<line number="37" hits="0"/>
+						<line number="38" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="36,39"/>
+						<line number="39" hits="0"/>
 						<line number="40" hits="0"/>
 						<line number="43" hits="1"/>
-						<line number="46" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="47" hits="1"/>
-						<line number="49" hits="1"/>
-						<line number="50" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="51"/>
+						<line number="46" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="47,49"/>
+						<line number="47" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="51,53"/>
 						<line number="51" hits="0"/>
-						<line number="53" hits="1"/>
-						<line number="54" hits="1"/>
-						<line number="55" hits="1"/>
-						<line number="63" hits="1"/>
-						<line number="71" hits="1"/>
-						<line number="73" hits="1"/>
-						<line number="74" hits="1"/>
+						<line number="53" hits="0"/>
+						<line number="54" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="71" hits="0"/>
+						<line number="73" hits="0"/>
+						<line number="74" hits="0"/>
 						<line number="75" hits="0"/>
 						<line number="76" hits="0"/>
 						<line number="79" hits="1"/>
-						<line number="90" hits="1"/>
-						<line number="91" hits="1"/>
-						<line number="92" hits="1"/>
-						<line number="93" hits="1"/>
-						<line number="95" hits="1"/>
-						<line number="96" hits="1"/>
-						<line number="97" hits="1"/>
-						<line number="125" hits="1"/>
+						<line number="90" hits="0"/>
+						<line number="91" hits="0"/>
+						<line number="92" hits="0"/>
+						<line number="93" hits="0"/>
+						<line number="95" hits="0"/>
+						<line number="96" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="125" hits="0"/>
 						<line number="126" hits="0"/>
 						<line number="127" hits="0"/>
 					</lines>
 				</class>
-				<class name="cloud_tasks.py" filename="services/cloud_tasks.py" complexity="0" line-rate="0.871" branch-rate="0.75">
+				<class name="cloud_tasks.py" filename="services/cloud_tasks.py" complexity="0" line-rate="0.3226" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="6" hits="1"/>
@@ -28757,26 +33132,26 @@
 						<line number="33" hits="0"/>
 						<line number="34" hits="0"/>
 						<line number="37" hits="1"/>
-						<line number="59" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="60" hits="1"/>
-						<line number="62" hits="1"/>
-						<line number="63" hits="1"/>
-						<line number="64" hits="1"/>
-						<line number="65" hits="1"/>
-						<line number="67" hits="1"/>
-						<line number="68" hits="1"/>
-						<line number="70" hits="1"/>
-						<line number="83" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="84" hits="1"/>
-						<line number="86" hits="1" branch="true" condition-coverage="100% (2/2)"/>
-						<line number="87" hits="1"/>
-						<line number="88" hits="1"/>
-						<line number="92" hits="1"/>
-						<line number="96" hits="1"/>
-						<line number="104" hits="1"/>
+						<line number="59" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="60,62"/>
+						<line number="60" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="65" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="68" hits="0"/>
+						<line number="70" hits="0"/>
+						<line number="83" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="84,86"/>
+						<line number="84" hits="0"/>
+						<line number="86" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="87,92"/>
+						<line number="87" hits="0"/>
+						<line number="88" hits="0"/>
+						<line number="92" hits="0"/>
+						<line number="96" hits="0"/>
+						<line number="104" hits="0"/>
 					</lines>
 				</class>
-				<class name="credit_billing_client.py" filename="services/credit_billing_client.py" complexity="0" line-rate="0.1875" branch-rate="0">
+				<class name="credit_billing_client.py" filename="services/credit_billing_client.py" complexity="0" line-rate="0.1765" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="8" hits="1"/>
@@ -28785,32 +33160,34 @@
 						<line number="13" hits="1"/>
 						<line number="15" hits="1"/>
 						<line number="18" hits="1"/>
-						<line number="31" hits="0"/>
 						<line number="32" hits="0"/>
-						<line number="34" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="35,41"/>
-						<line number="35" hits="0"/>
-						<line number="39" hits="0"/>
-						<line number="41" hits="0"/>
-						<line number="45" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="46,47"/>
-						<line number="46" hits="0"/>
-						<line number="47" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="48,49"/>
-						<line number="48" hits="0"/>
-						<line number="49" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="50,51"/>
-						<line number="50" hits="0"/>
-						<line number="51" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="52,54"/>
-						<line number="52" hits="0"/>
-						<line number="54" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="35" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="36,42"/>
+						<line number="36" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="42" hits="0"/>
+						<line number="46" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="47,48"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="49,50"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="51,52"/>
+						<line number="51" hits="0"/>
+						<line number="52" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="53,54"/>
+						<line number="53" hits="0"/>
+						<line number="54" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="55,57"/>
 						<line number="55" hits="0"/>
-						<line number="56" hits="0"/>
-						<line number="62" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="63,74"/>
-						<line number="63" hits="0"/>
-						<line number="64" hits="0"/>
-						<line number="72" hits="0"/>
-						<line number="74" hits="0"/>
-						<line number="83" hits="0"/>
-						<line number="85" hits="0"/>
+						<line number="57" hits="0"/>
+						<line number="58" hits="0"/>
+						<line number="59" hits="0"/>
+						<line number="65" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="66,77"/>
+						<line number="66" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="77" hits="0"/>
 						<line number="86" hits="0"/>
-						<line number="90" hits="0"/>
+						<line number="88" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="93" hits="0"/>
 					</lines>
 				</class>
 				<class name="credit_service.py" filename="services/credit_service.py" complexity="0" line-rate="0.1897" branch-rate="0">
@@ -30017,18 +34394,18 @@
 						<line number="76" hits="0"/>
 					</lines>
 				</class>
-				<class name="google_drive_sync_service.py" filename="services/google_drive_sync_service.py" complexity="0" line-rate="0.1481" branch-rate="0">
+				<class name="google_drive_sync_service.py" filename="services/google_drive_sync_service.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="3" hits="1"/>
-						<line number="4" hits="1"/>
-						<line number="5" hits="1"/>
-						<line number="6" hits="1"/>
-						<line number="7" hits="1"/>
-						<line number="9" hits="1"/>
-						<line number="12" hits="1"/>
-						<line number="31" hits="1"/>
-						<line number="34" hits="1"/>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="5" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="7" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="34" hits="0"/>
 						<line number="44" hits="0"/>
 						<line number="47" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="48,51"/>
 						<line number="48" hits="0"/>
@@ -30069,7 +34446,7 @@
 						<line number="97" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="98,100"/>
 						<line number="98" hits="0"/>
 						<line number="100" hits="0"/>
-						<line number="103" hits="1"/>
+						<line number="103" hits="0"/>
 						<line number="105" hits="0"/>
 						<line number="106" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="107,108"/>
 						<line number="107" hits="0"/>
@@ -30078,7 +34455,7 @@
 						<line number="110" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="111,115"/>
 						<line number="111" hits="0"/>
 						<line number="115" hits="0"/>
-						<line number="118" hits="1"/>
+						<line number="118" hits="0"/>
 						<line number="124" hits="0"/>
 						<line number="125" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="126,133"/>
 						<line number="126" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="127,129"/>
@@ -30088,7 +34465,7 @@
 						<line number="131" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="130,132"/>
 						<line number="132" hits="0"/>
 						<line number="133" hits="0"/>
-						<line number="136" hits="1"/>
+						<line number="136" hits="0"/>
 						<line number="142" hits="0"/>
 						<line number="143" hits="0"/>
 						<line number="145" hits="0"/>
@@ -31685,7 +36062,7 @@
 						<line number="463" hits="0"/>
 					</lines>
 				</class>
-				<class name="library_indexing_service.py" filename="services/library_indexing_service.py" complexity="0" line-rate="0.1184" branch-rate="0.006849">
+				<class name="library_indexing_service.py" filename="services/library_indexing_service.py" complexity="0" line-rate="0.1116" branch-rate="0.006667">
 					<methods/>
 					<lines>
 						<line number="3" hits="1"/>
@@ -31701,410 +36078,426 @@
 						<line number="16" hits="1"/>
 						<line number="17" hits="1"/>
 						<line number="18" hits="1"/>
-						<line number="23" hits="1"/>
-						<line number="25" hits="1"/>
+						<line number="19" hits="1"/>
+						<line number="24" hits="1"/>
 						<line number="26" hits="1"/>
 						<line number="27" hits="1"/>
 						<line number="28" hits="1"/>
 						<line number="29" hits="1"/>
 						<line number="30" hits="1"/>
 						<line number="31" hits="1"/>
-						<line number="45" hits="1"/>
-						<line number="48" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="exit"/>
-						<line number="58" hits="1"/>
-						<line number="59" hits="0"/>
+						<line number="32" hits="1"/>
+						<line number="46" hits="1"/>
+						<line number="49" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="exit"/>
+						<line number="59" hits="1"/>
 						<line number="60" hits="0"/>
 						<line number="61" hits="0"/>
 						<line number="62" hits="0"/>
 						<line number="63" hits="0"/>
-						<line number="66" hits="1"/>
-						<line number="67" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="68,69"/>
-						<line number="68" hits="0"/>
-						<line number="69" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="70,71"/>
-						<line number="70" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="67" hits="1"/>
+						<line number="68" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="69,70"/>
+						<line number="69" hits="0"/>
+						<line number="70" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="71,72"/>
 						<line number="71" hits="0"/>
-						<line number="74" hits="1"/>
-						<line number="75" hits="0"/>
-						<line number="78" hits="1"/>
-						<line number="79" hits="0"/>
-						<line number="82" hits="1"/>
-						<line number="89" hits="0"/>
-						<line number="92" hits="1"/>
-						<line number="93" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="94,96"/>
-						<line number="94" hits="0"/>
-						<line number="96" hits="0"/>
-						<line number="97" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="98,127"/>
-						<line number="98" hits="0"/>
-						<line number="99" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="100,102"/>
-						<line number="100" hits="0"/>
-						<line number="102" hits="0"/>
+						<line number="72" hits="0"/>
+						<line number="75" hits="1"/>
+						<line number="76" hits="0"/>
+						<line number="79" hits="1"/>
+						<line number="80" hits="0"/>
+						<line number="83" hits="1"/>
+						<line number="90" hits="0"/>
+						<line number="93" hits="1"/>
+						<line number="94" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="95,97"/>
+						<line number="95" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="98" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="99,128"/>
+						<line number="99" hits="0"/>
+						<line number="100" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="101,103"/>
+						<line number="101" hits="0"/>
 						<line number="103" hits="0"/>
 						<line number="104" hits="0"/>
-						<line number="105" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="106,107"/>
-						<line number="106" hits="0"/>
-						<line number="107" hits="0"/>
-						<line number="108" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="109,116"/>
-						<line number="109" hits="0"/>
-						<line number="116" hits="0"/>
-						<line number="127" hits="0"/>
-						<line number="128" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="129,131"/>
-						<line number="129" hits="0"/>
-						<line number="131" hits="0"/>
+						<line number="105" hits="0"/>
+						<line number="106" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="107,108"/>
+						<line number="107" hits="0"/>
+						<line number="108" hits="0"/>
+						<line number="109" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="110,117"/>
+						<line number="110" hits="0"/>
+						<line number="117" hits="0"/>
+						<line number="128" hits="0"/>
+						<line number="129" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="130,132"/>
+						<line number="130" hits="0"/>
 						<line number="132" hits="0"/>
 						<line number="133" hits="0"/>
-						<line number="135" hits="0"/>
-						<line number="136" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="137,144"/>
-						<line number="137" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="138,139"/>
-						<line number="138" hits="0"/>
-						<line number="139" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="140,142"/>
-						<line number="140" hits="0"/>
-						<line number="142" hits="0"/>
-						<line number="144" hits="0"/>
-						<line number="145" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="146,153"/>
-						<line number="146" hits="0"/>
-						<line number="153" hits="0"/>
+						<line number="134" hits="0"/>
+						<line number="136" hits="0"/>
+						<line number="137" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="138,145"/>
+						<line number="138" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="139,140"/>
+						<line number="139" hits="0"/>
+						<line number="140" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="141,143"/>
+						<line number="141" hits="0"/>
+						<line number="143" hits="0"/>
+						<line number="145" hits="0"/>
+						<line number="146" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="147,154"/>
+						<line number="147" hits="0"/>
 						<line number="154" hits="0"/>
-						<line number="156" hits="0"/>
-						<line number="168" hits="1"/>
-						<line number="170" hits="0"/>
-						<line number="173" hits="1"/>
-						<line number="174" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="175,176"/>
-						<line number="175" hits="0"/>
-						<line number="176" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="177,178"/>
-						<line number="177" hits="0"/>
-						<line number="178" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="179,181"/>
-						<line number="179" hits="0"/>
+						<line number="155" hits="0"/>
+						<line number="157" hits="0"/>
+						<line number="169" hits="1"/>
+						<line number="171" hits="0"/>
+						<line number="174" hits="1"/>
+						<line number="175" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="176,177"/>
+						<line number="176" hits="0"/>
+						<line number="177" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="178,179"/>
+						<line number="178" hits="0"/>
+						<line number="179" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="180,182"/>
 						<line number="180" hits="0"/>
-						<line number="181" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="182,184"/>
-						<line number="182" hits="0"/>
+						<line number="181" hits="0"/>
+						<line number="182" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="183,185"/>
 						<line number="183" hits="0"/>
 						<line number="184" hits="0"/>
-						<line number="187" hits="1"/>
-						<line number="189" hits="0"/>
-						<line number="191" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="192,196"/>
-						<line number="192" hits="0"/>
-						<line number="193" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="191,194"/>
-						<line number="194" hits="0"/>
-						<line number="196" hits="0"/>
-						<line number="198" hits="0"/>
-						<line number="209" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="210,216"/>
-						<line number="210" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="209,211"/>
-						<line number="211" hits="0"/>
-						<line number="212" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="209,213"/>
-						<line number="213" hits="0"/>
-						<line number="216" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="217,223"/>
-						<line number="217" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="218,219"/>
-						<line number="218" hits="0"/>
+						<line number="185" hits="0"/>
+						<line number="188" hits="1"/>
+						<line number="190" hits="0"/>
+						<line number="192" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="193,197"/>
+						<line number="193" hits="0"/>
+						<line number="194" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="192,195"/>
+						<line number="195" hits="0"/>
+						<line number="197" hits="0"/>
+						<line number="199" hits="0"/>
+						<line number="210" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="211,217"/>
+						<line number="211" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="210,212"/>
+						<line number="212" hits="0"/>
+						<line number="213" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="210,214"/>
+						<line number="214" hits="0"/>
+						<line number="217" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="218,224"/>
+						<line number="218" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="219,220"/>
 						<line number="219" hits="0"/>
-						<line number="220" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="216,221"/>
-						<line number="221" hits="0"/>
-						<line number="223" hits="0"/>
+						<line number="220" hits="0"/>
+						<line number="221" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="217,222"/>
+						<line number="222" hits="0"/>
 						<line number="224" hits="0"/>
-						<line number="227" hits="1"/>
-						<line number="229" hits="0"/>
-						<line number="230" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="231,233"/>
-						<line number="231" hits="0"/>
-						<line number="233" hits="0"/>
-						<line number="234" hits="0"/>
-						<line number="235" hits="0"/>
+						<line number="225" hits="0"/>
+						<line number="228" hits="1"/>
 						<line number="236" hits="0"/>
-						<line number="238" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="239,267"/>
-						<line number="239" hits="0"/>
-						<line number="241" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="242,246"/>
+						<line number="237" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="238,240"/>
+						<line number="238" hits="0"/>
+						<line number="240" hits="0"/>
+						<line number="241" hits="0"/>
 						<line number="242" hits="0"/>
-						<line number="243" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="244,246"/>
-						<line number="244" hits="0"/>
+						<line number="243" hits="0"/>
+						<line number="245" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="246,274"/>
 						<line number="246" hits="0"/>
-						<line number="247" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="248,262"/>
-						<line number="248" hits="0"/>
-						<line number="260" hits="0"/>
-						<line number="262" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="263,265"/>
-						<line number="263" hits="0"/>
-						<line number="265" hits="0"/>
+						<line number="248" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="249,253"/>
+						<line number="249" hits="0"/>
+						<line number="250" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="251,253"/>
+						<line number="251" hits="0"/>
+						<line number="253" hits="0"/>
+						<line number="254" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="255,269"/>
+						<line number="255" hits="0"/>
 						<line number="267" hits="0"/>
-						<line number="270" hits="1"/>
-						<line number="278" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="279,281"/>
-						<line number="279" hits="0"/>
-						<line number="281" hits="0"/>
-						<line number="282" hits="0"/>
-						<line number="284" hits="0"/>
-						<line number="287" hits="0"/>
+						<line number="269" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="270,272"/>
+						<line number="270" hits="0"/>
+						<line number="272" hits="0"/>
+						<line number="274" hits="0"/>
+						<line number="277" hits="1"/>
+						<line number="285" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="286,288"/>
+						<line number="286" hits="0"/>
 						<line number="288" hits="0"/>
-						<line number="303" hits="0"/>
-						<line number="309" hits="1"/>
-						<line number="318" hits="0"/>
-						<line number="320" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="321,323"/>
-						<line number="321" hits="0"/>
-						<line number="323" hits="0"/>
-						<line number="324" hits="0"/>
+						<line number="289" hits="0"/>
+						<line number="291" hits="0"/>
+						<line number="294" hits="0"/>
+						<line number="295" hits="0"/>
+						<line number="310" hits="0"/>
+						<line number="316" hits="1"/>
 						<line number="325" hits="0"/>
-						<line number="326" hits="0"/>
-						<line number="327" hits="0"/>
+						<line number="327" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="328,330"/>
 						<line number="328" hits="0"/>
-						<line number="329" hits="0"/>
+						<line number="330" hits="0"/>
 						<line number="331" hits="0"/>
+						<line number="332" hits="0"/>
 						<line number="333" hits="0"/>
+						<line number="334" hits="0"/>
 						<line number="335" hits="0"/>
-						<line number="354" hits="0"/>
-						<line number="355" hits="0"/>
-						<line number="358" hits="1"/>
-						<line number="367" hits="0"/>
-						<line number="368" hits="0"/>
-						<line number="373" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="374,376"/>
+						<line number="336" hits="0"/>
+						<line number="338" hits="0"/>
+						<line number="340" hits="0"/>
+						<line number="342" hits="0"/>
+						<line number="361" hits="0"/>
+						<line number="362" hits="0"/>
+						<line number="365" hits="1"/>
 						<line number="374" hits="0"/>
-						<line number="376" hits="0"/>
-						<line number="377" hits="0"/>
-						<line number="378" hits="0"/>
-						<line number="379" hits="0"/>
-						<line number="381" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="382,384"/>
-						<line number="382" hits="0"/>
+						<line number="375" hits="0"/>
+						<line number="380" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="381,383"/>
+						<line number="381" hits="0"/>
+						<line number="383" hits="0"/>
 						<line number="384" hits="0"/>
-						<line number="392" hits="0"/>
-						<line number="394" hits="0"/>
-						<line number="409" hits="0"/>
-						<line number="410" hits="0"/>
-						<line number="411" hits="0"/>
-						<line number="413" hits="0"/>
-						<line number="415" hits="0"/>
-						<line number="418" hits="1"/>
-						<line number="423" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="424,435"/>
-						<line number="424" hits="0"/>
-						<line number="428" hits="0"/>
-						<line number="433" hits="0"/>
-						<line number="435" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="436,448"/>
-						<line number="436" hits="0"/>
+						<line number="385" hits="0"/>
+						<line number="386" hits="0"/>
+						<line number="388" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="389,391"/>
+						<line number="389" hits="0"/>
+						<line number="391" hits="0"/>
+						<line number="399" hits="0"/>
+						<line number="401" hits="0"/>
+						<line number="416" hits="0"/>
+						<line number="417" hits="0"/>
+						<line number="418" hits="0"/>
+						<line number="420" hits="0"/>
+						<line number="422" hits="0"/>
+						<line number="425" hits="1"/>
+						<line number="430" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="431,442"/>
+						<line number="431" hits="0"/>
+						<line number="435" hits="0"/>
 						<line number="440" hits="0"/>
-						<line number="445" hits="0"/>
-						<line number="448" hits="0"/>
-						<line number="451" hits="1"/>
+						<line number="442" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="443,455"/>
+						<line number="443" hits="0"/>
+						<line number="447" hits="0"/>
 						<line number="452" hits="0"/>
-						<line number="453" hits="0"/>
-						<line number="463" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="464,467"/>
-						<line number="464" hits="0"/>
-						<line number="465" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="463,466"/>
-						<line number="466" hits="0"/>
-						<line number="467" hits="0"/>
-						<line number="470" hits="1"/>
+						<line number="455" hits="0"/>
+						<line number="458" hits="1"/>
+						<line number="459" hits="0"/>
+						<line number="460" hits="0"/>
+						<line number="470" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="471,474"/>
 						<line number="471" hits="0"/>
-						<line number="472" hits="0"/>
-						<line number="477" hits="0"/>
-						<line number="478" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="479,480"/>
+						<line number="472" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="470,473"/>
+						<line number="473" hits="0"/>
+						<line number="474" hits="0"/>
+						<line number="477" hits="1"/>
+						<line number="478" hits="0"/>
 						<line number="479" hits="0"/>
-						<line number="480" hits="0"/>
-						<line number="483" hits="1"/>
-						<line number="484" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="485,487"/>
-						<line number="485" hits="0"/>
+						<line number="484" hits="0"/>
+						<line number="485" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="486,487"/>
+						<line number="486" hits="0"/>
 						<line number="487" hits="0"/>
-						<line number="488" hits="0"/>
-						<line number="491" hits="1"/>
-						<line number="492" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="493,494"/>
-						<line number="493" hits="0"/>
-						<line number="494" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="495,497"/>
+						<line number="490" hits="1"/>
+						<line number="491" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="492,494"/>
+						<line number="492" hits="0"/>
+						<line number="494" hits="0"/>
 						<line number="495" hits="0"/>
-						<line number="497" hits="0"/>
-						<line number="498" hits="0"/>
-						<line number="501" hits="1"/>
-						<line number="507" hits="0"/>
-						<line number="527" hits="0"/>
-						<line number="528" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="529,537"/>
-						<line number="529" hits="0"/>
-						<line number="535" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="528,536"/>
+						<line number="498" hits="1"/>
+						<line number="499" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="500,501"/>
+						<line number="500" hits="0"/>
+						<line number="501" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="502,504"/>
+						<line number="502" hits="0"/>
+						<line number="504" hits="0"/>
+						<line number="505" hits="0"/>
+						<line number="508" hits="1"/>
+						<line number="514" hits="0"/>
+						<line number="534" hits="0"/>
+						<line number="535" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="536,544"/>
 						<line number="536" hits="0"/>
-						<line number="537" hits="0"/>
-						<line number="540" hits="1"/>
-						<line number="550" hits="0"/>
-						<line number="553" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="554,557"/>
-						<line number="554" hits="0"/>
+						<line number="542" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="535,543"/>
+						<line number="543" hits="0"/>
+						<line number="544" hits="0"/>
+						<line number="547" hits="1"/>
 						<line number="557" hits="0"/>
-						<line number="560" hits="0"/>
-						<line number="562" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="563,566"/>
-						<line number="563" hits="0"/>
-						<line number="566" hits="0"/>
+						<line number="560" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="561,564"/>
+						<line number="561" hits="0"/>
+						<line number="564" hits="0"/>
 						<line number="567" hits="0"/>
-						<line number="568" hits="0"/>
-						<line number="569" hits="0"/>
-						<line number="571" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="572,605"/>
-						<line number="572" hits="0"/>
-						<line number="582" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="583,585"/>
-						<line number="583" hits="0"/>
-						<line number="585" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="586,603"/>
-						<line number="586" hits="0"/>
-						<line number="587" hits="0"/>
+						<line number="569" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="570,573"/>
+						<line number="570" hits="0"/>
+						<line number="573" hits="0"/>
+						<line number="574" hits="0"/>
+						<line number="575" hits="0"/>
+						<line number="576" hits="0"/>
+						<line number="578" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="579,612"/>
+						<line number="579" hits="0"/>
+						<line number="589" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="590,592"/>
+						<line number="590" hits="0"/>
+						<line number="592" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="593,610"/>
+						<line number="593" hits="0"/>
 						<line number="594" hits="0"/>
-						<line number="595" hits="0"/>
-						<line number="596" hits="0"/>
 						<line number="601" hits="0"/>
+						<line number="602" hits="0"/>
 						<line number="603" hits="0"/>
-						<line number="605" hits="0"/>
+						<line number="608" hits="0"/>
+						<line number="610" hits="0"/>
 						<line number="612" hits="0"/>
-						<line number="618" hits="0"/>
-						<line number="633" hits="0"/>
-						<line number="640" hits="1"/>
-						<line number="649" hits="0"/>
-						<line number="657" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="658,669"/>
-						<line number="658" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="659,660"/>
-						<line number="659" hits="0"/>
-						<line number="660" hits="0"/>
-						<line number="669" hits="0"/>
-						<line number="682" hits="0"/>
-						<line number="683" hits="0"/>
-						<line number="685" hits="0"/>
-						<line number="694" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="695,699"/>
-						<line number="695" hits="0"/>
-						<line number="696" hits="0"/>
-						<line number="697" hits="0"/>
-						<line number="699" hits="0"/>
-						<line number="701" hits="0"/>
-						<line number="705" hits="0"/>
-						<line number="713" hits="0"/>
-						<line number="728" hits="0"/>
-						<line number="738" hits="1"/>
-						<line number="747" hits="0"/>
-						<line number="760" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="761,767"/>
-						<line number="761" hits="0"/>
-						<line number="767" hits="0"/>
-						<line number="776" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="777,779"/>
-						<line number="777" hits="0"/>
-						<line number="779" hits="0"/>
-						<line number="787" hits="0"/>
-						<line number="789" hits="0"/>
-						<line number="790" hits="0"/>
-						<line number="792" hits="0"/>
-						<line number="793" hits="0"/>
-						<line number="795" hits="0"/>
-						<line number="801" hits="0"/>
-						<line number="807" hits="0"/>
-						<line number="814" hits="1"/>
-						<line number="823" hits="0"/>
-						<line number="824" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="825,827"/>
-						<line number="825" hits="0"/>
-						<line number="827" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="828,835"/>
-						<line number="828" hits="0"/>
+						<line number="619" hits="0"/>
+						<line number="625" hits="0"/>
+						<line number="640" hits="0"/>
+						<line number="647" hits="1"/>
+						<line number="656" hits="0"/>
+						<line number="664" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="665,676"/>
+						<line number="665" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="666,667"/>
+						<line number="666" hits="0"/>
+						<line number="667" hits="0"/>
+						<line number="676" hits="0"/>
+						<line number="689" hits="0"/>
+						<line number="690" hits="0"/>
+						<line number="692" hits="0"/>
+						<line number="701" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="702,706"/>
+						<line number="702" hits="0"/>
+						<line number="703" hits="0"/>
+						<line number="704" hits="0"/>
+						<line number="706" hits="0"/>
+						<line number="708" hits="0"/>
+						<line number="712" hits="0"/>
+						<line number="720" hits="0"/>
+						<line number="735" hits="0"/>
+						<line number="745" hits="1"/>
+						<line number="754" hits="0"/>
+						<line number="767" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="768,774"/>
+						<line number="768" hits="0"/>
+						<line number="774" hits="0"/>
+						<line number="783" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="784,786"/>
+						<line number="784" hits="0"/>
+						<line number="786" hits="0"/>
+						<line number="794" hits="0"/>
+						<line number="796" hits="0"/>
+						<line number="797" hits="0"/>
+						<line number="799" hits="0"/>
+						<line number="800" hits="0"/>
+						<line number="802" hits="0"/>
+						<line number="808" hits="0"/>
+						<line number="814" hits="0"/>
+						<line number="821" hits="1"/>
+						<line number="830" hits="0"/>
+						<line number="831" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="832,834"/>
+						<line number="832" hits="0"/>
+						<line number="834" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="835,842"/>
 						<line number="835" hits="0"/>
-						<line number="836" hits="0"/>
-						<line number="837" hits="0"/>
-						<line number="838" hits="0"/>
-						<line number="839" hits="0"/>
-						<line number="840" hits="0"/>
-						<line number="841" hits="0"/>
+						<line number="842" hits="0"/>
 						<line number="843" hits="0"/>
 						<line number="844" hits="0"/>
 						<line number="845" hits="0"/>
-						<line number="846" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="847,964"/>
+						<line number="846" hits="0"/>
 						<line number="847" hits="0"/>
-						<line number="849" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="850,854"/>
+						<line number="848" hits="0"/>
 						<line number="850" hits="0"/>
+						<line number="851" hits="0"/>
+						<line number="852" hits="0"/>
+						<line number="853" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="854,971"/>
 						<line number="854" hits="0"/>
-						<line number="855" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="856,860"/>
-						<line number="856" hits="0"/>
-						<line number="860" hits="0"/>
-						<line number="865" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="866,908"/>
-						<line number="866" hits="0"/>
+						<line number="856" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="857,861"/>
+						<line number="857" hits="0"/>
+						<line number="861" hits="0"/>
+						<line number="862" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="863,867"/>
+						<line number="863" hits="0"/>
 						<line number="867" hits="0"/>
-						<line number="868" hits="0"/>
-						<line number="869" hits="0"/>
-						<line number="870" hits="0"/>
-						<line number="871" hits="0"/>
+						<line number="872" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="873,915"/>
 						<line number="873" hits="0"/>
-						<line number="881" hits="0"/>
-						<line number="886" hits="0"/>
-						<line number="900" hits="0"/>
-						<line number="908" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="909,964"/>
-						<line number="909" hits="0"/>
+						<line number="874" hits="0"/>
+						<line number="875" hits="0"/>
+						<line number="876" hits="0"/>
+						<line number="877" hits="0"/>
+						<line number="878" hits="0"/>
+						<line number="880" hits="0"/>
+						<line number="888" hits="0"/>
+						<line number="893" hits="0"/>
+						<line number="907" hits="0"/>
+						<line number="915" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="916,971"/>
 						<line number="916" hits="0"/>
-						<line number="917" hits="0"/>
-						<line number="918" hits="0"/>
-						<line number="919" hits="0"/>
-						<line number="920" hits="0"/>
-						<line number="921" hits="0"/>
 						<line number="923" hits="0"/>
-						<line number="932" hits="0"/>
-						<line number="938" hits="0"/>
-						<line number="953" hits="0"/>
-						<line number="964" hits="0"/>
-						<line number="973" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="974,976"/>
-						<line number="974" hits="0"/>
-						<line number="976" hits="0"/>
-						<line number="977" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="978,980"/>
-						<line number="978" hits="0"/>
-						<line number="980" hits="0"/>
-						<line number="981" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="982,984"/>
-						<line number="982" hits="0"/>
-						<line number="984" hits="0"/>
-						<line number="985" hits="0"/>
+						<line number="924" hits="0"/>
+						<line number="925" hits="0"/>
+						<line number="926" hits="0"/>
+						<line number="927" hits="0"/>
+						<line number="928" hits="0"/>
+						<line number="930" hits="0"/>
+						<line number="939" hits="0"/>
+						<line number="945" hits="0"/>
+						<line number="960" hits="0"/>
+						<line number="971" hits="0"/>
+						<line number="980" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="981,987"/>
+						<line number="981" hits="0"/>
 						<line number="987" hits="0"/>
-						<line number="988" hits="0"/>
-						<line number="995" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="996,998"/>
-						<line number="996" hits="0"/>
+						<line number="995" hits="0"/>
 						<line number="998" hits="0"/>
-						<line number="1000" hits="0"/>
-						<line number="1001" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1002,1019"/>
 						<line number="1002" hits="0"/>
-						<line number="1019" hits="0"/>
+						<line number="1012" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1013,1015"/>
+						<line number="1013" hits="0"/>
+						<line number="1015" hits="0"/>
+						<line number="1017" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1018,1020"/>
+						<line number="1018" hits="0"/>
 						<line number="1020" hits="0"/>
-						<line number="1022" hits="0"/>
-						<line number="1023" hits="0"/>
-						<line number="1024" hits="0"/>
-						<line number="1025" hits="0"/>
-						<line number="1026" hits="0"/>
-						<line number="1028" hits="0"/>
-						<line number="1030" hits="0"/>
-						<line number="1037" hits="0"/>
-						<line number="1042" hits="0"/>
-						<line number="1050" hits="0"/>
-						<line number="1067" hits="0"/>
+						<line number="1021" hits="0"/>
+						<line number="1028" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1029,1031"/>
+						<line number="1029" hits="0"/>
+						<line number="1031" hits="0"/>
+						<line number="1032" hits="0"/>
+						<line number="1035" hits="0"/>
+						<line number="1036" hits="0"/>
+						<line number="1038" hits="0"/>
+						<line number="1039" hits="0"/>
+						<line number="1043" hits="0"/>
+						<line number="1050" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1051,1059"/>
+						<line number="1051" hits="0"/>
+						<line number="1059" hits="0"/>
 						<line number="1068" hits="0"/>
-						<line number="1075" hits="0"/>
-						<line number="1083" hits="0"/>
-						<line number="1084" hits="0"/>
-						<line number="1085" hits="0"/>
-						<line number="1086" hits="0"/>
-						<line number="1088" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1089,1162"/>
+						<line number="1079" hits="0"/>
+						<line number="1087" hits="0"/>
 						<line number="1089" hits="0"/>
-						<line number="1090" hits="0"/>
-						<line number="1091" hits="0"/>
-						<line number="1092" hits="0"/>
-						<line number="1093" hits="0"/>
-						<line number="1094" hits="0"/>
-						<line number="1095" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1096,1098"/>
 						<line number="1096" hits="0"/>
-						<line number="1097" hits="0"/>
-						<line number="1098" hits="0"/>
 						<line number="1100" hits="0"/>
-						<line number="1106" hits="0"/>
-						<line number="1113" hits="0"/>
-						<line number="1119" hits="0"/>
-						<line number="1129" hits="0"/>
-						<line number="1138" hits="0"/>
-						<line number="1153" hits="0"/>
-						<line number="1162" hits="0"/>
+						<line number="1103" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1104,1126"/>
+						<line number="1104" hits="0"/>
+						<line number="1126" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1127,1150"/>
+						<line number="1127" hits="0"/>
+						<line number="1150" hits="0"/>
+						<line number="1155" hits="0"/>
+						<line number="1156" hits="0"/>
+						<line number="1157" hits="0"/>
+						<line number="1158" hits="0"/>
+						<line number="1159" hits="0"/>
+						<line number="1161" hits="0"/>
 						<line number="1163" hits="0"/>
-						<line number="1164" hits="0"/>
-						<line number="1165" hits="0"/>
-						<line number="1166" hits="0"/>
-						<line number="1167" hits="0"/>
-						<line number="1169" hits="0"/>
-						<line number="1176" hits="0"/>
-						<line number="1181" hits="0"/>
-						<line number="1190" hits="1"/>
-						<line number="1198" hits="1"/>
-						<line number="1200" hits="1"/>
+						<line number="1172" hits="0"/>
+						<line number="1177" hits="0"/>
+						<line number="1185" hits="0"/>
+						<line number="1202" hits="0"/>
+						<line number="1203" hits="0"/>
+						<line number="1211" hits="0"/>
+						<line number="1219" hits="0"/>
+						<line number="1220" hits="0"/>
+						<line number="1221" hits="0"/>
+						<line number="1222" hits="0"/>
+						<line number="1224" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1225,1297"/>
 						<line number="1225" hits="0"/>
-						<line number="1232" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1233,1249"/>
+						<line number="1226" hits="0"/>
+						<line number="1227" hits="0"/>
+						<line number="1228" hits="0"/>
+						<line number="1229" hits="0"/>
+						<line number="1230" hits="0"/>
+						<line number="1231" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1232,1233"/>
+						<line number="1232" hits="0"/>
 						<line number="1233" hits="0"/>
-						<line number="1239" hits="0"/>
+						<line number="1235" hits="0"/>
 						<line number="1241" hits="0"/>
-						<line number="1242" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1243,1244"/>
-						<line number="1243" hits="0"/>
-						<line number="1244" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1245,1246"/>
-						<line number="1245" hits="0"/>
-						<line number="1246" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1232,1247"/>
-						<line number="1247" hits="0"/>
-						<line number="1249" hits="0"/>
-						<line number="1257" hits="0"/>
+						<line number="1248" hits="0"/>
+						<line number="1254" hits="0"/>
+						<line number="1264" hits="0"/>
+						<line number="1273" hits="0"/>
+						<line number="1288" hits="0"/>
+						<line number="1297" hits="0"/>
+						<line number="1298" hits="0"/>
+						<line number="1299" hits="0"/>
+						<line number="1300" hits="0"/>
+						<line number="1301" hits="0"/>
+						<line number="1302" hits="0"/>
+						<line number="1304" hits="0"/>
+						<line number="1311" hits="0"/>
+						<line number="1316" hits="0"/>
+						<line number="1325" hits="1"/>
+						<line number="1333" hits="0"/>
+						<line number="1335" hits="0"/>
+						<line number="1360" hits="0"/>
+						<line number="1367" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1368,1384"/>
+						<line number="1368" hits="0"/>
+						<line number="1374" hits="0"/>
+						<line number="1376" hits="0"/>
+						<line number="1377" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1378,1379"/>
+						<line number="1378" hits="0"/>
+						<line number="1379" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1380,1381"/>
+						<line number="1380" hits="0"/>
+						<line number="1381" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1367,1382"/>
+						<line number="1382" hits="0"/>
+						<line number="1384" hits="0"/>
+						<line number="1392" hits="0"/>
 					</lines>
 				</class>
-				<class name="library_observability.py" filename="services/library_observability.py" complexity="0" line-rate="0.3704" branch-rate="0.1">
+				<class name="library_observability.py" filename="services/library_observability.py" complexity="0" line-rate="0.2963" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="3" hits="1"/>
@@ -32148,7 +36541,7 @@
 						<line number="74" hits="0"/>
 						<line number="75" hits="0"/>
 						<line number="78" hits="1"/>
-						<line number="80" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="81"/>
+						<line number="80" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="81,90"/>
 						<line number="81" hits="0"/>
 						<line number="82" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="83,88"/>
 						<line number="83" hits="0"/>
@@ -32156,11 +36549,11 @@
 						<line number="85" hits="0"/>
 						<line number="87" hits="0"/>
 						<line number="88" hits="0"/>
-						<line number="90" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="91"/>
+						<line number="90" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="91,92"/>
 						<line number="91" hits="0"/>
-						<line number="92" hits="1"/>
+						<line number="92" hits="0"/>
 						<line number="95" hits="1"/>
-						<line number="97" hits="1"/>
+						<line number="97" hits="0"/>
 					</lines>
 				</class>
 				<class name="library_rollout_gates.py" filename="services/library_rollout_gates.py" complexity="0" line-rate="0" branch-rate="0">
@@ -32762,7 +37155,7 @@
 						<line number="602" hits="0"/>
 					</lines>
 				</class>
-				<class name="media_callback_service.py" filename="services/media_callback_service.py" complexity="0" line-rate="0.1475" branch-rate="0">
+				<class name="media_callback_service.py" filename="services/media_callback_service.py" complexity="0" line-rate="0.1366" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="3" hits="1"/>
@@ -32926,8 +37319,8 @@
 						<line number="353" hits="0"/>
 						<line number="354" hits="0"/>
 						<line number="357" hits="1"/>
-						<line number="359" hits="1"/>
-						<line number="360" hits="1"/>
+						<line number="359" hits="0"/>
+						<line number="360" hits="0"/>
 						<line number="368" hits="0"/>
 						<line number="370" hits="0"/>
 						<line number="371" hits="0"/>
@@ -33088,24 +37481,24 @@
 						<line number="296" hits="0"/>
 					</lines>
 				</class>
-				<class name="media_provider_service.py" filename="services/media_provider_service.py" complexity="0" line-rate="0.1809" branch-rate="0">
+				<class name="media_provider_service.py" filename="services/media_provider_service.py" complexity="0" line-rate="0" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="8" hits="1"/>
-						<line number="9" hits="1"/>
-						<line number="10" hits="1"/>
-						<line number="11" hits="1"/>
-						<line number="12" hits="1"/>
-						<line number="13" hits="1"/>
-						<line number="14" hits="1"/>
-						<line number="16" hits="1"/>
-						<line number="19" hits="1"/>
-						<line number="20" hits="1"/>
-						<line number="21" hits="1"/>
-						<line number="24" hits="1"/>
-						<line number="27" hits="1"/>
+						<line number="8" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="20" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="27" hits="0"/>
 						<line number="29" hits="0"/>
-						<line number="32" hits="1"/>
+						<line number="32" hits="0"/>
 						<line number="38" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="39,41"/>
 						<line number="39" hits="0"/>
 						<line number="41" hits="0"/>
@@ -33134,7 +37527,7 @@
 						<line number="72" hits="0"/>
 						<line number="73" hits="0"/>
 						<line number="74" hits="0"/>
-						<line number="77" hits="1"/>
+						<line number="77" hits="0"/>
 						<line number="87" hits="0"/>
 						<line number="88" hits="0"/>
 						<line number="91" hits="0"/>
@@ -33165,7 +37558,7 @@
 						<line number="149" hits="0"/>
 						<line number="150" hits="0"/>
 						<line number="155" hits="0"/>
-						<line number="158" hits="1"/>
+						<line number="158" hits="0"/>
 						<line number="165" hits="0"/>
 						<line number="166" hits="0"/>
 						<line number="168" hits="0"/>
@@ -33182,12 +37575,12 @@
 						<line number="190" hits="0"/>
 						<line number="191" hits="0"/>
 						<line number="192" hits="0"/>
-						<line number="195" hits="1"/>
+						<line number="195" hits="0"/>
 						<line number="198" hits="0"/>
 						<line number="199" hits="0"/>
 					</lines>
 				</class>
-				<class name="media_task_service.py" filename="services/media_task_service.py" complexity="0" line-rate="0.2024" branch-rate="0">
+				<class name="media_task_service.py" filename="services/media_task_service.py" complexity="0" line-rate="0.1905" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="6" hits="1"/>
@@ -33317,8 +37710,8 @@
 						<line number="250" hits="0"/>
 						<line number="252" hits="1"/>
 						<line number="253" hits="1"/>
-						<line number="258" hits="1"/>
-						<line number="259" hits="1"/>
+						<line number="258" hits="0"/>
+						<line number="259" hits="0"/>
 						<line number="260" hits="0"/>
 						<line number="262" hits="1"/>
 						<line number="263" hits="1"/>
@@ -33510,6 +37903,170 @@
 						<line number="703" hits="0"/>
 					</lines>
 				</class>
+				<class name="microsoft_token_service.py" filename="services/microsoft_token_service.py" complexity="0" line-rate="0.2201" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="8" hits="1"/>
+						<line number="9" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="14" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="39" hits="1"/>
+						<line number="40" hits="1"/>
+						<line number="43" hits="1"/>
+						<line number="46" hits="1"/>
+						<line number="48" hits="1"/>
+						<line number="51" hits="1"/>
+						<line number="54" hits="1"/>
+						<line number="55" hits="0"/>
+						<line number="57" hits="1"/>
+						<line number="59" hits="0"/>
+						<line number="65" hits="0"/>
+						<line number="67" hits="1"/>
+						<line number="68" hits="1"/>
+						<line number="70" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="71,72"/>
+						<line number="71" hits="0"/>
+						<line number="72" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="73,74"/>
+						<line number="73" hits="0"/>
+						<line number="74" hits="0"/>
+						<line number="76" hits="1"/>
+						<line number="77" hits="1"/>
+						<line number="79" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="80,81"/>
+						<line number="80" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="83" hits="1"/>
+						<line number="89" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="98" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="99,101"/>
+						<line number="99" hits="0"/>
+						<line number="101" hits="0"/>
+						<line number="102" hits="0"/>
+						<line number="103" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="104,107"/>
+						<line number="104" hits="0"/>
+						<line number="107" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="108,111"/>
+						<line number="108" hits="0"/>
+						<line number="111" hits="0"/>
+						<line number="113" hits="1"/>
+						<line number="115" hits="0"/>
+						<line number="116" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="117,121"/>
+						<line number="117" hits="0"/>
+						<line number="118" hits="0"/>
+						<line number="119" hits="0"/>
+						<line number="121" hits="0"/>
+						<line number="122" hits="0"/>
+						<line number="123" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="126" hits="0"/>
+						<line number="137" hits="0"/>
+						<line number="139" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="140,148"/>
+						<line number="140" hits="0"/>
+						<line number="141" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="142,145"/>
+						<line number="142" hits="0"/>
+						<line number="143" hits="0"/>
+						<line number="144" hits="0"/>
+						<line number="145" hits="0"/>
+						<line number="148" hits="0"/>
+						<line number="149" hits="0"/>
+						<line number="150" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="151,152"/>
+						<line number="151" hits="0"/>
+						<line number="152" hits="0"/>
+						<line number="155" hits="0"/>
+						<line number="156" hits="0"/>
+						<line number="158" hits="0"/>
+						<line number="159" hits="0"/>
+						<line number="161" hits="1"/>
+						<line number="163" hits="0"/>
+						<line number="164" hits="0"/>
+						<line number="165" hits="0"/>
+						<line number="170" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="171,173"/>
+						<line number="171" hits="0"/>
+						<line number="173" hits="0"/>
+						<line number="174" hits="0"/>
+						<line number="176" hits="0"/>
+						<line number="178" hits="0"/>
+						<line number="188" hits="0"/>
+						<line number="190" hits="1"/>
+						<line number="195" hits="0"/>
+						<line number="196" hits="0"/>
+						<line number="197" hits="0"/>
+						<line number="198" hits="0"/>
+						<line number="200" hits="0"/>
+						<line number="201" hits="0"/>
+						<line number="202" hits="0"/>
+						<line number="203" hits="0"/>
+						<line number="209" hits="0"/>
+						<line number="210" hits="0"/>
+						<line number="222" hits="0"/>
+						<line number="223" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="224,227"/>
+						<line number="224" hits="0"/>
+						<line number="225" hits="0"/>
+						<line number="227" hits="0"/>
+						<line number="228" hits="0"/>
+						<line number="229" hits="0"/>
+						<line number="230" hits="0"/>
+						<line number="233" hits="0"/>
+						<line number="234" hits="0"/>
+						<line number="239" hits="0"/>
+						<line number="240" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="241,245"/>
+						<line number="241" hits="0"/>
+						<line number="242" hits="0"/>
+						<line number="245" hits="0"/>
+						<line number="246" hits="0"/>
+						<line number="248" hits="0"/>
+						<line number="249" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="250,259"/>
+						<line number="250" hits="0"/>
+						<line number="251" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="252,253"/>
+						<line number="252" hits="0"/>
+						<line number="253" hits="0"/>
+						<line number="254" hits="0"/>
+						<line number="255" hits="0"/>
+						<line number="256" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="257,272"/>
+						<line number="257" hits="0"/>
+						<line number="259" hits="0"/>
+						<line number="270" hits="0"/>
+						<line number="272" hits="0"/>
+						<line number="274" hits="0"/>
+						<line number="280" hits="1"/>
+						<line number="282" hits="0"/>
+						<line number="283" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="284,291"/>
+						<line number="284" hits="0"/>
+						<line number="291" hits="0"/>
+						<line number="292" hits="0"/>
+						<line number="294" hits="0"/>
+						<line number="296" hits="0"/>
+						<line number="303" hits="1"/>
+						<line number="304" hits="1"/>
+						<line number="306" hits="0"/>
+						<line number="307" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="308,309"/>
+						<line number="308" hits="0"/>
+						<line number="309" hits="0"/>
+						<line number="311" hits="1"/>
+						<line number="318" hits="0"/>
+						<line number="319" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="320,322"/>
+						<line number="320" hits="0"/>
+						<line number="322" hits="0"/>
+						<line number="323" hits="0"/>
+						<line number="324" hits="0"/>
+						<line number="325" hits="0"/>
+						<line number="326" hits="0"/>
+						<line number="328" hits="1"/>
+						<line number="330" hits="0"/>
+						<line number="331" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="332,333"/>
+						<line number="332" hits="0"/>
+						<line number="333" hits="0"/>
+						<line number="334" hits="0"/>
+						<line number="335" hits="0"/>
+					</lines>
+				</class>
 				<class name="moderation_service.py" filename="services/moderation_service.py" complexity="0" line-rate="0.2778" branch-rate="0">
 					<methods/>
 					<lines>
@@ -33623,6 +38180,137 @@
 						<line number="426" hits="0"/>
 					</lines>
 				</class>
+				<class name="onedrive_content_extractor.py" filename="services/onedrive_content_extractor.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="6" hits="0"/>
+						<line number="7" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="22" hits="0"/>
+						<line number="23" hits="0"/>
+						<line number="25" hits="0"/>
+						<line number="26" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="27,29"/>
+						<line number="27" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="29" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="30,32"/>
+						<line number="30" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="32" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="33,35"/>
+						<line number="33" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="35" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="36,38"/>
+						<line number="36" hits="0"/>
+						<line number="37" hits="0"/>
+						<line number="38" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="39,43"/>
+						<line number="39" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="43" hits="0"/>
+						<line number="44" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="54" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="57" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="66" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="68" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="69,70"/>
+						<line number="69" hits="0"/>
+						<line number="70" hits="0"/>
+						<line number="72" hits="0"/>
+						<line number="73" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="76" hits="0"/>
+						<line number="78" hits="0"/>
+						<line number="79" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="82" hits="0"/>
+						<line number="83" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="84,87"/>
+						<line number="84" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="83,85"/>
+						<line number="85" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="84,86"/>
+						<line number="86" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="90" hits="0"/>
+						<line number="92" hits="0"/>
+						<line number="93" hits="0"/>
+						<line number="94" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="95,100"/>
+						<line number="95" hits="0"/>
+						<line number="96" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="94,97"/>
+						<line number="97" hits="0"/>
+						<line number="98" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="96,99"/>
+						<line number="99" hits="0"/>
+						<line number="100" hits="0"/>
+						<line number="101" hits="0"/>
+					</lines>
+				</class>
+				<class name="onedrive_sync_service.py" filename="services/onedrive_sync_service.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="6" hits="0"/>
+						<line number="7" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="17" hits="0"/>
+						<line number="35" hits="0"/>
+						<line number="41" hits="0"/>
+						<line number="44" hits="0"/>
+						<line number="53" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="54,57"/>
+						<line number="54" hits="0"/>
+						<line number="57" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="58,61"/>
+						<line number="58" hits="0"/>
+						<line number="61" hits="0"/>
+						<line number="62" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="63,66"/>
+						<line number="63" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="62,64"/>
+						<line number="64" hits="0"/>
+						<line number="66" hits="0"/>
+						<line number="69" hits="0"/>
+						<line number="79" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="80,83"/>
+						<line number="80" hits="0"/>
+						<line number="81" hits="0"/>
+						<line number="83" hits="0"/>
+						<line number="85" hits="0"/>
+						<line number="93" hits="0"/>
+						<line number="94" hits="0"/>
+						<line number="95" hits="0"/>
+						<line number="105" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="106,114"/>
+						<line number="106" hits="0"/>
+						<line number="107" hits="0"/>
+						<line number="108" hits="0"/>
+						<line number="114" hits="0"/>
+						<line number="118" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="121" hits="0"/>
+						<line number="122" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="131" hits="0"/>
+						<line number="133" hits="0"/>
+						<line number="134" hits="0"/>
+						<line number="135" hits="0"/>
+						<line number="145" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="146,150"/>
+						<line number="146" hits="0"/>
+						<line number="147" hits="0"/>
+						<line number="148" hits="0"/>
+						<line number="150" hits="0"/>
+						<line number="151" hits="0"/>
+						<line number="153" hits="0"/>
+						<line number="154" hits="0"/>
+						<line number="155" hits="0"/>
+					</lines>
+				</class>
 				<class name="payment_service.py" filename="services/payment_service.py" complexity="0" line-rate="0.2481" branch-rate="0">
 					<methods/>
 					<lines>
@@ -33942,7 +38630,7 @@
 						<line number="210" hits="0"/>
 					</lines>
 				</class>
-				<class name="r2_storage_service.py" filename="services/r2_storage_service.py" complexity="0" line-rate="0.1726" branch-rate="0.02">
+				<class name="r2_storage_service.py" filename="services/r2_storage_service.py" complexity="0" line-rate="0.1737" branch-rate="0.02">
 					<methods/>
 					<lines>
 						<line number="7" hits="1"/>
@@ -34000,119 +38688,118 @@
 						<line number="120" hits="0"/>
 						<line number="121" hits="0"/>
 						<line number="124" hits="0"/>
-						<line number="125" hits="0"/>
-						<line number="128" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="129,130"/>
-						<line number="129" hits="0"/>
-						<line number="130" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="131,134"/>
-						<line number="131" hits="0"/>
+						<line number="127" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="128,129"/>
+						<line number="128" hits="0"/>
+						<line number="129" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="130,133"/>
+						<line number="130" hits="0"/>
+						<line number="133" hits="0"/>
 						<line number="134" hits="0"/>
-						<line number="135" hits="0"/>
+						<line number="137" hits="0"/>
 						<line number="138" hits="0"/>
-						<line number="139" hits="0"/>
-						<line number="141" hits="0"/>
-						<line number="145" hits="0"/>
-						<line number="147" hits="0"/>
-						<line number="150" hits="0"/>
-						<line number="151" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="152,155"/>
-						<line number="152" hits="0"/>
+						<line number="140" hits="0"/>
+						<line number="144" hits="0"/>
+						<line number="146" hits="0"/>
+						<line number="149" hits="0"/>
+						<line number="150" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="151,154"/>
+						<line number="151" hits="0"/>
+						<line number="154" hits="0"/>
 						<line number="155" hits="0"/>
 						<line number="156" hits="0"/>
-						<line number="157" hits="0"/>
+						<line number="158" hits="0"/>
 						<line number="159" hits="0"/>
 						<line number="160" hits="0"/>
 						<line number="161" hits="0"/>
 						<line number="162" hits="0"/>
-						<line number="163" hits="0"/>
-						<line number="165" hits="1"/>
-						<line number="167" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="168,170"/>
-						<line number="168" hits="0"/>
+						<line number="164" hits="1"/>
+						<line number="166" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="167,169"/>
+						<line number="167" hits="0"/>
+						<line number="169" hits="0"/>
 						<line number="170" hits="0"/>
-						<line number="171" hits="0"/>
+						<line number="174" hits="0"/>
 						<line number="175" hits="0"/>
-						<line number="176" hits="0"/>
-						<line number="181" hits="0"/>
-						<line number="190" hits="0"/>
-						<line number="192" hits="1"/>
+						<line number="180" hits="0"/>
+						<line number="189" hits="0"/>
+						<line number="191" hits="1"/>
+						<line number="193" hits="0"/>
 						<line number="194" hits="0"/>
 						<line number="195" hits="0"/>
-						<line number="196" hits="0"/>
-						<line number="199" hits="0"/>
-						<line number="201" hits="0"/>
-						<line number="203" hits="1"/>
+						<line number="198" hits="0"/>
+						<line number="200" hits="0"/>
+						<line number="202" hits="1"/>
+						<line number="204" hits="0"/>
 						<line number="205" hits="0"/>
-						<line number="206" hits="0"/>
-						<line number="215" hits="0"/>
-						<line number="217" hits="1"/>
-						<line number="238" hits="0"/>
-						<line number="240" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="241,244"/>
+						<line number="214" hits="0"/>
+						<line number="216" hits="1"/>
+						<line number="237" hits="0"/>
+						<line number="239" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="240,243"/>
+						<line number="240" hits="0"/>
 						<line number="241" hits="0"/>
-						<line number="242" hits="0"/>
-						<line number="244" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="245,248"/>
+						<line number="243" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="244,247"/>
+						<line number="244" hits="0"/>
 						<line number="245" hits="0"/>
-						<line number="246" hits="0"/>
+						<line number="247" hits="0"/>
 						<line number="248" hits="0"/>
-						<line number="249" hits="0"/>
-						<line number="251" hits="0"/>
-						<line number="253" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="254,257"/>
-						<line number="254" hits="0"/>
-						<line number="257" hits="0"/>
-						<line number="265" hits="0"/>
-						<line number="266" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="267,270"/>
-						<line number="267" hits="0"/>
+						<line number="250" hits="0"/>
+						<line number="252" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="253,256"/>
+						<line number="253" hits="0"/>
+						<line number="256" hits="0"/>
+						<line number="264" hits="0"/>
+						<line number="265" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="266,269"/>
+						<line number="266" hits="0"/>
+						<line number="269" hits="0"/>
 						<line number="270" hits="0"/>
 						<line number="271" hits="0"/>
-						<line number="272" hits="0"/>
-						<line number="274" hits="0"/>
-						<line number="279" hits="0"/>
+						<line number="273" hits="0"/>
+						<line number="278" hits="0"/>
+						<line number="280" hits="0"/>
 						<line number="281" hits="0"/>
-						<line number="282" hits="0"/>
-						<line number="285" hits="0"/>
-						<line number="287" hits="1"/>
+						<line number="284" hits="0"/>
+						<line number="286" hits="1"/>
+						<line number="305" hits="0"/>
 						<line number="306" hits="0"/>
 						<line number="307" hits="0"/>
 						<line number="308" hits="0"/>
-						<line number="309" hits="0"/>
-						<line number="311" hits="0"/>
-						<line number="314" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="315,319"/>
+						<line number="310" hits="0"/>
+						<line number="313" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="314,318"/>
+						<line number="314" hits="0"/>
 						<line number="315" hits="0"/>
-						<line number="316" hits="0"/>
-						<line number="319" hits="0"/>
-						<line number="321" hits="0"/>
+						<line number="318" hits="0"/>
+						<line number="320" hits="0"/>
+						<line number="328" hits="0"/>
 						<line number="329" hits="0"/>
-						<line number="330" hits="0"/>
-						<line number="333" hits="0"/>
-						<line number="335" hits="1"/>
-						<line number="349" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="350,353"/>
-						<line number="350" hits="0"/>
-						<line number="353" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="354,357"/>
-						<line number="354" hits="0"/>
-						<line number="357" hits="0"/>
-						<line number="360" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="362,364"/>
+						<line number="332" hits="0"/>
+						<line number="334" hits="1"/>
+						<line number="348" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="349,352"/>
+						<line number="349" hits="0"/>
+						<line number="352" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="353,356"/>
+						<line number="353" hits="0"/>
+						<line number="356" hits="0"/>
+						<line number="359" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="361,363"/>
+						<line number="361" hits="0"/>
 						<line number="362" hits="0"/>
-						<line number="363" hits="0"/>
-						<line number="364" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="366,369"/>
-						<line number="366" hits="0"/>
-						<line number="369" hits="0"/>
-						<line number="372" hits="0"/>
-						<line number="374" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="375,381"/>
-						<line number="375" hits="0"/>
-						<line number="378" hits="0"/>
+						<line number="363" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="365,368"/>
+						<line number="365" hits="0"/>
+						<line number="368" hits="0"/>
+						<line number="371" hits="0"/>
+						<line number="373" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="374,380"/>
+						<line number="374" hits="0"/>
+						<line number="377" hits="0"/>
+						<line number="380" hits="0"/>
 						<line number="381" hits="0"/>
-						<line number="382" hits="0"/>
-						<line number="384" hits="1"/>
-						<line number="395" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="396,398"/>
-						<line number="396" hits="0"/>
-						<line number="398" hits="0"/>
-						<line number="399" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="400,403"/>
+						<line number="383" hits="1"/>
+						<line number="394" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="395,397"/>
+						<line number="395" hits="0"/>
+						<line number="397" hits="0"/>
+						<line number="398" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="399,402"/>
+						<line number="399" hits="0"/>
 						<line number="400" hits="0"/>
-						<line number="401" hits="0"/>
-						<line number="403" hits="0"/>
-						<line number="407" hits="1"/>
-						<line number="410" hits="1"/>
-						<line number="414" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="415,418"/>
+						<line number="402" hits="0"/>
+						<line number="406" hits="1"/>
+						<line number="409" hits="1"/>
+						<line number="413" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="414,417"/>
+						<line number="414" hits="0"/>
 						<line number="415" hits="0"/>
-						<line number="416" hits="0"/>
-						<line number="418" hits="0"/>
+						<line number="417" hits="0"/>
 					</lines>
 				</class>
 				<class name="rate_limit_service.py" filename="services/rate_limit_service.py" complexity="0" line-rate="0.2676" branch-rate="0">
@@ -37467,46 +42154,204 @@
 				</class>
 			</classes>
 		</package>
-		<package name="tasks" line-rate="0.1149" branch-rate="0.007418" complexity="0">
+		<package name="tasks" line-rate="0.09001" branch-rate="0.01605" complexity="0">
 			<classes>
 				<class name="__init__.py" filename="tasks/__init__.py" complexity="0" line-rate="1" branch-rate="1">
 					<methods/>
 					<lines>
 						<line number="5" hits="1"/>
 						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
 						<line number="14" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="22" hits="1"/>
+						<line number="24" hits="1"/>
 					</lines>
 				</class>
-				<class name="google_drive_tasks.py" filename="tasks/google_drive_tasks.py" complexity="0" line-rate="0.1147" branch-rate="0.01515">
+				<class name="approval_timeout_tasks.py" filename="tasks/approval_timeout_tasks.py" complexity="0" line-rate="0.1081" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="8" hits="1"/>
-						<line number="9" hits="1"/>
-						<line number="10" hits="1"/>
-						<line number="11" hits="1"/>
-						<line number="12" hits="1"/>
 						<line number="13" hits="1"/>
+						<line number="14" hits="1"/>
 						<line number="15" hits="1"/>
-						<line number="16" hits="1"/>
-						<line number="18" hits="1"/>
+						<line number="17" hits="1"/>
 						<line number="19" hits="1"/>
 						<line number="21" hits="1"/>
 						<line number="24" hits="1"/>
-						<line number="26" hits="1"/>
-						<line number="28" hits="1"/>
-						<line number="31" hits="1"/>
-						<line number="33" hits="1"/>
-						<line number="34" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="36"/>
-						<line number="35" hits="1"/>
+						<line number="30" hits="1"/>
+						<line number="38" hits="0"/>
+						<line number="39" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="41" hits="0"/>
+						<line number="42" hits="0"/>
+						<line number="50" hits="1"/>
+						<line number="54" hits="0"/>
+						<line number="57" hits="0"/>
+						<line number="59" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="60,66"/>
+						<line number="60" hits="0"/>
+						<line number="66" hits="0"/>
+						<line number="74" hits="1"/>
+						<line number="83" hits="0"/>
+						<line number="84" hits="0"/>
+						<line number="86" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="88" hits="0"/>
+						<line number="89" hits="0"/>
+						<line number="91" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="92,94"/>
+						<line number="92" hits="0"/>
+						<line number="94" hits="0"/>
+						<line number="96" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="98" hits="0"/>
+						<line number="106" hits="1"/>
+						<line number="116" hits="0"/>
+						<line number="118" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="121" hits="0"/>
+						<line number="123" hits="0"/>
+						<line number="124" hits="0"/>
+						<line number="125" hits="0"/>
+						<line number="126" hits="0"/>
+						<line number="127" hits="0"/>
+						<line number="129" hits="0"/>
+						<line number="130" hits="0"/>
+						<line number="132" hits="0"/>
+						<line number="133" hits="0"/>
+						<line number="135" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="136,138"/>
+						<line number="136" hits="0"/>
+						<line number="138" hits="0"/>
+						<line number="140" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="141,176"/>
+						<line number="141" hits="0"/>
+						<line number="142" hits="0"/>
+						<line number="143" hits="0"/>
+						<line number="145" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="146,152"/>
+						<line number="146" hits="0"/>
+						<line number="150" hits="0"/>
+						<line number="152" hits="0"/>
+						<line number="153" hits="0"/>
+						<line number="159" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="160,164"/>
+						<line number="160" hits="0"/>
+						<line number="164" hits="0"/>
+						<line number="166" hits="0"/>
+						<line number="167" hits="0"/>
+						<line number="173" hits="0"/>
+						<line number="174" hits="0"/>
+						<line number="176" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="177,179"/>
+						<line number="177" hits="0"/>
+						<line number="179" hits="0"/>
+						<line number="182" hits="1"/>
+						<line number="205" hits="0"/>
+						<line number="206" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="207,213"/>
+						<line number="207" hits="0"/>
+						<line number="211" hits="0"/>
+						<line number="213" hits="0"/>
+						<line number="215" hits="0"/>
+						<line number="216" hits="0"/>
+						<line number="217" hits="0"/>
+						<line number="219" hits="0"/>
+						<line number="220" hits="0"/>
+						<line number="221" hits="0"/>
+						<line number="224" hits="0"/>
+						<line number="230" hits="0"/>
+						<line number="232" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="233,240"/>
+						<line number="233" hits="0"/>
+						<line number="238" hits="0"/>
+						<line number="240" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="241,249"/>
+						<line number="241" hits="0"/>
+						<line number="246" hits="0"/>
+						<line number="249" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="250,256"/>
+						<line number="250" hits="0"/>
+						<line number="254" hits="0"/>
+						<line number="256" hits="0"/>
+						<line number="259" hits="0"/>
+						<line number="261" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="262,270"/>
+						<line number="262" hits="0"/>
+						<line number="267" hits="0"/>
+						<line number="270" hits="0"/>
+						<line number="272" hits="0"/>
+						<line number="273" hits="0"/>
+						<line number="276" hits="0"/>
+						<line number="277" hits="0"/>
+						<line number="289" hits="0"/>
+						<line number="291" hits="0"/>
+						<line number="294" hits="0"/>
+						<line number="301" hits="0"/>
+						<line number="302" hits="0"/>
+						<line number="304" hits="0"/>
+						<line number="312" hits="0"/>
+						<line number="314" hits="0"/>
+						<line number="315" hits="0"/>
+						<line number="321" hits="0"/>
+					</lines>
+				</class>
+				<class name="backfill_allowed_scopes.py" filename="tasks/backfill_allowed_scopes.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="13" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="17" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="48" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="49,52"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="57" hits="0"/>
+						<line number="61" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="65" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="66,68"/>
+						<line number="66" hits="0"/>
+						<line number="68" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="69,82"/>
+						<line number="69" hits="0"/>
+						<line number="70" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="68,71"/>
+						<line number="71" hits="0"/>
+						<line number="73" hits="0"/>
+						<line number="80" hits="0"/>
+						<line number="82" hits="0"/>
+						<line number="84" hits="0"/>
+						<line number="92" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="55,93"/>
+						<line number="93" hits="0"/>
+						<line number="95" hits="0"/>
+						<line number="102" hits="0"/>
+					</lines>
+				</class>
+				<class name="google_drive_tasks.py" filename="tasks/google_drive_tasks.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="8" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="10" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="19" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="24" hits="0"/>
+						<line number="26" hits="0"/>
+						<line number="28" hits="0"/>
+						<line number="31" hits="0"/>
+						<line number="33" hits="0"/>
+						<line number="34" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="35,36"/>
+						<line number="35" hits="0"/>
 						<line number="36" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="37,38"/>
 						<line number="37" hits="0"/>
 						<line number="38" hits="0"/>
-						<line number="41" hits="1"/>
-						<line number="42" hits="1"/>
-						<line number="45" hits="1"/>
-						<line number="46" hits="1"/>
-						<line number="49" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="52"/>
-						<line number="50" hits="1"/>
+						<line number="41" hits="0"/>
+						<line number="42" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="49" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="50,52"/>
+						<line number="50" hits="0"/>
 						<line number="51" hits="0"/>
 						<line number="52" hits="0"/>
 						<line number="53" hits="0"/>
@@ -37516,11 +42361,11 @@
 						<line number="57" hits="0"/>
 						<line number="58" hits="0"/>
 						<line number="60" hits="0"/>
-						<line number="63" hits="1"/>
-						<line number="64" hits="1"/>
-						<line number="75" hits="1"/>
-						<line number="77" hits="1"/>
-						<line number="78" hits="1"/>
+						<line number="63" hits="0"/>
+						<line number="64" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="77" hits="0"/>
+						<line number="78" hits="0"/>
 						<line number="80" hits="0"/>
 						<line number="89" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="90,101"/>
 						<line number="90" hits="0"/>
@@ -37539,10 +42384,10 @@
 						<line number="116" hits="0"/>
 						<line number="118" hits="0"/>
 						<line number="119" hits="0"/>
-						<line number="125" hits="1"/>
-						<line number="126" hits="1"/>
-						<line number="127" hits="1"/>
-						<line number="130" hits="1"/>
+						<line number="125" hits="0"/>
+						<line number="126" hits="0"/>
+						<line number="127" hits="0"/>
+						<line number="130" hits="0"/>
 						<line number="133" hits="0"/>
 						<line number="135" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="137,149"/>
 						<line number="137" hits="0"/>
@@ -37554,7 +42399,7 @@
 						<line number="159" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="160,162"/>
 						<line number="160" hits="0"/>
 						<line number="162" hits="0"/>
-						<line number="165" hits="1"/>
+						<line number="165" hits="0"/>
 						<line number="167" hits="0"/>
 						<line number="168" hits="0"/>
 						<line number="169" hits="0"/>
@@ -37573,7 +42418,7 @@
 						<line number="189" hits="0"/>
 						<line number="190" hits="0"/>
 						<line number="191" hits="0"/>
-						<line number="194" hits="1"/>
+						<line number="194" hits="0"/>
 						<line number="196" hits="0"/>
 						<line number="197" hits="0"/>
 						<line number="198" hits="0"/>
@@ -37599,7 +42444,7 @@
 						<line number="226" hits="0"/>
 						<line number="227" hits="0"/>
 						<line number="228" hits="0"/>
-						<line number="234" hits="1"/>
+						<line number="234" hits="0"/>
 						<line number="236" hits="0"/>
 						<line number="237" hits="0"/>
 						<line number="238" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="239,244"/>
@@ -37609,13 +42454,13 @@
 						<line number="242" hits="0"/>
 						<line number="243" hits="0"/>
 						<line number="244" hits="0"/>
-						<line number="247" hits="1"/>
+						<line number="247" hits="0"/>
 						<line number="249" hits="0"/>
 						<line number="250" hits="0"/>
 						<line number="252" hits="0"/>
 						<line number="253" hits="0"/>
 						<line number="254" hits="0"/>
-						<line number="260" hits="1"/>
+						<line number="260" hits="0"/>
 						<line number="271" hits="0"/>
 						<line number="272" hits="0"/>
 						<line number="273" hits="0"/>
@@ -37718,164 +42563,162 @@
 						<line number="468" hits="0"/>
 						<line number="469" hits="0"/>
 						<line number="470" hits="0"/>
-						<line number="480" hits="0"/>
-						<line number="482" hits="0"/>
-						<line number="487" hits="0"/>
-						<line number="494" hits="0"/>
+						<line number="481" hits="0"/>
+						<line number="483" hits="0"/>
+						<line number="488" hits="0"/>
 						<line number="495" hits="0"/>
 						<line number="496" hits="0"/>
-						<line number="499" hits="0"/>
-						<line number="501" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="502,515"/>
-						<line number="502" hits="0"/>
+						<line number="497" hits="0"/>
+						<line number="500" hits="0"/>
+						<line number="502" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="503,516"/>
 						<line number="503" hits="0"/>
 						<line number="504" hits="0"/>
 						<line number="505" hits="0"/>
 						<line number="506" hits="0"/>
-						<line number="507" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="508,513"/>
-						<line number="508" hits="0"/>
+						<line number="507" hits="0"/>
+						<line number="508" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="509,514"/>
 						<line number="509" hits="0"/>
 						<line number="510" hits="0"/>
 						<line number="511" hits="0"/>
 						<line number="512" hits="0"/>
 						<line number="513" hits="0"/>
-						<line number="515" hits="0"/>
+						<line number="514" hits="0"/>
 						<line number="516" hits="0"/>
 						<line number="517" hits="0"/>
 						<line number="518" hits="0"/>
 						<line number="519" hits="0"/>
 						<line number="520" hits="0"/>
-						<line number="523" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="524,535"/>
-						<line number="524" hits="0"/>
+						<line number="521" hits="0"/>
+						<line number="524" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="525,537"/>
 						<line number="525" hits="0"/>
-						<line number="532" hits="0"/>
-						<line number="533" hits="0"/>
+						<line number="526" hits="0"/>
+						<line number="534" hits="0"/>
 						<line number="535" hits="0"/>
 						<line number="537" hits="0"/>
-						<line number="544" hits="1"/>
+						<line number="539" hits="0"/>
 						<line number="546" hits="0"/>
 						<line number="548" hits="0"/>
-						<line number="549" hits="0"/>
-						<line number="552" hits="1"/>
-						<line number="553" hits="1"/>
+						<line number="550" hits="0"/>
+						<line number="551" hits="0"/>
+						<line number="554" hits="0"/>
 						<line number="555" hits="0"/>
-						<line number="556" hits="0"/>
 						<line number="557" hits="0"/>
 						<line number="558" hits="0"/>
 						<line number="559" hits="0"/>
 						<line number="560" hits="0"/>
-						<line number="566" hits="1"/>
-						<line number="567" hits="1"/>
-						<line number="573" hits="0"/>
-						<line number="574" hits="0"/>
+						<line number="561" hits="0"/>
+						<line number="562" hits="0"/>
+						<line number="568" hits="0"/>
+						<line number="569" hits="0"/>
 						<line number="575" hits="0"/>
 						<line number="576" hits="0"/>
 						<line number="577" hits="0"/>
 						<line number="578" hits="0"/>
-						<line number="581" hits="1"/>
-						<line number="582" hits="1"/>
-						<line number="587" hits="0"/>
-						<line number="588" hits="0"/>
+						<line number="579" hits="0"/>
+						<line number="580" hits="0"/>
+						<line number="583" hits="0"/>
+						<line number="584" hits="0"/>
 						<line number="589" hits="0"/>
 						<line number="590" hits="0"/>
 						<line number="591" hits="0"/>
 						<line number="592" hits="0"/>
-						<line number="595" hits="1"/>
-						<line number="596" hits="1"/>
-						<line number="601" hits="0"/>
-						<line number="602" hits="0"/>
+						<line number="593" hits="0"/>
+						<line number="594" hits="0"/>
+						<line number="597" hits="0"/>
+						<line number="598" hits="0"/>
 						<line number="603" hits="0"/>
 						<line number="604" hits="0"/>
 						<line number="605" hits="0"/>
 						<line number="606" hits="0"/>
-						<line number="612" hits="1"/>
+						<line number="607" hits="0"/>
+						<line number="608" hits="0"/>
 						<line number="614" hits="0"/>
-						<line number="615" hits="0"/>
 						<line number="616" hits="0"/>
+						<line number="617" hits="0"/>
 						<line number="618" hits="0"/>
 						<line number="620" hits="0"/>
-						<line number="629" hits="0"/>
-						<line number="630" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="631,633"/>
+						<line number="622" hits="0"/>
 						<line number="631" hits="0"/>
+						<line number="632" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="633,635"/>
 						<line number="633" hits="0"/>
-						<line number="634" hits="0"/>
 						<line number="635" hits="0"/>
 						<line number="636" hits="0"/>
 						<line number="637" hits="0"/>
 						<line number="638" hits="0"/>
-						<line number="640" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="641,644"/>
-						<line number="641" hits="0"/>
-						<line number="644" hits="0"/>
-						<line number="645" hits="0"/>
+						<line number="639" hits="0"/>
+						<line number="640" hits="0"/>
+						<line number="642" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="643,646"/>
+						<line number="643" hits="0"/>
 						<line number="646" hits="0"/>
 						<line number="647" hits="0"/>
 						<line number="648" hits="0"/>
-						<line number="656" hits="0"/>
-						<line number="657" hits="0"/>
-						<line number="660" hits="0"/>
-						<line number="661" hits="0"/>
+						<line number="649" hits="0"/>
+						<line number="650" hits="0"/>
+						<line number="658" hits="0"/>
+						<line number="659" hits="0"/>
+						<line number="662" hits="0"/>
 						<line number="663" hits="0"/>
-						<line number="664" hits="0"/>
-						<line number="667" hits="0"/>
-						<line number="675" hits="0"/>
-						<line number="676" hits="0"/>
+						<line number="665" hits="0"/>
+						<line number="666" hits="0"/>
+						<line number="669" hits="0"/>
+						<line number="677" hits="0"/>
 						<line number="678" hits="0"/>
-						<line number="679" hits="0"/>
-						<line number="685" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="686,688"/>
-						<line number="686" hits="0"/>
+						<line number="680" hits="0"/>
+						<line number="681" hits="0"/>
+						<line number="687" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="688,690"/>
 						<line number="688" hits="0"/>
-						<line number="689" hits="0"/>
 						<line number="690" hits="0"/>
 						<line number="691" hits="0"/>
-						<line number="692" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="678,693"/>
+						<line number="692" hits="0"/>
 						<line number="693" hits="0"/>
-						<line number="696" hits="0"/>
-						<line number="699" hits="0"/>
-						<line number="707" hits="0"/>
-						<line number="710" hits="0"/>
-						<line number="711" hits="0"/>
-						<line number="713" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="714,731"/>
-						<line number="714" hits="0"/>
-						<line number="715" hits="0"/>
+						<line number="694" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="680,695"/>
+						<line number="695" hits="0"/>
+						<line number="698" hits="0"/>
+						<line number="701" hits="0"/>
+						<line number="709" hits="0"/>
+						<line number="712" hits="0"/>
+						<line number="713" hits="0"/>
+						<line number="715" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="716,733"/>
 						<line number="716" hits="0"/>
 						<line number="717" hits="0"/>
 						<line number="718" hits="0"/>
 						<line number="719" hits="0"/>
-						<line number="722" hits="0"/>
-						<line number="723" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="713,724"/>
+						<line number="720" hits="0"/>
+						<line number="721" hits="0"/>
 						<line number="724" hits="0"/>
-						<line number="728" hits="0"/>
-						<line number="731" hits="0"/>
-						<line number="732" hits="0"/>
-						<line number="733" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="734,737"/>
+						<line number="725" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="715,726"/>
+						<line number="726" hits="0"/>
+						<line number="730" hits="0"/>
+						<line number="733" hits="0"/>
 						<line number="734" hits="0"/>
-						<line number="737" hits="0"/>
-						<line number="738" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="739,763"/>
+						<line number="735" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="736,739"/>
+						<line number="736" hits="0"/>
 						<line number="739" hits="0"/>
-						<line number="740" hits="0"/>
+						<line number="740" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="741,765"/>
 						<line number="741" hits="0"/>
 						<line number="742" hits="0"/>
-						<line number="759" hits="0"/>
-						<line number="760" hits="0"/>
-						<line number="763" hits="0"/>
-						<line number="771" hits="0"/>
+						<line number="743" hits="0"/>
+						<line number="744" hits="0"/>
+						<line number="761" hits="0"/>
+						<line number="762" hits="0"/>
+						<line number="765" hits="0"/>
 						<line number="773" hits="0"/>
-						<line number="777" hits="0"/>
-						<line number="785" hits="1"/>
+						<line number="775" hits="0"/>
+						<line number="779" hits="0"/>
 						<line number="787" hits="0"/>
-						<line number="788" hits="0"/>
 						<line number="789" hits="0"/>
 						<line number="790" hits="0"/>
+						<line number="791" hits="0"/>
 						<line number="792" hits="0"/>
-						<line number="795" hits="0"/>
-						<line number="804" hits="0"/>
-						<line number="806" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="808,826"/>
-						<line number="808" hits="0"/>
-						<line number="809" hits="0"/>
-						<line number="820" hits="0"/>
+						<line number="794" hits="0"/>
+						<line number="797" hits="0"/>
+						<line number="806" hits="0"/>
+						<line number="808" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="810,828"/>
+						<line number="810" hits="0"/>
+						<line number="811" hits="0"/>
 						<line number="822" hits="0"/>
-						<line number="823" hits="0"/>
-						<line number="826" hits="0"/>
-						<line number="827" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="828,829"/>
+						<line number="824" hits="0"/>
+						<line number="825" hits="0"/>
 						<line number="828" hits="0"/>
 						<line number="829" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="830,831"/>
 						<line number="830" hits="0"/>
@@ -37883,195 +42726,195 @@
 						<line number="832" hits="0"/>
 						<line number="833" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="834,835"/>
 						<line number="834" hits="0"/>
-						<line number="835" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="836,838"/>
+						<line number="835" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="836,837"/>
 						<line number="836" hits="0"/>
+						<line number="837" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="838,840"/>
 						<line number="838" hits="0"/>
-						<line number="846" hits="0"/>
-						<line number="863" hits="0"/>
-						<line number="864" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,865"/>
+						<line number="840" hits="0"/>
+						<line number="848" hits="0"/>
 						<line number="865" hits="0"/>
-						<line number="866" hits="0"/>
-						<line number="869" hits="1"/>
+						<line number="866" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,867"/>
+						<line number="867" hits="0"/>
+						<line number="868" hits="0"/>
 						<line number="871" hits="0"/>
-						<line number="872" hits="0"/>
 						<line number="873" hits="0"/>
 						<line number="874" hits="0"/>
-						<line number="877" hits="1"/>
+						<line number="875" hits="0"/>
+						<line number="876" hits="0"/>
 						<line number="879" hits="0"/>
-						<line number="880" hits="0"/>
 						<line number="881" hits="0"/>
+						<line number="882" hits="0"/>
 						<line number="883" hits="0"/>
 						<line number="885" hits="0"/>
-						<line number="894" hits="0"/>
-						<line number="895" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="896,898"/>
+						<line number="887" hits="0"/>
 						<line number="896" hits="0"/>
+						<line number="897" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="898,900"/>
 						<line number="898" hits="0"/>
-						<line number="899" hits="0"/>
-						<line number="900" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="901,903"/>
+						<line number="900" hits="0"/>
 						<line number="901" hits="0"/>
+						<line number="902" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="903,905"/>
 						<line number="903" hits="0"/>
-						<line number="911" hits="0"/>
-						<line number="912" hits="0"/>
+						<line number="905" hits="0"/>
 						<line number="913" hits="0"/>
 						<line number="914" hits="0"/>
 						<line number="915" hits="0"/>
-						<line number="923" hits="0"/>
-						<line number="924" hits="0"/>
+						<line number="916" hits="0"/>
+						<line number="917" hits="0"/>
+						<line number="925" hits="0"/>
 						<line number="926" hits="0"/>
-						<line number="927" hits="0"/>
+						<line number="928" hits="0"/>
 						<line number="929" hits="0"/>
-						<line number="930" hits="0"/>
+						<line number="931" hits="0"/>
 						<line number="932" hits="0"/>
-						<line number="933" hits="0"/>
+						<line number="934" hits="0"/>
 						<line number="935" hits="0"/>
-						<line number="936" hits="0"/>
-						<line number="942" hits="0"/>
-						<line number="944" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="945,969"/>
-						<line number="945" hits="0"/>
-						<line number="946" hits="0"/>
-						<line number="948" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="950,963"/>
-						<line number="950" hits="0"/>
-						<line number="960" hits="0"/>
-						<line number="961" hits="0"/>
+						<line number="937" hits="0"/>
+						<line number="938" hits="0"/>
+						<line number="944" hits="0"/>
+						<line number="946" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="947,971"/>
+						<line number="947" hits="0"/>
+						<line number="948" hits="0"/>
+						<line number="950" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="952,965"/>
+						<line number="952" hits="0"/>
+						<line number="962" hits="0"/>
 						<line number="963" hits="0"/>
-						<line number="964" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="944,965"/>
 						<line number="965" hits="0"/>
-						<line number="966" hits="0"/>
-						<line number="969" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="970,972"/>
-						<line number="970" hits="0"/>
-						<line number="971" hits="0"/>
-						<line number="972" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="973,975"/>
+						<line number="966" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="946,967"/>
+						<line number="967" hits="0"/>
+						<line number="968" hits="0"/>
+						<line number="971" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="972,974"/>
+						<line number="972" hits="0"/>
 						<line number="973" hits="0"/>
+						<line number="974" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="975,977"/>
 						<line number="975" hits="0"/>
-						<line number="978" hits="0"/>
-						<line number="986" hits="0"/>
+						<line number="977" hits="0"/>
+						<line number="980" hits="0"/>
 						<line number="988" hits="0"/>
-						<line number="992" hits="0"/>
-						<line number="995" hits="1"/>
-						<line number="997" hits="1"/>
-						<line number="998" hits="1"/>
-						<line number="999" hits="1"/>
-						<line number="1001" hits="1"/>
-						<line number="1002" hits="1"/>
-						<line number="1004" hits="1"/>
-						<line number="1006" hits="1"/>
-						<line number="1016" hits="0"/>
-						<line number="1018" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1019,1090"/>
-						<line number="1019" hits="0"/>
+						<line number="990" hits="0"/>
+						<line number="994" hits="0"/>
+						<line number="997" hits="0"/>
+						<line number="999" hits="0"/>
+						<line number="1000" hits="0"/>
+						<line number="1001" hits="0"/>
+						<line number="1003" hits="0"/>
+						<line number="1004" hits="0"/>
+						<line number="1006" hits="0"/>
+						<line number="1008" hits="0"/>
+						<line number="1018" hits="0"/>
+						<line number="1020" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1021,1092"/>
 						<line number="1021" hits="0"/>
-						<line number="1022" hits="0"/>
 						<line number="1023" hits="0"/>
-						<line number="1026" hits="0"/>
-						<line number="1027" hits="0"/>
+						<line number="1024" hits="0"/>
+						<line number="1025" hits="0"/>
+						<line number="1028" hits="0"/>
 						<line number="1029" hits="0"/>
-						<line number="1030" hits="0"/>
+						<line number="1031" hits="0"/>
 						<line number="1032" hits="0"/>
-						<line number="1033" hits="0"/>
-						<line number="1037" hits="0"/>
-						<line number="1038" hits="0"/>
-						<line number="1041" hits="0"/>
-						<line number="1042" hits="0"/>
+						<line number="1034" hits="0"/>
+						<line number="1035" hits="0"/>
+						<line number="1039" hits="0"/>
+						<line number="1040" hits="0"/>
+						<line number="1043" hits="0"/>
 						<line number="1044" hits="0"/>
-						<line number="1061" hits="0"/>
-						<line number="1062" hits="0"/>
+						<line number="1046" hits="0"/>
+						<line number="1063" hits="0"/>
 						<line number="1064" hits="0"/>
 						<line number="1066" hits="0"/>
-						<line number="1074" hits="0"/>
-						<line number="1082" hits="0"/>
-						<line number="1083" hits="0"/>
+						<line number="1068" hits="0"/>
+						<line number="1076" hits="0"/>
 						<line number="1084" hits="0"/>
+						<line number="1085" hits="0"/>
 						<line number="1086" hits="0"/>
-						<line number="1087" hits="0"/>
 						<line number="1088" hits="0"/>
-						<line number="1090" hits="1"/>
-						<line number="1091" hits="1"/>
-						<line number="1094" hits="1"/>
+						<line number="1089" hits="0"/>
+						<line number="1090" hits="0"/>
+						<line number="1092" hits="0"/>
+						<line number="1093" hits="0"/>
 						<line number="1096" hits="0"/>
-						<line number="1097" hits="0"/>
 						<line number="1098" hits="0"/>
+						<line number="1099" hits="0"/>
 						<line number="1100" hits="0"/>
-						<line number="1101" hits="0"/>
-						<line number="1109" hits="0"/>
-						<line number="1110" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1111,1113"/>
+						<line number="1102" hits="0"/>
+						<line number="1103" hits="0"/>
 						<line number="1111" hits="0"/>
+						<line number="1112" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1113,1115"/>
 						<line number="1113" hits="0"/>
-						<line number="1120" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1121,1123"/>
-						<line number="1121" hits="0"/>
+						<line number="1115" hits="0"/>
+						<line number="1122" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1123,1125"/>
 						<line number="1123" hits="0"/>
-						<line number="1124" hits="0"/>
+						<line number="1125" hits="0"/>
 						<line number="1126" hits="0"/>
-						<line number="1127" hits="0"/>
+						<line number="1128" hits="0"/>
 						<line number="1129" hits="0"/>
-						<line number="1130" hits="0"/>
+						<line number="1131" hits="0"/>
 						<line number="1132" hits="0"/>
-						<line number="1133" hits="0"/>
 						<line number="1134" hits="0"/>
+						<line number="1135" hits="0"/>
 						<line number="1136" hits="0"/>
-						<line number="1137" hits="0"/>
-						<line number="1142" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1143,1144"/>
-						<line number="1143" hits="0"/>
-						<line number="1144" hits="0"/>
+						<line number="1138" hits="0"/>
+						<line number="1139" hits="0"/>
+						<line number="1144" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1145,1146"/>
 						<line number="1145" hits="0"/>
-						<line number="1146" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1147,1150"/>
-						<line number="1147" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1146,1148"/>
-						<line number="1148" hits="0"/>
-						<line number="1149" hits="0"/>
+						<line number="1146" hits="0"/>
+						<line number="1147" hits="0"/>
+						<line number="1148" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1149,1152"/>
+						<line number="1149" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1148,1150"/>
 						<line number="1150" hits="0"/>
-						<line number="1151" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1136,1152"/>
+						<line number="1151" hits="0"/>
 						<line number="1152" hits="0"/>
-						<line number="1155" hits="0"/>
-						<line number="1156" hits="0"/>
+						<line number="1153" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1138,1154"/>
+						<line number="1154" hits="0"/>
 						<line number="1157" hits="0"/>
+						<line number="1158" hits="0"/>
 						<line number="1159" hits="0"/>
-						<line number="1169" hits="1"/>
-						<line number="1170" hits="1"/>
-						<line number="1177" hits="0"/>
-						<line number="1178" hits="0"/>
+						<line number="1161" hits="0"/>
+						<line number="1171" hits="0"/>
+						<line number="1172" hits="0"/>
 						<line number="1179" hits="0"/>
 						<line number="1180" hits="0"/>
 						<line number="1181" hits="0"/>
 						<line number="1182" hits="0"/>
-						<line number="1185" hits="1"/>
-						<line number="1187" hits="1"/>
-						<line number="1189" hits="1"/>
-						<line number="1190" hits="1"/>
-						<line number="1192" hits="1"/>
-						<line number="1193" hits="1"/>
-						<line number="1202" hits="0"/>
-						<line number="1204" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1205,1220"/>
-						<line number="1205" hits="0"/>
-						<line number="1206" hits="0"/>
+						<line number="1183" hits="0"/>
+						<line number="1184" hits="0"/>
+						<line number="1187" hits="0"/>
+						<line number="1189" hits="0"/>
+						<line number="1191" hits="0"/>
+						<line number="1192" hits="0"/>
+						<line number="1194" hits="0"/>
+						<line number="1195" hits="0"/>
+						<line number="1204" hits="0"/>
+						<line number="1206" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1207,1222"/>
 						<line number="1207" hits="0"/>
-						<line number="1208" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1209,1211"/>
+						<line number="1208" hits="0"/>
 						<line number="1209" hits="0"/>
+						<line number="1210" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1211,1213"/>
 						<line number="1211" hits="0"/>
-						<line number="1214" hits="0"/>
+						<line number="1213" hits="0"/>
 						<line number="1216" hits="0"/>
-						<line number="1217" hits="0"/>
 						<line number="1218" hits="0"/>
-						<line number="1220" hits="1"/>
-						<line number="1221" hits="1"/>
-						<line number="1224" hits="1"/>
+						<line number="1219" hits="0"/>
+						<line number="1220" hits="0"/>
+						<line number="1222" hits="0"/>
+						<line number="1223" hits="0"/>
 						<line number="1226" hits="0"/>
-						<line number="1227" hits="0"/>
 						<line number="1228" hits="0"/>
+						<line number="1229" hits="0"/>
 						<line number="1230" hits="0"/>
-						<line number="1231" hits="0"/>
 						<line number="1232" hits="0"/>
 						<line number="1233" hits="0"/>
+						<line number="1234" hits="0"/>
 						<line number="1235" hits="0"/>
-						<line number="1236" hits="0"/>
+						<line number="1237" hits="0"/>
 						<line number="1238" hits="0"/>
-						<line number="1256" hits="0"/>
-						<line number="1257" hits="0"/>
+						<line number="1240" hits="0"/>
 						<line number="1258" hits="0"/>
 						<line number="1259" hits="0"/>
 						<line number="1260" hits="0"/>
 						<line number="1261" hits="0"/>
-						<line number="1267" hits="1"/>
-						<line number="1272" hits="1"/>
-						<line number="1284" hits="0"/>
-						<line number="1285" hits="0"/>
+						<line number="1262" hits="0"/>
+						<line number="1263" hits="0"/>
+						<line number="1269" hits="0"/>
+						<line number="1274" hits="0"/>
 						<line number="1286" hits="0"/>
 						<line number="1287" hits="0"/>
 						<line number="1288" hits="0"/>
@@ -38082,93 +42925,95 @@
 						<line number="1293" hits="0"/>
 						<line number="1294" hits="0"/>
 						<line number="1295" hits="0"/>
-						<line number="1298" hits="1"/>
+						<line number="1296" hits="0"/>
+						<line number="1297" hits="0"/>
 						<line number="1300" hits="0"/>
-						<line number="1301" hits="0"/>
+						<line number="1302" hits="0"/>
 						<line number="1303" hits="0"/>
-						<line number="1313" hits="0"/>
-						<line number="1314" hits="0"/>
+						<line number="1305" hits="0"/>
 						<line number="1315" hits="0"/>
 						<line number="1316" hits="0"/>
 						<line number="1317" hits="0"/>
 						<line number="1318" hits="0"/>
 						<line number="1319" hits="0"/>
-						<line number="1324" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1326,1332"/>
-						<line number="1326" hits="0"/>
-						<line number="1329" hits="0"/>
-						<line number="1332" hits="0"/>
-						<line number="1333" hits="0"/>
+						<line number="1320" hits="0"/>
+						<line number="1321" hits="0"/>
+						<line number="1326" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1328,1334"/>
+						<line number="1328" hits="0"/>
+						<line number="1331" hits="0"/>
 						<line number="1334" hits="0"/>
 						<line number="1335" hits="0"/>
 						<line number="1336" hits="0"/>
 						<line number="1337" hits="0"/>
-						<line number="1342" hits="0"/>
-						<line number="1343" hits="0"/>
-						<line number="1350" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1351,1355"/>
-						<line number="1351" hits="0"/>
-						<line number="1352" hits="0"/>
-						<line number="1355" hits="0"/>
-						<line number="1358" hits="0"/>
-						<line number="1359" hits="0"/>
+						<line number="1338" hits="0"/>
+						<line number="1339" hits="0"/>
+						<line number="1344" hits="0"/>
+						<line number="1345" hits="0"/>
+						<line number="1352" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1353,1357"/>
+						<line number="1353" hits="0"/>
+						<line number="1354" hits="0"/>
+						<line number="1357" hits="0"/>
 						<line number="1360" hits="0"/>
-						<line number="1368" hits="0"/>
-						<line number="1369" hits="0"/>
+						<line number="1361" hits="0"/>
+						<line number="1362" hits="0"/>
 						<line number="1370" hits="0"/>
 						<line number="1371" hits="0"/>
+						<line number="1372" hits="0"/>
 						<line number="1373" hits="0"/>
-						<line number="1376" hits="1"/>
+						<line number="1375" hits="0"/>
 						<line number="1378" hits="0"/>
-						<line number="1379" hits="0"/>
 						<line number="1380" hits="0"/>
-						<line number="1388" hits="0"/>
-						<line number="1390" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1391,1393"/>
-						<line number="1391" hits="0"/>
+						<line number="1381" hits="0"/>
+						<line number="1382" hits="0"/>
+						<line number="1390" hits="0"/>
+						<line number="1392" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1393,1395"/>
 						<line number="1393" hits="0"/>
-						<line number="1394" hits="0"/>
+						<line number="1395" hits="0"/>
 						<line number="1396" hits="0"/>
-						<line number="1397" hits="0"/>
-						<line number="1399" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1400,1406"/>
-						<line number="1400" hits="0"/>
-						<line number="1401" hits="0"/>
+						<line number="1398" hits="0"/>
+						<line number="1399" hits="0"/>
+						<line number="1401" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1402,1408"/>
 						<line number="1402" hits="0"/>
 						<line number="1403" hits="0"/>
 						<line number="1404" hits="0"/>
+						<line number="1405" hits="0"/>
 						<line number="1406" hits="0"/>
-						<line number="1409" hits="1"/>
+						<line number="1408" hits="0"/>
 						<line number="1411" hits="0"/>
-						<line number="1412" hits="0"/>
-						<line number="1421" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1422,1424"/>
-						<line number="1422" hits="0"/>
+						<line number="1413" hits="0"/>
+						<line number="1414" hits="0"/>
+						<line number="1423" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1424,1426"/>
 						<line number="1424" hits="0"/>
 						<line number="1426" hits="0"/>
-						<line number="1427" hits="0"/>
+						<line number="1428" hits="0"/>
 						<line number="1429" hits="0"/>
-						<line number="1430" hits="0"/>
 						<line number="1431" hits="0"/>
 						<line number="1432" hits="0"/>
 						<line number="1433" hits="0"/>
 						<line number="1434" hits="0"/>
 						<line number="1435" hits="0"/>
 						<line number="1436" hits="0"/>
-						<line number="1439" hits="1"/>
+						<line number="1437" hits="0"/>
+						<line number="1438" hits="0"/>
 						<line number="1441" hits="0"/>
 						<line number="1443" hits="0"/>
-						<line number="1444" hits="0"/>
-						<line number="1446" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1447,1450"/>
-						<line number="1447" hits="0"/>
-						<line number="1448" hits="0"/>
+						<line number="1445" hits="0"/>
+						<line number="1446" hits="0"/>
+						<line number="1448" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1449,1452"/>
+						<line number="1449" hits="0"/>
 						<line number="1450" hits="0"/>
-						<line number="1451" hits="0"/>
 						<line number="1452" hits="0"/>
-						<line number="1457" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1458,1465"/>
-						<line number="1458" hits="0"/>
-						<line number="1459" hits="0"/>
-						<line number="1463" hits="0"/>
+						<line number="1453" hits="0"/>
+						<line number="1454" hits="0"/>
+						<line number="1459" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="1460,1467"/>
+						<line number="1460" hits="0"/>
+						<line number="1461" hits="0"/>
 						<line number="1465" hits="0"/>
-						<line number="1469" hits="0"/>
-						<line number="1470" hits="0"/>
+						<line number="1467" hits="0"/>
 						<line number="1471" hits="0"/>
 						<line number="1472" hits="0"/>
+						<line number="1473" hits="0"/>
+						<line number="1474" hits="0"/>
 					</lines>
 				</class>
 				<class name="media_job_worker.py" filename="tasks/media_job_worker.py" complexity="0" line-rate="0.08054" branch-rate="0.008197">
@@ -39219,7 +44064,7 @@
 						<line number="2150" hits="0"/>
 					</lines>
 				</class>
-				<class name="media_tasks.py" filename="tasks/media_tasks.py" complexity="0" line-rate="0.1387" branch-rate="0">
+				<class name="media_tasks.py" filename="tasks/media_tasks.py" complexity="0" line-rate="0.1009" branch-rate="0">
 					<methods/>
 					<lines>
 						<line number="6" hits="1"/>
@@ -39530,16 +44375,16 @@
 						<line number="494" hits="0"/>
 						<line number="495" hits="0"/>
 						<line number="498" hits="1"/>
-						<line number="504" hits="1"/>
-						<line number="505" hits="1"/>
-						<line number="507" hits="1"/>
-						<line number="509" hits="1"/>
+						<line number="504" hits="0"/>
+						<line number="505" hits="0"/>
+						<line number="507" hits="0"/>
+						<line number="509" hits="0"/>
 						<line number="515" hits="0"/>
 						<line number="517" hits="0"/>
 						<line number="518" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="519,522"/>
 						<line number="519" hits="0"/>
 						<line number="520" hits="0"/>
-						<line number="522" hits="1"/>
+						<line number="522" hits="0"/>
 						<line number="525" hits="0"/>
 						<line number="526" hits="0"/>
 						<line number="527" hits="0"/>
@@ -39576,10 +44421,10 @@
 						<line number="579" hits="0"/>
 						<line number="580" hits="0"/>
 						<line number="583" hits="1"/>
-						<line number="587" hits="1"/>
-						<line number="588" hits="1"/>
-						<line number="590" hits="1"/>
-						<line number="592" hits="1"/>
+						<line number="587" hits="0"/>
+						<line number="588" hits="0"/>
+						<line number="590" hits="0"/>
+						<line number="592" hits="0"/>
 						<line number="601" hits="0"/>
 						<line number="603" hits="0"/>
 						<line number="604" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="606,620"/>
@@ -39593,7 +44438,7 @@
 						<line number="615" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="616,618"/>
 						<line number="616" hits="0"/>
 						<line number="618" hits="0"/>
-						<line number="620" hits="1"/>
+						<line number="620" hits="0"/>
 						<line number="622" hits="0"/>
 						<line number="623" hits="0"/>
 						<line number="625" hits="0"/>
@@ -39609,9 +44454,9 @@
 						<line number="643" hits="0"/>
 						<line number="644" hits="0"/>
 						<line number="647" hits="1"/>
-						<line number="649" hits="1"/>
-						<line number="650" hits="1"/>
-						<line number="651" hits="1"/>
+						<line number="649" hits="0"/>
+						<line number="650" hits="0"/>
+						<line number="651" hits="0"/>
 						<line number="652" hits="0"/>
 						<line number="653" hits="0"/>
 						<line number="654" hits="0"/>
@@ -39644,9 +44489,9 @@
 						<line number="690" hits="0"/>
 						<line number="691" hits="0"/>
 						<line number="694" hits="1"/>
-						<line number="696" hits="1"/>
-						<line number="697" hits="1"/>
-						<line number="698" hits="1"/>
+						<line number="696" hits="0"/>
+						<line number="697" hits="0"/>
+						<line number="698" hits="0"/>
 						<line number="699" hits="0"/>
 						<line number="700" hits="0"/>
 						<line number="701" hits="0"/>
@@ -39695,11 +44540,11 @@
 						<line number="807" hits="0"/>
 						<line number="808" hits="0"/>
 						<line number="811" hits="1"/>
-						<line number="816" hits="1"/>
-						<line number="817" hits="1"/>
-						<line number="818" hits="1"/>
-						<line number="822" hits="1"/>
-						<line number="824" hits="1"/>
+						<line number="816" hits="0"/>
+						<line number="817" hits="0"/>
+						<line number="818" hits="0"/>
+						<line number="822" hits="0"/>
+						<line number="824" hits="0"/>
 						<line number="831" hits="0"/>
 						<line number="833" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="834,837"/>
 						<line number="834" hits="0"/>
@@ -39779,30 +44624,495 @@
 						<line number="1004" hits="0"/>
 					</lines>
 				</class>
-				<class name="workflow_tasks.py" filename="tasks/workflow_tasks.py" complexity="0" line-rate="0.259" branch-rate="0">
+				<class name="onedrive_tasks.py" filename="tasks/onedrive_tasks.py" complexity="0" line-rate="0.1064" branch-rate="0">
 					<methods/>
 					<lines>
-						<line number="2" hits="1"/>
-						<line number="3" hits="1"/>
-						<line number="4" hits="1"/>
 						<line number="6" hits="1"/>
 						<line number="7" hits="1"/>
 						<line number="8" hits="1"/>
 						<line number="9" hits="1"/>
+						<line number="10" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="20" hits="1"/>
+						<line number="22" hits="0"/>
+						<line number="23" hits="0"/>
+						<line number="26" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="33" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="39" hits="1"/>
+						<line number="40" hits="0"/>
+						<line number="41" hits="0"/>
+						<line number="42" hits="0"/>
+						<line number="43" hits="0"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="50" hits="0"/>
+						<line number="51" hits="0"/>
+						<line number="52" hits="0"/>
+						<line number="54" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="58" hits="0"/>
+						<line number="59" hits="0"/>
+						<line number="60" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="63" hits="0"/>
+						<line number="64" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="65,130"/>
+						<line number="65" hits="0"/>
+						<line number="72" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="73,77"/>
+						<line number="73" hits="0"/>
+						<line number="74" hits="0"/>
+						<line number="75" hits="0"/>
+						<line number="77" hits="0"/>
+						<line number="78" hits="0"/>
+						<line number="80" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="81,126"/>
+						<line number="81" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="82,83"/>
+						<line number="82" hits="0"/>
+						<line number="83" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="84,86"/>
+						<line number="84" hits="0"/>
+						<line number="86" hits="0"/>
+						<line number="87" hits="0"/>
+						<line number="88" hits="0"/>
+						<line number="90" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="91,93"/>
+						<line number="91" hits="0"/>
+						<line number="93" hits="0"/>
+						<line number="95" hits="0"/>
+						<line number="97" hits="0"/>
+						<line number="98" hits="0"/>
+						<line number="105" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="80,106"/>
+						<line number="106" hits="0"/>
+						<line number="107" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="80,108"/>
+						<line number="108" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="122" hits="0"/>
+						<line number="123" hits="0"/>
+						<line number="126" hits="0"/>
+						<line number="127" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="64,128"/>
+						<line number="128" hits="0"/>
+						<line number="130" hits="0"/>
+						<line number="137" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="140" hits="0"/>
+						<line number="141" hits="0"/>
+						<line number="144" hits="1"/>
+						<line number="145" hits="1"/>
+						<line number="147" hits="0"/>
+						<line number="148" hits="0"/>
+						<line number="153" hits="1"/>
+						<line number="154" hits="0"/>
+						<line number="155" hits="0"/>
+						<line number="156" hits="0"/>
+						<line number="157" hits="0"/>
+						<line number="159" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="162" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="163,167"/>
+						<line number="163" hits="0"/>
+						<line number="164" hits="0"/>
+						<line number="165" hits="0"/>
+						<line number="167" hits="0"/>
+						<line number="168" hits="0"/>
+						<line number="169" hits="0"/>
+						<line number="170" hits="0"/>
+						<line number="171" hits="0"/>
+						<line number="172" hits="0"/>
+						<line number="174" hits="0"/>
+						<line number="175" hits="0"/>
+						<line number="176" hits="0"/>
+						<line number="177" hits="0"/>
+						<line number="179" hits="0"/>
+						<line number="180" hits="0"/>
+						<line number="181" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="182,251"/>
+						<line number="182" hits="0"/>
+						<line number="188" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="190,195"/>
+						<line number="190" hits="0"/>
+						<line number="191" hits="0"/>
+						<line number="192" hits="0"/>
+						<line number="193" hits="0"/>
+						<line number="195" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="196,199"/>
+						<line number="196" hits="0"/>
+						<line number="197" hits="0"/>
+						<line number="199" hits="0"/>
+						<line number="200" hits="0"/>
+						<line number="202" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="203,247"/>
+						<line number="203" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="204,208"/>
+						<line number="204" hits="0"/>
+						<line number="205" hits="0"/>
+						<line number="206" hits="0"/>
+						<line number="208" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="209,211"/>
+						<line number="209" hits="0"/>
+						<line number="211" hits="0"/>
+						<line number="212" hits="0"/>
+						<line number="213" hits="0"/>
+						<line number="215" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="216,218"/>
+						<line number="216" hits="0"/>
+						<line number="218" hits="0"/>
+						<line number="219" hits="0"/>
+						<line number="220" hits="0"/>
+						<line number="227" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="202,228"/>
+						<line number="228" hits="0"/>
+						<line number="229" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="202,230"/>
+						<line number="230" hits="0"/>
+						<line number="242" hits="0"/>
+						<line number="244" hits="0"/>
+						<line number="245" hits="0"/>
+						<line number="247" hits="0"/>
+						<line number="248" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="181,249"/>
+						<line number="249" hits="0"/>
+						<line number="251" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="252,254"/>
+						<line number="252" hits="0"/>
+						<line number="254" hits="0"/>
+						<line number="256" hits="0"/>
+						<line number="257" hits="0"/>
+						<line number="260" hits="1"/>
+						<line number="261" hits="1"/>
+						<line number="263" hits="0"/>
+						<line number="264" hits="0"/>
+						<line number="267" hits="1"/>
+						<line number="268" hits="0"/>
+						<line number="269" hits="0"/>
+						<line number="270" hits="0"/>
+						<line number="271" hits="0"/>
+						<line number="273" hits="0"/>
+						<line number="275" hits="0"/>
+						<line number="284" hits="0"/>
+						<line number="286" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,287"/>
+						<line number="287" hits="0"/>
+						<line number="288" hits="0"/>
+						<line number="289" hits="0"/>
+						<line number="290" hits="0"/>
+						<line number="291" hits="0"/>
+						<line number="292" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="286,293"/>
+						<line number="293" hits="0"/>
+						<line number="301" hits="0"/>
+						<line number="302" hits="0"/>
+						<line number="303" hits="0"/>
+						<line number="306" hits="1"/>
+						<line number="307" hits="1"/>
+						<line number="309" hits="0"/>
+						<line number="310" hits="0"/>
+						<line number="313" hits="1"/>
+						<line number="314" hits="0"/>
+						<line number="315" hits="0"/>
+						<line number="317" hits="0"/>
+						<line number="318" hits="0"/>
+						<line number="327" hits="0"/>
+						<line number="328" hits="0"/>
+						<line number="330" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,331"/>
+						<line number="331" hits="0"/>
+						<line number="334" hits="1"/>
+						<line number="335" hits="1"/>
+						<line number="337" hits="0"/>
+						<line number="338" hits="0"/>
+						<line number="341" hits="1"/>
+						<line number="342" hits="0"/>
+						<line number="343" hits="0"/>
+						<line number="344" hits="0"/>
+						<line number="346" hits="0"/>
+						<line number="348" hits="0"/>
+						<line number="350" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="351,365"/>
+						<line number="351" hits="0"/>
+						<line number="352" hits="0"/>
+						<line number="353" hits="0"/>
+						<line number="355" hits="0"/>
+						<line number="356" hits="0"/>
+						<line number="361" hits="0"/>
+						<line number="362" hits="0"/>
+						<line number="365" hits="0"/>
+						<line number="369" hits="0"/>
+						<line number="374" hits="0"/>
+						<line number="378" hits="0"/>
+						<line number="379" hits="0"/>
+						<line number="385" hits="1"/>
+						<line number="386" hits="0"/>
+						<line number="387" hits="0"/>
+						<line number="391" hits="0"/>
+						<line number="392" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="393,394"/>
+						<line number="393" hits="0"/>
+						<line number="394" hits="0"/>
+						<line number="402" hits="1"/>
+						<line number="403" hits="0"/>
+						<line number="405" hits="0"/>
+						<line number="406" hits="0"/>
+						<line number="408" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="409,411"/>
+						<line number="409" hits="0"/>
+						<line number="410" hits="0"/>
+						<line number="411" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="412,414"/>
+						<line number="412" hits="0"/>
+						<line number="413" hits="0"/>
+						<line number="414" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="415,417"/>
+						<line number="415" hits="0"/>
+						<line number="416" hits="0"/>
+						<line number="417" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="418,421"/>
+						<line number="418" hits="0"/>
+						<line number="419" hits="0"/>
+						<line number="421" hits="0"/>
+						<line number="422" hits="0"/>
+						<line number="426" hits="0"/>
+						<line number="429" hits="1"/>
+						<line number="431" hits="0"/>
+						<line number="433" hits="0"/>
+						<line number="459" hits="0"/>
+						<line number="462" hits="1"/>
+						<line number="464" hits="0"/>
+						<line number="465" hits="0"/>
+						<line number="469" hits="0"/>
+						<line number="472" hits="1"/>
+						<line number="474" hits="0"/>
+						<line number="475" hits="0"/>
+						<line number="476" hits="0"/>
+						<line number="477" hits="0"/>
+						<line number="479" hits="0"/>
+						<line number="480" hits="0"/>
+						<line number="488" hits="0"/>
+						<line number="489" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="490,492"/>
+						<line number="490" hits="0"/>
+						<line number="492" hits="0"/>
+						<line number="493" hits="0"/>
+						<line number="495" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="496,498"/>
+						<line number="496" hits="0"/>
+						<line number="498" hits="0"/>
+						<line number="499" hits="0"/>
+						<line number="500" hits="0"/>
+						<line number="501" hits="0"/>
+						<line number="502" hits="0"/>
+						<line number="505" hits="0"/>
+						<line number="506" hits="0"/>
+						<line number="507" hits="0"/>
+						<line number="508" hits="0"/>
+						<line number="510" hits="0"/>
+						<line number="511" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="512,541"/>
+						<line number="512" hits="0"/>
+						<line number="519" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="520,522"/>
+						<line number="520" hits="0"/>
+						<line number="522" hits="0"/>
+						<line number="523" hits="0"/>
+						<line number="525" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="526,536"/>
+						<line number="526" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="527,528"/>
+						<line number="527" hits="0"/>
+						<line number="528" hits="0"/>
+						<line number="529" hits="0"/>
+						<line number="530" hits="0"/>
+						<line number="532" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="525,533"/>
+						<line number="533" hits="0"/>
+						<line number="534" hits="0"/>
+						<line number="536" hits="0"/>
+						<line number="537" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="511,538"/>
+						<line number="538" hits="0"/>
+						<line number="541" hits="0"/>
+						<line number="542" hits="0"/>
+						<line number="543" hits="0"/>
+						<line number="545" hits="0"/>
+					</lines>
+				</class>
+				<class name="reindex_tasks.py" filename="tasks/reindex_tasks.py" complexity="0" line-rate="0.9583" branch-rate="0.7143">
+					<methods/>
+					<lines>
+						<line number="3" hits="1"/>
+						<line number="5" hits="1"/>
+						<line number="7" hits="1"/>
+						<line number="8" hits="1"/>
+						<line number="9" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="28" hits="0"/>
+						<line number="31" hits="1"/>
+						<line number="33" hits="1"/>
+						<line number="35" hits="1"/>
+						<line number="36" hits="1"/>
+						<line number="38" hits="1"/>
+						<line number="40" hits="1"/>
+						<line number="43" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="45"/>
+						<line number="44" hits="1"/>
+						<line number="45" hits="1"/>
+						<line number="47" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="48" hits="1"/>
+						<line number="49" hits="1"/>
+						<line number="51" hits="1"/>
+						<line number="58" hits="1"/>
+						<line number="59" hits="1"/>
+						<line number="60" hits="1"/>
+						<line number="62" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="64" hits="1"/>
+						<line number="71" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="74"/>
+						<line number="72" hits="1"/>
+						<line number="74" hits="1"/>
+						<line number="75" hits="1"/>
+						<line number="77" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="78"/>
+						<line number="78" hits="0"/>
+						<line number="80" hits="1" branch="true" condition-coverage="100% (2/2)"/>
+						<line number="81" hits="1"/>
+						<line number="82" hits="1"/>
+						<line number="88" hits="1"/>
+						<line number="89" hits="1"/>
+						<line number="90" hits="1"/>
+						<line number="96" hits="1"/>
+						<line number="98" hits="1"/>
+						<line number="99" hits="1"/>
+						<line number="101" hits="1"/>
+						<line number="110" hits="1" branch="true" condition-coverage="50% (1/2)" missing-branches="62"/>
+						<line number="111" hits="1"/>
+						<line number="120" hits="1"/>
+						<line number="128" hits="1"/>
+					</lines>
+				</class>
+				<class name="workflow_edit_tasks.py" filename="tasks/workflow_edit_tasks.py" complexity="0" line-rate="0.3167" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="10" hits="1"/>
 						<line number="11" hits="1"/>
 						<line number="12" hits="1"/>
 						<line number="13" hits="1"/>
-						<line number="14" hits="1"/>
 						<line number="15" hits="1"/>
 						<line number="16" hits="1"/>
-						<line number="18" hits="1"/>
+						<line number="17" hits="1"/>
+						<line number="19" hits="1"/>
 						<line number="21" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="24" hits="1"/>
+						<line number="27" hits="1"/>
+						<line number="30" hits="1"/>
+						<line number="31" hits="0"/>
+						<line number="34" hits="1"/>
+						<line number="36" hits="0"/>
+						<line number="37" hits="0"/>
+						<line number="38" hits="0"/>
+						<line number="40" hits="0"/>
+						<line number="43" hits="1"/>
+						<line number="45" hits="0"/>
+						<line number="46" hits="0"/>
+						<line number="47" hits="0"/>
+						<line number="48" hits="0"/>
+						<line number="49" hits="0"/>
+						<line number="52" hits="1"/>
+						<line number="58" hits="0"/>
+						<line number="59" hits="0"/>
+						<line number="60" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="61,62"/>
+						<line number="61" hits="0"/>
+						<line number="62" hits="0"/>
+						<line number="64" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="65,67"/>
+						<line number="65" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="66,67"/>
+						<line number="66" hits="0"/>
+						<line number="67" hits="0"/>
+						<line number="70" hits="1"/>
+						<line number="72" hits="0"/>
+						<line number="75" hits="1"/>
+						<line number="82" hits="1"/>
+						<line number="102" hits="0"/>
+						<line number="110" hits="0"/>
+						<line number="116" hits="0"/>
+						<line number="117" hits="0"/>
+						<line number="119" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="133" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="146" hits="0"/>
+						<line number="148" hits="0"/>
+						<line number="149" hits="0"/>
+						<line number="150" hits="0"/>
+						<line number="157" hits="0"/>
+						<line number="159" hits="0"/>
+						<line number="160" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="168" hits="0"/>
+						<line number="170" hits="0"/>
+						<line number="171" hits="0"/>
+						<line number="177" hits="0"/>
+						<line number="184" hits="0"/>
+					</lines>
+				</class>
+				<class name="workflow_gen_tasks.py" filename="tasks/workflow_gen_tasks.py" complexity="0" line-rate="0.3273" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="10" hits="1"/>
+						<line number="11" hits="1"/>
+						<line number="12" hits="1"/>
+						<line number="13" hits="1"/>
+						<line number="15" hits="1"/>
+						<line number="16" hits="1"/>
+						<line number="18" hits="1"/>
+						<line number="20" hits="1"/>
 						<line number="22" hits="1"/>
+						<line number="23" hits="1"/>
+						<line number="26" hits="1"/>
+						<line number="29" hits="1"/>
+						<line number="30" hits="0"/>
+						<line number="33" hits="1"/>
+						<line number="40" hits="0"/>
+						<line number="41" hits="0"/>
+						<line number="42" hits="0"/>
+						<line number="44" hits="0"/>
+						<line number="47" hits="1"/>
+						<line number="52" hits="0"/>
+						<line number="53" hits="0"/>
+						<line number="54" hits="0"/>
+						<line number="55" hits="0"/>
+						<line number="56" hits="0"/>
+						<line number="59" hits="1"/>
+						<line number="65" hits="0"/>
+						<line number="66" hits="0"/>
+						<line number="67" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="68,69"/>
+						<line number="68" hits="0"/>
+						<line number="69" hits="0"/>
+						<line number="71" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="72,74"/>
+						<line number="72" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="73,74"/>
+						<line number="73" hits="0"/>
+						<line number="74" hits="0"/>
+						<line number="77" hits="1"/>
+						<line number="79" hits="0"/>
+						<line number="82" hits="1"/>
+						<line number="89" hits="1"/>
+						<line number="106" hits="0"/>
+						<line number="113" hits="0"/>
+						<line number="119" hits="0"/>
+						<line number="120" hits="0"/>
+						<line number="122" hits="0"/>
+						<line number="123" hits="0"/>
+						<line number="133" hits="0"/>
+						<line number="139" hits="0"/>
+						<line number="145" hits="0"/>
+						<line number="147" hits="0"/>
+						<line number="148" hits="0"/>
+						<line number="149" hits="0"/>
+						<line number="156" hits="0"/>
+						<line number="158" hits="0"/>
+						<line number="161" hits="0"/>
+						<line number="167" hits="0"/>
+						<line number="174" hits="0"/>
+					</lines>
+				</class>
+				<class name="workflow_tasks.py" filename="tasks/workflow_tasks.py" complexity="0" line-rate="0" branch-rate="0">
+					<methods/>
+					<lines>
+						<line number="2" hits="0"/>
+						<line number="3" hits="0"/>
+						<line number="4" hits="0"/>
+						<line number="6" hits="0"/>
+						<line number="7" hits="0"/>
+						<line number="8" hits="0"/>
+						<line number="9" hits="0"/>
+						<line number="11" hits="0"/>
+						<line number="12" hits="0"/>
+						<line number="13" hits="0"/>
+						<line number="14" hits="0"/>
+						<line number="15" hits="0"/>
+						<line number="16" hits="0"/>
+						<line number="18" hits="0"/>
+						<line number="21" hits="0"/>
+						<line number="22" hits="0"/>
 						<line number="29" hits="0"/>
-						<line number="32" hits="1"/>
-						<line number="34" hits="1"/>
-						<line number="35" hits="1"/>
-						<line number="38" hits="1"/>
+						<line number="32" hits="0"/>
+						<line number="34" hits="0"/>
+						<line number="35" hits="0"/>
+						<line number="38" hits="0"/>
 						<line number="47" hits="0"/>
 						<line number="49" hits="0"/>
 						<line number="55" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="exit,56"/>
@@ -39819,7 +45129,7 @@
 						<line number="82" hits="0"/>
 						<line number="83" hits="0"/>
 						<line number="90" hits="0"/>
-						<line number="93" hits="1"/>
+						<line number="93" hits="0"/>
 						<line number="99" hits="0"/>
 						<line number="102" hits="0"/>
 						<line number="110" hits="0"/>
@@ -39827,10 +45137,10 @@
 						<line number="117" hits="0"/>
 						<line number="124" hits="0"/>
 						<line number="129" hits="0"/>
-						<line number="137" hits="1"/>
-						<line number="138" hits="1"/>
+						<line number="137" hits="0"/>
+						<line number="138" hits="0"/>
 						<line number="146" hits="0"/>
-						<line number="149" hits="1"/>
+						<line number="149" hits="0"/>
 						<line number="151" hits="0"/>
 						<line number="153" hits="0"/>
 						<line number="162" hits="0"/>
@@ -39846,22 +45156,22 @@
 						<line number="198" hits="0"/>
 						<line number="199" hits="0"/>
 						<line number="205" hits="0"/>
-						<line number="208" hits="1"/>
+						<line number="208" hits="0"/>
 						<line number="210" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="211,213"/>
 						<line number="211" hits="0" branch="true" condition-coverage="0% (0/2)" missing-branches="210,212"/>
 						<line number="212" hits="0"/>
 						<line number="213" hits="0"/>
-						<line number="216" hits="1"/>
+						<line number="216" hits="0"/>
 						<line number="224" hits="0"/>
 						<line number="227" hits="0"/>
 						<line number="233" hits="0"/>
 						<line number="238" hits="0"/>
 						<line number="239" hits="0"/>
 						<line number="246" hits="0"/>
-						<line number="252" hits="1"/>
-						<line number="253" hits="1"/>
+						<line number="252" hits="0"/>
+						<line number="253" hits="0"/>
 						<line number="261" hits="0"/>
-						<line number="264" hits="1"/>
+						<line number="264" hits="0"/>
 						<line number="266" hits="0"/>
 						<line number="268" hits="0"/>
 						<line number="273" hits="0"/>
@@ -39889,17 +45199,17 @@
 						<line number="330" hits="0"/>
 						<line number="331" hits="0"/>
 						<line number="339" hits="0"/>
-						<line number="342" hits="1"/>
+						<line number="342" hits="0"/>
 						<line number="350" hits="0"/>
 						<line number="353" hits="0"/>
 						<line number="360" hits="0"/>
 						<line number="365" hits="0"/>
 						<line number="366" hits="0"/>
 						<line number="373" hits="0"/>
-						<line number="379" hits="1"/>
-						<line number="380" hits="1"/>
+						<line number="379" hits="0"/>
+						<line number="380" hits="0"/>
 						<line number="393" hits="0"/>
-						<line number="396" hits="1"/>
+						<line number="396" hits="0"/>
 						<line number="402" hits="0"/>
 						<line number="404" hits="0"/>
 						<line number="407" hits="0"/>
@@ -39915,10 +45225,10 @@
 						<line number="435" hits="0"/>
 						<line number="442" hits="0"/>
 						<line number="443" hits="0"/>
-						<line number="451" hits="1"/>
-						<line number="452" hits="1"/>
+						<line number="451" hits="0"/>
+						<line number="452" hits="0"/>
 						<line number="470" hits="0"/>
-						<line number="473" hits="1"/>
+						<line number="473" hits="0"/>
 						<line number="479" hits="0"/>
 						<line number="493" hits="0"/>
 					</lines>
diff --git a/python-backend/tests/orchestrator/rag/test_allowed_scopes.py b/python-backend/tests/orchestrator/rag/test_allowed_scopes.py
index a9b909c..3a87000 100644
--- a/python-backend/tests/orchestrator/rag/test_allowed_scopes.py
+++ b/python-backend/tests/orchestrator/rag/test_allowed_scopes.py
@@ -158,9 +158,9 @@ class TestRecomputeAllowedScopes:
         assert "u:42" in result
 
     async def test_tenant_permission_adds_tenant_scope(self):
-        """Tenant-type permissions should add t:<subject_id> scope."""
+        """Tenant_role-type permissions should add t:<subject_id> scope."""
         item = _make_item_row(owner_user_id=42)
-        perms = [_make_permission_row("tenant", "org-1", "read")]
+        perms = [_make_permission_row("tenant_role", "org-1", "read")]
         session = _mock_session(item, perms)
 
         result = await recompute_allowed_scopes(library_item_id=1, session=session)
diff --git a/python-backend/tests/orchestrator/rag/test_e2e_scope.py b/python-backend/tests/orchestrator/rag/test_e2e_scope.py
new file mode 100644
index 0000000..01ad473
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_e2e_scope.py
@@ -0,0 +1,211 @@
+"""
+End-to-end scope enforcement integration tests — Phase 4.4.
+
+These tests verify the full pipeline: query through executor with scope
+filtering, reranking, and guardrails. Requires prior sections' components.
+"""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
+from app.orchestrator.node_executors.rag_executor import RAGExecutor
+from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode
+
+
+def _make_chunk(
+    *,
+    id: int = 1,
+    tenant_id: str = "tenant-a",
+    library_item_id: int = 100,
+    content: str = "Some content",
+    allowed_scopes: list | None = None,
+    metadata_json: dict | None = None,
+) -> MagicMock:
+    chunk = MagicMock()
+    chunk.id = id
+    chunk.tenant_id = tenant_id
+    chunk.library_item_id = library_item_id
+    chunk.chunk_index = 0
+    chunk.content = content
+    chunk.is_parent = False
+    chunk.allowed_scopes = allowed_scopes or ["p:global"]
+    chunk.metadata_json = metadata_json or {}
+    chunk.vector_ref_id = f"vec-{id}"
+    return chunk
+
+
+def _make_item(*, id: int = 100, title: str = "Doc") -> MagicMock:
+    item = MagicMock()
+    item.id = id
+    item.title = title
+    item.item_type = "document"
+    item.visibility = "private"
+    return item
+
+
+def _make_tenant(*, id: str = "tenant-a", settings: dict | None = None) -> MagicMock:
+    tenant = MagicMock()
+    tenant.id = id
+    tenant.settings = settings or {}
+    tenant.plan = MagicMock(value="free")
+    return tenant
+
+
+def _patch_db(chunks, items, tenant):
+    session = AsyncMock()
+
+    async def _execute_side_effect(stmt):
+        result_mock = MagicMock()
+        stmt_str = str(stmt)
+        if "library_chunks" in stmt_str.lower() or "librarychunk" in stmt_str.lower():
+            result_mock.scalars.return_value.all.return_value = chunks
+        elif "library_items" in stmt_str.lower() or "libraryitem" in stmt_str.lower():
+            result_mock.scalars.return_value.all.return_value = items
+        else:
+            result_mock.scalars.return_value.first.return_value = tenant
+            result_mock.scalar_one_or_none.return_value = tenant
+        return result_mock
+
+    session.execute = AsyncMock(side_effect=_execute_side_effect)
+
+    ctx = AsyncMock()
+    ctx.__aenter__ = AsyncMock(return_value=session)
+    ctx.__aexit__ = AsyncMock(return_value=False)
+    return ctx, session
+
+
+@pytest.mark.integration
+class TestE2EScopeEnforcement:
+    """End-to-end tests for scope enforcement through the full RAG pipeline."""
+
+    @pytest.mark.asyncio
+    async def test_no_cross_tenant_documents_in_results(self):
+        """Query as tenant A must never return tenant B's documents."""
+        # Tenant A's chunks
+        chunks_a = [_make_chunk(id=1, tenant_id="tenant-a", content="Tenant A data")]
+        items = [_make_item()]
+        tenant = _make_tenant(id="tenant-a")
+        ctx_mock, _ = _patch_db(chunks_a, items, tenant)
+
+        # Only tenant-a docs should be retrieved because the executor filters by tenant_id
+        tenant_a_result = RAGResult(
+            query="test",
+            documents=[
+                Document(
+                    doc_id="d1",
+                    content="Tenant A data",
+                    final_score=0.9,
+                    parent_doc_title="Doc",
+                    metadata={"tenant_id": "tenant-a"},
+                ),
+            ],
+            final_count=1,
+            mode=SearchMode.HYBRID,
+        )
+
+        context = ExecutionContext(
+            user_id=1,
+            tenant_id="tenant-a",
+            workflow_id="wf-1",
+            execution_id="exec-1",
+            extra_data={"effective_scopes": ["u:1", "p:global"]},
+        )
+        data = NodeExecutionData(
+            node_id="rag-1",
+            node_type="rag_query",
+            config={"top_k": 5, "mode": "hybrid"},
+            inputs={"query": "search data"},
+            state={},
+        )
+
+        executor = RAGExecutor()
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=tenant_a_result)
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            result = await executor.execute(data, context)
+
+        # Verify retrieve was called with tenant-a isolation
+        retrieve_kwargs = engine.retrieve.call_args.kwargs
+        assert retrieve_kwargs["tenant_id"] == "tenant-a"
+
+        # No tenant-b data should appear
+        for doc in result["documents"]:
+            assert "tenant-b" not in doc.get("text", "").lower()
+
+    @pytest.mark.asyncio
+    async def test_full_pipeline_respects_scopes_and_produces_quality(self):
+        """Full pipeline must respect scopes and include quality assessment."""
+        chunks = [
+            _make_chunk(id=1, content="Scoped content", allowed_scopes=["u:1", "p:global"]),
+        ]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        scoped_result = RAGResult(
+            query="test",
+            documents=[
+                Document(
+                    doc_id="d1",
+                    content="Scoped content",
+                    final_score=0.8,
+                    parent_doc_title="Doc",
+                    section_heading="S1",
+                    chunk_id="chunk-1",
+                    parent_doc_id="100",
+                ),
+            ],
+            final_count=1,
+            mode=SearchMode.HYBRID,
+            retrieval_time_ms=30,
+            rerank_time_ms=10,
+            total_time_ms=50,
+            bm25_candidates=3,
+            vector_candidates=5,
+        )
+
+        context = ExecutionContext(
+            user_id=1,
+            tenant_id="tenant-a",
+            workflow_id="wf-1",
+            execution_id="exec-1",
+            extra_data={"effective_scopes": ["u:1", "p:global"]},
+        )
+        data = NodeExecutionData(
+            node_id="rag-1",
+            node_type="rag_query",
+            config={"top_k": 5, "mode": "hybrid"},
+            inputs={"query": "find content"},
+            state={},
+        )
+
+        executor = RAGExecutor()
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=scoped_result)
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            result = await executor.execute(data, context)
+
+        # Scopes were passed to retrieve
+        retrieve_kwargs = engine.retrieve.call_args.kwargs
+        assert retrieve_kwargs["effective_scopes"] == ["u:1", "p:global"]
+
+        # Quality assessment is present
+        assert "quality" in result
+        assert result["quality"]["quality"] in ("high", "medium", "low", "failed")
+
+        # Metadata is present
+        assert "metadata" in result
+        assert "total_results" in result["metadata"]
diff --git a/python-backend/tests/orchestrator/rag/test_rag_executor.py b/python-backend/tests/orchestrator/rag/test_rag_executor.py
new file mode 100644
index 0000000..0284ef2
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_rag_executor.py
@@ -0,0 +1,606 @@
+"""
+Tests for RAG Executor — Phase 4.4.
+
+Validates that the executor:
+1. Queries libraryChunks from PostgreSQL (not mock data)
+2. Loads chunks into HybridRAGEngine for the query lifecycle
+3. Uses effective_scopes from extra_data for filtering
+4. Returns real documents with citations and quality assessment
+5. Respects tenant's rag_failure_mode setting
+6. Creates AsyncSession scoped to request lifecycle
+"""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+from dataclasses import dataclass, field
+from typing import Any
+
+from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
+from app.orchestrator.node_executors.rag_executor import RAGExecutor
+from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode
+from app.orchestrator.rag.guardrails import RetrievalQuality, QualityAssessment
+
+
+# ---------------------------------------------------------------------------
+# Helpers
+# ---------------------------------------------------------------------------
+
+
+def _make_chunk(
+    *,
+    id: int = 1,
+    tenant_id: str = "tenant-abc",
+    library_item_id: int = 100,
+    chunk_index: int = 0,
+    content: str = "Sample chunk content.",
+    is_parent: bool = False,
+    allowed_scopes: list | None = None,
+    metadata_json: dict | None = None,
+    vector_ref_id: str | None = None,
+) -> MagicMock:
+    """Build a mock LibraryChunk row."""
+    chunk = MagicMock()
+    chunk.id = id
+    chunk.tenant_id = tenant_id
+    chunk.library_item_id = library_item_id
+    chunk.chunk_index = chunk_index
+    chunk.content = content
+    chunk.is_parent = is_parent
+    chunk.allowed_scopes = allowed_scopes or ["u:42", "p:global"]
+    chunk.metadata_json = metadata_json or {}
+    chunk.vector_ref_id = vector_ref_id or f"vec-{id}"
+    return chunk
+
+
+def _make_item(
+    *,
+    id: int = 100,
+    title: str = "Test Document",
+    item_type: str = "document",
+    visibility: str = "private",
+) -> MagicMock:
+    """Build a mock LibraryItem row."""
+    item = MagicMock()
+    item.id = id
+    item.title = title
+    item.item_type = item_type
+    item.visibility = visibility
+    return item
+
+
+def _make_tenant(
+    *,
+    id: str = "tenant-abc",
+    settings: dict | None = None,
+    plan: str = "free",
+) -> MagicMock:
+    """Build a mock Tenant row."""
+    tenant = MagicMock()
+    tenant.id = id
+    tenant.settings = settings or {}
+    tenant.plan = MagicMock(value=plan)
+    return tenant
+
+
+def _rag_result_with_docs(
+    docs: list[Document] | None = None,
+    mode: SearchMode = SearchMode.HYBRID,
+) -> RAGResult:
+    """Build a RAGResult with provided documents."""
+    if docs is None:
+        docs = [
+            Document(
+                doc_id="d1",
+                content="Refund policy details.",
+                final_score=0.85,
+                chunk_id="chunk-1",
+                parent_doc_id="100",
+                parent_doc_title="Test Document",
+                section_heading="Refund Policy",
+            ),
+        ]
+    return RAGResult(
+        query="test query",
+        documents=docs,
+        final_count=len(docs),
+        mode=mode,
+        retrieval_time_ms=50,
+        rerank_time_ms=20,
+        total_time_ms=80,
+        bm25_candidates=5,
+        vector_candidates=8,
+    )
+
+
+@pytest.fixture
+def executor():
+    """Create a RAGExecutor instance."""
+    return RAGExecutor()
+
+
+@pytest.fixture
+def base_context():
+    """Create a minimal ExecutionContext with effective_scopes."""
+    return ExecutionContext(
+        user_id=42,
+        tenant_id="tenant-abc",
+        workflow_id="wf-1",
+        execution_id="exec-1",
+        credits_available=100,
+        extra_data={
+            "effective_scopes": ["u:42", "g:10", "t:tenant-abc", "p:global"],
+            "user_token": "test-token",
+        },
+    )
+
+
+@pytest.fixture
+def base_data():
+    """Create a minimal NodeExecutionData with a query."""
+    return NodeExecutionData(
+        node_id="rag-node-1",
+        node_type="rag_query",
+        config={"top_k": 5, "mode": "hybrid"},
+        inputs={"query": "What is our refund policy?"},
+        state={},
+    )
+
+
+def _patch_db(chunks, items, tenant):
+    """Create a patched get_db_context that returns mock query results.
+
+    Returns the session mock so callers can inspect query calls.
+    """
+    session = AsyncMock()
+
+    # Map query results based on the model being queried
+    async def _execute_side_effect(stmt):
+        result_mock = MagicMock()
+        # Simple heuristic: inspect the statement to figure out what's being queried.
+        # We return different results depending on what the executor queries.
+        stmt_str = str(stmt)
+        if "library_chunks" in stmt_str.lower() or "librarychunk" in stmt_str.lower():
+            result_mock.scalars.return_value.all.return_value = chunks
+        elif "library_items" in stmt_str.lower() or "libraryitem" in stmt_str.lower():
+            result_mock.scalars.return_value.all.return_value = items
+        elif "tenants" in stmt_str.lower() or "tenant" in stmt_str.lower():
+            result_mock.scalars.return_value.first.return_value = tenant
+            result_mock.scalar_one_or_none.return_value = tenant
+        else:
+            # Fallback: try to detect by column filters
+            result_mock.scalars.return_value.all.return_value = chunks
+            result_mock.scalars.return_value.first.return_value = tenant
+            result_mock.scalar_one_or_none.return_value = tenant
+        return result_mock
+
+    session.execute = AsyncMock(side_effect=_execute_side_effect)
+
+    ctx = AsyncMock()
+    ctx.__aenter__ = AsyncMock(return_value=session)
+    ctx.__aexit__ = AsyncMock(return_value=False)
+
+    return ctx, session
+
+
+# ---------------------------------------------------------------------------
+# TestRAGExecutorQueryFromDB
+# ---------------------------------------------------------------------------
+
+class TestRAGExecutorQueryFromDB:
+    """Test: executor queries libraryChunks from PostgreSQL (not mock data)."""
+
+    @pytest.mark.asyncio
+    async def test_queries_chunks_from_db(self, executor, base_context, base_data):
+        """Executor must query LibraryChunk from the database, not return hardcoded data."""
+        chunks = [_make_chunk(content="Real chunk from DB.")]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, session = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            result = await executor.execute(base_data, base_context)
+
+        # Session was used
+        assert session.execute.called
+        # Result must NOT contain stub data
+        assert result.get("documents") is not None
+
+    @pytest.mark.asyncio
+    async def test_only_child_chunks_loaded(self, executor, base_context, base_data):
+        """Executor must filter for is_parent=False, loading only child chunks for retrieval."""
+        child = _make_chunk(id=1, is_parent=False, content="Child chunk")
+        # Parent chunks should not be in the results from the DB query
+        # (they're filtered out by the SQL WHERE clause)
+        chunks = [child]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, session = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            await executor.execute(base_data, base_context)
+
+        # Only the child chunk should be added to the engine
+        assert engine.add_document.call_count == 1
+
+
+# ---------------------------------------------------------------------------
+# TestRAGExecutorLoadsIntoEngine
+# ---------------------------------------------------------------------------
+
+class TestRAGExecutorLoadsIntoEngine:
+    """Test: executor loads chunks into HybridRAGEngine for query lifecycle."""
+
+    @pytest.mark.asyncio
+    async def test_loads_chunks_into_engine(self, executor, base_context, base_data):
+        """Each DB chunk must be added to the engine with correct fields."""
+        chunks = [
+            _make_chunk(id=1, content="Chunk A", metadata_json={"section_heading": "Intro"}),
+            _make_chunk(id=2, content="Chunk B", metadata_json={"section_heading": "Details"}),
+        ]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            await executor.execute(base_data, base_context)
+
+        assert engine.add_document.call_count == 2
+        # Verify first chunk was loaded with correct content
+        first_call = engine.add_document.call_args_list[0]
+        assert first_call.kwargs.get("content") == "Chunk A" or first_call.args[0] == "Chunk A"
+
+    @pytest.mark.asyncio
+    async def test_engine_is_request_scoped(self, executor, base_context, base_data):
+        """Engine should be created fresh per request and cleaned up after."""
+        chunks = [_make_chunk()]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            await executor.execute(base_data, base_context)
+            await executor.execute(base_data, base_context)
+
+        # Engine class should be instantiated twice (once per request)
+        assert engine_cls.call_count == 2
+        # Cleanup should be called twice
+        assert engine.cleanup.call_count == 2
+
+
+# ---------------------------------------------------------------------------
+# TestRAGExecutorEffectiveScopes
+# ---------------------------------------------------------------------------
+
+class TestRAGExecutorEffectiveScopes:
+    """Test: executor uses effective_scopes from extra_data for filtering."""
+
+    @pytest.mark.asyncio
+    async def test_passes_scopes_to_retrieve(self, executor, base_context, base_data):
+        """Effective scopes from extra_data must be passed to retrieve()."""
+        chunks = [_make_chunk()]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            await executor.execute(base_data, base_context)
+
+        # Verify retrieve was called with effective_scopes
+        retrieve_call = engine.retrieve.call_args
+        assert retrieve_call.kwargs.get("effective_scopes") == ["u:42", "g:10", "t:tenant-abc", "p:global"]
+
+    @pytest.mark.asyncio
+    async def test_missing_scopes_uses_safe_default(self, executor, base_context, base_data):
+        """When effective_scopes is absent, default to ['u:<user_id>', 'p:global']."""
+        base_context.extra_data.pop("effective_scopes", None)
+        chunks = [_make_chunk()]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            await executor.execute(base_data, base_context)
+
+        retrieve_call = engine.retrieve.call_args
+        assert retrieve_call.kwargs.get("effective_scopes") == ["u:42", "p:global"]
+
+
+# ---------------------------------------------------------------------------
+# TestRAGExecutorReturnsRealResults
+# ---------------------------------------------------------------------------
+
+class TestRAGExecutorReturnsRealResults:
+    """Test: executor returns real documents with citations and quality assessment."""
+
+    @pytest.mark.asyncio
+    async def test_returns_documents_with_citations(self, executor, base_context, base_data):
+        """Result must include citation_ref, quality assessment, and real context."""
+        docs = [
+            Document(
+                doc_id="d1",
+                content="Refund policy allows 30-day returns.",
+                final_score=0.85,
+                chunk_id="chunk-1",
+                parent_doc_id="100",
+                parent_doc_title="Company Policies",
+                section_heading="Refunds",
+            ),
+        ]
+        rag_result = _rag_result_with_docs(docs)
+        chunks = [_make_chunk()]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=rag_result)
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            result = await executor.execute(base_data, base_context)
+
+        # Must have documents, context, quality, metadata
+        assert "documents" in result
+        assert "context" in result
+        assert "quality" in result
+        assert "metadata" in result
+
+        # Documents should have citation info
+        assert len(result["documents"]) > 0
+        first_doc = result["documents"][0]
+        assert "citation_ref" in first_doc
+        assert "chunk_id" in first_doc
+
+        # Quality should be present
+        assert result["quality"]["quality"] in ("high", "medium", "low", "failed")
+
+    @pytest.mark.asyncio
+    async def test_does_not_return_stub_data(self, executor, base_context, base_data):
+        """Result must not contain the old hardcoded stub strings."""
+        chunks = [_make_chunk(content="Real data from DB")]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            result = await executor.execute(base_data, base_context)
+
+        # Must not contain old stub strings
+        context_str = result.get("context", "")
+        assert "Document 1 content" not in context_str
+        assert "Document 2 content" not in context_str
+
+
+# ---------------------------------------------------------------------------
+# TestRAGExecutorTenantFailureMode
+# ---------------------------------------------------------------------------
+
+class TestRAGExecutorTenantFailureMode:
+    """Test: executor respects tenant's rag_failure_mode setting."""
+
+    @pytest.mark.asyncio
+    async def test_strict_mode_refuses_on_low_quality(self, executor, base_context, base_data):
+        """Strict failure mode must refuse answer when quality is LOW."""
+        low_docs = [
+            Document(doc_id="d1", content="Marginal match", final_score=0.2),
+        ]
+        rag_result = _rag_result_with_docs(low_docs)
+        chunks = [_make_chunk()]
+        items = [_make_item()]
+        tenant = _make_tenant(settings={"rag_failure_mode": "strict"})
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=rag_result)
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            result = await executor.execute(base_data, base_context)
+
+        # Strict mode + LOW quality => refuse: empty documents
+        assert result["documents"] == []
+        assert result["quality"]["recommended_action"] == "refuse_answer"
+
+    @pytest.mark.asyncio
+    async def test_permissive_mode_warns_on_low_quality(self, executor, base_context, base_data):
+        """Permissive failure mode must return results with caveat for LOW quality."""
+        low_docs = [
+            Document(doc_id="d1", content="Marginal match", final_score=0.2),
+        ]
+        rag_result = _rag_result_with_docs(low_docs)
+        chunks = [_make_chunk()]
+        items = [_make_item()]
+        tenant = _make_tenant(settings={"rag_failure_mode": "permissive"})
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=rag_result)
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            result = await executor.execute(base_data, base_context)
+
+        # Permissive mode + LOW quality => warn: documents returned
+        assert len(result["documents"]) > 0
+        assert result["quality"]["recommended_action"] == "warn_user"
+
+    @pytest.mark.asyncio
+    async def test_default_failure_mode_is_permissive(self, executor, base_context, base_data):
+        """When rag_failure_mode is not set in tenant settings, default to permissive."""
+        low_docs = [
+            Document(doc_id="d1", content="Marginal match", final_score=0.2),
+        ]
+        rag_result = _rag_result_with_docs(low_docs)
+        chunks = [_make_chunk()]
+        items = [_make_item()]
+        tenant = _make_tenant(settings={})  # No rag_failure_mode set
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=rag_result)
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            result = await executor.execute(base_data, base_context)
+
+        # Default = permissive, so LOW quality => warn, not refuse
+        assert result["quality"]["recommended_action"] == "warn_user"
+
+
+# ---------------------------------------------------------------------------
+# TestRAGExecutorSessionLifecycle
+# ---------------------------------------------------------------------------
+
+class TestRAGExecutorSessionLifecycle:
+    """Test: executor creates AsyncSession scoped to request lifecycle."""
+
+    @pytest.mark.asyncio
+    async def test_session_opened_and_closed(self, executor, base_context, base_data):
+        """AsyncSession must be opened at start and closed at end of execute()."""
+        chunks = [_make_chunk()]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, session = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            await executor.execute(base_data, base_context)
+
+        ctx_mock.__aenter__.assert_called_once()
+        ctx_mock.__aexit__.assert_called_once()
+
+    @pytest.mark.asyncio
+    async def test_session_closed_on_error(self, executor, base_context, base_data):
+        """AsyncSession must be closed even if an error occurs during execution."""
+        chunks = [_make_chunk()]
+        items = [_make_item()]
+        tenant = _make_tenant()
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(side_effect=RuntimeError("retrieval error"))
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            # Should not raise — executor handles errors gracefully
+            result = await executor.execute(base_data, base_context)
+
+        # Session must still be closed
+        ctx_mock.__aexit__.assert_called_once()
+        # Engine cleanup must still be called
+        engine.cleanup.assert_called_once()
+        # Result should indicate failure
+        assert result["quality"]["quality"] == "failed"
+
+
+# ---------------------------------------------------------------------------
+# TestRAGExecutorEdgeCases
+# ---------------------------------------------------------------------------
+
+class TestRAGExecutorEdgeCases:
+    """Edge case tests."""
+
+    @pytest.mark.asyncio
+    async def test_missing_tenant_id_returns_error(self, executor, base_data):
+        """When tenant_id is None, executor returns error response."""
+        context = ExecutionContext(
+            user_id=42,
+            tenant_id=None,
+            workflow_id="wf-1",
+            execution_id="exec-1",
+        )
+        result = await executor.execute(base_data, context)
+        assert result["documents"] == []
+        assert result["quality"]["quality"] == "failed"
+        assert "tenant_id" in result["metadata"].get("error", "")
+
+    @pytest.mark.asyncio
+    async def test_no_chunks_found_returns_failed(self, executor, base_context, base_data):
+        """When no chunks exist for tenant, return FAILED quality."""
+        chunks = []  # No chunks
+        items = []
+        tenant = _make_tenant()
+        ctx_mock, _ = _patch_db(chunks, items, tenant)
+
+        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
+             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
+            engine = AsyncMock()
+            engine.retrieve = AsyncMock(return_value=RAGResult(query="test"))
+            engine.cleanup = AsyncMock()
+            engine.add_document = AsyncMock()
+            engine_cls.return_value = engine
+
+            result = await executor.execute(base_data, base_context)
+
+        assert result["documents"] == []
+        assert result["quality"]["quality"] == "failed"
diff --git a/specs/feature/018-SlideShowAndCanvasEdit/implementation-decision-log.md b/specs/feature/018-SlideShowAndCanvasEdit/implementation-decision-log.md
index e876e4e..eb75c31 100644
--- a/specs/feature/018-SlideShowAndCanvasEdit/implementation-decision-log.md
+++ b/specs/feature/018-SlideShowAndCanvasEdit/implementation-decision-log.md
@@ -209,3 +209,51 @@
 - decision_taken: `shared_schema_plus_service_guard`
 - mode_used: `auto`
 - rationale: Preserves deterministic contracts at API boundary while adding defense-in-depth for non-router call paths and oversized payload protection.
+
+## 2026-02-22 - Hardening Stream C - Durable Conversion and Tenant Integrity Enforcement
+- options_considered:
+  - `service_only_guards`: keep conversion idempotency/locking and tenant-link validation primarily in service logic
+  - `db_enforced_durable_state`: move conversion lock/idempotency to DB-backed state with TTL and enforce tenant/link integrity via schema constraints/migration
+- decision_taken: `db_enforced_durable_state`
+- mode_used: `auto`
+- rationale: Stream C explicitly targets multi-instance durability and schema-level integrity; DB-backed primitives reduce cross-process duplication risk and prevent cross-tenant linkage drift from non-service writes.
+
+## 2026-02-22 - Completeness Remediation - Conversion Fallback Activation Rule
+- options_considered:
+  - `implicit_fallback_on_partial_deps`: activate in-memory fallback whenever any dependency overrides are provided
+  - `explicit_fallback_flag`: require explicit `useInMemoryStateFallback=true` for in-memory fallback activation
+- decision_taken: `explicit_fallback_flag`
+- mode_used: `auto`
+- rationale: Prevents accidental production downgrade from durable DB-backed state when only partial dependency overrides are passed.
+
+## 2026-02-22 - Completeness Remediation - Migration Safety and Metadata Sync
+- options_considered:
+  - `direct_constraints`: add composite constraints with immediate validation only
+  - `safe_additive_constraints`: add constraints as `NOT VALID` with idempotent guards and synchronize drizzle meta snapshots/journal
+- decision_taken: `safe_additive_constraints`
+- mode_used: `auto`
+- rationale: Reduces rollout failure risk on legacy data while preserving enforcement for new writes and keeping migration metadata consistent for future tooling operations.
+
+## 2026-02-22 - Baseline Remediation - Skills API Compatibility Strategy
+- options_considered:
+  - `frontend_bypass`: weaken typing/cast to `any` in AdminSkills/SkillBrowser to bypass missing procedures
+  - `router_contract_restore`: restore missing `skills` router procedures and align mutation inputs with current UI usage
+- decision_taken: `router_contract_restore`
+- mode_used: `auto`
+- rationale: Preserves existing admin/group-sharing workflows and resolves compile failures without degrading type safety.
+
+## 2026-02-22 - Baseline Remediation - Prometheus Typing Strategy
+- options_considered:
+  - `remove_metrics_file`: disable or delete middleware not currently mounted
+  - `declare_missing_module`: keep middleware and add local module declaration for `prom-client`
+- decision_taken: `declare_missing_module`
+- mode_used: `auto`
+- rationale: Fixes compilation while preserving metrics middleware code path for future mount/activation.
+
+## 2026-02-22 - Baseline Remediation - Chat DB Nullability Handling
+- options_considered:
+  - `non_null_assertions`: force `getDb()` results with `!` assertions
+  - `explicit_runtime_guards`: validate DB availability and return structured internal errors
+- decision_taken: `explicit_runtime_guards`
+- mode_used: `auto`
+- rationale: Keeps strict null-safety and prevents hidden runtime crashes when DB bootstrap fails.
diff --git a/specs/feature/018-SlideShowAndCanvasEdit/implementation-progress.md b/specs/feature/018-SlideShowAndCanvasEdit/implementation-progress.md
index b32f9a8..0244d80 100644
--- a/specs/feature/018-SlideShowAndCanvasEdit/implementation-progress.md
+++ b/specs/feature/018-SlideShowAndCanvasEdit/implementation-progress.md
@@ -211,3 +211,87 @@
     - Stream B hardening target from `implementation-hardening-plan.md`
   - remaining:
     - Stream C hardening items from `implementation-hardening-plan.md`
+
+## Hardening Stream C - Durable Conversion State and DB Integrity
+- phase: `post-finalization-hardening`
+- scope: `stream-c-durable-conversion-and-tenant-integrity`
+- files_changed:
+  - `apps/web/drizzle/0033_presentation_hardening_stream_c.sql`
+  - `apps/web/drizzle/schema.ts`
+  - `apps/web/server/services/presentationPersistence.ts`
+  - `apps/web/server/services/presentationCompatibilityService.ts`
+  - `apps/web/server/services/presentationCompatibilityService.test.ts`
+  - `apps/web/server/services/presentationPersistence.test.ts`
+- test_command:
+  - `cd apps/web && npm test -- server/services/presentationCompatibilityService.test.ts`
+  - `cd apps/web && npm test -- server/services/presentationWorkflowRegression.test.ts server/services/presentationObservability.test.ts server/services/presentationPersistence.test.ts server/services/presentationPlaybackExport.test.ts server/routers/presentation.test.ts server/services/presentationService.test.ts`
+- pass_fail_summary:
+  - `pass`: `server/services/presentationCompatibilityService.test.ts` (6 tests)
+  - `pass`: focused presentation regression slice (`presentationWorkflowRegression.test.ts`, `presentationObservability.test.ts`, `presentationPersistence.test.ts`, `presentationPlaybackExport.test.ts`, `presentation.test.ts`, `presentationService.test.ts`) (43 tests)
+- notable_deviations:
+  - Runtime conversion state now defaults to DB-backed durable lock/idempotency storage with TTL; dependency-injected test paths use explicit in-memory fallback for deterministic unit isolation.
+- blocked_tasks_resolved_remaining:
+  - resolved:
+    - Stream C1 durable conversion idempotency/locking
+    - Stream C2 DB-level tenant/link integrity constraints for `presentation_asset_links`
+    - Stream C3 throttle key compaction follow-up (already implemented in Stream A and retained)
+  - remaining: none
+
+## Completeness Remediation Pass - Post Stream C
+- phase: `post-hardening-completeness-pass`
+- scope: `durable-fallback-safety + global-ttl-cleanup + migration-metadata-sync + presentation-type-alignment`
+- files_changed:
+  - `apps/web/server/services/presentationCompatibilityService.ts`
+  - `apps/web/server/services/presentationPersistence.ts`
+  - `apps/web/server/services/presentationCompatibilityService.test.ts`
+  - `apps/web/server/services/presentationWorkflowRegression.test.ts`
+  - `apps/web/server/services/presentationObservability.test.ts`
+  - `apps/web/client/src/lib/presentationEditorState.ts`
+  - `apps/web/client/src/pages/PresentationEditor.tsx`
+  - `apps/web/drizzle/0033_presentation_hardening_stream_c.sql`
+  - `apps/web/drizzle/meta/_journal.json`
+  - `apps/web/drizzle/meta/0032_snapshot.json`
+  - `apps/web/drizzle/meta/0033_snapshot.json`
+- test_command:
+  - `cd apps/web && npm test -- server/services/presentationCompatibilityService.test.ts server/services/presentationWorkflowRegression.test.ts server/services/presentationObservability.test.ts server/services/presentationPersistence.test.ts server/services/presentationPlaybackExport.test.ts server/routers/presentation.test.ts server/services/presentationService.test.ts client/src/pages/PresentationEditor.test.tsx client/src/lib/presentationEditorState.test.ts`
+  - `cd apps/web && npm run check`
+- pass_fail_summary:
+  - `pass`: focused presentation regression slice (9 files, 56 tests)
+  - `fail`: repo-wide type-check still fails due unrelated baseline errors outside presentation scope (for example `AdminSkills`, `SkillBrowser`, `prom-client` typing, nullable-db checks in chat router)
+- notable_deviations:
+  - Dependency-injected conversion fallback now requires explicit opt-in (`useInMemoryStateFallback`) to prevent accidental production downgrade from durable DB state.
+  - Added global expired-state cleanup for conversion locks/records and migration metadata sync via drizzle generate workflow.
+- blocked_tasks_resolved_remaining:
+  - resolved:
+    - previously identified completeness issues in Stream C implementation path
+  - remaining:
+    - repository-wide TypeScript baseline issues outside this feature scope
+
+## Baseline TypeScript Remediation Pass - Cross-Domain Cleanup
+- phase: `post-hardening-baseline-remediation`
+- scope: `admin-skills/skill-browser contracts + chat nullable-db guards + prom-client typing + ui strictness fixes`
+- files_changed:
+  - `apps/web/client/src/components/chat/ChatView.tsx`
+  - `apps/web/client/src/components/workflow/ConvertWithISCDialog.tsx`
+  - `apps/web/client/src/components/workflow/execution/ConsolePanel.tsx`
+  - `apps/web/client/src/hooks/useTenantPage.ts`
+  - `apps/web/client/src/pages/AdminSkills.tsx`
+  - `apps/web/client/src/pages/DocumentManagement.tsx`
+  - `apps/web/server/middleware/prometheusMetrics.ts`
+  - `apps/web/server/routers/chat.ts`
+  - `apps/web/server/routers/skills.ts`
+  - `apps/web/server/types/prom-client.d.ts`
+- test_command:
+  - `cd apps/web && npm run check --silent`
+  - `cd apps/web && npm test -- server/routers/chat.executeSkill.test.ts`
+- pass_fail_summary:
+  - `pass`: repository-wide TypeScript check now passes cleanly.
+  - `fail`: targeted chat execute-skill test file fails to load in current baseline due missing `@jest/globals` test dependency wiring (pre-existing environment/test harness issue).
+- notable_deviations:
+  - Restored missing `skills` router procedures consumed by existing UI (`listPending`, `approveSkill`, `rejectSkill`, `getSkillGroups`, `shareWithGroups`, `unshareGroup`) instead of suppressing frontend typing.
+  - Added explicit nullable DB guards in chat router execution paths.
+- blocked_tasks_resolved_remaining:
+  - resolved:
+    - previously listed repository-wide TS baseline issues (`AdminSkills`, `SkillBrowser`, `prom-client`, nullable DB checks in chat).
+  - remaining:
+    - none for TypeScript baseline.
diff --git a/specs/feature/019-RAG-MaturityAssessment/implementation/deep_implement_config.json b/specs/feature/019-RAG-MaturityAssessment/implementation/deep_implement_config.json
index ca6787d..d08ac33 100644
--- a/specs/feature/019-RAG-MaturityAssessment/implementation/deep_implement_config.json
+++ b/specs/feature/019-RAG-MaturityAssessment/implementation/deep_implement_config.json
@@ -20,6 +20,26 @@
     "section-01-acl-schema-and-scopes": {
       "status": "complete",
       "commit_hash": "5ddcfbf"
+    },
+    "section-02-scope-propagation": {
+      "status": "complete",
+      "commit_hash": "7677a99"
+    },
+    "smart-chunking": {
+      "status": "complete",
+      "commit_hash": "6b2181e"
+    },
+    "hybrid-search": {
+      "status": "complete",
+      "commit_hash": "33ef9f7"
+    },
+    "section-05-reranking": {
+      "status": "complete",
+      "commit_hash": "78d6e2f"
+    },
+    "section-06-guardrails-and-citations": {
+      "status": "complete",
+      "commit_hash": "c5b0eda"
     }
   },
   "pre_commit": {
diff --git a/specs/feature/019-RAG-MaturityAssessment/sections/section-02-scope-propagation.md b/specs/feature/019-RAG-MaturityAssessment/sections/section-02-scope-propagation.md
index 04d0bc6..01225c6 100644
--- a/specs/feature/019-RAG-MaturityAssessment/sections/section-02-scope-propagation.md
+++ b/specs/feature/019-RAG-MaturityAssessment/sections/section-02-scope-propagation.md
@@ -345,15 +345,35 @@ Look for the update function that handles `UpdateLibraryItemInput` (which includ
 
 ---
 
-## File Summary
+## File Summary (Actual Implementation)
 
 | File | Action | Purpose |
 |------|--------|---------|
-| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/scope_engine.py` | Modify (extend) | Add `propagate_scopes_to_vector_stores()`, `invalidate_rag_cache_for_item()`, `handle_permission_change()` |
-| `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` | Modify | Add `recomputeAndPropagateScopes()` utility, hook into `shareLibraryItem()`, `removeLibraryShare()`, `updateLibrarySharePermission()`, and visibility change in `updateLibraryItem()` |
-| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/backfill_allowed_scopes.py` | Create | Celery task for backfilling `allowed_scopes` on existing documents |
-| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_scope_propagation.py` | Create | Unit tests for scope propagation to vector stores |
-| `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_tenant_isolation.py` | Create | Integration tests for cross-tenant isolation |
+| `python-backend/app/orchestrator/rag/scope_engine.py` | Modified | Added `propagate_scopes_to_vector_stores()`, `invalidate_rag_cache_for_item()`, `handle_permission_change()` |
+| `python-backend/app/orchestrator/rag/__init__.py` | Modified | Added exports for 3 new functions |
+| `apps/web/server/services/libraryService.ts` | Modified | Added `recomputeAndPropagateScopes()` utility, hooked into `shareLibraryItem()`, `removeLibraryShare()`, `updateLibrarySharePermission()`, and visibility change in `updateLibraryItem()` |
+| `python-backend/app/tasks/backfill_allowed_scopes.py` | Created | Async utility for backfilling `allowed_scopes` on existing documents |
+| `python-backend/tests/orchestrator/rag/test_scope_propagation.py` | Created | 9 unit tests for scope propagation to vector stores |
+| `python-backend/tests/orchestrator/rag/test_tenant_isolation.py` | Created | 6 unit tests for cross-tenant isolation |
+| `python-backend/tests/orchestrator/rag/test_allowed_scopes.py` | Modified | Fixed subject_type from "tenant" to "tenant_role" |
+| `python-backend/app/api/v1/__init__.py` | Unchanged | No new v1 router (uses existing `internal_library.py`) |
+
+**NOT created (per code review):**
+- `python-backend/app/api/v1/rag_scopes.py` — Deleted. Existing `app/api/internal_library.py` already provides this endpoint with proper auth (`secrets.compare_digest` + `SMARTSPEC_PROXY_TOKEN`).
+
+---
+
+## Deviations from Plan
+
+1. **No new internal API endpoint**: Plan called for creating `/api/v1/rag/internal/propagate-scopes`. Existing `internal_library.py` already provides `/api/internal/library/propagate-scopes` with proper token-based auth. TypeScript side calls this existing endpoint instead.
+
+2. **Backfill is async utility, not Celery task**: Plan suggested a Celery task or management command. Implementation is a plain `async def` function that can be called from any context. Celery wrapper can be added later if needed.
+
+3. **subject_type mapping fixed**: Plan referenced `"tenant"` for subject_type, but the actual DB stores `"tenant_role"`. Fixed to use `"tenant_role"` in the prefix mapping.
+
+4. **chunk_ids parameter dropped**: Plan's `propagate_scopes_to_vector_stores()` signature included `chunk_ids: list[str]`. Implementation queries chunk IDs from the database instead, which is more correct (avoids stale chunk_id lists).
+
+5. **Tenant filter added to chunk queries**: Code review caught a missing defense-in-depth `tenant_id` filter on the chunk lookup SQL. Added for both Python and TypeScript sides.
 
 ---
 
@@ -363,8 +383,14 @@ Look for the update function that handles `UpdateLibraryItemInput` (which includ
 
 2. **Immediate revocation**: When a permission is removed, the SQL UPDATE to `allowed_scopes` happens in the same request. Cache invalidation also happens immediately. There is no window where a revoked user can still retrieve the document through stale cache.
 
-3. **Cloudflare Vectorize delete+re-insert**: Cloudflare Vectorize does not support in-place metadata updates. The propagation function must fetch existing vectors, delete them, and re-insert with updated metadata. This is batched per item for efficiency.
+3. **Cloudflare Vectorize delete+re-insert**: Cloudflare Vectorize does not support in-place metadata updates. The propagation function fetches existing vectors, deletes them, and re-inserts with updated metadata.
+
+4. **Fire-and-forget Python call**: The Node.js to Python HTTP call for vector store propagation is non-blocking. If `SMARTSPEC_PROXY_TOKEN` is not configured, no call is made. If it fails, the system still works correctly because the RAG pipeline reads `allowed_scopes` from PostgreSQL for filtering.
+
+5. **Backfill as separate operation**: Backfill of existing documents is a batch operation run once after the `allowed_scopes` column is added. It is idempotent.
 
-4. **Fire-and-forget Python call**: The Node.js to Python HTTP call for vector store propagation is non-blocking. If it fails, the system still works correctly because the RAG pipeline reads `allowed_scopes` from PostgreSQL for filtering. The vector store metadata is a performance optimization (enables pre-filtering in vector search), not the source of truth.
+## Test Coverage
 
-5. **Backfill as separate operation**: Backfill of existing documents is a batch operation run once after the `allowed_scopes` column is added. It is idempotent -- running it multiple times produces the same result. New documents created after Section 01 is deployed will already have correct `allowed_scopes` set at creation time.
\ No newline at end of file
+- 152 total RAG tests pass (including 15 new tests from this section)
+- 9 scope propagation tests: pgvector, chromadb, cloudflare, no-chunks, provider-error-isolation, cache invalidation, handle_permission_change orchestration
+- 6 tenant isolation tests: cross-tenant scope separation, group membership enforcement, pending member exclusion, immediate revocation, public doc access
\ No newline at end of file
