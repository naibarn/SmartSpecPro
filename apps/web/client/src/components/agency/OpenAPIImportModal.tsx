import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileUp, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ToolPreview {
  name: string;
  description: string;
  httpMethod: string;
  path: string;
  inputSchema: Record<string, unknown>;
  authHint?: { type: string; headerName: string };
}

interface OpenAPIImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: (toolIds: string[]) => void;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  POST: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  PUT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  PATCH: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export function OpenAPIImportModal({
  open,
  onOpenChange,
  onImportComplete,
}: OpenAPIImportModalProps) {
  const [step, setStep] = useState<"input" | "preview">("input");
  const [specContent, setSpecContent] = useState("");
  const [specFormat, setSpecFormat] = useState<"json" | "yaml">("json");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [previews, setPreviews] = useState<ToolPreview[]>([]);
  const [parsedBaseUrl, setParsedBaseUrl] = useState("");
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = (trpc as any).agency?.importOpenAPITools?.useMutation?.({
    onSuccess: (data: { previews: ToolPreview[]; baseUrl: string }) => {
      setPreviews(data.previews);
      setParsedBaseUrl(data.baseUrl);
      setSelectedIndices(new Set(data.previews.map((_: ToolPreview, i: number) => i)));
      setStep("preview");
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to parse OpenAPI spec");
    },
  }) ?? { mutate: () => {}, isPending: false };

  const confirmMutation = (trpc as any).agency?.confirmOpenAPIImport?.useMutation?.({
    onSuccess: (data: { created: number; toolIds: string[] }) => {
      toast.success(`Imported ${data.created} tools`);
      onImportComplete?.(data.toolIds);
      handleClose();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to import tools");
    },
  }) ?? { mutate: () => {}, isPending: false };

  const handleClose = useCallback(() => {
    setStep("input");
    setSpecContent("");
    setSpecFormat("json");
    setBaseUrl("");
    setApiKey("");
    setPreviews([]);
    setSelectedIndices(new Set());
    onOpenChange(false);
  }, [onOpenChange]);

  const handleParse = useCallback(() => {
    importMutation.mutate({
      specContent,
      specFormat,
      baseUrl: baseUrl || undefined,
    });
  }, [specContent, specFormat, baseUrl, importMutation]);

  const handleConfirm = useCallback(() => {
    const selected = previews.filter((_: ToolPreview, i: number) => selectedIndices.has(i));
    confirmMutation.mutate({
      selectedTools: selected.map((t) => ({
        name: t.name,
        description: t.description,
        httpMethod: t.httpMethod,
        path: t.path,
        inputSchema: t.inputSchema,
      })),
      baseUrl: parsedBaseUrl,
      apiKey: apiKey || undefined,
    });
  }, [previews, selectedIndices, parsedBaseUrl, apiKey, confirmMutation]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setSpecContent(content);
        const ext = file.name.toLowerCase();
        if (ext.endsWith(".yaml") || ext.endsWith(".yml")) {
          setSpecFormat("yaml");
        } else {
          setSpecFormat("json");
        }
      };
      reader.readAsText(file);
    },
    [],
  );

  const toggleAll = useCallback(() => {
    if (selectedIndices.size === previews.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(previews.map((_: ToolPreview, i: number) => i)));
    }
  }, [selectedIndices, previews]);

  const toggleIndex = useCallback(
    (index: number) => {
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
    },
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "preview" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setStep("input")}
                data-testid="back-to-input"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            Import from OpenAPI
          </DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>OpenAPI Specification</Label>
              <Textarea
                placeholder="Paste your OpenAPI 3.0/3.1 spec here..."
                value={specContent}
                onChange={(e) => setSpecContent(e.target.value)}
                rows={10}
                className="font-mono text-xs"
                data-testid="spec-content-input"
              />
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.yaml,.yml"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="upload-file-btn"
                >
                  <FileUp className="mr-1.5 h-3.5 w-3.5" />
                  Upload File
                </Button>
                <div className="flex items-center gap-2 ml-auto">
                  <Label className="text-xs text-muted-foreground">Format:</Label>
                  <select
                    value={specFormat}
                    onChange={(e) => setSpecFormat(e.target.value as "json" | "yaml")}
                    className="text-xs border rounded px-2 py-1"
                    data-testid="format-select"
                  >
                    <option value="json">JSON</option>
                    <option value="yaml">YAML</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Base URL Override (optional)</Label>
              <Input
                placeholder="https://api.example.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                data-testid="base-url-input"
              />
            </div>

            <div className="space-y-2">
              <Label>API Key (optional)</Label>
              <Input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                data-testid="api-key-input"
              />
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 py-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">
                {selectedIndices.size} of {previews.length} selected
              </Badge>
              <Button variant="ghost" size="sm" onClick={toggleAll} data-testid="toggle-all-btn">
                {selectedIndices.size === previews.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            <ScrollArea className="flex-1 max-h-[40vh]">
              <div className="space-y-1">
                {previews.map((preview, index) => (
                  <label
                    key={index}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    data-testid={`preview-row-${index}`}
                  >
                    <Checkbox
                      checked={selectedIndices.has(index)}
                      onCheckedChange={() => toggleIndex(index)}
                      data-testid={`preview-checkbox-${index}`}
                    />
                    <Badge
                      className={`${METHOD_COLORS[preview.httpMethod] || "bg-gray-100"} text-[10px] font-mono px-1.5`}
                    >
                      {preview.httpMethod}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{preview.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{preview.path}</div>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {step === "input" && (
            <Button
              onClick={handleParse}
              disabled={!specContent.trim() || importMutation.isPending}
              data-testid="parse-btn"
            >
              {importMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Parse & Preview
            </Button>
          )}
          {step === "preview" && (
            <Button
              onClick={handleConfirm}
              disabled={selectedIndices.size === 0 || confirmMutation.isPending}
              data-testid="confirm-import-btn"
            >
              {confirmMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
              )}
              Import {selectedIndices.size} Tools
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
