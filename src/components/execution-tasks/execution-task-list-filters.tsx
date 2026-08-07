import { SearchInput } from "@/components/data-table/search-input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiCapability } from "@/generated/prisma/enums";
import {
  EXECUTION_TASK_STATUS_META,
  EXECUTION_TASK_TYPE_LABELS,
} from "@/lib/execution-tasks/meta";
import type {
  ExecutionTaskStatus,
  ExecutionTaskType,
} from "@/lib/execution-tasks/types";

const TASK_TYPE_OPTIONS: Array<{
  label: string;
  value: ExecutionTaskType | null;
}> = [
  { label: "全部任务类型", value: null },
  { label: "创建US", value: AiCapability.GENERATE_USER_STORY },
  {
    label: "创建用例",
    value: "GENERATE_TEST_CASES_CREATE" as ExecutionTaskType,
  },
  {
    label: "更新用例",
    value: "GENERATE_TEST_CASES_UPDATE" as ExecutionTaskType,
  },
  {
    label: "生成用例自动化脚本",
    value: AiCapability.GENERATE_AUTOMATION_SCRIPT,
  },
  {
    label: "需求实现审查",
    value: AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION,
  },
];

const STATUS_OPTIONS: Array<{
  label: string;
  value: ExecutionTaskStatus | null;
}> = [
  { label: "全部任务状态", value: null },
  ...Object.entries(EXECUTION_TASK_STATUS_META).map(([value, meta]) => ({
    label: meta.label,
    value: value as ExecutionTaskStatus,
  })),
];

export function ExecutionTaskListFilters({
  searchValue,
  taskType,
  status,
  hasFilters,
  onSearchValueChange,
  onSearch,
  onTaskTypeChange,
  onStatusChange,
  onReset,
}: {
  searchValue: string;
  taskType: ExecutionTaskType | null;
  status: ExecutionTaskStatus | null;
  resultCount?: number;
  fetching?: boolean;
  hasFilters: boolean;
  onSearchValueChange: (value: string) => void;
  onSearch: (value: string) => void;
  onTaskTypeChange: (value: ExecutionTaskType | null) => void;
  onStatusChange: (value: ExecutionTaskStatus | null) => void;
  onReset: () => void;
}) {
  return (
    <>
      <SearchInput
        value={searchValue}
        placeholder="搜索任务 ID 或任务内容"
        onChange={onSearchValueChange}
        onSearch={onSearch}
      />
      <Select
        items={TASK_TYPE_OPTIONS}
        value={taskType}
        onValueChange={onTaskTypeChange}
      >
        <SelectTrigger className="w-52" aria-label="任务类型">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {TASK_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value ?? "all"} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        items={STATUS_OPTIONS}
        value={status}
        onValueChange={onStatusChange}
      >
        <SelectTrigger className="w-36" aria-label="任务状态">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value ?? "all"} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {hasFilters ? (
        <Button variant="ghost" onClick={onReset}>
          重置筛选
        </Button>
      ) : null}
    </>
  );
}
