"use client";

import { useState, useTransition } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteDeliveryVersionAction,
  setCurrentDeliveryVersionAction,
} from "@/app/actions/delivery-versions";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import type { DeliveryVersionStatus } from "@/generated/prisma/enums";
import { formatCompactDateTime } from "@/lib/date-time";
import { DELIVERY_VERSION_STATUS_META } from "@/lib/delivery-versions/meta";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

export type DeliveryVersionListItem = {
  id: string;
  code: string;
  name: string;
  status: DeliveryVersionStatus;
  locked: boolean;
  current: boolean;
  userStoryCount: number;
  updatedAt: string;
};

export function DeliveryVersionsList({
  items,
}: {
  items: DeliveryVersionListItem[];
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] =
    useState<DeliveryVersionListItem | null>(null);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = items.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function makeCurrent(item: DeliveryVersionListItem) {
    startTransition(async () => {
      const result = await setCurrentDeliveryVersionAction(item.id);
      toast.add({
        type: result.ok ? "success" : "error",
        description: result.message,
      });
      if (result.ok) router.refresh();
    });
  }

  function remove() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteDeliveryVersionAction(deleteTarget.id);
      toast.add({
        type: result.ok ? "success" : "error",
        description: result.message,
      });
      if (result.ok) {
        setDeleteTarget(null);
        router.refresh();
      }
    });
  }

  const columns: ColumnDef<DeliveryVersionListItem>[] = [
    {
      accessorKey: "name",
      header: "版本名称",
      minSize: 220,
      cell: ({ row }) => (
        <Link
          href={`/delivery-versions/${row.original.id}`}
          className="text-link block truncate font-medium underline-offset-4 hover:underline"
          title={row.original.name}
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "code",
      header: "编号",
      size: 184,
      meta: { cellClassName: "font-mono text-xs text-muted-foreground" },
    },
    {
      accessorKey: "status",
      header: "状态",
      size: 96,
      cell: ({ row }) => {
        const meta = DELIVERY_VERSION_STATUS_META[row.original.status];
        return <Badge variant={meta.badgeVariant}>{meta.label}</Badge>;
      },
    },
    {
      id: "baseline",
      header: "需求基线",
      size: 104,
      cell: ({ row }) => (
        <Badge variant={row.original.locked ? "secondary" : "outline"}>
          {row.original.locked ? "已锁定" : "未锁定"}
        </Badge>
      ),
    },
    {
      accessorKey: "userStoryCount",
      header: "US 数量",
      size: 88,
    },
    {
      accessorKey: "current",
      header: "当前版本",
      size: 96,
      cell: ({ row }) =>
        row.original.current ? <Badge variant="info">当前</Badge> : "—",
    },
    {
      accessorKey: "updatedAt",
      header: "更新时间",
      size: 148,
      meta: { cellClassName: "text-muted-foreground" },
      cell: ({ row }) => formatCompactDateTime(row.original.updatedAt),
    },
    {
      id: "actions",
      header: "操作",
      size: 188,
      meta: { headerClassName: "text-left", cellClassName: "text-left" },
      cell: ({ row }) => (
        <DataTableRowActions
          actions={[
            { label: "查看", href: `/delivery-versions/${row.original.id}` },
            ...(!row.original.current && !row.original.locked
              ? [
                  {
                    label: "设为当前",
                    disabled: isPending,
                    onClick: () => makeCurrent(row.original),
                  },
                ]
              : []),
            {
              label: "删除",
              destructive: true,
              disabled: isPending,
              onClick: () => setDeleteTarget(row.original),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <DataTableShell
        footer={
          <DataTablePagination
            page={safePage}
            pageSize={pageSize}
            total={items.length}
            itemName="个版本"
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
          />
        }
      >
        <DataTable
          columns={columns}
          data={pageItems}
          loading={isPending}
          emptyText="还没有交付版本"
          getRowId={(item) => item.id}
        />
      </DataTableShell>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除交付版本"
        description={
          deleteTarget
            ? `确定删除“${deleteTarget.name}”吗？只有空版本可以删除。`
            : ""
        }
        confirmLabel="删除"
        destructive
        pending={isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={remove}
      />
    </>
  );
}
