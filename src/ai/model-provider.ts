import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  extractJsonMiddleware,
  generateText,
  NoOutputGeneratedError,
  Output,
  wrapLanguageModel,
} from "ai";
import type { LanguageModelUsage } from "ai";
import { z } from "zod";

const MODEL_CALL_TIMEOUT_MS = 90_000;

export type ModelProfileConfig = {
  name: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
};

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type StructuredGenerationOptions<OUTPUT> = {
  schema: z.ZodType<OUTPUT>;
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
};

export interface ModelProvider {
  generateStructured<OUTPUT>(
    options: StructuredGenerationOptions<OUTPUT>,
  ): Promise<{ output: OUTPUT; usage: ModelUsage }>;
}

export type ModelProviderErrorCode =
  | "AUTH"
  | "PERMISSION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "STRUCTURED_OUTPUT"
  | "SERVICE";

export class ModelProviderError extends Error {
  constructor(
    public readonly code: ModelProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ModelProviderError";
  }
}

function normalizeUsage(usage: LanguageModelUsage): ModelUsage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens:
      usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
  };
}

function findStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  if (
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }

  if ("cause" in error) {
    return findStatusCode((error as { cause?: unknown }).cause);
  }

  if ("errors" in error && Array.isArray(error.errors)) {
    for (const nestedError of error.errors) {
      const statusCode = findStatusCode(nestedError);
      if (statusCode !== undefined) return statusCode;
    }
  }

  return undefined;
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "AI_APICallError"
  ) {
    const message = "message" in error ? String(error.message) : "";
    if (
      name !== "AI_APICallError" ||
      /timeout|timed out|aborted/i.test(message)
    ) {
      return true;
    }
  }
  return "cause" in error && isTimeoutError(error.cause);
}

export function toModelProviderError(error: unknown): ModelProviderError {
  if (error instanceof ModelProviderError) return error;

  const statusCode = findStatusCode(error);
  if (statusCode === 401) {
    return new ModelProviderError("AUTH", "模型 API Key 无效或已过期");
  }
  if (statusCode === 403) {
    return new ModelProviderError("PERMISSION", "模型 API Key 权限不足");
  }
  if (statusCode === 429) {
    return new ModelProviderError(
      "RATE_LIMIT",
      "模型服务请求过于频繁，请稍后重试",
    );
  }
  if (isTimeoutError(error)) {
    return new ModelProviderError("TIMEOUT", "模型服务响应超时");
  }
  if (NoOutputGeneratedError.isInstance(error) || statusCode === 400) {
    return new ModelProviderError(
      "STRUCTURED_OUTPUT",
      "当前模型无法生成所需的结构化结果，请检查模型 ID 和兼容性",
    );
  }

  return new ModelProviderError("SERVICE", "模型服务暂时不可用，请稍后重试");
}

export function createModelProvider(
  profile: ModelProfileConfig,
): ModelProvider {
  const compatibleProvider = createOpenAICompatible({
    name: "specchain-openai-compatible",
    baseURL: profile.baseUrl,
    apiKey: profile.apiKey,
    includeUsage: true,
  });
  const model = wrapLanguageModel({
    model: compatibleProvider.chatModel(profile.modelId),
    middleware: extractJsonMiddleware(),
  });

  return {
    async generateStructured<OUTPUT>({
      schema,
      system,
      prompt,
      abortSignal,
      maxOutputTokens = 4_096,
    }: StructuredGenerationOptions<OUTPUT>) {
      try {
        const result = await generateText({
          model,
          system,
          prompt,
          output: Output.object({ schema }),
          temperature: 0.1,
          maxOutputTokens,
          maxRetries: 2,
          timeout: MODEL_CALL_TIMEOUT_MS,
          abortSignal,
        });

        return {
          output: result.output,
          usage: normalizeUsage(result.usage),
        };
      } catch (error) {
        throw toModelProviderError(error);
      }
    },
  };
}

const modelCheckSchema = z.object({
  ok: z.literal(true),
  message: z.string().min(1),
});

export async function checkModelProvider(profile: ModelProfileConfig) {
  const provider = createModelProvider(profile);
  await provider.generateStructured({
    schema: modelCheckSchema,
    system: "你正在执行模型配置检查。只需按指定结构返回结果。",
    prompt: '请返回 ok=true，message="连接正常"。',
    maxOutputTokens: 128,
  });
}
