"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";

import { updateProjectTestingSettingsAction } from "@/app/actions/projects";
import { FormPage } from "@/components/layout/form-page";
import { PageSection } from "@/components/layout/page-section";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { VariableKind } from "@/generated/prisma/enums";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  projectTestingSettingsFormSchema,
  type ProjectTestingSettingsFormValues,
} from "@/lib/projects/schema";

const VARIABLE_KIND_OPTIONS = [
  { label: "普通变量", value: VariableKind.PLAIN },
  { label: "敏感变量", value: VariableKind.SECRET },
];

const emptyVariable = {
  name: "",
  value: "",
  description: "",
  kind: VariableKind.PLAIN,
};

export function ProjectTestingSettingsForm({
  project,
}: {
  project: {
    id: string;
    baseUrl: string;
    variables: ProjectTestingSettingsFormValues["variables"];
  };
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<ProjectTestingSettingsFormValues>({
    resolver: zodResolver(projectTestingSettingsFormSchema),
    defaultValues: {
      baseUrl: project.baseUrl,
      variables: project.variables,
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "variables",
    keyName: "fieldKey",
  });
  const dirty = form.formState.isDirty;
  const variableValues = useWatch({
    control: form.control,
    name: "variables",
  });
  useUnsavedChanges(dirty);

  function submit(values: ProjectTestingSettingsFormValues) {
    startTransition(async () => {
      const result = await updateProjectTestingSettingsAction({
        ...values,
        projectId: project.id,
      });

      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      if (result.data) {
        form.reset(result.data);
      }
      toast.add({ type: "success", description: result.message });
    });
  }

  return (
    <FormPage
      title="测试设置"
      description="配置自动化测试访问地址和运行环境变量。"
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
      <form
        id="project-testing-settings-form"
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(submit)}
      >
        <PageSection
          title="测试环境"
          description="自动化运行会使用此地址访问被测系统。"
        >
          <FieldGroup className="max-w-3xl">
            <Field data-invalid={Boolean(form.formState.errors.baseUrl)}>
              <FieldLabel htmlFor="project-base-url">Base URL</FieldLabel>
              <Input
                id="project-base-url"
                type="url"
                placeholder="https://example.com"
                aria-invalid={Boolean(form.formState.errors.baseUrl)}
                {...form.register("baseUrl")}
              />
              <FieldError errors={[form.formState.errors.baseUrl]} />
            </Field>
          </FieldGroup>
        </PageSection>

        <PageSection
          title="环境变量"
          description="敏感值会加密保存；已有敏感变量留空表示保留原值。"
          actions={
            fields.length ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append(emptyVariable)}
              >
                <PlusIcon data-icon="inline-start" />
                添加变量
              </Button>
            ) : null
          }
        >
          {fields.length ? (
            <div className="flex flex-col gap-2">
              <div
                className="text-muted-foreground grid grid-cols-[minmax(170px,1.25fr)_140px_minmax(190px,1.5fr)_minmax(180px,1fr)_32px] gap-3 px-1 text-xs font-medium"
                aria-hidden
              >
                <span>变量名</span>
                <span>类型</span>
                <span>值</span>
                <span>描述</span>
                <span />
              </div>
              {fields.map((field, index) => {
                const kind = variableValues[index]?.kind ?? VariableKind.PLAIN;
                const existing = Boolean(field.id);

                return (
                  <div
                    key={field.fieldKey}
                    className="bg-muted/40 grid grid-cols-[minmax(170px,1.25fr)_140px_minmax(190px,1.5fr)_minmax(180px,1fr)_32px] items-start gap-3 rounded-lg p-3"
                  >
                    <input
                      type="hidden"
                      {...form.register(`variables.${index}.id`)}
                    />
                    <Field
                      data-invalid={Boolean(
                        form.formState.errors.variables?.[index]?.name,
                      )}
                    >
                      <FieldLabel
                        className="sr-only"
                        htmlFor={`variable-${index}-name`}
                      >
                        变量名
                      </FieldLabel>
                      <Input
                        id={`variable-${index}-name`}
                        placeholder="API_TOKEN"
                        aria-invalid={Boolean(
                          form.formState.errors.variables?.[index]?.name,
                        )}
                        {...form.register(`variables.${index}.name`)}
                      />
                      <FieldError
                        errors={[
                          form.formState.errors.variables?.[index]?.name,
                        ]}
                      />
                    </Field>
                    <Controller
                      control={form.control}
                      name={`variables.${index}.kind`}
                      render={({ field: kindField, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel
                            className="sr-only"
                            htmlFor={`variable-${index}-kind`}
                          >
                            类型
                          </FieldLabel>
                          <Select
                            items={VARIABLE_KIND_OPTIONS}
                            value={kindField.value}
                            onValueChange={kindField.onChange}
                          >
                            <SelectTrigger
                              id={`variable-${index}-kind`}
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {VARIABLE_KIND_OPTIONS.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
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
                    <Field
                      data-invalid={Boolean(
                        form.formState.errors.variables?.[index]?.value,
                      )}
                    >
                      <FieldLabel
                        className="sr-only"
                        htmlFor={`variable-${index}-value`}
                      >
                        值
                      </FieldLabel>
                      <Input
                        id={`variable-${index}-value`}
                        type={
                          kind === VariableKind.SECRET ? "password" : "text"
                        }
                        autoComplete={
                          kind === VariableKind.SECRET ? "new-password" : "off"
                        }
                        placeholder={
                          kind === VariableKind.SECRET && existing
                            ? "••••••••"
                            : "请输入变量值"
                        }
                        aria-invalid={Boolean(
                          form.formState.errors.variables?.[index]?.value,
                        )}
                        {...form.register(`variables.${index}.value`)}
                      />
                      <FieldError
                        errors={[
                          form.formState.errors.variables?.[index]?.value,
                        ]}
                      />
                    </Field>
                    <Field
                      data-invalid={Boolean(
                        form.formState.errors.variables?.[index]?.description,
                      )}
                    >
                      <FieldLabel
                        className="sr-only"
                        htmlFor={`variable-${index}-description`}
                      >
                        描述
                      </FieldLabel>
                      <Input
                        id={`variable-${index}-description`}
                        maxLength={500}
                        placeholder="说明变量用途"
                        aria-invalid={Boolean(
                          form.formState.errors.variables?.[index]?.description,
                        )}
                        {...form.register(`variables.${index}.description`)}
                      />
                      <FieldError
                        errors={[
                          form.formState.errors.variables?.[index]?.description,
                        ]}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除第 ${index + 1} 个变量`}
                      onClick={() => remove(index)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>尚未配置项目变量</EmptyTitle>
                <EmptyDescription>
                  按需添加普通变量或加密保存的敏感变量。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => append(emptyVariable)}
                >
                  <PlusIcon data-icon="inline-start" />
                  添加变量
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </PageSection>
      </form>
    </FormPage>
  );
}
