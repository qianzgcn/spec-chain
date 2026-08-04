"use client";

import type { ReactNode } from "react";

import { CircleHelpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SettingsSection({
  title,
  help,
  actions,
  children,
}: {
  title: string;
  help: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 p-5 lg:p-6">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <CardTitle>
            <h2>{title}</h2>
          </CardTitle>
          <Tooltip>
            <TooltipTrigger
              render={<Button type="button" variant="ghost" size="icon-xs" />}
            >
              <CircleHelpIcon />
              <span className="sr-only">查看{title}说明</span>
            </TooltipTrigger>
            <TooltipContent side="right">{help}</TooltipContent>
          </Tooltip>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
