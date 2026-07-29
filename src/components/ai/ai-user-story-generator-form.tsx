"use client";

import { useState, useTransition } from "react";

import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import { Alert, Button, Form, Input, Space, Tag, message } from "antd";
import { useRouter } from "next/navigation";

import { createAiUserStoryExecutionAction } from "@/app/actions/ai-executions";
import { FormPage } from "@/components/layout/form-page";
import { PageSection } from "@/components/layout/page-section";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";

type GeneratorValues = {
  requirementText: string;
};

export function AiUserStoryGeneratorForm({
  feature,
}: {
  feature: { id: string; code: string; name: string } | null;
}) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  useUnsavedChanges(dirty);

  function submit(values: GeneratorValues) {
    startTransition(async () => {
      const result = await createAiUserStoryExecutionAction({
        requirementText: values.requirementText,
        featureId: feature?.id ?? null,
      });
      if (!result.ok || !result.data) {
        messageApi.error(result.message);
        return;
      }

      setDirty(false);
      messageApi.success(result.message);
      router.push(`/ai-executions/${result.data.id}`);
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
      <FormPage
        title="AI辅助生成US"
        description="输入需求后，系统会结合当前项目代码生成一份待评审的 US。"
        meta={
          feature ? (
            <Space size={8}>
              <Tag>所属 FE</Tag>
              <span>
                {feature.code} · {feature.name}
              </span>
            </Space>
          ) : null
        }
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={cancel}>
              返回
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              form="ai-user-story-generator-form"
              icon={<ThunderboltOutlined />}
              loading={isPending}
            >
              开始生成
            </Button>
          </Space>
        }
      >
        <Form<GeneratorValues>
          id="ai-user-story-generator-form"
          className="form-page__form"
          layout="vertical"
          requiredMark={false}
          onValuesChange={() => setDirty(true)}
          onFinish={submit}
        >
          {feature ? (
            <Alert
              className="form-context-alert"
              type="info"
              showIcon
              title={`所属 FE：${feature.code} · ${feature.name}`}
              description="FE 正文和现有 US 摘要会自动加入生成上下文，归属在确认后保持不变。"
            />
          ) : null}
          <PageSection
            title="需求内容"
            description="描述要解决的问题、目标用户、期望结果和已知约束；信息不足时任务会明确失败。"
          >
            <Form.Item
              name="requirementText"
              rules={[{ required: true, message: "请输入需求内容" }]}
              className="!mb-0"
            >
              <Input.TextArea
                aria-label="需求内容"
                rows={16}
                maxLength={10_000}
                showCount
                placeholder="请输入需要整理为 US 的需求内容"
              />
            </Form.Item>
          </PageSection>
        </Form>
      </FormPage>
    </>
  );
}
