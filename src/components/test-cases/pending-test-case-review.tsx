"use client";

import { useTransition } from "react";

import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { updatePendingTestCaseDraftContentAction } from "@/app/actions/pending-test-cases";
import { PageSection } from "@/components/layout/page-section";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { DraftOperation } from "@/generated/prisma/enums";
import type { TestPriority } from "@/generated/prisma/enums";

type ReviewValues = {
  name: string;
  preconditions: string;
  steps: string;
};

type CaseContent = {
  name: string;
  priority: TestPriority;
  groupName: string;
  userStoryLabel: string;
  preconditions: string | null;
  steps: string;
};

function ReadonlyContent({ content }: { content: CaseContent }) {
  return (
    <div className="grid gap-4">
      <div>
        <div className="text-muted-foreground text-xs">名称</div>
        <p className="mt-1 text-sm font-medium">{content.name}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-muted-foreground text-xs">分组</div>
          <p className="mt-1 text-sm">{content.groupName}</p>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">优先级</div>
          <p className="mt-1 text-sm">{content.priority}</p>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">类型 / 关联 US</div>
          <p className="mt-1 text-sm">{content.userStoryLabel}</p>
        </div>
      </div>
      <div className="bg-muted/40 rounded-lg p-4">
        <div className="text-muted-foreground text-xs">前置条件</div>
        <p className="mt-1 text-sm leading-6 whitespace-pre-wrap">
          {content.preconditions?.trim() || "无"}
        </p>
      </div>
      <div className="bg-muted/40 rounded-lg p-4">
        <div className="text-muted-foreground text-xs">测试步骤</div>
        <p className="mt-1 text-sm leading-6 whitespace-pre-wrap">
          {content.steps}
        </p>
      </div>
    </div>
  );
}

export function PendingTestCaseReview({
  draftId,
  operation,
  baseVersion,
  changeReason,
  current,
  proposed,
}: {
  draftId: string;
  operation: DraftOperation;
  baseVersion: number | null;
  changeReason: string | null;
  current: CaseContent | null;
  proposed: CaseContent;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<ReviewValues>({
    defaultValues: {
      name: proposed.name,
      preconditions: proposed.preconditions ?? "",
      steps: proposed.steps,
    },
  });

  function save(values: ReviewValues) {
    startTransition(async () => {
      const result = await updatePendingTestCaseDraftContentAction({
        draftId,
        ...values,
      });
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      form.reset(values);
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  return (
    <>
      {current ? (
        <PageSection title={`当前版本 v${baseVersion ?? 1}`}>
          <ReadonlyContent content={current} />
        </PageSection>
      ) : null}

      <PageSection
        title={operation === DraftOperation.RETIRE ? "停用依据" : "建议版本"}
      >
        {operation === DraftOperation.RETIRE ? (
          <p className="text-sm leading-6 whitespace-pre-wrap">
            {changeReason ?? "—"}
          </p>
        ) : (
          <form
            className="flex flex-col gap-5"
            onSubmit={form.handleSubmit(save)}
          >
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.name)}>
                <FieldLabel htmlFor="draft-test-case-name">用例名称</FieldLabel>
                <Input
                  id="draft-test-case-name"
                  maxLength={200}
                  aria-invalid={Boolean(form.formState.errors.name)}
                  {...form.register("name", { required: "请输入用例名称" })}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="draft-test-case-preconditions">
                  前置条件
                </FieldLabel>
                <Textarea
                  id="draft-test-case-preconditions"
                  rows={6}
                  {...form.register("preconditions")}
                />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.steps)}>
                <FieldLabel htmlFor="draft-test-case-steps">
                  测试步骤
                </FieldLabel>
                <Textarea
                  id="draft-test-case-steps"
                  rows={10}
                  aria-invalid={Boolean(form.formState.errors.steps)}
                  {...form.register("steps", { required: "测试步骤不能为空" })}
                />
                <FieldError errors={[form.formState.errors.steps]} />
              </Field>
            </FieldGroup>
            <div className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {changeReason ?? ""}
              </p>
              <Button
                type="submit"
                variant="outline"
                disabled={!form.formState.isDirty || isPending}
              >
                {isPending ? <Spinner data-icon="inline-start" /> : null}
                保存建议
              </Button>
            </div>
          </form>
        )}
      </PageSection>
    </>
  );
}
