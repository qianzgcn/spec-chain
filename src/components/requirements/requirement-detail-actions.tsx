"use client";

import { useState, useTransition } from "react";

import { CopyIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  deleteFeatureAction,
  getRequirementMarkdownAction,
} from "@/app/actions/requirements";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ButtonLink } from "@/components/navigation/button-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function RequirementDetailActions({
  type,
  id,
  childCount = 0,
  contentLocked = false,
}: {
  type: "FEATURE" | "USER_STORY";
  id: string;
  childCount?: number;
  contentLocked?: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const basePath =
    type === "FEATURE" ? `/features/${id}` : `/user-stories/${id}`;

  function copy() {
    startTransition(async () => {
      const result = await getRequirementMarkdownAction(type, id);
      if (!result.ok || !result.data) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      try {
        await navigator.clipboard.writeText(result.data.markdown);
        toast.add({ type: "success", description: "需求内容已复制" });
      } catch {
        toast.add({
          type: "error",
          description: "浏览器未允许访问剪贴板",
        });
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteFeatureAction(id);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      toast.add({ type: "success", description: result.message });
      router.push("/requirements");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {type === "FEATURE" ? (
          <ButtonLink
            href={`/features/${id}/user-stories/new`}
            variant="outline"
          >
            <PlusIcon data-icon="inline-start" />
            新建US
          </ButtonLink>
        ) : null}
        <Button variant="outline" onClick={copy} disabled={isPending}>
          {isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <CopyIcon data-icon="inline-start" />
          )}
          复制内容
        </Button>
        {!contentLocked ? (
          <ButtonLink href={`${basePath}/edit`} variant="outline">
            <PencilIcon data-icon="inline-start" />
            编辑
          </ButtonLink>
        ) : null}
        {type === "FEATURE" && !contentLocked ? (
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2Icon data-icon="inline-start" />
            删除
          </Button>
        ) : null}
      </div>

      {type === "FEATURE" ? (
        <ConfirmDialog
          open={confirmOpen}
          title="删除 FE"
          description={`将同时删除 ${childCount} 个关联 US，且不能恢复。`}
          confirmLabel="删除"
          destructive
          pending={isPending}
          onOpenChange={setConfirmOpen}
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}
