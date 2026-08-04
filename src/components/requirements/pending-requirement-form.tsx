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
import { PageSection } from "@/components/layout/page-section";
import { UserStoryFields } from "@/components/requirements/user-story-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { DraftOperation } from "@/generated/prisma/enums";
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
  operation,
  baseVersion,
  changeReason,
  currentValues,
  feature,
  initialValues,
}: {
  draftId: string;
  operation: DraftOperation;
  baseVersion: number | null;
  changeReason: string | null;
  currentValues: {
    title: string;
    asA: string;
    iWant: string;
    soThat: string;
    businessRules: string | null;
    nonFunctionalRequirements: string | null;
    acceptanceCriteria: Array<{ given: string; when: string; then: string }>;
  } | null;
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
        description={
          operation === DraftOperation.UPDATE
            ? "比较当前版本与建议版本，确认后更新原 US。"
            : "检查并完善 AI 生成的内容；确认后才会创建正式 US。"
        }
        meta={
          <>
            <Badge variant="secondary">AI 生成</Badge>
            <Badge
              variant={
                operation === DraftOperation.UPDATE ? "info" : "secondary"
              }
            >
              {operation === DraftOperation.UPDATE ? "代码更新" : "新建"}
            </Badge>
            <Badge variant="warning">待评审</Badge>
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
              {operation === DraftOperation.UPDATE
                ? "确认更新US"
                : "确认创建US"}
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
            {operation === DraftOperation.UPDATE && currentValues ? (
              <PageSection title={`当前版本 v${baseVersion ?? 1}`}>
                <div className="grid gap-4 text-sm md:grid-cols-3">
                  <div>
                    <div className="text-muted-foreground text-xs">As</div>
                    <p className="mt-1 whitespace-pre-wrap">
                      {currentValues.asA}
                    </p>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">I want</div>
                    <p className="mt-1 whitespace-pre-wrap">
                      {currentValues.iWant}
                    </p>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">so that</div>
                    <p className="mt-1 whitespace-pre-wrap">
                      {currentValues.soThat}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                  <div className="bg-muted/40 rounded-lg p-4">
                    <div className="text-muted-foreground text-xs">
                      业务规则
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">
                      {currentValues.businessRules ?? "无"}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-4">
                    <div className="text-muted-foreground text-xs">
                      非功能需求
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">
                      {currentValues.nonFunctionalRequirements ?? "无"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <div className="text-muted-foreground text-xs">验收标准</div>
                  {currentValues.acceptanceCriteria.map((criterion, index) => (
                    <p
                      key={`${index}-${criterion.given}-${criterion.when}-${criterion.then}`}
                      className="bg-muted/40 rounded-lg p-3 text-sm whitespace-pre-wrap"
                    >
                      {index + 1}. Given {criterion.given}；When{" "}
                      {criterion.when}； Then {criterion.then}
                    </p>
                  ))}
                </div>
                <div className="bg-muted/40 mt-4 rounded-lg p-4 text-sm">
                  <div className="text-muted-foreground text-xs">变更依据</div>
                  <p className="mt-1 whitespace-pre-wrap">
                    {changeReason ?? "—"}
                  </p>
                </div>
              </PageSection>
            ) : null}
            <UserStoryFields
              showStatus={false}
              lockTitle={operation === DraftOperation.UPDATE}
            />
          </form>
        </FormProvider>
      </FormPage>

      <ConfirmDialog
        open={deleteOpen}
        title="删除待评审需求"
        description="删除后不能恢复，执行任务仍会保留。"
        confirmLabel="删除"
        destructive
        pending={isPending && pendingAction === "delete"}
        onOpenChange={setDeleteOpen}
        onConfirm={remove}
      />
    </>
  );
}
