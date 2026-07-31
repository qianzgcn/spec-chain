import {
  AlertCircleIcon,
  ArrowLeftIcon,
  DownloadIcon,
  FileSearchIcon,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";

import {
  AiExecutionTaskLog,
  TestRunExecutionTaskLog,
} from "@/components/execution-tasks/execution-task-log";
import { PageSection } from "@/components/layout/page-section";
import { ButtonLink } from "@/components/navigation/button-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDetailedDateTime } from "@/lib/date-time";
import { EXECUTION_TASK_TYPE_LABELS } from "@/lib/execution-tasks/meta";
import type { ExecutionTaskDetail } from "@/lib/execution-tasks/types";

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs < 1_000) return `${durationMs} 毫秒`;
  return `${(durationMs / 1_000).toFixed(1)} 秒`;
}

function TestRunHeaderActions({
  task,
  active,
  stopPending,
  deletePending,
  onStop,
}: {
  task: Extract<ExecutionTaskDetail, { kind: "TEST_RUN" }>;
  active: boolean;
  stopPending: boolean;
  deletePending: boolean;
  onStop: () => void;
}) {
  return (
    <>
      {active ? (
        <Button
          variant="outline"
          disabled={stopPending || deletePending || task.cancelRequested}
          onClick={onStop}
        >
          {stopPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SquareIcon data-icon="inline-start" />
          )}
          {task.cancelRequested ? "正在停止" : "停止"}
        </Button>
      ) : null}
      {!task.testCase.deleted ? (
        <ButtonLink href={`/test-cases/${task.testCase.id}`}>
          <FileSearchIcon data-icon="inline-start" />
          查看测试用例
        </ButtonLink>
      ) : null}
    </>
  );
}

function AiHeaderActions({
  task,
  resultHref,
  retryPending,
  deletePending,
  onRetry,
}: {
  task: Extract<ExecutionTaskDetail, { kind: "AI" }>;
  resultHref: string | null;
  retryPending: boolean;
  deletePending: boolean;
  onRetry: () => void;
}) {
  return (
    <>
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

export function ExecutionTaskHeaderActions({
  task,
  active,
  terminal,
  resultHref,
  retryPending,
  deletePending,
  stopPending,
  onRetry,
  onDelete,
  onStop,
}: {
  task: ExecutionTaskDetail;
  active: boolean;
  terminal: boolean;
  resultHref: string | null;
  retryPending: boolean;
  deletePending: boolean;
  stopPending: boolean;
  onRetry: () => void;
  onDelete: () => void;
  onStop: () => void;
}) {
  return (
    <>
      <ButtonLink href="/execution-tasks" variant="outline">
        <ArrowLeftIcon data-icon="inline-start" />
        返回执行任务
      </ButtonLink>
      {task.kind === "TEST_RUN" ? (
        <TestRunHeaderActions
          task={task}
          active={active}
          stopPending={stopPending}
          deletePending={deletePending}
          onStop={onStop}
        />
      ) : null}
      {terminal ? (
        <Button
          variant="destructive"
          disabled={retryPending || deletePending || stopPending}
          onClick={onDelete}
        >
          <Trash2Icon data-icon="inline-start" />
          删除
        </Button>
      ) : null}
      {task.kind === "AI" ? (
        <AiHeaderActions
          task={task}
          resultHref={resultHref}
          retryPending={retryPending}
          deletePending={deletePending}
          onRetry={onRetry}
        />
      ) : null}
    </>
  );
}

export function ExecutionTaskAlerts({
  task,
  active,
  refreshError,
}: {
  task: ExecutionTaskDetail;
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
      {task.kind === "AI" && task.result?.deleted ? (
        <Alert>
          <Trash2Icon />
          <AlertTitle>本次生成结果已删除</AlertTitle>
          <AlertDescription>任务与日志仍然保留。</AlertDescription>
        </Alert>
      ) : null}
      {task.kind === "TEST_RUN" && task.artifactsExpired ? (
        <Alert variant="warning">
          <AlertTitle>运行产物已过期</AlertTitle>
          <AlertDescription>
            原始日志和失败截图已清理，运行摘要仍然保留。
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function ExecutionInformation({ task }: { task: ExecutionTaskDetail }) {
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
    ...(task.kind === "TEST_RUN"
      ? [
          { label: "Base URL", value: task.baseUrl },
          {
            label: "本次生成脚本",
            value: task.generatedScriptInRun ? "是" : "否",
          },
        ]
      : []),
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
  task: ExecutionTaskDetail;
  active: boolean;
}) {
  return (
    <>
      <PageSection title="任务内容">
        <p className="text-sm leading-6 break-words whitespace-pre-wrap">
          {task.kind === "AI" ? task.requirementText : task.content}
        </p>
      </PageSection>

      <ExecutionInformation task={task} />

      {task.kind === "AI" ? (
        <AiExecutionTaskLog
          logs={task.logs}
          active={active}
          capability={task.capability}
        />
      ) : task.artifactsExpired ? null : (
        <TestRunExecutionTaskLog content={task.logContent} active={active} />
      )}

      {task.kind === "TEST_RUN" && task.hasScreenshot ? (
        <PageSection
          title="失败截图"
          actions={
            <a
              href={`/api/test-runs/${task.id}/screenshot`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <DownloadIcon data-icon="inline-start" />
              查看原图
            </a>
          }
        >
          <Image
            src={`/api/test-runs/${task.id}/screenshot`}
            alt="自动化运行失败截图"
            width={1280}
            height={720}
            unoptimized
            className="h-auto max-h-[520px] w-full rounded-lg border object-contain"
          />
        </PageSection>
      ) : null}
    </>
  );
}
