"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, SparklesIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";

import { createAiTestCaseExecutionAction } from "@/app/actions/execution-tasks";
import { FormPage } from "@/components/layout/form-page";
import { PageSection } from "@/components/layout/page-section";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/components/ui/toast";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";
import {
  aiTestCaseGeneratorFormSchema,
  type AiTestCaseGeneratorFormValues,
} from "@/lib/ai/execution-schema";

type UserStoryOption = {
  id: string;
  code: string;
  title: string;
  featureName: string | null;
};

export function AiTestCaseGeneratorForm({
  userStories,
}: {
  userStories: UserStoryOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialSourceMode =
    userStories.length > 0 ? ("USER_STORY" as const) : ("TEXT" as const);
  const form = useForm<AiTestCaseGeneratorFormValues>({
    resolver: zodResolver(aiTestCaseGeneratorFormSchema),
    defaultValues: {
      sourceMode: initialSourceMode,
      userStoryId: null,
      requirementText: "",
    },
  });
  const sourceMode = useWatch({
    control: form.control,
    name: "sourceMode",
  });
  const requirementText =
    useWatch({ control: form.control, name: "requirementText" }) ?? "";
  const storyIds = userStories.map((story) => story.id);
  const storyLabels = new Map(
    userStories.map((story) => [
      story.id,
      `${story.code} · ${story.title}${
        story.featureName ? `（${story.featureName}）` : ""
      }`,
    ]),
  );
  useUnsavedChanges(form.formState.isDirty);

  function changeSourceMode(values: readonly unknown[]) {
    const nextMode = values.at(-1);
    if (nextMode !== "USER_STORY" && nextMode !== "TEXT") return;

    form.setValue("sourceMode", nextMode, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (nextMode === "USER_STORY") {
      form.setValue("requirementText", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      form.setValue("userStoryId", null, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }

  function submit(values: AiTestCaseGeneratorFormValues) {
    startTransition(async () => {
      const result = await createAiTestCaseExecutionAction(values);
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
      title="AI辅助生成测试用例"
      description="系统会结合需求和当前代码，生成一组需要人工评审的自然语言测试用例。"
      actions={
        <>
          <Button variant="outline" type="button" onClick={cancel}>
            <ArrowLeftIcon data-icon="inline-start" />
            返回
          </Button>
          <Button
            type="submit"
            form="ai-test-case-generator-form"
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
        id="ai-test-case-generator-form"
        onSubmit={form.handleSubmit(submit)}
      >
        <PageSection title="生成来源">
          <FieldGroup>
            <Field>
              <FieldLabel>选择生成来源</FieldLabel>
              <ToggleGroup
                variant="outline"
                value={[sourceMode]}
                onValueChange={changeSourceMode}
              >
                <ToggleGroupItem
                  value="USER_STORY"
                  disabled={userStories.length === 0}
                >
                  选择已有US
                </ToggleGroupItem>
                <ToggleGroupItem value="TEXT">输入需求内容</ToggleGroupItem>
              </ToggleGroup>
            </Field>

            {sourceMode === "USER_STORY" ? (
              <Controller
                control={form.control}
                name="userStoryId"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="ai-test-case-user-story">
                      选择 US
                    </FieldLabel>
                    <Combobox
                      autoHighlight
                      items={storyIds}
                      value={field.value}
                      itemToStringLabel={(storyId: string) =>
                        storyLabels.get(storyId) ?? storyId
                      }
                      onValueChange={(value) => field.onChange(value ?? null)}
                    >
                      <ComboboxInput
                        id="ai-test-case-user-story"
                        placeholder="搜索编号或标题"
                        aria-invalid={fieldState.invalid}
                      />
                      <ComboboxContent>
                        <ComboboxEmpty>没有匹配的 US</ComboboxEmpty>
                        <ComboboxList>
                          {(storyId: string) => (
                            <ComboboxItem key={storyId} value={storyId}>
                              {storyLabels.get(storyId)}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            ) : (
              <Field
                data-invalid={Boolean(form.formState.errors.requirementText)}
              >
                <FieldLabel htmlFor="ai-test-case-requirement-text">
                  需求内容
                </FieldLabel>
                <Textarea
                  id="ai-test-case-requirement-text"
                  className="min-h-72 resize-y"
                  maxLength={10_000}
                  placeholder="描述需要验证的业务行为、角色、输入、结果和重要约束"
                  aria-invalid={Boolean(form.formState.errors.requirementText)}
                  {...form.register("requirementText")}
                />
                <div className="flex items-start justify-between gap-4">
                  <FieldDescription>
                    信息不足或无法从代码中确认相关行为时，任务会明确失败。
                  </FieldDescription>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {requirementText.length} / 10000
                  </span>
                </div>
                <FieldError errors={[form.formState.errors.requirementText]} />
              </Field>
            )}
          </FieldGroup>
        </PageSection>
      </form>
    </FormPage>
  );
}
