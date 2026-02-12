import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowUpDown,
  Search,
  Download,
  AlertCircle,
  FileSpreadsheet,
  Layers,
} from "lucide-react";

interface ExcelViewerProps {
  fileUrl: string;
  fileName?: string;
}

interface SheetData {
  name: string;
  data: string[][];
  headers: string[];
  rows: string[][];
}

export default function ExcelViewer({ fileUrl, fileName }: ExcelViewerProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadExcelFile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file (${response.status})`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });

        if (cancelled) return;

        const parsedSheets: SheetData[] = workbook.SheetNames.map((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
            header: 1,
            defval: "",
            raw: false,
          }) as string[][];

          const headers = jsonData.length > 0 ? jsonData[0] : [];
          const rows = jsonData.length > 1 ? jsonData.slice(1) : [];

          return {
            name: sheetName,
            data: jsonData,
            headers,
            rows,
          };
        });

        setSheets(parsedSheets);
        setActiveSheet(0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to parse Excel file");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadExcelFile();

    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  const currentSheet = sheets[activeSheet];

  const filteredAndSortedRows = useMemo(() => {
    if (!currentSheet) return [];

    let rows = [...currentSheet.rows];

    // Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      rows = rows.filter((row) =>
        row.some((cell) => String(cell).toLowerCase().includes(query))
      );
    }

    // Sort
    if (sortColumn !== null) {
      rows.sort((a, b) => {
        const aVal = String(a[sortColumn] || "");
        const bVal = String(b[sortColumn] || "");
        const comparison = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return rows;
  }, [currentSheet, searchQuery, sortColumn, sortDirection]);

  const handleSort = (columnIndex: number) => {
    if (sortColumn === columnIndex) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(columnIndex);
      setSortDirection("asc");
    }
  };

  const handleDownloadSheet = () => {
    if (!currentSheet) return;

    const worksheet = XLSX.utils.aoa_to_sheet(currentSheet.data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, currentSheet.name);
    XLSX.writeFile(workbook, `${currentSheet.name}.xlsx`);
  };

  const handleDownloadAll = async () => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "spreadsheet.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to download file");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-xl border bg-slate-50">
        <div className="text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground animate-pulse mb-3" />
          <p className="text-sm text-muted-foreground">Loading Excel file...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Excel Parsing Error</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (sheets.length === 0 || !currentSheet) {
    return (
      <div className="rounded-xl border bg-slate-50 p-4 text-center text-sm text-muted-foreground">
        No Excel data to display
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-white shadow-sm">
      {/* Header */}
      <div className="border-b bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-semibold text-emerald-900">
                {fileName || "Excel Spreadsheet"}
              </h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-emerald-700">
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {sheets.length} {sheets.length === 1 ? "sheet" : "sheets"}
                </span>
                {currentSheet && (
                  <>
                    <span>•</span>
                    <span>{currentSheet.rows.length} rows</span>
                    <span>•</span>
                    <span>{currentSheet.headers.length} columns</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {sheets.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadSheet}
                className="h-8 text-xs"
              >
                <Download className="mr-1 h-3 w-3" />
                Current Sheet
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadAll}
              className="h-8 text-xs"
            >
              <Download className="mr-1 h-3 w-3" />
              Download All
            </Button>
          </div>
        </div>
      </div>

      {/* Sheets Tabs */}
      {sheets.length > 1 ? (
        <Tabs value={String(activeSheet)} onValueChange={(v) => setActiveSheet(Number(v))}>
          <div className="px-4">
            <TabsList className="w-full justify-start overflow-x-auto">
              {sheets.map((sheet, index) => (
                <TabsTrigger key={index} value={String(index)} className="text-xs">
                  <FileSpreadsheet className="mr-1 h-3 w-3" />
                  {sheet.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {sheets.map((sheet, index) => (
            <TabsContent key={index} value={String(index)} className="mt-0">
              <SheetContent
                sheet={sheet}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                handleSort={handleSort}
                filteredAndSortedRows={filteredAndSortedRows}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <SheetContent
          sheet={currentSheet}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          handleSort={handleSort}
          filteredAndSortedRows={filteredAndSortedRows}
        />
      )}
    </div>
  );
}

interface SheetContentProps {
  sheet: SheetData;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortColumn: number | null;
  sortDirection: "asc" | "desc";
  handleSort: (columnIndex: number) => void;
  filteredAndSortedRows: string[][];
}

function SheetContent({
  sheet,
  searchQuery,
  setSearchQuery,
  sortColumn,
  sortDirection,
  handleSort,
  filteredAndSortedRows,
}: SheetContentProps) {
  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-t">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search in spreadsheet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-64 pl-8 text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {filteredAndSortedRows.length} of {sheet.rows.length} rows
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[65vh] overflow-auto px-4 pb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center bg-slate-100 font-bold">#</TableHead>
              {sheet.headers.map((header, index) => (
                <TableHead
                  key={index}
                  className="cursor-pointer select-none hover:bg-slate-100 bg-slate-50"
                  onClick={() => handleSort(index)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{header || `Column ${String.fromCharCode(65 + index)}`}</span>
                    {sortColumn === index && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={sheet.headers.length + 1} className="text-center text-muted-foreground">
                  No matching rows found
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedRows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell className="text-center bg-slate-50 font-mono text-xs text-muted-foreground">
                    {rowIndex + 1}
                  </TableCell>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className="font-mono text-xs">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
