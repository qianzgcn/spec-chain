"use client";

import { useState, useTransition } from "react";

import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { TableProps } from "antd";
import { useRouter } from "next/navigation";

import {
  bindUserStoryModelAction,
  checkAiModelProfileAction,
  createAiModelProfileAction,
  deleteAiModelProfileAction,
  updateAiModelProfileAction,
} from "@/app/actions/ai-settings";
import { formatCompactDateTime } from "@/lib/date-time";

type ModelProfileItem = {
  id: string;
  name: string;
  baseUrl: string;
  modelId: string;
  updatedAt: string;
};

type ModelProfileValues = {
  name: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
};

export function AiSettingsManagement({
  profiles,
  defaultProfileId,
}: {
  profiles: ModelProfileItem[];
  defaultProfileId: string | null;
}) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [form] = Form.useForm<ModelProfileValues>();
  const [editingProfile, setEditingProfile] = useState<ModelProfileItem | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [checkingProfileId, setCheckingProfileId] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditingProfile(null);
    form.setFieldsValue({
      name: "",
      baseUrl: "",
      modelId: "",
      apiKey: "",
    });
    setModalOpen(true);
  }

  function openEdit(profile: ModelProfileItem) {
    setEditingProfile(profile);
    form.setFieldsValue({
      name: profile.name,
      baseUrl: profile.baseUrl,
      modelId: profile.modelId,
      apiKey: "",
    });
    setModalOpen(true);
  }

  function saveProfile(values: ModelProfileValues) {
    startTransition(async () => {
      const result = editingProfile
        ? await updateAiModelProfileAction({
            id: editingProfile.id,
            ...values,
          })
        : await createAiModelProfileAction(values);

      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }

      form.setFieldValue("apiKey", "");
      setModalOpen(false);
      messageApi.success(result.message);
      router.refresh();
    });
  }

  function bindDefaultModel(profileId: string) {
    startTransition(async () => {
      const result = await bindUserStoryModelAction(profileId);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.refresh();
    });
  }

  function checkProfile(profileId: string) {
    setCheckingProfileId(profileId);
    startTransition(async () => {
      const result = await checkAiModelProfileAction(profileId);
      setCheckingProfileId(null);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
    });
  }

  function deleteProfile(profileId: string) {
    startTransition(async () => {
      const result = await deleteAiModelProfileAction(profileId);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.refresh();
    });
  }

  const columns: TableProps<ModelProfileItem>["columns"] = [
    {
      title: "模型名称",
      dataIndex: "name",
      ellipsis: true,
      render: (name: string, profile) => (
        <Space>
          <Typography.Text strong>{name}</Typography.Text>
          {profile.id === defaultProfileId ? (
            <Tag color="cyan">生成 US 默认</Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: "Base URL",
      dataIndex: "baseUrl",
      width: 220,
      ellipsis: true,
      responsive: ["lg"],
      render: (value: string) => (
        <Typography.Text code title={value}>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: "模型 ID",
      dataIndex: "modelId",
      width: 180,
      ellipsis: true,
      render: (value: string) => (
        <Typography.Text code title={value}>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: "API Key",
      key: "apiKey",
      width: 90,
      responsive: ["xl"],
      render: () => <span className="text-slate-500">••••••••</span>,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 145,
      responsive: ["xl"],
      render: (value: string) => formatCompactDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 155,
      render: (_, profile) => (
        <Space size={2}>
          <Button
            type="link"
            size="small"
            loading={checkingProfileId === profile.id}
            disabled={
              isPending &&
              checkingProfileId !== null &&
              checkingProfileId !== profile.id
            }
            onClick={() => checkProfile(profile.id)}
          >
            检查
          </Button>
          <Button type="link" size="small" onClick={() => openEdit(profile)}>
            编辑
          </Button>
          <Popconfirm
            title="删除模型配置"
            description="删除后 API Key 将立即清除，且不能恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteProfile(profile.id)}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label="删除"
              disabled={profile.id === defaultProfileId}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      {messageContext}
      <div className="content-panel table-page-panel">
        <div className="table-toolbar">
          <span className="text-sm font-medium text-slate-700">
            生成 US 默认模型
          </span>
          <Select
            className="w-72"
            aria-label="生成 US 默认模型"
            value={defaultProfileId ?? undefined}
            placeholder="请选择默认模型"
            options={profiles.map((profile) => ({
              value: profile.id,
              label: `${profile.name} · ${profile.modelId}`,
            }))}
            disabled={profiles.length === 0 || isPending}
            onChange={bindDefaultModel}
          />
          <span className="text-xs text-slate-500">
            用户发起任务时自动使用该模型
          </span>
          <Button
            className="ml-auto"
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
          >
            新建模型
          </Button>
        </div>

        <Table<ModelProfileItem>
          rowKey="id"
          columns={columns}
          dataSource={profiles}
          tableLayout="fixed"
          scroll={{ y: "100%" }}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (count) => `共 ${count} 个模型`,
          }}
          locale={{ emptyText: "尚未配置模型" }}
        />
      </div>

      <Modal
        title={editingProfile ? "编辑模型" : "新建模型"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
        width={620}
      >
        <Form<ModelProfileValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          className="pt-3"
          onFinish={saveProfile}
        >
          <Form.Item
            name="name"
            label="模型名称"
            rules={[{ required: true, message: "请输入模型名称" }]}
          >
            <Input maxLength={100} placeholder="例如：DeepSeek 生产模型" />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="OpenAI 兼容 Base URL"
            rules={[{ required: true, message: "请输入 Base URL" }]}
            extra="填写兼容接口的根地址，例如 https://api.deepseek.com/v1。"
          >
            <Input maxLength={500} placeholder="https://api.example.com/v1" />
          </Form.Item>
          <Form.Item
            name="modelId"
            label="模型 ID"
            rules={[{ required: true, message: "请输入模型 ID" }]}
          >
            <Input maxLength={200} placeholder="例如：deepseek-chat" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={
              editingProfile
                ? []
                : [{ required: true, message: "请输入模型 API Key" }]
            }
            extra={
              editingProfile
                ? "已配置的密钥不会回显；留空表示保留原值。"
                : "密钥使用 AES-256-GCM 加密保存，之后不会回显。"
            }
          >
            <Input.Password
              maxLength={4_000}
              autoComplete="new-password"
              placeholder={editingProfile ? "留空保留原 API Key" : ""}
            />
          </Form.Item>
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setModalOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isPending}>
              保存
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
