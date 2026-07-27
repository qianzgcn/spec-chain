"use client";

import { useState, useTransition } from "react";

import { Alert, Button, Form, Input, Modal } from "antd";

import { changePasswordAction } from "@/app/actions/auth";

type PasswordValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form] = Form.useForm<PasswordValues>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function close() {
    if (isPending) return;
    form.resetFields();
    setErrorMessage(undefined);
    onClose();
  }

  function submit(values: PasswordValues) {
    setErrorMessage(undefined);
    startTransition(async () => {
      const result = await changePasswordAction(values);
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  }

  return (
    <Modal
      title="修改密码"
      open={open}
      onCancel={close}
      footer={null}
      destroyOnHidden
      width={460}
    >
      <p className="mb-5 text-sm text-slate-500">
        修改成功后，所有已登录会话都会失效，需要使用新密码重新登录。
      </p>

      {errorMessage ? (
        <Alert className="mb-4" type="error" showIcon title={errorMessage} />
      ) : null}

      <Form<PasswordValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={submit}
      >
        <Form.Item
          name="currentPassword"
          label="当前密码"
          rules={[{ required: true, message: "请输入当前密码" }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            { required: true, message: "请输入新密码" },
            { min: 8, message: "新密码至少需要 8 位" },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          dependencies={["newPassword"]}
          rules={[
            { required: true, message: "请再次输入新密码" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("newPassword") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("两次输入的新密码不一致"));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <div className="flex justify-end gap-3 pt-2">
          <Button onClick={close}>取消</Button>
          <Button type="primary" htmlType="submit" loading={isPending}>
            保存新密码
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
