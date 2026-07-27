"use client";

import { useTransition } from "react";

import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import EditOutlined from "@ant-design/icons/EditOutlined";
import { Button, Popconfirm, Space, message } from "antd";
import { useRouter } from "next/navigation";

import { deleteTestCaseAction } from "@/app/actions/test-cases";

export function TestCaseDetailActions({ id }: { id: string }) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteTestCaseAction(id);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.push("/test-cases");
      router.refresh();
    });
  }

  return (
    <>
      {messageContext}
      <Space>
        <Button icon={<EditOutlined />} href={`/test-cases/${id}/edit`}>
          编辑
        </Button>
        <Popconfirm
          title="删除测试用例"
          description="删除后不能恢复，运行历史仍会保留。"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={remove}
        >
          <Button danger icon={<DeleteOutlined />} disabled={isPending}>
            删除
          </Button>
        </Popconfirm>
      </Space>
    </>
  );
}
