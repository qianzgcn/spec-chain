"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

function pageItems(current: number, pageCount: number) {
  const pages = new Set([1, pageCount, current - 1, current, current + 1]);
  return [...pages]
    .filter((page) => page >= 1 && page <= pageCount)
    .toSorted((left, right) => left - right);
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  itemName,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  itemName: string;
  onChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pages = pageItems(page, pageCount);

  return (
    <>
      <span className="text-muted-foreground text-xs">
        共 {total} {itemName}
      </span>
      <nav className="flex items-center gap-1" aria-label="分页">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
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
                onClick={() => onChange(item)}
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
          onClick={() => onChange(page + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </nav>
    </>
  );
}
