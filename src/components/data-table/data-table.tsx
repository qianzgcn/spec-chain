"use client";

import type { CSSProperties } from "react";

import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ColumnDef,
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

function getColumnLayoutStyle(
  columnId: string,
  baseWidth: number,
  fluidColumnId: string | undefined,
): CSSProperties {
  // 主内容列吸收剩余空间，其他列保持稳定宽度，避免长内容改变整张表的布局。
  if (columnId === fluidColumnId) {
    return { minWidth: baseWidth };
  }

  return {
    width: baseWidth,
    minWidth: baseWidth,
    maxWidth: baseWidth,
  };
}

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
  headerClassName,
  rowClassName,
}: {
  columns: ColumnDef<TData>[];
  data: TData[];
  loading?: boolean;
  emptyText: string;
  getRowId?: (row: TData) => string;
  getSubRows?: (row: TData) => TData[] | undefined;
  expanded?: ExpandedState;
  onExpandedChange?: OnChangeFn<ExpandedState>;
  headerClassName?: string;
  rowClassName?: (row: Row<TData>) => string | undefined;
}) {
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
      ...(expanded === undefined ? {} : { expanded }),
    },
    onExpandedChange,
  });

  const rows = table.getRowModel().rows;
  const fluidColumnId = table
    .getVisibleLeafColumns()
    .find((column) => column.id !== "actions" && column.id !== "selection")?.id;

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
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={getColumnLayoutStyle(
                    header.column.id,
                    header.getSize(),
                    fluidColumnId,
                  )}
                  className={cn(
                    "truncate",
                    headerClassName,
                    header.column.columnDef.meta?.headerClassName,
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
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
                    style={getColumnLayoutStyle(
                      cell.column.id,
                      cell.column.getSize(),
                      fluidColumnId,
                    )}
                    className={cn(
                      "h-12",
                      cell.column.id === "actions"
                        ? "overflow-visible"
                        : "truncate",
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
