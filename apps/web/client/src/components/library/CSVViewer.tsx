import { useState, useEffect, useMemo } from "react";
import { parse, ParseResult } from "papaparse";
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
import { ArrowUpDown, Search, Download, AlertCircle } from "lucide-react";

interface CSVViewerProps {
  csvData: string;
  fileName?: string;
}

export default function CSVViewer({ csvData, fileName }: CSVViewerProps) {
  const [parsedData, setParsedData] = useState<ParseResult<string[]> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const result = parse<string[]>(csvData, {
        header: false,
        skipEmptyLines: true,
        dynamicTyping: false,
      });

      if (result.errors.length > 0) {
        setError(`CSV parsing errors: ${result.errors.map((e) => e.message).join(", ")}`);
      } else {
        setError(null);
      }

      setParsedData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse CSV");
      setParsedData(null);
    }
  }, [csvData]);

  const headers = useMemo(() => {
    if (!parsedData || parsedData.data.length === 0) return [];
    return parsedData.data[0];
  }, [parsedData]);

  const dataRows = useMemo(() => {
    if (!parsedData || parsedData.data.length <= 1) return [];
    return parsedData.data.slice(1);
  }, [parsedData]);

  const filteredAndSortedRows = useMemo(() => {
    let rows = [...dataRows];

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
  }, [dataRows, searchQuery, sortColumn, sortDirection]);

  const handleSort = (columnIndex: number) => {
    if (sortColumn === columnIndex) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(columnIndex);
      setSortDirection("asc");
    }
  };

  const handleDownloadCSV = () => {
    const blob = new Blob([csvData], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">CSV Parsing Error</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!parsedData || dataRows.length === 0) {
    return (
      <div className="rounded-xl border bg-slate-50 p-4 text-center text-sm text-muted-foreground">
        No CSV data to display
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search in table..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-64 pl-8 text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {filteredAndSortedRows.length} of {dataRows.length} rows
            {headers.length > 0 && ` • ${headers.length} columns`}
          </span>
        </div>

        <Button size="sm" variant="outline" onClick={handleDownloadCSV} className="h-8 text-xs">
          <Download className="mr-1 h-3 w-3" />
          Download CSV
        </Button>
      </div>

      {/* Table */}
      <div className="max-h-[70vh] overflow-auto px-4 pb-4">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header, index) => (
                <TableHead
                  key={index}
                  className="cursor-pointer select-none hover:bg-slate-100"
                  onClick={() => handleSort(index)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{header || `Column ${index + 1}`}</span>
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
                <TableCell colSpan={headers.length} className="text-center text-muted-foreground">
                  No matching rows found
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedRows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
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
    </div>
  );
}
