"use client";

import { useState } from "react";

import { PlusIcon } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ProjectVariableDialog } from "@/components/projects/testing-settings/project-variable-dialog";
import { SettingsSection } from "@/components/projects/testing-settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VariableFieldKind, VariableKind } from "@/generated/prisma/enums";
import type {
  ProjectTestingSettingsFormValues,
  ProjectVariableFormValue,
} from "@/lib/projects/schema";

const VARIABLE_KIND_LABELS: Record<VariableKind, string> = {
  [VariableKind.STRING]: "字符串",
  [VariableKind.NUMBER]: "数字",
  [VariableKind.OBJECT]: "对象",
};

function formatVariableValue(input: {
  value: string;
  kind: VariableKind | VariableFieldKind;
  encrypted: boolean;
}) {
  if (input.encrypted) return "••••••••";
  if (!input.value) return "—";
  return input.kind === VariableKind.STRING
    ? JSON.stringify(input.value)
    : input.value;
}

function VariableValue({ variable }: { variable: ProjectVariableFormValue }) {
  const displayValue =
    variable.kind === VariableKind.OBJECT
      ? variable.fields
          .map((field) => `${field.name}:${formatVariableValue(field)}`)
          .join("; ")
      : formatVariableValue(variable);

  return (
    <span className="block truncate font-mono" title={displayValue}>
      {displayValue}
    </span>
  );
}

export function ProjectVariablesSection() {
  const form = useFormContext<ProjectTestingSettingsFormValues>();
  const { fields, append, update, remove } = useFieldArray({
    control: form.control,
    name: "variables",
    keyName: "fieldKey",
  });
  const variables =
    useWatch({ control: form.control, name: "variables" }) ?? [];
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    index: number | null;
  }>({ open: false, index: null });
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const editingVariable =
    dialogState.index === null ? undefined : variables[dialogState.index];
  const existingNames = variables
    .filter((_, index) => index !== dialogState.index)
    .map((variable) => variable.name);

  function closeDialog() {
    setDialogState({ open: false, index: null });
  }

  function saveDraft(variable: ProjectVariableFormValue) {
    if (dialogState.index === null) {
      append(variable);
    } else {
      update(dialogState.index, variable);
    }
  }

  return (
    <SettingsSection
      title="项目变量"
      help="用例通过 ${NAME} 或 ${NAME.field} 引用；加密值不会提供给 AI。"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogState({ open: true, index: null })}
        >
          <PlusIcon data-icon="inline-start" />
          新建变量
        </Button>
      }
    >
      <Table
        className="table-fixed"
        containerClassName="overflow-hidden rounded-lg border"
      >
        <TableHeader className="bg-muted/45">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[18%] px-3">变量名</TableHead>
            <TableHead className="w-24">类型</TableHead>
            <TableHead className="w-[34%]">值</TableHead>
            <TableHead>描述</TableHead>
            <TableHead className="w-32">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variables.length ? (
            variables.map((variable, index) => (
              <TableRow
                key={variable.id ?? fields[index]?.fieldKey ?? index}
                data-testid="project-variable-row"
              >
                <TableCell className="px-3 font-mono font-medium">
                  <span className="block truncate" title={variable.name}>
                    {variable.name || "未命名变量"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {VARIABLE_KIND_LABELS[variable.kind]}
                  </Badge>
                </TableCell>
                <TableCell className="min-w-0">
                  <VariableValue variable={variable} />
                </TableCell>
                <TableCell className="min-w-0">
                  <span
                    className="text-muted-foreground block truncate"
                    title={variable.description}
                  >
                    {variable.description || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialogState({ open: true, index })}
                    >
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRemovingIndex(index)}
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={5}
                className="text-muted-foreground h-24 text-center"
              >
                尚未配置项目变量
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <ProjectVariableDialog
        open={dialogState.open}
        initialValue={editingVariable}
        existingNames={existingNames}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        onConfirm={saveDraft}
      />

      <ConfirmDialog
        open={removingIndex !== null}
        title="删除变量"
        description={`确定删除变量“${removingIndex === null ? "" : (variables[removingIndex]?.name ?? "")}”吗？保存设置后生效。`}
        confirmLabel="删除"
        destructive
        onOpenChange={(open) => {
          if (!open) setRemovingIndex(null);
        }}
        onConfirm={() => {
          if (removingIndex !== null) remove(removingIndex);
          setRemovingIndex(null);
        }}
      />
    </SettingsSection>
  );
}
