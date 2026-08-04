"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { PageSection } from "@/components/layout/page-section";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { UserStoryFormValues } from "@/lib/requirements/user-story-schema";

export function AcceptanceCriteriaEditor() {
  const form = useFormContext<UserStoryFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "acceptanceCriteria",
    keyName: "fieldKey",
  });
  const criteriaErrors = form.formState.errors.acceptanceCriteria;

  return (
    <PageSection title="验收标准">
      <div className="flex min-w-0 flex-col gap-3">
        <div
          className="text-muted-foreground grid grid-cols-[2rem_repeat(3,minmax(0,1fr))_2rem] gap-3 px-2 text-xs font-medium"
          aria-hidden
        >
          <span>序号</span>
          <span>Given</span>
          <span>When</span>
          <span>Then</span>
          <span className="sr-only">操作</span>
        </div>

        <div className="flex flex-col gap-2">
          {fields.map((field, index) => {
            const itemErrors = Array.isArray(criteriaErrors)
              ? criteriaErrors[index]
              : undefined;
            return (
              <div
                className="bg-muted/40 grid min-w-0 grid-cols-[2rem_repeat(3,minmax(0,1fr))_2rem] items-start gap-3 rounded-lg p-2"
                key={field.fieldKey}
              >
                {field.id ? (
                  <input
                    type="hidden"
                    {...form.register(`acceptanceCriteria.${index}.id`)}
                  />
                ) : null}
                <span className="text-muted-foreground grid h-8 place-items-center text-xs font-medium">
                  {index + 1}
                </span>
                <Field data-invalid={Boolean(itemErrors?.given)}>
                  <FieldLabel
                    className="sr-only"
                    htmlFor={`acceptance-${index}-given`}
                  >
                    Given {index + 1}
                  </FieldLabel>
                  <Textarea
                    id={`acceptance-${index}-given`}
                    rows={2}
                    placeholder="前置条件或初始上下文"
                    aria-invalid={Boolean(itemErrors?.given)}
                    {...form.register(`acceptanceCriteria.${index}.given`)}
                  />
                  <FieldError errors={[itemErrors?.given]} />
                </Field>
                <Field data-invalid={Boolean(itemErrors?.when)}>
                  <FieldLabel
                    className="sr-only"
                    htmlFor={`acceptance-${index}-when`}
                  >
                    When {index + 1}
                  </FieldLabel>
                  <Textarea
                    id={`acceptance-${index}-when`}
                    rows={2}
                    placeholder="用户操作或触发事件"
                    aria-invalid={Boolean(itemErrors?.when)}
                    {...form.register(`acceptanceCriteria.${index}.when`)}
                  />
                  <FieldError errors={[itemErrors?.when]} />
                </Field>
                <Field data-invalid={Boolean(itemErrors?.then)}>
                  <FieldLabel
                    className="sr-only"
                    htmlFor={`acceptance-${index}-then`}
                  >
                    Then {index + 1}
                  </FieldLabel>
                  <Textarea
                    id={`acceptance-${index}-then`}
                    rows={2}
                    placeholder="可观察、可验证的结果"
                    aria-invalid={Boolean(itemErrors?.then)}
                    {...form.register(`acceptanceCriteria.${index}.then`)}
                  />
                  <FieldError errors={[itemErrors?.then]} />
                </Field>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除验收标准 ${index + 1}`}
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2Icon className="text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>

        {!Array.isArray(criteriaErrors) && criteriaErrors?.message ? (
          <FieldError>{criteriaErrors.message}</FieldError>
        ) : null}

        <Button
          variant="outline"
          className="w-fit"
          type="button"
          onClick={() => append({ given: "", when: "", then: "" })}
        >
          <PlusIcon data-icon="inline-start" />
          添加验收标准
        </Button>
      </div>
    </PageSection>
  );
}
