"use client";

import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import { Button, Form, Input } from "antd";

import { PageSection } from "@/components/layout/page-section";

export function AcceptanceCriteriaEditor() {
  return (
    <PageSection
      title="验收标准"
      description="使用 Given / When / Then 描述可以直接验证的业务结果。"
    >
      <Form.List
        name="acceptanceCriteria"
        rules={[
          {
            validator: async (_, criteria) => {
              if (!criteria?.length) {
                throw new Error("至少需要一条验收标准");
              }
            },
          },
        ]}
      >
        {(fields, { add, remove }, { errors }) => (
          <div className="acceptance-editor">
            <div className="acceptance-editor__head" aria-hidden>
              <span>序号</span>
              <span>Given</span>
              <span>When</span>
              <span>Then</span>
              <span>操作</span>
            </div>

            <div className="acceptance-editor__rows">
              {fields.map((field, index) => (
                <div className="acceptance-editor__row" key={field.key}>
                  <Form.Item name={[field.name, "id"]} hidden>
                    <Input />
                  </Form.Item>
                  <span className="acceptance-editor__index">{index + 1}</span>
                  <Form.Item
                    name={[field.name, "given"]}
                    rules={[{ required: true, message: "Given 不能为空" }]}
                  >
                    <Input.TextArea
                      aria-label={`Given ${index + 1}`}
                      autoSize={{ minRows: 2, maxRows: 5 }}
                      placeholder="前置条件或初始上下文"
                    />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, "when"]}
                    rules={[{ required: true, message: "When 不能为空" }]}
                  >
                    <Input.TextArea
                      aria-label={`When ${index + 1}`}
                      autoSize={{ minRows: 2, maxRows: 5 }}
                      placeholder="用户操作或触发事件"
                    />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, "then"]}
                    rules={[{ required: true, message: "Then 不能为空" }]}
                  >
                    <Input.TextArea
                      aria-label={`Then ${index + 1}`}
                      autoSize={{ minRows: 2, maxRows: 5 }}
                      placeholder="可观察、可验证的结果"
                    />
                  </Form.Item>
                  <div className="acceptance-editor__actions">
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除验收标准 ${index + 1}`}
                      disabled={fields.length === 1}
                      onClick={() => remove(field.name)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Form.ErrorList errors={errors} />
            <Button
              icon={<PlusOutlined />}
              onClick={() => add({ given: "", when: "", then: "" })}
            >
              添加验收标准
            </Button>
          </div>
        )}
      </Form.List>
    </PageSection>
  );
}
