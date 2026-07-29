"use client";

import { useState, useTransition } from "react";

import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import { Button, Form, Popconfirm, Space, Tag, message } from "antd";
import { useRouter } from "next/navigation";

import {
  confirmPendingRequirementAction,
  deletePendingRequirementAction,
  updatePendingRequirementAction,
} from "@/app/actions/pending-requirements";
import { FormPage } from "@/components/layout/form-page";
import {
  UserStoryFields,
  type UserStoryFormValues,
} from "@/components/requirements/user-story-fields";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";

export function PendingRequirementForm({
  draftId,
  feature,
  initialValues,
}: {
  draftId: string;
  feature: { id: string; code: string; name: string } | null;
  initialValues: UserStoryFormValues;
}) {
  const router = useRouter();
  const [form] = Form.useForm<UserStoryFormValues>();
  const [messageApi, messageContext] = message.useMessage();
  const [dirty, setDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "save" | "confirm" | "delete" | null
  >(null);
  const [isPending, startTransition] = useTransition();
  useUnsavedChanges(dirty);

  function save(values: UserStoryFormValues) {
    setPendingAction("save");
    startTransition(async () => {
      const result = await updatePendingRequirementAction(draftId, values);
      if (!result.ok) {
        setPendingAction(null);
        messageApi.error(result.message);
        return;
      }

      if (result.data) {
        form.setFieldValue(
          "acceptanceCriteria",
          result.data.acceptanceCriteria,
        );
      }
      setDirty(false);
      setPendingAction(null);
      messageApi.success(result.message);
      router.refresh();
    });
  }

  function confirm() {
    void form
      .validateFields()
      .then((values) => {
        setPendingAction("confirm");
        startTransition(async () => {
          const saveResult = await updatePendingRequirementAction(
            draftId,
            values,
          );
          if (!saveResult.ok) {
            setPendingAction(null);
            messageApi.error(saveResult.message);
            return;
          }

          const result = await confirmPendingRequirementAction(draftId);
          if (!result.ok || !result.data) {
            setPendingAction(null);
            messageApi.error(result.message);
            return;
          }

          setDirty(false);
          messageApi.success(result.message);
          router.push(`/user-stories/${result.data.id}`);
          router.refresh();
        });
      })
      .catch(() => undefined);
  }

  function remove() {
    setPendingAction("delete");
    startTransition(async () => {
      const result = await deletePendingRequirementAction(draftId);
      if (!result.ok) {
        setPendingAction(null);
        messageApi.error(result.message);
        return;
      }

      setDirty(false);
      messageApi.success(result.message);
      router.push("/requirements/pending-review");
      router.refresh();
    });
  }

  function backToList() {
    if (confirmLeaveIfDirty()) {
      router.push("/requirements/pending-review");
    }
  }

  return (
    <>
      {messageContext}
      <FormPage
        title="评审需求"
        description="检查并完善 AI 生成的内容；确认后才会创建正式 US。"
        meta={
          <Space size={8}>
            <Tag>AI 生成</Tag>
            <Tag color="gold">待评审</Tag>
            {feature ? (
              <span>
                所属 FE：{feature.code} · {feature.name}
              </span>
            ) : (
              <span>未归属 FE</span>
            )}
          </Space>
        }
        actions={
          <Space wrap>
            <Popconfirm
              title="删除待评审需求"
              description="删除后不能恢复，AI 执行记录仍会保留。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={remove}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={isPending && pendingAction === "delete"}
              >
                删除
              </Button>
            </Popconfirm>
            <Button onClick={backToList}>返回列表</Button>
            <Button
              htmlType="submit"
              form="pending-requirement-form"
              loading={isPending && pendingAction === "save"}
              disabled={!dirty}
            >
              保存草稿
            </Button>
            <Button
              type="primary"
              loading={isPending && pendingAction === "confirm"}
              onClick={confirm}
            >
              确认创建US
            </Button>
          </Space>
        }
      >
        <Form<UserStoryFormValues>
          id="pending-requirement-form"
          form={form}
          className="form-page__form"
          layout="vertical"
          requiredMark={false}
          initialValues={initialValues}
          onValuesChange={() => setDirty(true)}
          onFinish={save}
        >
          <UserStoryFields showStatus={false} />
        </Form>
      </FormPage>
    </>
  );
}
