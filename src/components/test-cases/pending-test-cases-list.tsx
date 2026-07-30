"use client";

import { useState, useTransition } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  confirmPendingTestCaseDraftAction,
  deletePendingTestCaseDraftAction,
  updatePendingTestCaseDraftGroupAction,
} from "@/app/actions/pending-test-cases";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { TestPriority } from "@/generated/prisma/enums";
import { formatDetailedDateTime } from "@/lib/date-time";
import { TEST_PRIORITY_META } from "@/lib/test-cases/meta";

const UNASSIGNED_GROUP = "__unassigned__";

export type PendingTestCaseListItem = {
  id: string;
  name: string;
  priority: TestPriority;
  groupId: string | null;
  sourceUserStory: {
    code: string;
    title: string;
    deleted: boolean;
  } | null;
  requirementText: string;
  createdAt: string;
};

type GroupOption = {
  id: string;
  name: string;
};

export function PendingTestCasesList({
  items,
  groups,
  total,
  page,
  batchId,
}: {
  items: PendingTestCaseListItem[];
  groups: GroupOption[];
  total: number;
  page: number;
  batchId?: string;
}) {
  const router = useRouter();
  const { isNavigating, navigate } = useNavigationFeedback();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<PendingTestCaseListItem | null>(null);
  const [groupValues, setGroupValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((item) => [item.id, item.groupId ?? UNASSIGNED_GROUP]),
    ),
  );
  const groupSelectOptions = [
    { value: UNASSIGNED_GROUP, label: "未分组" },
    ...groups.map((group) => ({ value: group.id, label: group.name })),
  ];

  function changePage(nextPage: number) {
    const params = new URLSearchParams();
    if (batchId) params.set("batch", batchId);
    if (nextPage > 1) params.set("page", String(nextPage));
    navigate(`/test-cases/pending-review${params.size ? `?${params}` : ""}`);
  }

  function changeGroup(item: PendingTestCaseListItem, value: string | null) {
    if (!value) return;

    const previousValue = groupValues[item.id] ?? UNASSIGNED_GROUP;
    const nextGroupId = value === UNASSIGNED_GROUP ? null : value;
    setGroupValues((current) => ({ ...current, [item.id]: value }));
    setPendingAction(`group:${item.id}`);

    startTransition(async () => {
      try {
        const result = await updatePendingTestCaseDraftGroupAction({
          draftId: item.id,
          groupId: nextGroupId,
        });
        if (!result.ok) {
          setGroupValues((current) => ({
            ...current,
            [item.id]: previousValue,
          }));
          toast.add({ type: "error", description: result.message });
          return;
        }

        toast.add({ type: "success", description: result.message });
        router.refresh();
      } catch {
        setGroupValues((current) => ({
          ...current,
          [item.id]: previousValue,
        }));
        toast.add({ type: "error", description: "更新用例分组失败" });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function confirm(item: PendingTestCaseListItem) {
    setPendingAction(`confirm:${item.id}`);
    startTransition(async () => {
      try {
        const result = await confirmPendingTestCaseDraftAction(item.id);
        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          return;
        }

        toast.add({ type: "success", description: result.message });
        router.refresh();
      } catch {
        toast.add({ type: "error", description: "评审测试用例失败" });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function remove() {
    if (!deleteTarget) return;

    setPendingAction(`delete:${deleteTarget.id}`);
    startTransition(async () => {
      try {
        const result = await deletePendingTestCaseDraftAction(deleteTarget.id);
        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          return;
        }

        setDeleteTarget(null);
        toast.add({ type: "success", description: result.message });
        router.refresh();
      } catch {
        toast.add({ type: "error", description: "删除待评审用例失败" });
      } finally {
        setPendingAction(null);
      }
    });
  }

  const columns: ColumnDef<PendingTestCaseListItem>[] = [
    {
      accessorKey: "name",
      header: "用例名称",
      cell: ({ row }) => (
        <Link
          href={`/test-cases/pending-review/${row.original.id}`}
          className="block truncate font-medium underline-offset-4 hover:underline"
          title={row.original.name}
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "source",
      header: "来源",
      size: 220,
      cell: ({ row }) => {
        const story = row.original.sourceUserStory;
        const source = story
          ? `${story.code} · ${story.title}${story.deleted ? "（已删除）" : ""}`
          : row.original.requirementText;
        return (
          <span className="block truncate" title={source}>
            {source}
          </span>
        );
      },
    },
    {
      accessorKey: "priority",
      header: "优先级",
      size: 76,
      cell: ({ row }) => {
        const meta = TEST_PRIORITY_META[row.original.priority];
        return <Badge variant={meta.badgeVariant}>{meta.label}</Badge>;
      },
    },
    {
      id: "group",
      header: "分组",
      size: 168,
      meta: { cellClassName: "overflow-visible" },
      cell: ({ row }) => {
        const item = row.original;
        return (
          <Select
            items={groupSelectOptions}
            value={groupValues[item.id] ?? UNASSIGNED_GROUP}
            disabled={isPending}
            onValueChange={(value) => changeGroup(item, value)}
          >
            <SelectTrigger
              size="sm"
              className="w-full"
              aria-label={`设置“${item.name}”的分组`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {groupSelectOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "生成时间",
      size: 168,
      meta: { cellClassName: "text-muted-foreground" },
      cell: ({ row }) => formatDetailedDateTime(row.original.createdAt),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      size: 144,
      meta: { headerClassName: "text-left", cellClassName: "text-left" },
      cell: ({ row }) => {
        const item = row.original;
        const hasGroup =
          (groupValues[item.id] ?? UNASSIGNED_GROUP) !== UNASSIGNED_GROUP;
        return (
          <DataTableRowActions
            actions={[
              {
                label: "评审通过",
                disabled: isPending || !hasGroup,
                loading: pendingAction === `confirm:${item.id}`,
                onClick: () => confirm(item),
              },
              {
                label: "删除",
                destructive: true,
                disabled: isPending,
                onClick: () => setDeleteTarget(item),
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <>
      <DataTableShell
        toolbar={
          <span className="text-muted-foreground text-xs">
            共 {total} 条待评审用例
          </span>
        }
        footer={
          <DataTablePagination
            page={page}
            pageSize={20}
            total={total}
            itemName="条用例"
            onChange={changePage}
          />
        }
      >
        <DataTable
          columns={columns}
          data={items}
          loading={isNavigating}
          emptyText="暂无待评审用例"
          getRowId={(item) => item.id}
        />
      </DataTableShell>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除待评审用例"
        description={
          deleteTarget
            ? `确定删除“${deleteTarget.name}”吗？删除后不能恢复。`
            : ""
        }
        confirmLabel="删除"
        destructive
        pending={
          Boolean(deleteTarget) &&
          pendingAction === `delete:${deleteTarget?.id}`
        }
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={remove}
      />
    </>
  );
}
