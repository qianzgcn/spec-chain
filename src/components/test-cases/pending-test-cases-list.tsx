"use client";

import { useState, useTransition } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  confirmPendingTestCaseDraftAction,
  confirmPendingTestCaseDraftsAction,
  deletePendingTestCaseDraftAction,
  updatePendingTestCaseDraftGroupAction,
  updatePendingTestCaseDraftPriorityAction,
} from "@/app/actions/pending-test-cases";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  TestCaseDraftChangeType,
  TestPriority,
} from "@/generated/prisma/enums";
import { formatDetailedDateTime } from "@/lib/date-time";
import { TEST_PRIORITY_META } from "@/lib/test-cases/meta";

const UNASSIGNED_GROUP = "__unassigned__";
const PRIORITY_OPTIONS = Object.values(TestPriority).map((priority) => ({
  value: priority,
  label: TEST_PRIORITY_META[priority].label,
}));

export type PendingTestCaseListItem = {
  id: string;
  changeType: TestCaseDraftChangeType;
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

type GroupOption = { id: string; name: string };

const CHANGE_TYPE_META = {
  [TestCaseDraftChangeType.CREATE]: {
    label: "新增",
    variant: "info" as const,
  },
  [TestCaseDraftChangeType.UPDATE]: {
    label: "更新",
    variant: "warning" as const,
  },
  [TestCaseDraftChangeType.DELETE]: {
    label: "删除",
    variant: "destructive" as const,
  },
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupValues, setGroupValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((item) => [item.id, item.groupId ?? UNASSIGNED_GROUP]),
    ),
  );
  const [priorityValues, setPriorityValues] = useState<
    Record<string, TestPriority>
  >(() => Object.fromEntries(items.map((item) => [item.id, item.priority])));
  const groupOptions = [
    { value: UNASSIGNED_GROUP, label: "未分组" },
    ...groups.map((group) => ({ value: group.id, label: group.name })),
  ];

  function refresh() {
    router.refresh();
  }

  function changePage(nextPage: number) {
    const params = new URLSearchParams();
    if (batchId) params.set("batch", batchId);
    if (nextPage > 1) params.set("page", String(nextPage));
    navigate(`/test-cases/pending-review${params.size ? `?${params}` : ""}`);
  }

  function changeGroup(item: PendingTestCaseListItem, value: string | null) {
    if (!value) return;
    const previous = groupValues[item.id] ?? UNASSIGNED_GROUP;
    setGroupValues((current) => ({ ...current, [item.id]: value }));
    setPendingAction(`group:${item.id}`);
    startTransition(async () => {
      const result = await updatePendingTestCaseDraftGroupAction({
        draftId: item.id,
        groupId: value === UNASSIGNED_GROUP ? null : value,
      });
      if (!result.ok) {
        setGroupValues((current) => ({ ...current, [item.id]: previous }));
        toast.add({ type: "error", description: result.message });
      } else {
        toast.add({ type: "success", description: result.message });
        refresh();
      }
      setPendingAction(null);
    });
  }

  function changePriority(item: PendingTestCaseListItem, value: string | null) {
    if (!Object.values(TestPriority).includes(value as TestPriority)) return;
    const previous = priorityValues[item.id] ?? item.priority;
    const priority = value as TestPriority;
    setPriorityValues((current) => ({ ...current, [item.id]: priority }));
    setPendingAction(`priority:${item.id}`);
    startTransition(async () => {
      const result = await updatePendingTestCaseDraftPriorityAction({
        draftId: item.id,
        priority,
      });
      if (!result.ok) {
        setPriorityValues((current) => ({ ...current, [item.id]: previous }));
        toast.add({ type: "error", description: result.message });
      } else {
        toast.add({ type: "success", description: result.message });
        refresh();
      }
      setPendingAction(null);
    });
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((selectedId) => selectedId !== id),
    );
  }

  function confirm(item: PendingTestCaseListItem) {
    setPendingAction(`confirm:${item.id}`);
    startTransition(async () => {
      const result = await confirmPendingTestCaseDraftAction(item.id);
      toast.add({
        type: result.ok ? "success" : "error",
        description: result.message,
      });
      if (result.ok) refresh();
      setPendingAction(null);
    });
  }

  function confirmSelected() {
    const draftIds = selectedIds.filter((id) =>
      items.some((item) => item.id === id),
    );
    if (!draftIds.length) return;
    if (
      draftIds.some(
        (id) =>
          items.find((item) => item.id === id)?.changeType !==
            TestCaseDraftChangeType.DELETE &&
          (groupValues[id] ?? UNASSIGNED_GROUP) === UNASSIGNED_GROUP,
      )
    ) {
      toast.add({ type: "warning", description: "请先为选中的用例选择分组" });
      return;
    }

    setPendingAction("confirm:batch");
    startTransition(async () => {
      const result = await confirmPendingTestCaseDraftsAction({ draftIds });
      toast.add({
        type: result.ok ? "success" : "error",
        description: result.message,
      });
      if (result.ok) {
        setSelectedIds([]);
        refresh();
      }
      setPendingAction(null);
    });
  }

  function remove() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setPendingAction(`delete:${target.id}`);
    startTransition(async () => {
      const result = await deletePendingTestCaseDraftAction(target.id);
      toast.add({
        type: result.ok ? "success" : "error",
        description: result.message,
      });
      if (result.ok) {
        setDeleteTarget(null);
        refresh();
      }
      setPendingAction(null);
    });
  }

  const columns: ColumnDef<PendingTestCaseListItem>[] = [
    {
      id: "selection",
      header: () => {
        const selectedCount = items.filter((item) =>
          selectedIds.includes(item.id),
        ).length;
        return (
          <Checkbox
            checked={items.length > 0 && selectedCount === items.length}
            indeterminate={selectedCount > 0 && selectedCount < items.length}
            disabled={isPending || !items.length}
            aria-label="选择当前页全部待评审用例"
            onCheckedChange={(checked) =>
              setSelectedIds(
                checked === true ? items.map((item) => item.id) : [],
              )
            }
          />
        );
      },
      size: 44,
      meta: { headerClassName: "text-center", cellClassName: "text-center" },
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.includes(row.original.id)}
          disabled={isPending}
          aria-label={`选择“${row.original.name}”`}
          onCheckedChange={(checked) =>
            toggleSelected(row.original.id, checked === true)
          }
        />
      ),
    },
    {
      accessorKey: "name",
      header: "用例名称",
      minSize: 220,
      cell: ({ row }) => (
        <Link
          href={`/test-cases/pending-review/${row.original.id}`}
          className="text-link block truncate font-medium underline-offset-4 hover:underline"
          title={row.original.name}
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "changeType",
      header: "变更",
      size: 76,
      cell: ({ row }) => {
        const meta = CHANGE_TYPE_META[row.original.changeType];
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
    },
    {
      id: "source",
      header: "来源",
      minSize: 220,
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
      size: 88,
      meta: { cellClassName: "overflow-visible" },
      cell: ({ row }) =>
        row.original.changeType === TestCaseDraftChangeType.DELETE ? (
          <span className="text-muted-foreground text-sm">
            {TEST_PRIORITY_META[row.original.priority].label}
          </span>
        ) : (
          <Select
            items={PRIORITY_OPTIONS}
            value={priorityValues[row.original.id] ?? row.original.priority}
            disabled={isPending}
            onValueChange={(value) => changePriority(row.original, value)}
          >
            <SelectTrigger
              size="sm"
              className="w-16"
              aria-label={`设置“${row.original.name}”的优先级`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {PRIORITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ),
    },
    {
      id: "group",
      header: "分组",
      size: 168,
      meta: { cellClassName: "overflow-visible" },
      cell: ({ row }) =>
        row.original.changeType === TestCaseDraftChangeType.DELETE ? (
          <span className="text-muted-foreground block truncate text-sm">
            {groups.find((group) => group.id === row.original.groupId)?.name ??
              "未分组"}
          </span>
        ) : (
          <Select
            items={groupOptions}
            value={groupValues[row.original.id] ?? UNASSIGNED_GROUP}
            disabled={isPending}
            onValueChange={(value) => changeGroup(row.original, value)}
          >
            <SelectTrigger
              size="sm"
              className="w-full"
              aria-label={`设置“${row.original.name}”的分组`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {groupOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ),
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
      header: "操作",
      size: 144,
      meta: { headerClassName: "text-left", cellClassName: "text-left" },
      cell: ({ row }) => {
        const hasGroup =
          row.original.changeType === TestCaseDraftChangeType.DELETE ||
          (groupValues[row.original.id] ?? UNASSIGNED_GROUP) !==
            UNASSIGNED_GROUP;
        return (
          <DataTableRowActions
            actions={[
              {
                label: "评审通过",
                disabled: isPending || !hasGroup,
                loading: pendingAction === `confirm:${row.original.id}`,
                onClick: () => confirm(row.original),
              },
              {
                label: "删除",
                destructive: true,
                disabled: isPending,
                onClick: () => setDeleteTarget(row.original),
              },
            ]}
          />
        );
      },
    },
  ];

  const selectedWithoutGroup = selectedIds.some(
    (id) =>
      items.find((item) => item.id === id)?.changeType !==
        TestCaseDraftChangeType.DELETE &&
      (groupValues[id] ?? UNASSIGNED_GROUP) === UNASSIGNED_GROUP,
  );

  return (
    <>
      <DataTableShell
        toolbar={
          <>
            <span className="text-muted-foreground text-xs">
              共 {total} 条待评审用例
            </span>
            <Button
              className="ml-auto"
              size="sm"
              disabled={
                isPending || !selectedIds.length || selectedWithoutGroup
              }
              onClick={confirmSelected}
            >
              批量通过
              {selectedIds.length ? `（${selectedIds.length}）` : ""}
            </Button>
          </>
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
