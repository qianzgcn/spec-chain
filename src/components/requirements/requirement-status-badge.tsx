import { RequirementStatus } from "@/generated/prisma/enums";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";

const classNames: Record<RequirementStatus, string> = {
  [RequirementStatus.DESIGN]: "bg-slate-100 text-slate-600",
  [RequirementStatus.DEVELOPMENT]: "bg-blue-50 text-blue-700",
  [RequirementStatus.TESTING]: "bg-amber-50 text-amber-700",
  [RequirementStatus.COMPLETED]: "bg-emerald-50 text-emerald-700",
};

export function RequirementStatusBadge({
  status,
}: {
  status: RequirementStatus;
}) {
  return (
    <span
      className={`inline-flex min-w-12 items-center justify-center rounded px-2 py-1 text-xs font-medium ${classNames[status]}`}
    >
      {REQUIREMENT_STATUS_META[status].label}
    </span>
  );
}
