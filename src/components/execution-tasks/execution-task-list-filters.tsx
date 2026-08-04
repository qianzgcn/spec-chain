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
import { Spinner } from "@/components/ui/spinner";
import {
  EXECUTION_TASK_STATUS_META,
  EXECUTION_TASK_TYPE_LABELS,
} from "@/lib/execution-tasks/meta";
import type {
  ExecutionTaskStatus,
  ExecutionTaskType,
} from "@/lib/execution-tasks/types";
import { cn } from "@/lib/utils";

const TASK_TYPE_OPTIONS: Array<{
  label: string;
  value: ExecutionTaskType | null;
}> = [
  { label: "全部任务类型", value: null },
  ...Object.entries(EXECUTION_TASK_TYPE_LABELS).map(([value, label]) => ({
    label,
    value: value as ExecutionTaskType,
  })),
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
  resultCount,
  fetching,
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
  resultCount: number;
  fetching: boolean;
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
      <span className="text-muted-foreground ml-auto shrink-0 text-sm">
        共 {resultCount} 个任务
      </span>
      <span
        className={cn(
          "text-muted-foreground flex min-w-28 shrink-0 items-center gap-2 text-xs",
          !fetching && "invisible",
        )}
        aria-hidden={!fetching}
      >
        <Spinner />
        正在更新状态…
      </span>
    </>
  );
}
