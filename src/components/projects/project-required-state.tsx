import { FolderKanbanIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function ProjectRequiredState({
  description = "请先创建项目，再继续当前操作。",
}: {
  description?: string;
}) {
  return (
    <div className="bg-card grid min-h-72 place-items-center rounded-lg border">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderKanbanIcon />
          </EmptyMedia>
          <EmptyTitle>当前没有可用项目</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/projects" />}>
            前往项目管理
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
