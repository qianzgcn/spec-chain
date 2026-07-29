"use client";

import { useState, useTransition } from "react";

import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import { Alert, Button, Form, Space, Tag, message } from "antd";
import { useRouter } from "next/navigation";

import {
  createUserStoryAction,
  updateUserStoryAction,
} from "@/app/actions/requirements";
import { FormPage } from "@/components/layout/form-page";
import {
  UserStoryFields,
  type UserStoryFormValues,
} from "@/components/requirements/user-story-fields";
import { RequirementStatus } from "@/generated/prisma/enums";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";

export type { UserStoryFormValues };

type UserStoryFormProps = {
  userStoryId?: string;
  code?: string;
  feature?: {
    id: string;
    code: string;
    name: string;
  } | null;
  initialValues?: UserStoryFormValues;
};

export function UserStoryForm({
  userStoryId,
  code,
  feature,
  initialValues,
}: UserStoryFormProps) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  useUnsavedChanges(dirty);

  const editing = Boolean(userStoryId);
  const formId = editing ? "edit-user-story-form" : "new-user-story-form";
  const defaults: UserStoryFormValues = initialValues ?? {
    title: "",
    asA: "",
    iWant: "",
    soThat: "",
    status: RequirementStatus.DESIGN,
    acceptanceCriteria: [{ given: "", when: "", then: "" }],
    businessRules: "",
    nonFunctionalRequirements: "",
  };

  function submit(values: UserStoryFormValues) {
    startTransition(async () => {
      const result = userStoryId
        ? await updateUserStoryAction(userStoryId, values)
        : await createUserStoryAction({
            ...values,
            featureId: feature?.id ?? null,
          });
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }

      setDirty(false);
      messageApi.success(result.message);
      const targetId = userStoryId ?? result.data?.id;
      router.push(targetId ? `/user-stories/${targetId}` : "/requirements");
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
        title={editing ? "编辑 US" : "新建US"}
        description={
          editing
            ? "调整用户故事、验收标准和实现约束。"
            : "编写边界清楚、可开发、可验证的用户故事。"
        }
        meta={
          editing && code ? (
            <span className="page-code">{code}</span>
          ) : feature ? (
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
            {!editing ? (
              <Button
                icon={<ThunderboltOutlined />}
                href={
                  feature
                    ? `/user-stories/ai-generate?featureId=${feature.id}`
                    : "/user-stories/ai-generate"
                }
              >
                AI辅助生成US
              </Button>
            ) : null}
            <Button onClick={cancel}>取消</Button>
            <Button
              type="primary"
              htmlType="submit"
              form={formId}
              loading={isPending}
              disabled={editing && !dirty}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Form<UserStoryFormValues>
          id={formId}
          className="form-page__form"
          layout="vertical"
          requiredMark={false}
          initialValues={defaults}
          onValuesChange={() => setDirty(true)}
          onFinish={submit}
        >
          {feature ? (
            <Alert
              className="form-context-alert"
              type="info"
              showIcon
              title={`所属 FE：${feature.code} · ${feature.name}`}
              description="US 创建后不能迁移或解除归属。"
            />
          ) : null}
          <UserStoryFields showStatus />
        </Form>
      </FormPage>
    </>
  );
}
