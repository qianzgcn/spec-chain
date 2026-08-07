import {
  AiCapability,
  AiExecutionStage,
  AiExecutionStatus,
  TestRunStage,
} from "@/generated/prisma/enums";
import {
  type ExecutionTaskStatus,
  type ExecutionTaskType,
} from "@/lib/execution-tasks/types";

type BadgeVariant = "info" | "success" | "warning" | "destructive" | "outline";

export const EXECUTION_TASK_TYPE_LABELS: Record<string, string> = {
  [AiCapability.GENERATE_USER_STORY]: "创建US",
  [AiCapability.GENERATE_TEST_CASES]: "创建用例",
  GENERATE_TEST_CASES_CREATE: "创建用例",
  GENERATE_TEST_CASES_UPDATE: "更新用例",
  [AiCapability.GENERATE_AUTOMATION_SCRIPT]: "生成用例自动化脚本",
  [AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION]: "需求实现审查",
};

export const EXECUTION_TASK_STATUS_META: Record<
  ExecutionTaskStatus,
  { label: string; badgeVariant: BadgeVariant }
> = {
  QUEUED: { label: "排队中", badgeVariant: "outline" },
  RUNNING: { label: "运行中", badgeVariant: "info" },
  SUCCEEDED: { label: "成功", badgeVariant: "success" },
  FAILED: { label: "失败", badgeVariant: "destructive" },
};

export const ACTIVE_EXECUTION_TASK_STATUSES = new Set<ExecutionTaskStatus>([
  "QUEUED",
  "RUNNING",
]);

export const TERMINAL_EXECUTION_TASK_STATUSES = new Set<ExecutionTaskStatus>([
  "SUCCEEDED",
  "FAILED",
]);

export const AI_EXECUTION_STAGE_LABELS: Record<AiExecutionStage, string> = {
  [AiExecutionStage.QUEUED]: "等待执行",
  [AiExecutionStage.CHECKING_REPOSITORIES]: "检查并读取代码仓库",
  [AiExecutionStage.SELECTING_CODE]: "定位相关代码",
  [AiExecutionStage.GENERATING_DRAFT]: "生成结构化草稿",
  [AiExecutionStage.REVIEWING_IMPLEMENTATION]: "审查需求实现",
  [AiExecutionStage.PREPARING_AUTHENTICATION]: "准备登录环境",
  [AiExecutionStage.PROBING_PAGE]: "探测真实页面",
  [AiExecutionStage.GENERATING_SCRIPT]: "生成自动化脚本",
  [AiExecutionStage.VALIDATING_SCRIPT]: "校验自动化脚本",
  [AiExecutionStage.COMPLETED]: "已完成",
};

export const TEST_RUN_STAGE_LABELS: Record<TestRunStage, string> = {
  [TestRunStage.QUEUED]: "等待执行",
  [TestRunStage.GENERATING_SCRIPT]: "生成自动化脚本",
  [TestRunStage.PREPARING_AUTHENTICATION]: "准备登录环境",
  [TestRunStage.PROBING_PAGE]: "探测真实页面",
  [TestRunStage.VALIDATING_SCRIPT]: "校验自动化脚本",
  [TestRunStage.RUNNING_TEST]: "执行测试用例",
  [TestRunStage.COMPLETED]: "已完成",
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
    : capability === AiCapability.GENERATE_TEST_CASES
      ? "生成自然语言测试用例"
      : AI_EXECUTION_STAGE_LABELS[stage];
}

export function mapAiExecutionStatus(
  status: AiExecutionStatus,
): ExecutionTaskStatus {
  switch (status) {
    case AiExecutionStatus.QUEUED:
      return "QUEUED";
    case AiExecutionStatus.RUNNING:
      return "RUNNING";
    case AiExecutionStatus.SUCCEEDED:
      return "SUCCEEDED";
    case AiExecutionStatus.FAILED:
      return "FAILED";
  }
}
