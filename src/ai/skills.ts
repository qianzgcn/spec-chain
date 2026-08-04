import { AiCapability } from "@/generated/prisma/enums";
import { generateTestCasesSystemPrompt } from "@/ai/prompts/generate-test-cases";
import { generateUserStorySystemPrompt } from "@/ai/prompts/generate-user-story";
import { generateAutomationScriptSystemPrompt } from "@/automation/prompts";
import { checkConsistencySystemPrompt } from "@/ai/prompts/check-consistency";

export type AiSkill = {
  capability: AiCapability;
  name: string;
  purpose: string;
  version: string;
  instructions: string;
};

export interface SkillResolver {
  resolve(capability: AiCapability): AiSkill;
}

const GENERATE_USER_STORY_SKILL: AiSkill = {
  capability: AiCapability.GENERATE_USER_STORY,
  name: "生成结构化用户故事",
  purpose: "根据需求、FE 上下文和现有代码生成可评审的结构化 US。",
  // 提示词行为发生实质变化时同步提升版本，保证执行记录可追溯。
  version: "1.2.0",
  instructions: generateUserStorySystemPrompt,
};

const GENERATE_TEST_CASES_SKILL: AiSkill = {
  capability: AiCapability.GENERATE_TEST_CASES,
  name: "生成自然语言测试用例",
  purpose: "根据需求和现有代码生成可独立执行、需要人工评审的测试用例草稿。",
  version: "1.0.0",
  instructions: generateTestCasesSystemPrompt,
};

const GENERATE_AUTOMATION_SCRIPT_SKILL: AiSkill = {
  capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
  name: "生成 Playwright 自动化脚本",
  purpose:
    "根据单条自然语言测试用例、相关源码和真实页面探测结果生成可直接运行的 Playwright 脚本。",
  version: "1.1.0",
  instructions: generateAutomationScriptSystemPrompt,
};

const CHECK_CONSISTENCY_SKILL: AiSkill = {
  capability: AiCapability.CHECK_CONSISTENCY,
  name: "检查代码与需求用例一致性",
  purpose:
    "以指定代码提交为依据，检查测试/完成态 US 及启用测试用例的外部业务行为是否一致。",
  version: "1.0.0",
  instructions: checkConsistencySystemPrompt,
};

export const builtInSkillResolver: SkillResolver = {
  resolve(capability) {
    switch (capability) {
      case AiCapability.GENERATE_USER_STORY:
        return GENERATE_USER_STORY_SKILL;
      case AiCapability.GENERATE_TEST_CASES:
        return GENERATE_TEST_CASES_SKILL;
      case AiCapability.GENERATE_AUTOMATION_SCRIPT:
        return GENERATE_AUTOMATION_SCRIPT_SKILL;
      case AiCapability.CHECK_CONSISTENCY:
        return CHECK_CONSISTENCY_SKILL;
    }
  },
};
