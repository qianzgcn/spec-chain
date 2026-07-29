import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-w-0 items-start justify-between gap-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {meta ? (
          <div className="text-muted-foreground mb-1.5 flex min-h-5 flex-wrap items-center gap-2 text-xs">
            {meta}
          </div>
        ) : null}
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground mt-1 max-w-4xl text-sm leading-6">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex max-w-[58%] shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
