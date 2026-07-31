"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, SparklesIcon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";

import { createAiUserStoryExecutionAction } from "@/app/actions/execution-tasks";
import { FormPage } from "@/components/layout/form-page";
import { PageSection } from "@/components/layout/page-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";
import {
  aiUserStoryGeneratorFormSchema,
  type AiUserStoryGeneratorFormValues,
} from "@/lib/ai/execution-schema";

export function AiUserStoryGeneratorForm({
  feature,
}: {
  feature: { id: string; code: string; name: string } | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<AiUserStoryGeneratorFormValues>({
    resolver: zodResolver(aiUserStoryGeneratorFormSchema),
    defaultValues: { requirementText: "" },
  });
  const requirementText =
    useWatch({ control: form.control, name: "requirementText" }) ?? "";
  useUnsavedChanges(form.formState.isDirty);

  function submit(values: AiUserStoryGeneratorFormValues) {
    startTransition(async () => {
      const result = await createAiUserStoryExecutionAction({
        requirementText: values.requirementText,
        featureId: feature?.id ?? null,
      });
      if (!result.ok || !result.data) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      form.reset(values);
      toast.add({ type: "success", description: result.message });
      router.push(`/execution-tasks/${result.data.id}`);
    });
  }

  function cancel() {
    if (confirmLeaveIfDirty()) {
      router.back();
    }
  }

  return (
    <FormPage
      title="AI辅助生成US"
      description="输入需求后，系统会结合当前项目代码生成一份待评审的 US。"
      meta={
        feature ? (
          <>
            <Badge variant="outline">{feature.code}</Badge>
            <span>{feature.name}</span>
          </>
        ) : null
      }
      actions={
        <>
          <Button variant="outline" type="button" onClick={cancel}>
            <ArrowLeftIcon data-icon="inline-start" />
            返回
          </Button>
          <Button
            type="submit"
            form="ai-user-story-generator-form"
            disabled={isPending}
          >
            {isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SparklesIcon data-icon="inline-start" />
            )}
            开始生成
          </Button>
        </>
      }
    >
      <form
        id="ai-user-story-generator-form"
        onSubmit={form.handleSubmit(submit)}
      >
        <PageSection
          title="需求内容"
          description="描述要解决的问题、目标用户、期望结果和已知约束；信息不足时任务会明确失败。"
        >
          <FieldGroup>
            <Field
              data-invalid={Boolean(form.formState.errors.requirementText)}
            >
              <FieldLabel htmlFor="ai-requirement-text">需求内容</FieldLabel>
              <Textarea
                id="ai-requirement-text"
                className="min-h-80 resize-y"
                maxLength={10_000}
                placeholder="请输入需要整理为 US 的需求内容"
                aria-invalid={Boolean(form.formState.errors.requirementText)}
                {...form.register("requirementText")}
              />
              <div className="flex items-start justify-between gap-4">
                <FieldDescription>
                  尽量说明业务目标、使用场景、边界和约束。
                </FieldDescription>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {requirementText.length} / 10000
                </span>
              </div>
              <FieldError errors={[form.formState.errors.requirementText]} />
            </Field>
          </FieldGroup>
        </PageSection>
      </form>
    </FormPage>
  );
}
