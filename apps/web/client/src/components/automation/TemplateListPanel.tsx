/**
 * TemplateListPanel — Browsable list of automation templates.
 */

import { useState } from "react";
import { BookOpen, Globe, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface TemplateListPanelProps {
  onSelectTemplate: (intent: unknown, scripts: unknown, name: string) => void;
  onBack: () => void;
}

export function TemplateListPanel({ onSelectTemplate, onBack }: TemplateListPanelProps) {
  const [search, setSearch] = useState("");

  const templatesQuery = trpc.automationCopilot.listTemplates.useQuery({
    limit: 50,
  });

  const useTemplateMutation = trpc.automationCopilot.useTemplate.useMutation();
  const deleteTemplateMutation = trpc.automationCopilot.deleteTemplate.useMutation();

  const templates = (templatesQuery.data?.templates ?? []).filter((t) =>
    search ? t.name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  const handleUseTemplate = async (templateId: string) => {
    try {
      const result = await useTemplateMutation.mutateAsync({ templateId });
      onSelectTemplate(result.intent, result.scripts, result.name);
    } catch {
      toast.error("Failed to load template");
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      await deleteTemplateMutation.mutateAsync({ templateId });
      templatesQuery.refetch();
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <BookOpen className="h-4 w-4" />
          Templates
        </h3>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Back
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search templates..."
        className="w-full rounded-md border px-3 py-1.5 text-sm"
      />

      {templatesQuery.isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {templates.length === 0 && !templatesQuery.isLoading && (
        <p className="py-4 text-center text-sm text-gray-400">No templates found</p>
      )}

      <div className="max-h-60 space-y-1 overflow-y-auto">
        {templates.map((t) => (
          <div
            key={t.id}
            className="group flex items-center justify-between rounded-md border p-2 hover:bg-gray-50"
          >
            <button
              type="button"
              onClick={() => handleUseTemplate(t.id)}
              className="flex-1 text-left"
            >
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {t.name}
                {t.isPublic && (
                  <span title="Public template">
                    <Globe className="h-3 w-3 text-blue-400" />
                  </span>
                )}
              </div>
              {t.description && (
                <p className="text-xs text-gray-400 line-clamp-1">{t.description}</p>
              )}
              <span className="text-xs text-gray-300">
                Used {t.usageCount}x
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(t.id);
              }}
              className="ml-2 hidden rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 group-hover:block"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
