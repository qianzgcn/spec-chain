"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { Badge } from "@/components/ui/badge";
import { formatCompactDateTime, formatDetailedDateTime } from "@/lib/date-time";

export type PendingRequirementListItem = {
  id: string;
  title: string;
  feature: { code: string; name: string } | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

const columns: ColumnDef<PendingRequirementListItem>[] = [
  {
    accessorKey: "title",
    header: "标题",
    cell: ({ row }) => (
      <span className="block truncate font-medium" title={row.original.title}>
        {row.original.title}
      </span>
    ),
  },
  {
    accessorKey: "feature",
    header: "所属 FE",
    size: 230,
    meta: {
      headerClassName: "max-xl:hidden",
      cellClassName: "max-xl:hidden",
    },
    cell: ({ row }) =>
      row.original.feature ? (
        <span
          className="text-muted-foreground block truncate"
          title={`${row.original.feature.code} · ${row.original.feature.name}`}
        >
          {row.original.feature.code} · {row.original.feature.name}
        </span>
      ) : (
        <Badge variant="secondary">未归属 FE</Badge>
      ),
  },
  {
    accessorKey: "createdAt",
    header: "生成时间",
    size: 170,
    meta: {
      headerClassName: "max-[1360px]:hidden",
      cellClassName: "max-[1360px]:hidden text-muted-foreground",
    },
    cell: ({ row }) => formatDetailedDateTime(row.original.createdAt),
  },
  {
    accessorKey: "createdBy",
    header: "创建人",
    size: 120,
    cell: ({ row }) => (
      <span
        className="text-muted-foreground truncate"
        title={row.original.createdBy}
      >
        {row.original.createdBy}
      </span>
    ),
  },
  {
    accessorKey: "updatedAt",
    header: "更新时间",
    size: 150,
    meta: { cellClassName: "text-muted-foreground" },
    cell: ({ row }) => formatCompactDateTime(row.original.updatedAt),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">操作</span>,
    size: 56,
    meta: { headerClassName: "text-left", cellClassName: "text-left" },
    cell: ({ row }) => (
      <DataTableRowActions
        actions={[
          {
            label: "评审",
            href: `/requirements/pending-review/${row.original.id}`,
          },
        ]}
      />
    ),
  },
];

export function PendingRequirementsList({
  items,
  total,
  page,
}: {
  items: PendingRequirementListItem[];
  total: number;
  page: number;
}) {
  const { isNavigating, navigate } = useNavigationFeedback();

  function changePage(nextPage: number) {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set("page", String(nextPage));
    navigate(`/requirements/pending-review${params.size ? `?${params}` : ""}`);
  }

  return (
    <DataTableShell
      toolbar={
        <span className="text-muted-foreground text-xs">
          共 {total} 条待评审需求
        </span>
      }
      footer={
        <DataTablePagination
          page={page}
          pageSize={20}
          total={total}
          itemName="条需求"
          onChange={changePage}
        />
      }
    >
      <DataTable
        columns={columns}
        data={items}
        loading={isNavigating}
        emptyText="暂无待评审需求"
        getRowId={(item) => item.id}
      />
    </DataTableShell>
  );
}
