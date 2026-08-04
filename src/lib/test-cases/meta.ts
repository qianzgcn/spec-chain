import {
  RunStatus,
  TestPriority,
  TestRunStage,
} from "@/generated/prisma/enums";

type BadgeVariant = "info" | "success" | "warning" | "destructive" | "outline";

export const TEST_PRIORITY_META: Record<
  TestPriority,
  { label: string; description: string; badgeVariant: BadgeVariant }
> = {
  [TestPriority.P0]: {
    label: "P0",
    description: "最基本用例",
    badgeVariant: "destructive",
  },
  [TestPriority.P1]: {
    label: "P1",
    description: "重要用例",
    badgeVariant: "warning",
  },
  [TestPriority.P2]: {
    label: "P2",
    description: "普通用例",
    badgeVariant: "outline",
  },
};

export const RUN_STATUS_META: Record<
  RunStatus,
  { label: string; badgeVariant: BadgeVariant }
> = {
  [RunStatus.QUEUED]: { label: "排队中", badgeVariant: "outline" },
  [RunStatus.RUNNING]: { label: "运行中", badgeVariant: "info" },
  [RunStatus.PASSED]: { label: "成功", badgeVariant: "success" },
  [RunStatus.FAILED]: { label: "失败", badgeVariant: "destructive" },
  [RunStatus.TIMED_OUT]: { label: "超时", badgeVariant: "warning" },
  [RunStatus.STOPPED]: { label: "已停止", badgeVariant: "outline" },
};

/**
 * 运行时补齐脚本时，TestRun 会暂时保持 QUEUED，直到运行器领取它。
 * 阶段已经推进后，对用户而言任务已开始执行，因此展示为运行中。
 */
export function getRunDisplayStatus(
  status: RunStatus,
  stage: TestRunStage,
): RunStatus {
  return status === RunStatus.QUEUED && stage !== TestRunStage.QUEUED
    ? RunStatus.RUNNING
    : status;
}
