import { RequirementStatus } from "@/generated/prisma/enums";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";

const toneClassNames: Record<RequirementStatus, string> = {
  [RequirementStatus.DESIGN]: "requirement-status-badge--design",
  [RequirementStatus.DEVELOPMENT]: "requirement-status-badge--development",
  [RequirementStatus.TESTING]: "requirement-status-badge--testing",
  [RequirementStatus.COMPLETED]: "requirement-status-badge--completed",
};

export function RequirementStatusBadge({
  status,
}: {
  status: RequirementStatus;
}) {
  return (
    <span className={`requirement-status-badge ${toneClassNames[status]}`}>
      {REQUIREMENT_STATUS_META[status].label}
    </span>
  );
}
