"use client";

import { useState, useTransition } from "react";

import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import EditOutlined from "@ant-design/icons/EditOutlined";
import KeyOutlined from "@ant-design/icons/KeyOutlined";
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
  message,
} from "antd";
import type { TableProps } from "antd";
import { useRouter } from "next/navigation";

import {
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  updateUserAction,
} from "@/app/actions/users";
import { UserRole } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/date-time";

type UserItem = {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
};

type UserValues = {
  username: string;
  password?: string;
  role: UserRole;
};

export function UserManagement({
  users,
  currentUserId,
}: {
  users: UserItem[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [userForm] = Form.useForm<UserValues>();
  const [passwordForm] = Form.useForm<{ password: string }>();
  const [editingUser, setEditingUser] = useState<UserItem | null>();
  const [passwordUser, setPasswordUser] = useState<UserItem | null>();
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditingUser(null);
    userForm.setFieldsValue({
      username: "",
      password: "",
      role: UserRole.MEMBER,
    });
    setUserModalOpen(true);
  }

  function openEdit(user: UserItem) {
    setEditingUser(user);
    userForm.setFieldsValue({
      username: user.username,
      role: user.role,
    });
    setUserModalOpen(true);
  }

  function saveUser(values: UserValues) {
    startTransition(async () => {
      const result = editingUser
        ? await updateUserAction({
            id: editingUser.id,
            username: values.username,
            role: values.role,
          })
        : await createUserAction(values);

      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }

      messageApi.success(result.message);
      setUserModalOpen(false);
      router.refresh();
    });
  }

  function resetPassword(values: { password: string }) {
    if (!passwordUser) return;
    startTransition(async () => {
      const result = await resetUserPasswordAction({
        id: passwordUser.id,
        password: values.password,
      });
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      setPasswordUser(null);
      passwordForm.resetFields();
    });
  }

  function deleteUser(id: string) {
    startTransition(async () => {
      const result = await deleteUserAction(id);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.refresh();
    });
  }

  const columns: TableProps<UserItem>["columns"] = [
    {
      title: "用户名",
      dataIndex: "username",
      render: (username: string, user) => (
        <Space>
          <strong>{username}</strong>
          {user.id === currentUserId ? <Tag color="cyan">当前用户</Tag> : null}
        </Space>
      ),
    },
    {
      title: "角色",
      dataIndex: "role",
      width: 150,
      render: (role: UserRole) =>
        role === UserRole.ADMIN ? (
          <Tag color="blue">管理员</Tag>
        ) : (
          <Tag>普通用户</Tag>
        ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 190,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 270,
      render: (_, user) => (
        <Space size={2}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(user)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => setPasswordUser(user)}
          >
            重置密码
          </Button>
          <Popconfirm
            title="删除用户"
            description="删除后该用户将立即无法登录，且不能恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteUser(user.id)}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={user.id === currentUserId}
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
      <div className="content-panel">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <span className="text-sm text-slate-500">
            共 {users.length} 个用户
          </span>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建用户
          </Button>
        </div>
        <Table<UserItem>
          rowKey="id"
          columns={columns}
          dataSource={users}
          pagination={false}
        />
      </div>

      <Modal
        title={editingUser ? "编辑用户" : "新建用户"}
        open={userModalOpen}
        onCancel={() => setUserModalOpen(false)}
        footer={null}
        destroyOnHidden
        width={480}
      >
        <Form<UserValues>
          form={userForm}
          layout="vertical"
          requiredMark={false}
          onFinish={saveUser}
          className="pt-3"
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input maxLength={50} autoComplete="off" />
          </Form.Item>
          {!editingUser ? (
            <Form.Item
              name="password"
              label="初始密码"
              rules={[
                { required: true, message: "请输入初始密码" },
                { min: 8, message: "密码至少需要 8 位" },
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          ) : null}
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "管理员", value: UserRole.ADMIN },
                { label: "普通用户", value: UserRole.MEMBER },
              ]}
            />
          </Form.Item>
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setUserModalOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isPending}>
              保存
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={`重置密码${passwordUser ? `：${passwordUser.username}` : ""}`}
        open={Boolean(passwordUser)}
        onCancel={() => setPasswordUser(null)}
        footer={null}
        destroyOnHidden
        width={460}
      >
        <p className="mb-5 text-sm text-slate-500">
          新密码保存后立即生效，该用户的现有会话将全部失效。
        </p>
        <Form<{ password: string }>
          form={passwordForm}
          layout="vertical"
          requiredMark={false}
          onFinish={resetPassword}
        >
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 8, message: "密码至少需要 8 位" },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setPasswordUser(null)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isPending}>
              保存新密码
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
