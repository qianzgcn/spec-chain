"use client";

import { Button, Space, Table, Tag } from "antd";
import type { TableProps } from "antd";

import { RequirementStatus } from "@/generated/prisma/enums";
import { formatCompactDateTime } from "@/lib/date-time";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";

type ChildStory = {
  id: string;
  code: string;
  title: string;
  status: RequirementStatus;
  updatedAt: string;
};

export function FeatureChildrenTable({ items }: { items: ChildStory[] }) {
  const columns: TableProps<ChildStory>["columns"] = [
    {
      title: "编号",
      dataIndex: "code",
      width: 205,
      render: (code: string) => (
        <span className="font-mono text-xs text-slate-600">{code}</span>
      ),
    },
    { title: "US 标题", dataIndex: "title", ellipsis: true },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (status: RequirementStatus) => (
        <Tag color={REQUIREMENT_STATUS_META[status].color}>
          {REQUIREMENT_STATUS_META[status].label}
        </Tag>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 170,
      render: (value: string) => formatCompactDateTime(value),
    },
    {
      title: "操作",
      width: 145,
      render: (_, item) => (
        <Space size={2}>
          <Button type="link" size="small" href={`/user-stories/${item.id}`}>
            查看
          </Button>
          <Button
            type="link"
            size="small"
            href={`/user-stories/${item.id}/edit`}
          >
            编辑
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table<ChildStory>
      rowKey="id"
      dataSource={items}
      columns={columns}
      pagination={false}
      locale={{ emptyText: "还没有子 US" }}
    />
  );
}
