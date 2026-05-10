import { useState } from "react";
import { AlertCircle, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExcelViewerProps {
  fileUrl: string;
  fileName?: string;
}

export default function ExcelViewer({ fileUrl, fileName }: ExcelViewerProps) {
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setError(null);
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`Failed to fetch file (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "spreadsheet.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download file");
    }
  };

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-emerald-50 p-2 text-emerald-700">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-950">
              {fileName || "Spreadsheet file"}
            </h3>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Spreadsheet preview is disabled for security. Download the original file and open it in a trusted spreadsheet app.
            </p>
          </div>
        </div>

        <Button onClick={handleDownload} className="shrink-0">
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
