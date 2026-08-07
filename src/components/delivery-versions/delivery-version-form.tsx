"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import {
  createDeliveryVersionAction,
  updateDeliveryVersionAction,
} from "@/app/actions/delivery-versions";
import { FormPage } from "@/components/layout/form-page";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  deliveryVersionInputSchema,
  type DeliveryVersionInput,
} from "@/lib/delivery-versions/schema";

export function DeliveryVersionForm({
  id,
  code,
  expectedUpdatedAt,
  initialValues,
  canSetCurrent = true,
}: {
  id?: string;
  code?: string;
  expectedUpdatedAt?: string;
  initialValues?: DeliveryVersionInput;
  canSetCurrent?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<DeliveryVersionInput>({
    resolver: zodResolver(deliveryVersionInputSchema),
    defaultValues: initialValues ?? {
      name: "",
      description: "",
      setCurrent: true,
    },
  });
  const editing = Boolean(id);

  function submit(values: DeliveryVersionInput) {
    startTransition(async () => {
      const result = id
        ? await updateDeliveryVersionAction(id, values, expectedUpdatedAt ?? "")
        : await createDeliveryVersionAction(values);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      toast.add({ type: "success", description: result.message });
      const versionId = id ?? result.data?.id;
      router.push(
        versionId ? `/delivery-versions/${versionId}` : "/delivery-versions",
      );
      router.refresh();
    });
  }

  return (
    <FormPage
      title={editing ? "编辑交付版本" : "新建交付版本"}
      description="定义本次交付的需求范围，锁定后进入开发和验证。"
      meta={code ? <span className="font-mono text-xs">{code}</span> : null}
      actions={
        <>
          <Button variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button
            type="submit"
            form="delivery-version-form"
            disabled={isPending}
          >
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            保存
          </Button>
        </>
      }
    >
      <form
        id="delivery-version-form"
        className="w-full"
        onSubmit={form.handleSubmit(submit)}
      >
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.name)}>
            <FieldLabel htmlFor="delivery-version-name">版本名称</FieldLabel>
            <Input
              id="delivery-version-name"
              maxLength={100}
              placeholder="例如：2026 年 8 月交付"
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register("name")}
            />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.description)}>
            <FieldLabel htmlFor="delivery-version-description">描述</FieldLabel>
            <Textarea
              id="delivery-version-description"
              rows={6}
              maxLength={1_000}
              aria-invalid={Boolean(form.formState.errors.description)}
              {...form.register("description")}
            />
            <FieldError errors={[form.formState.errors.description]} />
          </Field>
          {canSetCurrent ? (
            <Controller
              control={form.control}
              name="setCurrent"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <div className="flex-1">
                    <FieldLabel htmlFor="delivery-version-current">
                      设为当前版本
                    </FieldLabel>
                    <FieldDescription>
                      后续新建或确认的 US 会自动进入该版本。
                    </FieldDescription>
                  </div>
                  <Switch
                    id="delivery-version-current"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />
          ) : null}
        </FieldGroup>
      </form>
    </FormPage>
  );
}
