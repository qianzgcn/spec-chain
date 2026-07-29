"use client";

import { useState } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import Link from "next/link";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ACTIVE_AI_EXECUTION_STATUSES,
  AI_EXECUTION_STAGE_LABELS,
  AI_EXECUTION_STATUS_META,
} from "@/lib/ai/meta";
import type { AiExecutionSummary } from "@/lib/ai/execution-types";
import { formatDateTime } from "@/lib/date-time";

const PAGE_SIZE = 20;

async function readExecutions() {
  const response = await fetch("/api/ai-executions", { cache: "no-store" });
  const payload = (await response.json()) as {
    executions?: AiExecutionSummary[];
    message?: string;
  };
  if (!response.ok || !payload.executions) {
    throw new Error(payload.message ?? "读取 AI 执行记录失败");
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
  const pageCount = Math.max(1, Math.ceil(executions.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = executions.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

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
              : "无 FE 归属"}
          </div>
        </div>
      ),
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
      cell: ({ row }) => AI_EXECUTION_STAGE_LABELS[row.original.stage],
    },
    {
      accessorKey: "requestedBy",
      header: "发起用户",
      size: 110,
      meta: {
        headerClassName: "max-[1450px]:hidden",
        cellClassName: "max-[1450px]:hidden",
      },
    },
    {
      accessorKey: "queuedAt",
      header: "发起时间",
      size: 180,
      meta: {
        headerClassName: "max-[1580px]:hidden",
        cellClassName: "max-[1580px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => formatDateTime(row.original.queuedAt),
    },
    {
      accessorKey: "durationMs",
      header: "耗时",
      size: 90,
      meta: {
        headerClassName: "max-[1720px]:hidden",
        cellClassName: "max-[1720px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => formatDuration(row.original.durationMs),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      size: 76,
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/ai-executions/${row.original.id}`} />}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <DataTableShell
      toolbar={
        <>
          <span className="text-muted-foreground text-sm">
            共 {executions.length} 条执行记录
          </span>
          {executionsQuery.isFetching ? (
            <span className="text-muted-foreground ml-auto flex items-center gap-2 text-xs">
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
          total={executions.length}
          itemName="条记录"
          onChange={setPage}
        />
      }
    >
      <DataTable
        columns={columns}
        data={pageItems}
        loading={executionsQuery.isLoading}
        emptyText="暂无 AI 执行记录"
        getRowId={(execution) => execution.id}
      />
    </DataTableShell>
  );
}
