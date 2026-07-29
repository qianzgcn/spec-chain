"use client";

import { useState, useTransition } from "react";

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
  Switch,
  Table,
  Tag,
  message,
} from "antd";
import type { TableProps } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteTestCaseAction,
  setTestCaseEnabledAction,
} from "@/app/actions/test-cases";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { RunStatus, TestPriority } from "@/generated/prisma/enums";
import { formatCompactDateTime } from "@/lib/date-time";
import { RUN_STATUS_META, TEST_PRIORITY_META } from "@/lib/test-cases/meta";

export type TestCaseListItem = {
  id: string;
  code: string;
  name: string;
  groupName: string;
  priority: TestPriority;
  enabled: boolean;
  hasScript: boolean;
  stepCount: number;
  lastRunStatus: RunStatus | null;
  updatedAt: string;
};

type TestCaseFilters = {
  q: string;
  group: string;
  priority: string;
  enabled: string;
  page: number;
};

export function TestCasesList({
  items,
  total,
  filters,
  groups,
}: {
  items: TestCaseListItem[];
  total: number;
  filters: TestCaseFilters;
  groups: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const { isNavigating, navigate } = useNavigationFeedback();
  const [messageApi, messageContext] = message.useMessage();
  const [query, setQuery] = useState(filters.q);
  const [isPending, startTransition] = useTransition();

  function updateQuery(
    changes: Partial<Omit<TestCaseFilters, "page">> & { page?: number },
  ) {
    const next = { ...filters, ...changes };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.group) params.set("group", next.group);
    if (next.priority) params.set("priority", next.priority);
    if (next.enabled) params.set("enabled", next.enabled);
    if (next.page > 1) params.set("page", String(next.page));
    navigate(`/test-cases${params.size ? `?${params}` : ""}`);
  }

  function changeEnabled(id: string, enabled: boolean) {
    startTransition(async () => {
      const result = await setTestCaseEnabledAction(id, enabled);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteTestCaseAction(id);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.refresh();
    });
  }

  function confirmRemove(item: TestCaseListItem) {
    Modal.confirm({
      title: "删除测试用例",
      content: "删除后不能恢复，运行历史仍会保留。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => remove(item.id),
    });
  }

  const columns: TableProps<TestCaseListItem>["columns"] = [
    {
      title: "编号",
      dataIndex: "code",
      width: 170,
      responsive: ["lg"],
      render: (code: string) => (
        <span className="font-mono text-xs text-slate-600">{code}</span>
      ),
    },
    {
      title: "用例名称",
      dataIndex: "name",
      ellipsis: true,
      render: (name: string, item) => (
        <Link
          href={`/test-cases/${item.id}`}
          className="font-medium text-slate-800 hover:text-blue-700"
        >
          {name}
        </Link>
      ),
    },
    {
      title: "分组",
      dataIndex: "groupName",
      width: 120,
      ellipsis: true,
      responsive: ["lg"],
    },
    {
      title: "优先级",
      dataIndex: "priority",
      width: 70,
      render: (priority: TestPriority) => (
        <Tag color={TEST_PRIORITY_META[priority].color}>{priority}</Tag>
      ),
    },
    {
      title: "步骤",
      dataIndex: "stepCount",
      width: 60,
      responsive: ["xl"],
      render: (count: number) => `${count} 条`,
    },
    {
      title: "自动化",
      dataIndex: "hasScript",
      width: 80,
      responsive: ["xl"],
      render: (hasScript: boolean) =>
        hasScript ? (
          <Tag>已配置</Tag>
        ) : (
          <span className="text-slate-400">未配置</span>
        ),
    },
    {
      title: "最近运行",
      dataIndex: "lastRunStatus",
      width: 90,
      responsive: ["lg"],
      render: (status: RunStatus | null) =>
        status ? (
          <Tag color={RUN_STATUS_META[status].color}>
            {RUN_STATUS_META[status].label}
          </Tag>
        ) : (
          <span className="text-slate-400">尚未运行</span>
        ),
    },
    {
      title: "启用",
      dataIndex: "enabled",
      width: 60,
      render: (enabled: boolean, item) => (
        <Switch
          size="small"
          checked={enabled}
          disabled={isPending}
          onChange={(checked) => changeEnabled(item.id, checked)}
        />
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 135,
      responsive: ["xxl"],
      render: (value: string) => formatCompactDateTime(value),
    },
    {
      title: "操作",
      width: 160,
      align: "center",
      render: (_, item) => (
        <Space
          className="w-full justify-center"
          size={2}
          data-testid="test-case-actions"
        >
          <Button type="link" size="small" href={`/test-cases/${item.id}`}>
            查看
          </Button>
          <Button type="link" size="small" href={`/test-cases/${item.id}/edit`}>
            编辑
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                {
                  key: "delete",
                  icon: <DeleteOutlined />,
                  label: "删除",
                  danger: true,
                  disabled: isPending,
                  onClick: () => confirmRemove(item),
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
      ),
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
            placeholder="搜索编号或用例名称"
            allowClear
          />
          <Select
            className="w-48"
            value={filters.group || undefined}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部分组"
            onChange={(group = "") => updateQuery({ group, page: 1 })}
            options={groups.map((group) => ({
              value: group.id,
              label: group.name,
            }))}
          />
          <Select
            className="w-32"
            value={filters.priority || undefined}
            allowClear
            placeholder="全部优先级"
            onChange={(priority = "") => updateQuery({ priority, page: 1 })}
            options={Object.values(TestPriority).map((priority) => ({
              value: priority,
              label: priority,
            }))}
          />
          <Select
            className="w-32"
            value={filters.enabled || undefined}
            allowClear
            placeholder="全部状态"
            onChange={(enabled = "") => updateQuery({ enabled, page: 1 })}
            options={[
              { value: "true", label: "已启用" },
              { value: "false", label: "已停用" },
            ]}
          />
          {filters.q || filters.group || filters.priority || filters.enabled ? (
            <Button
              type="link"
              onClick={() => {
                setQuery("");
                navigate("/test-cases");
              }}
            >
              重置筛选
            </Button>
          ) : null}
          <Button
            type="primary"
            className="ml-auto"
            icon={<PlusOutlined />}
            href="/test-cases/new"
          >
            新建用例
          </Button>
        </div>
        <Table<TestCaseListItem>
          rowKey="id"
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
            showTotal: (count) => `共 ${count} 条用例`,
            onChange: (page) => updateQuery({ page }),
          }}
          locale={{ emptyText: "还没有测试用例" }}
        />
      </div>
    </>
  );
}
