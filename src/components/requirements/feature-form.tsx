"use client";

import { useState, useTransition } from "react";

import { Button, Form, Input, message } from "antd";
import { useRouter } from "next/navigation";

import {
  createFeatureAction,
  updateFeatureAction,
} from "@/app/actions/requirements";
import { FormPage } from "@/components/layout/form-page";
import { PageSection } from "@/components/layout/page-section";
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
  code,
  initialValues,
}: {
  featureId?: string;
  code?: string;
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
      <FormPage
        title={featureId ? "编辑 FE" : "新建 FE"}
        description={
          featureId
            ? "调整 FE 的组织信息和业务背景。"
            : "FE 是复杂需求的组织单元；保存后再从 FE 内创建 US。"
        }
        meta={code ? <span className="page-code">{code}</span> : null}
        actions={
          <>
            <Button onClick={cancel}>取消</Button>
            <Button
              type="primary"
              htmlType="submit"
              form="feature-form"
              loading={isPending}
              disabled={Boolean(featureId) && !dirty}
            >
              保存
            </Button>
          </>
        }
      >
        <Form<FeatureValues>
          id="feature-form"
          className="form-page__form"
          layout="vertical"
          requiredMark={false}
          initialValues={initialValues}
          onValuesChange={() => setDirty(true)}
          onFinish={submit}
        >
          <PageSection title="基本信息">
            <div className="grid grid-cols-[5fr_7fr] gap-5">
              <Form.Item
                name="name"
                label="FE 名称"
                rules={[{ required: true, message: "请输入 FE 名称" }]}
              >
                <Input
                  maxLength={150}
                  showCount
                  placeholder="简洁描述这个复杂需求"
                />
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
            </div>
          </PageSection>

          <PageSection
            title="业务背景与目标"
            description="说明为什么要做、解决什么业务问题，以及期望达到的结果。支持 Markdown。"
          >
            <Form.Item
              name="backgroundGoal"
              rules={[{ required: true, message: "请输入业务背景与目标" }]}
              className="!mb-0"
            >
              <MarkdownField
                rows={14}
                placeholder="例如：&#10;- 当前业务问题&#10;- 目标用户和使用场景&#10;- 本次需求希望达到的结果"
              />
            </Form.Item>
          </PageSection>
        </Form>
      </FormPage>
    </>
  );
}
