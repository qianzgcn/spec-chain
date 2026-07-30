"use client";

import { useState, useTransition } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { Trash2Icon } from "lucide-react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";

import {
  deleteAiExecutionAction,
  retryAiExecutionAction,
} from "@/app/actions/ai-executions";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { SearchInput } from "@/components/data-table/search-input";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { AiCapability, AiExecutionStatus } from "@/generated/prisma/enums";
import {
  ACTIVE_AI_EXECUTION_STATUSES,
  AI_EXECUTION_STATUS_META,
  AI_TASK_TYPE_LABELS,
  getAiExecutionStageLabel,
} from "@/lib/ai/meta";
import type { AiExecutionSummary } from "@/lib/ai/execution-types";
import { formatDateTime } from "@/lib/date-time";

const PAGE_SIZE = 20;
const TASK_TYPE_OPTIONS: Array<{
  label: string;
  value: AiCapability | null;
}> = [
  { label: "全部任务类型", value: null },
  ...Object.values(AiCapability).map((capability) => ({
    label: AI_TASK_TYPE_LABELS[capability],
    value: capability,
  })),
];
const STATUS_OPTIONS: Array<{
  label: string;
  value: AiExecutionStatus | null;
}> = [
  { label: "全部任务状态", value: null },
  ...Object.values(AiExecutionStatus).map((status) => ({
    label: AI_EXECUTION_STATUS_META[status].label,
    value: status,
  })),
];

async function readExecutions() {
  const response = await fetch("/api/ai-executions", { cache: "no-store" });
  const payload = (await response.json()) as {
    executions?: AiExecutionSummary[];
    message?: string;
  };
  if (!response.ok || !payload.executions) {
    throw new Error(payload.message ?? "读取执行任务失败");
  }
  return payload.executions;
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs < 1_000) return `${durationMs} 毫秒`;
  return `${(durationMs / 1_000).toFixed(1)} 秒`;
}

export function AiExecutionsList({
  initialExecutions,
}: {
  initialExecutions: AiExecutionSummary[];
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AiExecutionsTable initialExecutions={initialExecutions} />
    </QueryClientProvider>
  );
}

function AiExecutionsTable({
  initialExecutions,
}: {
  initialExecutions: AiExecutionSummary[];
}) {
  const [page, setPage] = useState(1);
  const [searchValue, setSearchValue] = useState("");
  const [keyword, setKeyword] = useState("");
  const [capability, setCapability] = useState<AiCapability | null>(null);
  const [status, setStatus] = useState<AiExecutionStatus | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AiExecutionSummary | null>(
    null,
  );
  const [isRetryPending, startRetryTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const executionsQuery = useQuery({
    queryKey: ["ai-executions"],
    queryFn: readExecutions,
    initialData: initialExecutions,
    refetchInterval: (query) =>
      query.state.data?.some((execution) =>
        ACTIVE_AI_EXECUTION_STATUSES.has(execution.status),
      )
        ? 1_000
        : false,
  });
  const executions = executionsQuery.data;
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  const filteredExecutions = executions.filter(
    (execution) =>
      (!normalizedKeyword ||
        execution.id.toLocaleLowerCase().includes(normalizedKeyword) ||
        execution.requirementText
          .toLocaleLowerCase()
          .includes(normalizedKeyword)) &&
      (!capability || execution.capability === capability) &&
      (!status || execution.status === status),
  );
  const hasFilters = Boolean(keyword || capability || status);
  const pageCount = Math.max(
    1,
    Math.ceil(filteredExecutions.length / PAGE_SIZE),
  );
  const safePage = Math.min(page, pageCount);
  const pageItems = filteredExecutions.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function retryExecution(executionId: string) {
    setRetryingId(executionId);
    startRetryTransition(async () => {
      try {
        const result = await retryAiExecutionAction({ executionId });
        toast.add({
          type: result.ok ? "success" : "error",
          description: result.ok
            ? (result.message ?? "任务已重新进入队列")
            : result.message,
        });
        await executionsQuery.refetch();
      } catch {
        toast.add({ type: "error", description: "重新运行任务失败" });
      } finally {
        setRetryingId(null);
      }
    });
  }

  function deleteExecution() {
    if (!deleteTarget) return;

    startDeleteTransition(async () => {
      try {
        const result = await deleteAiExecutionAction({
          executionId: deleteTarget.id,
        });
        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          await executionsQuery.refetch();
          return;
        }

        setDeleteTarget(null);
        toast.add({
          type: "success",
          description: result.message ?? "执行任务已删除",
        });
        await executionsQuery.refetch();
      } catch {
        toast.add({ type: "error", description: "删除执行任务失败" });
      }
    });
  }

  const columns: ColumnDef<AiExecutionSummary>[] = [
    {
      accessorKey: "requirementText",
      header: "需求内容",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div
            className="truncate font-medium"
            title={row.original.requirementText}
          >
            {row.original.requirementText}
          </div>
          <div className="text-muted-foreground mt-1 truncate text-xs">
            {row.original.feature
              ? `${row.original.feature.code} · ${row.original.feature.name}`
              : row.original.sourceUserStory
                ? `${row.original.sourceUserStory.code} · ${row.original.sourceUserStory.title}${
                    row.original.sourceUserStory.deleted ? "（已删除）" : ""
                  }`
                : row.original.capability === AiCapability.GENERATE_TEST_CASES
                  ? "输入需求内容"
                  : "无 FE 归属"}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "id",
      header: "任务 ID",
      size: 190,
      cell: ({ row }) => (
        <span
          className="block truncate font-mono text-xs"
          title={row.original.id}
        >
          {row.original.id}
        </span>
      ),
    },
    {
      accessorKey: "capability",
      header: "任务类型",
      size: 170,
      cell: ({ row }) => AI_TASK_TYPE_LABELS[row.original.capability],
    },
    {
      accessorKey: "status",
      header: "状态",
      size: 96,
      cell: ({ row }) => {
        const meta = AI_EXECUTION_STATUS_META[row.original.status];
        return <Badge variant={meta.badgeVariant}>{meta.label}</Badge>;
      },
    },
    {
      accessorKey: "stage",
      header: "当前阶段",
      size: 160,
      meta: {
        headerClassName: "max-[1450px]:hidden",
        cellClassName: "max-[1450px]:hidden",
      },
      cell: ({ row }) =>
        getAiExecutionStageLabel(row.original.capability, row.original.stage),
    },
    {
      accessorKey: "requestedBy",
      header: "发起用户",
      size: 110,
      meta: {
        headerClassName: "max-[1580px]:hidden",
        cellClassName: "max-[1580px]:hidden",
      },
    },
    {
      accessorKey: "queuedAt",
      header: "发起时间",
      size: 180,
      meta: {
        headerClassName: "max-[1720px]:hidden",
        cellClassName: "max-[1720px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => formatDateTime(row.original.queuedAt),
    },
    {
      accessorKey: "durationMs",
      header: "耗时",
      size: 90,
      meta: {
        headerClassName: "max-[1840px]:hidden",
        cellClassName: "max-[1840px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => formatDuration(row.original.durationMs),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      size: 160,
      meta: { headerClassName: "text-left", cellClassName: "text-left" },
      cell: ({ row }) => {
        const execution = row.original;
        const terminal =
          execution.status === AiExecutionStatus.SUCCEEDED ||
          execution.status === AiExecutionStatus.FAILED;
        return (
          <DataTableRowActions
            testId="ai-execution-actions"
            actions={[
              {
                label: "查看",
                href: `/ai-executions/${execution.id}`,
              },
              ...(execution.status === AiExecutionStatus.FAILED
                ? [
                    {
                      label: "重新运行",
                      loading: isRetryPending && retryingId === execution.id,
                      disabled: isRetryPending || isDeletePending,
                      onClick: () => retryExecution(execution.id),
                    },
                  ]
                : []),
              ...(terminal
                ? [
                    {
                      label: "删除",
                      icon: <Trash2Icon />,
                      disabled: isRetryPending || isDeletePending,
                      destructive: true,
                      onClick: () => setDeleteTarget(execution),
                    },
                  ]
                : []),
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
          <>
            <SearchInput
              value={searchValue}
              placeholder="搜索任务 ID 或需求内容"
              onChange={setSearchValue}
              onSearch={(value) => {
                setKeyword(value);
                setPage(1);
              }}
            />
            <Select
              items={TASK_TYPE_OPTIONS}
              value={capability}
              onValueChange={(value) => {
                setCapability(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-44" aria-label="任务类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TASK_TYPE_OPTIONS.map((option) => (
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
              items={STATUS_OPTIONS}
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36" aria-label="任务状态">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {STATUS_OPTIONS.map((option) => (
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
            {hasFilters ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchValue("");
                  setKeyword("");
                  setCapability(null);
                  setStatus(null);
                  setPage(1);
                }}
              >
                重置筛选
              </Button>
            ) : null}
            <span className="text-muted-foreground ml-auto text-sm">
              共 {filteredExecutions.length} 个任务
            </span>
            {executionsQuery.isFetching ? (
              <span className="text-muted-foreground flex items-center gap-2 text-xs">
                <Spinner />
                正在更新状态…
              </span>
            ) : null}
          </>
        }
        footer={
          <DataTablePagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filteredExecutions.length}
            itemName="个任务"
            onChange={setPage}
          />
        }
      >
        <DataTable
          columns={columns}
          data={pageItems}
          loading={executionsQuery.isLoading || isDeletePending}
          emptyText={hasFilters ? "没有符合筛选条件的执行任务" : "暂无执行任务"}
          getRowId={(execution) => execution.id}
        />
      </DataTableShell>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除执行任务"
        description="删除后不能恢复，已生成结果及执行日志不会受到影响。"
        confirmLabel="删除"
        destructive
        pending={isDeletePending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={deleteExecution}
      />
    </>
  );
}
