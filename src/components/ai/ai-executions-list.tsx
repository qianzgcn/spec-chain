"use client";

import { useState } from "react";

import { Button, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";

import {
  ACTIVE_AI_EXECUTION_STATUSES,
  AI_EXECUTION_STAGE_LABELS,
  AI_EXECUTION_STATUS_META,
} from "@/lib/ai/meta";
import type { AiExecutionSummary } from "@/lib/ai/execution-types";
import { formatDateTime } from "@/lib/date-time";

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

  const columns: TableProps<AiExecutionSummary>["columns"] = [
    {
      title: "需求内容",
      dataIndex: "requirementText",
      ellipsis: true,
      render: (value: string, execution) => (
        <div className="min-w-0">
          <Typography.Text strong ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
          <div className="mt-1 text-xs text-slate-500">
            {execution.feature
              ? `${execution.feature.code} · ${execution.feature.name}`
              : "无 FE 归属"}
          </div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (status: AiExecutionSummary["status"]) => {
        const meta = AI_EXECUTION_STATUS_META[status];
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: "当前阶段",
      dataIndex: "stage",
      width: 140,
      responsive: ["lg"],
      render: (stage: AiExecutionSummary["stage"]) =>
        AI_EXECUTION_STAGE_LABELS[stage],
    },
    {
      title: "发起用户",
      dataIndex: "requestedBy",
      width: 100,
      responsive: ["xl"],
    },
    {
      title: "发起时间",
      dataIndex: "queuedAt",
      width: 145,
      responsive: ["lg"],
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "耗时",
      dataIndex: "durationMs",
      width: 80,
      responsive: ["xxl"],
      render: formatDuration,
    },
    {
      title: "操作",
      key: "actions",
      width: 80,
      align: "center",
      render: (_, execution) => (
        <Button
          type="link"
          size="small"
          href={`/ai-executions/${execution.id}`}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <div className="content-panel table-page-panel">
      <div className="table-toolbar">
        <span className="table-toolbar__summary">
          共 {executionsQuery.data.length} 条执行记录
        </span>
        {executionsQuery.isFetching ? (
          <span className="ml-auto text-xs text-slate-500">正在更新状态…</span>
        ) : null}
      </div>
      <Table<AiExecutionSummary>
        rowKey="id"
        columns={columns}
        dataSource={executionsQuery.data}
        tableLayout="fixed"
        scroll={{ y: "100%" }}
        pagination={{
          pageSize: 20,
          showSizeChanger: false,
          showTotal: (count) => `共 ${count} 条记录`,
        }}
        locale={{ emptyText: "暂无 AI 执行记录" }}
      />
    </div>
  );
}
