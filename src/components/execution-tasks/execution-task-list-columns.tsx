import type { ColumnDef } from "@tanstack/react-table";
import { Trash2Icon } from "lucide-react";

import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/date-time";
import {
  EXECUTION_TASK_STATUS_META,
  EXECUTION_TASK_TYPE_LABELS,
  TERMINAL_EXECUTION_TASK_STATUSES,
} from "@/lib/execution-tasks/meta";
import type { ExecutionTaskSummary } from "@/lib/execution-tasks/types";

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs < 1_000) return `${durationMs} 毫秒`;
  return `${(durationMs / 1_000).toFixed(1)} 秒`;
}

export function createExecutionTaskColumns(input: {
  retryingId: string | null;
  retryPending: boolean;
  deletePending: boolean;
  onRetry: (taskId: string) => void;
  onDelete: (task: ExecutionTaskSummary) => void;
}): ColumnDef<ExecutionTaskSummary>[] {
  return [
    {
      accessorKey: "content",
      header: "任务内容",
      size: 320,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium" title={row.original.content}>
            {row.original.content}
          </div>
          <div
            className="text-muted-foreground truncate font-mono text-xs min-[1441px]:hidden"
            title={row.original.id}
          >
            {row.original.id}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "id",
      header: "任务 ID",
      size: 190,
      meta: {
        headerClassName: "max-[1440px]:hidden",
        cellClassName: "max-[1440px]:hidden",
      },
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
      accessorKey: "type",
      header: "任务类型",
      size: 190,
      cell: ({ row }) => EXECUTION_TASK_TYPE_LABELS[row.original.type],
    },
    {
      accessorKey: "status",
      header: "状态",
      size: 96,
      cell: ({ row }) => {
        const meta = EXECUTION_TASK_STATUS_META[row.original.status];
        return <Badge variant={meta.badgeVariant}>{meta.label}</Badge>;
      },
    },
    {
      accessorKey: "stageLabel",
      header: "当前阶段",
      size: 150,
      meta: {
        headerClassName: "max-[1480px]:hidden",
        cellClassName: "max-[1480px]:hidden",
      },
    },
    {
      accessorKey: "requestedBy",
      header: "发起用户",
      size: 110,
      meta: {
        headerClassName: "max-[1600px]:hidden",
        cellClassName: "max-[1600px]:hidden",
      },
    },
    {
      accessorKey: "queuedAt",
      header: "发起时间",
      size: 170,
      meta: {
        headerClassName: "max-[1740px]:hidden",
        cellClassName: "max-[1740px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => formatDateTime(row.original.queuedAt),
    },
    {
      accessorKey: "startedAt",
      header: "执行时间",
      size: 170,
      meta: { cellClassName: "text-muted-foreground" },
      cell: ({ row }) =>
        row.original.startedAt ? (
          formatDateTime(row.original.startedAt)
        ) : (
          <span>尚未开始</span>
        ),
    },
    {
      accessorKey: "durationMs",
      header: "执行耗时",
      size: 90,
      meta: {
        headerClassName: "max-[1520px]:hidden",
        cellClassName: "max-[1520px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => formatDuration(row.original.durationMs),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      size: 176,
      meta: { headerClassName: "text-left", cellClassName: "text-left" },
      cell: ({ row }) => {
        const task = row.original;
        return (
          <DataTableRowActions
            testId="execution-task-actions"
            actions={[
              {
                label: "查看",
                href: `/execution-tasks/${task.id}`,
              },
              ...(task.status === "FAILED"
                ? [
                    {
                      label: "重新运行",
                      loading:
                        input.retryPending && input.retryingId === task.id,
                      disabled: input.retryPending || input.deletePending,
                      onClick: () => input.onRetry(task.id),
                    },
                  ]
                : []),
              ...(TERMINAL_EXECUTION_TASK_STATUSES.has(task.status)
                ? [
                    {
                      label: "删除",
                      icon: <Trash2Icon />,
                      disabled: input.retryPending || input.deletePending,
                      destructive: true,
                      onClick: () => input.onDelete(task),
                    },
                  ]
                : []),
            ]}
          />
        );
      },
    },
  ];
}
