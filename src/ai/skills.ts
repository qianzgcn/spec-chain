import { AiCapability } from "@/generated/prisma/enums";
import { generateTestCasesSystemPrompt } from "@/ai/prompts/generate-test-cases";
import { generateUserStorySystemPrompt } from "@/ai/prompts/generate-user-story";

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
  version: "1.1.0",
  instructions: generateUserStorySystemPrompt,
};

const GENERATE_TEST_CASES_SKILL: AiSkill = {
  capability: AiCapability.GENERATE_TEST_CASES,
  name: "生成自然语言测试用例",
  purpose: "根据需求和现有代码生成可独立执行、需要人工评审的测试用例草稿。",
  version: "1.0.0",
  instructions: generateTestCasesSystemPrompt,
};

export const builtInSkillResolver: SkillResolver = {
  resolve(capability) {
    switch (capability) {
      case AiCapability.GENERATE_USER_STORY:
        return GENERATE_USER_STORY_SKILL;
      case AiCapability.GENERATE_TEST_CASES:
        return GENERATE_TEST_CASES_SKILL;
    }
  },
};
