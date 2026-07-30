"use client";

import { Controller, useFormContext } from "react-hook-form";

import { PageSection } from "@/components/layout/page-section";
import { MarkdownField } from "@/components/markdown/markdown-field";
import { AcceptanceCriteriaEditor } from "@/components/requirements/acceptance-criteria-editor";
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
import { Textarea } from "@/components/ui/textarea";
import { RequirementStatus } from "@/generated/prisma/enums";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";
import type { UserStoryFormValues } from "@/lib/requirements/user-story-schema";

export type { UserStoryFormValues } from "@/lib/requirements/user-story-schema";

const STATUS_OPTIONS = Object.values(RequirementStatus).map((status) => ({
  value: status,
  label: REQUIREMENT_STATUS_META[status].label,
}));

export function UserStoryFields({ showStatus }: { showStatus: boolean }) {
  const form = useFormContext<UserStoryFormValues>();
  const errors = form.formState.errors;

  return (
    <>
      <PageSection title="基本信息">
        <FieldGroup
          className={
            showStatus
              ? "grid grid-cols-[minmax(0,1fr)_11rem] gap-5"
              : undefined
          }
        >
          <Field data-invalid={Boolean(errors.title)}>
            <FieldLabel htmlFor="user-story-title">US 标题</FieldLabel>
            <Input
              id="user-story-title"
              maxLength={150}
              placeholder="用一句话说明要交付的用户价值"
              aria-invalid={Boolean(errors.title)}
              {...form.register("title")}
            />
            <FieldError errors={[errors.title]} />
          </Field>
          {showStatus ? (
            <Controller
              control={form.control}
              name="status"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="user-story-status">状态</FieldLabel>
                  <Select
                    items={STATUS_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id="user-story-status"
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {STATUS_OPTIONS.map((option) => (
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
          ) : null}
        </FieldGroup>
      </PageSection>

      <PageSection title="用户故事">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.asA)}>
            <FieldLabel htmlFor="user-story-as">As</FieldLabel>
            <Textarea
              id="user-story-as"
              rows={3}
              placeholder="例如：作为一名客服主管"
              aria-invalid={Boolean(errors.asA)}
              {...form.register("asA")}
            />
            <FieldError errors={[errors.asA]} />
          </Field>
          <Field data-invalid={Boolean(errors.iWant)}>
            <FieldLabel htmlFor="user-story-want">I want</FieldLabel>
            <Textarea
              id="user-story-want"
              rows={3}
              placeholder="例如：我希望批量分配待处理工单"
              aria-invalid={Boolean(errors.iWant)}
              {...form.register("iWant")}
            />
            <FieldError errors={[errors.iWant]} />
          </Field>
          <Field data-invalid={Boolean(errors.soThat)}>
            <FieldLabel htmlFor="user-story-value">so that</FieldLabel>
            <Textarea
              id="user-story-value"
              rows={3}
              placeholder="例如：从而减少重复操作并缩短响应时间"
              aria-invalid={Boolean(errors.soThat)}
              {...form.register("soThat")}
            />
            <FieldError errors={[errors.soThat]} />
          </Field>
        </FieldGroup>
      </PageSection>

      <AcceptanceCriteriaEditor />

      <PageSection
        title="补充约束"
        description="仅填写会影响实现或验收的规则。"
      >
        <FieldGroup>
          <Controller
            control={form.control}
            name="businessRules"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="business-rules">
                  业务规则（可选）
                </FieldLabel>
                <MarkdownField
                  id="business-rules"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={fieldState.invalid}
                  rows={8}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="nonFunctionalRequirements"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="non-functional-requirements">
                  非功能需求（可选）
                </FieldLabel>
                <MarkdownField
                  id="non-functional-requirements"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={fieldState.invalid}
                  rows={8}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </FieldGroup>
      </PageSection>
    </>
  );
}
