/**
 * Domain Admin Docs Manager
 * List, edit, and bulk delete tenant documentation pages.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DashboardCard } from "@/components/dashboard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ExternalLink,
  FileText,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  BookOpen,
  CheckSquare,
  Square,
} from "lucide-react";

interface TenantPage {
  id?: number;
  pageKey: string;
  title: string;
  slug: string;
  content?: string;
  metadata?: {
    description?: string;
    keywords?: string[];
    customMeta?: Record<string, unknown>;
  };
  isPublished: boolean;
  showInMenu: boolean;
  sortOrder: number;
  updatedAt?: string;
  createdAt?: string;
}

function stripHtml(value?: string): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDocPath(slug: string): string {
  const normalized = slug.replace(/^\/+/, "");
  return `/docs/${normalized}`;
}

export default function DomainDocsAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const { tenant } = useTenant();
  const [, setLocation] = useLocation();

  const [pages, setPages] = useState<TenantPage[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    if (
      !authLoading &&
      (!user || (user.role !== "domain_admin" && user.role !== "admin"))
    ) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    void fetchDocs();
  }, [tenant]);

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/tenant/pages", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch pages");
      }

      const pagesData = await response.json();
      const docsPages = (Object.values(pagesData || {}) as TenantPage[])
        .filter(
          (page: any) =>
            typeof page?.pageKey === "string" &&
            page.pageKey.startsWith("docs-")
        )
        .sort((a: TenantPage, b: TenantPage) => {
          const left = new Date(b.updatedAt || b.createdAt || 0).getTime();
          const right = new Date(a.updatedAt || a.createdAt || 0).getTime();
          return left - right;
        });

      setPages(docsPages);
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Failed to fetch docs:", error);
      toast.error("Failed to load docs");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPages = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return pages;
    return pages.filter(page => {
      const description = page.metadata?.description || "";
      const contentText = stripHtml(page.content);
      return [
        page.title,
        page.slug,
        page.pageKey,
        description,
        contentText,
        page.metadata?.keywords?.join(" ") || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [pages, searchTerm]);

  const defaultEditorPageKey = filteredPages[0]?.pageKey || "docs-intro";
  const visibleIds = filteredPages
    .map(page => page.id)
    .filter((value): value is number => typeof value === "number");
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const selectionCount = selectedIds.size;

  const toggleSelection = (pageId: number, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(pageId);
      } else {
        next.delete(pageId);
      }
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds(prev => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      }

      const next = new Set(prev);
      visibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const openPageEditor = (pageKey: string) => {
    setLocation(`/domain-admin/content?pageKey=${encodeURIComponent(pageKey)}`);
  };

  const deleteSingleDoc = async (page: TenantPage) => {
    if (!page.pageKey) return;

    try {
      const response = await fetch(
        `/api/tenant/pages/${encodeURIComponent(page.pageKey)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || "Failed to delete page");
      }

      toast.success("Doc deleted");
      setDeleteConfirmId(null);
      await fetchDocs();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete doc"
      );
    }
  };

  const bulkDeleteDocs = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      toast.error("Select at least one doc");
      return;
    }

    setIsBulkDeleting(true);
    try {
      const response = await fetch("/api/tenant/pages/bulk-delete", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || "Failed to delete pages");
      }

      toast.success(`Deleted ${ids.length} doc${ids.length === 1 ? "" : "s"}`);
      setBulkDeleteConfirmOpen(false);
      setSelectedIds(new Set());
      await fetchDocs();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete docs"
      );
    } finally {
      setIsBulkDeleting(false);
    }
  };

  if (
    authLoading ||
    !user ||
    (user.role !== "domain_admin" && user.role !== "admin")
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 px-4 sm:px-6 lg:px-8 py-6">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/dashboard")}
            className="text-gray-600 mb-4"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Dashboard
          </Button>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <BookOpen className="w-8 h-8 text-cyan-500" />
                Docs Manager
              </h1>
              <p className="text-gray-600 mt-2">
                Manage docs pages for domain:{" "}
                <span className="font-semibold">
                  {tenant?.name ||
                    (user as any)?.registeredDomain ||
                    "Current domain"}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LocaleToggle className="shrink-0" />
              <Button
                variant="outline"
                onClick={() => setLocation("/domain-admin/blog")}
              >
                <PenLine className="w-4 h-4 mr-2" />
                Manage Blog
              </Button>
              <Button
                variant="outline"
                onClick={() => toggleAllVisible()}
                disabled={visibleIds.length === 0}
              >
                {allVisibleSelected ? (
                  <CheckSquare className="w-4 h-4 mr-2" />
                ) : (
                  <Square className="w-4 h-4 mr-2" />
                )}
                {allVisibleSelected
                  ? "Clear Visible Selection"
                  : "Select All Visible"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setBulkDeleteConfirmOpen(true)}
                disabled={selectionCount === 0}
                className="border-red-200 text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected{" "}
                {selectionCount > 0 ? `(${selectionCount})` : ""}
              </Button>
              <Button
                onClick={() => openPageEditor(defaultEditorPageKey)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Open Docs Editor
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-4 border-b flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search docs by title, slug, keyword, or content..."
                className="pl-10"
              />
            </div>
            <Button variant="outline" onClick={() => void fetchDocs()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : filteredPages.length === 0 ? (
              <DashboardCard>
                <div className="text-center py-16">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">
                    {pages.length === 0 ? "No docs yet" : "No matching docs"}
                  </h3>
                  <p className="text-gray-500 mb-6">
                    {pages.length === 0
                      ? "Create docs pages from the content editor or content import tools."
                      : "Try a different search term."}
                  </p>
                  <Button
                    onClick={() => openPageEditor(defaultEditorPageKey)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Open Docs Editor
                  </Button>
                </div>
              </DashboardCard>
            ) : (
              <div className="space-y-3">
                {filteredPages.map(page => (
                  <DashboardCard
                    key={page.id}
                    className={`transition-shadow ${
                      page.id && selectedIds.has(page.id)
                        ? "border-cyan-200 bg-cyan-50/40 shadow-md"
                        : "hover:shadow-md"
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        <Checkbox
                          checked={!!page.id && selectedIds.has(page.id)}
                          onCheckedChange={checked =>
                            toggleSelection(page.id!, checked === true)
                          }
                          aria-label={`Select ${page.title}`}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-gray-900 truncate">
                              {page.title}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                page.isPublished
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {page.isPublished ? "Published" : "Draft"}
                            </span>
                            {page.showInMenu && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700">
                                Menu
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                              Order {page.sortOrder}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 truncate">
                            {page.metadata?.description ||
                              stripHtml(page.content) ||
                              "No description"}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                            <span>{`/docs/${page.slug}`}</span>
                            <span>{page.pageKey}</span>
                            {page.metadata?.keywords?.length ? (
                              <span>
                                {page.metadata.keywords.slice(0, 3).join(", ")}
                              </span>
                            ) : null}
                            {page.updatedAt && (
                              <span>
                                Updated{" "}
                                {new Date(page.updatedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              window.open(
                                buildDocPath(page.slug),
                                "_blank",
                                "noopener,noreferrer"
                              )
                            }
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPageEditor(page.pageKey)}
                          >
                            <PenLine className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmId(page.id!)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </DashboardCard>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={() => setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Doc</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this doc? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const page = pages.find(item => item.id === deleteConfirmId);
                if (page) {
                  void deleteSingleDoc(page);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Selected Docs</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectionCount} selected doc
              {selectionCount === 1 ? "" : "s"}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void bulkDeleteDocs()}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Delete Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
