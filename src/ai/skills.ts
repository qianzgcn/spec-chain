import { AiCapability } from "@/generated/prisma/enums";
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

export const builtInSkillResolver: SkillResolver = {
  resolve(capability) {
    if (capability === AiCapability.GENERATE_USER_STORY) {
      return GENERATE_USER_STORY_SKILL;
    }

    throw new Error(`没有为能力 ${capability} 配置 Skill`);
  },
};
