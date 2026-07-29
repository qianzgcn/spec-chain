"use client";

import { useState, useTransition } from "react";

import { CopyIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteFeatureAction,
  deleteUserStoryAction,
  getRequirementMarkdownAction,
} from "@/app/actions/requirements";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function RequirementDetailActions({
  type,
  id,
  childCount = 0,
}: {
  type: "FEATURE" | "USER_STORY";
  id: string;
  childCount?: number;
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
      const result =
        type === "FEATURE"
          ? await deleteFeatureAction(id)
          : await deleteUserStoryAction(id);
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
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/features/${id}/user-stories/new`} />}
          >
            <PlusIcon data-icon="inline-start" />
            新建US
          </Button>
        ) : null}
        <Button variant="outline" onClick={copy} disabled={isPending}>
          {isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <CopyIcon data-icon="inline-start" />
          )}
          复制内容
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`${basePath}/edit`} />}
        >
          <PencilIcon data-icon="inline-start" />
          编辑
        </Button>
        <Button
          variant="destructive"
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2Icon data-icon="inline-start" />
          删除
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`删除${type === "FEATURE" ? " FE" : " US"}`}
        description={
          type === "FEATURE"
            ? `将同时删除 ${childCount} 个关联 US，且不能恢复。`
            : "删除后不能恢复，不会影响测试用例。"
        }
        confirmLabel="删除"
        destructive
        pending={isPending}
        onOpenChange={setConfirmOpen}
        onConfirm={remove}
      />
    </>
  );
}
