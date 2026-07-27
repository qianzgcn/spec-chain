"use client";

import { useState, useTransition } from "react";

import { Form, Input, message } from "antd";
import { useRouter } from "next/navigation";

import { updateProjectBasicSettingsAction } from "@/app/actions/projects";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

import styles from "./project-settings-form.module.css";
import { ProjectSettingsSaveButton } from "./project-settings-save-button";

type BasicSettingsValues = {
  name: string;
  description: string;
  baseUrl: string;
};

export function ProjectBasicSettingsForm({
  project,
}: {
  project: BasicSettingsValues & { id: string };
}) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  useUnsavedChanges(dirty);

  function submit(values: BasicSettingsValues) {
    startTransition(async () => {
      const result = await updateProjectBasicSettingsAction({
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
      <Form<BasicSettingsValues>
        className={styles.form}
        layout="vertical"
        requiredMark={false}
        initialValues={project}
        onValuesChange={() => setDirty(true)}
        onFinish={submit}
      >
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIntro}>
              <h2>基础信息</h2>
              <p>用于识别当前项目，并为自动化运行提供目标地址。</p>
            </div>
            <ProjectSettingsSaveButton dirty={dirty} pending={isPending}>
              保存
            </ProjectSettingsSaveButton>
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
                rows={4}
                maxLength={1000}
                showCount
                placeholder="说明项目范围、目标或主要业务"
              />
            </Form.Item>
          </div>
        </section>
      </Form>
    </>
  );
}
