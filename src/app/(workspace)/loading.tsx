import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-5"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">正在加载页面</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Card className="min-h-0 flex-1">
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-8 w-36" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    </div>
  );
}
