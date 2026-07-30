"use client";

import { useState } from "react";

import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type ExpandedState,
  type OnChangeFn,
  type Row,
} from "@tanstack/react-table";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // 泛型参数必须与 TanStack Table 的模块声明保持完全一致。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    headerClassName?: string;
    cellClassName?: string;
  }
}

export function DataTable<TData>({
  columns,
  data,
  loading = false,
  emptyText,
  getRowId,
  getSubRows,
  expanded,
  onExpandedChange,
  rowClassName,
  resizable,
}: {
  columns: ColumnDef<TData>[];
  data: TData[];
  loading?: boolean;
  emptyText: string;
  getRowId?: (row: TData) => string;
  getSubRows?: (row: TData) => TData[] | undefined;
  expanded?: ExpandedState;
  onExpandedChange?: OnChangeFn<ExpandedState>;
  rowClassName?: (row: Row<TData>) => string | undefined;
  resizable?: boolean;
}) {
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const columnResizingEnabled = resizable ?? columns.length >= 5;

  // TanStack Table 的实例由库内部管理，React Compiler 不应尝试记忆化它。
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getRowId,
    getSubRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    state: {
      columnSizing,
      ...(expanded === undefined ? {} : { expanded }),
    },
    onExpandedChange,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    enableColumnResizing: columnResizingEnabled,
    defaultColumn: {
      minSize: 56,
      maxSize: 640,
    },
  });

  const rows = table.getRowModel().rows;
  const flexibleColumnId = table
    .getVisibleLeafColumns()
    .find((column) => column.id !== "actions")?.id;

  return (
    <div className="relative min-h-0 flex-1">
      <Table
        containerClassName="h-full overflow-auto"
        className="table-fixed"
        data-testid="data-table"
      >
        <TableHeader className="bg-muted/95 sticky top-0 z-10 backdrop-blur-sm">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const canResize =
                  columnResizingEnabled &&
                  header.column.id !== flexibleColumnId &&
                  header.column.id !== "actions" &&
                  header.column.getCanResize();

                return (
                  <TableHead
                    key={header.id}
                    style={
                      header.column.id === flexibleColumnId
                        ? undefined
                        : { width: header.getSize() }
                    }
                    className={cn(
                      "group/column relative",
                      canResize && "pr-3",
                      header.column.columnDef.meta?.headerClassName,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                    {canResize ? (
                      <div
                        data-testid={`column-resizer-${header.column.id}`}
                        aria-hidden="true"
                        onDoubleClick={() => header.column.resetSize()}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={cn(
                          "absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none select-none",
                          "after:bg-border after:absolute after:top-1/2 after:right-0 after:h-5 after:w-px after:-translate-y-1/2 after:transition-colors",
                          header.column.getIsResizing() &&
                            "after:bg-ring after:w-0.5",
                        )}
                      />
                    ) : null}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow
                key={row.id}
                className={rowClassName?.(row)}
                aria-expanded={
                  row.getCanExpand() ? row.getIsExpanded() : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "h-12 overflow-hidden",
                      cell.column.columnDef.meta?.cellClassName,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="h-64 whitespace-normal"
              >
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{emptyText}</EmptyTitle>
                    <EmptyDescription>
                      可以调整筛选条件，或新建第一条数据。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {loading ? (
        <div
          className="bg-background/65 absolute inset-0 z-20 grid place-items-center backdrop-blur-[1px]"
          role="status"
          aria-label="正在加载"
        >
          <Spinner className="size-5" />
        </div>
      ) : null}
    </div>
  );
}
