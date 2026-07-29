"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import {
  createFeatureAction,
  updateFeatureAction,
} from "@/app/actions/requirements";
import { FormPage } from "@/components/layout/form-page";
import { PageSection } from "@/components/layout/page-section";
import { MarkdownField } from "@/components/markdown/markdown-field";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";
import {
  featureSchema,
  type FeatureValues,
} from "@/lib/requirements/feature-schema";

const emptyFeature: FeatureValues = {
  name: "",
  summary: "",
  backgroundGoal: "",
};

export function FeatureForm({
  featureId,
  code,
  initialValues,
}: {
  featureId?: string;
  code?: string;
  initialValues?: FeatureValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<FeatureValues>({
    resolver: zodResolver(featureSchema),
    defaultValues: initialValues ?? emptyFeature,
  });
  const dirty = form.formState.isDirty;
  useUnsavedChanges(dirty);

  function submit(values: FeatureValues) {
    startTransition(async () => {
      const result = featureId
        ? await updateFeatureAction(featureId, values)
        : await createFeatureAction(values);

      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      form.reset(values);
      toast.add({ type: "success", description: result.message });
      const targetId = featureId ?? result.data?.id;
      router.push(targetId ? `/features/${targetId}` : "/requirements");
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
      title={featureId ? "编辑 FE" : "新建 FE"}
      description={
        featureId
          ? "调整 FE 的组织信息和业务背景。"
          : "FE 是复杂需求的组织单元；保存后再从 FE 内创建 US。"
      }
      meta={code ? <span className="font-mono text-xs">{code}</span> : null}
      actions={
        <>
          <Button variant="outline" onClick={cancel}>
            取消
          </Button>
          <Button
            type="submit"
            form="feature-form"
            disabled={isPending || (Boolean(featureId) && !dirty)}
          >
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            保存
          </Button>
        </>
      }
    >
      <form
        id="feature-form"
        className="flex w-full flex-col gap-4"
        onSubmit={form.handleSubmit(submit)}
      >
        <PageSection title="基本信息">
          <FieldGroup className="grid grid-cols-[5fr_7fr] gap-5">
            <Field data-invalid={Boolean(form.formState.errors.name)}>
              <FieldLabel htmlFor="feature-name">FE 名称</FieldLabel>
              <Input
                id="feature-name"
                maxLength={150}
                placeholder="简洁描述这个复杂需求"
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register("name")}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.summary)}>
              <FieldLabel htmlFor="feature-summary">一句话描述</FieldLabel>
              <Input
                id="feature-summary"
                maxLength={300}
                placeholder="用一句话说明要解决的问题或交付的能力"
                aria-invalid={Boolean(form.formState.errors.summary)}
                {...form.register("summary")}
              />
              <FieldError errors={[form.formState.errors.summary]} />
            </Field>
          </FieldGroup>
        </PageSection>

        <PageSection
          title="业务背景与目标"
          description="说明为什么要做、解决什么业务问题，以及期望达到的结果。支持 Markdown。"
        >
          <Controller
            control={form.control}
            name="backgroundGoal"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel className="sr-only" htmlFor="background-goal">
                  业务背景与目标
                </FieldLabel>
                <MarkdownField
                  id="background-goal"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={fieldState.invalid}
                  rows={14}
                  placeholder={
                    "例如：\n- 当前业务问题\n- 目标用户和使用场景\n- 本次需求希望达到的结果"
                  }
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </PageSection>
      </form>
    </FormPage>
  );
}
