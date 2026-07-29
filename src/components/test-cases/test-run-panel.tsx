"use client";

import { useState } from "react";

import DownloadOutlined from "@ant-design/icons/DownloadOutlined";
import PlayCircleOutlined from "@ant-design/icons/PlayCircleOutlined";
import StopOutlined from "@ant-design/icons/StopOutlined";
import { Alert, Button, Empty, Space, Spin, Tag, message } from "antd";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Image from "next/image";

import { RunStatus } from "@/generated/prisma/enums";
import { formatDetailedDateTime } from "@/lib/date-time";
import { RUN_STATUS_META } from "@/lib/test-cases/meta";

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
  if (!value) return "—";
  return formatDetailedDateTime(value);
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs < 1_000) return `${durationMs} 毫秒`;
  return `${(durationMs / 1_000).toFixed(1)} 秒`;
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
  const [messageApi, messageContext] = message.useMessage();
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
      messageApi.success("运行任务已进入队列");
      await queryClient.invalidateQueries({
        queryKey: ["test-case-runs", testCaseId],
      });
    },
    onError: (error) => {
      messageApi.error(
        error instanceof Error ? error.message : "创建运行任务失败",
      );
    },
  });

  const stopRun = useMutation({
    mutationFn: async (runId: string) =>
      readJson<{ message: string }>(
        await fetch(`/api/test-runs/${runId}/stop`, {
          method: "POST",
        }),
      ),
    onSuccess: async ({ message: successMessage }, runId) => {
      messageApi.success(successMessage);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["test-case-runs", testCaseId],
        }),
        queryClient.invalidateQueries({ queryKey: ["test-run", runId] }),
      ]);
    },
    onError: (error) => {
      messageApi.error(error instanceof Error ? error.message : "停止运行失败");
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
    <>
      {messageContext}
      <div className="content-panel mb-5">
        <div className="flex items-center justify-between border-b border-slate-200 px-7 py-5">
          <div>
            <h2 className="m-0 text-base font-semibold text-slate-800">
              自动化运行
            </h2>
            <p className="mt-1 mb-0 text-sm text-slate-500">
              全平台单并发执行；原始日志和失败截图保留 30 天。
            </p>
          </div>
          <Space>
            {cannotRunReason ? (
              <span className="text-sm text-slate-500">{cannotRunReason}</span>
            ) : null}
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              disabled={Boolean(cannotRunReason)}
              loading={createRun.isPending}
              onClick={() => createRun.mutate()}
            >
              运行
            </Button>
          </Space>
        </div>

        <div className="grid min-h-[360px] grid-cols-[390px_minmax(0,1fr)]">
          <div className="border-r border-slate-200">
            {runsQuery.data.runs.length > 0 ? (
              <div className="divide-y divide-slate-200">
                {runsQuery.data.runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className={`block w-full cursor-pointer border-0 px-5 py-4 text-left ${
                      effectiveSelectedRunId === run.id
                        ? "bg-cyan-50"
                        : "bg-white hover:bg-slate-50"
                    }`}
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <Tag color={RUN_STATUS_META[run.status].color}>
                        {RUN_STATUS_META[run.status].label}
                      </Tag>
                      <span className="text-xs text-slate-400">
                        {formatDuration(run.durationMs)}
                      </span>
                    </div>
                    <div className="truncate text-sm text-slate-700">
                      {formatDate(run.startedAt ?? run.queuedAt)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      发起人：{run.requestedBy}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid h-full place-items-center py-16">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="尚无运行记录"
                />
              </div>
            )}
          </div>

          <div className="min-w-0 p-6">
            {effectiveSelectedRunId && detailQuery.isLoading ? (
              <div className="grid h-full place-items-center">
                <Spin />
              </div>
            ) : detail ? (
              <div>
                <div className="mb-5 flex items-start justify-between gap-5">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Tag color={RUN_STATUS_META[detail.status].color}>
                        {RUN_STATUS_META[detail.status].label}
                      </Tag>
                      {detail.cancelRequested &&
                      detail.status === RunStatus.RUNNING ? (
                        <Tag color="warning">正在停止</Tag>
                      ) : null}
                    </div>
                    <div className="text-xs leading-6 text-slate-500">
                      开始：{formatDate(detail.startedAt ?? detail.queuedAt)}
                      <br />
                      耗时：{formatDuration(detail.durationMs)}
                      <br />
                      Base URL：{detail.baseUrl}
                    </div>
                  </div>
                  {canStop ? (
                    <Button
                      danger
                      icon={<StopOutlined />}
                      loading={stopRun.isPending}
                      disabled={detail.cancelRequested}
                      onClick={() => stopRun.mutate(detail.id)}
                    >
                      停止
                    </Button>
                  ) : null}
                </div>

                {detail.errorSummary ? (
                  <Alert
                    type="error"
                    showIcon
                    className="mb-5"
                    title="错误摘要"
                    description={
                      <pre className="m-0 max-h-36 overflow-auto text-xs whitespace-pre-wrap">
                        {detail.errorSummary}
                      </pre>
                    }
                  />
                ) : null}

                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  运行日志
                </h3>
                {detail.artifactsExpired ? (
                  <div className="rounded-md bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    运行产物已过期；运行摘要仍会长期保留。
                  </div>
                ) : (
                  <pre className="m-0 max-h-[380px] min-h-36 overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-5 whitespace-pre-wrap text-slate-100">
                    {detail.logContent ||
                      (ACTIVE_STATUSES.has(detail.status)
                        ? "等待运行器输出…"
                        : "本次运行没有输出日志")}
                  </pre>
                )}

                {detail.hasScreenshot ? (
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="m-0 text-sm font-semibold text-slate-700">
                        失败截图
                      </h3>
                      <Button
                        type="link"
                        size="small"
                        icon={<DownloadOutlined />}
                        href={`/api/test-runs/${detail.id}/screenshot`}
                        target="_blank"
                      >
                        查看原图
                      </Button>
                    </div>
                    <Image
                      src={`/api/test-runs/${detail.id}/screenshot`}
                      alt="自动化运行失败截图"
                      width={1280}
                      height={720}
                      unoptimized
                      className="h-auto max-h-[420px] w-full rounded-md border border-slate-200 object-contain"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-400">
                选择一条运行记录查看详情
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
