"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  AlertCircleIcon,
  ArrowLeftIcon,
  FileSearchIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteAiExecutionAction,
  retryAiExecutionAction,
} from "@/app/actions/ai-executions";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  AiExecutionLogLevel,
  AiExecutionStatus,
} from "@/generated/prisma/enums";
import {
  ACTIVE_AI_EXECUTION_STATUSES,
  AI_EXECUTION_STATUS_META,
  AI_TASK_TYPE_LABELS,
  getAiExecutionStageLabel,
} from "@/lib/ai/meta";
import type {
  AiExecutionDetail,
  AiExecutionLogEntry,
} from "@/lib/ai/execution-types";
import { formatDetailedDateTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";

async function readExecution(executionId: string) {
  const response = await fetch(`/api/ai-executions/${executionId}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    execution?: AiExecutionDetail;
    message?: string;
  };
  if (!response.ok || !payload.execution) {
    throw new Error(payload.message ?? "读取执行任务失败");
  }
  return payload.execution;
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs < 1_000) return `${durationMs} 毫秒`;
  return `${(durationMs / 1_000).toFixed(1)} 秒`;
}

const logDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hourCycle: "h23",
});

function formatLogDateTime(value: string) {
  const parts = Object.fromEntries(
    logDateTimeFormatter
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}`;
}

const LOG_LEVEL_META = {
  [AiExecutionLogLevel.INFO]: {
    label: "INFO",
    className: "text-background/70",
  },
  [AiExecutionLogLevel.WARN]: {
    label: "WARN",
    className: "text-warning",
  },
  [AiExecutionLogLevel.ERROR]: {
    label: "ERROR",
    className: "text-destructive",
  },
} satisfies Record<AiExecutionLogLevel, { label: string; className: string }>;

function ExecutionLogPanel({
  logs,
  active,
  capability,
}: {
  logs: AiExecutionLogEntry[];
  active: boolean;
  capability: AiExecutionDetail["capability"];
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !shouldFollowRef.current || logs.length === 0) return;

    const frame = requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [logs.length]);

  function trackScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldFollowRef.current = distanceFromBottom <= 32;
  }

  return (
    <PageSection
      title="执行日志"
      description={
        active
          ? "任务运行中，日志会实时更新。"
          : `本次任务共记录 ${logs.length} 条日志。`
      }
      actions={
        active ? (
          <Badge variant="info">
            <Spinner data-icon="inline-start" />
            实时
          </Badge>
        ) : null
      }
      contentClassName="p-0"
    >
      {logs.length === 0 ? (
        <Empty className="min-h-56">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSearchIcon />
            </EmptyMedia>
            <EmptyTitle>暂无执行日志</EmptyTitle>
            <EmptyDescription>
              {active
                ? "任务开始执行后，日志会显示在这里。"
                : "本次任务没有日志。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          ref={viewportRef}
          className="bg-foreground text-background max-h-[440px] min-h-56 overflow-y-auto px-5 py-4 font-mono text-[13px] leading-6"
          role="log"
          aria-live={active ? "polite" : "off"}
          onScroll={trackScroll}
        >
          {logs.map((log) => {
            const level = LOG_LEVEL_META[log.level];
            const stage = log.stage
              ? getAiExecutionStageLabel(capability, log.stage)
              : "系统";
            return (
              <div
                className="grid min-w-0 grid-cols-[12.5rem_3.5rem_minmax(8rem,auto)_minmax(0,1fr)] gap-x-3"
                key={log.position}
              >
                <time className="text-background/60">
                  {formatLogDateTime(log.createdAt)}
                </time>
                <span className={cn("font-semibold", level.className)}>
                  {level.label}
                </span>
                <span className="text-background/75 truncate">[{stage}]</span>
                <span className="min-w-0 break-words whitespace-pre-wrap">
                  {log.message}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </PageSection>
  );
}

export function AiExecutionDetailPanel({
  initialExecution,
}: {
  initialExecution: AiExecutionDetail;
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
      <AiExecutionDetailContent initialExecution={initialExecution} />
    </QueryClientProvider>
  );
}

function AiExecutionDetailContent({
  initialExecution,
}: {
  initialExecution: AiExecutionDetail;
}) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isRetryPending, startRetryTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const executionQuery = useQuery({
    queryKey: ["ai-execution", initialExecution.id],
    queryFn: () => readExecution(initialExecution.id),
    initialData: initialExecution,
    refetchInterval: (query) =>
      query.state.data &&
      ACTIVE_AI_EXECUTION_STATUSES.has(query.state.data.status)
        ? 800
        : false,
  });
  const execution = executionQuery.data;
  const statusMeta = AI_EXECUTION_STATUS_META[execution.status];
  const executionActive = ACTIVE_AI_EXECUTION_STATUSES.has(execution.status);
  const executionTerminal =
    execution.status === AiExecutionStatus.SUCCEEDED ||
    execution.status === AiExecutionStatus.FAILED;
  const resultHref =
    execution.result && !execution.result.deleted
      ? execution.result.kind === "USER_STORY"
        ? execution.result.confirmedUserStoryId
          ? `/user-stories/${execution.result.confirmedUserStoryId}`
          : `/requirements/pending-review/${execution.result.id}`
        : execution.result.pendingCount > 0
          ? `/test-cases/pending-review?batch=${execution.result.id}`
          : null
      : null;
  const information = [
    { label: "任务 ID", value: execution.id },
    {
      label: "任务类型",
      value: AI_TASK_TYPE_LABELS[execution.capability],
    },
    { label: "发起用户", value: execution.requestedBy },
    {
      label: "发起时间",
      value: formatDetailedDateTime(execution.queuedAt),
    },
    { label: "耗时", value: formatDuration(execution.durationMs) },
    {
      label: "模型配置",
      value: execution.modelProfileNameSnapshot ?? "—",
    },
    { label: "模型 ID", value: execution.modelIdSnapshot ?? "—" },
    {
      label: "Skill",
      value: execution.skillNameSnapshot
        ? `${execution.skillNameSnapshot} v${execution.skillVersionSnapshot}`
        : "—",
    },
    {
      label: "Token",
      value:
        execution.totalTokens === null
          ? "—"
          : `${execution.totalTokens}（输入 ${execution.promptTokens ?? 0} / 输出 ${execution.completionTokens ?? 0}）`,
    },
  ];

  function retryExecution() {
    startRetryTransition(async () => {
      try {
        const result = await retryAiExecutionAction({
          executionId: execution.id,
        });
        toast.add({
          type: result.ok ? "success" : "error",
          description: result.ok
            ? (result.message ?? "任务已重新进入队列")
            : result.message,
        });
        await executionQuery.refetch();
      } catch {
        toast.add({ type: "error", description: "重新运行任务失败" });
      }
    });
  }

  function deleteExecution() {
    startDeleteTransition(async () => {
      try {
        const result = await deleteAiExecutionAction({
          executionId: execution.id,
        });
        if (!result.ok) {
          setDeleteDialogOpen(false);
          toast.add({ type: "error", description: result.message });
          await executionQuery.refetch();
          return;
        }

        toast.add({
          type: "success",
          description: result.message ?? "执行任务已删除",
        });
        router.replace("/ai-executions");
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
        description={
          execution.feature
            ? `${execution.feature.code} · ${execution.feature.name}`
            : execution.sourceUserStory
              ? `${execution.sourceUserStory.code} · ${execution.sourceUserStory.title}${
                  execution.sourceUserStory.deleted ? "（已删除）" : ""
                }`
              : undefined
        }
        meta={
          <>
            <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
            <span>
              {getAiExecutionStageLabel(execution.capability, execution.stage)}
            </span>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/ai-executions" />}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              返回执行任务
            </Button>
            {executionTerminal ? (
              <Button
                variant="destructive"
                disabled={isRetryPending || isDeletePending}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2Icon data-icon="inline-start" />
                删除
              </Button>
            ) : null}
            {execution.status === AiExecutionStatus.FAILED ? (
              <Button
                disabled={isRetryPending || isDeletePending}
                onClick={retryExecution}
              >
                {isRetryPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <RotateCcwIcon data-icon="inline-start" />
                )}
                重新运行
              </Button>
            ) : null}
            {resultHref ? (
              <Button nativeButton={false} render={<Link href={resultHref} />}>
                <FileSearchIcon data-icon="inline-start" />
                查看生成结果
              </Button>
            ) : null}
          </>
        }
      />

      {executionActive ? (
        <Alert variant="info">
          <Spinner />
          <AlertTitle>任务正在后台执行</AlertTitle>
          <AlertDescription>
            可以离开此页面，任务完成后仍可从执行任务中查看。
          </AlertDescription>
        </Alert>
      ) : null}
      {executionQuery.isError ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>状态更新失败</AlertTitle>
          <AlertDescription>
            {executionQuery.error instanceof Error
              ? executionQuery.error.message
              : "暂时无法刷新任务状态，请稍后重试。"}
          </AlertDescription>
        </Alert>
      ) : null}
      {execution.errorMessage ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>任务失败</AlertTitle>
          <AlertDescription>{execution.errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      {execution.result?.deleted ? (
        <Alert>
          <Trash2Icon />
          <AlertTitle>本次生成结果已删除</AlertTitle>
          <AlertDescription>任务与日志仍然保留。</AlertDescription>
        </Alert>
      ) : null}

      <PageSection title="输入的需求内容">
        <p className="text-sm leading-6 break-words whitespace-pre-wrap">
          {execution.requirementText}
        </p>
      </PageSection>

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

      <ExecutionLogPanel
        logs={execution.logs}
        active={executionActive}
        capability={execution.capability}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        title="删除执行任务"
        description="删除后不能恢复，已生成结果及执行日志不会受到影响。"
        confirmLabel="删除"
        destructive
        pending={isDeletePending}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={deleteExecution}
      />
    </div>
  );
}
