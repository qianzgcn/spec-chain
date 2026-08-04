"use client";

import { useState, useTransition } from "react";

import type { ColumnDef, ExpandedState, Updater } from "@tanstack/react-table";
import { ChevronRightIcon, CopyIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteFeatureAction,
  deleteUserStoryAction,
  getRequirementMarkdownAction,
  updateUserStoryStatusAction,
} from "@/app/actions/requirements";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { SearchInput } from "@/components/data-table/search-input";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ButtonLink } from "@/components/navigation/button-link";
import { RequirementStatusBadge } from "@/components/requirements/requirement-status-badge";
import { RequirementStatusSelectControl } from "@/components/requirements/requirement-status-select-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { RequirementStatus } from "@/generated/prisma/enums";
import { formatCompactDateTime } from "@/lib/date-time";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";
import { cn } from "@/lib/utils";

export type RequirementListItem = {
  id: string;
  type: "FEATURE" | "USER_STORY";
  code: string;
  title: string;
  status: RequirementStatus;
  createdBy: string | null;
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

const TYPE_OPTIONS = [
  { label: "全部类型", value: null },
  { label: "FE", value: "FEATURE" },
  { label: "US", value: "USER_STORY" },
];

const STATUS_OPTIONS = [
  { label: "全部状态", value: null },
  ...Object.values(RequirementStatus).map((status) => ({
    value: status,
    label: REQUIREMENT_STATUS_META[status].label,
  })),
];

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
  const [query, setQuery] = useState(filters.q);
  const [isPending, startTransition] = useTransition();
  const [, startStatusTransition] = useTransition();
  const [updatingStoryId, setUpdatingStoryId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RequirementListItem | null>(
    null,
  );
  const autoExpanded = Object.fromEntries(
    items
      .filter((item) => item.type === "FEATURE" && item.autoExpand)
      .map((item) => [`FEATURE-${item.id}`, true]),
  );
  const expansionKey = `${filters.q}\u0000${Object.keys(autoExpanded).join(",")}`;
  const [expansion, setExpansion] = useState<{
    key: string;
    value: ExpandedState;
  }>({ key: expansionKey, value: autoExpanded });
  const expanded =
    expansion.key === expansionKey ? expansion.value : autoExpanded;

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
        toast.add({ type: "error", description: result.message });
        return;
      }
      try {
        await navigator.clipboard.writeText(result.data.markdown);
        toast.add({ type: "success", description: "需求内容已复制" });
      } catch {
        toast.add({
          type: "error",
          description: "浏览器未允许访问剪贴板",
        });
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
          toast.add({ type: "error", description: result.message });
          return;
        }
        toast.add({ type: "success", description: result.message });
        router.refresh();
      } finally {
        setUpdatingStoryId(null);
      }
    });
  }

  function deleteRequirement() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result =
        deleteTarget.type === "FEATURE"
          ? await deleteFeatureAction(deleteTarget.id)
          : await deleteUserStoryAction(deleteTarget.id);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      setDeleteTarget(null);
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  function changeExpanded(updater: Updater<ExpandedState>) {
    const next = typeof updater === "function" ? updater(expanded) : updater;
    setExpansion({ key: expansionKey, value: next });
  }

  const columns: ColumnDef<RequirementListItem>[] = [
    {
      accessorKey: "title",
      header: "名称",
      cell: ({ row }) => {
        const item = row.original;
        const href =
          item.type === "FEATURE"
            ? `/features/${item.id}`
            : `/user-stories/${item.id}`;

        return (
          <div
            className="flex min-w-0 items-center gap-2"
            style={{ paddingLeft: row.depth * 20 }}
          >
            {row.getCanExpand() ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={row.getIsExpanded() ? "收起行" : "展开行"}
                onClick={row.getToggleExpandedHandler()}
              >
                <ChevronRightIcon
                  className={cn(
                    "transition-transform",
                    row.getIsExpanded() && "rotate-90",
                  )}
                />
              </Button>
            ) : (
              <span className="size-6 shrink-0" aria-hidden />
            )}
            <Link
              href={href}
              className="text-link min-w-0 truncate font-medium underline-offset-4 hover:underline"
              title={item.title}
            >
              {item.title}
            </Link>
            {item.type === "FEATURE" ? (
              <span className="text-muted-foreground shrink-0 text-xs">
                {item.childCount ?? 0} 个 US
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "code",
      header: "编号",
      size: 184,
      meta: { cellClassName: "font-mono text-xs text-muted-foreground" },
    },
    {
      accessorKey: "type",
      header: "类型",
      size: 64,
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.type === "FEATURE" ? "FE" : "US"}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      size: 116,
      cell: ({ row }) =>
        row.original.type === "USER_STORY" ? (
          <RequirementStatusSelectControl
            value={row.original.status}
            disabled={updatingStoryId === row.original.id}
            loading={updatingStoryId === row.original.id}
            onChange={(value) => changeStatus(row.original.id, value)}
          />
        ) : (
          <RequirementStatusBadge status={row.original.status} />
        ),
    },
    {
      accessorKey: "createdBy",
      header: "创建人",
      size: 120,
      cell: ({ row }) => (
        <span
          className="text-muted-foreground block truncate"
          title={row.original.createdBy ?? "--"}
        >
          {row.original.createdBy ?? "--"}
        </span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "更新时间",
      size: 140,
      meta: {
        headerClassName: "max-[1440px]:hidden",
        cellClassName: "max-[1440px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => formatCompactDateTime(row.original.updatedAt),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      size: 204,
      meta: { headerClassName: "text-left", cellClassName: "text-left" },
      cell: ({ row }) => {
        const item = row.original;
        const basePath =
          item.type === "FEATURE"
            ? `/features/${item.id}`
            : `/user-stories/${item.id}`;

        const actions = [
          {
            label: "编辑",
            href: `${basePath}/edit`,
          },
          ...(item.type === "FEATURE"
            ? [
                {
                  label: "新建US",
                  onClick: () =>
                    navigate(`/features/${item.id}/user-stories/new`),
                },
              ]
            : []),
          {
            label: "复制内容",
            icon: <CopyIcon />,
            disabled: isPending,
            onClick: () => copyRequirement(item),
          },
          {
            label: "删除",
            icon: <Trash2Icon />,
            disabled: isPending,
            destructive: true,
            onClick: () => setDeleteTarget(item),
          },
        ];

        return <DataTableRowActions actions={actions} />;
      },
    },
  ];

  return (
    <>
      <DataTableShell
        toolbar={
          <>
            <SearchInput
              value={query}
              placeholder="搜索编号或名称"
              onChange={setQuery}
              onSearch={(value) => updateQuery({ q: value, page: 1 })}
            />
            <Select
              items={TYPE_OPTIONS}
              value={filters.type || null}
              onValueChange={(value) =>
                updateQuery({ type: value ?? "", page: 1 })
              }
            >
              <SelectTrigger className="w-32" aria-label="需求类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value ?? "all"}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={STATUS_OPTIONS}
              value={filters.status || null}
              onValueChange={(value) =>
                updateQuery({ status: value ?? "", page: 1 })
              }
            >
              <SelectTrigger className="w-32" aria-label="需求状态筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value ?? "all"}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {filters.q || filters.type || filters.status ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setQuery("");
                  navigate("/requirements");
                }}
              >
                重置筛选
              </Button>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <ButtonLink href="/user-stories/new">新建US</ButtonLink>
              <ButtonLink href="/features/new" variant="outline">
                新建 FE
              </ButtonLink>
            </div>
          </>
        }
        footer={
          <DataTablePagination
            page={filters.page}
            pageSize={20}
            total={total}
            itemName="条需求"
            onChange={(page) => updateQuery({ page })}
          />
        }
      >
        <DataTable
          columns={columns}
          data={items}
          loading={isPending || isNavigating}
          emptyText="还没有需求"
          getRowId={(item) => `${item.type}-${item.id}`}
          getSubRows={(item) => item.children}
          expanded={expanded}
          onExpandedChange={changeExpanded}
          rowClassName={(row) =>
            row.original.type === "FEATURE" ? "bg-muted/20" : undefined
          }
        />
      </DataTableShell>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`删除${deleteTarget?.type === "FEATURE" ? " FE" : " US"}`}
        description={
          deleteTarget?.type === "FEATURE"
            ? `将同时删除 ${deleteTarget.childCount ?? 0} 个关联 US，且不能恢复。`
            : "删除后不能恢复，不会影响已关联的测试用例。"
        }
        confirmLabel="删除"
        destructive
        pending={isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={deleteRequirement}
      />
    </>
  );
}
