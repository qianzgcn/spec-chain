"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import {
  createProjectAction,
  deleteProjectAction,
  switchProjectAction,
} from "@/app/actions/projects";
import { useNavigationFeedback } from "@/components/app-shell/navigation-feedback";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/date-time";
import {
  projectFormSchema,
  type ProjectFormValues,
} from "@/lib/projects/schema";

type ProjectItem = {
  id: string;
  name: string;
  description: string | null;
  baseUrl: string | null;
  updatedAt: string;
  _count: {
    features: number;
    userStories: number;
    testCases: number;
  };
};

const PAGE_SIZE = 20;

export function ProjectManagement({
  projects,
  currentProjectId,
}: {
  projects: ProjectItem[];
  currentProjectId: string | null;
}) {
  const router = useRouter();
  const { navigate } = useNavigationFeedback();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectItem | null>(null);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: "", description: "" },
  });

  const pageCount = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = projects.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function closeCreateDialog() {
    if (isPending) return;
    setCreateOpen(false);
    form.reset();
  }

  function createProject(values: ProjectFormValues) {
    startTransition(async () => {
      const result = await createProjectAction(values);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      setCreateOpen(false);
      form.reset();
      toast.add({ type: "success", description: result.message });
      navigate("/project-settings");
      router.refresh();
    });
  }

  function switchProject(projectId: string, destination = "/requirements") {
    startTransition(async () => {
      const result = await switchProjectAction(projectId);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      navigate(destination);
      router.refresh();
    });
  }

  function deleteProject() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteProjectAction(deleteTarget.id);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      setDeleteTarget(null);
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  const columns: ColumnDef<ProjectItem>[] = [
    {
      accessorKey: "name",
      header: "项目名称",
      size: 220,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.original.name}</span>
          {row.original.id === currentProjectId ? (
            <Badge variant="secondary">当前项目</Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "描述",
      meta: { cellClassName: "truncate text-muted-foreground" },
      cell: ({ row }) => row.original.description || "—",
    },
    {
      id: "business",
      header: "业务内容",
      size: 180,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          FE {row.original._count.features} · US{" "}
          {row.original._count.userStories} · 用例{" "}
          {row.original._count.testCases}
        </span>
      ),
    },
    {
      accessorKey: "baseUrl",
      header: "Base URL",
      size: 190,
      meta: {
        headerClassName: "max-[1500px]:hidden",
        cellClassName: "max-[1500px]:hidden truncate text-muted-foreground",
      },
      cell: ({ row }) => row.original.baseUrl || "未配置",
    },
    {
      accessorKey: "updatedAt",
      header: "更新时间",
      size: 180,
      meta: {
        headerClassName: "max-[1700px]:hidden",
        cellClassName: "max-[1700px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => formatDateTime(row.original.updatedAt),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      size: 164,
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          {row.original.id !== currentProjectId ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => switchProject(row.original.id)}
            >
              切换
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => switchProject(row.original.id, "/project-settings")}
          >
            设置
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="更多操作" />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2Icon />
                  删除
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTableShell
        toolbar={
          <>
            <span className="text-muted-foreground text-sm">
              共 {projects.length} 个项目
            </span>
            <Button className="ml-auto" onClick={() => setCreateOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              新建项目
            </Button>
          </>
        }
        footer={
          <DataTablePagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={projects.length}
            itemName="个项目"
            onChange={setPage}
          />
        }
      >
        <DataTable
          columns={columns}
          data={pageItems}
          loading={isPending}
          emptyText="还没有项目"
          getRowId={(project) => project.id}
        />
      </DataTableShell>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog();
        }}
      >
        <DialogContent>
          <form onSubmit={form.handleSubmit(createProject)}>
            <DialogHeader>
              <DialogTitle>新建项目</DialogTitle>
              <DialogDescription>
                需求、测试用例和项目配置都会归属于该项目。
              </DialogDescription>
            </DialogHeader>
            <div className="py-5">
              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.name)}>
                  <FieldLabel htmlFor="new-project-name">项目名称</FieldLabel>
                  <Input
                    id="new-project-name"
                    maxLength={100}
                    autoFocus
                    placeholder="例如：订单管理平台"
                    aria-invalid={Boolean(form.formState.errors.name)}
                    {...form.register("name")}
                  />
                  <FieldError errors={[form.formState.errors.name]} />
                </Field>
                <Field
                  data-invalid={Boolean(form.formState.errors.description)}
                >
                  <FieldLabel htmlFor="new-project-description">
                    项目描述
                  </FieldLabel>
                  <Textarea
                    id="new-project-description"
                    rows={4}
                    maxLength={1_000}
                    placeholder="简要说明项目范围和用途"
                    aria-invalid={Boolean(form.formState.errors.description)}
                    {...form.register("description")}
                  />
                  <FieldError errors={[form.formState.errors.description]} />
                </Field>
              </FieldGroup>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={closeCreateDialog}
              >
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Spinner data-icon="inline-start" /> : null}
                创建项目
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除项目"
        description="项目删除后不可恢复，确认继续吗？"
        confirmLabel="删除"
        destructive
        pending={isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={deleteProject}
      />
    </>
  );
}
