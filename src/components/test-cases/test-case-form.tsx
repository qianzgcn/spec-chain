"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import {
  createTestCaseAction,
  updateTestCaseAction,
} from "@/app/actions/test-cases";
import { FormPage } from "@/components/layout/form-page";
import { PageSection } from "@/components/layout/page-section";
import type { ScriptEditorProps } from "@/components/test-cases/script-editor";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { TestPriority } from "@/generated/prisma/enums";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";
import { TEST_PRIORITY_META } from "@/lib/test-cases/meta";
import {
  testCaseSchema,
  type TestCaseFormValues,
} from "@/lib/test-cases/schema";

const ScriptEditor = dynamic<ScriptEditorProps>(
  () =>
    import("@/components/test-cases/script-editor").then(
      (module) => module.ScriptEditor,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[420px] w-full" />,
  },
);

export type { TestCaseFormValues };

type TestCaseFormProps = {
  testCaseId?: string;
  expectedUpdatedAt?: string;
  code?: string;
  groups: Array<{ id: string; name: string }>;
  userStories: Array<{
    id: string;
    code: string;
    title: string;
    featureName: string | null;
    deleted?: boolean;
  }>;
  initialValues?: TestCaseFormValues;
};

const PRIORITY_OPTIONS = Object.values(TestPriority).map((priority) => ({
  value: priority,
  label: `${priority} · ${TEST_PRIORITY_META[priority].description}`,
}));

export function TestCaseForm({
  testCaseId,
  expectedUpdatedAt,
  code,
  groups,
  userStories,
  initialValues,
}: TestCaseFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<TestCaseFormValues>({
    resolver: zodResolver(testCaseSchema),
    defaultValues: initialValues ?? {
      name: "",
      groupId: groups[0]?.id ?? "",
      priority: TestPriority.P2,
      preconditions: "",
      enabled: true,
      script: "",
      steps: "",
      userStoryId: null,
    },
  });
  const dirty = form.formState.isDirty;
  useUnsavedChanges(dirty);

  const groupIds = groups.map((group) => group.id);
  const groupLabels = new Map(groups.map((group) => [group.id, group.name]));
  const storyIds = userStories.map((story) => story.id);
  const storyLabels = new Map(
    userStories.map((story) => [
      story.id,
      `${story.code} · ${story.title}${
        story.featureName ? `（${story.featureName}）` : ""
      }${story.deleted ? "（已删除）" : ""}`,
    ]),
  );
  const deletedStoryIds = new Set(
    userStories.filter((story) => story.deleted).map((story) => story.id),
  );

  function submit(values: TestCaseFormValues) {
    startTransition(async () => {
      const result = testCaseId
        ? await updateTestCaseAction(
            testCaseId,
            values,
            expectedUpdatedAt ?? "",
          )
        : await createTestCaseAction(values);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      form.reset(values);
      toast.add({ type: "success", description: result.message });
      const targetId = testCaseId ?? result.data?.id;
      router.push(targetId ? `/test-cases/${targetId}` : "/test-cases");
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
      title={testCaseId ? "编辑测试用例" : "新建测试用例"}
      description={
        testCaseId
          ? "调整自然语言步骤、需求关联和自动化脚本。"
          : "使用自然语言描述验证过程，需要时再补充自动化脚本。"
      }
      meta={code ? <span className="font-mono text-xs">{code}</span> : null}
      titleAccessory={
        <Controller
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <Field className="w-auto gap-2" orientation="horizontal">
              <FieldLabel
                className="text-muted-foreground font-normal"
                htmlFor="test-case-enabled"
              >
                启用
              </FieldLabel>
              <Switch
                id="test-case-enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label="启用测试用例"
              />
            </Field>
          )}
        />
      }
      actions={
        <>
          <Button variant="outline" onClick={cancel}>
            取消
          </Button>
          <Button
            type="submit"
            form="test-case-form"
            disabled={isPending || (Boolean(testCaseId) && !dirty)}
          >
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            保存
          </Button>
        </>
      }
    >
      <form
        id="test-case-form"
        className="flex w-full flex-col gap-4"
        onSubmit={form.handleSubmit(submit)}
      >
        <PageSection title="基本信息">
          <FieldGroup className="grid grid-cols-12 gap-5">
            <Field
              className="col-span-6"
              data-invalid={Boolean(form.formState.errors.name)}
            >
              <FieldLabel htmlFor="test-case-name">用例名称</FieldLabel>
              <Input
                id="test-case-name"
                maxLength={200}
                placeholder="描述这个用例要验证的业务场景"
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register("name")}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <Controller
              control={form.control}
              name="groupId"
              render={({ field, fieldState }) => (
                <Field className="col-span-3" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="test-case-group">分组</FieldLabel>
                  <Combobox
                    items={groupIds}
                    value={field.value || null}
                    itemToStringLabel={(groupId: string) =>
                      groupLabels.get(groupId) ?? groupId
                    }
                    onValueChange={(value) => field.onChange(value ?? "")}
                  >
                    <ComboboxInput
                      id="test-case-group"
                      placeholder="搜索分组"
                      aria-invalid={fieldState.invalid}
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>没有匹配的分组</ComboboxEmpty>
                      <ComboboxList>
                        {(groupId: string) => (
                          <ComboboxItem key={groupId} value={groupId}>
                            {groupLabels.get(groupId)}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="priority"
              render={({ field, fieldState }) => (
                <Field className="col-span-3" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="test-case-priority">优先级</FieldLabel>
                  <Select
                    items={PRIORITY_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id="test-case-priority"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {PRIORITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="userStoryId"
              render={({ field, fieldState }) => (
                <Field
                  className="col-span-12"
                  data-invalid={fieldState.invalid}
                >
                  <FieldLabel htmlFor="test-case-user-story">
                    关联 US（可选）
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
                      id="test-case-user-story"
                      placeholder="搜索并选择 US"
                      showClear
                      aria-invalid={fieldState.invalid}
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>没有匹配的 US</ComboboxEmpty>
                      <ComboboxList>
                        {(storyId: string) => (
                          <ComboboxItem
                            key={storyId}
                            value={storyId}
                            disabled={deletedStoryIds.has(storyId)}
                          >
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
          </FieldGroup>
        </PageSection>

        <PageSection title="用例内容">
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.preconditions)}>
              <FieldLabel htmlFor="test-case-preconditions">
                前置条件（可选）
              </FieldLabel>
              <Textarea
                id="test-case-preconditions"
                rows={5}
                maxLength={100_000}
                aria-invalid={Boolean(form.formState.errors.preconditions)}
                {...form.register("preconditions")}
              />
              <FieldError errors={[form.formState.errors.preconditions]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.steps)}>
              <FieldLabel htmlFor="test-case-steps">测试步骤</FieldLabel>
              <Textarea
                id="test-case-steps"
                rows={10}
                maxLength={100_000}
                placeholder={
                  "1. 打开 SpecChain 登录页\n2. 输入用户名 admin 和错误密码 wrong-password\n3. 点击登录，显示“用户名或密码错误”，并停留在登录页。"
                }
                aria-invalid={Boolean(form.formState.errors.steps)}
                {...form.register("steps")}
              />
              <FieldError errors={[form.formState.errors.steps]} />
            </Field>
          </FieldGroup>
        </PageSection>

        <PageSection title="自动化脚本（可选）">
          <Controller
            control={form.control}
            name="script"
            render={({ field }) => (
              <ScriptEditor value={field.value} onChange={field.onChange} />
            )}
          />
        </PageSection>
      </form>
    </FormPage>
  );
}
