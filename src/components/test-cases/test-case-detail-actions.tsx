"use client";

import { useState, useTransition } from "react";

import { HistoryIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { deleteTestCaseAction } from "@/app/actions/test-cases";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function TestCaseDetailActions({ id }: { id: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteTestCaseAction(id);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      setConfirmOpen(false);
      toast.add({ type: "success", description: result.message });
      router.push("/test-cases");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          nativeButton={false}
          render={<Link href={`/test-cases/${id}/runs`} />}
        >
          <HistoryIcon data-icon="inline-start" />
          执行记录
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/test-cases/${id}/edit`} />}
        >
          <PencilIcon data-icon="inline-start" />
          编辑
        </Button>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2Icon data-icon="inline-start" />
          删除
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="删除测试用例"
        description="删除后不能恢复，运行历史仍会保留。"
        confirmLabel="删除"
        destructive
        pending={isPending}
        onOpenChange={setConfirmOpen}
        onConfirm={remove}
      />
    </>
  );
}
