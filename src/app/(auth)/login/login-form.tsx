"use client";

import { useState, useTransition } from "react";

import LockOutlined from "@ant-design/icons/LockOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import { Alert, Button, Form, Input } from "antd";

import { loginAction } from "@/app/actions/auth";

type LoginValues = {
  username: string;
  password: string;
};

export function LoginForm({ passwordChanged }: { passwordChanged: boolean }) {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();

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
    <Form<LoginValues>
      layout="vertical"
      requiredMark={false}
      onFinish={submit}
      size="large"
    >
      {passwordChanged ? (
        <Alert
          className="mb-5"
          type="success"
          showIcon
          title="密码已修改，请使用新密码重新登录"
        />
      ) : null}

      {errorMessage ? (
        <Alert className="mb-5" type="error" showIcon title={errorMessage} />
      ) : null}

      <Form.Item
        label="用户名"
        name="username"
        rules={[{ required: true, message: "请输入用户名" }]}
      >
        <Input
          prefix={<UserOutlined />}
          autoComplete="username"
          placeholder="请输入用户名"
          autoFocus
        />
      </Form.Item>

      <Form.Item
        label="密码"
        name="password"
        rules={[{ required: true, message: "请输入密码" }]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          autoComplete="current-password"
          placeholder="请输入密码"
        />
      </Form.Item>

      <Button
        className="mt-2"
        type="primary"
        htmlType="submit"
        block
        loading={isPending}
      >
        登录
      </Button>
    </Form>
  );
}
