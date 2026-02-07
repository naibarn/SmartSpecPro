import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ColumnDef<T> {
  header: string;
  accessor: (row: T) => string | number;
  align?: "left" | "right";
  className?: string;
}

interface BreakdownTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  emptyMessage?: string;
}

export function BreakdownTable<T>({
  columns,
  data,
  emptyMessage = "No data available.",
}: BreakdownTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col, i) => (
            <TableHead key={i} className={col.align === "right" ? "text-right" : ""}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, rowIdx) => (
          <TableRow key={rowIdx}>
            {columns.map((col, colIdx) => (
              <TableCell
                key={colIdx}
                className={`${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}
              >
                {col.accessor(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
