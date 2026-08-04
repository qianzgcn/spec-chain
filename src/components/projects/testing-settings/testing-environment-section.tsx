"use client";

import { useFormContext } from "react-hook-form";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SettingsSection } from "@/components/projects/testing-settings/settings-section";
import type { ProjectTestingSettingsFormValues } from "@/lib/projects/schema";

export function TestingEnvironmentSection() {
  const form = useFormContext<ProjectTestingSettingsFormValues>();

  return (
    <SettingsSection
      title="测试环境"
      help="自动化任务以 Base URL 作为被测系统入口，仅支持 HTTP(S) 地址。"
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
    </SettingsSection>
  );
}
