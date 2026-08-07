import { DeliveryVersionStatus } from "@/generated/prisma/enums";

export const DELIVERY_VERSION_STATUS_META = {
  [DeliveryVersionStatus.PENDING]: {
    label: "待启动",
    badgeVariant: "outline" as const,
  },
  [DeliveryVersionStatus.IN_PROGRESS]: {
    label: "实施中",
    badgeVariant: "info" as const,
  },
  [DeliveryVersionStatus.DELIVERED]: {
    label: "已交付",
    badgeVariant: "success" as const,
  },
};
