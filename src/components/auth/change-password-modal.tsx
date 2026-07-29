"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { changePasswordAction } from "@/app/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  changePasswordSchema,
  type ChangePasswordValues,
} from "@/lib/auth/schemas";

export function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  function close() {
    if (isPending) return;
    form.reset();
    setErrorMessage(undefined);
    onClose();
  }

  function submit(values: ChangePasswordValues) {
    setErrorMessage(undefined);
    startTransition(async () => {
      const result = await changePasswordAction(values);
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <DialogContent>
        <form onSubmit={form.handleSubmit(submit)}>
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>
              修改成功后，所有已登录会话都会失效，需要使用新密码重新登录。
            </DialogDescription>
          </DialogHeader>

          <div className="py-5">
            {errorMessage ? (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup>
              <Field
                data-invalid={Boolean(form.formState.errors.currentPassword)}
              >
                <FieldLabel htmlFor="current-password">当前密码</FieldLabel>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(form.formState.errors.currentPassword)}
                  {...form.register("currentPassword")}
                />
                <FieldError errors={[form.formState.errors.currentPassword]} />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.newPassword)}>
                <FieldLabel htmlFor="new-password">新密码</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(form.formState.errors.newPassword)}
                  {...form.register("newPassword")}
                />
                <FieldError errors={[form.formState.errors.newPassword]} />
              </Field>
              <Field
                data-invalid={Boolean(form.formState.errors.confirmPassword)}
              >
                <FieldLabel htmlFor="confirm-password">确认新密码</FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(form.formState.errors.confirmPassword)}
                  {...form.register("confirmPassword")}
                />
                <FieldError errors={[form.formState.errors.confirmPassword]} />
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={isPending}
              onClick={close}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              保存新密码
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
