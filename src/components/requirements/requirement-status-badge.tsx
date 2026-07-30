import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { RequirementStatus } from "@/generated/prisma/enums";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";
import { cn } from "@/lib/utils";

const statusVariants: Record<
  RequirementStatus,
  "outline" | "info" | "warning" | "success"
> = {
  [RequirementStatus.DESIGN]: "outline",
  [RequirementStatus.DEVELOPMENT]: "info",
  [RequirementStatus.TESTING]: "warning",
  [RequirementStatus.COMPLETED]: "success",
};

const statusDotClasses: Record<RequirementStatus, string> = {
  [RequirementStatus.DESIGN]: "bg-muted-foreground",
  [RequirementStatus.DEVELOPMENT]: "bg-info",
  [RequirementStatus.TESTING]: "bg-warning",
  [RequirementStatus.COMPLETED]: "bg-success",
};

export function getRequirementStatusVariant(status: RequirementStatus) {
  return statusVariants[status];
}

export function RequirementStatusValue({
  status,
}: {
  status: RequirementStatus;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        className={cn("size-1.5 rounded-full", statusDotClasses[status])}
        aria-hidden="true"
      />
      <span>{REQUIREMENT_STATUS_META[status].label}</span>
    </span>
  );
}

export function RequirementStatusBadge({
  status,
  className,
}: {
  status: RequirementStatus;
  className?: ComponentProps<typeof Badge>["className"];
}) {
  return (
    <Badge
      variant={statusVariants[status]}
      className={cn(
        "h-7 w-24 justify-start rounded-[min(var(--radius-md),10px)] px-2.5 text-[0.8rem]",
        className,
      )}
    >
      <RequirementStatusValue status={status} />
    </Badge>
  );
}
