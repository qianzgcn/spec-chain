"use client";

import type { ReactNode } from "react";

import { MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

export type DataTableRowAction = {
  label: string;
  ariaLabel?: string;
  href?: string;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
  onClick?: () => void;
};

const MAX_VISIBLE_ACTIONS = 3;

function DirectAction({ action }: { action: DataTableRowAction }) {
  const content = (
    <>
      {action.loading ? <Spinner data-icon="inline-start" /> : null}
      {action.label}
    </>
  );
  const commonProps = {
    "aria-label": action.ariaLabel,
    disabled: action.disabled,
    size: "xs" as const,
    variant: action.destructive ? ("destructive" as const) : ("ghost" as const),
  };

  if (action.href) {
    return (
      <Button
        {...commonProps}
        nativeButton={false}
        render={<Link href={action.href} />}
        onClick={action.onClick}
      >
        {content}
      </Button>
    );
  }

  return (
    <Button {...commonProps} onClick={action.onClick}>
      {content}
    </Button>
  );
}

function OverflowAction({ action }: { action: DataTableRowAction }) {
  return (
    <DropdownMenuItem
      variant={action.destructive ? "destructive" : "default"}
      disabled={action.disabled}
      render={action.href ? <Link href={action.href} /> : undefined}
      onClick={action.onClick}
    >
      {action.loading ? <Spinner /> : action.icon}
      {action.label}
    </DropdownMenuItem>
  );
}

export function DataTableRowActions({
  actions,
  testId,
}: {
  actions: DataTableRowAction[];
  testId?: string;
}) {
  const visibleActions = actions.slice(0, MAX_VISIBLE_ACTIONS);
  const overflowActions = actions.slice(MAX_VISIBLE_ACTIONS);

  return (
    <div className="flex items-center justify-start gap-1" data-testid={testId}>
      {visibleActions.map((action) => (
        <DirectAction key={action.label} action={action} />
      ))}

      {overflowActions.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-xs" aria-label="更多操作" />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {overflowActions.map((action) => (
                <OverflowAction key={action.label} action={action} />
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
