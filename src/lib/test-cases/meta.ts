import { RunStatus, TestPriority } from "@/generated/prisma/enums";

export const TEST_PRIORITY_META: Record<
  TestPriority,
  { label: string; description: string; color: string }
> = {
  [TestPriority.P0]: {
    label: "P0",
    description: "最基本用例",
    color: "red",
  },
  [TestPriority.P1]: {
    label: "P1",
    description: "重要用例",
    color: "orange",
  },
  [TestPriority.P2]: {
    label: "P2",
    description: "普通用例",
    color: "default",
  },
};

export const RUN_STATUS_META: Record<
  RunStatus,
  { label: string; color: string }
> = {
  [RunStatus.QUEUED]: { label: "排队中", color: "default" },
  [RunStatus.RUNNING]: { label: "运行中", color: "processing" },
  [RunStatus.PASSED]: { label: "成功", color: "success" },
  [RunStatus.FAILED]: { label: "失败", color: "error" },
  [RunStatus.TIMED_OUT]: { label: "超时", color: "warning" },
  [RunStatus.STOPPED]: { label: "已停止", color: "default" },
};
