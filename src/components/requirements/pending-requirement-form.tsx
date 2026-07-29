"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2Icon } from "lucide-react";
import { FormProvider, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import {
  confirmPendingRequirementAction,
  deletePendingRequirementAction,
  updatePendingRequirementAction,
} from "@/app/actions/pending-requirements";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormPage } from "@/components/layout/form-page";
import { UserStoryFields } from "@/components/requirements/user-story-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";
import {
  userStoryFormSchema,
  type UserStoryFormValues,
} from "@/lib/requirements/user-story-schema";

export function PendingRequirementForm({
  draftId,
  feature,
  initialValues,
}: {
  draftId: string;
  feature: { id: string; code: string; name: string } | null;
  initialValues: UserStoryFormValues;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "save" | "confirm" | "delete" | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<UserStoryFormValues>({
    resolver: zodResolver(userStoryFormSchema),
    defaultValues: initialValues,
  });
  const dirty = form.formState.isDirty;
  useUnsavedChanges(dirty);

  function save(values: UserStoryFormValues) {
    setPendingAction("save");
    startTransition(async () => {
      const result = await updatePendingRequirementAction(draftId, values);
      if (!result.ok) {
        setPendingAction(null);
        toast.add({ type: "error", description: result.message });
        return;
      }

      form.reset({
        ...values,
        acceptanceCriteria:
          result.data?.acceptanceCriteria ?? values.acceptanceCriteria,
      });
      setPendingAction(null);
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  function confirm(values: UserStoryFormValues) {
    setPendingAction("confirm");
    startTransition(async () => {
      const saveResult = await updatePendingRequirementAction(draftId, values);
      if (!saveResult.ok) {
        setPendingAction(null);
        toast.add({ type: "error", description: saveResult.message });
        return;
      }

      const result = await confirmPendingRequirementAction(draftId);
      if (!result.ok || !result.data) {
        setPendingAction(null);
        toast.add({ type: "error", description: result.message });
        return;
      }

      form.reset(values);
      toast.add({ type: "success", description: result.message });
      router.push(`/user-stories/${result.data.id}`);
      router.refresh();
    });
  }

  function remove() {
    setPendingAction("delete");
    startTransition(async () => {
      const result = await deletePendingRequirementAction(draftId);
      if (!result.ok) {
        setPendingAction(null);
        toast.add({ type: "error", description: result.message });
        return;
      }

      form.reset(initialValues);
      toast.add({ type: "success", description: result.message });
      router.push("/requirements/pending-review");
      router.refresh();
    });
  }

  function backToList() {
    if (confirmLeaveIfDirty()) {
      router.push("/requirements/pending-review");
    }
  }

  return (
    <>
      <FormPage
        title="评审需求"
        description="检查并完善 AI 生成的内容；确认后才会创建正式 US。"
        meta={
          <>
            <Badge variant="secondary">AI 生成</Badge>
            <Badge variant="outline">待评审</Badge>
            {feature ? (
              <span>
                {feature.code} · {feature.name}
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => setDeleteOpen(true)}
            >
              {isPending && pendingAction === "delete" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              删除
            </Button>
            <Button variant="outline" onClick={backToList}>
              返回列表
            </Button>
            <Button
              variant="outline"
              type="submit"
              form="pending-requirement-form"
              disabled={!dirty || isPending}
            >
              {isPending && pendingAction === "save" ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              保存草稿
            </Button>
            <Button
              disabled={isPending}
              onClick={() => void form.handleSubmit(confirm)()}
            >
              {isPending && pendingAction === "confirm" ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              确认创建US
            </Button>
          </>
        }
      >
        <FormProvider {...form}>
          <form
            id="pending-requirement-form"
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(save)}
          >
            <UserStoryFields showStatus={false} />
          </form>
        </FormProvider>
      </FormPage>

      <ConfirmDialog
        open={deleteOpen}
        title="删除待评审需求"
        description="删除后不能恢复，AI 执行记录仍会保留。"
        confirmLabel="删除"
        destructive
        pending={isPending && pendingAction === "delete"}
        onOpenChange={setDeleteOpen}
        onConfirm={remove}
      />
    </>
  );
}
