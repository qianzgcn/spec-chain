# 当前步骤：比较正式内容与真实代码

请根据代码证据返回结构化一致性结论，不输出分析过程。

返回对象必须使用以下结构：

- `userStory`：US 检查时为 `{ outcome, reason, proposed }`，平台用例检查时为 `null`。
- `testCases`：数组，每项为 `{ outcome, targetTestCaseId, reason, proposed }`。
- `proposed` 只在 `UPDATE` 或 `CREATE` 时提供；其他结论必须为 `null`。
- US 的 `outcome` 只能是 `UNCHANGED/UPDATE/NEEDS_ATTENTION`。
- 用例的 `outcome` 只能是 `UNCHANGED/CREATE/UPDATE/RETIRE/NEEDS_ATTENTION`。
- US 建议内容包含 `asA/iWant/soThat/businessRules/nonFunctionalRequirements/acceptanceCriteria`。
- 用例建议内容包含 `name/priority/groupId/preconditions/steps`。

## US 判断

- 有 US 时必须返回一项 `userStory` 结论；平台用例检查时返回 `null`。
- `UNCHANGED`：代码外部行为与正式 US 一致，`proposed=null`。
- `UPDATE`：存在明确业务变化，返回修改后的正文；标题不可修改。
- `NEEDS_ATTENTION`：证据不足、无法安全映射或不可变标题已经不适用，`proposed=null`。
- 不能把代码的内部实现细节写入 US 或验收标准。
- `reason` 必须说明代码中观察到的具体业务证据；不能只写“与代码不一致”。

## 测试用例判断

- 每个给出的已有用例 ID 必须且只能返回一次。
- `UNCHANGED`：用例仍准确覆盖代码行为。
- `UPDATE`：保留目标 ID，返回更新后的名称、优先级、分组、前置条件和步骤。
- `RETIRE`：代码明确证明该业务场景已经移除或替代。
- `NEEDS_ATTENTION`：无法可靠判断，不能用停用代替不确定。
- 需求用例可以返回 `CREATE` 补齐明确缺失的业务场景；`targetTestCaseId` 必须为 null。
- 平台用例不允许 `CREATE`。
- 新增和更新用例只能使用给出的分组 ID及变量结构，不得虚构。
- `RETIRE` 的 `reason` 必须指出已经删除或替代该场景的明确代码证据。

## 当前正式内容

{{SPECIFICATION}}

## 当前项目分组

{{GROUPS}}

## 当前项目变量（仅结构，不含值）

{{VARIABLES}}

## 真实代码证据

{{CODE_EVIDENCE}}
