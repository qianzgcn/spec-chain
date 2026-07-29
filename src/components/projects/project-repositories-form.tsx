"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2Icon,
  GitBranchIcon,
  GitForkIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import {
  addProjectPatAction,
  checkRepositoryConnectionAction,
  deleteProjectPatAction,
  updateProjectRepositoriesAction,
  verifyProjectPatAction,
} from "@/app/actions/projects";
import { FormPage } from "@/components/layout/form-page";
import { PageSection } from "@/components/layout/page-section";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  GIT_PROVIDER_LABELS,
  parseRepositoryUrl,
  type GitProvider,
} from "@/lib/git/repository-url";
import {
  projectRepositoriesFormSchema,
  type ProjectRepositoriesFormValues,
} from "@/lib/projects/schema";

type RepositoryValue = ProjectRepositoriesFormValues["repositories"][number];

type CredentialStatus = {
  hasGithubPat: boolean;
  hasGiteePat: boolean;
  githubPatAccount: string | null;
  giteePatAccount: string | null;
};

type ConnectionResult = {
  ok: boolean;
  message: string;
};

const PROVIDERS: Array<{ provider: GitProvider; icon: LucideIcon }> = [
  { provider: "GITHUB", icon: GitForkIcon },
  { provider: "GITEE", icon: GitBranchIcon },
];

function RepositoryCredentialCard({
  provider,
  icon: Icon,
  configured,
  account,
  draft,
  pending,
  disabled,
  onDraftChange,
  onAdd,
  onVerify,
  onDelete,
}: {
  provider: GitProvider;
  icon: LucideIcon;
  configured: boolean;
  account: string | null;
  draft: string;
  pending: boolean;
  disabled: boolean;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onVerify: () => void;
  onDelete: () => void;
}) {
  const label = GIT_PROVIDER_LABELS[provider];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg border">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <CardTitle>{label}</CardTitle>
              <CardDescription className="truncate">
                {configured
                  ? account
                    ? `账号 ${account}`
                    : "账号尚未验证"
                  : "尚未配置访问凭据"}
              </CardDescription>
            </div>
          </div>
          <Badge variant={configured ? "secondary" : "outline"}>
            {configured ? "已配置" : "未配置"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {configured ? (
          <div className="flex items-center justify-between gap-3">
            <code
              className="bg-muted rounded-md px-3 py-2 font-mono text-xs"
              aria-label={`${label} PAT（已脱敏）`}
            >
              •••• •••• ••••
            </code>
            <div className="flex items-center gap-2">
              {!account ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={onVerify}
                >
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  验证账号
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={onDelete}
              >
                {pending && account ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                删除
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="password"
              aria-label={`${label} PAT`}
              autoComplete="new-password"
              maxLength={500}
              placeholder={`输入 ${label} PAT`}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
            />
            <Button
              type="button"
              className="shrink-0"
              disabled={!draft.trim() || disabled}
              onClick={onAdd}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              验证并新增
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function providerLabel(gitUrl: string | undefined) {
  if (!gitUrl) return "未识别";
  try {
    return GIT_PROVIDER_LABELS[parseRepositoryUrl(gitUrl).provider];
  } catch {
    return "未识别";
  }
}

export function ProjectRepositoriesForm({
  project,
}: {
  project: CredentialStatus & {
    id: string;
    repositories: RepositoryValue[];
  };
}) {
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus>({
    hasGithubPat: project.hasGithubPat,
    hasGiteePat: project.hasGiteePat,
    githubPatAccount: project.githubPatAccount,
    giteePatAccount: project.giteePatAccount,
  });
  const [credentialDrafts, setCredentialDrafts] = useState<
    Record<GitProvider, string>
  >({
    GITHUB: "",
    GITEE: "",
  });
  const [connectionResults, setConnectionResults] = useState<
    Record<string, ConnectionResult>
  >({});
  const [checkingRepositoryKey, setCheckingRepositoryKey] = useState<
    string | null
  >(null);
  const [credentialPendingProvider, setCredentialPendingProvider] =
    useState<GitProvider | null>(null);
  const [deleteCredentialProvider, setDeleteCredentialProvider] =
    useState<GitProvider | null>(null);
  const [isSaving, startSavingTransition] = useTransition();
  const [isChecking, startCheckingTransition] = useTransition();
  const [isCredentialPending, startCredentialTransition] = useTransition();
  const form = useForm<ProjectRepositoriesFormValues>({
    resolver: zodResolver(projectRepositoriesFormSchema),
    defaultValues: { repositories: project.repositories },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "repositories",
    keyName: "fieldKey",
  });
  const repositories = useWatch({
    control: form.control,
    name: "repositories",
  });
  const repositoriesDirty = form.formState.isDirty;
  const hasCredentialDraft = Boolean(
    credentialDrafts.GITHUB || credentialDrafts.GITEE,
  );
  useUnsavedChanges(repositoriesDirty || hasCredentialDraft);

  function isCredentialConfigured(provider: GitProvider) {
    return provider === "GITHUB"
      ? credentialStatus.hasGithubPat
      : credentialStatus.hasGiteePat;
  }

  function getCredentialAccount(provider: GitProvider) {
    return provider === "GITHUB"
      ? credentialStatus.githubPatAccount
      : credentialStatus.giteePatAccount;
  }

  function updateCredentialDraft(provider: GitProvider, value: string) {
    setCredentialDrafts((current) => ({ ...current, [provider]: value }));
    setConnectionResults({});
  }

  function addCredential(provider: GitProvider) {
    const pat = credentialDrafts[provider].trim();
    if (!pat) {
      toast.add({
        type: "error",
        description: `请输入 ${GIT_PROVIDER_LABELS[provider]} PAT`,
      });
      return;
    }

    setCredentialPendingProvider(provider);
    startCredentialTransition(async () => {
      try {
        const result = await addProjectPatAction({
          projectId: project.id,
          provider,
          pat,
        });

        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          return;
        }

        if (result.data) setCredentialStatus(result.data);
        setCredentialDrafts((current) => ({ ...current, [provider]: "" }));
        setConnectionResults({});
        toast.add({ type: "success", description: result.message });
      } finally {
        setCredentialPendingProvider(null);
      }
    });
  }

  function deleteCredential(provider: GitProvider) {
    setCredentialPendingProvider(provider);
    startCredentialTransition(async () => {
      try {
        const result = await deleteProjectPatAction({
          projectId: project.id,
          provider,
        });

        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          return;
        }

        if (result.data) setCredentialStatus(result.data);
        setDeleteCredentialProvider(null);
        setConnectionResults({});
        toast.add({ type: "success", description: result.message });
      } finally {
        setCredentialPendingProvider(null);
      }
    });
  }

  function verifyCredential(provider: GitProvider) {
    setCredentialPendingProvider(provider);
    startCredentialTransition(async () => {
      try {
        const result = await verifyProjectPatAction({
          projectId: project.id,
          provider,
        });

        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          return;
        }

        if (result.data) setCredentialStatus(result.data);
        toast.add({ type: "success", description: result.message });
      } finally {
        setCredentialPendingProvider(null);
      }
    });
  }

  function submit(values: ProjectRepositoriesFormValues) {
    startSavingTransition(async () => {
      const result = await updateProjectRepositoriesAction({
        ...values,
        projectId: project.id,
      });

      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      if (result.data) {
        form.reset({ repositories: result.data.repositories });
      }
      setConnectionResults({});
      toast.add({ type: "success", description: result.message });
    });
  }

  async function checkConnection(rowKey: string, repositoryIndex: number) {
    const valid = await form.trigger([
      `repositories.${repositoryIndex}.gitUrl`,
      `repositories.${repositoryIndex}.branch`,
    ]);
    if (!valid) {
      setConnectionResults((current) => {
        const next = { ...current };
        delete next[rowKey];
        return next;
      });
      return;
    }

    const repository = form.getValues(`repositories.${repositoryIndex}`);
    const location = parseRepositoryUrl(repository.gitUrl);
    if (!isCredentialConfigured(location.provider)) {
      setConnectionResults((current) => ({
        ...current,
        [rowKey]: {
          ok: false,
          message: `请先新增 ${GIT_PROVIDER_LABELS[location.provider]} PAT`,
        },
      }));
      return;
    }

    setCheckingRepositoryKey(rowKey);
    startCheckingTransition(async () => {
      try {
        const result = await checkRepositoryConnectionAction({
          projectId: project.id,
          gitUrl: repository.gitUrl,
          branch: repository.branch,
        });

        setConnectionResults((current) => ({
          ...current,
          [rowKey]: {
            ok: result.ok,
            message: result.message ?? "连接正常",
          },
        }));
      } finally {
        setCheckingRepositoryKey(null);
      }
    });
  }

  function clearConnectionResult(rowKey: string) {
    setConnectionResults((current) => {
      if (!(rowKey in current)) return current;
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
  }

  return (
    <>
      <FormPage
        title="代码仓库"
        description="管理项目级仓库凭据、代码仓库和连接检查。"
        actions={
          <Button
            type="submit"
            form="project-repositories-form"
            disabled={!repositoriesDirty || isSaving}
          >
            {isSaving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            保存
          </Button>
        }
      >
        <form
          id="project-repositories-form"
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(submit)}
        >
          <PageSection
            title="平台凭据"
            description="仓库会根据地址自动使用对应平台的项目级 PAT。PAT 仅在服务端加密保存。"
          >
            <div className="grid grid-cols-2 gap-4">
              {PROVIDERS.map(({ provider, icon }) => {
                const configured = isCredentialConfigured(provider);
                const account = getCredentialAccount(provider);
                const pending =
                  isCredentialPending && credentialPendingProvider === provider;

                return (
                  <RepositoryCredentialCard
                    key={provider}
                    provider={provider}
                    icon={icon}
                    configured={configured}
                    account={account}
                    draft={credentialDrafts[provider]}
                    pending={pending}
                    disabled={isCredentialPending && !pending}
                    onDraftChange={(value) =>
                      updateCredentialDraft(provider, value)
                    }
                    onAdd={() => addCredential(provider)}
                    onVerify={() => verifyCredential(provider)}
                    onDelete={() => setDeleteCredentialProvider(provider)}
                  />
                );
              })}
            </div>
          </PageSection>

          <PageSection
            title="仓库列表"
            description="配置仓库地址和目标分支，并检查当前凭据的读取权限。"
            actions={
              fields.length ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ gitUrl: "", branch: "main" })}
                >
                  <PlusIcon data-icon="inline-start" />
                  添加仓库
                </Button>
              ) : null
            }
          >
            {fields.length ? (
              <div className="flex flex-col gap-2">
                <div
                  className="text-muted-foreground grid grid-cols-[minmax(320px,1fr)_180px_90px_112px_32px] gap-3 px-1 text-xs font-medium"
                  aria-hidden
                >
                  <span>Git 地址</span>
                  <span>目标分支</span>
                  <span>平台</span>
                  <span>连接</span>
                  <span />
                </div>
                {fields.map((field, index) => {
                  const connectionResult = connectionResults[field.fieldKey];
                  const gitUrlRegistration = form.register(
                    `repositories.${index}.gitUrl`,
                  );
                  const branchRegistration = form.register(
                    `repositories.${index}.branch`,
                  );

                  return (
                    <div
                      key={field.fieldKey}
                      className="bg-muted/40 grid grid-cols-[minmax(320px,1fr)_180px_90px_112px_32px] items-start gap-3 rounded-lg p-3"
                    >
                      <input
                        type="hidden"
                        {...form.register(`repositories.${index}.id`)}
                      />
                      <Field
                        data-invalid={Boolean(
                          form.formState.errors.repositories?.[index]?.gitUrl,
                        )}
                      >
                        <FieldLabel
                          className="sr-only"
                          htmlFor={`repository-${index}-url`}
                        >
                          Git 地址
                        </FieldLabel>
                        <Input
                          id={`repository-${index}-url`}
                          placeholder="https://github.com/owner/repo.git"
                          aria-invalid={Boolean(
                            form.formState.errors.repositories?.[index]?.gitUrl,
                          )}
                          {...gitUrlRegistration}
                          onChange={(event) => {
                            void gitUrlRegistration.onChange(event);
                            clearConnectionResult(field.fieldKey);
                          }}
                        />
                        <FieldError
                          errors={[
                            form.formState.errors.repositories?.[index]?.gitUrl,
                          ]}
                        />
                      </Field>
                      <Field
                        data-invalid={Boolean(
                          form.formState.errors.repositories?.[index]?.branch,
                        )}
                      >
                        <FieldLabel
                          className="sr-only"
                          htmlFor={`repository-${index}-branch`}
                        >
                          目标分支
                        </FieldLabel>
                        <Input
                          id={`repository-${index}-branch`}
                          placeholder="main"
                          aria-invalid={Boolean(
                            form.formState.errors.repositories?.[index]?.branch,
                          )}
                          {...branchRegistration}
                          onChange={(event) => {
                            void branchRegistration.onChange(event);
                            clearConnectionResult(field.fieldKey);
                          }}
                        />
                        <FieldError
                          errors={[
                            form.formState.errors.repositories?.[index]?.branch,
                          ]}
                        />
                      </Field>
                      <div className="flex h-8 items-center">
                        <Badge variant="outline">
                          {providerLabel(repositories[index]?.gitUrl)}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          isChecking && checkingRepositoryKey !== field.fieldKey
                        }
                        onClick={() =>
                          void checkConnection(field.fieldKey, index)
                        }
                      >
                        {isChecking &&
                        checkingRepositoryKey === field.fieldKey ? (
                          <Spinner data-icon="inline-start" />
                        ) : null}
                        检查连接
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`删除第 ${index + 1} 个仓库`}
                        onClick={() => {
                          remove(index);
                          clearConnectionResult(field.fieldKey);
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                      {connectionResult ? (
                        <Alert
                          className="col-span-5"
                          variant={
                            connectionResult.ok ? "default" : "destructive"
                          }
                        >
                          {connectionResult.ok ? (
                            <CheckCircle2Icon />
                          ) : (
                            <XCircleIcon />
                          )}
                          <AlertDescription>
                            {connectionResult.message}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>尚未添加代码仓库</EmptyTitle>
                  <EmptyDescription>
                    可按项目实际情况配置一个或多个仓库。
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => append({ gitUrl: "", branch: "main" })}
                  >
                    <PlusIcon data-icon="inline-start" />
                    添加仓库
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </PageSection>
        </form>
      </FormPage>

      <ConfirmDialog
        open={Boolean(deleteCredentialProvider)}
        title={`删除 ${
          deleteCredentialProvider
            ? GIT_PROVIDER_LABELS[deleteCredentialProvider]
            : ""
        } PAT`}
        description={`删除后，使用 ${
          deleteCredentialProvider
            ? GIT_PROVIDER_LABELS[deleteCredentialProvider]
            : "该平台"
        } 的仓库将无法检查连接。`}
        confirmLabel="删除"
        destructive
        pending={isCredentialPending}
        onOpenChange={(open) => {
          if (!open) setDeleteCredentialProvider(null);
        }}
        onConfirm={() => {
          if (deleteCredentialProvider) {
            deleteCredential(deleteCredentialProvider);
          }
        }}
      />
    </>
  );
}
