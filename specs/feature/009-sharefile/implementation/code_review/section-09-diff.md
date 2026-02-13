diff --git a/.claude/settings.local.json b/.claude/settings.local.json
index 57d0eed..decef09 100644
--- a/.claude/settings.local.json
+++ b/.claude/settings.local.json
@@ -388,7 +388,8 @@
       "Bash(/home/dev/projects/SmartSpecPro/specs/feature/009-sharefile/implementation/code_review/section-07-review.md << 'REVIEWEOF'\n# Code Review: Section 07 - Group Management UI\n\n## HIGH Severity\n\n### ISSUE 1: SQL Wildcard Injection in searchTenantUsers\n- **File:** groupsService.ts \\(searchTenantUsers\\)\n- `%${query.trim\\(\\)}%` does not escape SQL wildcards \\(`%`, `_`\\). Users can search `%` to list all tenant users.\n- **Fix:** Escape wildcards before building search pattern.\n\n### ISSUE 2: searchTenantUsers lacks group admin authorization\n- **File:** groups.ts router \\(searchTenantUsers\\)\n- Any authenticated user can search the full tenant user directory. Plan says this is for AddMemberDialog \\(admin-only\\).\n- **Fix:** Make excludeGroupId required, verify caller is admin/owner of that group.\n\n### ISSUE 3: getGroupMembers lacks membership check\n- **File:** groupsService.ts \\(getGroupMembers\\)\n- Only verifies group exists in tenant, not that caller is a member. Any auth user can list members \\(including emails\\) of any group in tenant.\n- **Fix:** Add membership check after group retrieval.\n\n### ISSUE 4: All tests are todo stubs\n- **File:** All 5 test files\n- Zero actual test implementations. Plan specifies 80%+ coverage.\n- **Fix:** Tests are stubs pending jsdom environment config \\(section-11\\).\n\n## MEDIUM Severity\n\n### ISSUE 5: Routes not using protectedRoute wrapper\n- **File:** App.tsx\n- Plan specifies using `protectedRoute` wrapper, but routes are plain `<Route>`. GroupDetailPanel has no auth redirect at all.\n- **Fix:** Add auth check to GroupDetailPanel.\n\n### ISSUE 6: trpcUtils declared after usage in GroupDiscovery\n- **File:** GroupDiscovery.tsx\n- `const trpcUtils = trpc.useUtils\\(\\)` called after mutations that reference it.\n- **Fix:** Move to before mutation declarations.\n\n### ISSUE 7: GroupDetailPanel settings cast without null guard\n- **File:** GroupDetailPanel.tsx\n- `group.settings as { visibility, joinPolicy }` could crash if settings is null.\n- **Fix:** Add fallback defaults.\n\n### ISSUE 8: Client-side sorting defeats server pagination\n- **File:** GroupDiscovery.tsx\n- \"Recently Created\" sort only re-sorts current page, not actual recent groups.\n- **Note:** Acceptable MVP limitation, server sort can be added later.\n\n### ISSUE 9-10: Missing debounce on search inputs\n- **Files:** GroupDiscovery.tsx, GroupManagement.tsx \\(Public Groups tab\\)\n- Search triggers API on every keystroke.\n- **Fix:** Add debounce like AddMemberDialog.\n\n### ISSUE 11: Pagination heuristic with exactly 20 results\n- **File:** GroupDiscovery.tsx\n- Next button shown when exactly 20 results, may lead to empty next page.\n- **Note:** Minor UX issue, acceptable for MVP.\n\n## LOW Severity\n\n### ISSUE 12: Missing aria-label on search inputs\n### ISSUE 13: Native radio buttons instead of Radix RadioGroup\n### ISSUE 14: GroupDetailPanel uses default export \\(inconsistent\\)\n### ISSUE 15: JoinPolicyBadge logic duplicated\n### ISSUE 16: Approve/Reject disables all rows simultaneously\n### ISSUE 17: Remove member has no confirmation dialog\n### ISSUE 18: NaN groupId shows infinite loading\nREVIEWEOF)",
       "Bash(/home/dev/projects/SmartSpecPro/specs/feature/009-sharefile/implementation/code_review/section-07-interview.md << 'INTERVIEWEOF'\n# Section 07: Code Review Interview\n\n## Auto-Fixed Issues\n\n### ISSUE 1: SQL Wildcard Injection \\(HIGH\\) - AUTO-FIXED\n- Escaped `%` and `_` in `searchTenantUsers` search pattern to prevent wildcard-based user enumeration.\n\n### ISSUE 3: getGroupMembers lacks membership check \\(HIGH\\) - AUTO-FIXED\n- Added active membership verification before returning group members. Non-members now get FORBIDDEN error.\n\n### ISSUE 5: GroupDetailPanel missing auth check \\(MEDIUM\\) - AUTO-FIXED\n- Added `isAuthenticated` check with redirect to `/login`.\n\n### ISSUE 6: trpcUtils ordering in GroupDiscovery \\(MEDIUM\\) - AUTO-FIXED\n- Moved `trpc.useUtils\\(\\)` call before mutation declarations.\n\n### ISSUE 7: Settings cast null guard \\(MEDIUM\\) - AUTO-FIXED\n- Added fallback defaults for `group.settings` before type cast.\n\n### ISSUE 18: NaN groupId handling \\(LOW\\) - AUTO-FIXED\n- Added early return with error message for invalid group IDs.\n\n## User Decisions\n\n### ISSUE 2: searchTenantUsers authorization \\(HIGH\\)\n- **Decision:** Leave as-is \\(any authenticated tenant user can search\\)\n- **Rationale:** Consistent with existing `follows.searchUsers` endpoint pattern. Tenant-scoped user search is acceptable for this application.\n\n## Deferred to Later Sections\n\n### ISSUE 4: Test stubs \\(HIGH\\)\n- All component tests are `.todo\\(\\)` stubs. Will be implemented in section-11-security-tests when jsdom environment is configured.\n\n### ISSUE 8-11: Sort/debounce/pagination \\(MEDIUM\\)\n- Client-side sort and missing debounce are acceptable MVP limitations. Server-side sort parameter and debounce can be added in optimization section.\n\n### ISSUE 12-17: Low severity items\n- Aria labels, Radix RadioGroup, export consistency, duplicated badge, row-level pending state, member removal confirmation - all deferred as non-blocking for MVP.\nINTERVIEWEOF)",
       "Bash(npm run test:*)",
-      "Bash(JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run:*)"
+      "Bash(JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run:*)",
+      "Bash(git commit -m \"$\\(cat <<''EOF''\nImplement section 08: File Sharing UI\n\n- Add PermissionBadge component with color-coded permission levels \\(read/write/delete/owner\\)\n- Add ShareButton with share count badge and tooltip\n- Add ShareDialog with user search, group selection, permission management\n- Integrate ShareButton into DocumentPreviewPanel header\n- 27 tests \\(SSR-based\\) covering all components\n- Remove share confirmation dialog, error states, loading states\n\nPlan: section-08-file-sharing-ui.md\nCo-Authored-By: Claude <noreply@anthropic.com>\nEOF\n\\)\")"
     ]
   }
 }
diff --git a/apps/web/client/src/components/library/DocumentLibraryTabs.tsx b/apps/web/client/src/components/library/DocumentLibraryTabs.tsx
index f887de3..cee9cb0 100644
--- a/apps/web/client/src/components/library/DocumentLibraryTabs.tsx
+++ b/apps/web/client/src/components/library/DocumentLibraryTabs.tsx
@@ -1,5 +1,5 @@
 import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
-import { FolderOpen, Share2, Users } from "lucide-react";
+import { FolderOpen, Share2, Trash2, Users } from "lucide-react";
 import type { DocumentScopeTab } from "@/lib/documentManagementUi";
 
 interface DocumentLibraryTabsProps {
@@ -10,7 +10,7 @@ interface DocumentLibraryTabsProps {
 export default function DocumentLibraryTabs({ value, onChange }: DocumentLibraryTabsProps) {
   return (
     <Tabs value={value} onValueChange={(next) => onChange(next as DocumentScopeTab)}>
-      <TabsList className="grid h-14 w-full grid-cols-3 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
+      <TabsList className="grid h-14 w-full grid-cols-4 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
         <TabsTrigger
           value="my_library"
           className="rounded-xl text-[13px] font-medium text-slate-700 data-[state=active]:border data-[state=active]:border-sky-200 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700 data-[state=active]:shadow-sm"
@@ -32,6 +32,13 @@ export default function DocumentLibraryTabs({ value, onChange }: DocumentLibrary
           <Users className="mr-1.5 h-4 w-4" />
           My Group
         </TabsTrigger>
+        <TabsTrigger
+          value="trash"
+          className="rounded-xl text-[13px] font-medium text-slate-700 data-[state=active]:border data-[state=active]:border-red-200 data-[state=active]:bg-red-50 data-[state=active]:text-red-700 data-[state=active]:shadow-sm"
+        >
+          <Trash2 className="mr-1.5 h-4 w-4" />
+          Trash
+        </TabsTrigger>
       </TabsList>
     </Tabs>
   );
diff --git a/apps/web/client/src/components/library/TrashPanel.test.ts b/apps/web/client/src/components/library/TrashPanel.test.ts
new file mode 100644
index 0000000..00b7469
--- /dev/null
+++ b/apps/web/client/src/components/library/TrashPanel.test.ts
@@ -0,0 +1,409 @@
+import React from "react";
+import { renderToStaticMarkup } from "react-dom/server";
+import { describe, expect, it, vi, beforeEach } from "vitest";
+
+// Hoist mock functions before vi.mock() calls
+const { mockUseQuery, mockUseMutation, mockInvalidate } = vi.hoisted(() => ({
+  mockUseQuery: vi.fn().mockReturnValue({
+    data: null,
+    isLoading: false,
+    error: null,
+    refetch: vi.fn(),
+  }),
+  mockUseMutation: vi.fn().mockReturnValue({
+    mutate: vi.fn(),
+    mutateAsync: vi.fn(),
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
+vi.mock("@/components/ui/alert-dialog", () => ({
+  AlertDialog: (props: Record<string, unknown>) => {
+    if (!props.open) return null;
+    return React.createElement(
+      "div",
+      { "data-testid": "alert-dialog" },
+      props.children as React.ReactNode,
+    );
+  },
+  AlertDialogContent: (props: Record<string, unknown>) =>
+    React.createElement(
+      "div",
+      { "data-testid": "alert-dialog-content" },
+      props.children as React.ReactNode,
+    ),
+  AlertDialogHeader: (props: Record<string, unknown>) =>
+    React.createElement("div", {}, props.children as React.ReactNode),
+  AlertDialogTitle: (props: Record<string, unknown>) =>
+    React.createElement("h2", {}, props.children as React.ReactNode),
+  AlertDialogDescription: (props: Record<string, unknown>) =>
+    React.createElement("p", {}, props.children as React.ReactNode),
+  AlertDialogFooter: (props: Record<string, unknown>) =>
+    React.createElement("div", {}, props.children as React.ReactNode),
+  AlertDialogCancel: (props: Record<string, unknown>) =>
+    React.createElement("button", {}, props.children as React.ReactNode),
+  AlertDialogAction: (props: Record<string, unknown>) => {
+    const { children, ...rest } = props;
+    return React.createElement("button", rest, children as React.ReactNode);
+  },
+}));
+
+vi.mock("sonner", () => ({
+  toast: { success: vi.fn(), error: vi.fn() },
+}));
+
+vi.mock("lucide-react", () => ({
+  AlertTriangle: (props: Record<string, unknown>) =>
+    React.createElement("svg", {
+      ...props,
+      "data-testid": "icon-alert-triangle",
+    }),
+  Loader2: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "icon-loader" }),
+  RotateCcw: (props: Record<string, unknown>) =>
+    React.createElement("svg", {
+      ...props,
+      "data-testid": "icon-rotate-ccw",
+    }),
+  Trash2: (props: Record<string, unknown>) =>
+    React.createElement("svg", { ...props, "data-testid": "icon-trash2" }),
+}));
+
+// Mock tRPC with hoisted functions
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    useUtils: () => ({
+      library: {
+        listTrash: { invalidate: mockInvalidate },
+        listDocuments: { invalidate: mockInvalidate },
+      },
+    }),
+    library: {
+      listTrash: { useQuery: mockUseQuery },
+      restoreFromTrash: { useMutation: mockUseMutation },
+      permanentDelete: { useMutation: mockUseMutation },
+    },
+  },
+}));
+
+import { TrashPanel } from "./TrashPanel";
+
+beforeEach(() => {
+  mockUseQuery.mockReturnValue({
+    data: null,
+    isLoading: false,
+    error: null,
+    refetch: vi.fn(),
+  });
+  mockUseMutation.mockReturnValue({
+    mutate: vi.fn(),
+    mutateAsync: vi.fn(),
+    isPending: false,
+  });
+});
+
+function makeItem(overrides: Record<string, unknown> = {}) {
+  return {
+    id: 1,
+    title: "Marketing Plan Q1.docx",
+    itemType: "docx",
+    source: "upload",
+    thumbnailUrl: null,
+    deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
+    deletedBy: null,
+    daysInTrash: 5,
+    daysUntilPurge: 85,
+    ...overrides,
+  };
+}
+
+describe("TrashPanel", () => {
+  describe("Rendering", () => {
+    it("shows retention info when items exist", () => {
+      mockUseQuery.mockReturnValue({
+        data: { items: [makeItem()], total: 1 },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("permanently deleted after 90 days");
+    });
+
+    it("shows empty state when trash is empty", () => {
+      mockUseQuery.mockReturnValue({
+        data: { items: [], total: 0 },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("Trash is empty");
+      expect(html).toContain("Deleted items will appear here");
+    });
+
+    it("shows loading state with spinner", () => {
+      mockUseQuery.mockReturnValue({
+        data: null,
+        isLoading: true,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("icon-loader");
+      expect(html).toContain("Loading trash items");
+    });
+
+    it("shows error state with retry button", () => {
+      mockUseQuery.mockReturnValue({
+        data: null,
+        isLoading: false,
+        error: { message: "Network error" },
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("Failed to load trash");
+      expect(html).toContain("Retry");
+    });
+
+    it("renders trash items with title", () => {
+      mockUseQuery.mockReturnValue({
+        data: { items: [makeItem()], total: 1 },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("Marketing Plan Q1.docx");
+    });
+
+    it("shows days until auto-purge for items with >= 7 days", () => {
+      mockUseQuery.mockReturnValue({
+        data: {
+          items: [makeItem({ daysInTrash: 15, daysUntilPurge: 75 })],
+          total: 1,
+        },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("75 days left");
+    });
+
+    it("shows warning badge when < 7 days remaining", () => {
+      mockUseQuery.mockReturnValue({
+        data: {
+          items: [makeItem({ daysInTrash: 87, daysUntilPurge: 3 })],
+          total: 1,
+        },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("3 days left");
+      expect(html).toContain("bg-red-100");
+      expect(html).toContain(
+        'aria-label="Item will be deleted in 3 days"',
+      );
+    });
+
+    it("does not show warning badge when >= 7 days remaining", () => {
+      mockUseQuery.mockReturnValue({
+        data: {
+          items: [makeItem({ daysInTrash: 10, daysUntilPurge: 80 })],
+          total: 1,
+        },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).not.toContain("bg-red-100");
+    });
+
+    it("shows relative deletion date", () => {
+      mockUseQuery.mockReturnValue({
+        data: { items: [makeItem({ daysInTrash: 5 })], total: 1 },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("Deleted 5 days ago");
+    });
+
+    it('shows "Deleted today" for items deleted today', () => {
+      mockUseQuery.mockReturnValue({
+        data: { items: [makeItem({ daysInTrash: 0 })], total: 1 },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("Deleted today");
+    });
+
+    it('shows "Deleted yesterday" for 1 day old', () => {
+      mockUseQuery.mockReturnValue({
+        data: { items: [makeItem({ daysInTrash: 1 })], total: 1 },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("Deleted yesterday");
+    });
+  });
+
+  describe("Actions", () => {
+    it("renders restore button with aria-label", () => {
+      mockUseQuery.mockReturnValue({
+        data: {
+          items: [makeItem({ title: "Report.xlsx" })],
+          total: 1,
+        },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain('aria-label="Restore Report.xlsx"');
+    });
+
+    it("renders delete button with aria-label", () => {
+      mockUseQuery.mockReturnValue({
+        data: {
+          items: [makeItem({ title: "Report.xlsx" })],
+          total: 1,
+        },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain('aria-label="Permanently delete Report.xlsx"');
+    });
+
+    it("renders empty trash button when items exist", () => {
+      mockUseQuery.mockReturnValue({
+        data: { items: [makeItem()], total: 1 },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("Empty Trash");
+      expect(html).toContain('aria-label="Empty all trash items"');
+    });
+
+    it("does not render empty trash button when trash is empty", () => {
+      mockUseQuery.mockReturnValue({
+        data: { items: [], total: 0 },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).not.toContain("Empty Trash");
+    });
+
+    it("renders restore and delete buttons for each item", () => {
+      mockUseQuery.mockReturnValue({
+        data: {
+          items: [
+            makeItem({ id: 1, title: "File A.pdf" }),
+            makeItem({ id: 2, title: "File B.docx" }),
+          ],
+          total: 2,
+        },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain('aria-label="Restore File A.pdf"');
+      expect(html).toContain('aria-label="Restore File B.docx"');
+      expect(html).toContain('aria-label="Permanently delete File A.pdf"');
+      expect(html).toContain('aria-label="Permanently delete File B.docx"');
+    });
+  });
+
+  describe("Accessibility", () => {
+    it("has accessible empty state with role=status", () => {
+      mockUseQuery.mockReturnValue({
+        data: { items: [], total: 0 },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain('role="status"');
+      expect(html).toContain("Trash is empty");
+    });
+
+    it("has accessible loading state", () => {
+      mockUseQuery.mockReturnValue({
+        data: null,
+        isLoading: true,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain("Loading trash items");
+    });
+
+    it("has proper ARIA labels for all action buttons", () => {
+      mockUseQuery.mockReturnValue({
+        data: {
+          items: [makeItem({ title: "Doc.pdf" })],
+          total: 1,
+        },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain('aria-label="Restore Doc.pdf"');
+      expect(html).toContain('aria-label="Permanently delete Doc.pdf"');
+      expect(html).toContain('aria-label="Empty all trash items"');
+    });
+
+    it("warning badge has aria-label with days remaining", () => {
+      mockUseQuery.mockReturnValue({
+        data: {
+          items: [makeItem({ daysInTrash: 85, daysUntilPurge: 5 })],
+          total: 1,
+        },
+        isLoading: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain(
+        'aria-label="Item will be deleted in 5 days"',
+      );
+    });
+
+    it("loading spinner icon is aria-hidden", () => {
+      mockUseQuery.mockReturnValue({
+        data: null,
+        isLoading: true,
+        error: null,
+        refetch: vi.fn(),
+      });
+      const html = renderToStaticMarkup(React.createElement(TrashPanel));
+      expect(html).toContain('aria-hidden="true"');
+    });
+  });
+});
diff --git a/apps/web/client/src/components/library/TrashPanel.tsx b/apps/web/client/src/components/library/TrashPanel.tsx
new file mode 100644
index 0000000..ca271af
--- /dev/null
+++ b/apps/web/client/src/components/library/TrashPanel.tsx
@@ -0,0 +1,270 @@
+import React, { useState } from "react";
+import { toast } from "sonner";
+import { AlertTriangle, Loader2, RotateCcw, Trash2 } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import {
+  AlertDialog,
+  AlertDialogAction,
+  AlertDialogCancel,
+  AlertDialogContent,
+  AlertDialogDescription,
+  AlertDialogFooter,
+  AlertDialogHeader,
+  AlertDialogTitle,
+} from "@/components/ui/alert-dialog";
+import { trpc } from "@/lib/trpc";
+
+export function TrashPanel() {
+  const trpcUtils = trpc.useUtils();
+  const [deleteTarget, setDeleteTarget] = useState<{
+    id: number;
+    title: string;
+  } | null>(null);
+  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);
+
+  const {
+    data: trashData,
+    isLoading,
+    error,
+    refetch,
+  } = trpc.library.listTrash.useQuery({ limit: 50, offset: 0 });
+
+  const restoreMutation = trpc.library.restoreFromTrash.useMutation({
+    onSuccess: () => {
+      trpcUtils.library.listTrash.invalidate();
+      trpcUtils.library.listDocuments.invalidate();
+    },
+  });
+
+  const deleteMutation = trpc.library.permanentDelete.useMutation({
+    onSuccess: () => {
+      trpcUtils.library.listTrash.invalidate();
+    },
+  });
+
+  const items = trashData?.items ?? [];
+
+  async function handleRestore(itemId: number) {
+    try {
+      await restoreMutation.mutateAsync({ itemId });
+      toast.success("File restored successfully");
+    } catch {
+      toast.error("Failed to restore file");
+    }
+  }
+
+  async function handlePermanentDelete(itemId: number) {
+    try {
+      await deleteMutation.mutateAsync({ itemId });
+      toast.success("File permanently deleted");
+      setDeleteTarget(null);
+    } catch {
+      toast.error("Failed to delete file");
+    }
+  }
+
+  async function handleEmptyTrash() {
+    try {
+      await Promise.all(
+        items.map((item) => deleteMutation.mutateAsync({ itemId: item.id })),
+      );
+      toast.success("Trash emptied");
+      setEmptyTrashOpen(false);
+    } catch {
+      toast.error("Failed to empty trash");
+    }
+  }
+
+  return (
+    <div>
+      {/* Header */}
+      <div className="mb-4 flex items-center justify-between">
+        <div>
+          <h2 className="text-base font-semibold text-slate-900">Trash</h2>
+          <p className="text-sm text-muted-foreground">
+            Items will be permanently deleted after 90 days.
+          </p>
+        </div>
+        {items.length > 0 && (
+          <Button
+            variant="outline"
+            size="sm"
+            className="text-red-600 hover:bg-red-50 hover:text-red-700"
+            onClick={() => setEmptyTrashOpen(true)}
+            aria-label="Empty all trash items"
+          >
+            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
+            Empty Trash
+          </Button>
+        )}
+      </div>
+
+      {/* Loading state */}
+      {isLoading && (
+        <div className="flex flex-col items-center justify-center py-16">
+          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
+          <span className="mt-3 text-sm text-muted-foreground">
+            Loading trash items...
+          </span>
+        </div>
+      )}
+
+      {/* Error state */}
+      {!isLoading && error && (
+        <div className="flex flex-col items-center justify-center py-16">
+          <AlertTriangle className="h-16 w-16 text-red-500" aria-hidden="true" />
+          <h3 className="mt-4 text-lg font-medium text-gray-900">
+            Failed to load trash
+          </h3>
+          <p className="mt-2 text-sm text-gray-500">{error.message}</p>
+          <Button onClick={() => refetch()} className="mt-4" size="sm">
+            Retry
+          </Button>
+        </div>
+      )}
+
+      {/* Empty state */}
+      {!isLoading && !error && items.length === 0 && (
+        <div
+          className="flex flex-col items-center justify-center py-16"
+          role="status"
+          aria-live="polite"
+        >
+          <Trash2
+            className="h-16 w-16 text-gray-400"
+            aria-hidden="true"
+          />
+          <h3 className="mt-4 text-lg font-medium text-gray-900">
+            Trash is empty
+          </h3>
+          <p className="mt-2 text-sm text-gray-500">
+            Deleted items will appear here
+          </p>
+        </div>
+      )}
+
+      {/* Item list */}
+      {!isLoading && !error && items.length > 0 && (
+        <div className="space-y-2">
+          {items.map((item) => (
+          <div
+            key={item.id}
+            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
+          >
+            <div className="min-w-0 flex-1">
+              <div className="flex items-center gap-2">
+                <span className="truncate font-medium text-slate-900">
+                  {item.title}
+                </span>
+                {item.daysUntilPurge < 7 && (
+                  <span
+                    role="status"
+                    aria-label={`Item will be deleted in ${item.daysUntilPurge} days`}
+                    className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
+                  >
+                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
+                    {item.daysUntilPurge} days left
+                  </span>
+                )}
+              </div>
+              <p className="mt-1 text-sm text-muted-foreground">
+                {formatDeleteInfo(item.daysInTrash)}
+                {" \u00b7 "}
+                {item.daysUntilPurge >= 7
+                  ? `${item.daysUntilPurge} days left`
+                  : null}
+              </p>
+            </div>
+
+            <div className="ml-4 flex shrink-0 items-center gap-2">
+              <Button
+                variant="outline"
+                size="sm"
+                onClick={() => handleRestore(item.id)}
+                disabled={restoreMutation.isPending}
+                aria-label={`Restore ${item.title}`}
+              >
+                <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
+                Restore
+              </Button>
+              <Button
+                variant="outline"
+                size="sm"
+                className="text-red-600 hover:bg-red-50 hover:text-red-700"
+                onClick={() =>
+                  setDeleteTarget({ id: item.id, title: item.title })
+                }
+                disabled={deleteMutation.isPending}
+                aria-label={`Permanently delete ${item.title}`}
+              >
+                <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
+                Delete
+              </Button>
+            </div>
+          </div>
+        ))}
+        </div>
+      )}
+
+      {/* Delete confirmation dialog */}
+      <AlertDialog
+        open={deleteTarget !== null}
+        onOpenChange={(open) => {
+          if (!open) setDeleteTarget(null);
+        }}
+      >
+        <AlertDialogContent>
+          <AlertDialogHeader>
+            <AlertDialogTitle>Permanently delete file?</AlertDialogTitle>
+            <AlertDialogDescription>
+              This will permanently delete &ldquo;{deleteTarget?.title}&rdquo;.
+              This action cannot be undone.
+            </AlertDialogDescription>
+          </AlertDialogHeader>
+          <AlertDialogFooter>
+            <AlertDialogCancel>Cancel</AlertDialogCancel>
+            <AlertDialogAction
+              className="bg-red-600 text-white hover:bg-red-700"
+              onClick={() => {
+                if (deleteTarget) handlePermanentDelete(deleteTarget.id);
+              }}
+            >
+              Delete
+            </AlertDialogAction>
+          </AlertDialogFooter>
+        </AlertDialogContent>
+      </AlertDialog>
+
+      {/* Empty trash confirmation dialog */}
+      <AlertDialog open={emptyTrashOpen} onOpenChange={setEmptyTrashOpen}>
+        <AlertDialogContent>
+          <AlertDialogHeader>
+            <AlertDialogTitle>Empty Trash?</AlertDialogTitle>
+            <AlertDialogDescription>
+              Are you sure you want to permanently delete all {items.length}{" "}
+              items in trash? This action cannot be undone.
+            </AlertDialogDescription>
+          </AlertDialogHeader>
+          <AlertDialogFooter>
+            <AlertDialogCancel>Cancel</AlertDialogCancel>
+            <AlertDialogAction
+              className="bg-red-600 text-white hover:bg-red-700"
+              onClick={handleEmptyTrash}
+            >
+              Empty Trash
+            </AlertDialogAction>
+          </AlertDialogFooter>
+        </AlertDialogContent>
+      </AlertDialog>
+    </div>
+  );
+}
+
+function formatDeleteInfo(daysInTrash: number): string {
+  if (daysInTrash === 0) return "Deleted today";
+  if (daysInTrash === 1) return "Deleted yesterday";
+  if (daysInTrash < 7) return `Deleted ${daysInTrash} days ago`;
+  if (daysInTrash < 30)
+    return `Deleted ${Math.floor(daysInTrash / 7)} weeks ago`;
+  return `Deleted ${Math.floor(daysInTrash / 30)} months ago`;
+}
diff --git a/apps/web/client/src/lib/documentManagementUi.ts b/apps/web/client/src/lib/documentManagementUi.ts
index 7f84331..1796093 100644
--- a/apps/web/client/src/lib/documentManagementUi.ts
+++ b/apps/web/client/src/lib/documentManagementUi.ts
@@ -1,6 +1,6 @@
 export const DOCUMENT_MANAGEMENT_ROUTE = "/document-management";
 
-export type DocumentScopeTab = "my_library" | "shared_with_me" | "shared_groups";
+export type DocumentScopeTab = "my_library" | "shared_with_me" | "shared_groups" | "trash";
 export type DocumentSortOrder = "updated_desc" | "created_desc";
 export type DocumentViewMode = "library" | "editor";
 export type DocumentAccessSource = "owner" | "shared_direct" | "shared_group";
@@ -64,7 +64,7 @@ export function parseDocumentQueryState(search: string): DocumentQueryState {
   const docId = Number.isFinite(docIdParsed) && docIdParsed > 0 ? docIdParsed : undefined;
 
   return {
-    scope: scope === "shared_with_me" || scope === "shared_groups" ? scope : "my_library",
+    scope: scope === "shared_with_me" || scope === "shared_groups" || scope === "trash" ? scope : "my_library",
     sort: sort === "created_desc" ? "created_desc" : "updated_desc",
     viewMode: mode === "editor" ? "editor" : "library",
     query,
diff --git a/apps/web/client/src/pages/DocumentManagement.tsx b/apps/web/client/src/pages/DocumentManagement.tsx
index 67a127b..08e5ab1 100644
--- a/apps/web/client/src/pages/DocumentManagement.tsx
+++ b/apps/web/client/src/pages/DocumentManagement.tsx
@@ -23,6 +23,7 @@ import {
 import DocumentGridList from "@/components/library/DocumentGridList";
 import DocumentLibraryTabs from "@/components/library/DocumentLibraryTabs";
 import DocumentPreviewPanel from "@/components/library/DocumentPreviewPanel";
+import { TrashPanel } from "@/components/library/TrashPanel";
 import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
@@ -173,8 +174,9 @@ export default function DocumentManagement() {
     });
   }, [selectedId, queryState.viewMode]);
 
+  const listScope = queryState.scope === "trash" ? "my_library" : queryState.scope;
   const listInput = useMemo(() => ({
-    scope: queryState.scope,
+    scope: listScope,
     sort: queryState.sort,
     query: debouncedQuery || undefined,
     limit: 60,
@@ -183,9 +185,9 @@ export default function DocumentManagement() {
       itemType: queryState.itemType || undefined,
       status: queryState.status as any,
     },
-  }), [debouncedQuery, queryState.scope, queryState.sort, queryState.itemType, queryState.status]);
+  }), [debouncedQuery, listScope, queryState.sort, queryState.itemType, queryState.status]);
 
-  const { data: documentData, isLoading: listLoading } = trpc.library.listDocuments.useQuery(listInput);
+  const { data: documentData, isLoading: listLoading } = trpc.library.listDocuments.useQuery(listInput, { enabled: queryState.scope !== "trash" });
   const documents = (documentData?.results || []) as DocumentLibraryItem[];
   const selectedFromList = selectedId ? (documents.find((item) => item.id === selectedId) || null) : null;
   const selectedNeedsDirectFetch = Boolean(selectedId && !selectedFromList && !provisionalSelectedItem);
@@ -427,6 +429,7 @@ export default function DocumentManagement() {
   function getCurrentScopeLabel(scope: DocumentQueryState["scope"]): string {
     if (scope === "shared_with_me") return "Shared With Me";
     if (scope === "shared_groups") return "My Group";
+    if (scope === "trash") return "Trash";
     return "My Library";
   }
 
@@ -827,49 +830,57 @@ export default function DocumentManagement() {
                 />
               </div>
 
-              <div className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
-                <div className="relative">
-                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
-                  <Input
-                    className="h-11 rounded-xl border-slate-300 bg-white pl-9"
-                    placeholder="Search files..."
-                    value={queryState.query}
-                    onChange={(event) => setQueryState((prev) => ({ ...prev, query: event.target.value }))}
-                  />
+              {queryState.scope === "trash" ? (
+                <div className="min-h-[280px] xl:min-h-0 xl:flex-1">
+                  <TrashPanel />
                 </div>
-                <Select
-                  value={queryState.sort}
-                  onValueChange={(value) => setQueryState((prev) => ({ ...prev, sort: value as DocumentQueryState["sort"] }))}
-                >
-                  <SelectTrigger className="h-11 rounded-xl border-slate-300 bg-white">
-                    <SelectValue />
-                  </SelectTrigger>
-                  <SelectContent>
-                    <SelectItem value="updated_desc">Newest updated first</SelectItem>
-                    <SelectItem value="created_desc">Newest created first</SelectItem>
-                  </SelectContent>
-                </Select>
-              </div>
+              ) : (
+                <>
+                  <div className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
+                    <div className="relative">
+                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
+                      <Input
+                        className="h-11 rounded-xl border-slate-300 bg-white pl-9"
+                        placeholder="Search files..."
+                        value={queryState.query}
+                        onChange={(event) => setQueryState((prev) => ({ ...prev, query: event.target.value }))}
+                      />
+                    </div>
+                    <Select
+                      value={queryState.sort}
+                      onValueChange={(value) => setQueryState((prev) => ({ ...prev, sort: value as DocumentQueryState["sort"] }))}
+                    >
+                      <SelectTrigger className="h-11 rounded-xl border-slate-300 bg-white">
+                        <SelectValue />
+                      </SelectTrigger>
+                      <SelectContent>
+                        <SelectItem value="updated_desc">Newest updated first</SelectItem>
+                        <SelectItem value="created_desc">Newest created first</SelectItem>
+                      </SelectContent>
+                    </Select>
+                  </div>
 
-              <div className="min-h-[280px] xl:min-h-0 xl:flex-1">
-                <DocumentGridList
-                  items={documents}
-                  selectedId={selectedId}
-                  isLoading={listLoading}
-                  className="h-full"
-                  emptyMessage="No documents match the selected scope and filters."
-                  onSelect={(item) => {
-                    setPendingAutoSelectId(null);
-                    setProvisionalSelectedItem(null);
-                    openEditorTab(item, { scope: queryState.scope });
-                  }}
-                  onOpen={(item) => {
-                    setPendingAutoSelectId(null);
-                    setProvisionalSelectedItem(null);
-                    openEditorTab(item, { scope: queryState.scope });
-                  }}
-                />
-              </div>
+                  <div className="min-h-[280px] xl:min-h-0 xl:flex-1">
+                    <DocumentGridList
+                      items={documents}
+                      selectedId={selectedId}
+                      isLoading={listLoading}
+                      className="h-full"
+                      emptyMessage="No documents match the selected scope and filters."
+                      onSelect={(item) => {
+                        setPendingAutoSelectId(null);
+                        setProvisionalSelectedItem(null);
+                        openEditorTab(item, { scope: queryState.scope });
+                      }}
+                      onOpen={(item) => {
+                        setPendingAutoSelectId(null);
+                        setProvisionalSelectedItem(null);
+                        openEditorTab(item, { scope: queryState.scope });
+                      }}
+                    />
+                  </div>
+                </>
+              )}
             </aside>
           ) : (
             <div className="flex items-center justify-center xl:shrink-0">
diff --git a/specs/feature/009-sharefile/implementation/deep_implement_config.json b/specs/feature/009-sharefile/implementation/deep_implement_config.json
index b7a8acd..2d7e483 100644
--- a/specs/feature/009-sharefile/implementation/deep_implement_config.json
+++ b/specs/feature/009-sharefile/implementation/deep_implement_config.json
@@ -48,6 +48,10 @@
     "section-07-group-management-ui": {
       "status": "complete",
       "commit_hash": "c1b3757"
+    },
+    "section-08-file-sharing-ui": {
+      "status": "complete",
+      "commit_hash": "7a2f6b0"
     }
   },
   "pre_commit": {
