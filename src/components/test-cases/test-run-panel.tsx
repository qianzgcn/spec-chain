"use client";

import { useState } from "react";

import { DownloadIcon, HistoryIcon, PlayIcon, SquareIcon } from "lucide-react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Image from "next/image";

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
import { RunStatus } from "@/generated/prisma/enums";
import { formatDetailedDateTime } from "@/lib/date-time";
import { RUN_STATUS_META } from "@/lib/test-cases/meta";
import { cn } from "@/lib/utils";

export type TestRunSummary = {
  id: string;
  status: RunStatus;
  queuedAt: string;
  startedAt: string | null;
  durationMs: number | null;
  requestedBy: string;
};

type RunDetail = {
  id: string;
  status: RunStatus;
  queuedAt: string;
  startedAt: string | null;
  durationMs: number | null;
  errorSummary: string | null;
  logContent: string | null;
  hasScreenshot: boolean;
  artifactsExpired: boolean;
  cancelRequested: boolean;
  baseUrl: string;
};

type TestRunPanelProps = {
  testCaseId: string;
  enabled: boolean;
  hasScript: boolean;
  hasBaseUrl: boolean;
  initialRuns: TestRunSummary[];
};

const ACTIVE_STATUSES = new Set<RunStatus>([
  RunStatus.QUEUED,
  RunStatus.RUNNING,
]);

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? "请求失败");
  }
  return payload;
}

function formatDate(value: string | null) {
  return value ? formatDetailedDateTime(value) : "—";
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs < 1_000) return `${durationMs} 毫秒`;
  return `${(durationMs / 1_000).toFixed(1)} 秒`;
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const meta = RUN_STATUS_META[status];
  return <Badge variant={meta.badgeVariant}>{meta.label}</Badge>;
}

export function TestRunPanel(props: TestRunPanelProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TestRunPanelContent {...props} />
    </QueryClientProvider>
  );
}

function TestRunPanelContent({
  testCaseId,
  enabled,
  hasScript,
  hasBaseUrl,
  initialRuns,
}: TestRunPanelProps) {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState(
    initialRuns[0]?.id ?? null,
  );

  const runsQuery = useQuery({
    queryKey: ["test-case-runs", testCaseId],
    queryFn: async () =>
      readJson<{ runs: TestRunSummary[] }>(
        await fetch(`/api/test-cases/${testCaseId}/runs`, {
          cache: "no-store",
        }),
      ),
    initialData: { runs: initialRuns },
    refetchInterval: (query) =>
      query.state.data?.runs.some((run) => ACTIVE_STATUSES.has(run.status))
        ? 1_000
        : false,
  });

  const effectiveSelectedRunId =
    selectedRunId ?? runsQuery.data.runs[0]?.id ?? null;
  const detailQuery = useQuery({
    queryKey: ["test-run", effectiveSelectedRunId],
    enabled: Boolean(effectiveSelectedRunId),
    queryFn: async () =>
      readJson<{ run: RunDetail }>(
        await fetch(`/api/test-runs/${effectiveSelectedRunId}`, {
          cache: "no-store",
        }),
      ),
    refetchInterval: (query) =>
      query.state.data && ACTIVE_STATUSES.has(query.state.data.run.status)
        ? 700
        : false,
  });

  const createRun = useMutation({
    mutationFn: async () =>
      readJson<{ run: { id: string; status: RunStatus } }>(
        await fetch(`/api/test-cases/${testCaseId}/runs`, {
          method: "POST",
        }),
      ),
    onSuccess: async ({ run }) => {
      setSelectedRunId(run.id);
      toast.add({ type: "success", description: "运行任务已进入队列" });
      await queryClient.invalidateQueries({
        queryKey: ["test-case-runs", testCaseId],
      });
    },
    onError: (error) => {
      toast.add({
        type: "error",
        description:
          error instanceof Error ? error.message : "创建运行任务失败",
      });
    },
  });

  const stopRun = useMutation({
    mutationFn: async (runId: string) =>
      readJson<{ message: string }>(
        await fetch(`/api/test-runs/${runId}/stop`, {
          method: "POST",
        }),
      ),
    onSuccess: async ({ message }, runId) => {
      toast.add({ type: "success", description: message });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["test-case-runs", testCaseId],
        }),
        queryClient.invalidateQueries({ queryKey: ["test-run", runId] }),
      ]);
    },
    onError: (error) => {
      toast.add({
        type: "error",
        description: error instanceof Error ? error.message : "停止运行失败",
      });
    },
  });

  const cannotRunReason = !enabled
    ? "用例已停用"
    : !hasScript
      ? "尚未编写自动化脚本"
      : !hasBaseUrl
        ? "项目尚未配置 Base URL"
        : null;
  const detail = detailQuery.data?.run;
  const canStop = detail && ACTIVE_STATUSES.has(detail.status);

  return (
    <PageSection
      title="自动化运行"
      description="全平台单并发执行；原始日志和失败截图保留 30 天。"
      contentClassName="p-0"
      actions={
        <div className="flex items-center gap-3">
          {cannotRunReason ? (
            <span className="text-muted-foreground text-xs">
              {cannotRunReason}
            </span>
          ) : null}
          <Button
            disabled={Boolean(cannotRunReason) || createRun.isPending}
            onClick={() => createRun.mutate()}
          >
            {createRun.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            运行
          </Button>
        </div>
      }
    >
      <div className="grid min-h-[520px] grid-cols-[340px_minmax(0,1fr)]">
        <div className="max-h-[720px] overflow-y-auto border-r">
          {runsQuery.data.runs.length ? (
            <div className="divide-y">
              {runsQuery.data.runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className={cn(
                    "hover:bg-muted/50 flex w-full flex-col gap-2 px-5 py-4 text-left transition-colors",
                    effectiveSelectedRunId === run.id && "bg-muted",
                  )}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <RunStatusBadge status={run.status} />
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
          ) : (
            <div className="grid h-full min-h-80 place-items-center">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HistoryIcon />
                  </EmptyMedia>
                  <EmptyTitle>尚无运行记录</EmptyTitle>
                  <EmptyDescription>
                    配置脚本和 Base URL 后即可运行。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </div>

        <div className="min-w-0 p-6">
          {effectiveSelectedRunId && detailQuery.isLoading ? (
            <div className="grid h-full min-h-72 place-items-center">
              <Spinner className="size-5" />
            </div>
          ) : detail ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-5">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <RunStatusBadge status={detail.status} />
                    {detail.cancelRequested &&
                    detail.status === RunStatus.RUNNING ? (
                      <Badge variant="secondary">正在停止</Badge>
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">开始时间</dt>
                    <dd>{formatDate(detail.startedAt ?? detail.queuedAt)}</dd>
                    <dt className="text-muted-foreground">耗时</dt>
                    <dd>{formatDuration(detail.durationMs)}</dd>
                    <dt className="text-muted-foreground">Base URL</dt>
                    <dd className="break-all">{detail.baseUrl}</dd>
                  </dl>
                </div>
                {canStop ? (
                  <Button
                    variant="outline"
                    disabled={stopRun.isPending || detail.cancelRequested}
                    onClick={() => stopRun.mutate(detail.id)}
                  >
                    {stopRun.isPending ? (
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
                  <Alert>
                    <AlertTitle>运行产物已过期</AlertTitle>
                    <AlertDescription>
                      原始日志和失败截图已清理，运行摘要仍会长期保留。
                    </AlertDescription>
                  </Alert>
                ) : (
                  <pre className="bg-foreground text-background max-h-96 min-h-40 overflow-y-auto rounded-lg p-4 font-mono text-xs leading-5 break-words whitespace-pre-wrap">
                    {detail.logContent ||
                      (ACTIVE_STATUSES.has(detail.status)
                        ? "等待运行器输出…"
                        : "本次运行没有输出日志")}
                  </pre>
                )}
              </div>

              {detail.hasScreenshot ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">失败截图</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <a
                          href={`/api/test-runs/${detail.id}/screenshot`}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      <DownloadIcon data-icon="inline-start" />
                      查看原图
                    </Button>
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
          ) : (
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
          )}
        </div>
      </div>
    </PageSection>
  );
}
