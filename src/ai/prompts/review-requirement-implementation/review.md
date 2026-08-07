请审查以下需求是否被代码正确实现，并评估现有需求用例的整体覆盖。

需求规格：
{{SPECIFICATION}}

代码材料：
{{CODE_EVIDENCE}}

输出要求：

- `implementationStatus`：IMPLEMENTED、PARTIALLY_IMPLEMENTED、NOT_IMPLEMENTED 或 UNCONFIRMED。
- `coverageStatus`：SUFFICIENT、INSUFFICIENT 或 UNCONFIRMED。
- `criteria` 必须逐条返回输入中的验收标准位置，不能遗漏或新增。
- 验收标准状态为 SATISFIED、VIOLATED 或 UNCONFIRMED。
- 问题类型只能是 MISSING_IMPLEMENTATION、INCORRECT_IMPLEMENTATION、CONFIRMED_BUG、POTENTIAL_DEFECT、TEST_COVERAGE_GAP、REQUIREMENT_AMBIGUITY。
- 严重程度只能是 BLOCKER、MAJOR、MINOR。
- 每条证据必须使用上述代码材料中真实存在的仓库、提交、路径和行号；`summary` 只描述业务证据，不复制源码。
- 没有充分证据时使用 UNCONFIRMED，不要为了得出确定结论而猜测。
