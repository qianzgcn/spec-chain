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

export function PendingTestCaseReview({
  draftId,
  proposed,
}: {
  draftId: string;
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
    <PageSection title="用例内容">
      <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(save)}>
        <div className="bg-muted/40 grid gap-4 rounded-lg p-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground text-xs">分组</div>
            <p className="mt-1">{proposed.groupName}</p>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">优先级</div>
            <p className="mt-1">{proposed.priority}</p>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">需求归属</div>
            <p className="mt-1">{proposed.userStoryLabel}</p>
          </div>
        </div>
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
            <FieldLabel htmlFor="draft-test-case-steps">测试步骤</FieldLabel>
            <Textarea
              id="draft-test-case-steps"
              rows={10}
              aria-invalid={Boolean(form.formState.errors.steps)}
              {...form.register("steps", { required: "测试步骤不能为空" })}
            />
            <FieldError errors={[form.formState.errors.steps]} />
          </Field>
        </FieldGroup>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="outline"
            disabled={!form.formState.isDirty || isPending}
          >
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            保存修改
          </Button>
        </div>
      </form>
    </PageSection>
  );
}
