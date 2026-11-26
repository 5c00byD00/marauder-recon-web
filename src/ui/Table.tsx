import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  id: string;
  label: string;
  sortValue: (row: T) => string | number;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  rows: T[];
  columns: Column<T>[];
  text: (row: T) => string;
  rowKey: (row: T) => string;
  empty: string;
  initialSort?: string;
}

export function DataTable<T>({ rows, columns, text, rowKey, empty, initialSort }: TableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortId, setSortId] = useState(initialSort ?? columns[0]?.id ?? "");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = needle ? rows.filter((row) => text(row).toLowerCase().includes(needle)) : rows;
    const column = columns.find((item) => item.id === sortId) ?? columns[0];
    if (!column) return visible;
    return [...visible].sort((left, right) => {
      const a = column.sortValue(left);
      const b = column.sortValue(right);
      const compared = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      return direction === "asc" ? compared : -compared;
    });
  }, [columns, direction, query, rows, sortId, text]);

  function toggle(id: string) {
    if (sortId === id) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortId(id);
      setDirection("asc");
    }
  }

  return (
    <div className="table-block">
      <label className="filter">
        <span>Filter</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="MAC, vendor, SSID, flag" />
      </label>
      <p className="count-line">
        {filtered.length} of {rows.length}
      </p>
      {filtered.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.id} aria-sort={sortId === column.id ? (direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggle(column.id)}>
                      {column.label}
                      {sortId === column.id ? (direction === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.id} className={column.className}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
