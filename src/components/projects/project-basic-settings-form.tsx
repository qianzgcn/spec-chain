"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { SaveIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { updateProjectBasicSettingsAction } from "@/app/actions/projects";
import { FormPage } from "@/components/layout/form-page";
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
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  projectBasicSettingsFormSchema,
  type ProjectBasicSettingsValues,
} from "@/lib/projects/schema";

export function ProjectBasicSettingsForm({
  project,
}: {
  project: ProjectBasicSettingsValues & { id: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<ProjectBasicSettingsValues>({
    resolver: zodResolver(projectBasicSettingsFormSchema),
    defaultValues: {
      name: project.name,
      description: project.description,
    },
  });
  const dirty = form.formState.isDirty;
  useUnsavedChanges(dirty);

  function submit(values: ProjectBasicSettingsValues) {
    startTransition(async () => {
      const result = await updateProjectBasicSettingsAction({
        ...values,
        projectId: project.id,
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
    <FormPage
      title="基础设置"
      description="维护当前项目的名称和业务说明。"
      actions={
        <Button
          type="submit"
          form="project-basic-settings-form"
          disabled={!dirty || isPending}
        >
          {isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          保存
        </Button>
      }
    >
      <form
        id="project-basic-settings-form"
        onSubmit={form.handleSubmit(submit)}
      >
        <PageSection
          title="项目信息"
          description="项目名称会显示在顶部项目切换器中。"
        >
          <FieldGroup className="max-w-4xl">
            <Field data-invalid={Boolean(form.formState.errors.name)}>
              <FieldLabel htmlFor="project-name">项目名称</FieldLabel>
              <Input
                id="project-name"
                maxLength={100}
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register("name")}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.description)}>
              <FieldLabel htmlFor="project-description">项目描述</FieldLabel>
              <Textarea
                id="project-description"
                rows={5}
                maxLength={1_000}
                placeholder="说明项目范围、目标或主要业务"
                aria-invalid={Boolean(form.formState.errors.description)}
                {...form.register("description")}
              />
              <FieldError errors={[form.formState.errors.description]} />
            </Field>
          </FieldGroup>
        </PageSection>
      </form>
    </FormPage>
  );
}
