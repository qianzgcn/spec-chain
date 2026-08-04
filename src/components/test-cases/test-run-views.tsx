import { DownloadIcon, HistoryIcon, SquareIcon } from "lucide-react";
import Image from "next/image";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { RunStatus, TestRunStage } from "@/generated/prisma/enums";
import { formatDetailedDateTime } from "@/lib/date-time";
import { TEST_RUN_STAGE_LABELS } from "@/lib/execution-tasks/meta";
import { getRunDisplayStatus, RUN_STATUS_META } from "@/lib/test-cases/meta";
import { cn } from "@/lib/utils";

export type TestRunSummary = {
  id: string;
  status: RunStatus;
  stage: TestRunStage;
  queuedAt: string;
  startedAt: string | null;
  durationMs: number | null;
  requestedBy: string;
};

export type TestRunDetail = {
  id: string;
  status: RunStatus;
  stage: TestRunStage;
  queuedAt: string;
  startedAt: string | null;
  durationMs: number | null;
  errorSummary: string | null;
  logContent: string | null;
  hasScreenshot: boolean;
  artifactsExpired: boolean;
  cancelRequested: boolean;
  baseUrl: string;
  generatedScriptInRun: boolean;
  modelProfileName: string | null;
  modelId: string | null;
  skillName: string | null;
  skillVersion: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

function formatDate(value: string | null) {
  return value ? formatDetailedDateTime(value) : "—";
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs < 1_000) return `${durationMs} 毫秒`;
  return `${(durationMs / 1_000).toFixed(1)} 秒`;
}

function RunStatusBadge({
  status,
  stage,
}: {
  status: RunStatus;
  stage: TestRunStage;
}) {
  const meta = RUN_STATUS_META[getRunDisplayStatus(status, stage)];
  return <Badge variant={meta.badgeVariant}>{meta.label}</Badge>;
}

export function TestRunList({
  runs,
  selectedRunId,
  onSelect,
}: {
  runs: TestRunSummary[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  if (!runs.length) {
    return (
      <div className="grid h-full min-h-80 place-items-center">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>尚无运行记录</EmptyTitle>
            <EmptyDescription>配置 Base URL 后即可运行。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {runs.map((run) => (
        <button
          key={run.id}
          type="button"
          className={cn(
            "hover:bg-muted/50 flex w-full flex-col gap-2 px-5 py-4 text-left transition-colors",
            selectedRunId === run.id && "bg-muted",
          )}
          onClick={() => onSelect(run.id)}
        >
          <div className="flex w-full items-center justify-between gap-3">
            <RunStatusBadge status={run.status} stage={run.stage} />
            <span className="text-muted-foreground text-xs">
              {formatDuration(run.durationMs)}
            </span>
          </div>
          <span className="truncate text-sm">
            {formatDate(run.startedAt ?? run.queuedAt)}
          </span>
          <span className="text-muted-foreground text-xs">
            发起人：{run.requestedBy}
          </span>
        </button>
      ))}
    </div>
  );
}

export function TestRunDetailView({
  detail,
  loading,
  stopPending,
  onStop,
}: {
  detail: TestRunDetail | undefined;
  loading: boolean;
  stopPending: boolean;
  onStop: (runId: string) => void;
}) {
  if (loading) {
    return (
      <div className="grid h-full min-h-72 place-items-center">
        <Spinner className="size-5" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="grid h-full min-h-72 place-items-center">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>选择运行记录</EmptyTitle>
            <EmptyDescription>
              从左侧选择一条记录查看状态、日志和失败截图。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const displayStatus = getRunDisplayStatus(detail.status, detail.stage);
  const canStop =
    detail.status === RunStatus.QUEUED || detail.status === RunStatus.RUNNING;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <RunStatusBadge status={detail.status} stage={detail.stage} />
            {detail.cancelRequested && displayStatus === RunStatus.RUNNING ? (
              <Badge variant="warning">正在停止</Badge>
            ) : null}
          </div>
          <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">开始时间</dt>
            <dd>{formatDate(detail.startedAt ?? detail.queuedAt)}</dd>
            <dt className="text-muted-foreground">耗时</dt>
            <dd>{formatDuration(detail.durationMs)}</dd>
            <dt className="text-muted-foreground">Base URL</dt>
            <dd className="break-all">{detail.baseUrl}</dd>
            <dt className="text-muted-foreground">当前阶段</dt>
            <dd>{TEST_RUN_STAGE_LABELS[detail.stage]}</dd>
            <dt className="text-muted-foreground">脚本准备</dt>
            <dd>
              {detail.generatedScriptInRun ? "本次 AI 生成" : "复用已有脚本"}
            </dd>
          </dl>
        </div>
        {canStop ? (
          <Button
            variant="outline"
            disabled={stopPending || detail.cancelRequested}
            onClick={() => onStop(detail.id)}
          >
            {stopPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SquareIcon data-icon="inline-start" />
            )}
            停止
          </Button>
        ) : null}
      </div>

      {detail.errorSummary ? (
        <Alert variant="destructive">
          <AlertTitle>错误摘要</AlertTitle>
          <AlertDescription>
            <pre className="max-h-36 overflow-y-auto font-mono text-xs break-words whitespace-pre-wrap">
              {detail.errorSummary}
            </pre>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">运行日志</h3>
        {detail.artifactsExpired ? (
          <Alert variant="warning">
            <AlertTitle>运行产物已过期</AlertTitle>
            <AlertDescription>
              原始日志和失败截图已清理，运行摘要仍会长期保留。
            </AlertDescription>
          </Alert>
        ) : (
          <pre className="bg-foreground text-background max-h-96 min-h-40 overflow-y-auto rounded-lg p-4 font-mono text-xs leading-5 break-words whitespace-pre-wrap">
            {detail.logContent ||
              (canStop ? "等待运行器输出…" : "本次运行没有输出日志")}
          </pre>
        )}
      </div>

      {detail.hasScreenshot ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">失败截图</h3>
            <a
              href={`/api/test-runs/${detail.id}/screenshot`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <DownloadIcon data-icon="inline-start" />
              查看原图
            </a>
          </div>
          <Image
            src={`/api/test-runs/${detail.id}/screenshot`}
            alt="自动化运行失败截图"
            width={1280}
            height={720}
            unoptimized
            className="h-auto max-h-[420px] w-full rounded-lg border object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
