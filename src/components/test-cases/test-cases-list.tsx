"use client";

import { useState, useTransition } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteTestCaseAction,
  setTestCaseEnabledAction,
} from "@/app/actions/test-cases";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { SearchInput } from "@/components/data-table/search-input";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { RunStatus, TestPriority } from "@/generated/prisma/enums";
import { formatCompactDateTime } from "@/lib/date-time";
import { RUN_STATUS_META, TEST_PRIORITY_META } from "@/lib/test-cases/meta";

export type TestCaseListItem = {
  id: string;
  code: string;
  name: string;
  groupName: string;
  priority: TestPriority;
  enabled: boolean;
  hasScript: boolean;
  stepCount: number;
  lastRunStatus: RunStatus | null;
  updatedAt: string;
};

type TestCaseFilters = {
  q: string;
  group: string;
  priority: string;
  enabled: string;
  page: number;
};

const PRIORITY_OPTIONS = [
  { label: "全部优先级", value: null },
  ...Object.values(TestPriority).map((priority) => ({
    value: priority,
    label: priority,
  })),
];

const ENABLED_OPTIONS = [
  { label: "全部状态", value: null },
  { label: "已启用", value: "true" },
  { label: "已停用", value: "false" },
];

export function TestCasesList({
  items,
  total,
  filters,
  groups,
}: {
  items: TestCaseListItem[];
  total: number;
  filters: TestCaseFilters;
  groups: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const { isNavigating, navigate } = useNavigationFeedback();
  const [query, setQuery] = useState(filters.q);
  const [deleteTarget, setDeleteTarget] = useState<TestCaseListItem | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const groupOptions = [
    { label: "全部分组", value: null },
    ...groups.map((group) => ({ label: group.name, value: group.id })),
  ];

  function updateQuery(
    changes: Partial<Omit<TestCaseFilters, "page">> & { page?: number },
  ) {
    const next = { ...filters, ...changes };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.group) params.set("group", next.group);
    if (next.priority) params.set("priority", next.priority);
    if (next.enabled) params.set("enabled", next.enabled);
    if (next.page > 1) params.set("page", String(next.page));
    navigate(`/test-cases${params.size ? `?${params}` : ""}`);
  }

  function changeEnabled(id: string, enabled: boolean) {
    startTransition(async () => {
      const result = await setTestCaseEnabledAction(id, enabled);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  function remove() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteTestCaseAction(deleteTarget.id);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      setDeleteTarget(null);
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  const columns: ColumnDef<TestCaseListItem>[] = [
    {
      accessorKey: "name",
      header: "用例名称",
      cell: ({ row }) => (
        <Link
          href={`/test-cases/${row.original.id}`}
          className="block truncate font-medium underline-offset-4 hover:underline"
          title={row.original.name}
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "code",
      header: "编号",
      size: 180,
      meta: {
        headerClassName: "max-[1440px]:hidden",
        cellClassName:
          "max-[1440px]:hidden font-mono text-xs text-muted-foreground",
      },
    },
    {
      accessorKey: "groupName",
      header: "分组",
      size: 128,
      meta: { cellClassName: "truncate" },
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
      accessorKey: "stepCount",
      header: "步骤",
      size: 64,
      meta: {
        headerClassName: "max-[1500px]:hidden",
        cellClassName: "max-[1500px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => `${row.original.stepCount} 条`,
    },
    {
      accessorKey: "hasScript",
      header: "自动化",
      size: 84,
      meta: {
        headerClassName: "max-[1500px]:hidden",
        cellClassName: "max-[1500px]:hidden",
      },
      cell: ({ row }) =>
        row.original.hasScript ? (
          <Badge variant="secondary">已配置</Badge>
        ) : (
          <span className="text-muted-foreground">未配置</span>
        ),
    },
    {
      accessorKey: "lastRunStatus",
      header: "最近运行",
      size: 96,
      cell: ({ row }) => {
        const status = row.original.lastRunStatus;
        if (!status) {
          return <span className="text-muted-foreground">尚未运行</span>;
        }
        const meta = RUN_STATUS_META[status];
        return <Badge variant={meta.badgeVariant}>{meta.label}</Badge>;
      },
    },
    {
      accessorKey: "enabled",
      header: "启用",
      size: 64,
      cell: ({ row }) => (
        <Switch
          size="sm"
          checked={row.original.enabled}
          disabled={isPending}
          aria-label={`${row.original.name}启用状态`}
          onCheckedChange={(checked) => changeEnabled(row.original.id, checked)}
        />
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "更新时间",
      size: 138,
      meta: {
        headerClassName: "max-[1680px]:hidden",
        cellClassName: "max-[1680px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => formatCompactDateTime(row.original.updatedAt),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      size: 108,
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
      cell: ({ row }) => (
        <div
          className="flex items-center justify-end gap-1"
          data-testid="test-case-actions"
        >
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={`/test-cases/${row.original.id}/edit`} />}
          >
            编辑
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="更多操作" />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2Icon />
                  删除
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTableShell
        toolbar={
          <>
            <SearchInput
              value={query}
              placeholder="搜索编号或用例名称"
              onChange={setQuery}
              onSearch={(value) => updateQuery({ q: value, page: 1 })}
            />
            <Select
              items={groupOptions}
              value={filters.group || null}
              onValueChange={(value) =>
                updateQuery({ group: value ?? "", page: 1 })
              }
            >
              <SelectTrigger className="w-40" aria-label="用例分组">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {groupOptions.map((option) => (
                    <SelectItem
                      key={option.value ?? "all"}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={PRIORITY_OPTIONS}
              value={filters.priority || null}
              onValueChange={(value) =>
                updateQuery({ priority: value ?? "", page: 1 })
              }
            >
              <SelectTrigger className="w-36" aria-label="优先级">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value ?? "all"}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={ENABLED_OPTIONS}
              value={filters.enabled || null}
              onValueChange={(value) =>
                updateQuery({ enabled: value ?? "", page: 1 })
              }
            >
              <SelectTrigger className="w-32" aria-label="启用状态">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ENABLED_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value ?? "all"}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {filters.q ||
            filters.group ||
            filters.priority ||
            filters.enabled ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setQuery("");
                  navigate("/test-cases");
                }}
              >
                重置筛选
              </Button>
            ) : null}
            <Button
              className="ml-auto"
              nativeButton={false}
              render={<Link href="/test-cases/new" />}
            >
              <PlusIcon data-icon="inline-start" />
              新建用例
            </Button>
          </>
        }
        footer={
          <DataTablePagination
            page={filters.page}
            pageSize={20}
            total={total}
            itemName="条用例"
            onChange={(page) => updateQuery({ page })}
          />
        }
      >
        <DataTable
          columns={columns}
          data={items}
          loading={isPending || isNavigating}
          emptyText="还没有测试用例"
          getRowId={(item) => item.id}
        />
      </DataTableShell>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除测试用例"
        description="删除后不能恢复，运行历史仍会保留。"
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
