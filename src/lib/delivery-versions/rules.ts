import { DeliveryVersionStatus } from "@/generated/prisma/enums";

export type DeliveryVersionContentState = {
  lockedAt: Date | null;
  status: DeliveryVersionStatus;
};

export function isDeliveryVersionContentLocked(
  version: DeliveryVersionContentState,
) {
  return (
    Boolean(version.lockedAt) ||
    version.status === DeliveryVersionStatus.DELIVERED
  );
}
