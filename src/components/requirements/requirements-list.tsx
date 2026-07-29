"use client";

import { useState, useTransition } from "react";

import PlusOutlined from "@ant-design/icons/PlusOutlined";
import { Button, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import type { TableProps } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteFeatureAction,
  deleteUserStoryAction,
  getRequirementMarkdownAction,
  updateUserStoryStatusAction,
} from "@/app/actions/requirements";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { RequirementStatusBadge } from "@/components/requirements/requirement-status-badge";
import { RequirementStatusSelectControl } from "@/components/requirements/requirement-status-select-control";
import { RequirementStatus } from "@/generated/prisma/enums";
import { formatCompactDateTime } from "@/lib/date-time";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";

export type RequirementListItem = {
  id: string;
  type: "FEATURE" | "USER_STORY";
  code: string;
  title: string;
  status: RequirementStatus;
  childCount: number | null;
  updatedAt: string;
  autoExpand?: boolean;
  children?: RequirementListItem[];
};

type RequirementFilters = {
  q: string;
  type: string;
  status: string;
  page: number;
};

export function RequirementsList({
  items,
  total,
  filters,
}: {
  items: RequirementListItem[];
  total: number;
  filters: RequirementFilters;
}) {
  const router = useRouter();
  const { isNavigating, navigate } = useNavigationFeedback();
  const [messageApi, messageContext] = message.useMessage();
  const [query, setQuery] = useState(filters.q);
  const [isPending, startTransition] = useTransition();
  const [, startStatusTransition] = useTransition();
  const [updatingStoryId, setUpdatingStoryId] = useState<string | null>(null);
  const autoExpandedRowKeys = items
    .filter((item) => item.type === "FEATURE" && item.autoExpand)
    .map((item) => `FEATURE-${item.id}`);
  const expansionKey = `${filters.q}\u0000${autoExpandedRowKeys.join(",")}`;
  const [expansion, setExpansion] = useState({
    key: expansionKey,
    rowKeys: autoExpandedRowKeys,
  });
  const expandedRowKeys =
    expansion.key === expansionKey ? expansion.rowKeys : autoExpandedRowKeys;

  function updateQuery(
    changes: Partial<Omit<RequirementFilters, "page">> & { page?: number },
  ) {
    const next = { ...filters, ...changes };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.type) params.set("type", next.type);
    if (next.status) params.set("status", next.status);
    if (next.page > 1) params.set("page", String(next.page));
    navigate(`/requirements${params.size ? `?${params}` : ""}`);
  }

  function copyRequirement(item: RequirementListItem) {
    startTransition(async () => {
      const result = await getRequirementMarkdownAction(item.type, item.id);
      if (!result.ok || !result.data) {
        messageApi.error(result.message);
        return;
      }
      try {
        await navigator.clipboard.writeText(result.data.markdown);
        messageApi.success("需求内容已复制");
      } catch {
        messageApi.error("浏览器未允许访问剪贴板");
      }
    });
  }

  function changeStatus(id: string, status: RequirementStatus) {
    if (updatingStoryId) return;

    setUpdatingStoryId(id);
    startStatusTransition(async () => {
      try {
        const result = await updateUserStoryStatusAction(id, status);
        if (!result.ok) {
          messageApi.error(result.message);
          return;
        }
        messageApi.success(result.message);
        router.refresh();
      } finally {
        setUpdatingStoryId(null);
      }
    });
  }

  function deleteRequirement(item: RequirementListItem) {
    startTransition(async () => {
      const result =
        item.type === "FEATURE"
          ? await deleteFeatureAction(item.id)
          : await deleteUserStoryAction(item.id);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.refresh();
    });
  }

  function confirmDeleteRequirement(item: RequirementListItem) {
    Modal.confirm({
      title: `删除${item.type === "FEATURE" ? " FE" : " US"}`,
      content:
        item.type === "FEATURE"
          ? `将同时删除 ${item.childCount ?? 0} 个关联 US，且不能恢复。`
          : "删除后不能恢复，不会影响已关联的测试用例。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => deleteRequirement(item),
    });
  }

  const columns: TableProps<RequirementListItem>["columns"] = [
    {
      title: "名称",
      dataIndex: "title",
      ellipsis: true,
      render: (title: string, item) => {
        const href =
          item.type === "FEATURE"
            ? `/features/${item.id}`
            : `/user-stories/${item.id}`;
        return (
          <div className="requirement-name">
            <Link href={href}>{title}</Link>
            {item.type === "FEATURE" ? (
              <span>{item.childCount ?? 0} 个 US</span>
            ) : null}
          </div>
        );
      },
    },
    {
      title: "编号",
      dataIndex: "code",
      width: 184,
      render: (code: string) => (
        <span className="font-mono text-xs text-slate-600">{code}</span>
      ),
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 60,
      render: (type: RequirementListItem["type"]) =>
        type === "FEATURE" ? <Tag>FE</Tag> : <Tag>US</Tag>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 116,
      onCell: () => ({ className: "requirement-status-cell" }),
      render: (status: RequirementStatus, item) =>
        item.type === "USER_STORY" ? (
          <RequirementStatusSelectControl
            value={status}
            disabled={updatingStoryId === item.id}
            loading={updatingStoryId === item.id}
            onChange={(value) => changeStatus(item.id, value)}
          />
        ) : (
          <span className="requirement-status-display">
            <RequirementStatusBadge status={status} />
          </span>
        ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 135,
      responsive: ["xl"],
      render: (value: string) => formatCompactDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 304,
      render: (_, item) => {
        const basePath =
          item.type === "FEATURE"
            ? `/features/${item.id}`
            : `/user-stories/${item.id}`;
        return (
          <Space size={8} className="requirement-actions">
            <Button type="link" size="small" href={`${basePath}/edit`}>
              编辑
            </Button>
            {item.type === "FEATURE" ? (
              <Button
                type="link"
                size="small"
                onClick={() =>
                  navigate(`/features/${item.id}/user-stories/new`)
                }
              >
                新建US
              </Button>
            ) : null}
            <Button
              type="link"
              size="small"
              disabled={isPending}
              onClick={() => copyRequirement(item)}
            >
              复制内容
            </Button>
            <Button
              type="link"
              size="small"
              danger
              disabled={isPending}
              onClick={() => confirmDeleteRequirement(item)}
            >
              删除
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      {messageContext}
      <div className="content-panel table-page-panel">
        <div className="table-toolbar">
          <Input.Search
            className="table-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onSearch={(value) => {
              const normalizedQuery = value.trim();
              setQuery(normalizedQuery);
              updateQuery({ q: normalizedQuery, page: 1 });
            }}
            placeholder="搜索编号或名称"
            allowClear
          />
          <Select
            className="w-32"
            value={filters.type || undefined}
            allowClear
            placeholder="全部类型"
            onChange={(type = "") => updateQuery({ type, page: 1 })}
            options={[
              { value: "FEATURE", label: "FE" },
              { value: "USER_STORY", label: "US" },
            ]}
          />
          <Select
            className="w-32"
            value={filters.status || undefined}
            allowClear
            placeholder="全部状态"
            onChange={(status = "") => updateQuery({ status, page: 1 })}
            options={Object.values(RequirementStatus).map((status) => ({
              value: status,
              label: REQUIREMENT_STATUS_META[status].label,
            }))}
          />
          {filters.q || filters.type || filters.status ? (
            <Button
              type="link"
              onClick={() => {
                setQuery("");
                navigate("/requirements");
              }}
            >
              重置筛选
            </Button>
          ) : null}
          <div className="table-toolbar__actions">
            <Button icon={<PlusOutlined />} href="/user-stories/new">
              新建US
            </Button>
            <Button type="primary" icon={<PlusOutlined />} href="/features/new">
              新建 FE
            </Button>
          </div>
        </div>
        <Table<RequirementListItem>
          rowKey={(item) => `${item.type}-${item.id}`}
          columns={columns}
          dataSource={items}
          loading={isPending || isNavigating}
          tableLayout="fixed"
          expandable={{
            childrenColumnName: "children",
            indentSize: 24,
            rowExpandable: (item) =>
              item.type === "FEATURE" && Boolean(item.children?.length),
            expandedRowKeys,
            onExpandedRowsChange: (rowKeys) =>
              setExpansion({
                key: expansionKey,
                rowKeys: rowKeys.map(String),
              }),
          }}
          rowClassName={(item) =>
            item.type === "FEATURE"
              ? "requirement-row requirement-row--feature"
              : "requirement-row requirement-row--story"
          }
          scroll={{ y: "100%" }}
          pagination={{
            current: filters.page,
            pageSize: 20,
            total,
            showSizeChanger: false,
            showTotal: (count) => `共 ${count} 条需求`,
            onChange: (page) => updateQuery({ page }),
          }}
        />
      </div>
    </>
  );
}
