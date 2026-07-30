import {
  JSONParseError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  TypeValidationError,
} from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  assertStructuredOutputComplete,
  buildStructuredSystemPrompt,
  createModelProvider,
  toModelProviderError,
} from "@/ai/model-provider";
import { aiModelProfileInputSchema } from "@/lib/ai/model-profile";

describe("AI 模型配置", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("结构化请求向兼容模型提供完整的 JSON Schema", () => {
    const prompt = buildStructuredSystemPrompt(
      "生成用户故事",
      z.object({
        title: z.string(),
        acceptanceCriteria: z.array(
          z.object({
            given: z.string(),
            when: z.string(),
            then: z.string(),
          }),
        ),
      }),
    );

    expect(prompt).toContain("JSON");
    expect(prompt).toContain("生成用户故事");
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"acceptanceCriteria"');
    expect(prompt).toContain('"given"');
  });

  it("将模型输出截断与结构化能力不足明确区分", () => {
    expect(() => assertStructuredOutputComplete("stop")).not.toThrow();

    try {
      assertStructuredOutputComplete("length");
      expect.unreachable("应当识别输出长度限制");
    } catch (error) {
      expect(error).toMatchObject({
        code: "OUTPUT_LIMIT",
        message: "模型输出达到长度限制，未能生成完整的结构化结果",
      });
    }
  });

  it("使用 Schema 校验结构化结果且不设置输出 Token 上限", async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            id: "response-id",
            model: "test-model",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: '{"ok":true,"message":"连接正常"}',
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const provider = createModelProvider({
      name: "测试模型",
      baseUrl: "https://api.example.com/v1",
      modelId: "test-model",
      apiKey: "secret",
    });
    const result = await provider.generateStructured({
      schema: z.object({
        ok: z.literal(true),
        message: z.string(),
      }),
      system: "执行结构化输出测试。",
      prompt: "返回连接结果。",
    });

    expect(result.output).toEqual({ ok: true, message: "连接正常" });
    expect(requestBody).toMatchObject({
      temperature: 0,
      response_format: { type: "json_object" },
    });
    expect(requestBody).not.toHaveProperty("max_tokens");
  });

  it("规范化合法的 OpenAI 兼容 Base URL", () => {
    const result = aiModelProfileInputSchema.parse({
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1/",
      modelId: "deepseek-chat",
      apiKey: "secret",
    });

    expect(result.baseUrl).toBe("https://api.deepseek.com/v1");
  });

  it.each([
    "ftp://api.example.com/v1",
    "https://user:password@api.example.com/v1",
    "https://api.example.com/v1?token=secret",
    "https://api.example.com/v1#models",
    "not-a-url",
  ])("拒绝不安全的 Base URL：%s", (baseUrl) => {
    const result = aiModelProfileInputSchema.safeParse({
      name: "测试模型",
      baseUrl,
      modelId: "model",
      apiKey: "secret",
    });

    expect(result.success).toBe(false);
  });

  it.each([
    [401, "模型 API Key 无效或已过期"],
    [403, "模型 API Key 权限不足"],
    [429, "模型服务请求过于频繁"],
  ])("将模型状态码 %i 转换为安全中文错误", (statusCode, message) => {
    const error = toModelProviderError({ statusCode, message: "raw error" });

    expect(error.message).toContain(message);
    expect(error.message).not.toContain("raw error");
  });

  it("区分模型超时", () => {
    const error = toModelProviderError(
      new DOMException("request timed out", "TimeoutError"),
    );

    expect(error).toMatchObject({
      code: "TIMEOUT",
      message: "模型服务响应超时",
    });
  });

  it("区分 JSON 解析失败且不暴露模型原文", () => {
    const objectError = new NoObjectGeneratedError({
      message: "response is not valid JSON",
      cause: new JSONParseError({
        text: "must-not-leak",
        cause: new SyntaxError("raw parse details"),
      }),
      text: "must-not-leak",
      response: {
        id: "response-id",
        modelId: "model-id",
        timestamp: new Date(),
      },
      usage: {
        inputTokens: 10,
        inputTokenDetails: {
          noCacheTokens: 10,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 5,
        outputTokenDetails: {
          textTokens: 5,
          reasoningTokens: 0,
        },
        totalTokens: 15,
      },
      finishReason: "stop",
    });
    const error = toModelProviderError(objectError);

    expect(error).toMatchObject({
      code: "JSON_PARSE",
      message: "模型返回的内容不是完整 JSON，可能被截断或包含额外文本",
    });
    expect(error.message).not.toContain("must-not-leak");
    expect(error.message).not.toContain("raw parse details");
  });

  it("区分 Schema 校验失败且只记录安全字段路径", () => {
    const schemaResult = z
      .object({
        title: z.string(),
        acceptanceCriteria: z.array(z.string()).min(1),
      })
      .safeParse({ title: "must-not-leak" });
    expect(schemaResult.success).toBe(false);
    if (schemaResult.success) return;

    const objectError = new NoObjectGeneratedError({
      message: "response did not match schema",
      cause: new TypeValidationError({
        value: { title: "must-not-leak" },
        cause: schemaResult.error,
      }),
      text: '{"title":"must-not-leak"}',
      response: {
        id: "response-id",
        modelId: "model-id",
        timestamp: new Date(),
      },
      usage: {
        inputTokens: 10,
        inputTokenDetails: {
          noCacheTokens: 10,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 5,
        outputTokenDetails: {
          textTokens: 5,
          reasoningTokens: 0,
        },
        totalTokens: 15,
      },
      finishReason: "stop",
    });
    const error = toModelProviderError(objectError);

    expect(error).toMatchObject({ code: "SCHEMA_VALIDATION" });
    expect(error.message).toContain("acceptanceCriteria");
    expect(error.message).not.toContain("must-not-leak");
  });

  it("区分模型空输出", () => {
    expect(toModelProviderError(new NoOutputGeneratedError())).toMatchObject({
      code: "EMPTY_OUTPUT",
      message: "模型未返回可用内容",
    });
  });

  it("将 HTTP 400 归类为模型请求错误", () => {
    const error = toModelProviderError({
      statusCode: 400,
      message: "raw gateway response",
    });

    expect(error).toMatchObject({
      code: "REQUEST",
      message: "模型服务拒绝了请求，请检查模型 ID、接口地址及接口兼容性",
    });
    expect(error.message).not.toContain("raw gateway response");
  });

  it("嵌套的结构化输出长度截断仍归类为输出超限", () => {
    const objectError = new NoObjectGeneratedError({
      response: {
        id: "response-id",
        modelId: "model-id",
        timestamp: new Date(),
      },
      usage: {
        inputTokens: 10,
        inputTokenDetails: {
          noCacheTokens: 10,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 4_096,
        outputTokenDetails: {
          textTokens: 4_096,
          reasoningTokens: 0,
        },
        totalTokens: 4_106,
      },
      finishReason: "length",
    });
    const error = toModelProviderError(
      new NoOutputGeneratedError({ cause: objectError }),
    );

    expect(error.code).toBe("OUTPUT_LIMIT");
  });
});
