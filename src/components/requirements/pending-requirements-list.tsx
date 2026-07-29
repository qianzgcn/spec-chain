"use client";

import { Button, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";

import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { formatCompactDateTime, formatDetailedDateTime } from "@/lib/date-time";

export type PendingRequirementListItem = {
  id: string;
  title: string;
  feature: { code: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

export function PendingRequirementsList({
  items,
  total,
  page,
}: {
  items: PendingRequirementListItem[];
  total: number;
  page: number;
}) {
  const { isNavigating, navigate } = useNavigationFeedback();
  const columns: TableProps<PendingRequirementListItem>["columns"] = [
    {
      title: "标题",
      dataIndex: "title",
      ellipsis: true,
      render: (title: string) => (
        <Typography.Text strong ellipsis={{ tooltip: title }}>
          {title}
        </Typography.Text>
      ),
    },
    {
      title: "所属 FE",
      dataIndex: "feature",
      width: 230,
      ellipsis: true,
      responsive: ["lg"],
      render: (feature: PendingRequirementListItem["feature"]) =>
        feature ? (
          <span title={`${feature.code} · ${feature.name}`}>
            {feature.code} · {feature.name}
          </span>
        ) : (
          <Tag>未归属 FE</Tag>
        ),
    },
    {
      title: "生成时间",
      dataIndex: "createdAt",
      width: 170,
      responsive: ["xl"],
      render: (value: string) => formatDetailedDateTime(value),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
      render: (value: string) => formatCompactDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 88,
      align: "center",
      render: (_, item) => (
        <Button
          type="link"
          size="small"
          href={`/requirements/pending-review/${item.id}`}
        >
          评审
        </Button>
      ),
    },
  ];

  function changePage(nextPage: number) {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set("page", String(nextPage));
    navigate(`/requirements/pending-review${params.size ? `?${params}` : ""}`);
  }

  return (
    <div className="content-panel table-page-panel">
      <div className="table-toolbar">
        <span className="table-toolbar__summary">共 {total} 条待评审需求</span>
      </div>
      <Table<PendingRequirementListItem>
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={isNavigating}
        tableLayout="fixed"
        scroll={{ y: "100%" }}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          showSizeChanger: false,
          showTotal: (count) => `共 ${count} 条需求`,
          onChange: changePage,
        }}
        locale={{ emptyText: "暂无待评审需求" }}
      />
    </div>
  );
}
