"use client";

import { useState, useTransition } from "react";

import { Button, Form, Input, message } from "antd";
import { useRouter } from "next/navigation";

import {
  createFeatureAction,
  updateFeatureAction,
} from "@/app/actions/requirements";
import { MarkdownField } from "@/components/markdown/markdown-field";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";

type FeatureValues = {
  name: string;
  summary: string;
  backgroundGoal: string;
};

export function FeatureForm({
  featureId,
  initialValues,
}: {
  featureId?: string;
  initialValues?: FeatureValues;
}) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  useUnsavedChanges(dirty);

  function submit(values: FeatureValues) {
    startTransition(async () => {
      const result = featureId
        ? await updateFeatureAction(featureId, values)
        : await createFeatureAction(values);

      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }

      setDirty(false);
      messageApi.success(result.message);
      const targetId = featureId ?? result.data?.id;
      router.push(targetId ? `/features/${targetId}` : "/requirements");
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
      <Form<FeatureValues>
        className="form-panel"
        layout="vertical"
        requiredMark={false}
        initialValues={initialValues}
        onValuesChange={() => setDirty(true)}
        onFinish={submit}
      >
        <Form.Item
          name="name"
          label="FE 名称"
          rules={[{ required: true, message: "请输入 FE 名称" }]}
        >
          <Input maxLength={150} showCount placeholder="简洁描述这个复杂需求" />
        </Form.Item>

        <Form.Item
          name="summary"
          label="一句话描述"
          rules={[{ required: true, message: "请输入一句话描述" }]}
        >
          <Input
            maxLength={300}
            showCount
            placeholder="用一句话说明要解决的问题或交付的能力"
          />
        </Form.Item>

        <Form.Item
          name="backgroundGoal"
          label="业务背景与目标"
          rules={[{ required: true, message: "请输入业务背景与目标" }]}
          extra="支持 Markdown。说明为什么要做、解决什么业务问题，以及期望达到的结果。"
        >
          <MarkdownField
            rows={12}
            placeholder="例如：&#10;- 当前业务问题&#10;- 目标用户和使用场景&#10;- 本次需求希望达到的结果"
          />
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
