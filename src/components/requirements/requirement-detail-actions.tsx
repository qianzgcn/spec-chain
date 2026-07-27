"use client";

import { useTransition } from "react";

import CopyOutlined from "@ant-design/icons/CopyOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import EditOutlined from "@ant-design/icons/EditOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import { Button, Popconfirm, Space, message } from "antd";
import { useRouter } from "next/navigation";

import {
  deleteFeatureAction,
  deleteUserStoryAction,
  getRequirementMarkdownAction,
} from "@/app/actions/requirements";

export function RequirementDetailActions({
  type,
  id,
  childCount = 0,
}: {
  type: "FEATURE" | "USER_STORY";
  id: string;
  childCount?: number;
}) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [isPending, startTransition] = useTransition();
  const basePath =
    type === "FEATURE" ? `/features/${id}` : `/user-stories/${id}`;

  function copy() {
    startTransition(async () => {
      const result = await getRequirementMarkdownAction(type, id);
      if (!result.ok || !result.data) {
        messageApi.error(result.message);
        return;
      }
      try {
        await navigator.clipboard.writeText(result.data.markdown);
        messageApi.success("Markdown 已复制");
      } catch {
        messageApi.error("浏览器未允许访问剪贴板");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result =
        type === "FEATURE"
          ? await deleteFeatureAction(id)
          : await deleteUserStoryAction(id);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.push("/requirements");
      router.refresh();
    });
  }

  return (
    <>
      {messageContext}
      <Space>
        {type === "FEATURE" ? (
          <Button
            icon={<PlusOutlined />}
            href={`/features/${id}/user-stories/new`}
          >
            新建子 US
          </Button>
        ) : null}
        <Button icon={<CopyOutlined />} onClick={copy} loading={isPending}>
          复制 Markdown
        </Button>
        <Button icon={<EditOutlined />} href={`${basePath}/edit`}>
          编辑
        </Button>
        <Popconfirm
          title={`删除${type === "FEATURE" ? " FE" : " US"}`}
          description={
            type === "FEATURE"
              ? `将同时删除 ${childCount} 个子 US，且不能恢复。`
              : "删除后不能恢复，不会影响测试用例。"
          }
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
