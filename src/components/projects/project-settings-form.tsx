"use client";

import { useState, useTransition } from "react";

import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import SaveOutlined from "@ant-design/icons/SaveOutlined";
import { Alert, Button, Form, Input, Select, message } from "antd";
import { useRouter } from "next/navigation";

import { updateProjectSettingsAction } from "@/app/actions/projects";
import { VariableKind } from "@/generated/prisma/enums";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

import styles from "./project-settings-form.module.css";

type RepositoryValue = {
  id?: string;
  gitUrl: string;
  branch: string;
};

type VariableValue = {
  id?: string;
  name: string;
  value: string;
  description: string;
  kind: VariableKind;
};

type SettingsValues = {
  name: string;
  description: string;
  baseUrl: string;
  repositories: RepositoryValue[];
  variables: VariableValue[];
};

export function ProjectSettingsForm({
  project,
}: {
  project: SettingsValues & { id: string };
}) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  useUnsavedChanges(dirty);

  function submit(values: SettingsValues) {
    startTransition(async () => {
      const result = await updateProjectSettingsAction({
        ...values,
        projectId: project.id,
      });
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      setDirty(false);
      messageApi.success(result.message);
      router.refresh();
    });
  }

  return (
    <>
      {messageContext}
      <Form<SettingsValues>
        className={styles.form}
        layout="vertical"
        requiredMark={false}
        initialValues={project}
        onValuesChange={() => setDirty(true)}
        onFinish={submit}
      >
        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>基础信息</h2>
            <p>用于识别当前项目，并为自动化运行提供目标地址。</p>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.twoColumns}>
              <Form.Item
                name="name"
                label="项目名称"
                rules={[{ required: true, message: "请输入项目名称" }]}
              >
                <Input maxLength={100} />
              </Form.Item>
              <Form.Item
                name="baseUrl"
                label="Base URL"
                rules={[{ type: "url", message: "请输入有效的 URL" }]}
                extra="运行自动化用例前必须配置。"
              >
                <Input placeholder="https://example.com" />
              </Form.Item>
            </div>
            <Form.Item
              className={styles.lastFormItem}
              name="description"
              label="项目描述"
            >
              <Input.TextArea
                rows={3}
                maxLength={1000}
                showCount
                placeholder="说明项目范围、目标或主要业务"
              />
            </Form.Item>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>代码仓库</h2>
            <p>仅记录 Git 地址和默认分支，不会连接或拉取仓库。</p>
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
                        setDirty(true);
                      }}
                    >
                      添加仓库
                    </Button>
                  </div>
                ) : (
                  <div className={styles.list}>
                    {fields.map((field, index) => (
                      <div className={styles.repositoryRow} key={field.key}>
                        <Form.Item name={[field.name, "id"]} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "gitUrl"]}
                          label="Git 地址"
                          rules={[
                            { required: true, message: "请输入 Git 地址" },
                          ]}
                        >
                          <Input placeholder="https://... 或 git@..." />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "branch"]}
                          label="分支"
                          rules={[{ required: true, message: "请输入分支" }]}
                        >
                          <Input placeholder="main" />
                        </Form.Item>
                        <Button
                          className={styles.deleteButton}
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={`删除第 ${index + 1} 个仓库`}
                          onClick={() => {
                            remove(field.name);
                            setDirty(true);
                          }}
                        />
                      </div>
                    ))}
                    <Button
                      className={styles.addButton}
                      icon={<PlusOutlined />}
                      onClick={() => {
                        add({ gitUrl: "", branch: "main" });
                        setDirty(true);
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

        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>项目变量</h2>
            <p>运行时注入环境变量；敏感值加密保存且不再回显。</p>
          </div>
          <div className={styles.sectionContent}>
            <Alert
              className={styles.variableNotice}
              type="info"
              showIcon
              title="敏感变量留空表示保留原值；需要修改时输入新值后保存。"
            />

            <Form.List name="variables">
              {(fields, { add, remove }) =>
                fields.length === 0 ? (
                  <div className={styles.emptyList}>
                    <div>
                      <strong>尚未配置项目变量</strong>
                      <span>按需添加普通变量或加密保存的敏感变量。</span>
                    </div>
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => {
                        add({
                          name: "",
                          value: "",
                          description: "",
                          kind: VariableKind.PLAIN,
                        });
                        setDirty(true);
                      }}
                    >
                      添加变量
                    </Button>
                  </div>
                ) : (
                  <div className={styles.list}>
                    {fields.map((field, index) => (
                      <div key={field.key} className={styles.variableRow}>
                        <Form.Item name={[field.name, "id"]} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "name"]}
                          label="变量名"
                          rules={[
                            { required: true, message: "请输入变量名" },
                            {
                              pattern: /^[A-Za-z_][A-Za-z0-9_]*$/,
                              message:
                                "只能包含字母、数字和下划线，不能以数字开头",
                            },
                          ]}
                        >
                          <Input placeholder="API_TOKEN" />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "kind"]}
                          label="类型"
                          rules={[{ required: true }]}
                        >
                          <Select
                            options={[
                              {
                                label: "普通变量",
                                value: VariableKind.PLAIN,
                              },
                              {
                                label: "敏感变量",
                                value: VariableKind.SECRET,
                              },
                            ]}
                          />
                        </Form.Item>
                        <Form.Item
                          noStyle
                          shouldUpdate={(previous, current) =>
                            previous.variables?.[field.name]?.kind !==
                            current.variables?.[field.name]?.kind
                          }
                        >
                          {({ getFieldValue }) => {
                            const kind = getFieldValue([
                              "variables",
                              field.name,
                              "kind",
                            ]) as VariableKind | undefined;
                            const existingId = getFieldValue([
                              "variables",
                              field.name,
                              "id",
                            ]) as string | undefined;
                            return (
                              <Form.Item
                                name={[field.name, "value"]}
                                label="值"
                                rules={[
                                  {
                                    required: !existingId,
                                    message: "请输入变量值",
                                  },
                                ]}
                              >
                                {kind === VariableKind.SECRET ? (
                                  <Input.Password
                                    placeholder={
                                      existingId
                                        ? "••••••••（留空保留原值）"
                                        : "请输入敏感值"
                                    }
                                    autoComplete="new-password"
                                  />
                                ) : (
                                  <Input placeholder="请输入变量值" />
                                )}
                              </Form.Item>
                            );
                          }}
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "description"]}
                          label="描述"
                        >
                          <Input placeholder="说明变量用途" maxLength={500} />
                        </Form.Item>
                        <Button
                          className={styles.deleteButton}
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={`删除第 ${index + 1} 个变量`}
                          onClick={() => {
                            remove(field.name);
                            setDirty(true);
                          }}
                        />
                      </div>
                    ))}
                    <Button
                      className={styles.addButton}
                      icon={<PlusOutlined />}
                      onClick={() => {
                        add({
                          name: "",
                          value: "",
                          description: "",
                          kind: VariableKind.PLAIN,
                        });
                        setDirty(true);
                      }}
                    >
                      添加变量
                    </Button>
                  </div>
                )
              }
            </Form.List>
          </div>
        </section>

        <div className={styles.saveBar}>
          <div className={styles.saveState}>
            <span
              className={dirty ? styles.unsavedDot : styles.savedDot}
              aria-hidden
            />
            {dirty ? "有尚未保存的修改" : "当前设置已保存"}
          </div>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={isPending}
            disabled={!dirty}
          >
            保存设置
          </Button>
        </div>
      </Form>
    </>
  );
}
