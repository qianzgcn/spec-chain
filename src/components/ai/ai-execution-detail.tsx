"use client";

import { useEffect, useRef, useState } from "react";

import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import FileSearchOutlined from "@ant-design/icons/FileSearchOutlined";
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { AiExecutionLogLevel } from "@/generated/prisma/enums";
import {
  ACTIVE_AI_EXECUTION_STATUSES,
  AI_EXECUTION_STAGE_LABELS,
  AI_EXECUTION_STATUS_META,
} from "@/lib/ai/meta";
import type {
  AiExecutionDetail,
  AiExecutionLogEntry,
} from "@/lib/ai/execution-types";
import { formatDetailedDateTime } from "@/lib/date-time";

async function readExecution(executionId: string) {
  const response = await fetch(`/api/ai-executions/${executionId}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    execution?: AiExecutionDetail;
    message?: string;
  };
  if (!response.ok || !payload.execution) {
    throw new Error(payload.message ?? "读取 AI 执行记录失败");
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
    className: "execution-log__level--info",
  },
  [AiExecutionLogLevel.WARN]: {
    label: "WARN",
    className: "execution-log__level--warn",
  },
  [AiExecutionLogLevel.ERROR]: {
    label: "ERROR",
    className: "execution-log__level--error",
  },
} satisfies Record<AiExecutionLogLevel, { label: string; className: string }>;

function ExecutionLogPanel({
  logs,
  active,
}: {
  logs: AiExecutionLogEntry[];
  active: boolean;
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
    <section className="execution-log">
      <header className="execution-log__header">
        <div>
          <h2>执行日志</h2>
          <p>
            {active
              ? "任务运行中，日志会实时更新。"
              : `本次任务共记录 ${logs.length} 条日志。`}
          </p>
        </div>
        {active ? (
          <span className="execution-log__live">
            <Spin size="small" />
            实时
          </span>
        ) : null}
      </header>

      {logs.length === 0 ? (
        <Empty
          className="execution-log__empty"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无执行日志"
        />
      ) : (
        <div
          ref={viewportRef}
          className="execution-log__viewport"
          role="log"
          aria-live={active ? "polite" : "off"}
          onScroll={trackScroll}
        >
          {logs.map((log) => {
            const level = LOG_LEVEL_META[log.level];
            const stage = log.stage
              ? AI_EXECUTION_STAGE_LABELS[log.stage]
              : "系统";
            return (
              <div className="execution-log__line" key={log.position}>
                <time>{formatLogDateTime(log.createdAt)}</time>
                <span className={`execution-log__level ${level.className}`}>
                  {level.label}
                </span>
                <span className="execution-log__stage">[{stage}]</span>
                <span className="execution-log__message">{log.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
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
  const resultHref =
    execution.result && !execution.result.deleted
      ? execution.result.confirmedUserStoryId
        ? `/user-stories/${execution.result.confirmedUserStoryId}`
        : `/requirements/pending-review/${execution.result.id}`
      : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI辅助生成US"
        description={
          execution.feature
            ? `所属 FE：${execution.feature.code} · ${execution.feature.name}`
            : "未归属 FE"
        }
        meta={
          <Space size={8}>
            <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
            <span>{AI_EXECUTION_STAGE_LABELS[execution.stage]}</span>
          </Space>
        }
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} href="/ai-executions">
              返回执行记录
            </Button>
            {resultHref ? (
              <Button icon={<FileSearchOutlined />} href={resultHref}>
                查看生成结果
              </Button>
            ) : null}
          </Space>
        }
      />

      {executionActive ? (
        <Alert
          type="info"
          showIcon
          icon={<Spin size="small" />}
          title="任务正在后台执行"
          description="可以离开此页面，任务完成后仍可从 AI 执行记录中查看。"
        />
      ) : null}
      {execution.errorMessage ? (
        <Alert
          type="error"
          showIcon
          title="生成失败"
          description={execution.errorMessage}
        />
      ) : null}
      {execution.result?.deleted ? (
        <Alert
          type="warning"
          showIcon
          title="本次生成结果已删除"
          description="执行记录与日志仍然保留。"
        />
      ) : null}

      <PageSection title="执行信息">
        <Descriptions column={4} size="small">
          <Descriptions.Item label="发起用户">
            {execution.requestedBy}
          </Descriptions.Item>
          <Descriptions.Item label="发起时间">
            {formatDetailedDateTime(execution.queuedAt)}
          </Descriptions.Item>
          <Descriptions.Item label="耗时">
            {formatDuration(execution.durationMs)}
          </Descriptions.Item>
          <Descriptions.Item label="模型配置">
            {execution.modelProfileNameSnapshot ?? "—"}
          </Descriptions.Item>
          <Descriptions.Item label="模型 ID">
            {execution.modelIdSnapshot ?? "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Skill">
            {execution.skillNameSnapshot
              ? `${execution.skillNameSnapshot} v${execution.skillVersionSnapshot}`
              : "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Token">
            {execution.totalTokens === null
              ? "—"
              : `${execution.totalTokens}（输入 ${execution.promptTokens ?? 0} / 输出 ${execution.completionTokens ?? 0}）`}
          </Descriptions.Item>
        </Descriptions>
      </PageSection>

      <ExecutionLogPanel logs={execution.logs} active={executionActive} />

      <PageSection title="输入的需求内容">
        <Typography.Paragraph className="!mb-0 whitespace-pre-wrap">
          {execution.requirementText}
        </Typography.Paragraph>
      </PageSection>
    </div>
  );
}
