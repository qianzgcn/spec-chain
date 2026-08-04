"use client";

import dynamic from "next/dynamic";
import { Controller, useFormContext } from "react-hook-form";

import type { TypeScriptEditorProps } from "@/components/editors/typescript-editor";
import { SettingsSection } from "@/components/projects/testing-settings/settings-section";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { LOGIN_METHOD_TEMPLATE } from "@/lib/automation/login-contract";
import type { ProjectTestingSettingsFormValues } from "@/lib/projects/schema";

const TypeScriptEditor = dynamic<TypeScriptEditorProps>(
  () =>
    import("@/components/editors/typescript-editor").then(
      (module) => module.TypeScriptEditor,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full" />,
  },
);

export function LoginMethodSection() {
  const form = useFormContext<ProjectTestingSettingsFormValues>();

  return (
    <SettingsSection
      title="登录方法"
      help="封装项目公共登录流程；用例使用账号对象变量时由平台自动调用。"
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
              placeholder={LOGIN_METHOD_TEMPLATE}
              ariaLabel="登录方法源码"
              onChange={field.onChange}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </SettingsSection>
  );
}
