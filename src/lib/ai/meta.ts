import {
  AiCapability,
  AiExecutionStage,
  AiExecutionStatus,
} from "@/generated/prisma/enums";

export const AI_TASK_TYPE_LABELS: Record<AiCapability, string> = {
  [AiCapability.GENERATE_USER_STORY]: "AI辅助生成US",
  [AiCapability.GENERATE_TEST_CASES]: "AI辅助生成测试用例",
};

export const AI_EXECUTION_STATUS_META: Record<
  AiExecutionStatus,
  {
    label: string;
    badgeVariant: "info" | "success" | "destructive" | "outline";
  }
> = {
  [AiExecutionStatus.QUEUED]: {
    label: "排队中",
    badgeVariant: "outline",
  },
  [AiExecutionStatus.RUNNING]: {
    label: "运行中",
    badgeVariant: "info",
  },
  [AiExecutionStatus.SUCCEEDED]: {
    label: "已成功",
    badgeVariant: "success",
  },
  [AiExecutionStatus.FAILED]: {
    label: "已失败",
    badgeVariant: "destructive",
  },
};

export const AI_EXECUTION_STAGE_LABELS: Record<AiExecutionStage, string> = {
  [AiExecutionStage.QUEUED]: "等待执行",
  [AiExecutionStage.CHECKING_REPOSITORIES]: "检查并读取代码仓库",
  [AiExecutionStage.SELECTING_CODE]: "定位相关代码",
  [AiExecutionStage.GENERATING_DRAFT]: "生成结构化草稿",
  [AiExecutionStage.COMPLETED]: "生成完成",
};

export function getAiExecutionStageLabel(
  capability: AiCapability,
  stage: AiExecutionStage,
) {
  if (stage !== AiExecutionStage.GENERATING_DRAFT) {
    return AI_EXECUTION_STAGE_LABELS[stage];
  }

  return capability === AiCapability.GENERATE_USER_STORY
    ? "生成结构化 US"
    : "生成自然语言测试用例";
}

export const ACTIVE_AI_EXECUTION_STATUSES = new Set<AiExecutionStatus>([
  AiExecutionStatus.QUEUED,
  AiExecutionStatus.RUNNING,
]);
