import { ChevronDown, Download, FileCode2, FileText, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  downloadMarkdownSource,
  getMarkdownExportDescription,
} from "@/lib/markdownExport";
import { trpc } from "@/lib/trpc";

interface MarkdownExportActionsProps {
  title?: string;
  markdown: string;
}

type MarkdownExportFormat = "html" | "txt" | "docx" | "pdf";

interface MarkdownExportArtifact {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function downloadServerArtifact(artifact: MarkdownExportArtifact): void {
  const blob = new Blob([bytesToBlobPart(base64ToBytes(artifact.dataBase64))], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function MarkdownExportActions({
  title,
  markdown,
}: MarkdownExportActionsProps) {
  const exportMutation = trpc.library.exportMarkdownArtifact.useMutation();
  const isBusy = exportMutation.isPending;

  async function runAction(action: () => Promise<void> | void) {
    if (isBusy) return;

    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      toast.error(message);
    }
  }

  async function runServerExport(format: MarkdownExportFormat) {
    const artifact = await exportMutation.mutateAsync({
      markdown,
      title,
      format,
    });
    downloadServerArtifact(artifact);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="inline-flex max-w-full flex-nowrap items-center gap-1 rounded-full border border-sky-100 bg-white/85 px-1.5 py-1 shadow-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="hidden cursor-help whitespace-nowrap px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 lg:inline">
              ดาวน์โหลด Markdown
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className="max-w-xs text-xs leading-relaxed">
            {getMarkdownExportDescription()}
          </TooltipContent>
        </Tooltip>
        <div className="ml-auto flex flex-nowrap items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1 px-2 lg:px-3"
            onClick={() => void runAction(() => downloadMarkdownSource(markdown, title))}
            disabled={isBusy}
            aria-label="ดาวน์โหลดไฟล์ markdown ต้นฉบับ"
            title="ดาวน์โหลดไฟล์ markdown ต้นฉบับ"
          >
            <Download className="h-4 w-4" />
            <span className="hidden lg:inline">ดาวน์โหลด .md</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1 px-2 lg:px-3"
                disabled={isBusy}
                aria-label="ส่งออก markdown"
                title="ส่งออก markdown"
              >
                <FileCode2 className="h-4 w-4" />
                <span className="hidden lg:inline">ส่งออก</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => void runAction(() => runServerExport("html"))}>
                <FileText className="mr-2 h-4 w-4" />
                ส่งออกเป็น HTML
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void runAction(() => runServerExport("txt"))}>
                <FileText className="mr-2 h-4 w-4" />
                ส่งออกเป็นข้อความล้วน
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void runAction(() => runServerExport("docx"))}>
                <FileCode2 className="mr-2 h-4 w-4" />
                ส่งออกเป็น DOCX
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void runAction(() => runServerExport("pdf"))}>
                <Printer className="mr-2 h-4 w-4" />
                ส่งออกเป็น PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default MarkdownExportActions;
