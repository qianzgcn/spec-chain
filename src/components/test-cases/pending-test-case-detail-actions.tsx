"use client";

import { useState, useTransition } from "react";

import { ArrowLeftIcon, CheckIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  confirmPendingTestCaseDraftAction,
  deletePendingTestCaseDraftAction,
} from "@/app/actions/pending-test-cases";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ButtonLink } from "@/components/navigation/button-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function PendingTestCaseDetailActions({
  id,
  hasGroup,
}: {
  id: string;
  hasGroup: boolean;
}) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "confirm" | "delete" | null
  >(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setPendingAction("confirm");
    startTransition(async () => {
      try {
        const result = await confirmPendingTestCaseDraftAction(id);
        if (!result.ok || !result.data) {
          toast.add({ type: "error", description: result.message });
          return;
        }

        toast.add({ type: "success", description: result.message });
        router.push(`/test-cases/${result.data.id}`);
        router.refresh();
      } catch {
        toast.add({ type: "error", description: "评审测试用例失败" });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function remove() {
    setPendingAction("delete");
    startTransition(async () => {
      try {
        const result = await deletePendingTestCaseDraftAction(id);
        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          return;
        }

        setDeleteDialogOpen(false);
        toast.add({ type: "success", description: result.message });
        router.push("/test-cases/pending-review");
        router.refresh();
      } catch {
        toast.add({ type: "error", description: "删除待评审用例失败" });
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <ButtonLink href="/test-cases/pending-review" variant="outline">
          <ArrowLeftIcon data-icon="inline-start" />
          返回列表
        </ButtonLink>
        <Button disabled={isPending || !hasGroup} onClick={confirm}>
          {pendingAction === "confirm" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          评审通过
        </Button>
        <Button
          variant="destructive"
          disabled={isPending}
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2Icon data-icon="inline-start" />
          删除
        </Button>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="删除待评审用例"
        description="删除后不能恢复。"
        confirmLabel="删除"
        destructive
        pending={pendingAction === "delete"}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={remove}
      />
    </>
  );
}
