"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import {
  bindAiCapabilityModelAction,
  checkAiModelProfileAction,
  createAiModelProfileAction,
  deleteAiModelProfileAction,
  updateAiModelProfileAction,
} from "@/app/actions/ai-settings";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { PageSection } from "@/components/layout/page-section";
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
import { AiCapability, AiModelCheckStatus } from "@/generated/prisma/enums";
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
  lastCheckStatus: AiModelCheckStatus;
  lastCheckedAt: string | null;
  updatedAt: string;
};

const PAGE_SIZE = 20;
const MODEL_CHECK_STATUS_META: Record<
  AiModelCheckStatus,
  {
    label: string;
    badgeVariant: "outline" | "success" | "destructive";
  }
> = {
  [AiModelCheckStatus.UNCHECKED]: {
    label: "未检查",
    badgeVariant: "outline",
  },
  [AiModelCheckStatus.SUCCEEDED]: {
    label: "检查通过",
    badgeVariant: "success",
  },
  [AiModelCheckStatus.FAILED]: {
    label: "检查失败",
    badgeVariant: "destructive",
  },
};

const DEFAULT_MODEL_CONFIGS = [
  {
    capability: AiCapability.GENERATE_USER_STORY,
    label: "生成 US",
    ariaLabel: "生成 US 默认模型",
  },
  {
    capability: AiCapability.GENERATE_TEST_CASES,
    label: "生成测试用例",
    ariaLabel: "生成测试用例默认模型",
  },
  {
    capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
    label: "生成自动化脚本",
    ariaLabel: "生成自动化脚本默认模型",
  },
  {
    capability: AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION,
    label: "需求实现审查",
    ariaLabel: "需求实现审查默认模型",
  },
] as const;

export function AiSettingsManagement({
  profiles,
  defaultProfileIds,
}: {
  profiles: ModelProfileItem[];
  defaultProfileIds: Record<AiCapability, string | null>;
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
      label: profile.modelId,
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

  function bindDefaultModel(
    capability: AiCapability,
    profileId: string | null,
  ) {
    if (!profileId) return;

    startTransition(async () => {
      const result = await bindAiCapabilityModelAction({
        capability,
        profileId,
      });
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
      meta: { cellClassName: "truncate font-medium" },
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
      accessorKey: "lastCheckStatus",
      header: "最近检查状态",
      size: 144,
      cell: ({ row }) => {
        const profile = row.original;
        const meta = MODEL_CHECK_STATUS_META[profile.lastCheckStatus];
        return (
          <div className="flex flex-col items-start gap-0.5">
            <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
            {profile.lastCheckedAt ? (
              <span className="text-muted-foreground text-xs">
                {formatCompactDateTime(profile.lastCheckedAt)}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "apiKey",
      header: "API Key",
      size: 96,
      meta: { cellClassName: "font-mono text-xs text-muted-foreground" },
      cell: () => "••••••••",
    },
    {
      accessorKey: "updatedAt",
      header: "更新时间",
      size: 140,
      meta: { cellClassName: "text-muted-foreground" },
      cell: ({ row }) => formatCompactDateTime(row.original.updatedAt),
    },
    {
      id: "actions",
      header: "操作",
      size: 176,
      meta: { headerClassName: "text-left", cellClassName: "text-left" },
      cell: ({ row }) => (
        <DataTableRowActions
          actions={[
            {
              label: "检查",
              disabled: isPending,
              loading: checkingProfileId === row.original.id,
              onClick: () => checkProfile(row.original.id),
            },
            {
              label: "编辑",
              disabled: isPending,
              onClick: () => openEdit(row.original),
            },
            {
              label: "删除",
              disabled:
                isPending ||
                Object.values(defaultProfileIds).includes(row.original.id),
              destructive: true,
              onClick: () => setDeleteTarget(row.original),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <PageSection
        className="shrink-0"
        title="默认模型"
        description="为每项 AI 能力指定使用的模型。"
      >
        <FieldGroup className="max-w-3xl gap-3">
          {DEFAULT_MODEL_CONFIGS.map((config) => (
            <Field
              key={config.capability}
              orientation="horizontal"
              className="items-center"
            >
              <FieldLabel
                className="w-44 shrink-0"
                htmlFor={`default-model-${config.capability}`}
              >
                {config.label}
              </FieldLabel>
              <Select
                items={profileOptions}
                value={defaultProfileIds[config.capability]}
                disabled={!profiles.length || isPending}
                onValueChange={(profileId) =>
                  bindDefaultModel(config.capability, profileId)
                }
              >
                <SelectTrigger
                  id={`default-model-${config.capability}`}
                  className="w-full max-w-md"
                  aria-label={config.ariaLabel}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {profileOptions.map((option) => (
                      <SelectItem
                        key={option.value ?? `${config.capability}-placeholder`}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ))}
        </FieldGroup>
      </PageSection>

      <DataTableShell
        className="min-h-0"
        toolbar={
          <div className="flex w-full justify-end">
            <Button onClick={openCreate}>
              <PlusIcon data-icon="inline-start" />
              新建模型
            </Button>
          </div>
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
        <div className="contents [&_[data-slot=table-head]]:text-base">
          <DataTable
            columns={columns}
            data={pageItems}
            loading={isPending && checkingProfileId === null}
            emptyText="尚未配置模型"
            getRowId={(profile) => profile.id}
          />
        </div>
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
                    aria-invalid={Boolean(form.formState.errors.apiKey)}
                    {...form.register("apiKey")}
                  />
                  <FieldDescription>
                    {editingProfile
                      ? "已配置密钥不会回显；不填写则保留原值。"
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
    </div>
  );
}
