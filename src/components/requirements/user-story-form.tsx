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
  Popconfirm,
  Select,
  Space,
  Typography,
  message,
} from "antd";
import { useRouter } from "next/navigation";

import {
  createUserStoryAction,
  updateUserStoryAction,
} from "@/app/actions/requirements";
import {
  confirmUserStoryDraftAction,
  deleteUserStoryDraftAction,
  updateUserStoryDraftAction,
} from "@/app/actions/ai-executions";
import { MarkdownField } from "@/components/markdown/markdown-field";
import { RequirementStatus } from "@/generated/prisma/enums";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";
import {
  confirmLeaveIfDirty,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";

type CriterionValue = {
  id?: string;
  given: string;
  when: string;
  then: string;
};

export type UserStoryFormValues = {
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  status: RequirementStatus;
  acceptanceCriteria: CriterionValue[];
  businessRules: string;
  nonFunctionalRequirements: string;
};

type UserStoryFormProps = {
  userStoryId?: string;
  draftId?: string;
  sourceExecutionId?: string;
  feature?: {
    id: string;
    code: string;
    name: string;
  } | null;
  initialValues?: UserStoryFormValues;
};

export function UserStoryForm({
  userStoryId,
  draftId,
  sourceExecutionId,
  feature,
  initialValues,
}: UserStoryFormProps) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [form] = Form.useForm<UserStoryFormValues>();
  const [dirty, setDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "save" | "confirm" | "delete" | null
  >(null);
  const [isPending, startTransition] = useTransition();
  useUnsavedChanges(dirty);

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
    setPendingAction("save");
    startTransition(async () => {
      if (draftId) {
        const result = await updateUserStoryDraftAction(draftId, values);
        if (!result.ok) {
          setPendingAction(null);
          messageApi.error(result.message);
          return;
        }

        setDirty(false);
        messageApi.success(result.message);
        if (result.data) {
          form.setFieldValue(
            "acceptanceCriteria",
            result.data.acceptanceCriteria,
          );
        }
        setPendingAction(null);
        router.refresh();
        return;
      }

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

  function confirmDraft() {
    if (!draftId) return;

    void form
      .validateFields()
      .then((values) => {
        setPendingAction("confirm");
        startTransition(async () => {
          const saveResult = await updateUserStoryDraftAction(draftId, values);
          if (!saveResult.ok) {
            setPendingAction(null);
            messageApi.error(saveResult.message);
            return;
          }

          const confirmResult = await confirmUserStoryDraftAction(draftId);
          if (!confirmResult.ok || !confirmResult.data) {
            setPendingAction(null);
            messageApi.error(confirmResult.message);
            return;
          }

          setDirty(false);
          messageApi.success(confirmResult.message);
          router.push(`/user-stories/${confirmResult.data.id}`);
          router.refresh();
        });
      })
      .catch(() => undefined);
  }

  function deleteDraft() {
    if (!draftId) return;

    setPendingAction("delete");
    startTransition(async () => {
      const result = await deleteUserStoryDraftAction(draftId);
      if (!result.ok) {
        setPendingAction(null);
        messageApi.error(result.message);
        return;
      }

      setDirty(false);
      messageApi.success(result.message);
      router.push(
        sourceExecutionId
          ? `/ai-executions/${sourceExecutionId}`
          : "/ai-executions",
      );
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
      <Form<UserStoryFormValues>
        form={form}
        className="form-panel"
        layout="vertical"
        requiredMark={false}
        initialValues={defaults}
        onValuesChange={() => setDirty(true)}
        onFinish={submit}
      >
        {feature ? (
          <Alert
            className="mb-5"
            type="info"
            showIcon
            title={`所属 FE：${feature.code} · ${feature.name}`}
            description="US 创建后不能迁移或解除归属。"
          />
        ) : null}

        <div
          className={
            draftId
              ? "grid grid-cols-1"
              : "grid grid-cols-[minmax(0,1fr)_180px] gap-5"
          }
        >
          <Form.Item
            name="title"
            label="US 标题"
            rules={[{ required: true, message: "请输入 US 标题" }]}
          >
            <Input maxLength={150} showCount />
          </Form.Item>
          {draftId ? (
            <Form.Item name="status" hidden>
              <Input />
            </Form.Item>
          ) : (
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select
                options={Object.values(RequirementStatus).map((status) => ({
                  value: status,
                  label: REQUIREMENT_STATUS_META[status].label,
                }))}
              />
            </Form.Item>
          )}
        </div>

        <Divider titlePlacement="left">用户故事</Divider>

        <Form.Item
          name="asA"
          label="As"
          rules={[{ required: true, message: "As 不能为空" }]}
          extra="谁需要这个能力？请描述具体用户或业务角色。"
        >
          <Input.TextArea rows={2} placeholder="例如：作为一名客服主管" />
        </Form.Item>
        <Form.Item
          name="iWant"
          label="I want"
          rules={[{ required: true, message: "I want 不能为空" }]}
          extra="这个角色希望完成什么目标或获得什么能力？"
        >
          <Input.TextArea
            rows={3}
            placeholder="例如：我希望批量分配待处理工单"
          />
        </Form.Item>
        <Form.Item
          name="soThat"
          label="so that"
          rules={[{ required: true, message: "so that 不能为空" }]}
          extra="实现后带来什么业务价值？"
        >
          <Input.TextArea
            rows={2}
            placeholder="例如：从而减少重复操作并缩短响应时间"
          />
        </Form.Item>

        <Divider titlePlacement="left">验收标准</Divider>

        <Form.List
          name="acceptanceCriteria"
          rules={[
            {
              validator: async (_, criteria) => {
                if (!criteria?.length) {
                  throw new Error("至少需要一条验收标准");
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
                    <Typography.Text strong>
                      验收标准 {index + 1}
                    </Typography.Text>
                    <Space size={2}>
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        aria-label="上移"
                        onClick={() => move(index, index - 1)}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={index === fields.length - 1}
                        aria-label="下移"
                        onClick={() => move(index, index + 1)}
                      />
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="删除验收标准"
                        disabled={fields.length === 1}
                        onClick={() => remove(field.name)}
                      />
                    </Space>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <Form.Item
                      name={[field.name, "given"]}
                      label="Given"
                      rules={[{ required: true, message: "Given 不能为空" }]}
                      className="!mb-0"
                    >
                      <Input.TextArea
                        rows={4}
                        placeholder="前置条件或初始上下文"
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "when"]}
                      label="When"
                      rules={[{ required: true, message: "When 不能为空" }]}
                      className="!mb-0"
                    >
                      <Input.TextArea
                        rows={4}
                        placeholder="用户执行的操作或事件"
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "then"]}
                      label="Then"
                      rules={[{ required: true, message: "Then 不能为空" }]}
                      className="!mb-0"
                    >
                      <Input.TextArea
                        rows={4}
                        placeholder="可观察、可验证的结果"
                      />
                    </Form.Item>
                  </div>
                </div>
              ))}

              <Form.ErrorList errors={errors} />
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add({ given: "", when: "", then: "" })}
              >
                添加验收标准
              </Button>
            </Space>
          )}
        </Form.List>

        <Divider titlePlacement="left">补充约束</Divider>

        <Form.Item
          name="businessRules"
          label="业务规则（可选）"
          extra="支持 Markdown，可记录权限矩阵、状态转换、页面交互、历史兼容、边界和限制。"
        >
          <MarkdownField rows={9} placeholder="没有业务规则时可以留空" />
        </Form.Item>

        <Form.Item
          name="nonFunctionalRequirements"
          label="非功能需求（可选）"
          extra="支持 Markdown，可记录性能、安全、可用性、兼容性和可观测性要求。"
        >
          <MarkdownField rows={8} placeholder="没有非功能需求时可以留空" />
        </Form.Item>

        <div className="form-actions">
          {draftId ? (
            <>
              <Popconfirm
                title="删除 US 草稿"
                description="删除后不能恢复，但 AI 执行记录仍会保留。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={deleteDraft}
              >
                <Button
                  danger
                  loading={isPending && pendingAction === "delete"}
                >
                  删除草稿
                </Button>
              </Popconfirm>
              <div className="flex-1" />
              <Button onClick={cancel}>返回</Button>
              <Button
                htmlType="submit"
                loading={isPending && pendingAction === "save"}
              >
                保存草稿
              </Button>
              <Button
                type="primary"
                loading={isPending && pendingAction === "confirm"}
                onClick={confirmDraft}
              >
                确认创建US
              </Button>
            </>
          ) : (
            <>
              <Button onClick={cancel}>取消</Button>
              <Button type="primary" htmlType="submit" loading={isPending}>
                保存
              </Button>
            </>
          )}
        </div>
      </Form>
    </>
  );
}
