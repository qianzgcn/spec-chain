"use client";

import { useState, useTransition } from "react";

import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import { Alert, Button, Form, Input, Select, message } from "antd";

import { updateProjectVariablesAction } from "@/app/actions/projects";
import { VariableKind } from "@/generated/prisma/enums";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

import styles from "./project-settings-form.module.css";
import { ProjectSettingsSaveButton } from "./project-settings-save-button";

type VariableValue = {
  id?: string;
  name: string;
  value: string;
  description: string;
  kind: VariableKind;
};

type VariablesFormValues = {
  variables: VariableValue[];
};

export function ProjectVariablesForm({
  project,
}: {
  project: { id: string; variables: VariableValue[] };
}) {
  const [form] = Form.useForm<VariablesFormValues>();
  const [messageApi, messageContext] = message.useMessage();
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  useUnsavedChanges(dirty);

  function submit(values: VariablesFormValues) {
    startTransition(async () => {
      const result = await updateProjectVariablesAction({
        ...values,
        projectId: project.id,
      });

      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }

      if (result.data) {
        form.setFieldsValue({ variables: result.data.variables });
      }
      setDirty(false);
      messageApi.success(result.message);
    });
  }

  return (
    <>
      {messageContext}
      <Form<VariablesFormValues>
        form={form}
        className={styles.form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ variables: project.variables }}
        onValuesChange={() => setDirty(true)}
        onFinish={submit}
      >
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIntro}>
              <h2>变量列表</h2>
              <p>运行时注入环境变量；敏感值加密保存且不再回显。</p>
            </div>
            <ProjectSettingsSaveButton dirty={dirty} pending={isPending}>
              保存
            </ProjectSettingsSaveButton>
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
      </Form>
    </>
  );
}
