export type TestCaseGenerationUserStory = {
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  businessRules: string | null;
  nonFunctionalRequirements: string | null;
  acceptanceCriteria: Array<{
    given: string;
    when: string;
    then: string;
  }>;
  feature: {
    name: string;
    summary: string;
    backgroundGoal: string;
  } | null;
  testCases?: Array<{
    code: string;
    groupId: string;
    name: string;
    priority: string;
    preconditions: string | null;
    steps: string;
    enabled: boolean;
  }>;
};

function formatOptionalSection(value: string | null) {
  return value?.trim() || "未提供";
}

export function formatUserStoryForTestCaseGeneration(
  story: TestCaseGenerationUserStory,
) {
  const acceptanceCriteria = story.acceptanceCriteria
    .map(
      (criterion, index) => `${index + 1}. Given：${criterion.given}
   When：${criterion.when}
   Then：${criterion.then}`,
    )
    .join("\n");
  const featureContext = story.feature
    ? `名称：${story.feature.name}
一句话描述：${story.feature.summary}
业务背景与目标：
${story.feature.backgroundGoal}`
    : "未归属 FE";
  const existingTestCases = story.testCases?.length
    ? story.testCases
        .map(
          (testCase) =>
            `- 目标用例编号：${testCase.code}
  名称：${testCase.name}
  分组 ID：${testCase.groupId}
  优先级：${testCase.priority}
  状态：${testCase.enabled ? "启用" : "停用，仅用于去重"}
  前置条件：${testCase.preconditions ?? "无"}
  步骤：${testCase.steps}`,
        )
        .join("\n")
    : "暂无";

  return `来源：已有 US

US 标题：${story.title}

用户故事：
As：${story.asA}
I want：${story.iWant}
so that：${story.soThat}

验收标准（用于整体理解和覆盖，不要求逐条转换为用例）：
${acceptanceCriteria}

业务规则：
${formatOptionalSection(story.businessRules)}

非功能需求：
${formatOptionalSection(story.nonFunctionalRequirements)}

所属 FE：
${featureContext}

已有需求用例（用于判断覆盖和去重；覆盖完整时不要生成重复草稿）：
${existingTestCases}`;
}
