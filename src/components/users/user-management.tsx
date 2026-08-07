"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import {
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  updateUserAction,
} from "@/app/actions/users";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { UserRole } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/date-time";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { USER_ROLE_META } from "@/lib/users/meta";
import {
  resetPasswordFormSchema,
  type ResetPasswordFormValues,
  userFormSchema,
  type UserFormValues,
} from "@/lib/users/schema";

type UserItem = {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
};

const PAGE_SIZE = 20;
const ROLE_OPTIONS = [
  { label: "管理员", value: UserRole.ADMIN },
  { label: "普通用户", value: UserRole.MEMBER },
];

export function UserManagement({
  users,
  currentUserId,
}: {
  users: UserItem[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isPending, startTransition] = useTransition();
  const userForm = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      id: undefined,
      username: "",
      password: "",
      role: UserRole.MEMBER,
    },
  });
  const passwordForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: "" },
  });

  const pageCount = Math.max(1, Math.ceil(users.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = users.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function openCreate() {
    setEditingUser(null);
    userForm.reset({
      id: undefined,
      username: "",
      password: "",
      role: UserRole.MEMBER,
    });
    setUserDialogOpen(true);
  }

  function openEdit(user: UserItem) {
    setEditingUser(user);
    userForm.reset({
      id: user.id,
      username: user.username,
      password: "",
      role: user.role,
    });
    setUserDialogOpen(true);
  }

  function closeUserDialog() {
    if (isPending) return;
    setUserDialogOpen(false);
    setEditingUser(null);
    userForm.reset();
  }

  function saveUser(values: UserFormValues) {
    startTransition(async () => {
      const result = values.id
        ? await updateUserAction({
            id: values.id,
            username: values.username,
            role: values.role,
          })
        : await createUserAction({
            username: values.username,
            password: values.password,
            role: values.role,
          });

      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      setUserDialogOpen(false);
      setEditingUser(null);
      userForm.reset();
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  function openPasswordDialog(user: UserItem) {
    setPasswordUser(user);
    passwordForm.reset({ password: "" });
  }

  function closePasswordDialog() {
    if (isPending) return;
    setPasswordUser(null);
    passwordForm.reset();
  }

  function resetPassword(values: ResetPasswordFormValues) {
    if (!passwordUser) return;

    startTransition(async () => {
      const result = await resetUserPasswordAction({
        id: passwordUser.id,
        password: values.password,
      });
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      setPasswordUser(null);
      passwordForm.reset();
      toast.add({ type: "success", description: result.message });
    });
  }

  function deleteUser() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteUserAction(deleteTarget.id);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      setDeleteTarget(null);
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  const columns: ColumnDef<UserItem>[] = [
    {
      accessorKey: "username",
      header: "用户名",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.username}</span>
          {row.original.id === currentUserId ? (
            <Badge variant="secondary">当前用户</Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "角色",
      size: 150,
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.role === UserRole.ADMIN ? "管理员" : "普通用户"}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "创建时间",
      size: 190,
      meta: { cellClassName: "text-muted-foreground" },
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      id: "actions",
      header: "操作",
      // 三个文字操作按钮及单元格内边距需要完整空间，避免操作区溢出表格容器。
      size: 176,
      meta: { headerClassName: "text-left", cellClassName: "text-left" },
      cell: ({ row }) => (
        <DataTableRowActions
          actions={[
            {
              label: "编辑",
              onClick: () => openEdit(row.original),
            },
            {
              label: "重置密码",
              icon: <KeyRoundIcon />,
              onClick: () => openPasswordDialog(row.original),
            },
            {
              label: "删除",
              icon: <Trash2Icon />,
              disabled: isPending || row.original.id === currentUserId,
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
              共 {users.length} 个用户
            </span>
            <Button className="ml-auto" onClick={openCreate}>
              <PlusIcon data-icon="inline-start" />
              新建用户
            </Button>
          </>
        }
        footer={
          <DataTablePagination
            page={safePage}
            pageSize={pageSize}
            total={users.length}
            itemName="个用户"
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
          />
        }
      >
        <DataTable
          columns={columns}
          data={pageItems}
          loading={isPending}
          emptyText="还没有用户"
          getRowId={(user) => user.id}
        />
      </DataTableShell>

      <Dialog
        open={userDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeUserDialog();
        }}
      >
        <DialogContent>
          <form onSubmit={userForm.handleSubmit(saveUser)}>
            <DialogHeader>
              <DialogTitle>{editingUser ? "编辑用户" : "新建用户"}</DialogTitle>
              <DialogDescription>
                用户名用于登录和显示，角色决定是否可以管理平台用户与模型。
              </DialogDescription>
            </DialogHeader>
            <div className="py-5">
              <FieldGroup>
                <Field
                  data-invalid={Boolean(userForm.formState.errors.username)}
                >
                  <FieldLabel htmlFor="user-username">用户名</FieldLabel>
                  <Input
                    id="user-username"
                    maxLength={50}
                    autoComplete="off"
                    aria-invalid={Boolean(userForm.formState.errors.username)}
                    {...userForm.register("username")}
                  />
                  <FieldError errors={[userForm.formState.errors.username]} />
                </Field>
                {!editingUser ? (
                  <Field
                    data-invalid={Boolean(userForm.formState.errors.password)}
                  >
                    <FieldLabel htmlFor="user-password">初始密码</FieldLabel>
                    <Input
                      id="user-password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={Boolean(userForm.formState.errors.password)}
                      {...userForm.register("password")}
                    />
                    <FieldError errors={[userForm.formState.errors.password]} />
                  </Field>
                ) : null}
                <Controller
                  control={userForm.control}
                  name="role"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="user-role">角色</FieldLabel>
                      <Select
                        items={ROLE_OPTIONS}
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="user-role"
                          aria-invalid={fieldState.invalid}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {ROLE_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </FieldGroup>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={closeUserDialog}
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

      <Dialog
        open={Boolean(passwordUser)}
        onOpenChange={(open) => {
          if (!open) closePasswordDialog();
        }}
      >
        <DialogContent>
          <form onSubmit={passwordForm.handleSubmit(resetPassword)}>
            <DialogHeader>
              <DialogTitle>
                重置密码{passwordUser ? `：${passwordUser.username}` : ""}
              </DialogTitle>
              <DialogDescription>
                新密码保存后立即生效，该用户的现有会话将全部失效。
              </DialogDescription>
            </DialogHeader>
            <div className="py-5">
              <Field
                data-invalid={Boolean(passwordForm.formState.errors.password)}
              >
                <FieldLabel htmlFor="reset-user-password">新密码</FieldLabel>
                <Input
                  id="reset-user-password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(passwordForm.formState.errors.password)}
                  {...passwordForm.register("password")}
                />
                <FieldError errors={[passwordForm.formState.errors.password]} />
              </Field>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={closePasswordDialog}
              >
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Spinner data-icon="inline-start" /> : null}
                保存新密码
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除用户"
        description="删除后该用户将立即无法登录，且不能恢复。"
        confirmLabel="删除"
        destructive
        pending={isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={deleteUser}
      />
    </>
  );
}
