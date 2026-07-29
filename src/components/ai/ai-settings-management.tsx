"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import {
  bindUserStoryModelAction,
  checkAiModelProfileAction,
  createAiModelProfileAction,
  deleteAiModelProfileAction,
  updateAiModelProfileAction,
} from "@/app/actions/ai-settings";
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
  FieldDescription,
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
import {
  aiModelProfileFormSchema,
  type AiModelProfileFormValues,
} from "@/lib/ai/model-profile";
import { formatCompactDateTime } from "@/lib/date-time";

type ModelProfileItem = {
  id: string;
  name: string;
  baseUrl: string;
  modelId: string;
  updatedAt: string;
};

const PAGE_SIZE = 20;

export function AiSettingsManagement({
  profiles,
  defaultProfileId,
}: {
  profiles: ModelProfileItem[];
  defaultProfileId: string | null;
}) {
  const router = useRouter();
  const [editingProfile, setEditingProfile] = useState<ModelProfileItem | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<ModelProfileItem | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkingProfileId, setCheckingProfileId] = useState<string | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const form = useForm<AiModelProfileFormValues>({
    resolver: zodResolver(aiModelProfileFormSchema),
    defaultValues: {
      id: undefined,
      name: "",
      baseUrl: "",
      modelId: "",
      apiKey: "",
    },
  });

  const profileOptions = [
    { value: null, label: "请选择默认模型" },
    ...profiles.map((profile) => ({
      value: profile.id,
      label: `${profile.name} · ${profile.modelId}`,
    })),
  ];
  const pageCount = Math.max(1, Math.ceil(profiles.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = profiles.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function openCreate() {
    setEditingProfile(null);
    form.reset({
      id: undefined,
      name: "",
      baseUrl: "",
      modelId: "",
      apiKey: "",
    });
    setDialogOpen(true);
  }

  function openEdit(profile: ModelProfileItem) {
    setEditingProfile(profile);
    form.reset({
      id: profile.id,
      name: profile.name,
      baseUrl: profile.baseUrl,
      modelId: profile.modelId,
      apiKey: "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    if (isPending) return;
    setDialogOpen(false);
    setEditingProfile(null);
    form.reset();
  }

  function saveProfile(values: AiModelProfileFormValues) {
    startTransition(async () => {
      const result = values.id
        ? await updateAiModelProfileAction({
            id: values.id,
            name: values.name,
            baseUrl: values.baseUrl,
            modelId: values.modelId,
            apiKey: values.apiKey,
          })
        : await createAiModelProfileAction({
            name: values.name,
            baseUrl: values.baseUrl,
            modelId: values.modelId,
            apiKey: values.apiKey,
          });

      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      setDialogOpen(false);
      setEditingProfile(null);
      form.reset();
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  function bindDefaultModel(profileId: string | null) {
    if (!profileId) return;

    startTransition(async () => {
      const result = await bindUserStoryModelAction(profileId);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  function checkProfile(profileId: string) {
    setCheckingProfileId(profileId);
    startTransition(async () => {
      try {
        const result = await checkAiModelProfileAction(profileId);
        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          return;
        }
        toast.add({ type: "success", description: result.message });
      } finally {
        setCheckingProfileId(null);
      }
    });
  }

  function deleteProfile() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteAiModelProfileAction(deleteTarget.id);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      setDeleteTarget(null);
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  const columns: ColumnDef<ModelProfileItem>[] = [
    {
      accessorKey: "name",
      header: "模型名称",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.original.name}</span>
          {row.original.id === defaultProfileId ? (
            <Badge variant="secondary">生成 US 默认</Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "baseUrl",
      header: "Base URL",
      size: 250,
      meta: { cellClassName: "truncate font-mono text-xs" },
    },
    {
      accessorKey: "modelId",
      header: "模型 ID",
      size: 180,
      meta: { cellClassName: "truncate font-mono text-xs" },
    },
    {
      id: "apiKey",
      header: "API Key",
      size: 96,
      meta: {
        headerClassName: "max-[1500px]:hidden",
        cellClassName:
          "max-[1500px]:hidden font-mono text-xs text-muted-foreground",
      },
      cell: () => "••••••••",
    },
    {
      accessorKey: "updatedAt",
      header: "更新时间",
      size: 140,
      meta: {
        headerClassName: "max-[1650px]:hidden",
        cellClassName: "max-[1650px]:hidden text-muted-foreground",
      },
      cell: ({ row }) => formatCompactDateTime(row.original.updatedAt),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      size: 148,
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={
              isPending &&
              checkingProfileId !== null &&
              checkingProfileId !== row.original.id
            }
            onClick={() => checkProfile(row.original.id)}
          >
            {checkingProfileId === row.original.id ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            检查
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(row.original)}
          >
            编辑
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
                  disabled={isPending || row.original.id === defaultProfileId}
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
            <span className="text-sm font-medium">生成 US 默认模型</span>
            <Select
              items={profileOptions}
              value={defaultProfileId}
              disabled={!profiles.length || isPending}
              onValueChange={bindDefaultModel}
            >
              <SelectTrigger className="w-80" aria-label="生成 US 默认模型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {profileOptions.map((option) => (
                    <SelectItem
                      key={option.value ?? "placeholder"}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-xs">
              用户发起任务时自动使用该模型
            </span>
            <Button className="ml-auto" onClick={openCreate}>
              <PlusIcon data-icon="inline-start" />
              新建模型
            </Button>
          </>
        }
        footer={
          <DataTablePagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={profiles.length}
            itemName="个模型"
            onChange={setPage}
          />
        }
      >
        <DataTable
          columns={columns}
          data={pageItems}
          loading={isPending && checkingProfileId === null}
          emptyText="尚未配置模型"
          getRowId={(profile) => profile.id}
        />
      </DataTableShell>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={form.handleSubmit(saveProfile)}>
            <DialogHeader>
              <DialogTitle>
                {editingProfile ? "编辑模型" : "新建模型"}
              </DialogTitle>
              <DialogDescription>
                配置 OpenAI 兼容接口；API Key 加密保存且不会回显。
              </DialogDescription>
            </DialogHeader>
            <div className="py-5">
              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.name)}>
                  <FieldLabel htmlFor="model-name">模型名称</FieldLabel>
                  <Input
                    id="model-name"
                    maxLength={100}
                    placeholder="例如：DeepSeek 生产模型"
                    aria-invalid={Boolean(form.formState.errors.name)}
                    {...form.register("name")}
                  />
                  <FieldError errors={[form.formState.errors.name]} />
                </Field>
                <Field data-invalid={Boolean(form.formState.errors.baseUrl)}>
                  <FieldLabel htmlFor="model-base-url">
                    OpenAI 兼容 Base URL
                  </FieldLabel>
                  <Input
                    id="model-base-url"
                    maxLength={500}
                    placeholder="https://api.example.com/v1"
                    aria-invalid={Boolean(form.formState.errors.baseUrl)}
                    {...form.register("baseUrl")}
                  />
                  <FieldDescription>
                    填写兼容接口的根地址，例如 https://api.deepseek.com/v1。
                  </FieldDescription>
                  <FieldError errors={[form.formState.errors.baseUrl]} />
                </Field>
                <Field data-invalid={Boolean(form.formState.errors.modelId)}>
                  <FieldLabel htmlFor="model-id">模型 ID</FieldLabel>
                  <Input
                    id="model-id"
                    maxLength={200}
                    placeholder="例如：deepseek-chat"
                    aria-invalid={Boolean(form.formState.errors.modelId)}
                    {...form.register("modelId")}
                  />
                  <FieldError errors={[form.formState.errors.modelId]} />
                </Field>
                <Field data-invalid={Boolean(form.formState.errors.apiKey)}>
                  <FieldLabel htmlFor="model-api-key">API Key</FieldLabel>
                  <Input
                    id="model-api-key"
                    type="password"
                    maxLength={4_000}
                    autoComplete="new-password"
                    placeholder={
                      editingProfile ? "留空保留原 API Key" : undefined
                    }
                    aria-invalid={Boolean(form.formState.errors.apiKey)}
                    {...form.register("apiKey")}
                  />
                  <FieldDescription>
                    {editingProfile
                      ? "已配置的密钥不会回显；留空表示保留原值。"
                      : "密钥使用 AES-256-GCM 加密保存，之后不会回显。"}
                  </FieldDescription>
                  <FieldError errors={[form.formState.errors.apiKey]} />
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
        title="删除模型配置"
        description="删除后 API Key 将立即清除，且不能恢复。"
        confirmLabel="删除"
        destructive
        pending={isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={deleteProfile}
      />
    </>
  );
}
