import { useMemo, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";

interface TableRendererProps {
  content: string;
}

export function TableRenderer({ content }: TableRendererProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const tableData = useMemo(() => {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.rows && Array.isArray(parsed.rows)) return parsed.rows;
      return null;
    } catch {
      return null;
    }
  }, [content]);

  if (!tableData || tableData.length === 0) {
    return (
      <div className="rounded-md border p-4">
        <p className="text-sm text-muted-foreground">Unable to parse table data</p>
        <pre className="mt-2 overflow-x-auto text-xs">{content}</pre>
      </div>
    );
  }

  const columns = Object.keys(tableData[0]);
  const sorted = sortKey
    ? [...tableData].sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
        return sortAsc ? cmp : -cmp;
      })
    : tableData;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col}>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleSort(col)}>
                  {col}
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row: any, i: number) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col} className="text-sm">
                  {String(row[col] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
