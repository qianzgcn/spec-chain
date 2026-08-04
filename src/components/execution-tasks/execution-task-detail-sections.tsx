import {
  AlertCircleIcon,
  ArrowLeftIcon,
  FileSearchIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";

import { AiExecutionTaskLog } from "@/components/execution-tasks/execution-task-log";
import { PageSection } from "@/components/layout/page-section";
import { ButtonLink } from "@/components/navigation/button-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDetailedDateTime } from "@/lib/date-time";
import { EXECUTION_TASK_TYPE_LABELS } from "@/lib/execution-tasks/meta";
import type { AiExecutionTaskDetail } from "@/lib/execution-tasks/types";

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs < 1_000) return `${durationMs} 毫秒`;
  return `${(durationMs / 1_000).toFixed(1)} 秒`;
}

export function ExecutionTaskHeaderActions({
  task,
  terminal,
  resultHref,
  retryPending,
  deletePending,
  onRetry,
  onDelete,
}: {
  task: AiExecutionTaskDetail;
  terminal: boolean;
  resultHref: string | null;
  retryPending: boolean;
  deletePending: boolean;
  onRetry: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <ButtonLink href="/execution-tasks" variant="outline">
        <ArrowLeftIcon data-icon="inline-start" />
        返回执行任务
      </ButtonLink>
      {terminal ? (
        <Button
          variant="destructive"
          disabled={retryPending || deletePending}
          onClick={onDelete}
        >
          <Trash2Icon data-icon="inline-start" />
          删除
        </Button>
      ) : null}
      {task.status === "FAILED" ? (
        <Button disabled={retryPending || deletePending} onClick={onRetry}>
          {retryPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RotateCcwIcon data-icon="inline-start" />
          )}
          重新运行
        </Button>
      ) : null}
      {resultHref ? (
        <ButtonLink href={resultHref}>
          <FileSearchIcon data-icon="inline-start" />
          查看生成结果
        </ButtonLink>
      ) : null}
    </>
  );
}

export function ExecutionTaskAlerts({
  task,
  active,
  refreshError,
}: {
  task: AiExecutionTaskDetail;
  active: boolean;
  refreshError: unknown;
}) {
  return (
    <>
      {active ? (
        <Alert variant="info">
          <Spinner />
          <AlertTitle>任务正在后台执行</AlertTitle>
          <AlertDescription>
            可以离开此页面，完成后仍可从执行任务中查看。
          </AlertDescription>
        </Alert>
      ) : null}
      {refreshError ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>状态更新失败</AlertTitle>
          <AlertDescription>
            {refreshError instanceof Error
              ? refreshError.message
              : "暂时无法刷新任务状态，请稍后重试。"}
          </AlertDescription>
        </Alert>
      ) : null}
      {task.errorMessage ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>任务失败</AlertTitle>
          <AlertDescription className="break-words whitespace-pre-wrap">
            {task.errorMessage}
          </AlertDescription>
        </Alert>
      ) : null}
      {task.result?.deleted ? (
        <Alert>
          <Trash2Icon />
          <AlertTitle>本次生成结果已删除</AlertTitle>
          <AlertDescription>任务与日志仍然保留。</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function ExecutionInformation({ task }: { task: AiExecutionTaskDetail }) {
  const information = [
    { label: "任务 ID", value: task.id },
    { label: "任务类型", value: EXECUTION_TASK_TYPE_LABELS[task.type] },
    { label: "发起用户", value: task.requestedBy },
    { label: "发起时间", value: formatDetailedDateTime(task.queuedAt) },
    { label: "耗时", value: formatDuration(task.durationMs) },
    { label: "模型配置", value: task.modelProfileNameSnapshot ?? "—" },
    { label: "模型 ID", value: task.modelIdSnapshot ?? "—" },
    {
      label: "Skill",
      value: task.skillNameSnapshot
        ? `${task.skillNameSnapshot} v${task.skillVersionSnapshot}`
        : "—",
    },
    {
      label: "Token",
      value:
        task.totalTokens === null
          ? "—"
          : `${task.totalTokens}（输入 ${task.promptTokens ?? 0} / 输出 ${task.completionTokens ?? 0}）`,
    },
  ];

  return (
    <PageSection title="执行信息">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-5 min-[1440px]:grid-cols-4">
        {information.map((item) => (
          <div className="min-w-0" key={item.label}>
            <dt className="text-muted-foreground text-xs">{item.label}</dt>
            <dd className="mt-1 text-sm font-medium break-words">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </PageSection>
  );
}

export function ExecutionTaskBody({
  task,
  active,
}: {
  task: AiExecutionTaskDetail;
  active: boolean;
}) {
  return (
    <>
      <PageSection title="任务内容">
        <p className="text-sm leading-6 break-words whitespace-pre-wrap">
          {task.requirementText}
        </p>
      </PageSection>

      <ExecutionInformation task={task} />

      <AiExecutionTaskLog
        logs={task.logs}
        active={active}
        capability={task.capability}
      />
    </>
  );
}
