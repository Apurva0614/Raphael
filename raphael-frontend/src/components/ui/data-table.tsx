import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: keyof T & string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  width?: string;
  render?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T extends Record<string, any>> {
  columns: DataTableColumn<T>[];
  data: T[];
  className?: string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  className,
  onRowClick,
  emptyMessage = "No records.",
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const sorted = React.useMemo(() => {
    if (!sortKey) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className={cn("overflow-hidden rounded-lg border border-[#1e2d1e]", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#1e2d1e] bg-[#0d150d]">
            {columns.map((col) => {
              const active = sortKey === col.key;
              const Icon = !col.sortable
                ? null
                : !active
                ? ArrowUpDown
                : sortDir === "asc"
                ? ArrowUp
                : ArrowDown;
              return (
                <th
                  key={col.key}
                  style={{ width: col.width, textAlign: col.align ?? "left" }}
                  className={cn(
                    "px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--cream-muted)]",
                    col.sortable && "cursor-pointer select-none hover:text-[var(--cream)]",
                  )}
                  onClick={() => col.sortable && toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.header}
                    {Icon && <Icon className="h-3 w-3 opacity-70" />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center font-mono text-xs text-[var(--cream-muted)]/70"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
          {sorted.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "border-b border-[#1e2d1e]/70 transition-colors last:border-b-0",
                "hover:bg-[#152015]",
                onRowClick && "cursor-pointer",
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{ textAlign: col.align ?? "left" }}
                  className="px-4 py-3 text-[var(--cream)]/90"
                >
                  {col.render ? col.render(row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
