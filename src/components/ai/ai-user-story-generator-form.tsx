"use client";

import { useState, useTransition } from "react";

import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import { Alert, Button, Form, Input, message } from "antd";
import { useRouter } from "next/navigation";

import { createAiUserStoryExecutionAction } from "@/app/actions/ai-executions";
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
      router.push(`/ai-executions/${result.data.id}?follow=1`);
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
      <Form<GeneratorValues>
        className="form-panel"
        layout="vertical"
        requiredMark={false}
        onValuesChange={() => setDirty(true)}
        onFinish={submit}
      >
        {feature ? (
          <Alert
            className="mb-5"
            type="info"
            showIcon
            title={`所属 FE：${feature.code} · ${feature.name}`}
            description="FE 正文和现有 US 摘要会自动加入生成上下文，归属在确认草稿后保持不变。"
          />
        ) : null}

        <Form.Item
          name="requirementText"
          label="需求内容"
          rules={[{ required: true, message: "请输入需求内容" }]}
          extra="请描述需要解决的问题、目标用户、期望结果和已知约束。AI 会自动分析当前项目的全部代码仓库。"
        >
          <Input.TextArea
            rows={16}
            maxLength={10_000}
            showCount
            placeholder="请输入需要整理为 US 的需求内容"
          />
        </Form.Item>

        <div className="form-actions">
          <Button icon={<ArrowLeftOutlined />} onClick={cancel}>
            返回
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            icon={<ThunderboltOutlined />}
            loading={isPending}
          >
            开始生成
          </Button>
        </div>
      </Form>
    </>
  );
}
