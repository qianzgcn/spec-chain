"use client";

import { useState, useTransition } from "react";

import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  message,
} from "antd";
import type { TableProps } from "antd";
import { useRouter } from "next/navigation";

import {
  createProjectAction,
  deleteProjectAction,
  switchProjectAction,
} from "@/app/actions/projects";
import { formatDateTime } from "@/lib/date-time";

type ProjectItem = {
  id: string;
  name: string;
  description: string | null;
  baseUrl: string | null;
  updatedAt: string;
  _count: {
    features: number;
    userStories: number;
    testCases: number;
  };
};

type ProjectFormValues = {
  name: string;
  description?: string;
};

export function ProjectManagement({
  projects,
  currentProjectId,
}: {
  projects: ProjectItem[];
  currentProjectId: string | null;
}) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [form] = Form.useForm<ProjectFormValues>();
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function createProject(values: ProjectFormValues) {
    startTransition(async () => {
      const result = await createProjectAction(values);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      setCreateOpen(false);
      form.resetFields();
      router.push("/project-settings");
      router.refresh();
    });
  }

  function switchProject(projectId: string, destination = "/requirements") {
    startTransition(async () => {
      const result = await switchProjectAction(projectId);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      router.push(destination);
      router.refresh();
    });
  }

  function deleteProject(projectId: string) {
    startTransition(async () => {
      const result = await deleteProjectAction(projectId);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.refresh();
    });
  }

  const columns: TableProps<ProjectItem>["columns"] = [
    {
      title: "项目名称",
      dataIndex: "name",
      width: 190,
      render: (name: string, item) => (
        <Space size={8}>
          <strong>{name}</strong>
          {item.id === currentProjectId ? (
            <Tag color="cyan">当前项目</Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: "描述",
      dataIndex: "description",
      ellipsis: true,
      render: (description: string | null) => description || "—",
    },
    {
      title: "业务内容",
      width: 150,
      responsive: ["lg"],
      render: (_, item) => (
        <span className="text-slate-600">
          FE {item._count.features} · US {item._count.userStories} · 用例{" "}
          {item._count.testCases}
        </span>
      ),
    },
    {
      title: "Base URL",
      dataIndex: "baseUrl",
      width: 180,
      ellipsis: true,
      responsive: ["xl"],
      render: (baseUrl: string | null) => baseUrl || "未配置",
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 145,
      responsive: ["xxl"],
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 155,
      render: (_, item) => (
        <Space size={4}>
          {item.id !== currentProjectId ? (
            <Button
              type="link"
              size="small"
              onClick={() => switchProject(item.id)}
              disabled={isPending}
            >
              切换
            </Button>
          ) : null}
          <Button
            type="link"
            size="small"
            onClick={() => switchProject(item.id, "/project-settings")}
            disabled={isPending}
          >
            设置
          </Button>
          <Popconfirm
            title="删除项目"
            description="项目删除后不可恢复，确认继续吗？"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteProject(item.id)}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label="删除"
              disabled={isPending}
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
          <span className="table-toolbar__summary">
            共 {projects.length} 个项目
          </span>
          <Button
            className="ml-auto"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建项目
          </Button>
        </div>
        <Table<ProjectItem>
          rowKey="id"
          columns={columns}
          dataSource={projects}
          tableLayout="fixed"
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (count) => `共 ${count} 个项目`,
          }}
          scroll={{ y: "100%" }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有项目，请先新建项目"
              />
            ),
          }}
        />
      </div>

      <Modal
        title="新建项目"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnHidden
        width={520}
      >
        <Form<ProjectFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={createProject}
          className="pt-3"
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: "请输入项目名称" }]}
          >
            <Input maxLength={100} placeholder="例如：订单管理平台" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea
              rows={4}
              maxLength={1000}
              showCount
              placeholder="简要说明项目范围和用途"
            />
          </Form.Item>
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isPending}>
              创建项目
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
