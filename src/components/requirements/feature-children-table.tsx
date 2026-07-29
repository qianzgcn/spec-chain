import Link from "next/link";

import { RequirementStatusBadge } from "@/components/requirements/requirement-status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequirementStatus } from "@/generated/prisma/enums";
import { formatCompactDateTime } from "@/lib/date-time";

type ChildStory = {
  id: string;
  code: string;
  title: string;
  status: RequirementStatus;
  updatedAt: string;
};

export function FeatureChildrenTable({ items }: { items: ChildStory[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-52">编号</TableHead>
          <TableHead>US 标题</TableHead>
          <TableHead className="w-28">状态</TableHead>
          <TableHead className="w-44">更新时间</TableHead>
          <TableHead className="w-36">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length ? (
          items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="text-muted-foreground font-mono text-xs">
                {item.code}
              </TableCell>
              <TableCell className="max-w-0 truncate font-medium">
                {item.title}
              </TableCell>
              <TableCell>
                <RequirementStatusBadge status={item.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatCompactDateTime(item.updatedAt)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/user-stories/${item.id}`} />}
                  >
                    查看
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/user-stories/${item.id}/edit`} />}
                  >
                    编辑
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={5}
              className="text-muted-foreground h-28 text-center"
            >
              还没有关联 US
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
