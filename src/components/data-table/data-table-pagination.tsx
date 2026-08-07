"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function pageItems(current: number, pageCount: number) {
  const pages = new Set([1, pageCount, current - 1, current, current + 1]);
  return [...pages]
    .filter((page) => page >= 1 && page <= pageCount)
    .toSorted((left, right) => left - right);
}

import { DEFAULT_PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export function DataTablePagination({
  page,
  pageSize,
  total,
  itemName,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onChange,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  itemName: string;
  pageSizeOptions?: number[];
  onChange?: (page: number) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const handlePageChange = onPageChange ?? onChange;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pages = pageItems(page, pageCount);

  const selectItems = pageSizeOptions.map((size) => ({
    label: `${size} 条/页`,
    value: String(size),
  }));

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs">
          共 {total} {itemName}
        </span>
        {onPageSizeChange ? (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-xs">每页</span>
            <Select
              items={selectItems}
              value={String(pageSize)}
              onValueChange={(val) => val && onPageSizeChange(Number(val))}
            >
              <SelectTrigger className="h-7 w-24 text-xs" aria-label="每页条数">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {selectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <nav className="flex items-center gap-1" aria-label="分页">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => handlePageChange?.(page - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        {pages.map((item, index) => {
          const previous = pages[index - 1];
          return (
            <span className="flex items-center gap-1" key={item}>
              {previous && item - previous > 1 ? (
                <span className="text-muted-foreground px-1 text-xs">…</span>
              ) : null}
              <Button
                variant={item === page ? "outline" : "ghost"}
                size="icon-sm"
                aria-label={`第 ${item} 页`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => handlePageChange?.(item)}
              >
                {item}
              </Button>
            </span>
          );
        })}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="下一页"
          disabled={page >= pageCount}
          onClick={() => handlePageChange?.(page + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </nav>
    </div>
  );
}
