diff --git a/.claude/settings.local.json b/.claude/settings.local.json
index 8005c60..9775ff8 100644
--- a/.claude/settings.local.json
+++ b/.claude/settings.local.json
@@ -384,7 +384,10 @@
       "Bash(npm run:*)",
       "Bash(npx drizzle-kit generate:*)",
       "Bash(npx drizzle-kit migrate:*)",
-      "Bash(git reset:*)"
+      "Bash(git reset:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/specs/feature/009-sharefile/implementation/code_review/section-07-review.md << 'REVIEWEOF'\n# Code Review: Section 07 - Group Management UI\n\n## HIGH Severity\n\n### ISSUE 1: SQL Wildcard Injection in searchTenantUsers\n- **File:** groupsService.ts \\(searchTenantUsers\\)\n- `%${query.trim\\(\\)}%` does not escape SQL wildcards \\(`%`, `_`\\). Users can search `%` to list all tenant users.\n- **Fix:** Escape wildcards before building search pattern.\n\n### ISSUE 2: searchTenantUsers lacks group admin authorization\n- **File:** groups.ts router \\(searchTenantUsers\\)\n- Any authenticated user can search the full tenant user directory. Plan says this is for AddMemberDialog \\(admin-only\\).\n- **Fix:** Make excludeGroupId required, verify caller is admin/owner of that group.\n\n### ISSUE 3: getGroupMembers lacks membership check\n- **File:** groupsService.ts \\(getGroupMembers\\)\n- Only verifies group exists in tenant, not that caller is a member. Any auth user can list members \\(including emails\\) of any group in tenant.\n- **Fix:** Add membership check after group retrieval.\n\n### ISSUE 4: All tests are todo stubs\n- **File:** All 5 test files\n- Zero actual test implementations. Plan specifies 80%+ coverage.\n- **Fix:** Tests are stubs pending jsdom environment config \\(section-11\\).\n\n## MEDIUM Severity\n\n### ISSUE 5: Routes not using protectedRoute wrapper\n- **File:** App.tsx\n- Plan specifies using `protectedRoute` wrapper, but routes are plain `<Route>`. GroupDetailPanel has no auth redirect at all.\n- **Fix:** Add auth check to GroupDetailPanel.\n\n### ISSUE 6: trpcUtils declared after usage in GroupDiscovery\n- **File:** GroupDiscovery.tsx\n- `const trpcUtils = trpc.useUtils\\(\\)` called after mutations that reference it.\n- **Fix:** Move to before mutation declarations.\n\n### ISSUE 7: GroupDetailPanel settings cast without null guard\n- **File:** GroupDetailPanel.tsx\n- `group.settings as { visibility, joinPolicy }` could crash if settings is null.\n- **Fix:** Add fallback defaults.\n\n### ISSUE 8: Client-side sorting defeats server pagination\n- **File:** GroupDiscovery.tsx\n- \"Recently Created\" sort only re-sorts current page, not actual recent groups.\n- **Note:** Acceptable MVP limitation, server sort can be added later.\n\n### ISSUE 9-10: Missing debounce on search inputs\n- **Files:** GroupDiscovery.tsx, GroupManagement.tsx \\(Public Groups tab\\)\n- Search triggers API on every keystroke.\n- **Fix:** Add debounce like AddMemberDialog.\n\n### ISSUE 11: Pagination heuristic with exactly 20 results\n- **File:** GroupDiscovery.tsx\n- Next button shown when exactly 20 results, may lead to empty next page.\n- **Note:** Minor UX issue, acceptable for MVP.\n\n## LOW Severity\n\n### ISSUE 12: Missing aria-label on search inputs\n### ISSUE 13: Native radio buttons instead of Radix RadioGroup\n### ISSUE 14: GroupDetailPanel uses default export \\(inconsistent\\)\n### ISSUE 15: JoinPolicyBadge logic duplicated\n### ISSUE 16: Approve/Reject disables all rows simultaneously\n### ISSUE 17: Remove member has no confirmation dialog\n### ISSUE 18: NaN groupId shows infinite loading\nREVIEWEOF)",
+      "Bash(/home/dev/projects/SmartSpecPro/specs/feature/009-sharefile/implementation/code_review/section-07-interview.md << 'INTERVIEWEOF'\n# Section 07: Code Review Interview\n\n## Auto-Fixed Issues\n\n### ISSUE 1: SQL Wildcard Injection \\(HIGH\\) - AUTO-FIXED\n- Escaped `%` and `_` in `searchTenantUsers` search pattern to prevent wildcard-based user enumeration.\n\n### ISSUE 3: getGroupMembers lacks membership check \\(HIGH\\) - AUTO-FIXED\n- Added active membership verification before returning group members. Non-members now get FORBIDDEN error.\n\n### ISSUE 5: GroupDetailPanel missing auth check \\(MEDIUM\\) - AUTO-FIXED\n- Added `isAuthenticated` check with redirect to `/login`.\n\n### ISSUE 6: trpcUtils ordering in GroupDiscovery \\(MEDIUM\\) - AUTO-FIXED\n- Moved `trpc.useUtils\\(\\)` call before mutation declarations.\n\n### ISSUE 7: Settings cast null guard \\(MEDIUM\\) - AUTO-FIXED\n- Added fallback defaults for `group.settings` before type cast.\n\n### ISSUE 18: NaN groupId handling \\(LOW\\) - AUTO-FIXED\n- Added early return with error message for invalid group IDs.\n\n## User Decisions\n\n### ISSUE 2: searchTenantUsers authorization \\(HIGH\\)\n- **Decision:** Leave as-is \\(any authenticated tenant user can search\\)\n- **Rationale:** Consistent with existing `follows.searchUsers` endpoint pattern. Tenant-scoped user search is acceptable for this application.\n\n## Deferred to Later Sections\n\n### ISSUE 4: Test stubs \\(HIGH\\)\n- All component tests are `.todo\\(\\)` stubs. Will be implemented in section-11-security-tests when jsdom environment is configured.\n\n### ISSUE 8-11: Sort/debounce/pagination \\(MEDIUM\\)\n- Client-side sort and missing debounce are acceptable MVP limitations. Server-side sort parameter and debounce can be added in optimization section.\n\n### ISSUE 12-17: Low severity items\n- Aria labels, Radix RadioGroup, export consistency, duplicated badge, row-level pending state, member removal confirmation - all deferred as non-blocking for MVP.\nINTERVIEWEOF)",
+      "Bash(npm run test:*)"
     ]
   }
 }
diff --git a/apps/web/client/src/components/library/DocumentPreviewPanel.tsx b/apps/web/client/src/components/library/DocumentPreviewPanel.tsx
index d176ac2..98b9d23 100644
--- a/apps/web/client/src/components/library/DocumentPreviewPanel.tsx
+++ b/apps/web/client/src/components/library/DocumentPreviewPanel.tsx
@@ -4,12 +4,15 @@ import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import type { DocumentLibraryItem, DocumentPreviewType } from "@/lib/documentManagementUi";
 import { getOfficePreviewDecision } from "@/lib/previewHostSafety";
+import { trpc } from "@/lib/trpc";
 import { Check, ExternalLink, Pencil, X } from "lucide-react";
 import MarkdownFileEditor from "./MarkdownFileEditor";
 import CodeViewer from "./CodeViewer";
 import CSVViewer from "./CSVViewer";
 import JSONViewer from "./JSONViewer";
 import ExcelViewer from "./ExcelViewer";
+import { ShareButton } from "./ShareButton";
+import { ShareDialog } from "./ShareDialog";
 
 interface DocumentPreviewPanelProps {
   item: DocumentLibraryItem | null;
@@ -53,6 +56,12 @@ export default function DocumentPreviewPanel({
   const [previewLoadError, setPreviewLoadError] = useState<string | null>(null);
   const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
   const [isPdfLoading, setIsPdfLoading] = useState(false);
+  const [shareDialogOpen, setShareDialogOpen] = useState(false);
+
+  const { data: sharesData } = trpc.library.getItemShares.useQuery(
+    { itemId: item?.id ?? 0 },
+    { enabled: Boolean(item?.id) },
+  );
 
   useEffect(() => {
     setTitleDraft(item?.title || "");
@@ -212,14 +221,21 @@ export default function DocumentPreviewPanel({
               <Badge variant="outline">{item.status}</Badge>
             </div>
           </div>
-          {sourceUrl ? (
-            <Button asChild size="sm" variant="outline">
-              <a href={sourceUrl} target="_blank" rel="noreferrer" download>
-                <ExternalLink className="mr-1 h-4 w-4" />
-                Download File
-              </a>
-            </Button>
-          ) : null}
+          <div className="flex shrink-0 items-center gap-2">
+            <ShareButton
+              itemId={item.id}
+              shareCount={sharesData?.shares?.length ?? 0}
+              onOpenDialog={() => setShareDialogOpen(true)}
+            />
+            {sourceUrl ? (
+              <Button asChild size="sm" variant="outline">
+                <a href={sourceUrl} target="_blank" rel="noreferrer" download>
+                  <ExternalLink className="mr-1 h-4 w-4" />
+                  Download File
+                </a>
+              </Button>
+            ) : null}
+          </div>
         </div>
       </div>
 
@@ -384,6 +400,13 @@ export default function DocumentPreviewPanel({
           )}
         </div>
       ) : null}
+
+      <ShareDialog
+        itemId={item.id}
+        itemTitle={item.title}
+        isOpen={shareDialogOpen}
+        onClose={() => setShareDialogOpen(false)}
+      />
     </div>
   );
 }
diff --git a/apps/web/client/src/components/library/PermissionBadge.test.ts b/apps/web/client/src/components/library/PermissionBadge.test.ts
new file mode 100644
index 0000000..6a71e96
--- /dev/null
+++ b/apps/web/client/src/components/library/PermissionBadge.test.ts
@@ -0,0 +1,87 @@
+import React from "react";
+import { renderToStaticMarkup } from "react-dom/server";
+import { describe, expect, it, vi } from "vitest";
+
+// Mock lucide-react icons
+vi.mock("lucide-react", () => ({
+  Eye: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "icon-eye" }),
+  Pencil: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "icon-pencil" }),
+  Trash2: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "icon-trash2" }),
+  Crown: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "icon-crown" }),
+}));
+
+import { PermissionBadge } from "./PermissionBadge";
+
+describe("PermissionBadge", () => {
+  it('renders "read" badge with blue color and eye icon', () => {
+    const html = renderToStaticMarkup(
+      React.createElement(PermissionBadge, { level: "read" }),
+    );
+    expect(html).toContain("bg-blue-100");
+    expect(html).toContain("text-blue-700");
+    expect(html).toContain("icon-eye");
+    expect(html).toContain("Read Only");
+  });
+
+  it('renders "write" badge with green color and pencil icon', () => {
+    const html = renderToStaticMarkup(
+      React.createElement(PermissionBadge, { level: "write" }),
+    );
+    expect(html).toContain("bg-green-100");
+    expect(html).toContain("text-green-700");
+    expect(html).toContain("icon-pencil");
+    expect(html).toContain("Can Edit");
+  });
+
+  it('renders "delete" badge with orange color and trash icon', () => {
+    const html = renderToStaticMarkup(
+      React.createElement(PermissionBadge, { level: "delete" }),
+    );
+    expect(html).toContain("bg-orange-100");
+    expect(html).toContain("text-orange-700");
+    expect(html).toContain("icon-trash2");
+    expect(html).toContain("Can Delete");
+  });
+
+  it('renders "owner" badge with purple color and crown icon', () => {
+    const html = renderToStaticMarkup(
+      React.createElement(PermissionBadge, { level: "owner" }),
+    );
+    expect(html).toContain("bg-purple-100");
+    expect(html).toContain("text-purple-700");
+    expect(html).toContain("icon-crown");
+    expect(html).toContain("Owner");
+  });
+
+  it('has correct ARIA attributes (role="status", aria-label)', () => {
+    const html = renderToStaticMarkup(
+      React.createElement(PermissionBadge, { level: "read" }),
+    );
+    expect(html).toContain('role="status"');
+    expect(html).toContain('aria-label="Read Only access"');
+  });
+
+  it('icon has aria-hidden="true"', () => {
+    const html = renderToStaticMarkup(
+      React.createElement(PermissionBadge, { level: "read" }),
+    );
+    expect(html).toContain('aria-hidden="true"');
+  });
+
+  it("uses custom label when provided", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(PermissionBadge, {
+        level: "read",
+        label: "View Only",
+      }),
+    );
+    expect(html).toContain("View Only");
+    // The aria-label still says "Read Only access" but the visible text should be "View Only"
+    expect(html).toContain("<span>View Only</span>");
+    expect(html).not.toContain("<span>Read Only</span>");
+  });
+});
diff --git a/apps/web/client/src/components/library/PermissionBadge.tsx b/apps/web/client/src/components/library/PermissionBadge.tsx
new file mode 100644
index 0000000..e39cb01
--- /dev/null
+++ b/apps/web/client/src/components/library/PermissionBadge.tsx
@@ -0,0 +1,52 @@
+import React from "react";
+import { Eye, Pencil, Trash2, Crown } from "lucide-react";
+
+const permissionConfig = {
+  read: {
+    icon: Eye,
+    defaultLabel: "Read Only",
+    ariaLabel: "Read Only access",
+    classes: "bg-blue-100 text-blue-700",
+  },
+  write: {
+    icon: Pencil,
+    defaultLabel: "Can Edit",
+    ariaLabel: "Can Edit access",
+    classes: "bg-green-100 text-green-700",
+  },
+  delete: {
+    icon: Trash2,
+    defaultLabel: "Can Delete",
+    ariaLabel: "Can Delete access",
+    classes: "bg-orange-100 text-orange-700",
+  },
+  owner: {
+    icon: Crown,
+    defaultLabel: "Owner",
+    ariaLabel: "Owner access",
+    classes: "bg-purple-100 text-purple-700",
+  },
+} as const;
+
+export type PermissionLevel = keyof typeof permissionConfig;
+
+interface PermissionBadgeProps {
+  level: PermissionLevel;
+  label?: string;
+}
+
+export function PermissionBadge({ level, label }: PermissionBadgeProps) {
+  const config = permissionConfig[level];
+  const Icon = config.icon;
+
+  return (
+    <span
+      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${config.classes}`}
+      role="status"
+      aria-label={config.ariaLabel}
+    >
+      <Icon aria-hidden="true" className="h-3 w-3" />
+      <span>{label || config.defaultLabel}</span>
+    </span>
+  );
+}
diff --git a/apps/web/client/src/components/library/ShareButton.test.ts b/apps/web/client/src/components/library/ShareButton.test.ts
new file mode 100644
index 0000000..c445263
--- /dev/null
+++ b/apps/web/client/src/components/library/ShareButton.test.ts
@@ -0,0 +1,97 @@
+import React from "react";
+import { renderToStaticMarkup } from "react-dom/server";
+import { describe, expect, it, vi } from "vitest";
+
+// Mock UI components
+vi.mock("@/components/ui/button", () => ({
+  Button: (props: Record<string, unknown>) => {
+    const { children, ...rest } = props;
+    return React.createElement("button", rest, children as React.ReactNode);
+  },
+}));
+
+vi.mock("@/components/ui/tooltip", () => ({
+  Tooltip: (props: Record<string, unknown>) =>
+    React.createElement("div", { "data-testid": "tooltip" }, props.children as React.ReactNode),
+  TooltipTrigger: (props: Record<string, unknown>) =>
+    React.createElement("div", { "data-testid": "tooltip-trigger" }, props.children as React.ReactNode),
+  TooltipContent: (props: Record<string, unknown>) =>
+    React.createElement("div", { "data-testid": "tooltip-content" }, props.children as React.ReactNode),
+}));
+
+vi.mock("lucide-react", () => ({
+  Share2: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "icon-share2" }),
+}));
+
+import { ShareButton } from "./ShareButton";
+
+describe("ShareButton", () => {
+  it("renders share icon button", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareButton, {
+        itemId: 1,
+        shareCount: 0,
+        onOpenDialog: vi.fn(),
+      }),
+    );
+    expect(html).toContain("icon-share2");
+    expect(html).toContain("Share");
+  });
+
+  it("shows badge with share count when shares exist", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareButton, {
+        itemId: 1,
+        shareCount: 3,
+        onOpenDialog: vi.fn(),
+      }),
+    );
+    expect(html).toContain(">3</span>");
+  });
+
+  it("does not show badge when share count is 0", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareButton, {
+        itemId: 1,
+        shareCount: 0,
+        onOpenDialog: vi.fn(),
+      }),
+    );
+    expect(html).not.toContain("bg-blue-500");
+  });
+
+  it("has accessible aria-label with share count", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareButton, {
+        itemId: 1,
+        shareCount: 5,
+        onOpenDialog: vi.fn(),
+      }),
+    );
+    expect(html).toContain('aria-label="Share file (5 shares)"');
+  });
+
+  it("has accessible aria-label without count when no shares", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareButton, {
+        itemId: 1,
+        shareCount: 0,
+        onOpenDialog: vi.fn(),
+      }),
+    );
+    expect(html).toContain('aria-label="Share file"');
+  });
+
+  it("has tooltip text", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareButton, {
+        itemId: 1,
+        shareCount: 2,
+        onOpenDialog: vi.fn(),
+      }),
+    );
+    expect(html).toContain("tooltip-content");
+    expect(html).toContain("Share file (2 shares)");
+  });
+});
diff --git a/apps/web/client/src/components/library/ShareButton.tsx b/apps/web/client/src/components/library/ShareButton.tsx
new file mode 100644
index 0000000..807da47
--- /dev/null
+++ b/apps/web/client/src/components/library/ShareButton.tsx
@@ -0,0 +1,48 @@
+import React from "react";
+import { Share2 } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import {
+  Tooltip,
+  TooltipContent,
+  TooltipTrigger,
+} from "@/components/ui/tooltip";
+
+interface ShareButtonProps {
+  itemId: number;
+  shareCount: number;
+  onOpenDialog: () => void;
+}
+
+export function ShareButton({
+  shareCount,
+  onOpenDialog,
+}: ShareButtonProps) {
+  const label =
+    shareCount > 0
+      ? `Share file (${shareCount} shares)`
+      : "Share file";
+
+  return (
+    <Tooltip>
+      <TooltipTrigger asChild>
+        <Button
+          type="button"
+          size="sm"
+          variant="outline"
+          className="relative"
+          onClick={onOpenDialog}
+          aria-label={label}
+        >
+          <Share2 className="mr-1 h-4 w-4" />
+          Share
+          {shareCount > 0 ? (
+            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white">
+              {shareCount}
+            </span>
+          ) : null}
+        </Button>
+      </TooltipTrigger>
+      <TooltipContent>{label}</TooltipContent>
+    </Tooltip>
+  );
+}
diff --git a/apps/web/client/src/components/library/ShareDialog.test.ts b/apps/web/client/src/components/library/ShareDialog.test.ts
new file mode 100644
index 0000000..9d1233f
--- /dev/null
+++ b/apps/web/client/src/components/library/ShareDialog.test.ts
@@ -0,0 +1,349 @@
+import React from "react";
+import { renderToStaticMarkup } from "react-dom/server";
+import { describe, expect, it, vi, beforeEach } from "vitest";
+
+// Hoist mock functions before vi.mock() calls
+const { mockUseQuery, mockUseMutation, mockInvalidate } = vi.hoisted(() => ({
+  mockUseQuery: vi.fn().mockReturnValue({ data: null, isLoading: false }),
+  mockUseMutation: vi.fn().mockReturnValue({
+    mutate: vi.fn(),
+    isPending: false,
+  }),
+  mockInvalidate: vi.fn(),
+}));
+
+// Mock UI components
+vi.mock("@/components/ui/button", () => ({
+  Button: (props: Record<string, unknown>) => {
+    const { children, ...rest } = props;
+    return React.createElement("button", rest, children as React.ReactNode);
+  },
+}));
+
+vi.mock("@/components/ui/dialog", () => ({
+  Dialog: (props: Record<string, unknown>) => {
+    if (!props.open) return null;
+    return React.createElement("div", { "data-testid": "dialog" }, props.children as React.ReactNode);
+  },
+  DialogContent: (props: Record<string, unknown>) =>
+    React.createElement("div", { "data-testid": "dialog-content" }, props.children as React.ReactNode),
+  DialogHeader: (props: Record<string, unknown>) =>
+    React.createElement("div", { "data-testid": "dialog-header" }, props.children as React.ReactNode),
+  DialogTitle: (props: Record<string, unknown>) =>
+    React.createElement("h2", {}, props.children as React.ReactNode),
+  DialogDescription: (props: Record<string, unknown>) =>
+    React.createElement("p", {}, props.children as React.ReactNode),
+  DialogFooter: (props: Record<string, unknown>) =>
+    React.createElement("div", { "data-testid": "dialog-footer" }, props.children as React.ReactNode),
+}));
+
+vi.mock("@/components/ui/input", () => ({
+  Input: (props: Record<string, unknown>) =>
+    React.createElement("input", props),
+}));
+
+vi.mock("@/components/ui/label", () => ({
+  Label: (props: Record<string, unknown>) =>
+    React.createElement("label", {}, props.children as React.ReactNode),
+}));
+
+vi.mock("@/components/ui/select", () => ({
+  Select: (props: Record<string, unknown>) =>
+    React.createElement("div", { "data-testid": "select" }, props.children as React.ReactNode),
+  SelectContent: (props: Record<string, unknown>) =>
+    React.createElement("div", { "data-testid": "select-content" }, props.children as React.ReactNode),
+  SelectItem: (props: Record<string, unknown>) =>
+    React.createElement("option", { value: props.value as string }, props.children as React.ReactNode),
+  SelectTrigger: (props: Record<string, unknown>) =>
+    React.createElement("div", { "data-testid": "select-trigger", "aria-label": props["aria-label"] as string }, props.children as React.ReactNode),
+  SelectValue: (props: Record<string, unknown>) =>
+    React.createElement("span", {}, (props.placeholder ?? "") as string),
+}));
+
+vi.mock("sonner", () => ({
+  toast: { success: vi.fn(), error: vi.fn() },
+}));
+
+vi.mock("lucide-react", () => ({
+  Loader2: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "loader" }),
+  Search: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "icon-search" }),
+  Users: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "icon-users" }),
+  X: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "icon-x" }),
+}));
+
+// Mock PermissionBadge
+vi.mock("./PermissionBadge", () => ({
+  PermissionBadge: (props: Record<string, unknown>) =>
+    React.createElement("span", { "data-testid": `badge-${props.level}` }, props.level as string),
+}));
+
+// Mock tRPC with hoisted functions
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    useUtils: () => ({
+      library: {
+        getItemShares: { invalidate: mockInvalidate },
+      },
+    }),
+    library: {
+      getItemShares: { useQuery: mockUseQuery },
+      shareItem: { useMutation: mockUseMutation },
+      removeShare: { useMutation: mockUseMutation },
+      updateSharePermission: { useMutation: mockUseMutation },
+    },
+    groups: {
+      list: { useQuery: mockUseQuery },
+      searchTenantUsers: { useQuery: mockUseQuery },
+    },
+  },
+}));
+
+import { ShareDialog } from "./ShareDialog";
+
+beforeEach(() => {
+  mockUseQuery.mockReturnValue({ data: null, isLoading: false });
+  mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
+});
+
+describe("ShareDialog", () => {
+  it("renders when open", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toContain("dialog");
+    expect(html).toContain("Add people or groups");
+  });
+
+  it("does not render when closed", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: false,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toBe("");
+  });
+
+  it("renders user search input (separate from groups)", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toContain("Search by name or email");
+    expect(html).toContain("Search for people");
+  });
+
+  it("renders group dropdown (separate from users)", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toContain("Or select a group");
+    expect(html).toContain("Select group...");
+  });
+
+  it("renders permission level selector", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toContain("Permission level");
+    expect(html).toContain("Read Only");
+    expect(html).toContain("Can Edit");
+    expect(html).toContain("Can Delete");
+  });
+
+  it("renders 'Who has access' section", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toContain("Who has access");
+  });
+
+  it("shows 'No shares yet' when no shares exist", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toContain("No shares yet");
+  });
+
+  it("renders dialog title with item title", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        itemTitle: "My Document.pdf",
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toContain('Share &quot;My Document.pdf&quot;');
+  });
+
+  it("renders Close button in footer", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toContain("Close");
+    expect(html).toContain("dialog-footer");
+  });
+
+  it("has accessible ARIA labels on inputs", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toContain('aria-label="Search for users to share with"');
+    expect(html).toContain('aria-label="Select group to share with"');
+    expect(html).toContain('aria-label="Permission level"');
+  });
+
+  it("renders Add button", () => {
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+    expect(html).toContain(">Add</button>");
+  });
+});
+
+describe("ShareDialog - shares display", () => {
+  it("shows owner row with owner badge", () => {
+    mockUseQuery.mockImplementation((input: unknown) => {
+      if (input && typeof input === "object" && "itemId" in (input as Record<string, unknown>)) {
+        return {
+          data: {
+            shares: [
+              {
+                id: 1,
+                subjectType: "user",
+                subjectId: "42",
+                permissionLevel: "owner",
+                expiresAt: null,
+                userName: "John Owner",
+              },
+            ],
+          },
+          isLoading: false,
+        };
+      }
+      return { data: null, isLoading: false };
+    });
+
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+
+    expect(html).toContain("John Owner");
+    expect(html).toContain("badge-owner");
+    expect(html).toContain("Cannot remove owner");
+  });
+
+  it("shows user shares with permission selector", () => {
+    mockUseQuery.mockImplementation((input: unknown) => {
+      if (input && typeof input === "object" && "itemId" in (input as Record<string, unknown>)) {
+        return {
+          data: {
+            shares: [
+              {
+                id: 2,
+                subjectType: "user",
+                subjectId: "10",
+                permissionLevel: "write",
+                expiresAt: null,
+                userName: "Jane Editor",
+              },
+            ],
+          },
+          isLoading: false,
+        };
+      }
+      return { data: null, isLoading: false };
+    });
+
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+
+    expect(html).toContain("Jane Editor");
+    expect(html).toContain("Remove access for Jane Editor");
+  });
+
+  it("shows group shares with group icon", () => {
+    mockUseQuery.mockImplementation((input: unknown) => {
+      if (input && typeof input === "object" && "itemId" in (input as Record<string, unknown>)) {
+        return {
+          data: {
+            shares: [
+              {
+                id: 3,
+                subjectType: "group",
+                subjectId: "5",
+                permissionLevel: "read",
+                expiresAt: null,
+                groupName: "Marketing Team",
+              },
+            ],
+          },
+          isLoading: false,
+        };
+      }
+      return { data: null, isLoading: false };
+    });
+
+    const html = renderToStaticMarkup(
+      React.createElement(ShareDialog, {
+        itemId: 1,
+        isOpen: true,
+        onClose: vi.fn(),
+      }),
+    );
+
+    expect(html).toContain("Marketing Team");
+    expect(html).toContain("icon-users");
+    expect(html).toContain("Group");
+  });
+});
diff --git a/apps/web/client/src/components/library/ShareDialog.tsx b/apps/web/client/src/components/library/ShareDialog.tsx
new file mode 100644
index 0000000..61960f4
--- /dev/null
+++ b/apps/web/client/src/components/library/ShareDialog.tsx
@@ -0,0 +1,460 @@
+import React, { useState, useEffect, useRef } from "react";
+import { Loader2, Search, Users, X } from "lucide-react";
+import { toast } from "sonner";
+
+import { Button } from "@/components/ui/button";
+import {
+  Dialog,
+  DialogContent,
+  DialogDescription,
+  DialogFooter,
+  DialogHeader,
+  DialogTitle,
+} from "@/components/ui/dialog";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import { trpc } from "@/lib/trpc";
+import { PermissionBadge } from "./PermissionBadge";
+import type { PermissionLevel } from "./PermissionBadge";
+
+interface ShareDialogProps {
+  itemId: number;
+  itemTitle?: string;
+  isOpen: boolean;
+  onClose: () => void;
+}
+
+type SharePermission = "read" | "write" | "delete";
+
+export function ShareDialog({
+  itemId,
+  itemTitle,
+  isOpen,
+  onClose,
+}: ShareDialogProps) {
+  const trpcUtils = trpc.useUtils();
+
+  const [searchQuery, setSearchQuery] = useState("");
+  const [debouncedQuery, setDebouncedQuery] = useState("");
+  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
+  const [selectedUserName, setSelectedUserName] = useState<string>("");
+  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
+  const [selectedPermission, setSelectedPermission] =
+    useState<SharePermission>("read");
+  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
+
+  // Reset state when dialog closes
+  useEffect(() => {
+    if (!isOpen) {
+      setSearchQuery("");
+      setDebouncedQuery("");
+      setSelectedUserId(null);
+      setSelectedUserName("");
+      setSelectedGroupId("");
+      setSelectedPermission("read");
+    }
+  }, [isOpen]);
+
+  // Debounce user search
+  useEffect(() => {
+    clearTimeout(debounceTimerRef.current);
+    debounceTimerRef.current = setTimeout(() => {
+      setDebouncedQuery(searchQuery);
+    }, 300);
+    return () => clearTimeout(debounceTimerRef.current);
+  }, [searchQuery]);
+
+  // Queries
+  const { data: sharesData, isLoading: isLoadingShares } =
+    trpc.library.getItemShares.useQuery(
+      { itemId },
+      { enabled: isOpen && itemId > 0 },
+    );
+
+  const { data: groups } = trpc.groups.list.useQuery(
+    { scope: "all" },
+    { enabled: isOpen },
+  );
+
+  const { data: userResults, isLoading: isSearchingUsers } =
+    trpc.groups.searchTenantUsers.useQuery(
+      { query: debouncedQuery, limit: 10 },
+      { enabled: debouncedQuery.length >= 2 },
+    );
+
+  // Mutations
+  const shareItemMutation = trpc.library.shareItem.useMutation({
+    onSuccess: () => {
+      toast.success("Share added");
+      trpcUtils.library.getItemShares.invalidate({ itemId });
+      setSelectedUserId(null);
+      setSelectedUserName("");
+      setSelectedGroupId("");
+      setSearchQuery("");
+      setDebouncedQuery("");
+    },
+    onError: (error) => {
+      toast.error(error.message || "Failed to add share");
+    },
+  });
+
+  const removeShareMutation = trpc.library.removeShare.useMutation({
+    onSuccess: () => {
+      toast.success("Share removed");
+      trpcUtils.library.getItemShares.invalidate({ itemId });
+    },
+    onError: (error) => {
+      toast.error(error.message || "Failed to remove share");
+    },
+  });
+
+  const updatePermissionMutation =
+    trpc.library.updateSharePermission.useMutation({
+      onSuccess: () => {
+        toast.success("Permission updated");
+        trpcUtils.library.getItemShares.invalidate({ itemId });
+      },
+      onError: (error) => {
+        toast.error(error.message || "Failed to update permission");
+      },
+    });
+
+  const shares = sharesData?.shares ?? [];
+  const isMutating =
+    shareItemMutation.isPending ||
+    removeShareMutation.isPending ||
+    updatePermissionMutation.isPending;
+
+  function handleAddShare() {
+    if (selectedGroupId) {
+      shareItemMutation.mutate({
+        itemId,
+        subjectType: "group",
+        subjectId: selectedGroupId,
+        permissionLevel: selectedPermission,
+      });
+    } else if (selectedUserId) {
+      shareItemMutation.mutate({
+        itemId,
+        subjectType: "user",
+        subjectId: String(selectedUserId),
+        permissionLevel: selectedPermission,
+      });
+    }
+  }
+
+  function handleRemoveShare(subjectType: "user" | "tenant_role" | "group", subjectId: string) {
+    removeShareMutation.mutate({ itemId, subjectType, subjectId });
+  }
+
+  function handleUpdatePermission(
+    subjectType: "user" | "tenant_role" | "group",
+    subjectId: string,
+    permissionLevel: SharePermission,
+  ) {
+    updatePermissionMutation.mutate({
+      itemId,
+      subjectType,
+      subjectId,
+      permissionLevel,
+    });
+  }
+
+  function selectUser(userId: number, userName: string) {
+    setSelectedUserId(userId);
+    setSelectedUserName(userName);
+    setSelectedGroupId("");
+  }
+
+  function selectGroup(groupId: string) {
+    setSelectedGroupId(groupId);
+    setSelectedUserId(null);
+    setSelectedUserName("");
+    setSearchQuery("");
+    setDebouncedQuery("");
+  }
+
+  const canAdd = selectedUserId !== null || selectedGroupId !== "";
+
+  function getShareDisplayName(share: (typeof shares)[0]) {
+    if (share.subjectType === "user") {
+      return share.userName ?? `User #${share.subjectId}`;
+    }
+    if (share.subjectType === "group") {
+      return share.groupName ?? `Group #${share.subjectId}`;
+    }
+    return share.roleName ?? share.subjectId;
+  }
+
+  function getShareIcon(share: (typeof shares)[0]) {
+    if (share.subjectType === "group") {
+      return <Users className="h-4 w-4 shrink-0 text-muted-foreground" />;
+    }
+    return (
+      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
+        {(share.userName ?? share.subjectId).charAt(0).toUpperCase()}
+      </div>
+    );
+  }
+
+  return (
+    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
+      <DialogContent className="sm:max-w-[500px]">
+        <DialogHeader>
+          <DialogTitle>
+            Share{itemTitle ? ` "${itemTitle}"` : ""}
+          </DialogTitle>
+          <DialogDescription>
+            Add people or groups and manage access
+          </DialogDescription>
+        </DialogHeader>
+
+        <div className="space-y-4">
+          {/* User search */}
+          <div className="space-y-2">
+            <Label>Search for people</Label>
+            <div className="relative">
+              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
+              <Input
+                placeholder="Search by name or email..."
+                value={searchQuery}
+                onChange={(e) => {
+                  setSearchQuery(e.target.value);
+                  setSelectedGroupId("");
+                }}
+                className="pl-9"
+                aria-label="Search for users to share with"
+              />
+            </div>
+
+            {/* User search results */}
+            {debouncedQuery.length >= 2 && (
+              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-1">
+                {isSearchingUsers && (
+                  <div className="flex items-center justify-center py-3">
+                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
+                  </div>
+                )}
+                {!isSearchingUsers && userResults?.length === 0 && (
+                  <p className="py-3 text-center text-sm text-muted-foreground">
+                    No users found
+                  </p>
+                )}
+                {userResults?.map((user) => (
+                  <button
+                    key={user.id}
+                    type="button"
+                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
+                      selectedUserId === user.id
+                        ? "bg-primary/10 text-primary"
+                        : "hover:bg-muted"
+                    }`}
+                    onClick={() => {
+                      const displayName = user.name || user.email || "User";
+                      selectUser(user.id, displayName);
+                    }}
+                  >
+                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
+                      {(user.name || user.email || "U").charAt(0).toUpperCase()}
+                    </div>
+                    <div className="min-w-0 flex-1">
+                      <p className="truncate font-medium">
+                        {user.name ?? "Unnamed"}
+                      </p>
+                      <p className="truncate text-xs text-muted-foreground">
+                        {user.email}
+                      </p>
+                    </div>
+                  </button>
+                ))}
+              </div>
+            )}
+
+            {selectedUserId && (
+              <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-1.5 text-sm">
+                <span className="font-medium">{selectedUserName}</span>
+                <button
+                  type="button"
+                  className="ml-auto text-muted-foreground hover:text-foreground"
+                  onClick={() => {
+                    setSelectedUserId(null);
+                    setSelectedUserName("");
+                  }}
+                  aria-label="Clear user selection"
+                >
+                  <X className="h-3 w-3" />
+                </button>
+              </div>
+            )}
+          </div>
+
+          {/* Group selection */}
+          <div className="space-y-2">
+            <Label>Or select a group</Label>
+            <Select
+              value={selectedGroupId}
+              onValueChange={selectGroup}
+            >
+              <SelectTrigger aria-label="Select group to share with">
+                <SelectValue placeholder="Select group..." />
+              </SelectTrigger>
+              <SelectContent>
+                {groups?.map((group) => (
+                  <SelectItem key={group.id} value={String(group.id)}>
+                    <div className="flex items-center gap-2">
+                      <Users className="h-3 w-3" />
+                      <span>{group.name}</span>
+                    </div>
+                  </SelectItem>
+                ))}
+                {(!groups || groups.length === 0) && (
+                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
+                    No groups available
+                  </div>
+                )}
+              </SelectContent>
+            </Select>
+          </div>
+
+          {/* Permission selector + Add button */}
+          <div className="flex items-end gap-2">
+            <div className="flex-1 space-y-2">
+              <Label>Permission level</Label>
+              <Select
+                value={selectedPermission}
+                onValueChange={(v) =>
+                  setSelectedPermission(v as SharePermission)
+                }
+              >
+                <SelectTrigger aria-label="Permission level">
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent>
+                  <SelectItem value="read">Read Only</SelectItem>
+                  <SelectItem value="write">Can Edit</SelectItem>
+                  <SelectItem value="delete">Can Delete</SelectItem>
+                </SelectContent>
+              </Select>
+            </div>
+            <Button
+              onClick={handleAddShare}
+              disabled={!canAdd || isMutating}
+            >
+              {shareItemMutation.isPending && (
+                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
+              )}
+              Add
+            </Button>
+          </div>
+
+          {/* Current shares */}
+          <div className="space-y-2">
+            <Label>Who has access</Label>
+            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
+              {isLoadingShares && (
+                <div className="flex items-center justify-center py-4">
+                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
+                </div>
+              )}
+              {!isLoadingShares && shares.length === 0 && (
+                <p className="py-4 text-center text-sm text-muted-foreground">
+                  No shares yet
+                </p>
+              )}
+              {shares.map((share) => {
+                const isOwner = share.permissionLevel === "owner";
+                return (
+                  <div
+                    key={`${share.subjectType}-${share.subjectId}`}
+                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/50"
+                  >
+                    {getShareIcon(share)}
+                    <div className="min-w-0 flex-1">
+                      <p className="truncate font-medium">
+                        {getShareDisplayName(share)}
+                      </p>
+                      <p className="text-xs capitalize text-muted-foreground">
+                        {share.subjectType === "group"
+                          ? "Group"
+                          : share.subjectType === "user"
+                            ? "User"
+                            : share.subjectType}
+                      </p>
+                    </div>
+
+                    {isOwner ? (
+                      <PermissionBadge level="owner" />
+                    ) : (
+                      <Select
+                        value={share.permissionLevel}
+                        onValueChange={(v) =>
+                          handleUpdatePermission(
+                            share.subjectType as "user" | "tenant_role" | "group",
+                            share.subjectId,
+                            v as SharePermission,
+                          )
+                        }
+                      >
+                        <SelectTrigger
+                          className="h-7 w-28"
+                          aria-label={`Permission for ${getShareDisplayName(share)}`}
+                        >
+                          <SelectValue />
+                        </SelectTrigger>
+                        <SelectContent>
+                          <SelectItem value="read">Read Only</SelectItem>
+                          <SelectItem value="write">Can Edit</SelectItem>
+                          <SelectItem value="delete">Can Delete</SelectItem>
+                        </SelectContent>
+                      </Select>
+                    )}
+
+                    {isOwner ? (
+                      <Button
+                        size="icon-sm"
+                        variant="ghost"
+                        disabled
+                        aria-label="Cannot remove owner"
+                        title="Cannot remove owner"
+                      >
+                        <X className="h-3 w-3" />
+                      </Button>
+                    ) : (
+                      <Button
+                        size="icon-sm"
+                        variant="ghost"
+                        onClick={() =>
+                          handleRemoveShare(
+                            share.subjectType as "user" | "tenant_role" | "group",
+                            share.subjectId,
+                          )
+                        }
+                        disabled={isMutating}
+                        aria-label={`Remove access for ${getShareDisplayName(share)}`}
+                      >
+                        <X className="h-3 w-3" />
+                      </Button>
+                    )}
+                  </div>
+                );
+              })}
+            </div>
+          </div>
+        </div>
+
+        <DialogFooter>
+          <Button variant="outline" onClick={onClose} disabled={isMutating}>
+            Close
+          </Button>
+        </DialogFooter>
+      </DialogContent>
+    </Dialog>
+  );
+}
diff --git a/specs/feature/009-sharefile/implementation/deep_implement_config.json b/specs/feature/009-sharefile/implementation/deep_implement_config.json
index f78a655..b7a8acd 100644
--- a/specs/feature/009-sharefile/implementation/deep_implement_config.json
+++ b/specs/feature/009-sharefile/implementation/deep_implement_config.json
@@ -44,6 +44,10 @@
     "section-06-trash-job": {
       "status": "complete",
       "commit_hash": "049206f"
+    },
+    "section-07-group-management-ui": {
+      "status": "complete",
+      "commit_hash": "c1b3757"
     }
   },
   "pre_commit": {
