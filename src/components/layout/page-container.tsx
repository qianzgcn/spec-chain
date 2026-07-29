import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  table = false,
  className,
}: {
  children: ReactNode;
  table?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1600px] min-w-0",
        table && "flex min-h-0 flex-1 flex-col",
        className,
      )}
    >
      {children}
    </div>
  );
}
