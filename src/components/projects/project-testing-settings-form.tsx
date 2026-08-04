"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { SaveIcon } from "lucide-react";
import { FormProvider, useForm } from "react-hook-form";

import { updateProjectTestingSettingsAction } from "@/app/actions/projects";
import { FormPage } from "@/components/layout/form-page";
import { PageSection } from "@/components/layout/page-section";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { AutomationInstructionsSection } from "@/components/projects/testing-settings/automation-instructions-section";
import { LoginMethodSection } from "@/components/projects/testing-settings/login-method-section";
import { ProjectVariablesSection } from "@/components/projects/testing-settings/project-variables-section";
import { TestingEnvironmentSection } from "@/components/projects/testing-settings/testing-environment-section";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  projectTestingSettingsFormSchema,
  type ProjectTestingSettingsFormValues,
} from "@/lib/projects/schema";

export function ProjectTestingSettingsForm({
  project,
}: {
  project: ProjectTestingSettingsFormValues & { id: string };
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<ProjectTestingSettingsFormValues>({
    resolver: zodResolver(projectTestingSettingsFormSchema),
    defaultValues: {
      baseUrl: project.baseUrl,
      automationInstructions: project.automationInstructions,
      loginMethodSource: project.loginMethodSource,
      variables: project.variables,
    },
  });
  const dirty = form.formState.isDirty;
  useUnsavedChanges(dirty);

  function submit(values: ProjectTestingSettingsFormValues) {
    startTransition(async () => {
      const result = await updateProjectTestingSettingsAction({
        ...values,
        projectId: project.id,
        variables: values.variables.map((variable) => {
          if (variable.kind === "OBJECT") {
            return {
              id: variable.id,
              name: variable.name,
              description: variable.description,
              kind: variable.kind,
              fields: variable.fields.map((field) => ({
                id: field.id,
                name: field.name,
                value: field.value,
                description: field.description,
                kind: field.kind,
                encrypted: field.encrypted,
              })),
            };
          }
          return {
            id: variable.id,
            name: variable.name,
            value: variable.value,
            description: variable.description,
            kind: variable.kind,
            encrypted: variable.encrypted,
          };
        }),
      });

      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      if (result.data) form.reset(result.data);
      toast.add({ type: "success", description: result.message });
    });
  }

  return (
    <FormPage
      title="测试设置"
      description="配置测试环境、项目变量和自动化复用能力。"
      actions={
        <Button
          type="submit"
          form="project-testing-settings-form"
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
      <FormProvider {...form}>
        <form
          id="project-testing-settings-form"
          onSubmit={form.handleSubmit(submit)}
          aria-busy={isPending}
          inert={isPending}
        >
          <PageSection className="gap-0 py-0" contentClassName="p-0">
            <TestingEnvironmentSection />
            <Separator />
            <ProjectVariablesSection />
            <Separator />
            <LoginMethodSection />
            <Separator />
            <AutomationInstructionsSection />
          </PageSection>
        </form>
      </FormProvider>
    </FormPage>
  );
}
