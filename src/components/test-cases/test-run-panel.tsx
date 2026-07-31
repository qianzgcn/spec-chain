"use client";

import { useState } from "react";

import { PlayIcon } from "lucide-react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { PageSection } from "@/components/layout/page-section";
import { Button } from "@/components/ui/button";
import {
  TestRunDetailView,
  TestRunList,
  type TestRunDetail,
  type TestRunSummary,
} from "@/components/test-cases/test-run-views";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RunStatus } from "@/generated/prisma/enums";

export type { TestRunSummary } from "@/components/test-cases/test-run-views";

type TestRunPanelProps = {
  testCaseId: string;
  enabled: boolean;
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
      readJson<{ run: TestRunDetail }>(
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
    : !hasBaseUrl
      ? "项目尚未配置 Base URL"
      : null;
  const detail = detailQuery.data?.run;

  return (
    <PageSection
      title="自动化运行"
      description="无可用脚本时会先生成并校验脚本；原始日志和失败截图保留 30 天。"
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
          <TestRunList
            runs={runsQuery.data.runs}
            selectedRunId={effectiveSelectedRunId}
            onSelect={setSelectedRunId}
          />
        </div>

        <div className="min-w-0 p-6">
          <TestRunDetailView
            detail={detail}
            loading={Boolean(effectiveSelectedRunId && detailQuery.isLoading)}
            stopPending={stopRun.isPending}
            onStop={(runId) => stopRun.mutate(runId)}
          />
        </div>
      </div>
    </PageSection>
  );
}
