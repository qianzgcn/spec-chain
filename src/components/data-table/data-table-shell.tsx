import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DataTableShell({
  toolbar,
  children,
  footer,
  className,
}: {
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-testid="data-table-shell"
      className={cn(
        "bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border",
        className,
      )}
    >
      {toolbar ? (
        <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2.5">
          {toolbar}
        </div>
      ) : null}
      {children}
      {footer ? (
        <footer
          className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-t px-4 py-2.5"
          data-testid="data-table-pagination"
        >
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
