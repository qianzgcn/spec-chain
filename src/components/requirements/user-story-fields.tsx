"use client";

import { Form, Input, Select } from "antd";

import { PageSection } from "@/components/layout/page-section";
import { MarkdownField } from "@/components/markdown/markdown-field";
import { AcceptanceCriteriaEditor } from "@/components/requirements/acceptance-criteria-editor";
import { RequirementStatus } from "@/generated/prisma/enums";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";

export type CriterionValue = {
  id?: string;
  given: string;
  when: string;
  then: string;
};

export type UserStoryFormValues = {
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  status: RequirementStatus;
  acceptanceCriteria: CriterionValue[];
  businessRules: string;
  nonFunctionalRequirements: string;
};

export function UserStoryFields({ showStatus }: { showStatus: boolean }) {
  return (
    <>
      <PageSection title="基本信息">
        <div
          className={
            showStatus
              ? "grid grid-cols-[minmax(0,1fr)_180px] gap-5"
              : undefined
          }
        >
          <Form.Item
            name="title"
            label="US 标题"
            rules={[{ required: true, message: "请输入 US 标题" }]}
          >
            <Input
              maxLength={150}
              showCount
              placeholder="用一句话说明要交付的用户价值"
            />
          </Form.Item>
          {showStatus ? (
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select
                options={Object.values(RequirementStatus).map((status) => ({
                  value: status,
                  label: REQUIREMENT_STATUS_META[status].label,
                }))}
              />
            </Form.Item>
          ) : (
            <Form.Item name="status" hidden>
              <Input />
            </Form.Item>
          )}
        </div>
      </PageSection>

      <PageSection
        title="用户故事"
        description="明确使用者、期望能力以及要实现的业务价值。"
      >
        <div className="user-story-triplet">
          <Form.Item
            name="asA"
            label="As"
            rules={[{ required: true, message: "As 不能为空" }]}
            extra="谁需要这个能力？"
          >
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 5 }}
              placeholder="例如：作为一名客服主管"
            />
          </Form.Item>
          <Form.Item
            name="iWant"
            label="I want"
            rules={[{ required: true, message: "I want 不能为空" }]}
            extra="希望完成什么目标？"
          >
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 5 }}
              placeholder="例如：我希望批量分配待处理工单"
            />
          </Form.Item>
          <Form.Item
            name="soThat"
            label="so that"
            rules={[{ required: true, message: "so that 不能为空" }]}
            extra="最终带来什么业务价值？"
          >
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 5 }}
              placeholder="例如：从而减少重复操作并缩短响应时间"
            />
          </Form.Item>
        </div>
      </PageSection>

      <AcceptanceCriteriaEditor />

      <PageSection
        title="补充约束"
        description="仅填写会影响实现或验收的规则；两项均支持 Markdown。"
      >
        <div className="user-story-constraints">
          <Form.Item
            name="businessRules"
            label="业务规则（可选）"
            extra="可记录权限矩阵、状态转换、页面交互、边界和限制。"
          >
            <MarkdownField rows={8} placeholder="没有业务规则时可以留空" />
          </Form.Item>
          <Form.Item
            name="nonFunctionalRequirements"
            label="非功能需求（可选）"
            extra="可记录性能、安全、可用性、兼容性和可观测性要求。"
          >
            <MarkdownField rows={8} placeholder="没有非功能需求时可以留空" />
          </Form.Item>
        </div>
      </PageSection>
    </>
  );
}
