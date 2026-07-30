import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  extractJsonMiddleware,
  generateText,
  JSONParseError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  TypeValidationError,
  wrapLanguageModel,
} from "ai";
import type { FinishReason, LanguageModelUsage } from "ai";
import { z } from "zod";

const MODEL_CHECK_TIMEOUT_MS = 30_000;
const STRUCTURED_OUTPUT_INSTRUCTION =
  "请仅返回符合下方 JSON Schema 的 JSON，不要添加 Markdown 代码块或其他说明。";

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
  timeoutMs?: number;
};

export function buildStructuredSystemPrompt(system: string, schema: z.ZodType) {
  // OpenAI 兼容网关并不都支持 json_schema，因此把 Schema 明确交给模型，
  // 同时仍在服务端执行 Zod 校验，避免依赖某一家模型的私有能力。
  const jsonSchema = z.toJSONSchema(schema);

  return `${system}

${STRUCTURED_OUTPUT_INSTRUCTION}

JSON Schema：
${JSON.stringify(jsonSchema, null, 2)}`;
}

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
  | "OUTPUT_LIMIT"
  | "JSON_PARSE"
  | "SCHEMA_VALIDATION"
  | "EMPTY_OUTPUT"
  | "REQUEST"
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

export function assertStructuredOutputComplete(finishReason: FinishReason) {
  if (finishReason === "length") {
    throw new ModelProviderError(
      "OUTPUT_LIMIT",
      "模型输出达到长度限制，未能生成完整的结构化结果",
    );
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

function findNoObjectGeneratedError(
  error: unknown,
): NoObjectGeneratedError | undefined {
  if (NoObjectGeneratedError.isInstance(error)) return error;
  if (!error || typeof error !== "object") return undefined;

  if ("cause" in error) {
    const nestedError = findNoObjectGeneratedError(error.cause);
    if (nestedError) return nestedError;
  }

  if ("errors" in error && Array.isArray(error.errors)) {
    for (const nestedError of error.errors) {
      const objectError = findNoObjectGeneratedError(nestedError);
      if (objectError) return objectError;
    }
  }

  return undefined;
}

function findZodError(error: unknown): z.ZodError | undefined {
  if (error instanceof z.ZodError) return error;
  if (!error || typeof error !== "object" || !("cause" in error)) {
    return undefined;
  }
  return findZodError(error.cause);
}

function formatValidationFields(error: unknown) {
  const zodError = findZodError(error);
  if (!zodError) return "";

  const fields = [
    ...new Set(
      zodError.issues.map((issue) =>
        issue.path.length > 0 ? issue.path.join(".") : "根对象",
      ),
    ),
  ].slice(0, 5);

  return fields.length > 0 ? `（字段：${fields.join("、")}）` : "";
}

export function toModelProviderError(error: unknown): ModelProviderError {
  if (error instanceof ModelProviderError) return error;

  const objectError = findNoObjectGeneratedError(error);
  if (objectError?.finishReason === "length") {
    return new ModelProviderError(
      "OUTPUT_LIMIT",
      "模型输出达到长度限制，未能生成完整的结构化结果",
    );
  }

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
  if (statusCode === 400) {
    return new ModelProviderError(
      "REQUEST",
      "模型服务拒绝了请求，请检查模型 ID、接口地址及接口兼容性",
    );
  }
  if (isTimeoutError(error)) {
    return new ModelProviderError("TIMEOUT", "模型服务响应超时");
  }

  if (objectError && JSONParseError.isInstance(objectError.cause)) {
    return new ModelProviderError(
      "JSON_PARSE",
      "模型返回的内容不是完整 JSON，可能被截断或包含额外文本",
    );
  }
  if (objectError && TypeValidationError.isInstance(objectError.cause)) {
    return new ModelProviderError(
      "SCHEMA_VALIDATION",
      `模型返回的 JSON 字段不符合任务要求${formatValidationFields(objectError.cause)}`,
    );
  }
  if (objectError || NoOutputGeneratedError.isInstance(error)) {
    return new ModelProviderError("EMPTY_OUTPUT", "模型未返回可用内容");
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
      timeoutMs,
    }: StructuredGenerationOptions<OUTPUT>) {
      try {
        const result = await generateText({
          model,
          system: buildStructuredSystemPrompt(system, schema),
          prompt,
          output: Output.object({ schema }),
          temperature: 0,
          maxRetries: 2,
          timeout: timeoutMs,
          abortSignal,
        });
        assertStructuredOutputComplete(result.finishReason);

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
    timeoutMs: MODEL_CHECK_TIMEOUT_MS,
  });
}
