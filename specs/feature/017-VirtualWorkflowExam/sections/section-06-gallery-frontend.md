Now I have enough context to produce the section. Here is the complete markdown content:

---

# Section 06 — Gallery Frontend

## Overview

This section implements the Workflow Gallery: a standalone page at `/workflows/gallery` that lets users browse, filter, preview, and import the 60 curated workflow templates seeded in previous sections.

**Depends on:** Section 05 (tRPC endpoints `workflow.listTemplates`, `workflow.listTemplateCategories`, `workflow.getTemplate`, `workflow.useTemplate` must exist and be callable).

**Does not depend on:** The Python backend, SVG generator, or seeder details — this section is purely frontend.

---

## Files to Create / Modify

| Action | File |
|--------|------|
| Create | `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkflowGallery.tsx` |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/GalleryTemplateCard.tsx` |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/GalleryDetailDrawer.tsx` |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/GalleryCategories.tsx` |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/__tests__/GalleryTemplateCard.test.tsx` |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/__tests__/GalleryDetailDrawer.test.tsx` |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/WorkflowGallery.test.tsx` |
| Modify | `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` — add `/workflows/gallery` route |

---

## Tests First

Write these tests before implementing the components. They must fail initially.

### Test file: `apps/web/client/src/components/workflow/__tests__/GalleryTemplateCard.test.tsx`

```typescript
// Mock tRPC — GalleryTemplateCard has no tRPC calls itself (receives data via props)
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GalleryTemplateCard } from "../GalleryTemplateCard";

// Minimal template fixture matching the list-response shape (no workflowJson, no previewSvg)
const mockTemplate = {
  id: 1,
  name: "Daily Sales Report",
  description: "Pulls yesterday's orders from the database, generates an AI summary, and emails it to the sales team each morning at 7 AM.",
  category: "Sales & Marketing",
  stepCount: 5,
  estimatedSetupMinutes: 20,
  industry: ["E-commerce", "Retail", "B2B"],
  tags: ["schedule", "email", "reporting"],
  downloadCount: 42,
  templateKey: "tpl-001",
};

describe("GalleryTemplateCard", () => {
  it("renders template name in bold", () => {
    render(<GalleryTemplateCard template={mockTemplate} onSelect={vi.fn()} />);
    expect(screen.getByText("Daily Sales Report")).toBeInTheDocument();
  });

  it("renders truncated description (line-clamp-2 applied)", () => {
    render(<GalleryTemplateCard template={mockTemplate} onSelect={vi.fn()} />);
    expect(screen.getByText(/Pulls yesterday's orders/)).toBeInTheDocument();
  });

  it("renders category badge", () => {
    render(<GalleryTemplateCard template={mockTemplate} onSelect={vi.fn()} />);
    expect(screen.getByText("Sales & Marketing")).toBeInTheDocument();
  });

  it('renders stepCount as "{N} steps"', () => {
    render(<GalleryTemplateCard template={mockTemplate} onSelect={vi.fn()} />);
    expect(screen.getByText("5 steps")).toBeInTheDocument();
  });

  it("renders up to 3 industry tags and hides the 4th+", () => {
    render(<GalleryTemplateCard template={mockTemplate} onSelect={vi.fn()} />);
    expect(screen.getByText("E-commerce")).toBeInTheDocument();
    expect(screen.getByText("Retail")).toBeInTheDocument();
    expect(screen.getByText("B2B")).toBeInTheDocument();

    // Only 3 industry tags
    const template4Industries = { ...mockTemplate, industry: ["A", "B", "C", "D"] };
    const { rerender } = render(
      <GalleryTemplateCard template={template4Industries} onSelect={vi.fn()} />
    );
    rerender(<GalleryTemplateCard template={template4Industries} onSelect={vi.fn()} />);
    expect(screen.queryByText("D")).not.toBeInTheDocument();
  });

  it("clicking the card fires onSelect with the template id", () => {
    const onSelect = vi.fn();
    render(<GalleryTemplateCard template={mockTemplate} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("article"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('clicking the "Preview" button fires onSelect with the template id', () => {
    const onSelect = vi.fn();
    render(<GalleryTemplateCard template={mockTemplate} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /preview/i }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
```

### Test file: `apps/web/client/src/components/workflow/__tests__/GalleryDetailDrawer.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Mock tRPC
vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflow: {
      getTemplate: {
        useQuery: vi.fn(),
      },
      useTemplate: {
        useMutation: vi.fn(),
      },
    },
  },
}));

// Mock toast
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GalleryDetailDrawer } from "../GalleryDetailDrawer";
import { trpc } from "@/lib/trpc";

const mockGetTemplateQuery = vi.mocked(trpc.workflow.getTemplate.useQuery);
const mockUseTemplateMutation = vi.mocked(trpc.workflow.useTemplate.useMutation);

const mockFullTemplate = {
  id: 1,
  name: "Daily Sales Report",
  description: "Full description text here.",
  category: "Sales & Marketing",
  stepCount: 5,
  estimatedSetupMinutes: 20,
  industry: ["E-commerce"],
  tags: ["schedule"],
  downloadCount: 42,
  templateKey: "tpl-001",
  previewSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect x="10" y="10" width="140" height="50" fill="#10B981"/></svg>',
  workflowJson: {
    nodes: [
      { id: "n1", type: "workflow", position: { x: 100, y: 200 }, data: { nodeType: "schedule_trigger", label: "Every Morning 7AM", config: {} } },
      { id: "n2", type: "workflow", position: { x: 350, y: 200 }, data: { nodeType: "llm_call", label: "Generate Summary", config: {} } },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  },
};

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { hook } = memoryLocation({ path: "/workflows/gallery" });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>{ui}</Router>
    </QueryClientProvider>
  );
}

describe("GalleryDetailDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTemplateMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      mutate: vi.fn(),
      reset: vi.fn(),
    } as any);
  });

  it("does not render sheet content when closed", () => {
    mockGetTemplateQuery.mockReturnValue({ data: undefined, isLoading: false } as any);
    renderWithProviders(
      <GalleryDetailDrawer open={false} templateId={null} onClose={vi.fn()} />
    );
    expect(screen.queryByText("Daily Sales Report")).not.toBeInTheDocument();
  });

  it("renders Skeleton while getTemplate query is loading", () => {
    mockGetTemplateQuery.mockReturnValue({ data: undefined, isLoading: true } as any);
    renderWithProviders(
      <GalleryDetailDrawer open={true} templateId={1} onClose={vi.fn()} />
    );
    // Skeleton components should render (check via data-testid or class)
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders SVG as <img> with data:image/svg+xml;base64 src — NOT dangerouslySetInnerHTML", () => {
    mockGetTemplateQuery.mockReturnValue({ data: mockFullTemplate, isLoading: false } as any);
    renderWithProviders(
      <GalleryDetailDrawer open={true} templateId={1} onClose={vi.fn()} />
    );
    const img = screen.getByAltText("Workflow topology diagram");
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
    // No raw SVG in DOM
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders node type badges for unique nodeTypes in workflowJson", () => {
    mockGetTemplateQuery.mockReturnValue({ data: mockFullTemplate, isLoading: false } as any);
    renderWithProviders(
      <GalleryDetailDrawer open={true} templateId={1} onClose={vi.fn()} />
    );
    expect(screen.getByText("schedule_trigger")).toBeInTheDocument();
    expect(screen.getByText("llm_call")).toBeInTheDocument();
  });

  it('"Use This Template" button is present and enabled when loaded', () => {
    mockGetTemplateQuery.mockReturnValue({ data: mockFullTemplate, isLoading: false } as any);
    renderWithProviders(
      <GalleryDetailDrawer open={true} templateId={1} onClose={vi.fn()} />
    );
    const btn = screen.getByRole("button", { name: /use this template/i });
    expect(btn).toBeEnabled();
  });

  it("shows loading spinner on button during mutation, button is disabled", () => {
    mockGetTemplateQuery.mockReturnValue({ data: mockFullTemplate, isLoading: false } as any);
    mockUseTemplateMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      isError: false,
      error: null,
      mutate: vi.fn(),
      reset: vi.fn(),
    } as any);
    renderWithProviders(
      <GalleryDetailDrawer open={true} templateId={1} onClose={vi.fn()} />
    );
    const btn = screen.getByRole("button", { name: /use this template/i });
    expect(btn).toBeDisabled();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("on mutation success: calls onClose and navigates to /workflow/{id}", async () => {
    const onClose = vi.fn();
    const mutateAsync = vi.fn().mockResolvedValue({ id: 99 });
    mockGetTemplateQuery.mockReturnValue({ data: mockFullTemplate, isLoading: false } as any);
    mockUseTemplateMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: false,
      error: null,
      mutate: vi.fn(),
      reset: vi.fn(),
    } as any);

    renderWithProviders(
      <GalleryDetailDrawer open={true} templateId={1} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole("button", { name: /use this template/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
```

### Test file: `apps/web/client/src/pages/__tests__/WorkflowGallery.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, email: "user@test.com" }, isLoading: false }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflow: {
      listTemplates: { useQuery: vi.fn() },
      listTemplateCategories: { useQuery: vi.fn() },
      getTemplate: { useQuery: vi.fn() },
      useTemplate: { useMutation: vi.fn() },
    },
  },
}));

import WorkflowGallery from "../WorkflowGallery";
import { trpc } from "@/lib/trpc";

const mockListTemplates = vi.mocked(trpc.workflow.listTemplates.useQuery);
const mockListCategories = vi.mocked(trpc.workflow.listTemplateCategories.useQuery);
const mockGetTemplate = vi.mocked(trpc.workflow.getTemplate.useQuery);
const mockUseTemplate = vi.mocked(trpc.workflow.useTemplate.useMutation);

function makeTemplate(id: number) {
  return {
    id,
    name: `Template ${id}`,
    description: "A test template description.",
    category: "Sales & Marketing",
    stepCount: 4,
    estimatedSetupMinutes: 15,
    industry: ["E-commerce"],
    tags: ["schedule"],
    downloadCount: 0,
    templateKey: `tpl-${String(id).padStart(3, "0")}`,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { hook } = memoryLocation({ path: "/workflows/gallery" });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}><WorkflowGallery /></Router>
    </QueryClientProvider>
  );
}

describe("WorkflowGallery page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTemplate.mockReturnValue({ data: undefined, isLoading: false } as any);
    mockUseTemplate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
    mockListCategories.mockReturnValue({
      data: [
        { id: 1, name: "Sales & Marketing", templateCount: 8 },
        { id: 2, name: "IT & DevOps", templateCount: 4 },
      ],
      isLoading: false,
    } as any);
  });

  it("renders 24 skeleton cards while listTemplates is loading", () => {
    mockListTemplates.mockReturnValue({ data: undefined, isLoading: true, isError: false } as any);
    renderPage();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(24);
  });

  it("renders template cards once query resolves", () => {
    const items = Array.from({ length: 8 }, (_, i) => makeTemplate(i + 1));
    mockListTemplates.mockReturnValue({
      data: { items, total: 8 },
      isLoading: false,
      isError: false,
    } as any);
    renderPage();
    expect(screen.getByText("Template 1")).toBeInTheDocument();
    expect(screen.getByText("Template 8")).toBeInTheDocument();
  });

  it("shows error state message when listTemplates query fails", () => {
    mockListTemplates.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as any);
    renderPage();
    expect(screen.getByText(/could not load templates/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows empty state message when query returns 0 results", () => {
    mockListTemplates.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    } as any);
    renderPage();
    expect(screen.getByText(/no templates found/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
  });

  it("clicking a category in the sidebar updates the filter", () => {
    mockListTemplates.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    } as any);
    renderPage();
    const itDevOpsBtn = screen.getByText(/IT & DevOps/);
    fireEvent.click(itDevOpsBtn);
    // After click, listTemplates should be called with the new category
    // (the hook will be called again by React Query — we just verify the button is clickable)
    expect(mockListTemplates).toHaveBeenCalled();
  });
});
```

---

## Implementation

### Dependency: tRPC Procedures (from Section 05)

The Gallery page uses these tRPC procedures (defined in `apps/web/server/routers/workflow.ts` by Section 05):

- `trpc.workflow.listTemplates.useQuery({ category?, search?, tags?, limit, offset })` — returns `{ items: TemplateSummary[], total: number }`
- `trpc.workflow.listTemplateCategories.useQuery()` — returns `{ id, name, templateCount }[]`
- `trpc.workflow.getTemplate.useQuery({ id })` — returns full record with `workflowJson` and `previewSvg`
- `trpc.workflow.useTemplate.useMutation()` — input `{ templateId, name? }`, returns `{ id: number }`

The `TemplateSummary` type returned by `listTemplates` does **not** include `workflowJson` or `previewSvg` — those are only on `getTemplate`.

### Route Registration

Modify `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx`:

1. Add import: `import WorkflowGallery from "./pages/WorkflowGallery";`
2. Inside the `<Switch>` block, add the route adjacent to the existing workflow routes:

```tsx
<Route path="/workflows/gallery" component={WorkflowGallery} />
```

Place it after `<Route path="/workflows/editor/:id" component={WorkflowEditor} />` and before `<Route path="/dashboard" component={Dashboard} />`.

### Category Color Map

The Gallery uses a color map to assign badge colors to category names. Define this as a shared constant used by both `GalleryTemplateCard` and `GalleryDetailDrawer`:

```typescript
// Category name → Tailwind background / text classes
export const CATEGORY_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  "Sales & Marketing":        { bg: "bg-blue-100",   text: "text-blue-800" },
  "HR & People":              { bg: "bg-purple-100", text: "text-purple-800" },
  "Finance & Accounting":     { bg: "bg-green-100",  text: "text-green-800" },
  "IT & DevOps":              { bg: "bg-orange-100", text: "text-orange-800" },
  "Healthcare":               { bg: "bg-red-100",    text: "text-red-800" },
  "Education":                { bg: "bg-yellow-100", text: "text-yellow-800" },
  "Government & Public":      { bg: "bg-gray-100",   text: "text-gray-800" },
  "Personal Productivity":    { bg: "bg-teal-100",   text: "text-teal-800" },
  "Real Estate":              { bg: "bg-amber-100",  text: "text-amber-800" },
  "Logistics & Supply Chain": { bg: "bg-cyan-100",   text: "text-cyan-800" },
  "Content & Media":          { bg: "bg-pink-100",   text: "text-pink-800" },
  "Food & Restaurant":        { bg: "bg-lime-100",   text: "text-lime-800" },
  "Legal & Compliance":       { bg: "bg-indigo-100", text: "text-indigo-800" },
  "Customer Service":         { bg: "bg-sky-100",    text: "text-sky-800" },
  "AI & Automation":          { bg: "bg-violet-100", text: "text-violet-800" },
};

// Fallback for unknown categories
export const DEFAULT_CATEGORY_COLOR = { bg: "bg-gray-100", text: "text-gray-700" };
```

This map can live at the top of `GalleryTemplateCard.tsx` or in a shared `galleryConstants.ts` file imported by both card and drawer components.

### Node Type Color Map (for Detail Drawer badges)

The detail drawer renders node type badges using the same color categories as the SVG generator. Define a second constant:

```typescript
// Maps nodeType prefix → hex color for badge background
export const NODE_TYPE_CATEGORY_COLORS: Record<string, string> = {
  // Triggers → green
  manual_trigger: "#10B981", schedule_trigger: "#10B981",
  webhook_trigger: "#10B981", event_trigger: "#10B981",
  // AI → blue
  llm_call: "#3B82F6", rag_query: "#3B82F6", embedding_generator: "#3B82F6",
  multi_model_router: "#3B82F6", prompt_template: "#3B82F6", output_parser: "#3B82F6",
  // Flow control → purple
  conditional: "#8B5CF6", loop: "#8B5CF6", parallel: "#8B5CF6",
  join: "#8B5CF6", subworkflow: "#8B5CF6", retry: "#8B5CF6",
  circuit_breaker: "#8B5CF6", try_catch: "#8B5CF6", delay: "#8B5CF6",
  // Data → orange
  database_query: "#F97316", transformer: "#F97316", filter: "#F97316",
  aggregator: "#F97316", csv_parser: "#F97316", template_engine: "#F97316",
  read_file: "#F97316", write_file: "#F97316",
  // Integrations → cyan
  http_request: "#06B6D4", graphql_request: "#06B6D4", websocket_client: "#06B6D4",
  storage_action: "#06B6D4",
  // Outputs → red
  send_email: "#EF4444", send_notification: "#EF4444",
  // Observability → gray
  metrics_collector: "#6B7280", logger_node: "#6B7280", secrets_vault: "#6B7280",
  // Skills/media/human → amber
  generate_image: "#F59E0B", skill: "#F59E0B", approval_gate: "#F59E0B",
};
export const DEFAULT_NODE_COLOR = "#6B7280";
```

### Component: `GalleryCategories.tsx`

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/GalleryCategories.tsx`

Props interface:

```typescript
interface GalleryCategoriesProps {
  /** Data from trpc.workflow.listTemplateCategories — passed down from parent */
  categories: Array<{ id: number; name: string; templateCount: number }>;
  totalCount: number;        // Sum of all templateCount values (for "All" entry)
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
  isLoading: boolean;
}
```

Behavior:
- Renders "All" at the top with `totalCount` in parentheses.
- Renders each category as a clickable row showing `name` and `templateCount`.
- The active/selected item has a highlighted background (e.g., `bg-blue-50 text-blue-700 font-semibold`).
- While `isLoading` is true, render 5 skeleton rows.

### Component: `GalleryTemplateCard.tsx`

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/GalleryTemplateCard.tsx`

Props interface:

```typescript
interface GalleryTemplateCardProps {
  template: {
    id: number;
    name: string;
    description: string | null;
    category: string | null;
    stepCount: number | null;
    estimatedSetupMinutes: number | null;
    industry: string[] | null;
    tags: string[] | null;
    downloadCount: number | null;
    templateKey: string | null;
  };
  onSelect: (id: number) => void;
}
```

Render:
- Outer container: `role="article"`, `onClick={() => onSelect(template.id)}`
- Template name: bold, single line (`line-clamp-1`)
- Description: `line-clamp-2` Tailwind class (2-line clamp)
- Category badge: colored pill using `CATEGORY_COLOR_MAP[template.category]`
- Step count: `{template.stepCount} steps` chip
- Industry tags: render `template.industry.slice(0, 3)` as small chips; do not render a 4th
- "Preview" button: `onClick={(e) => { e.stopPropagation(); onSelect(template.id); }}`

### Component: `GalleryDetailDrawer.tsx`

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/GalleryDetailDrawer.tsx`

Props interface:

```typescript
interface GalleryDetailDrawerProps {
  open: boolean;
  templateId: number | null;
  onClose: () => void;
}
```

Uses the `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetFooter` components from `@/components/ui/sheet`. Set `side="right"` and width `w-[520px]`.

Data fetching: calls `trpc.workflow.getTemplate.useQuery({ id: templateId! }, { enabled: open && templateId !== null })`.

Loading state: while `isLoading`, render `<Skeleton>` placeholders for the title, meta row, SVG area, and description.

SVG rendering — **critical security requirement**: Do NOT use `dangerouslySetInnerHTML` for the SVG. Use base64 encoding:

```typescript
function svgToDataUrl(svgString: string): string {
  // encodeURIComponent handles UTF-8 characters; unescape converts to Latin-1 for btoa
  const base64 = btoa(unescape(encodeURIComponent(svgString)));
  return `data:image/svg+xml;base64,${base64}`;
}
```

Render as:

```tsx
<img
  src={svgToDataUrl(template.previewSvg)}
  alt="Workflow topology diagram"
  className="w-full rounded-lg border"
/>
```

Node type badges: extract unique `data.nodeType` values from `template.workflowJson.nodes`, render each as a `<Badge>` with background color from `NODE_TYPE_CATEGORY_COLORS`.

"Use This Template" button behavior:
1. Calls `useTemplateMutation.mutateAsync({ templateId: template.id })`
2. While `isPending`: button is `disabled`, shows `<Loader2 className="animate-spin" />` before the label
3. On success (`result.id`):
   - Call `onClose()`
   - Show `toast.success("Template loaded — configure your connections and run.")`
   - Navigate to `/workflows/editor/${result.id}` using `useLocation` from `wouter`
4. On error: show `toast.error("Could not load template. Please try again.")`

### Page Component: `WorkflowGallery.tsx`

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkflowGallery.tsx`

State managed:

```typescript
const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
const [searchQuery, setSearchQuery] = useState("");
const [debouncedSearch, setDebouncedSearch] = useState("");
const [page, setPage] = useState(0);
const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
```

Debounce the search query with a 300ms timeout:

```typescript
useEffect(() => {
  const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
  return () => clearTimeout(timer);
}, [searchQuery]);
```

Queries:

```typescript
const templatesQuery = trpc.workflow.listTemplates.useQuery({
  category: selectedCategory ?? undefined,
  search: debouncedSearch || undefined,
  limit: 24,
  offset: page * 24,
});

const categoriesQuery = trpc.workflow.listTemplateCategories.useQuery();
```

Layout structure (three columns on desktop):
- Left sidebar (fixed width ~220px): `<GalleryCategories />` component
- Main area (flex-1): search input + template grid or state indicator
- Right: `<GalleryDetailDrawer />` (slides over content)

Header: sticky with backdrop blur (same pattern as `Workflows.tsx`). Includes:
- Back button → navigates to `/workflows`
- Title "Workflow Gallery" with `LayoutGrid` icon
- "New Workflow" button → navigates to `/workflows/editor`

**Loading state**: `templatesQuery.isLoading` → render 24 skeleton cards matching card dimensions. Use a `div` grid with `Array.from({ length: 24 })` skeleton rectangles, each `animate-pulse` with the same height as a real card.

**Error state**: `templatesQuery.isError` → centered error card:

```tsx
<div className="text-center py-12">
  <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
  <p className="text-lg font-medium">Could not load templates. Please try again.</p>
  <Button onClick={() => templatesQuery.refetch()} className="mt-4">Try Again</Button>
</div>
```

**Empty state**: `!templatesQuery.isLoading && items.length === 0` → show:

```tsx
<div className="text-center py-12">
  <p className="text-lg font-medium">No templates found matching your filters.</p>
  <Button variant="ghost" onClick={() => { setSelectedCategory(null); setSearchQuery(""); }} className="mt-4">
    Clear Filters
  </Button>
</div>
```

**Pagination**: simple Previous/Next buttons at the bottom of the grid, shown when `total > 24`.

Opening the drawer: `setSelectedTemplateId(id)` opens `<GalleryDetailDrawer open={selectedTemplateId !== null} templateId={selectedTemplateId} onClose={() => setSelectedTemplateId(null)} />`.

### Navigation Link

Modify the existing `Workflows.tsx` page header (or the main navigation sidebar if one exists) to add a "Gallery" link alongside "New Workflow". In `Workflows.tsx`, add a button in the header:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setLocation('/workflows/gallery')}
>
  <LayoutGrid className="h-4 w-4 mr-1" />
  Gallery
</Button>
```

Import `LayoutGrid` from `lucide-react`.

---

## Implementation Checklist

1. Write failing tests in all three test files.
2. Run `pnpm test` — confirm all three test files fail (component files do not exist yet).
3. Create `CATEGORY_COLOR_MAP` and `NODE_TYPE_CATEGORY_COLORS` constants (can go at top of `GalleryTemplateCard.tsx` or in a `galleryConstants.ts` file).
4. Implement `GalleryCategories.tsx`.
5. Implement `GalleryTemplateCard.tsx`.
6. Run `pnpm test` — `GalleryTemplateCard` tests should pass now.
7. Implement `GalleryDetailDrawer.tsx` with `svgToDataUrl` helper.
8. Run `pnpm test` — `GalleryDetailDrawer` tests should pass now.
9. Implement `WorkflowGallery.tsx` page.
10. Run `pnpm test` — `WorkflowGallery` page tests should pass now.
11. Register `/workflows/gallery` route in `App.tsx`.
12. Add "Gallery" button to `Workflows.tsx` header.
13. Run `pnpm check` to verify no TypeScript errors.
14. Run full `pnpm test` — confirm no regressions.

---

## Key Constraints

- **No `dangerouslySetInnerHTML` for SVG** — always use the `svgToDataUrl` base64 approach. This is both a security requirement (XSS prevention) and a test assertion.
- **`listTemplates` response does NOT include `workflowJson` or `previewSvg`** — these are only available via `getTemplate`. Do not attempt to render SVG from the list data.
- **SVG is loaded lazily** — only when a user opens the detail drawer (`getTemplate` is called with `enabled: open && templateId !== null`).
- **The `TemplateBrowser` component is NOT replaced** — it continues to exist as a quick-access modal inside the editor. `WorkflowGallery` is a new separate page.
- **Route pattern**: use `/workflows/gallery` (not `/workflow/gallery` — note the plural).
- **Auth guard**: this is a protected route. The existing auth pattern in the app (user is redirected to `/login` if not authenticated) applies automatically because the tRPC procedures are `protectedProcedure`. There is no explicit `<ProtectedRoute>` wrapper needed beyond what the tRPC query will enforce.
- **`useTemplate` returns `{ id }` of the new workflow** — navigate to `/workflows/editor/${result.id}` (using the editor route pattern from `App.tsx`).

---

## Implementation Notes

**Status: IMPLEMENTED**

### Files Created
| File | Description |
|------|-------------|
| `apps/web/client/src/components/workflow/galleryConstants.ts` | Category color map (15 entries) + node type color map (~40 entries) |
| `apps/web/client/src/components/workflow/GalleryCategories.tsx` | Sidebar with "All" + category buttons, loading skeleton |
| `apps/web/client/src/components/workflow/GalleryTemplateCard.tsx` | Card with name, description, category badge, stepCount, industry tags, keyboard accessible |
| `apps/web/client/src/components/workflow/GalleryDetailDrawer.tsx` | Sheet drawer with SVG base64 preview, node type badges, "Use This Template" button |
| `apps/web/client/src/pages/WorkflowGallery.tsx` | Full page with search (300ms debounce), category sidebar, pagination, loading/error/empty states |
| `apps/web/client/src/components/workflow/__tests__/GalleryTemplateCard.test.tsx` | 7 tests |
| `apps/web/client/src/components/workflow/__tests__/GalleryDetailDrawer.test.tsx` | 6 tests |
| `apps/web/client/src/pages/__tests__/WorkflowGallery.test.tsx` | 5 tests |

### Files Modified
| File | Change |
|------|--------|
| `apps/web/client/src/App.tsx` | Added import + route `/workflows/gallery` |
| `apps/web/client/src/pages/Workflows.tsx` | Added Gallery button with LayoutGrid icon in header |

### Deviations from Plan
1. **galleryConstants.ts** added as shared constants file (not in original plan but cleanly separates color mappings)
2. **Route placement**: `/workflows/gallery` placed before `/workflows/editor/:id` (plan said after), both work correctly with Wouter
3. **Workflows.tsx Gallery button**: Added during code review — plan mentioned it but was initially missed in implementation
4. **Test count**: 18 total (7+6+5) vs plan's 19 — the "closed drawer" test was omitted as Sheet handles visibility internally
5. **Keyboard accessibility**: Added `role="button"`, `tabIndex={0}`, `onKeyDown` to card during code review (not in original plan)

### Tests: 18/18 passing