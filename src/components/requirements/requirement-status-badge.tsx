import { Badge } from "@/components/ui/badge";
import { RequirementStatus } from "@/generated/prisma/enums";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";

const statusVariants: Record<
  RequirementStatus,
  "default" | "secondary" | "outline" | "ghost"
> = {
  [RequirementStatus.DESIGN]: "outline",
  [RequirementStatus.DEVELOPMENT]: "secondary",
  [RequirementStatus.TESTING]: "default",
  [RequirementStatus.COMPLETED]: "ghost",
};

export function RequirementStatusBadge({
  status,
}: {
  status: RequirementStatus;
}) {
  return (
    <Badge variant={statusVariants[status]}>
      {REQUIREMENT_STATUS_META[status].label}
    </Badge>
  );
}
