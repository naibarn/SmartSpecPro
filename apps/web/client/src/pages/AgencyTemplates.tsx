/**
 * AgencyTemplates page.
 *
 * Displays available agency templates in a gallery grid.
 * "Use Template" creates a new agency and navigates to the builder.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search,
  PenTool,
  FileText,
  Code,
  Users,
  ArrowRight,
  Loader2,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Search,
  PenTool,
  FileText,
  Code,
};

export default function AgencyTemplates() {
  const [, setLocation] = useLocation();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const templatesQuery = trpc.agency.listTemplates.useQuery();
  const createMutation = trpc.agency.createFromTemplate.useMutation({
    onSuccess: (data) => {
      setCreatingId(null);
      toast.success("Agency created from template");
      setLocation(`/agencies/${data.id}/edit`);
    },
    onError: (err) => {
      toast.error(err.message);
      setCreatingId(null);
    },
  });

  const handleUseTemplate = (templateId: string) => {
    setCreatingId(templateId);
    createMutation.mutate({ agencyTemplateId: templateId });
  };

  if (templatesQuery.isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Agency Templates</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6 space-y-4">
                <div className="h-10 w-10 bg-gray-200 rounded-lg" />
                <div className="h-5 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-100 rounded w-full" />
                <div className="h-4 bg-gray-100 rounded w-2/3" />
                <div className="h-8 bg-gray-200 rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (templatesQuery.isError) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Agency Templates</h1>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-gray-500 mb-4">
              {templatesQuery.error?.message === "Not found"
                ? "Agency templates are not available yet."
                : `Failed to load templates: ${templatesQuery.error?.message}`}
            </p>
            <Button
              variant="outline"
              onClick={() => templatesQuery.refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const templates = templatesQuery.data?.templates ?? [];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Agency Templates</h1>
        <p className="text-gray-500 mt-1">
          Get started quickly with pre-built multi-agent teams.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {templates.map((template: (typeof templates)[number]) => {
          const IconComponent = iconMap[template.icon] ?? Search;
          const isCreating = creatingId === template.id;

          return (
            <Card
              key={template.id}
              className="group hover:shadow-md transition-shadow"
            >
              <CardContent className="pt-6 flex flex-col h-full">
                <div className="mb-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
                    <IconComponent className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                    {template.description}
                  </p>
                </div>

                <div className="flex gap-2 mb-4 mt-auto">
                  <Badge variant="secondary" className="text-xs">
                    <Users className="w-3 h-3 mr-1" />
                    {template.agentCount} Agents
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {template.category}
                  </Badge>
                </div>

                <Button
                  className="w-full"
                  onClick={() => handleUseTemplate(template.id)}
                  disabled={isCreating || createMutation.isPending}
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Use Template
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
