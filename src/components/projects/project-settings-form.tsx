"use client";

import { useTransition } from "react";

import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import {
  Alert,
  Button,
  Divider,
  Form,
  Input,
  Radio,
  Space,
  Typography,
  message,
} from "antd";
import { useRouter } from "next/navigation";

import { updateProjectSettingsAction } from "@/app/actions/projects";
import { VariableKind } from "@/generated/prisma/enums";

type RepositoryValue = {
  id?: string;
  gitUrl: string;
  branch: string;
};

type VariableValue = {
  id?: string;
  name: string;
  value: string;
  description: string;
  kind: VariableKind;
};

type SettingsValues = {
  name: string;
  description: string;
  baseUrl: string;
  repositories: RepositoryValue[];
  variables: VariableValue[];
};

export function ProjectSettingsForm({
  project,
}: {
  project: SettingsValues & { id: string };
}) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [isPending, startTransition] = useTransition();

  function submit(values: SettingsValues) {
    startTransition(async () => {
      const result = await updateProjectSettingsAction({
        ...values,
        projectId: project.id,
      });
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.refresh();
    });
  }

  return (
    <>
      {messageContext}
      <Form<SettingsValues>
        className="form-panel"
        layout="vertical"
        requiredMark={false}
        initialValues={project}
        onFinish={submit}
      >
        <Typography.Title level={4}>基础信息</Typography.Title>
        <div className="grid grid-cols-2 gap-x-5">
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: "请输入项目名称" }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[{ type: "url", message: "请输入有效的 URL" }]}
            extra="创建项目时可留空；运行自动化用例前必须配置。"
          >
            <Input placeholder="https://example.com" />
          </Form.Item>
        </div>
        <Form.Item name="description" label="项目描述">
          <Input.TextArea rows={3} maxLength={1000} showCount />
        </Form.Item>

        <Divider />

        <div className="mb-4 flex items-start justify-between">
          <div>
            <Typography.Title level={4} className="!mb-1">
              代码仓库
            </Typography.Title>
            <Typography.Text type="secondary">
              仅保存仓库地址和分支，不会连接或拉取 Git 仓库。
            </Typography.Text>
          </div>
        </div>

        <Form.List name="repositories">
          {(fields, { add, remove }) => (
            <Space orientation="vertical" className="w-full" size={12}>
              {fields.map((field, index) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_220px_36px] gap-3"
                  key={field.key}
                >
                  <Form.Item name={[field.name, "id"]} hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, "gitUrl"]}
                    label={index === 0 ? "Git 地址" : undefined}
                    rules={[{ required: true, message: "请输入 Git 地址" }]}
                    className="!mb-0"
                  >
                    <Input placeholder="https://... 或 git@..." />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, "branch"]}
                    label={index === 0 ? "分支" : undefined}
                    rules={[{ required: true, message: "请输入分支" }]}
                    className="!mb-0"
                  >
                    <Input placeholder="main" />
                  </Form.Item>
                  <Button
                    className={index === 0 ? "mt-[30px]" : ""}
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label="删除仓库"
                    onClick={() => remove(field.name)}
                  />
                </div>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add({ gitUrl: "", branch: "main" })}
              >
                添加仓库
              </Button>
            </Space>
          )}
        </Form.List>

        <Divider />

        <div className="mb-4">
          <Typography.Title level={4} className="!mb-1">
            项目变量
          </Typography.Title>
          <Typography.Text type="secondary">
            运行脚本时通过 process.env 注入；敏感变量保存后不再回显。
          </Typography.Text>
        </div>

        <Alert
          className="mb-4"
          type="info"
          showIcon
          title="敏感变量留空表示保留原值；如需修改，请输入新值后保存。"
        />

        <Form.List name="variables">
          {(fields, { add, remove }) => (
            <Space orientation="vertical" className="w-full" size={16}>
              {fields.map((field, index) => (
                <div
                  key={field.key}
                  className="rounded-md border border-slate-200 bg-slate-50 p-4"
                >
                  <Form.Item name={[field.name, "id"]} hidden>
                    <Input />
                  </Form.Item>
                  <div className="grid grid-cols-[1fr_220px_36px] gap-3">
                    <Form.Item
                      name={[field.name, "name"]}
                      label="变量名"
                      rules={[
                        { required: true, message: "请输入变量名" },
                        {
                          pattern: /^[A-Za-z_][A-Za-z0-9_]*$/,
                          message: "只能包含字母、数字和下划线，不能以数字开头",
                        },
                      ]}
                    >
                      <Input placeholder="API_TOKEN" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "kind"]}
                      label="类型"
                      rules={[{ required: true }]}
                    >
                      <Radio.Group
                        options={[
                          { label: "普通", value: VariableKind.PLAIN },
                          { label: "敏感", value: VariableKind.SECRET },
                        ]}
                      />
                    </Form.Item>
                    <Button
                      className="mt-[30px]"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除第 ${index + 1} 个变量`}
                      onClick={() => remove(field.name)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Form.Item
                      noStyle
                      shouldUpdate={(previous, current) =>
                        previous.variables?.[field.name]?.kind !==
                        current.variables?.[field.name]?.kind
                      }
                    >
                      {({ getFieldValue }) => {
                        const kind = getFieldValue([
                          "variables",
                          field.name,
                          "kind",
                        ]) as VariableKind | undefined;
                        const existingId = getFieldValue([
                          "variables",
                          field.name,
                          "id",
                        ]) as string | undefined;
                        return (
                          <Form.Item
                            name={[field.name, "value"]}
                            label="值"
                            rules={[
                              {
                                required: !existingId,
                                message: "请输入变量值",
                              },
                            ]}
                          >
                            {kind === VariableKind.SECRET ? (
                              <Input.Password
                                placeholder={
                                  existingId
                                    ? "••••••••（留空保留原值）"
                                    : "请输入敏感值"
                                }
                                autoComplete="new-password"
                              />
                            ) : (
                              <Input placeholder="请输入变量值" />
                            )}
                          </Form.Item>
                        );
                      }}
                    </Form.Item>
                    <Form.Item name={[field.name, "description"]} label="描述">
                      <Input placeholder="说明变量用途" maxLength={500} />
                    </Form.Item>
                  </div>
                </div>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() =>
                  add({
                    name: "",
                    value: "",
                    description: "",
                    kind: VariableKind.PLAIN,
                  })
                }
              >
                添加变量
              </Button>
            </Space>
          )}
        </Form.List>

        <Divider />
        <div className="form-actions">
          <Button type="primary" htmlType="submit" loading={isPending}>
            保存项目设置
          </Button>
        </div>
      </Form>
    </>
  );
}
