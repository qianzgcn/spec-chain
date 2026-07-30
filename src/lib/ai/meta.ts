import {
  AiCapability,
  AiExecutionStage,
  AiExecutionStatus,
} from "@/generated/prisma/enums";

export const AI_TASK_TYPE_LABELS: Record<AiCapability, string> = {
  [AiCapability.GENERATE_USER_STORY]: "AI辅助生成US",
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
  [AiExecutionStage.GENERATING_DRAFT]: "生成结构化 US",
  [AiExecutionStage.COMPLETED]: "生成完成",
};

export const ACTIVE_AI_EXECUTION_STATUSES = new Set<AiExecutionStatus>([
  AiExecutionStatus.QUEUED,
  AiExecutionStatus.RUNNING,
]);
