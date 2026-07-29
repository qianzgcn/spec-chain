"use client";

import { Select } from "antd";

import { RequirementStatusBadge } from "@/components/requirements/requirement-status-badge";
import { RequirementStatus } from "@/generated/prisma/enums";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";

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
  const className = [
    "requirement-status-select",
    loading ? "requirement-status-select--loading" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Select<RequirementStatus>
      aria-label="需求状态"
      className={className}
      classNames={{ popup: { root: "requirement-status-popup" } }}
      value={value}
      options={STATUS_OPTIONS}
      size={size}
      variant="borderless"
      disabled={disabled}
      loading={loading}
      popupMatchSelectWidth={120}
      onChange={onChange}
      labelRender={({ value: selectedValue }) => (
        <RequirementStatusBadge status={selectedValue as RequirementStatus} />
      )}
      optionRender={(option) => (
        <RequirementStatusBadge status={option.value as RequirementStatus} />
      )}
    />
  );
}
