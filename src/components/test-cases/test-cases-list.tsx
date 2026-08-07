"use client";

import { useState, useTransition } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { HistoryIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteTestCaseAction,
  setTestCaseEnabledAction,
} from "@/app/actions/test-cases";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { SearchInput } from "@/components/data-table/search-input";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ButtonLink } from "@/components/navigation/button-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  RunStatus,
  TestPriority,
  TestRunStage,
} from "@/generated/prisma/enums";
import { formatCompactDateTime } from "@/lib/date-time";
import {
  getRunDisplayStatus,
  RUN_STATUS_META,
  TEST_PRIORITY_META,
} from "@/lib/test-cases/meta";

export type TestCaseListItem = {
  id: string;
  code: string;
  name: string;
  groupName: string;
  priority: TestPriority;
  enabled: boolean;
  hasScript: boolean;
  type: "REQUIREMENT" | "PLATFORM";
  userStory: {
    id: string;
    code: string;
  } | null;
  lastRunStatus: RunStatus | null;
  lastRunStage: TestRunStage | null;
  lastEditedAt: string;
  lastRunAt: string | null;
};

type TestCaseFilters = {
  q: string;
  group: string;
  priority: string;
  enabled: string;
  type: string;
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

const TYPE_OPTIONS = [
  { label: "全部类型", value: null },
  { label: "需求用例", value: "REQUIREMENT" },
  { label: "平台用例", value: "PLATFORM" },
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
  const [runningId, setRunningId] = useState<string | null>(null);
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
    if (next.type) params.set("type", next.type);
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

  async function runTestCase(testCase: TestCaseListItem) {
    setRunningId(testCase.id);
    try {
      const response = await fetch(`/api/test-cases/${testCase.id}/runs`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        run?: { id: string };
        message?: string;
      };
      if (!response.ok || !payload.run) {
        throw new Error(payload.message ?? "创建运行任务失败");
      }

      toast.add({ type: "success", description: "运行任务已进入队列" });
      navigate(`/test-cases/${testCase.id}/runs`);
    } catch (error) {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "创建运行任务失败",
      });
    } finally {
      setRunningId(null);
    }
  }

  const columns: ColumnDef<TestCaseListItem>[] = [
    {
      accessorKey: "name",
      header: "用例名称",
      size: 200,
      cell: ({ row }) => (
        <Link
          href={`/test-cases/${row.original.id}`}
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
      size: 168,
      meta: {
        cellClassName: "font-mono text-xs text-muted-foreground",
      },
    },
    {
      accessorKey: "type",
      header: "用例归属",
      size: 168,
      cell: ({ row }) => {
        const userStory = row.original.userStory;

        return userStory ? (
          <Link
            href={`/user-stories/${userStory.id}`}
            className="text-link block truncate font-mono text-xs underline-offset-4 hover:underline"
            title={userStory.code}
          >
            {userStory.code}
          </Link>
        ) : (
          "平台用例"
        );
      },
    },
    {
      accessorKey: "groupName",
      header: "分组",
      size: 96,
      meta: { cellClassName: "truncate" },
    },
    {
      accessorKey: "priority",
      header: "优先级",
      size: 72,
      cell: ({ row }) => {
        const meta = TEST_PRIORITY_META[row.original.priority];
        return <Badge variant={meta.badgeVariant}>{meta.label}</Badge>;
      },
    },
    {
      accessorKey: "hasScript",
      header: "脚本状态",
      size: 88,
      cell: ({ row }) =>
        row.original.hasScript ? (
          <Badge variant="success">已配置</Badge>
        ) : (
          <span className="text-muted-foreground">未配置</span>
        ),
    },
    {
      accessorKey: "lastRunStatus",
      header: "运行状态",
      size: 88,
      cell: ({ row }) => {
        const status = row.original.lastRunStatus;
        if (!status) {
          return <span className="text-muted-foreground">尚未运行</span>;
        }
        const meta =
          RUN_STATUS_META[
            row.original.lastRunStage
              ? getRunDisplayStatus(status, row.original.lastRunStage)
              : status
          ];
        return <Badge variant={meta.badgeVariant}>{meta.label}</Badge>;
      },
    },
    {
      accessorKey: "enabled",
      header: "启用",
      size: 56,
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
      accessorKey: "lastEditedAt",
      header: "最后编辑时间",
      size: 128,
      meta: { cellClassName: "text-muted-foreground" },
      cell: ({ row }) => formatCompactDateTime(row.original.lastEditedAt),
    },
    {
      accessorKey: "lastRunAt",
      header: "最新运行时间",
      size: 128,
      meta: { cellClassName: "text-muted-foreground" },
      cell: ({ row }) =>
        row.original.lastRunAt
          ? formatCompactDateTime(row.original.lastRunAt)
          : "—",
    },
    {
      id: "actions",
      header: "操作",
      size: 200,
      meta: {
        headerClassName: "text-left",
        cellClassName: "overflow-visible text-left",
      },
      cell: ({ row }) => (
        <DataTableRowActions
          testId="test-case-actions"
          actions={[
            {
              label: "运行",
              ariaLabel: `运行 ${row.original.name}`,
              variant: "outline",
              loading: runningId === row.original.id,
              disabled:
                !row.original.enabled || isPending || runningId !== null,
              onClick: () => runTestCase(row.original),
            },
            {
              label: "编辑",
              href: `/test-cases/${row.original.id}/edit`,
              disabled: runningId !== null,
            },
            {
              label: "执行记录",
              icon: <HistoryIcon />,
              href: `/test-cases/${row.original.id}/runs`,
              disabled: runningId !== null,
            },
            {
              label: "删除",
              icon: <Trash2Icon />,
              disabled: isPending || runningId !== null,
              destructive: true,
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
        toolbar={
          <>
            <SearchInput
              value={query}
              placeholder="搜索编号或用例名称"
              onChange={setQuery}
              onSearch={(value) => updateQuery({ q: value, page: 1 })}
            />
            <Select
              items={TYPE_OPTIONS}
              value={filters.type || null}
              onValueChange={(value) =>
                updateQuery({ type: value ?? "", page: 1 })
              }
            >
              <SelectTrigger className="w-32" aria-label="用例类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TYPE_OPTIONS.map((option) => (
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
            filters.type ||
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
            <div className="ml-auto flex items-center gap-2">
              <ButtonLink href="/test-cases/ai-generate" variant="outline">
                <SparklesIcon data-icon="inline-start" />
                AI辅助生成测试用例
              </ButtonLink>
              <ButtonLink href="/test-cases/new">
                <PlusIcon data-icon="inline-start" />
                新建用例
              </ButtonLink>
            </div>
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
