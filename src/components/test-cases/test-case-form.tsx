"use client";

import { useState, useTransition } from "react";

import ArrowDownOutlined from "@ant-design/icons/ArrowDownOutlined";
import ArrowUpOutlined from "@ant-design/icons/ArrowUpOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import {
  Alert,
  Button,
  Divider,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Typography,
  message,
} from "antd";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import {
  createTestCaseAction,
  updateTestCaseAction,
} from "@/app/actions/test-cases";
import { MarkdownField } from "@/components/markdown/markdown-field";
import type { ScriptEditorProps } from "@/components/test-cases/script-editor";
import { TestPriority } from "@/generated/prisma/enums";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";
import { TEST_PRIORITY_META } from "@/lib/test-cases/meta";

const ScriptEditor = dynamic<ScriptEditorProps>(
  () =>
    import("@/components/test-cases/script-editor").then(
      (module) => module.ScriptEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-md bg-slate-100" />
    ),
  },
);

type TestStepValue = {
  id?: string;
  action: string;
  expectedResult: string;
};

export type TestCaseFormValues = {
  name: string;
  groupId: string;
  priority: TestPriority;
  preconditions: string;
  enabled: boolean;
  script: string;
  steps: TestStepValue[];
  userStoryIds: string[];
};

type TestCaseFormProps = {
  testCaseId?: string;
  groups: Array<{ id: string; name: string }>;
  userStories: Array<{
    id: string;
    code: string;
    title: string;
    featureName: string | null;
  }>;
  initialValues?: TestCaseFormValues;
};

export function TestCaseForm({
  testCaseId,
  groups,
  userStories,
  initialValues,
}: TestCaseFormProps) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  useUnsavedChanges(dirty);

  const defaults: TestCaseFormValues = initialValues ?? {
    name: "",
    groupId: groups[0]?.id ?? "",
    priority: TestPriority.P2,
    preconditions: "",
    enabled: true,
    script: "",
    steps: [{ action: "", expectedResult: "" }],
    userStoryIds: [],
  };

  function submit(values: TestCaseFormValues) {
    startTransition(async () => {
      const result = testCaseId
        ? await updateTestCaseAction(testCaseId, values)
        : await createTestCaseAction(values);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }

      setDirty(false);
      messageApi.success(result.message);
      const targetId = testCaseId ?? result.data?.id;
      router.push(targetId ? `/test-cases/${targetId}` : "/test-cases");
      router.refresh();
    });
  }

  function cancel() {
    if (confirmLeaveIfDirty()) {
      router.back();
    }
  }

  return (
    <>
      {messageContext}
      <Form<TestCaseFormValues>
        className="form-panel !max-w-[1180px]"
        layout="vertical"
        requiredMark={false}
        initialValues={defaults}
        onValuesChange={() => setDirty(true)}
        onFinish={submit}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_240px_180px_130px] gap-5">
          <Form.Item
            name="name"
            label="用例名称"
            rules={[{ required: true, message: "请输入用例名称" }]}
          >
            <Input maxLength={200} showCount />
          </Form.Item>
          <Form.Item
            name="groupId"
            label="分组"
            rules={[{ required: true, message: "请选择用例分组" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={groups.map((group) => ({
                value: group.id,
                label: group.name,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="priority"
            label="优先级"
            rules={[{ required: true }]}
          >
            <Select
              options={Object.values(TestPriority).map((priority) => ({
                value: priority,
                label: `${priority} · ${TEST_PRIORITY_META[priority].description}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="enabled" label="启用状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </div>

        <Form.Item
          name="userStoryIds"
          label="关联 US（可选）"
          extra="只展示当前项目中未删除的 US；删除需求不会删除或修改本用例。"
        >
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            maxTagCount={3}
            placeholder="选择一个或多个 US"
            options={userStories.map((story) => ({
              value: story.id,
              label: `${story.code} · ${story.title}${
                story.featureName ? `（${story.featureName}）` : "（独立 US）"
              }`,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="preconditions"
          label="前置条件（可选）"
          extra="支持 Markdown。记录执行此用例前必须满足的数据、权限或环境条件。"
        >
          <MarkdownField rows={7} placeholder="没有前置条件时可以留空" />
        </Form.Item>

        <Divider titlePlacement="left">测试步骤</Divider>

        <Form.List
          name="steps"
          rules={[
            {
              validator: async (_, steps) => {
                if (!steps?.length) {
                  throw new Error("至少需要一条测试步骤");
                }
              },
            },
          ]}
        >
          {(fields, { add, remove, move }, { errors }) => (
            <Space orientation="vertical" className="w-full" size={16}>
              {fields.map((field, index) => (
                <div
                  key={field.key}
                  className="border-b border-slate-200 pb-5 last:border-b-0"
                >
                  <Form.Item name={[field.name, "id"]} hidden>
                    <Input />
                  </Form.Item>
                  <div className="mb-3 flex items-center justify-between">
                    <Typography.Text strong>步骤 {index + 1}</Typography.Text>
                    <Space size={2}>
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        aria-label="上移步骤"
                        onClick={() => move(index, index - 1)}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={index === fields.length - 1}
                        aria-label="下移步骤"
                        onClick={() => move(index, index + 1)}
                      />
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="删除步骤"
                        disabled={fields.length === 1}
                        onClick={() => remove(field.name)}
                      />
                    </Space>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <Form.Item
                      name={[field.name, "action"]}
                      label="操作步骤"
                      rules={[{ required: true, message: "操作步骤不能为空" }]}
                      className="!mb-0"
                    >
                      <Input.TextArea
                        rows={4}
                        placeholder="描述用户操作、输入或系统事件"
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "expectedResult"]}
                      label="预期结果"
                      rules={[{ required: true, message: "预期结果不能为空" }]}
                      className="!mb-0"
                    >
                      <Input.TextArea
                        rows={4}
                        placeholder="描述可观察、可验证的结果"
                      />
                    </Form.Item>
                  </div>
                </div>
              ))}
              <Form.ErrorList errors={errors} />
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add({ action: "", expectedResult: "" })}
              >
                添加步骤
              </Button>
            </Space>
          )}
        </Form.List>

        <Divider titlePlacement="left">自动化脚本（可选）</Divider>

        <Alert
          type="warning"
          showIcon
          className="mb-4"
          title="脚本是完整的 Playwright Test TypeScript 文件"
          description="请自行编写 import、test 和 expect。脚本可执行 Node.js 代码，首版仅适用于内部可信用户。"
        />
        <Form.Item
          name="script"
          extra="未填写脚本时仍可保存自然语言测试用例，但不能发起自动化运行。"
        >
          <ScriptEditor />
        </Form.Item>

        <div className="form-actions">
          <Button onClick={cancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={isPending}>
            保存
          </Button>
        </div>
      </Form>
    </>
  );
}
