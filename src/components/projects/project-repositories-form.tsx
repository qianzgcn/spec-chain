"use client";

import { type Key, useState, useTransition } from "react";

import CheckCircleFilled from "@ant-design/icons/CheckCircleFilled";
import CloseCircleFilled from "@ant-design/icons/CloseCircleFilled";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import { Button, Form, Input, Modal, Tag, message } from "antd";

import {
  addProjectPatAction,
  checkRepositoryConnectionAction,
  deleteProjectPatAction,
  updateProjectRepositoriesAction,
} from "@/app/actions/projects";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  GIT_PROVIDER_LABELS,
  parseRepositoryUrl,
  type GitProvider,
} from "@/lib/git/repository-url";

import styles from "./project-settings-form.module.css";
import { ProjectSettingsSaveButton } from "./project-settings-save-button";

type RepositoryValue = {
  id?: string;
  gitUrl: string;
  branch: string;
};

type RepositoryFormValues = {
  repositories: RepositoryValue[];
};

type CredentialStatus = {
  hasGithubPat: boolean;
  hasGiteePat: boolean;
};

type ConnectionResult = {
  ok: boolean;
  message: string;
};

function validateRepositoryUrl(_: unknown, value?: string) {
  if (!value) return Promise.resolve();

  try {
    parseRepositoryUrl(value);
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(
      new Error(error instanceof Error ? error.message : "Git 地址无效"),
    );
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
  const [form] = Form.useForm<RepositoryFormValues>();
  const [messageApi, messageContext] = message.useMessage();
  const [repositoriesDirty, setRepositoriesDirty] = useState(false);
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus>({
    hasGithubPat: project.hasGithubPat,
    hasGiteePat: project.hasGiteePat,
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
  const [checkingRepositoryKey, setCheckingRepositoryKey] =
    useState<Key | null>(null);
  const [credentialPendingProvider, setCredentialPendingProvider] =
    useState<GitProvider | null>(null);
  const [isSaving, startSavingTransition] = useTransition();
  const [isChecking, startCheckingTransition] = useTransition();
  const [isCredentialPending, startCredentialTransition] = useTransition();
  const hasCredentialDraft = Boolean(
    credentialDrafts.GITHUB || credentialDrafts.GITEE,
  );
  useUnsavedChanges(repositoriesDirty || hasCredentialDraft);

  function isCredentialConfigured(provider: GitProvider) {
    return provider === "GITHUB"
      ? credentialStatus.hasGithubPat
      : credentialStatus.hasGiteePat;
  }

  function updateCredentialDraft(provider: GitProvider, value: string) {
    setCredentialDrafts((current) => ({ ...current, [provider]: value }));
    setConnectionResults({});
  }

  function addCredential(provider: GitProvider) {
    const pat = credentialDrafts[provider].trim();
    if (!pat) {
      messageApi.error(`请输入 ${GIT_PROVIDER_LABELS[provider]} PAT`);
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
          messageApi.error(result.message);
          return;
        }

        if (result.data) {
          setCredentialStatus(result.data);
        }
        setCredentialDrafts((current) => ({ ...current, [provider]: "" }));
        setConnectionResults({});
        messageApi.success(result.message);
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
          messageApi.error(result.message);
          return;
        }

        if (result.data) {
          setCredentialStatus(result.data);
        }
        setConnectionResults({});
        messageApi.success(result.message);
      } finally {
        setCredentialPendingProvider(null);
      }
    });
  }

  function confirmDeleteCredential(provider: GitProvider) {
    const label = GIT_PROVIDER_LABELS[provider];

    Modal.confirm({
      title: `删除 ${label} PAT`,
      content: `删除后，使用 ${label} 的仓库将无法检查连接。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
        "aria-label": `确认删除 ${label} PAT`,
      },
      onOk: () => deleteCredential(provider),
    });
  }

  function submit(values: RepositoryFormValues) {
    startSavingTransition(async () => {
      const result = await updateProjectRepositoriesAction({
        ...values,
        projectId: project.id,
      });

      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }

      if (result.data) {
        form.setFieldsValue({ repositories: result.data.repositories });
      }
      setRepositoriesDirty(false);
      setConnectionResults({});
      messageApi.success(result.message);
    });
  }

  function checkConnection(rowKey: Key, repositoryIndex: number) {
    setCheckingRepositoryKey(rowKey);
    startCheckingTransition(async () => {
      try {
        await form.validateFields([
          ["repositories", repositoryIndex, "gitUrl"],
          ["repositories", repositoryIndex, "branch"],
        ]);

        const repository = form.getFieldsValue().repositories[repositoryIndex];
        if (!repository) return;

        const location = parseRepositoryUrl(repository.gitUrl);
        if (!isCredentialConfigured(location.provider)) {
          setConnectionResults((current) => ({
            ...current,
            [String(rowKey)]: {
              ok: false,
              message: `请先新增 ${GIT_PROVIDER_LABELS[location.provider]} PAT`,
            },
          }));
          return;
        }

        const result = await checkRepositoryConnectionAction({
          projectId: project.id,
          gitUrl: repository.gitUrl,
          branch: repository.branch,
        });

        setConnectionResults((current) => ({
          ...current,
          [String(rowKey)]: {
            ok: result.ok,
            message: result.message ?? "连接正常",
          },
        }));
      } catch {
        setConnectionResults((current) => {
          const next = { ...current };
          delete next[String(rowKey)];
          return next;
        });
      } finally {
        setCheckingRepositoryKey(null);
      }
    });
  }

  function renderCredentialRow(provider: GitProvider) {
    const label = GIT_PROVIDER_LABELS[provider];
    const configured = isCredentialConfigured(provider);
    const pending =
      isCredentialPending && credentialPendingProvider === provider;

    return (
      <div className={styles.credentialRow}>
        <strong>{label}</strong>
        {configured ? (
          <Input
            className={styles.credentialMask}
            aria-label={`${label} PAT（已脱敏）`}
            value="••••••••••••"
            readOnly
          />
        ) : (
          <Input.Password
            aria-label={`${label} PAT`}
            autoComplete="new-password"
            maxLength={500}
            placeholder={`输入 ${label} PAT`}
            value={credentialDrafts[provider]}
            onChange={(event) =>
              updateCredentialDraft(provider, event.target.value)
            }
          />
        )}
        <Tag color={configured ? "green" : "default"}>
          {configured ? "已配置" : "未配置"}
        </Tag>
        {configured ? (
          <Button
            type="link"
            danger
            loading={pending}
            disabled={isCredentialPending && !pending}
            aria-label={`删除 ${label} PAT`}
            onClick={() => confirmDeleteCredential(provider)}
          >
            删除
          </Button>
        ) : (
          <Button
            type="link"
            loading={pending}
            disabled={
              !credentialDrafts[provider].trim() ||
              (isCredentialPending && !pending)
            }
            aria-label={`新增 ${label} PAT`}
            onClick={() => addCredential(provider)}
          >
            新增
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      {messageContext}
      <Form<RepositoryFormValues>
        form={form}
        className={styles.form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ repositories: project.repositories }}
        onValuesChange={() => {
          setRepositoriesDirty(true);
          setConnectionResults({});
        }}
        onFinish={submit}
      >
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIntro}>
              <h2>仓库凭据</h2>
              <p>
                每个项目分别保存一份 GitHub 和 Gitee
                PAT，自动用于对应平台的仓库。
              </p>
            </div>
            <ProjectSettingsSaveButton
              dirty={repositoriesDirty}
              pending={isSaving}
            >
              保存
            </ProjectSettingsSaveButton>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.credentialList}>
              {renderCredentialRow("GITHUB")}
              {renderCredentialRow("GITEE")}
            </div>
            <p className={styles.credentialHelp}>
              已配置的 PAT
              只显示固定掩码且不能直接修改；如需更换，请先删除再新增。建议仅授予目标仓库所需的读取权限。
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>仓库列表</h2>
            <p>
              支持 GitHub 和 Gitee 官方仓库，可检查
              PAT、仓库及指定分支的读取权限。
            </p>
          </div>
          <div className={styles.sectionContent}>
            <Form.List name="repositories">
              {(fields, { add, remove }) =>
                fields.length === 0 ? (
                  <div className={styles.emptyList}>
                    <div>
                      <strong>尚未添加代码仓库</strong>
                      <span>可按项目实际情况配置一个或多个仓库。</span>
                    </div>
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => {
                        add({ gitUrl: "", branch: "main" });
                        setRepositoriesDirty(true);
                      }}
                    >
                      添加仓库
                    </Button>
                  </div>
                ) : (
                  <div className={styles.list}>
                    {fields.map((field, index) => {
                      const connectionResult =
                        connectionResults[String(field.key)];

                      return (
                        <div className={styles.repositoryRow} key={field.key}>
                          <Form.Item name={[field.name, "id"]} hidden>
                            <Input />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, "gitUrl"]}
                            label="Git 地址"
                            rules={[
                              { required: true, message: "请输入 Git 地址" },
                              { validator: validateRepositoryUrl },
                            ]}
                          >
                            <Input placeholder="https://github.com/owner/repo.git" />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, "branch"]}
                            label="分支"
                            rules={[
                              { required: true, message: "请输入分支" },
                              {
                                max: 100,
                                message: "分支不能超过 100 个字符",
                              },
                            ]}
                          >
                            <Input placeholder="main" />
                          </Form.Item>
                          <Form.Item
                            noStyle
                            shouldUpdate={(previous, current) =>
                              previous.repositories?.[field.name]?.gitUrl !==
                              current.repositories?.[field.name]?.gitUrl
                            }
                          >
                            {({ getFieldValue }) => {
                              const gitUrl = getFieldValue([
                                "repositories",
                                field.name,
                                "gitUrl",
                              ]) as string | undefined;
                              let providerLabel = "未识别";

                              if (gitUrl) {
                                try {
                                  providerLabel =
                                    GIT_PROVIDER_LABELS[
                                      parseRepositoryUrl(gitUrl).provider
                                    ];
                                } catch {
                                  // 表单校验负责展示具体错误，此处只展示识别状态。
                                }
                              }

                              return (
                                <div className={styles.repositoryConnection}>
                                  <Tag>{providerLabel}</Tag>
                                  <Button
                                    size="small"
                                    loading={
                                      checkingRepositoryKey === field.key &&
                                      isChecking
                                    }
                                    disabled={
                                      isChecking &&
                                      checkingRepositoryKey !== field.key
                                    }
                                    onClick={() =>
                                      checkConnection(field.key, field.name)
                                    }
                                  >
                                    检查连接
                                  </Button>
                                </div>
                              );
                            }}
                          </Form.Item>
                          <Button
                            className={styles.deleteButton}
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            aria-label={`删除第 ${index + 1} 个仓库`}
                            onClick={() => {
                              remove(field.name);
                              setRepositoriesDirty(true);
                            }}
                          />
                          {connectionResult ? (
                            <div
                              className={
                                connectionResult.ok
                                  ? styles.connectionSuccess
                                  : styles.connectionError
                              }
                              role="status"
                            >
                              {connectionResult.ok ? (
                                <CheckCircleFilled />
                              ) : (
                                <CloseCircleFilled />
                              )}
                              {connectionResult.message}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    <Button
                      className={styles.addButton}
                      icon={<PlusOutlined />}
                      onClick={() => {
                        add({ gitUrl: "", branch: "main" });
                        setRepositoriesDirty(true);
                      }}
                    >
                      添加仓库
                    </Button>
                  </div>
                )
              }
            </Form.List>
          </div>
        </section>
      </Form>
    </>
  );
}
