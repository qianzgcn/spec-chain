"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type Column,
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

const FIXED_UTILITY_COLUMN_IDS = new Set(["actions", "selection"]);

type SizedColumn = {
  id: string;
  minimumWidth: number;
};

function distributeColumnWidths(
  columns: SizedColumn[],
  containerWidth: number,
) {
  const minimumTableWidth = columns.reduce(
    (total, column) => total + column.minimumWidth,
    0,
  );
  const flexibleColumns = columns.filter(
    (column) => !FIXED_UTILITY_COLUMN_IDS.has(column.id),
  );
  const flexibleMinimumWidth = flexibleColumns.reduce(
    (total, column) => total + column.minimumWidth,
    0,
  );
  const remainingWidth = Math.max(0, containerWidth - minimumTableWidth);
  const widths = new Map<string, number>();

  for (const column of columns) {
    const canGrow =
      flexibleMinimumWidth > 0 && !FIXED_UTILITY_COLUMN_IDS.has(column.id);
    const extraWidth = canGrow
      ? remainingWidth * (column.minimumWidth / flexibleMinimumWidth)
      : 0;

    widths.set(column.id, column.minimumWidth + extraWidth);
  }

  return {
    tableWidth: Math.max(containerWidth, minimumTableWidth),
    widths,
  };
}

function getColumnStyle<TData>(
  column: Column<TData>,
  width: number,
): CSSProperties {
  const pinnedSide = column.getIsPinned();

  return {
    left: pinnedSide === "left" ? `${column.getStart("left")}px` : undefined,
    right: pinnedSide === "right" ? `${column.getAfter("right")}px` : undefined,
    position: pinnedSide ? "sticky" : undefined,
    width,
    minWidth: width,
    maxWidth: width,
  };
}

function getPinnedHeaderClassName(pinnedSide: "left" | "right" | false) {
  if (!pinnedSide) return "";
  return pinnedSide === "left" ? "z-20 border-r" : "z-20 border-l";
}

function getPinnedCellClassName(pinnedSide: "left" | "right" | false) {
  if (!pinnedSide) return "truncate";

  const borderClass = pinnedSide === "left" ? "border-r" : "border-l";
  return cn(
    "z-[1] overflow-visible bg-background",
    "group-hover/row:bg-muted group-has-aria-expanded/row:bg-muted group-data-[state=selected]/row:bg-muted",
    borderClass,
  );
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
  rowClassName?: (row: Row<TData>) => string | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // TanStack Table 的实例由库内部管理，React Compiler 不应尝试记忆化它。
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getRowId,
    getSubRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    initialState: {
      columnPinning: { right: ["actions"] },
    },
    state: {
      ...(expanded === undefined ? {} : { expanded }),
    },
    onExpandedChange,
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      setContainerWidth((currentWidth) => {
        const nextWidth = container.clientWidth;
        return currentWidth === nextWidth ? currentWidth : nextWidth;
      });
    };
    const observer = new ResizeObserver(updateWidth);

    updateWidth();
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const { tableWidth, widths } = distributeColumnWidths(
    visibleColumns.map((column) => ({
      id: column.id,
      minimumWidth: column.getSize(),
    })),
    containerWidth,
  );

  return (
    <div className="relative min-h-0 flex-1">
      <Table
        containerRef={containerRef}
        containerClassName="h-full overflow-auto"
        className="table-fixed border-separate border-spacing-0"
        style={{ width: tableWidth }}
        data-testid="data-table"
      >
        <colgroup>
          {visibleColumns.map((column) => (
            <col key={column.id} style={{ width: widths.get(column.id) }} />
          ))}
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={getColumnStyle(
                    header.column,
                    widths.get(header.column.id) ?? header.column.getSize(),
                  )}
                  className={cn(
                    "bg-muted sticky top-0 z-10 overflow-hidden align-middle text-ellipsis",
                    getPinnedHeaderClassName(header.column.getIsPinned()),
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
                className={cn("group/row bg-background", rowClassName?.(row))}
                aria-expanded={
                  row.getCanExpand() ? row.getIsExpanded() : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    style={getColumnStyle(
                      cell.column,
                      widths.get(cell.column.id) ?? cell.column.getSize(),
                    )}
                    className={cn(
                      "h-12",
                      getPinnedCellClassName(cell.column.getIsPinned()),
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
                colSpan={visibleColumns.length}
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
