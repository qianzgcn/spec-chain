import type { ReactNode } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      {title || description || actions ? (
        <CardHeader className="border-b">
          {title ? (
            <CardTitle>
              <h2>{title}</h2>
            </CardTitle>
          ) : null}
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
          {actions ? (
            <CardAction className="flex items-center">{actions}</CardAction>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("min-w-0", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
