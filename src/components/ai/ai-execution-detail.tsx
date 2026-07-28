"use client";

import { useEffect, useRef, useState } from "react";

import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import FileSearchOutlined from "@ant-design/icons/FileSearchOutlined";
import {
  Alert,
  Button,
  Descriptions,
  Divider,
  List,
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

import {
  ACTIVE_AI_EXECUTION_STATUSES,
  AI_EXECUTION_STAGE_LABELS,
  AI_EXECUTION_STATUS_META,
} from "@/lib/ai/meta";
import type { AiExecutionDetail } from "@/lib/ai/execution-types";
import { formatDetailedDateTime } from "@/lib/date-time";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";

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

export function AiExecutionDetailPanel({
  initialExecution,
  followResult,
}: {
  initialExecution: AiExecutionDetail;
  followResult: boolean;
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
      <AiExecutionDetailContent
        initialExecution={initialExecution}
        followResult={followResult}
      />
    </QueryClientProvider>
  );
}

function AiExecutionDetailContent({
  initialExecution,
  followResult,
}: {
  initialExecution: AiExecutionDetail;
  followResult: boolean;
}) {
  const { navigate } = useNavigationFeedback();
  const resultNavigationStarted = useRef(false);
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

  useEffect(() => {
    if (
      followResult &&
      !resultNavigationStarted.current &&
      execution.draft &&
      !execution.draft.deleted &&
      !execution.draft.confirmedUserStoryId
    ) {
      resultNavigationStarted.current = true;
      navigate(`/user-story-drafts/${execution.draft.id}`);
    }
  }, [execution.draft, followResult, navigate]);

  const statusMeta = AI_EXECUTION_STATUS_META[execution.status];

  return (
    <div className="space-y-5">
      <div className="content-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Space className="mb-2">
              <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
              <span className="text-sm text-slate-500">
                {AI_EXECUTION_STAGE_LABELS[execution.stage]}
              </span>
            </Space>
            <Typography.Title level={4} className="!mb-1">
              AI辅助生成US
            </Typography.Title>
            <Typography.Text type="secondary">
              {execution.feature
                ? `所属 FE：${execution.feature.code} · ${execution.feature.name}`
                : "无 FE 归属"}
            </Typography.Text>
          </div>
          <Space>
            <Button icon={<ArrowLeftOutlined />} href="/ai-executions">
              返回执行记录
            </Button>
            {execution.draft && !execution.draft.deleted ? (
              <Button
                type="primary"
                icon={<FileSearchOutlined />}
                href={
                  execution.draft.confirmedUserStoryId
                    ? `/user-stories/${execution.draft.confirmedUserStoryId}`
                    : `/user-story-drafts/${execution.draft.id}`
                }
              >
                {execution.draft.confirmedUserStoryId
                  ? "查看已创建US"
                  : "评审US草稿"}
              </Button>
            ) : null}
          </Space>
        </div>

        {ACTIVE_AI_EXECUTION_STATUSES.has(execution.status) ? (
          <Alert
            className="mt-5"
            type="info"
            showIcon
            icon={<Spin size="small" />}
            title="任务正在后台执行"
            description="可以离开此页面，任务完成后仍可从 AI 执行记录中查看结果。"
          />
        ) : null}
        {execution.errorMessage ? (
          <Alert
            className="mt-5"
            type="error"
            showIcon
            title="生成失败"
            description={execution.errorMessage}
          />
        ) : null}
        {execution.draft?.deleted ? (
          <Alert
            className="mt-5"
            type="warning"
            showIcon
            title="本次生成的 US 草稿已删除"
          />
        ) : null}

        <Divider />
        <Descriptions column={3} size="small">
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
          <Descriptions.Item label="Token 用量">
            {execution.totalTokens === null
              ? "—"
              : `${execution.totalTokens}（输入 ${execution.promptTokens ?? 0} / 输出 ${execution.completionTokens ?? 0}）`}
          </Descriptions.Item>
          <Descriptions.Item label="Skill">
            {execution.skillNameSnapshot
              ? `${execution.skillNameSnapshot} v${execution.skillVersionSnapshot}`
              : "—"}
          </Descriptions.Item>
        </Descriptions>
      </div>

      <div className="content-panel p-6">
        <Typography.Title level={5}>输入的需求内容</Typography.Title>
        <Typography.Paragraph className="!mb-0 whitespace-pre-wrap">
          {execution.requirementText}
        </Typography.Paragraph>
      </div>

      {execution.repositories.length > 0 ? (
        <div className="content-panel p-6">
          <Typography.Title level={5}>代码分析范围</Typography.Title>
          <List
            size="small"
            dataSource={execution.repositories}
            renderItem={(repository) => (
              <List.Item>
                <div className="min-w-0">
                  <div className="font-medium">
                    {repository.owner}/{repository.repository}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-500">
                    {repository.branch} · {repository.commitSha.slice(0, 12)}
                  </div>
                </div>
              </List.Item>
            )}
          />

          <Divider />
          <Typography.Title level={5}>实际引用的代码</Typography.Title>
          <List
            size="small"
            dataSource={execution.codeReferences}
            renderItem={(reference) => (
              <List.Item>
                <div className="min-w-0">
                  <div className="font-mono text-sm">{reference.path}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {reference.owner}/{reference.repository} ·{" "}
                    {reference.reason}
                  </div>
                </div>
              </List.Item>
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
