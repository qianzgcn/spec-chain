"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { VariableFieldKind, VariableKind } from "@/generated/prisma/enums";
import {
  projectVariableFormSchema,
  type ProjectVariableFormValue,
} from "@/lib/projects/schema";

const VARIABLE_KIND_OPTIONS = [
  { label: "字符串", value: VariableKind.STRING },
  { label: "数字", value: VariableKind.NUMBER },
  { label: "对象", value: VariableKind.OBJECT },
];

const FIELD_KIND_OPTIONS = [
  { label: "字符串", value: VariableFieldKind.STRING },
  { label: "数字", value: VariableFieldKind.NUMBER },
];

const EMPTY_OBJECT_FIELD = {
  name: "",
  value: "",
  description: "",
  kind: VariableFieldKind.STRING,
  encrypted: false,
} as const;

export const EMPTY_PROJECT_VARIABLE: ProjectVariableFormValue = {
  name: "",
  value: "",
  description: "",
  kind: VariableKind.STRING,
  encrypted: false,
};

type FormError = { message?: string };
type ObjectFieldError = {
  name?: FormError;
  kind?: FormError;
  value?: FormError;
  encrypted?: FormError;
  description?: FormError;
};
type ObjectVariable = Extract<
  ProjectVariableFormValue,
  { kind: typeof VariableKind.OBJECT }
>;

function cloneVariable(
  variable: ProjectVariableFormValue,
): ProjectVariableFormValue {
  return variable.kind === VariableKind.OBJECT
    ? { ...variable, fields: variable.fields.map((field) => ({ ...field })) }
    : { ...variable };
}

function canPreserveEncryptedValue(input: {
  currentId?: string;
  currentKind: VariableKind | VariableFieldKind;
  currentEncrypted: boolean;
  original?: {
    id?: string;
    kind: VariableKind | VariableFieldKind;
    encrypted: boolean;
  };
}) {
  return Boolean(
    input.currentId &&
    input.original?.id === input.currentId &&
    input.original.kind === input.currentKind &&
    input.original.encrypted &&
    input.currentEncrypted,
  );
}

export function ProjectVariableDialog({
  open,
  initialValue,
  existingNames,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  initialValue?: ProjectVariableFormValue;
  existingNames: readonly string[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (variable: ProjectVariableFormValue) => void;
}) {
  const form = useForm<ProjectVariableFormValue>({
    resolver: zodResolver(projectVariableFormSchema),
    defaultValues: EMPTY_PROJECT_VARIABLE,
  });
  const variable = useWatch({
    control: form.control,
  }) as ProjectVariableFormValue;
  const kind = variable.kind;
  const fields = variable.kind === VariableKind.OBJECT ? variable.fields : [];
  const fieldErrors =
    "fields" in form.formState.errors
      ? (form.formState.errors.fields as ObjectFieldError[] | undefined)
      : undefined;

  useEffect(() => {
    if (open) {
      form.reset(cloneVariable(initialValue ?? EMPTY_PROJECT_VARIABLE));
    }
  }, [form, initialValue, open]);

  function changeKind(nextKind: VariableKind | null) {
    if (!nextKind || nextKind === kind) return;
    const current = form.getValues();
    const common = {
      id: current.id,
      name: current.name,
      description: current.description,
    };
    form.reset(
      nextKind === VariableKind.OBJECT
        ? {
            ...common,
            kind: VariableKind.OBJECT,
            fields: [{ ...EMPTY_OBJECT_FIELD }],
          }
        : {
            ...common,
            kind: nextKind,
            value: "",
            encrypted: false,
          },
    );
  }

  function replaceFields(nextFields: ObjectVariable["fields"]) {
    form.setValue("fields", nextFields, {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
  }

  function validatePreservedValues(value: ProjectVariableFormValue) {
    if (value.kind !== VariableKind.OBJECT) {
      if (
        !value.value &&
        !canPreserveEncryptedValue({
          currentId: value.id,
          currentKind: value.kind,
          currentEncrypted: value.encrypted,
          original:
            initialValue?.kind !== VariableKind.OBJECT
              ? initialValue
              : undefined,
        })
      ) {
        form.setError("value", { message: "请输入变量值" });
        return false;
      }
      return true;
    }

    const originalFields =
      initialValue?.kind === VariableKind.OBJECT
        ? new Map(initialValue.fields.map((field) => [field.id, field]))
        : new Map();
    let valid = true;
    value.fields.forEach((field, index) => {
      if (
        !field.value &&
        !canPreserveEncryptedValue({
          currentId: field.id,
          currentKind: field.kind,
          currentEncrypted: field.encrypted,
          original: field.id ? originalFields.get(field.id) : undefined,
        })
      ) {
        form.setError(`fields.${index}.value`, {
          message: "请输入字段值",
        });
        valid = false;
      }
    });
    return valid;
  }

  function submit(value: ProjectVariableFormValue) {
    if (existingNames.includes(value.name)) {
      form.setError("name", { message: "项目变量名不能重复" });
      return;
    }
    if (!validatePreservedValues(value)) return;
    onConfirm(value);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <form
          onSubmit={(event) => {
            event.stopPropagation();
            void form.handleSubmit(submit)(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>{initialValue ? "编辑变量" : "新建变量"}</DialogTitle>
            <DialogDescription className="sr-only">
              配置项目变量及对象字段。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(100vh-12rem)] space-y-4 overflow-y-auto py-5 pr-1">
            <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-4">
              <Field data-invalid={Boolean(form.formState.errors.name)}>
                <FieldLabel htmlFor="project-variable-name">变量名</FieldLabel>
                <Input
                  id="project-variable-name"
                  placeholder="E2E_LOCALE"
                  autoComplete="off"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  {...form.register("name")}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>

              <Field>
                <FieldLabel>类型</FieldLabel>
                <Select
                  items={VARIABLE_KIND_OPTIONS}
                  value={kind}
                  onValueChange={changeKind}
                >
                  <SelectTrigger aria-label="变量类型">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {VARIABLE_KIND_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field data-invalid={Boolean(form.formState.errors.description)}>
              <FieldLabel htmlFor="project-variable-description">
                描述
              </FieldLabel>
              <Input
                id="project-variable-description"
                maxLength={500}
                placeholder="变量用途"
                aria-invalid={Boolean(form.formState.errors.description)}
                {...form.register("description")}
              />
              <FieldError errors={[form.formState.errors.description]} />
            </Field>

            {variable.kind === VariableKind.OBJECT ? (
              <div className="bg-muted/40 space-y-3 rounded-lg p-3">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      replaceFields([...fields, { ...EMPTY_OBJECT_FIELD }])
                    }
                  >
                    <PlusIcon data-icon="inline-start" />
                    添加字段
                  </Button>
                </div>

                <div className="text-muted-foreground grid grid-cols-[minmax(110px,1fr)_110px_minmax(140px,1.1fr)_minmax(130px,1fr)_64px_32px] gap-2 px-1 text-xs">
                  <span>字段名</span>
                  <span>类型</span>
                  <span>值</span>
                  <span>描述</span>
                  <span>加密</span>
                  <span className="sr-only">操作</span>
                </div>

                {fields.map((field, index) => {
                  const errors = fieldErrors?.[index];
                  return (
                    <div
                      key={field.id ?? `new-field-${index}`}
                      className="bg-background grid grid-cols-[minmax(110px,1fr)_110px_minmax(140px,1.1fr)_minmax(130px,1fr)_64px_32px] items-start gap-2 rounded-md p-2"
                      data-testid="project-variable-object-field"
                    >
                      <Field data-invalid={Boolean(errors?.name)}>
                        <FieldLabel className="sr-only">字段名</FieldLabel>
                        <Input
                          aria-label="字段名"
                          placeholder="username"
                          aria-invalid={Boolean(errors?.name)}
                          {...form.register(`fields.${index}.name`)}
                        />
                        <FieldError errors={[errors?.name]} />
                      </Field>

                      <Controller
                        control={form.control}
                        name={`fields.${index}.kind`}
                        render={({ field: kindField, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel className="sr-only">
                              字段类型
                            </FieldLabel>
                            <Select
                              items={FIELD_KIND_OPTIONS}
                              value={kindField.value}
                              onValueChange={kindField.onChange}
                            >
                              <SelectTrigger
                                aria-label="字段类型"
                                aria-invalid={fieldState.invalid}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {FIELD_KIND_OPTIONS.map((option) => (
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

                      <Field data-invalid={Boolean(errors?.value)}>
                        <FieldLabel className="sr-only">字段值</FieldLabel>
                        <Input
                          aria-label="字段值"
                          type={field.encrypted ? "password" : "text"}
                          autoComplete={
                            field.encrypted ? "new-password" : "off"
                          }
                          placeholder={field.encrypted ? "留空保留原值" : "值"}
                          aria-invalid={Boolean(errors?.value)}
                          {...form.register(`fields.${index}.value`)}
                        />
                        <FieldError errors={[errors?.value]} />
                      </Field>

                      <Field data-invalid={Boolean(errors?.description)}>
                        <FieldLabel className="sr-only">字段描述</FieldLabel>
                        <Input
                          aria-label="字段描述"
                          maxLength={500}
                          placeholder="字段用途"
                          aria-invalid={Boolean(errors?.description)}
                          {...form.register(`fields.${index}.description`)}
                        />
                        <FieldError errors={[errors?.description]} />
                      </Field>

                      <Controller
                        control={form.control}
                        name={`fields.${index}.encrypted`}
                        render={({ field: encryptionField }) => (
                          <div className="flex h-8 items-center justify-center">
                            <Switch
                              checked={encryptionField.value}
                              onCheckedChange={encryptionField.onChange}
                              aria-label={`加密字段 ${field.name || index + 1}`}
                            />
                          </div>
                        )}
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={fields.length === 1}
                        aria-label={`删除字段 ${field.name || index + 1}`}
                        onClick={() =>
                          replaceFields(
                            fields.filter(
                              (_, fieldIndex) => fieldIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)_80px] items-end gap-4">
                <Field
                  data-invalid={Boolean(
                    "value" in form.formState.errors &&
                    form.formState.errors.value,
                  )}
                >
                  <FieldLabel htmlFor="project-variable-value">值</FieldLabel>
                  <Input
                    id="project-variable-value"
                    type={variable.encrypted ? "password" : "text"}
                    autoComplete={variable.encrypted ? "new-password" : "off"}
                    placeholder={
                      variable.encrypted && initialValue
                        ? "留空保留原值"
                        : "请输入变量值"
                    }
                    aria-invalid={Boolean(
                      "value" in form.formState.errors &&
                      form.formState.errors.value,
                    )}
                    {...form.register("value")}
                  />
                  <FieldError
                    errors={[
                      "value" in form.formState.errors
                        ? form.formState.errors.value
                        : undefined,
                    ]}
                  />
                </Field>

                <Controller
                  control={form.control}
                  name="encrypted"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>加密</FieldLabel>
                      <div className="flex h-8 items-center">
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          aria-label="加密变量"
                        />
                      </div>
                    </Field>
                  )}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit">确定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
