"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { SparklesIcon } from "lucide-react";
import Link from "next/link";
import { FormProvider, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import {
  createUserStoryAction,
  updateUserStoryAction,
} from "@/app/actions/requirements";
import { FormPage } from "@/components/layout/form-page";
import { UserStoryFields } from "@/components/requirements/user-story-fields";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequirementStatus } from "@/generated/prisma/enums";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";
import {
  userStoryFormSchema,
  type UserStoryFormValues,
} from "@/lib/requirements/user-story-schema";

export type { UserStoryFormValues };

type UserStoryFormProps = {
  userStoryId?: string;
  code?: string;
  feature?: {
    id: string;
    code: string;
    name: string;
  } | null;
  initialValues?: UserStoryFormValues;
};

const emptyUserStory: UserStoryFormValues = {
  title: "",
  asA: "",
  iWant: "",
  soThat: "",
  status: RequirementStatus.DESIGN,
  acceptanceCriteria: [{ given: "", when: "", then: "" }],
  businessRules: "",
  nonFunctionalRequirements: "",
};

export function UserStoryForm({
  userStoryId,
  code,
  feature,
  initialValues,
}: UserStoryFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<UserStoryFormValues>({
    resolver: zodResolver(userStoryFormSchema),
    defaultValues: initialValues ?? emptyUserStory,
  });
  const dirty = form.formState.isDirty;
  useUnsavedChanges(dirty);

  const editing = Boolean(userStoryId);
  const formId = editing ? "edit-user-story-form" : "new-user-story-form";

  function submit(values: UserStoryFormValues) {
    startTransition(async () => {
      const result = userStoryId
        ? await updateUserStoryAction(userStoryId, values)
        : await createUserStoryAction({
            ...values,
            featureId: feature?.id ?? null,
          });
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      form.reset(values);
      toast.add({ type: "success", description: result.message });
      const targetId = userStoryId ?? result.data?.id;
      router.push(targetId ? `/user-stories/${targetId}` : "/requirements");
      router.refresh();
    });
  }

  function cancel() {
    if (confirmLeaveIfDirty()) {
      router.back();
    }
  }

  return (
    <FormPage
      title={editing ? "编辑 US" : "新建US"}
      description={
        editing
          ? "调整用户故事、验收标准和实现约束。"
          : "编写边界清楚、可开发、可验证的用户故事。"
      }
      meta={
        editing && code ? (
          <span className="font-mono text-xs">{code}</span>
        ) : feature ? (
          <>
            <span className="font-mono text-xs">{feature.code}</span>
            <span>{feature.name}</span>
          </>
        ) : null
      }
      actions={
        <>
          {!editing ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={
                    feature
                      ? `/user-stories/ai-generate?featureId=${feature.id}`
                      : "/user-stories/ai-generate"
                  }
                />
              }
            >
              <SparklesIcon data-icon="inline-start" />
              AI辅助生成US
            </Button>
          ) : null}
          <Button variant="outline" onClick={cancel}>
            取消
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isPending || (editing && !dirty)}
          >
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            保存
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form
          id={formId}
          className="flex w-full flex-col gap-4"
          onSubmit={form.handleSubmit(submit)}
        >
          <UserStoryFields showStatus />
        </form>
      </FormProvider>
    </FormPage>
  );
}
