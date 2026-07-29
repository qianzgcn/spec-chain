"use client";

import { useState, useTransition } from "react";

import CopyOutlined from "@ant-design/icons/CopyOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import MoreOutlined from "@ant-design/icons/MoreOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import {
  Button,
  Dropdown,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from "antd";
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
import { RequirementStatus } from "@/generated/prisma/enums";
import { formatCompactDateTime } from "@/lib/date-time";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";

export type RequirementListItem = {
  id: string;
  type: "FEATURE" | "USER_STORY";
  code: string;
  title: string;
  featureName: string | null;
  status: RequirementStatus;
  childCount: number | null;
  updatedAt: string;
};

type RequirementFilters = {
  q: string;
  type: string;
  status: string;
  feature: string;
  page: number;
};

export function RequirementsList({
  items,
  total,
  filters,
  featureOptions,
}: {
  items: RequirementListItem[];
  total: number;
  filters: RequirementFilters;
  featureOptions: Array<{ id: string; name: string; code: string }>;
}) {
  const router = useRouter();
  const { isNavigating, navigate } = useNavigationFeedback();
  const [messageApi, messageContext] = message.useMessage();
  const [query, setQuery] = useState(filters.q);
  const [isPending, startTransition] = useTransition();

  function updateQuery(
    changes: Partial<Omit<RequirementFilters, "page">> & { page?: number },
  ) {
    const next = { ...filters, ...changes };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.type) params.set("type", next.type);
    if (next.status) params.set("status", next.status);
    if (next.feature) params.set("feature", next.feature);
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
        messageApi.success("Markdown 已复制");
      } catch {
        messageApi.error("浏览器未允许访问剪贴板");
      }
    });
  }

  function changeStatus(id: string, status: RequirementStatus) {
    startTransition(async () => {
      const result = await updateUserStoryStatusAction(id, status);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.refresh();
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
      title: "编号",
      dataIndex: "code",
      width: 175,
      render: (code: string) => (
        <span className="font-mono text-xs text-slate-600">{code}</span>
      ),
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 65,
      render: (type: RequirementListItem["type"]) =>
        type === "FEATURE" ? <Tag>FE</Tag> : <Tag>US</Tag>,
    },
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
          <Link
            href={href}
            className="font-medium text-slate-800 hover:text-blue-700"
          >
            {title}
          </Link>
        );
      },
    },
    {
      title: "所属 FE",
      dataIndex: "featureName",
      width: 150,
      ellipsis: true,
      responsive: ["lg"],
      render: (featureName: string | null, item) => {
        if (item.type === "FEATURE") {
          return (
            <span className="text-slate-500">{item.childCount ?? 0} 个 US</span>
          );
        }
        return featureName || <span className="text-slate-400">未归属 FE</span>;
      },
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 105,
      render: (status: RequirementStatus, item) =>
        item.type === "USER_STORY" ? (
          <Select
            size="small"
            variant="borderless"
            value={status}
            disabled={isPending}
            className="w-24"
            onChange={(value) => changeStatus(item.id, value)}
            options={Object.values(RequirementStatus).map((value) => ({
              value,
              label: REQUIREMENT_STATUS_META[value].label,
            }))}
          />
        ) : (
          <Tag color={REQUIREMENT_STATUS_META[status].color}>
            {REQUIREMENT_STATUS_META[status].label}
          </Tag>
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
      width: 155,
      render: (_, item) => {
        const detailPath =
          item.type === "FEATURE"
            ? `/features/${item.id}`
            : `/user-stories/${item.id}`;
        const editPath = `${detailPath}/edit`;
        return (
          <Space size={2}>
            <Button type="link" size="small" href={detailPath}>
              查看
            </Button>
            <Button type="link" size="small" href={editPath}>
              编辑
            </Button>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  ...(item.type === "FEATURE"
                    ? [
                        {
                          key: "child",
                          icon: <PlusOutlined />,
                          label: "新建US",
                          onClick: () =>
                            navigate(`/features/${item.id}/user-stories/new`),
                        },
                      ]
                    : []),
                  {
                    key: "copy",
                    icon: <CopyOutlined />,
                    label: "复制 Markdown",
                    disabled: isPending,
                    onClick: () => copyRequirement(item),
                  },
                  { type: "divider" as const },
                  {
                    key: "delete",
                    icon: <DeleteOutlined />,
                    label: "删除",
                    danger: true,
                    disabled: isPending,
                    onClick: () => confirmDeleteRequirement(item),
                  },
                ],
              }}
            >
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                aria-label="更多操作"
              />
            </Dropdown>
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
            onSearch={() => updateQuery({ q: query.trim(), page: 1 })}
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
          <Select
            className="w-56"
            value={filters.feature || undefined}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部 FE 归属"
            onChange={(feature = "") => updateQuery({ feature, page: 1 })}
            options={[
              { value: "independent", label: "未归属 FE" },
              ...featureOptions.map((feature) => ({
                value: feature.id,
                label: `${feature.code} · ${feature.name}`,
              })),
            ]}
          />
          {filters.q || filters.type || filters.status || filters.feature ? (
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
