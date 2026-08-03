"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import { updateProjectAuthenticationAction } from "@/app/actions/projects";
import type { TypeScriptEditorProps } from "@/components/editors/typescript-editor";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { LOGIN_METHOD_TEMPLATE } from "@/lib/automation/login-contract";
import {
  projectAuthenticationFormSchema,
  type ProjectAuthenticationFormValues,
} from "@/lib/projects/schema";

const TypeScriptEditor = dynamic<TypeScriptEditorProps>(
  () =>
    import("@/components/editors/typescript-editor").then(
      (module) => module.TypeScriptEditor,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[360px] w-full" />,
  },
);

type VariableOption = {
  id: string;
  name: string;
  kind: "PLAIN" | "SECRET";
};

export function ProjectAuthenticationForm({
  project,
  variables,
}: {
  project: {
    id: string;
    loginMethodSource: string;
    profiles: ProjectAuthenticationFormValues["profiles"];
  };
  variables: VariableOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<ProjectAuthenticationFormValues>({
    resolver: zodResolver(projectAuthenticationFormSchema),
    defaultValues: {
      loginMethodSource: project.loginMethodSource,
      profiles: project.profiles,
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "profiles",
    keyName: "fieldKey",
  });
  const dirty = form.formState.isDirty;
  useUnsavedChanges(dirty);

  const variableItems = variables.map((variable) => ({
    value: variable.id,
    label: variable.name,
  }));
  const passwordVariableItems = variables
    .filter((variable) => variable.kind === "SECRET")
    .map((variable) => ({ value: variable.id, label: variable.name }));

  function addProfile() {
    append({
      name: "",
      usernameVariableId: variableItems[0]?.value ?? "",
      passwordVariableId: passwordVariableItems[0]?.value ?? "",
    });
  }

  function submit(values: ProjectAuthenticationFormValues) {
    startTransition(async () => {
      const result = await updateProjectAuthenticationAction({
        ...values,
        projectId: project.id,
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
      title="登录配置"
      description="维护项目统一的页面登录方法和可复用登录身份。"
      actions={
        <Button
          type="submit"
          form="project-authentication-form"
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
        id="project-authentication-form"
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(submit)}
      >
        <PageSection
          title="登录方法"
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                form.setValue("loginMethodSource", LOGIN_METHOD_TEMPLATE, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              载入示例
            </Button>
          }
        >
          <Controller
            control={form.control}
            name="loginMethodSource"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel className="sr-only">登录方法源码</FieldLabel>
                <TypeScriptEditor
                  value={field.value}
                  height="360px"
                  placeholder={LOGIN_METHOD_TEMPLATE}
                  ariaLabel="登录方法源码"
                  onChange={field.onChange}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </PageSection>

        <PageSection
          title="登录身份"
          actions={
            fields.length ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  variableItems.length === 0 ||
                  passwordVariableItems.length === 0
                }
                onClick={addProfile}
              >
                <PlusIcon data-icon="inline-start" />
                添加身份
              </Button>
            ) : null
          }
        >
          {fields.length ? (
            <FieldGroup>
              <div
                className="text-muted-foreground grid grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_32px] gap-3 px-1 text-xs font-medium"
                aria-hidden
              >
                <span>身份名称</span>
                <span>用户名变量</span>
                <span>密码变量</span>
                <span />
              </div>
              {fields.map((profile, index) => (
                <div
                  key={profile.fieldKey}
                  data-testid="login-profile-row"
                  className="bg-muted/40 grid grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_32px] items-start gap-3 rounded-lg p-3"
                >
                  <input
                    type="hidden"
                    {...form.register(`profiles.${index}.id`)}
                  />
                  <Field
                    data-invalid={Boolean(
                      form.formState.errors.profiles?.[index]?.name,
                    )}
                  >
                    <FieldLabel
                      className="sr-only"
                      htmlFor={`login-profile-${index}-name`}
                    >
                      身份名称
                    </FieldLabel>
                    <Input
                      id={`login-profile-${index}-name`}
                      placeholder="管理员"
                      aria-invalid={Boolean(
                        form.formState.errors.profiles?.[index]?.name,
                      )}
                      {...form.register(`profiles.${index}.name`)}
                    />
                    <FieldError
                      errors={[form.formState.errors.profiles?.[index]?.name]}
                    />
                  </Field>

                  <Controller
                    control={form.control}
                    name={`profiles.${index}.usernameVariableId`}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel
                          className="sr-only"
                          htmlFor={`login-profile-${index}-username-variable`}
                        >
                          用户名变量
                        </FieldLabel>
                        <Select
                          items={variableItems}
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            id={`login-profile-${index}-username-variable`}
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {variableItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
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
                    name={`profiles.${index}.passwordVariableId`}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel
                          className="sr-only"
                          htmlFor={`login-profile-${index}-password-variable`}
                        >
                          密码变量
                        </FieldLabel>
                        <Select
                          items={passwordVariableItems}
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            id={`login-profile-${index}-password-variable`}
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {passwordVariableItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除登录身份“${profile.name || index + 1}”`}
                    onClick={() => remove(index)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
            </FieldGroup>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>尚未配置登录身份</EmptyTitle>
                <EmptyDescription>
                  登录身份通过项目变量提供用户名和密码。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    variableItems.length === 0 ||
                    passwordVariableItems.length === 0
                  }
                  onClick={addProfile}
                >
                  <PlusIcon data-icon="inline-start" />
                  添加身份
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </PageSection>
      </form>
    </FormPage>
  );
}
