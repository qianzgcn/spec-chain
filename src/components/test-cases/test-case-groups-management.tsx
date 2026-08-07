"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import {
  createTestCaseGroupAction,
  deleteTestCaseGroupAction,
  updateTestCaseGroupAction,
} from "@/app/actions/test-cases";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/date-time";
import {
  testCaseGroupFormSchema,
  type TestCaseGroupFormValues,
} from "@/lib/test-cases/schema";

type GroupItem = {
  id: string;
  name: string;
  testCaseCount: number;
  updatedAt: string;
};

const PAGE_SIZE = 20;

export function TestCaseGroupsManagement({ groups }: { groups: GroupItem[] }) {
  const router = useRouter();
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroupItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const form = useForm<TestCaseGroupFormValues>({
    resolver: zodResolver(testCaseGroupFormSchema),
    defaultValues: { name: "" },
  });

  const pageCount = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = groups.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function openCreate() {
    setEditingGroup(null);
    form.reset({ name: "" });
    setDialogOpen(true);
  }

  function openEdit(group: GroupItem) {
    setEditingGroup(group);
    form.reset({ name: group.name });
    setDialogOpen(true);
  }

  function closeDialog() {
    if (isPending) return;
    setDialogOpen(false);
    setEditingGroup(null);
    form.reset({ name: "" });
  }

  function submit(values: TestCaseGroupFormValues) {
    startTransition(async () => {
      const result = editingGroup
        ? await updateTestCaseGroupAction(editingGroup.id, values.name)
        : await createTestCaseGroupAction(values.name);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      setDialogOpen(false);
      setEditingGroup(null);
      form.reset({ name: "" });
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  function remove() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteTestCaseGroupAction(deleteTarget.id);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      setDeleteTarget(null);
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  const columns: ColumnDef<GroupItem>[] = [
    {
      accessorKey: "name",
      header: "分组名称",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "testCaseCount",
      header: "用例数量",
      size: 140,
      cell: ({ row }) => (
        <Link
          href={`/test-cases?group=${encodeURIComponent(row.original.id)}`}
          className="font-medium underline-offset-4 hover:underline"
          aria-label={`查看 ${row.original.name} 分组的 ${row.original.testCaseCount} 个测试用例`}
        >
          {row.original.testCaseCount} 个
        </Link>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "更新时间",
      size: 180,
      meta: { cellClassName: "text-muted-foreground" },
      cell: ({ row }) => formatDateTime(row.original.updatedAt),
    },
    {
      id: "actions",
      header: "操作",
      size: 96,
      meta: { headerClassName: "text-left", cellClassName: "text-left" },
      cell: ({ row }) => (
        <DataTableRowActions
          actions={[
            {
              label: "编辑",
              onClick: () => openEdit(row.original),
            },
            {
              label: "删除",
              icon: <Trash2Icon />,
              disabled: isPending || row.original.testCaseCount > 0,
              destructive: true,
              onClick: () => setDeleteTarget(row.original),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <DataTableShell
        toolbar={
          <>
            <span className="text-muted-foreground text-sm">
              平级分组；包含测试用例的分组不能删除。
            </span>
            <Button className="ml-auto" onClick={openCreate}>
              <PlusIcon data-icon="inline-start" />
              新建分组
            </Button>
          </>
        }
        footer={
          <DataTablePagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={groups.length}
            itemName="个分组"
            onChange={setPage}
          />
        }
      >
        <DataTable
          columns={columns}
          data={pageItems}
          loading={isPending}
          emptyText="还没有用例分组"
          getRowId={(group) => group.id}
        />
      </DataTableShell>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <form onSubmit={form.handleSubmit(submit)}>
            <DialogHeader>
              <DialogTitle>
                {editingGroup ? "编辑分组" : "新建分组"}
              </DialogTitle>
              <DialogDescription>
                分组名称用于在测试用例列表和表单中快速定位用例。
              </DialogDescription>
            </DialogHeader>
            <div className="py-5">
              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.name)}>
                  <FieldLabel htmlFor="test-case-group-name">
                    分组名称
                  </FieldLabel>
                  <Input
                    id="test-case-group-name"
                    maxLength={100}
                    autoFocus
                    placeholder="例如：订单退款"
                    aria-invalid={Boolean(form.formState.errors.name)}
                    {...form.register("name")}
                  />
                  <FieldError errors={[form.formState.errors.name]} />
                </Field>
              </FieldGroup>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={closeDialog}
              >
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Spinner data-icon="inline-start" /> : null}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除分组"
        description="删除后不能恢复，确认继续吗？"
        confirmLabel="删除"
        destructive
        pending={isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={remove}
      />
    </>
  );
}
