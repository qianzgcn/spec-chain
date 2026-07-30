"use client";

import {
  getRequirementStatusVariant,
  RequirementStatusValue,
} from "@/components/requirements/requirement-status-badge";
import { badgeVariants } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { RequirementStatus } from "@/generated/prisma/enums";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = Object.values(RequirementStatus).map((status) => ({
  value: status,
  label: REQUIREMENT_STATUS_META[status].label,
}));

export function RequirementStatusSelectControl({
  value,
  onChange,
  disabled = false,
  loading = false,
  size = "small",
}: {
  value: RequirementStatus;
  onChange?: (value: RequirementStatus) => void;
  disabled?: boolean;
  loading?: boolean;
  size?: "small" | "middle";
}) {
  return (
    <Select
      items={STATUS_OPTIONS}
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => onChange?.(nextValue as RequirementStatus)}
    >
      <SelectTrigger
        aria-label="需求状态"
        size={size === "small" ? "sm" : "default"}
        className={cn(
          badgeVariants({
            variant: getRequirementStatusVariant(value),
          }),
          "w-24 justify-between px-2.5 text-[0.8rem]",
        )}
      >
        <SelectValue>
          {(selectedValue: RequirementStatus) => (
            <RequirementStatusValue status={selectedValue} />
          )}
        </SelectValue>
        {loading ? <Spinner /> : null}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <RequirementStatusValue status={option.value} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
