"use client";

import { useFormContext } from "react-hook-form";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { SettingsSection } from "@/components/projects/testing-settings/settings-section";
import type { ProjectTestingSettingsFormValues } from "@/lib/projects/schema";

export function AutomationInstructionsSection() {
  const form = useFormContext<ProjectTestingSettingsFormValues>();
  const error = form.formState.errors.automationInstructions;

  return (
    <SettingsSection
      title="自动化约束"
      help="仅填写当前项目特有的业务限制、稳定入口或命名约定；通用安全规则由平台统一维护。"
    >
      <FieldGroup>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel className="sr-only" htmlFor="automation-instructions">
            自动化约束
          </FieldLabel>
          <Textarea
            id="automation-instructions"
            rows={5}
            placeholder="例如：新建测试数据的名称统一使用 E2E_ 前缀。"
            aria-invalid={Boolean(error)}
            {...form.register("automationInstructions")}
          />
          <FieldError errors={[error]} />
        </Field>
      </FieldGroup>
    </SettingsSection>
  );
}
