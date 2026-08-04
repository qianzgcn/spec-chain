"use client";

import { useState, useTransition } from "react";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  deleteExecutionTaskAction,
  retryExecutionTaskAction,
} from "@/app/actions/execution-tasks";
import {
  ExecutionTaskAlerts,
  ExecutionTaskBody,
  ExecutionTaskHeaderActions,
} from "@/components/execution-tasks/execution-task-detail-sections";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import {
  ACTIVE_EXECUTION_TASK_STATUSES,
  EXECUTION_TASK_STATUS_META,
  TERMINAL_EXECUTION_TASK_STATUSES,
} from "@/lib/execution-tasks/meta";
import type { AiExecutionTaskDetail } from "@/lib/execution-tasks/types";

async function readExecutionTask(taskId: string) {
  const response = await fetch(`/api/execution-tasks/${taskId}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    task?: AiExecutionTaskDetail;
    message?: string;
  };
  if (!response.ok || !payload.task) {
    throw new Error(payload.message ?? "读取执行任务失败");
  }
  return payload.task;
}

function getAiResultHref(task: AiExecutionTaskDetail) {
  if (!task.result || task.result.deleted) return null;

  switch (task.result.kind) {
    case "USER_STORY":
      return task.result.confirmedUserStoryId
        ? `/user-stories/${task.result.confirmedUserStoryId}`
        : `/requirements/pending-review/${task.result.id}`;
    case "TEST_CASE_BATCH":
      return task.result.pendingCount > 0
        ? `/test-cases/pending-review?batch=${task.result.id}`
        : null;
    case "AUTOMATION_SCRIPT":
      return `/test-cases/${task.result.testCaseId}`;
  }
}

export function ExecutionTaskDetailPanel({
  initialTask,
}: {
  initialTask: AiExecutionTaskDetail;
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
      <ExecutionTaskDetailContent initialTask={initialTask} />
    </QueryClientProvider>
  );
}

function ExecutionTaskDetailContent({
  initialTask,
}: {
  initialTask: AiExecutionTaskDetail;
}) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isRetryPending, startRetryTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const taskQuery = useQuery({
    queryKey: ["execution-task", initialTask.id],
    queryFn: () => readExecutionTask(initialTask.id),
    initialData: initialTask,
    refetchInterval: (query) =>
      query.state.data &&
      ACTIVE_EXECUTION_TASK_STATUSES.has(query.state.data.status)
        ? 800
        : false,
  });
  const task = taskQuery.data;
  const statusMeta = EXECUTION_TASK_STATUS_META[task.status];
  const active = ACTIVE_EXECUTION_TASK_STATUSES.has(task.status);
  const terminal = TERMINAL_EXECUTION_TASK_STATUSES.has(task.status);
  const resultHref = getAiResultHref(task);

  function retryTask() {
    startRetryTransition(async () => {
      try {
        const result = await retryExecutionTaskAction({ taskId: task.id });
        toast.add({
          type: result.ok ? "success" : "error",
          description: result.ok
            ? (result.message ?? "任务已重新进入队列")
            : result.message,
        });
        await taskQuery.refetch();
      } catch {
        toast.add({ type: "error", description: "重新运行任务失败" });
      }
    });
  }

  function deleteTask() {
    startDeleteTransition(async () => {
      try {
        const result = await deleteExecutionTaskAction({ taskId: task.id });
        if (!result.ok) {
          setDeleteDialogOpen(false);
          toast.add({ type: "error", description: result.message });
          await taskQuery.refetch();
          return;
        }

        toast.add({
          type: "success",
          description: result.message ?? "执行任务已删除",
        });
        router.replace("/execution-tasks");
        router.refresh();
      } catch {
        toast.add({ type: "error", description: "删除执行任务失败" });
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="任务详情"
        meta={
          <>
            <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
            <span>{task.stageLabel}</span>
          </>
        }
        actions={
          <ExecutionTaskHeaderActions
            task={task}
            terminal={terminal}
            resultHref={resultHref}
            retryPending={isRetryPending}
            deletePending={isDeletePending}
            onRetry={retryTask}
            onDelete={() => setDeleteDialogOpen(true)}
          />
        }
      />

      <ExecutionTaskAlerts
        task={task}
        active={active}
        refreshError={taskQuery.isError ? taskQuery.error : null}
      />
      <ExecutionTaskBody task={task} active={active} />

      <ConfirmDialog
        open={deleteDialogOpen}
        title="删除执行任务"
        description="删除后不能恢复，该任务将不再出现在执行任务中。"
        confirmLabel="删除"
        destructive
        pending={isDeletePending}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={deleteTask}
      />
    </div>
  );
}
