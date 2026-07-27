"use client";

import { useState, useTransition } from "react";

import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import EditOutlined from "@ant-design/icons/EditOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  message,
} from "antd";
import type { TableProps } from "antd";
import { useRouter } from "next/navigation";

import {
  createTestCaseGroupAction,
  deleteTestCaseGroupAction,
  updateTestCaseGroupAction,
} from "@/app/actions/test-cases";
import { formatDateTime } from "@/lib/date-time";

type GroupItem = {
  id: string;
  name: string;
  testCaseCount: number;
  updatedAt: string;
};

type GroupFormValues = {
  name: string;
};

export function TestCaseGroupsManagement({ groups }: { groups: GroupItem[] }) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [form] = Form.useForm<GroupFormValues>();
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditingGroup(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(group: GroupItem) {
    setEditingGroup(group);
    form.setFieldsValue({ name: group.name });
    setModalOpen(true);
  }

  function submit(values: GroupFormValues) {
    startTransition(async () => {
      const result = editingGroup
        ? await updateTestCaseGroupAction(editingGroup.id, values.name)
        : await createTestCaseGroupAction(values.name);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }

      messageApi.success(result.message);
      setModalOpen(false);
      form.resetFields();
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteTestCaseGroupAction(id);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }

      messageApi.success(result.message);
      router.refresh();
    });
  }

  const columns: TableProps<GroupItem>["columns"] = [
    {
      title: "分组名称",
      dataIndex: "name",
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: "用例数量",
      dataIndex: "testCaseCount",
      width: 140,
      render: (count: number) => `${count} 个`,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "操作",
      width: 170,
      render: (_, group) => (
        <Space size={2}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(group)}
          >
            编辑
          </Button>
          <Popconfirm
            title="删除分组"
            description={
              group.testCaseCount > 0
                ? "该分组仍有测试用例，不能删除。"
                : "删除后不能恢复，确认继续吗？"
            }
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={group.testCaseCount > 0}
            onConfirm={() => remove(group.id)}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={isPending || group.testCaseCount > 0}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      {messageContext}
      <div className="content-panel max-w-[1000px]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <span className="text-sm text-slate-500">
            平级分组；包含未删除用例的分组不能删除。
          </span>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建分组
          </Button>
        </div>
        <Table<GroupItem>
          rowKey="id"
          columns={columns}
          dataSource={groups}
          loading={isPending}
          pagination={false}
          locale={{ emptyText: "还没有用例分组" }}
        />
      </div>

      <Modal
        title={editingGroup ? "编辑分组" : "新建分组"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
        width={480}
      >
        <Form<GroupFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          className="pt-3"
          onFinish={submit}
        >
          <Form.Item
            name="name"
            label="分组名称"
            rules={[{ required: true, message: "请输入分组名称" }]}
          >
            <Input
              maxLength={100}
              showCount
              autoFocus
              placeholder="例如：订单退款"
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
