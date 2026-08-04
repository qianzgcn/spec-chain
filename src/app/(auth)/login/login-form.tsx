"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyholeIcon, UserIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { loginAction } from "@/app/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { loginSchema, type LoginValues } from "@/lib/auth/schemas";

export function LoginForm({ passwordChanged }: { passwordChanged: boolean }) {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  function submit(values: LoginValues) {
    setErrorMessage(undefined);
    startTransition(async () => {
      const result = await loginAction(values);
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      method="post"
      onSubmit={form.handleSubmit(submit)}
    >
      {passwordChanged ? (
        <Alert>
          <AlertDescription>
            密码已修改，请使用新密码重新登录。
          </AlertDescription>
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.username)}>
          <FieldLabel htmlFor="username">用户名</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <UserIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="username"
              autoComplete="username"
              placeholder="请输入用户名"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.username)}
              {...form.register("username")}
            />
          </InputGroup>
          <FieldError errors={[form.formState.errors.username]} />
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.password)}>
          <FieldLabel htmlFor="password">密码</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <LockKeyholeIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register("password")}
            />
          </InputGroup>
          <FieldError errors={[form.formState.errors.password]} />
        </Field>
      </FieldGroup>

      <Button className="w-full" size="lg" type="submit" disabled={isPending}>
        {isPending ? <Spinner data-icon="inline-start" /> : null}
        登录
      </Button>
    </form>
  );
}
