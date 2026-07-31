"use client";

import { useState, useTransition } from "react";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";

import {
  deleteExecutionTaskAction,
  retryExecutionTaskAction,
} from "@/app/actions/execution-tasks";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { createExecutionTaskColumns } from "@/components/execution-tasks/execution-task-list-columns";
import { ExecutionTaskListFilters } from "@/components/execution-tasks/execution-task-list-filters";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { ACTIVE_EXECUTION_TASK_STATUSES } from "@/lib/execution-tasks/meta";
import type {
  ExecutionTaskStatus,
  ExecutionTaskSummary,
  ExecutionTaskType,
} from "@/lib/execution-tasks/types";

const PAGE_SIZE = 20;

async function readExecutionTasks() {
  const response = await fetch("/api/execution-tasks", { cache: "no-store" });
  const payload = (await response.json()) as {
    tasks?: ExecutionTaskSummary[];
    message?: string;
  };
  if (!response.ok || !payload.tasks) {
    throw new Error(payload.message ?? "读取执行任务失败");
  }
  return payload.tasks;
}

export function ExecutionTaskList({
  initialTasks,
}: {
  initialTasks: ExecutionTaskSummary[];
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
      <ExecutionTaskTable initialTasks={initialTasks} />
    </QueryClientProvider>
  );
}

function ExecutionTaskTable({
  initialTasks,
}: {
  initialTasks: ExecutionTaskSummary[];
}) {
  const [page, setPage] = useState(1);
  const [searchValue, setSearchValue] = useState("");
  const [keyword, setKeyword] = useState("");
  const [taskType, setTaskType] = useState<ExecutionTaskType | null>(null);
  const [status, setStatus] = useState<ExecutionTaskStatus | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExecutionTaskSummary | null>(
    null,
  );
  const [isRetryPending, startRetryTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const tasksQuery = useQuery({
    queryKey: ["execution-tasks"],
    queryFn: readExecutionTasks,
    initialData: initialTasks,
    refetchInterval: (query) =>
      query.state.data?.some((task) =>
        ACTIVE_EXECUTION_TASK_STATUSES.has(task.status),
      )
        ? 1_000
        : false,
  });
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  const filteredTasks = tasksQuery.data.filter(
    (task) =>
      (!normalizedKeyword ||
        task.id.toLocaleLowerCase().includes(normalizedKeyword) ||
        task.content.toLocaleLowerCase().includes(normalizedKeyword)) &&
      (!taskType || task.type === taskType) &&
      (!status || task.status === status),
  );
  const hasFilters = Boolean(keyword || taskType || status);
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filteredTasks.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function retryTask(taskId: string) {
    setRetryingId(taskId);
    startRetryTransition(async () => {
      try {
        const result = await retryExecutionTaskAction({ taskId });
        toast.add({
          type: result.ok ? "success" : "error",
          description: result.ok
            ? (result.message ?? "任务已重新进入队列")
            : result.message,
        });
        await tasksQuery.refetch();
      } catch {
        toast.add({ type: "error", description: "重新运行任务失败" });
      } finally {
        setRetryingId(null);
      }
    });
  }

  function deleteTask() {
    if (!deleteTarget) return;

    startDeleteTransition(async () => {
      try {
        const result = await deleteExecutionTaskAction({
          taskId: deleteTarget.id,
        });
        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          await tasksQuery.refetch();
          return;
        }

        setDeleteTarget(null);
        toast.add({
          type: "success",
          description: result.message ?? "执行任务已删除",
        });
        await tasksQuery.refetch();
      } catch {
        toast.add({ type: "error", description: "删除执行任务失败" });
      }
    });
  }

  const columns = createExecutionTaskColumns({
    retryingId,
    retryPending: isRetryPending,
    deletePending: isDeletePending,
    onRetry: retryTask,
    onDelete: setDeleteTarget,
  });

  return (
    <>
      <DataTableShell
        toolbar={
          <ExecutionTaskListFilters
            searchValue={searchValue}
            taskType={taskType}
            status={status}
            resultCount={filteredTasks.length}
            fetching={tasksQuery.isFetching}
            hasFilters={hasFilters}
            onSearchValueChange={setSearchValue}
            onSearch={(value) => {
              setKeyword(value);
              setPage(1);
            }}
            onTaskTypeChange={(value) => {
              setTaskType(value);
              setPage(1);
            }}
            onStatusChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            onReset={() => {
              setSearchValue("");
              setKeyword("");
              setTaskType(null);
              setStatus(null);
              setPage(1);
            }}
          />
        }
        footer={
          <DataTablePagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filteredTasks.length}
            itemName="个任务"
            onChange={setPage}
          />
        }
      >
        <DataTable
          columns={columns}
          data={pageItems}
          loading={tasksQuery.isLoading || isDeletePending}
          emptyText={hasFilters ? "没有符合筛选条件的执行任务" : "暂无执行任务"}
          getRowId={(task) => task.id}
        />
      </DataTableShell>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除执行任务"
        description="删除后不能恢复，该任务将不再出现在执行任务和用例执行历史中。"
        confirmLabel="删除"
        destructive
        pending={isDeletePending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={deleteTask}
      />
    </>
  );
}
