import { RequirementStatus } from "@/generated/prisma/enums";

const REQUIREMENT_STATUS_ORDER: Record<RequirementStatus, number> = {
  [RequirementStatus.DESIGN]: 0,
  [RequirementStatus.DEVELOPMENT]: 1,
  [RequirementStatus.TESTING]: 2,
  [RequirementStatus.COMPLETED]: 3,
};

export const REQUIREMENT_STATUS_META: Record<
  RequirementStatus,
  { label: string }
> = {
  [RequirementStatus.DESIGN]: { label: "设计" },
  [RequirementStatus.DEVELOPMENT]: { label: "开发" },
  [RequirementStatus.TESTING]: { label: "测试" },
  [RequirementStatus.COMPLETED]: { label: "完成" },
};

export function deriveFeatureStatus(statuses: RequirementStatus[]) {
  if (statuses.length === 0) {
    return RequirementStatus.DESIGN;
  }

  return statuses.reduce((slowest, current) =>
    REQUIREMENT_STATUS_ORDER[current] < REQUIREMENT_STATUS_ORDER[slowest]
      ? current
      : slowest,
  );
}
